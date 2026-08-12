-- GC — Phase 2 schema (auth, groups, messages, reactions)
-- Run this once in the Supabase SQL Editor: Project > SQL Editor > New query > paste > Run.

-- ── profiles ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_emoji text not null default '🦝',
  avatar_color text not null default '#B98CFF',
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Auto-create a profile row whenever someone signs up.
-- Reads username/display_name from the signUp() options.data payload.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  emojis text[] := array['🦝','💀','🍵','🔥','👻','🐸','🦋','🍿'];
  colors text[] := array['#B98CFF','#FF6FB5','#FFD666','#5CE0A8','#6FB8FF'];
begin
  insert into public.profiles (id, username, display_name, avatar_emoji, avatar_color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', 'New GC Member'),
    -- Honour what the sign-up screen's avatar picker chose; only fall back to
    -- random when nothing was supplied.
    coalesce(
      nullif(new.raw_user_meta_data->>'avatar_emoji', ''),
      emojis[1 + floor(random() * array_length(emojis, 1))::int]
    ),
    coalesce(
      nullif(new.raw_user_meta_data->>'avatar_color', ''),
      colors[1 + floor(random() * array_length(colors, 1))::int]
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── groups ──────────────────────────────────────────────────────────────
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '💬',
  -- Nullable + ON DELETE SET NULL: the group survives its creator deleting
  -- their account (ownership moves to another member; see delete_own_account()).
  created_by uuid references public.profiles (id) on delete set null,
  -- Default is attached further down, once generate_invite_code() exists.
  invite_code text unique,
  theme text not null default 'violet',
  avatar_url text,
  created_at timestamptz not null default now(),
  -- Cooldown gate for @everyone — see prepare_message_mentions() below.
  last_everyone_mention_at timestamptz
);

alter table public.groups enable row level security;

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  -- One stamp per member per group drives the unread badge; see unread_counts().
  last_read_at timestamptz not null default now(),
  -- Owner: created the group (or inherited it — see delete_own_account()).
  -- Admin: can manage members/theme. Member: everyone else.
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  -- Skips @everyone notifications for this member; an explicit @mention
  -- still reaches them regardless — see notify_message_mentions() below.
  muted boolean not null default false,
  primary key (group_id, user_id)
);

alter table public.group_members enable row level security;

-- A policy on group_members can't query group_members directly inside its own
-- USING/WITH CHECK clause without Postgres detecting infinite recursion (the
-- subquery re-triggers the same policy on itself). The documented Supabase fix
-- is a SECURITY DEFINER helper function, which runs as the function owner and
-- so bypasses RLS for this one internal check.
create or replace function public.is_group_member(_group_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = _group_id and user_id = _user_id
  );
$$;

-- Same reasoning as is_group_member(): a group_members policy can't inspect
-- group_members' own role column without recursing.
create or replace function public.group_role(_group_id uuid, _user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.group_members
  where group_id = _group_id and user_id = _user_id;
$$;

create policy "members can view their groups"
  on public.groups for select
  to authenticated
  using (created_by = auth.uid() or public.is_group_member(id, auth.uid()));

create policy "authenticated users can create groups"
  on public.groups for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "owners and admins can update their group"
  on public.groups for update
  to authenticated
  using (public.group_role(id, auth.uid()) in ('owner', 'admin'))
  with check (public.group_role(id, auth.uid()) in ('owner', 'admin'));

create policy "members can view membership rows for their groups"
  on public.group_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_group_member(group_id, auth.uid())
  );

create policy "creators join their own group, members invite others"
  on public.group_members for insert
  to authenticated
  with check (
    (user_id = auth.uid() and exists (
      select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid()
    ))
    or public.is_group_member(group_id, auth.uid())
  );

create policy "members can leave a group"
  on public.group_members for delete
  to authenticated
  using (user_id = auth.uid());

create policy "owners and admins can remove members"
  on public.group_members for delete
  to authenticated
  using (
    public.group_role(group_id, auth.uid()) in ('owner', 'admin')
    and role <> 'owner'
  );

create policy "members can update their own membership"
  on public.group_members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "owners can change member roles"
  on public.group_members for update
  to authenticated
  using (public.group_role(group_id, auth.uid()) = 'owner')
  with check (public.group_role(group_id, auth.uid()) = 'owner' and role in ('admin', 'member'));

-- ── messages ────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- Nullable + ON DELETE SET NULL so a deleted account's messages survive as
  -- "Deleted User" rather than the whole conversation disappearing (or the
  -- account deletion failing outright on a foreign-key violation).
  author_id uuid references public.profiles (id) on delete set null,
  text text not null,
  created_at timestamptz not null default now(),
  -- Reply: a lightweight pointer, not a duplicated copy of the original.
  -- ON DELETE SET NULL so a hard-deleted target (shouldn't normally happen —
  -- deletes are soft, see is_deleted) doesn't take the reply down with it.
  reply_to_message_id uuid references public.messages (id) on delete set null,
  edited_at timestamptz,
  is_deleted boolean not null default false,
  -- Structured mentions — a snapshot of {userId, username} pairs, not a
  -- live join, so rendering never needs a per-message profile lookup.
  mentions jsonb not null default '[]'::jsonb,
  mention_everyone boolean not null default false,
  -- Media attachment — a message can be text-only, media-only (empty
  -- caption), or both.
  media_url text,
  media_type text check (media_type in ('image', 'video', 'gif', 'file')),
  media_mime text,
  media_name text,
  media_size bigint,
  media_width int,
  media_height int,
  media_duration_ms int,
  constraint media_url_required_with_type check (media_type is null or media_url is not null)
);

create index if not exists messages_reply_to_idx
  on public.messages (reply_to_message_id)
  where reply_to_message_id is not null;

alter table public.messages enable row level security;

create policy "members can read messages in their groups"
  on public.messages for select
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));

create policy "members can send messages in their groups"
  on public.messages for insert
  to authenticated
  with check (author_id = auth.uid() and public.is_group_member(group_id, auth.uid()));

-- Two things happen via UPDATE: the author editing their own text, or the
-- author/an owner/admin soft-deleting it. RLS can't see *which* columns
-- changed, so the trigger below is what actually keeps "can touch the row"
-- (checked here) separate from "can rewrite the text" (author-only).
create policy "authors and mods can update messages"
  on public.messages for update
  to authenticated
  using (
    public.is_group_member(group_id, auth.uid())
    and (author_id = auth.uid() or public.group_role(group_id, auth.uid()) in ('owner', 'admin'))
  )
  with check (
    public.is_group_member(group_id, auth.uid())
    and (author_id = auth.uid() or public.group_role(group_id, auth.uid()) in ('owner', 'admin'))
  );

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
    new.media_url := old.media_url;
    new.media_type := old.media_type;
  end if;
  if new.is_deleted and not old.is_deleted then
    new.text := '';
    new.media_url := null;
    new.media_type := null;
    new.media_mime := null;
    new.media_name := null;
    new.media_size := null;
    new.media_width := null;
    new.media_height := null;
    new.media_duration_ms := null;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_message_edit_rules on public.messages;
create trigger enforce_message_edit_rules
  before update on public.messages
  for each row
  execute function public.enforce_message_edit_rules();

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

-- ── @mentions: normalise + notify ──────────────────────────────────────
create or replace function public.prepare_message_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  deduped jsonb;
  cooldown interval := interval '5 minutes';
  last_everyone timestamptz;
  becoming_everyone boolean;
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

  becoming_everyone := new.mention_everyone
    and (tg_op = 'INSERT' or old.mention_everyone is distinct from true);

  if becoming_everyone then
    if public.group_role(new.group_id, auth.uid()) not in ('owner', 'admin') then
      new.mention_everyone := false;
    else
      select last_everyone_mention_at into last_everyone from public.groups where id = new.group_id;
      if last_everyone is not null and now() - last_everyone < cooldown then
        new.mention_everyone := false;
      else
        update public.groups set last_everyone_mention_at = now() where id = new.group_id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_message_mentions on public.messages;
create trigger prepare_message_mentions
  before insert or update on public.messages
  for each row
  execute function public.prepare_message_mentions();

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

-- Trigger-only functions — never meant to be called directly as a public RPC.
revoke execute on function public.enforce_message_edit_rules() from anon, authenticated;
revoke execute on function public.prepare_message_mentions() from anon, authenticated;
revoke execute on function public.notify_message_mentions() from anon, authenticated;

-- ── message media storage ───────────────────────────────────────────────
-- Public read (same model as user-avatars/group-avatars). Path convention
-- is `<group_id>/<filename>`, which the insert policy checks against.
insert into storage.buckets (id, name, public)
values ('message-media', 'message-media', true)
on conflict (id) do nothing;

create policy "message media is publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'message-media');

create policy "members upload media to their groups"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-media'
    and public.is_group_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

-- ── message_reactions ───────────────────────────────────────────────────
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  -- Cascades: a deleted account's reactions just disappear, unlike messages
  -- (which are kept and reattributed to "Deleted User").
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  label text not null default '',
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

alter table public.message_reactions enable row level security;

create policy "members can read reactions in their groups"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id and public.is_group_member(m.group_id, auth.uid())
    )
  );

create policy "members can react to messages in their groups"
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id and public.is_group_member(m.group_id, auth.uid())
    )
  );

create policy "users can remove their own reactions"
  on public.message_reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- ── join by code ────────────────────────────────────────────────────────
-- Charset deliberately omits I, L, O, 0 and 1 — codes get read aloud and
-- retyped from screenshots, and those are the characters people get wrong.
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text;
  i int;
  attempts int := 0;
begin
  loop
    result := '';
    for i in 1..6 loop
      result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups where invite_code = result);
    attempts := attempts + 1;
    if attempts > 50 then
      raise exception 'could not generate a unique invite code';
    end if;
  end loop;
  return result;
end;
$$;

alter table public.groups alter column invite_code set default public.generate_invite_code();

-- Someone joining is not yet a member, so RLS correctly hides the group from
-- them and blocks a self-insert into group_members. This SECURITY DEFINER
-- function is the one narrow path through that: it only ever adds the calling
-- user, and only when the code actually matches a group.
create or replace function public.join_group_with_code(_code text)
returns table (group_id uuid, group_name text, group_emoji text, already_member boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_group record;
  is_member boolean;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.' using errcode = '28000';
  end if;

  select id, name, emoji into found_group
  from public.groups
  where invite_code = upper(regexp_replace(coalesce(_code, ''), '\s', '', 'g'));

  if not found then
    raise exception 'No GC found with that code.' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.group_members
    where group_members.group_id = found_group.id and user_id = auth.uid()
  ) into is_member;

  if not is_member then
    insert into public.group_members (group_id, user_id)
    values (found_group.id, auth.uid());
  end if;

  return query select found_group.id, found_group.name, found_group.emoji, is_member;
end;
$$;

revoke all on function public.join_group_with_code(text) from public, anon;
grant execute on function public.join_group_with_code(text) to authenticated;

-- ── unread counts ───────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose: RLS still applies, so this can only ever count
-- messages in groups the caller belongs to. Returning every count in one round
-- trip keeps the chat list from firing a query per group.
create or replace function public.unread_counts()
returns table (group_id uuid, unread bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select gm.group_id, count(m.id) as unread
  from public.group_members gm
  left join public.messages m
    on m.group_id = gm.group_id
   and m.author_id <> auth.uid()
   and m.created_at > gm.last_read_at
  where gm.user_id = auth.uid()
  group by gm.group_id;
$$;

revoke all on function public.unread_counts() from public, anon;
grant execute on function public.unread_counts() to authenticated;

create index if not exists messages_group_created_idx
  on public.messages (group_id, created_at desc);

-- ── username availability (pre-signup check) ──────────────────────────────
-- Signed-out users have no RLS access to profiles at all, so this is the one
-- lookup they're allowed to make before they have a session. Can only ever
-- return a boolean — no usernames or other profile data are exposed.
create or replace function public.username_available(check_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(check_username)
  );
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- ── self-service account deletion ─────────────────────────────────────────
-- SECURITY DEFINER, owned by postgres (whoever runs this script) — that's
-- what grants privilege to delete from auth.users, which a normal
-- authenticated client can never do directly. Only ever acts on auth.uid();
-- there is no parameter, so it cannot be pointed at anyone else's account.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owned record;
  successor uuid;
begin
  if uid is null then
    raise exception 'You need to be signed in.' using errcode = '28000';
  end if;

  -- Keep every group they own alive for whoever's left in it: hand ownership
  -- to the most senior remaining admin (or member), or delete the group
  -- outright if they were the last one in it.
  for owned in
    select group_id from public.group_members where user_id = uid and role = 'owner'
  loop
    select user_id into successor
    from public.group_members
    where group_id = owned.group_id and user_id <> uid
    order by (role = 'admin') desc, joined_at asc
    limit 1;

    if successor is not null then
      update public.group_members
      set role = 'owner'
      where group_id = owned.group_id and user_id = successor;
    else
      delete from public.groups where id = owned.group_id;
    end if;
  end loop;

  -- Cascades to profiles -> group_members and message_reactions.
  -- messages.author_id and groups.created_by fall back to null instead of
  -- blocking the delete.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- Leaving a group you own hands it off the same way account deletion does —
-- see delete_own_account() above for why this needs to be SECURITY DEFINER.
create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  my_role text;
  successor uuid;
begin
  if uid is null then
    raise exception 'You need to be signed in.' using errcode = '28000';
  end if;

  select role into my_role from public.group_members
  where group_id = p_group_id and user_id = uid;

  if my_role is null then
    return;
  end if;

  if my_role = 'owner' then
    select user_id into successor
    from public.group_members
    where group_id = p_group_id and user_id <> uid
    order by (role = 'admin') desc, joined_at asc
    limit 1;

    if successor is not null then
      update public.group_members set role = 'owner'
      where group_id = p_group_id and user_id = successor;
    end if;
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = uid;
end;
$$;

revoke all on function public.leave_group(uuid) from public, anon;
grant execute on function public.leave_group(uuid) to authenticated;

-- ── realtime ────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.group_members;
alter publication supabase_realtime add table public.notifications;
