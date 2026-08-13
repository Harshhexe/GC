-- GC — pinned messages.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Deliberately a thin pointer table, not a message copy: messageId + who +
-- when. The bubble itself stays the single source of truth for content,
-- author, media, deletion state, etc. — this just remembers "this one's up".

create table if not exists public.pinned_messages (
  message_id uuid primary key references public.messages (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  pinned_by uuid references public.profiles (id) on delete set null,
  pinned_at timestamptz not null default now()
);

create index if not exists pinned_messages_group_id_idx
  on public.pinned_messages (group_id, pinned_at desc);

alter table public.pinned_messages enable row level security;

drop policy if exists "members can view pinned messages" on public.pinned_messages;
create policy "members can view pinned messages"
  on public.pinned_messages for select
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));

-- Pinning is a moderation action, same tier as removing a member or
-- changing the group theme — owner/admin only.
drop policy if exists "owners and admins can pin messages" on public.pinned_messages;
create policy "owners and admins can pin messages"
  on public.pinned_messages for insert
  to authenticated
  with check (
    public.group_role(group_id, auth.uid()) in ('owner', 'admin')
    and pinned_by = auth.uid()
  );

drop policy if exists "owners and admins can unpin messages" on public.pinned_messages;
create policy "owners and admins can unpin messages"
  on public.pinned_messages for delete
  to authenticated
  using (public.group_role(group_id, auth.uid()) in ('owner', 'admin'));

alter publication supabase_realtime add table public.pinned_messages;
