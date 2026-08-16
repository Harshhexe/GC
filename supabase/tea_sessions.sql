-- 🍵 Tea Mode: a temporary, recorded session inside a group chat.
--
-- The session is a first-class row rather than a boolean on groups, because
-- it has to survive its own lifetime: historical sessions keep their starter,
-- their boundaries, and their report long after Tea is over.
--
-- Applied as migrations `tea_sessions` and `tea_session_rpcs`.

create table if not exists public.tea_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  started_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_by uuid references auth.users(id) on delete set null,
  ended_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'generating', 'completed', 'failed')),
  report jsonb,
  created_at timestamptz not null default now()
);

-- One live Tea per group, enforced by the database rather than by checking
-- first and hoping: two members tapping "Start Tea" at the same instant would
-- both pass an application-level check, and the loser of this index gets a
-- clean unique violation instead of a second session.
-- `generating` is included so a new Tea can't start while the last one is
-- still being written up.
create unique index if not exists tea_sessions_one_live_per_group
  on public.tea_sessions (group_id)
  where status in ('active', 'generating');

create index if not exists tea_sessions_group_ended_idx
  on public.tea_sessions (group_id, ended_at desc);

-- Which Tea a message belongs to. Stamped by the trigger below, never by the
-- client — so every existing send path (text, media, replies, voice) is
-- covered without touching any of them.
alter table public.messages
  add column if not exists tea_session_id uuid references public.tea_sessions(id) on delete set null;

create index if not exists messages_tea_session_idx
  on public.messages (tea_session_id)
  where tea_session_id is not null;

/**
 * Stamp each new message with the group's live Tea session, if there is one.
 *
 * Doing this in the database is what makes session membership trustworthy:
 * the boundary is the server's own clock and the client cannot claim a
 * message belongs to a session it doesn't, or miss one that it does. Only
 * `active` counts — once Tea is ending, the boundary is closed.
 */
create or replace function public.stamp_tea_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select ts.id into new.tea_session_id
  from public.tea_sessions ts
  where ts.group_id = new.group_id
    and ts.status = 'active'
  limit 1;
  return new;
end;
$$;

drop trigger if exists messages_stamp_tea_session on public.messages;
create trigger messages_stamp_tea_session
  before insert on public.messages
  for each row execute function public.stamp_tea_session();

alter table public.tea_sessions enable row level security;

-- Members of the group can read its Tea sessions. All writes go through the
-- RPCs below, which is where the permission rules live.
drop policy if exists tea_sessions_select_members on public.tea_sessions;
create policy tea_sessions_select_members
  on public.tea_sessions for select to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = tea_sessions.group_id and gm.user_id = auth.uid()
    )
  );

alter publication supabase_realtime add table public.tea_sessions;

/**
 * Start a Tea session. Any member may start one.
 *
 * Returns the live session either way: if one is already running, the caller
 * gets that instead of an error, so two people tapping at once both end up
 * looking at the same Tea rather than one seeing a failure.
 */
create or replace function public.start_tea(p_group_id uuid)
returns public.tea_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.tea_sessions;
begin
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;

  insert into public.tea_sessions (group_id, started_by)
  values (p_group_id, auth.uid())
  -- Loses the race against the partial unique index: fall through and return
  -- whatever session is already live.
  on conflict do nothing
  returning * into v_session;

  if v_session.id is null then
    select * into v_session from public.tea_sessions
    where group_id = p_group_id and status in ('active', 'generating')
    limit 1;
  end if;

  return v_session;
end;
$$;

/**
 * End a Tea session and freeze its boundary.
 *
 * `ended_at = now()` is the server's clock, so which messages belong to the
 * session is decided here rather than by whichever client happened to send
 * the request. Permission is re-checked in the database: hiding the button in
 * the UI is a courtesy, this is the actual rule.
 */
create or replace function public.end_tea(p_session_id uuid)
returns public.tea_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.tea_sessions;
  v_role text;
begin
  select * into v_session from public.tea_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'tea session not found' using errcode = 'P0002';
  end if;

  select role into v_role from public.group_members
  where group_id = v_session.group_id and user_id = auth.uid();

  if v_role is null then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;

  -- The starter, or anyone who moderates the group.
  if v_session.started_by is distinct from auth.uid()
     and v_role not in ('admin', 'owner') then
    raise exception 'only the starter or an admin can end this tea'
      using errcode = '42501';
  end if;

  if v_session.status <> 'active' then
    -- Already ending or ended: return it unchanged rather than reopening a
    -- closed boundary or double-triggering a report.
    return v_session;
  end if;

  update public.tea_sessions
  set status = 'generating', ended_by = auth.uid(), ended_at = now()
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

revoke all on function public.start_tea(uuid) from public;
revoke all on function public.end_tea(uuid) from public;
grant execute on function public.start_tea(uuid) to authenticated;
grant execute on function public.end_tea(uuid) to authenticated;
