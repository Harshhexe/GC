-- Unread tracking for GC.
-- Run this once in the Supabase SQL Editor.
--
-- Model: each membership row remembers when that member last read the group.
-- Unread = messages in the group, newer than that stamp, that they didn't send
-- themselves. No per-message read receipts — one timestamp per member per
-- group is enough for a badge and costs nothing to maintain.

-- ── 1. the stamp ────────────────────────────────────────────────────────
alter table public.group_members
  add column if not exists last_read_at timestamptz not null default now();

-- ── 2. let members update their own membership row ──────────────────────
-- Without this there is no UPDATE policy on group_members at all, so marking
-- a group read would silently no-op under RLS.
drop policy if exists "members can update their own membership" on public.group_members;
create policy "members can update their own membership"
  on public.group_members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── 3. one query for every unread count ─────────────────────────────────
-- Deliberately SECURITY INVOKER: RLS still applies, so this can only ever
-- count messages in groups the caller belongs to. Returning all counts in a
-- single round trip keeps the chat list from firing one query per group.
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

-- Makes the unread lookup an index scan per group instead of a table scan.
create index if not exists messages_group_created_idx
  on public.messages (group_id, created_at desc);
