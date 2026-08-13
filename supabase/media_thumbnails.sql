-- GC — video poster frames.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- A video attachment has nothing renderable in a bubble on its own: an
-- <Image> pointed at a .mov draws a black box. This stores the URL of a
-- single frame grabbed from the video on-device at pick time — a derived
-- thumbnail, not a second copy of the media.

alter table public.messages
  add column if not exists media_thumb_url text;

-- Keep the soft-delete guard in step with the new column, so deleting a
-- video clears its poster too instead of leaving it dangling in the UI.
-- (Same function as media.sql — re-stated here in full so this file can be
-- applied on its own.)
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
    new.media_thumb_url := old.media_thumb_url;
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
    new.media_thumb_url := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_message_edit_rules() from anon, authenticated;
