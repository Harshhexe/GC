-- Group profile pictures + themes.
-- Run this once in the Supabase SQL Editor.

-- ── 1. columns ──────────────────────────────────────────────────────────
alter table public.groups add column if not exists avatar_url text;
alter table public.groups add column if not exists theme text not null default 'violet';

-- Creators (and members) need to be able to edit their group's look.
drop policy if exists "members can update their group" on public.groups;
create policy "members can update their group"
  on public.groups for update
  to authenticated
  using (created_by = auth.uid() or public.is_group_member(id, auth.uid()))
  with check (created_by = auth.uid() or public.is_group_member(id, auth.uid()));

-- ── 2. storage bucket for group pictures ────────────────────────────────
-- Public read: avatars are shown to every member and there's nothing private
-- in them. Writes stay locked to signed-in users, under their own folder.
insert into storage.buckets (id, name, public)
values ('group-avatars', 'group-avatars', true)
on conflict (id) do nothing;

drop policy if exists "group avatars are publicly readable" on storage.objects;
create policy "group avatars are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'group-avatars');

-- Path convention is <auth.uid()>/<filename>, so this pins each user to
-- writing only inside their own folder.
drop policy if exists "users upload their own group avatars" on storage.objects;
create policy "users upload their own group avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'group-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users replace their own group avatars" on storage.objects;
create policy "users replace their own group avatars"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'group-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users delete their own group avatars" on storage.objects;
create policy "users delete their own group avatars"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'group-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
