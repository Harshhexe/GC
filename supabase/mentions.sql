-- GC — @Mentions + notifications.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- ── columns ─────────────────────────────────────────────────────────────
alter table public.messages
  add column if not exists mentions jsonb not null default '[]'::jsonb,
  add column if not exists mention_everyone boolean not null default false;

alter table public.group_members
  add column if not exists muted boolean not null default false;

alter table public.groups
  add column if not exists last_everyone_mention_at timestamptz;

-- ── notifications ───────────────────────────────────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  group_id uuid not null references public.groups (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  kind text not null check (kind in ('mention', 'mention_everyone')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

-- No insert policy for `authenticated` — rows only ever come from the
-- SECURITY DEFINER trigger below, which bypasses RLS entirely.
create policy "users can read their own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "users can mark their own notifications read"
  on public.notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_unread_idx
  on public.notifications (user_id)
  where read_at is null;

create index if not exists notifications_actor_id_idx on public.notifications (actor_id);
create index if not exists notifications_group_id_idx on public.notifications (group_id);
create index if not exists notifications_message_id_idx on public.notifications (message_id);

alter publication supabase_realtime add table public.notifications;

-- ── validate + normalise mentions before the row is stored ───────────────
-- Runs BEFORE so it can rewrite NEW.mentions / NEW.mention_everyone before
-- they're persisted: dedupes mentions by userId, and strips @everyone if the
-- sender isn't an owner/admin or the group is inside its cooldown window.
create or replace function public.prepare_message_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  deduped jsonb;
begin
  select coalesce(jsonb_agg(m.mention order by m.ord), '[]'::jsonb)
  into deduped
  from (
    select distinct on (mention ->> 'userId') mention, ord
    from jsonb_array_elements(coalesce(new.mentions, '[]'::jsonb)) with ordinality as t(mention, ord)
    where mention ->> 'userId' is not null
    order by mention ->> 'userId', ord
  ) m;
  new.mentions := deduped;

  -- If text contains @everyone, guarantee mention_everyone is true for all members
  if new.text is not null and new.text ~* '@everyone\b' then
    new.mention_everyone := true;
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_message_mentions on public.messages;
create trigger prepare_message_mentions
  before insert or update on public.messages
  for each row
  execute function public.prepare_message_mentions();

-- ── turn mentions into notification rows ──────────────────────────────────
-- AFTER, so it sees the final (already-validated) NEW plus OLD for diffing on
-- edits — only newly-added mentions get a notification; unchanged ones don't.
create or replace function public.notify_message_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  old_ids uuid[];
  everyone_is_new boolean;
begin
  if new.is_deleted then
    return new;
  end if;

  old_ids := case
    when tg_op = 'UPDATE' then array(select (x ->> 'userId')::uuid from jsonb_array_elements(old.mentions) x)
    else array[]::uuid[]
  end;

  for m in select * from jsonb_to_recordset(new.mentions) as x("userId" uuid, username text)
  loop
    continue when m."userId" is null or m."userId" = new.author_id;
    continue when tg_op = 'UPDATE' and m."userId" = any(old_ids);
    insert into public.notifications (user_id, actor_id, group_id, message_id, kind)
    values (m."userId", new.author_id, new.group_id, new.id, 'mention');
  end loop;

  everyone_is_new := new.mention_everyone and (tg_op = 'INSERT' or old.mention_everyone is distinct from true);
  if everyone_is_new then
    -- Muted members skip the mass @everyone ping; an explicit @mention (the
    -- loop above) still reaches them regardless of mute.
    insert into public.notifications (user_id, actor_id, group_id, message_id, kind)
    select gm.user_id, new.author_id, new.group_id, new.id, 'mention_everyone'
    from public.group_members gm
    where gm.group_id = new.group_id
      and gm.user_id <> new.author_id
      and gm.muted = false;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_message_mentions on public.messages;
create trigger notify_message_mentions
  after insert or update on public.messages
  for each row
  execute function public.notify_message_mentions();

-- Extend the existing author-only edit guard (from message_replies.sql) to
-- also cover mentions — a moderator soft-deleting someone else's message
-- shouldn't be able to smuggle in a mentions change at the same time.
create or replace function public.enforce_message_edit_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
      new.text is distinct from old.text
      or new.mentions is distinct from old.mentions
      or new.mention_everyone is distinct from old.mention_everyone
    )
    and old.author_id is distinct from auth.uid() then
    raise exception 'Only the author can edit this message';
  end if;
  if old.is_deleted and new.is_deleted then
    new.text := old.text;
    new.edited_at := old.edited_at;
  end if;
  if new.is_deleted and not old.is_deleted then
    new.text := '';
  end if;
  return new;
end;
$$;
