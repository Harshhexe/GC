-- Adds group roles (owner/admin/member) and self-service account deletion.
-- Run this once in the Supabase SQL Editor.

-- ── 1. roles ────────────────────────────────────────────────────────────
alter table public.group_members
  add column if not exists role text not null default 'member'
  check (role in ('owner', 'admin', 'member'));

-- Backfill: whoever's in groups.created_by is the owner of their group.
update public.group_members gm
set role = 'owner'
from public.groups g
where gm.group_id = g.id and gm.user_id = g.created_by and gm.role = 'member';

-- Safety net for any group that ended up without an owner (creator already
-- left, or created_by was null) — promote whoever joined first.
with ownerless as (
  select group_id, min(joined_at) as earliest
  from public.group_members
  group by group_id
  having count(*) filter (where role = 'owner') = 0
)
update public.group_members gm
set role = 'owner'
from ownerless o
where gm.group_id = o.group_id and gm.joined_at = o.earliest;

-- Same recursion problem as is_group_member() — a policy on group_members
-- can't query group_members directly. Reuse the SECURITY DEFINER pattern.
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

-- ── 2. owners/admins can remove members (never the owner) ────────────────
drop policy if exists "owners and admins can remove members" on public.group_members;
create policy "owners and admins can remove members"
  on public.group_members for delete
  to authenticated
  using (
    public.group_role(group_id, auth.uid()) in ('owner', 'admin')
    and role <> 'owner'
  );

-- ── 3. owners can promote/demote (never hand out ownership this way) ─────
drop policy if exists "owners can change member roles" on public.group_members;
create policy "owners can change member roles"
  on public.group_members for update
  to authenticated
  using (public.group_role(group_id, auth.uid()) = 'owner')
  with check (public.group_role(group_id, auth.uid()) = 'owner' and role in ('admin', 'member'));

-- ── 4. theme/name changes restricted to owner/admin ──────────────────────
-- Was open to any member; group identity (name, emoji, theme) is now an
-- owner/admin decision, matching who can manage membership.
drop policy if exists "members can update their group" on public.groups;
drop policy if exists "owners and admins can update their group" on public.groups;
create policy "owners and admins can update their group"
  on public.groups for update
  to authenticated
  using (public.group_role(id, auth.uid()) in ('owner', 'admin'))
  with check (public.group_role(id, auth.uid()) in ('owner', 'admin'));

-- ── 5. let people, messages and reactions survive a deleted account ──────
-- Without this, deleting an account that ever sent a message would fail on
-- a foreign-key violation. History stays; the author becomes "Deleted User"
-- (author_id null) instead of the whole conversation disappearing.
alter table public.messages alter column author_id drop not null;
alter table public.messages drop constraint if exists messages_author_id_fkey;
alter table public.messages
  add constraint messages_author_id_fkey
  foreign key (author_id) references public.profiles (id) on delete set null;

alter table public.groups alter column created_by drop not null;
alter table public.groups drop constraint if exists groups_created_by_fkey;
alter table public.groups
  add constraint groups_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.message_reactions drop constraint if exists message_reactions_user_id_fkey;
alter table public.message_reactions
  add constraint message_reactions_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- ── 6. self-service account deletion ──────────────────────────────────────
-- SECURITY DEFINER, owned by postgres (whoever runs this in the SQL editor) —
-- that's what grants privilege to delete from auth.users, which a normal
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
  -- blocking the delete (see the constraint changes above).
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- ── 7. leaving a group you own hands it off the same way ─────────────────
-- Without this, an owner tapping "Leave" either orphans the group (nobody
-- left with role='owner') or silently fails — the plain client-side delete
-- can't also promote a successor, and the "owners can change member roles"
-- policy deliberately can't grant 'owner' to prevent a normal client from
-- creating a second owner. This SECURITY DEFINER path is the one place that's
-- allowed to do both atomically.
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
    return; -- not a member — nothing to leave
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
