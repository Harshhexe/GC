-- Fixes "new row violates row-level security policy for table groups" when creating a group.
-- Cause: after INSERT, Supabase reads the row back to return it, but the SELECT policy
-- required group_members membership — which doesn't exist yet for a brand new group.
-- Fix: let the creator see groups they created, even before they're added as a member.
-- Run this once in the Supabase SQL Editor.

drop policy if exists "members can view their groups" on public.groups;
create policy "members can view their groups"
  on public.groups for select
  to authenticated
  using (created_by = auth.uid() or public.is_group_member(id, auth.uid()));
