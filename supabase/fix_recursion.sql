-- Fixes "infinite recursion detected in policy for relation group_members".
-- Run this once in the Supabase SQL Editor.

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

drop policy if exists "members can view their groups" on public.groups;
create policy "members can view their groups"
  on public.groups for select
  to authenticated
  using (public.is_group_member(id, auth.uid()));

drop policy if exists "members can view membership rows for their groups" on public.group_members;
create policy "members can view membership rows for their groups"
  on public.group_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_group_member(group_id, auth.uid())
  );

drop policy if exists "creators join their own group, members invite others" on public.group_members;
create policy "creators join their own group, members invite others"
  on public.group_members for insert
  to authenticated
  with check (
    (user_id = auth.uid() and exists (
      select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid()
    ))
    or public.is_group_member(group_id, auth.uid())
  );

drop policy if exists "members can read messages in their groups" on public.messages;
create policy "members can read messages in their groups"
  on public.messages for select
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "members can send messages in their groups" on public.messages;
create policy "members can send messages in their groups"
  on public.messages for insert
  to authenticated
  with check (author_id = auth.uid() and public.is_group_member(group_id, auth.uid()));

drop policy if exists "members can read reactions in their groups" on public.message_reactions;
create policy "members can read reactions in their groups"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id and public.is_group_member(m.group_id, auth.uid())
    )
  );

drop policy if exists "members can react to messages in their groups" on public.message_reactions;
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
