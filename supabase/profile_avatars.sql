-- Profile pictures for people (groups already have theirs).
-- Run this once in the Supabase SQL Editor.

-- ── 1. column ───────────────────────────────────────────────────────────
alter table public.profiles add column if not exists avatar_url text;

-- ── 2. honour the emoji chosen at sign-up ───────────────────────────────
-- The original trigger always assigned a random emoji, which threw away the
-- one the user picked on the sign-up screen. Now it uses their choice and only
-- falls back to random when none was supplied.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  emojis text[] := array['🦝','💀','🍵','🔥','👻','🐸','🦋','🍿'];
  colors text[] := array['#d0bcff','#ffb0cd','#4cd7f6','#84CC16','#FBBF24'];
begin
  insert into public.profiles (id, username, display_name, avatar_emoji, avatar_color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', 'New GC Member'),
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

-- ── 3. storage bucket for people's pictures ─────────────────────────────
-- Public read: avatars are shown to everyone you share a GC with and hold
-- nothing private. Writes stay pinned to each user's own folder.
insert into storage.buckets (id, name, public)
values ('user-avatars', 'user-avatars', true)
on conflict (id) do nothing;

drop policy if exists "user avatars are publicly readable" on storage.objects;
create policy "user avatars are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'user-avatars');

drop policy if exists "users upload their own avatar" on storage.objects;
create policy "users upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users replace their own avatar" on storage.objects;
create policy "users replace their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users delete their own avatar" on storage.objects;
create policy "users delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
