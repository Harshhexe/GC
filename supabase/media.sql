-- GC — media attachments (photos, videos, gifs, documents).
-- Run once in the Supabase SQL editor. Safe to re-run.

-- ── columns ─────────────────────────────────────────────────────────────
alter table public.messages
  add column if not exists media_url text,
  add column if not exists media_type text check (media_type in ('image', 'video', 'gif', 'file')),
  add column if not exists media_mime text,
  add column if not exists media_name text,
  add column if not exists media_size bigint,
  add column if not exists media_width int,
  add column if not exists media_height int,
  add column if not exists media_duration_ms int;

-- A media message can carry an empty caption, but never a media_type
-- without the URL that actually backs it.
alter table public.messages
  drop constraint if exists media_url_required_with_type;
alter table public.messages
  add constraint media_url_required_with_type
  check (media_type is null or media_url is not null);

-- ── storage bucket ──────────────────────────────────────────────────────
-- Public read (same model as user-avatars/group-avatars — the URL is
-- unguessable but not access-controlled per request; simplest option that
-- still keeps writes scoped to actual group members). Path convention is
-- `<group_id>/<filename>`, which the insert policy below checks against.
insert into storage.buckets (id, name, public)
values ('message-media', 'message-media', true)
on conflict (id) do nothing;

drop policy if exists "message media is publicly readable" on storage.objects;
create policy "message media is publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'message-media');

drop policy if exists "members upload media to their groups" on storage.objects;
create policy "members upload media to their groups"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-media'
    and public.is_group_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

-- ── deleting a message wipes its media reference too ──────────────────────
-- (Extends the trigger from message_replies.sql / mentions.sql — same
-- function name, just adding the media columns to what a soft-delete clears
-- and to the author-only edit guard.)
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

-- CREATE OR REPLACE preserves prior grants in theory, but the advisor has
-- shown this drifting back to publicly-executable before — reassert it
-- alongside the other trigger-only functions rather than assume it held.
revoke execute on function public.enforce_message_edit_rules() from anon, authenticated;
revoke execute on function public.prepare_message_mentions() from anon, authenticated;
revoke execute on function public.notify_message_mentions() from anon, authenticated;
