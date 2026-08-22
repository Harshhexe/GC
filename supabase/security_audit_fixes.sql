-- Fixes from the security / performance audit. Grouped in one file because
-- they are one pass over the same surface, not one feature.

-- ── SEC-002 / 004 / 005 / 006 — SECURITY DEFINER functions with no caller check
--
-- Each takes a caller-supplied id and never verifies the caller has any claim
-- to it. Revoking beats adding guards because none are called from the client
-- at all: DNA stats runs from gc-ai as the service role, the awards job is
-- scheduler-only, push_clear_coalesce is called from inside mark_group_read
-- (a SECURITY DEFINER inner call runs with owner privileges, so revoking from
-- clients does not break it), and the client uses gc_entitlement() rather than
-- gc_allowance(target). The grants were pure attack surface with no consumer.

-- SEC-002: read any group's activity profile without membership.
revoke execute on function public.compute_group_dna_stats(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

-- SEC-004: trigger the weekly awards job (and its AI spend) on demand.
revoke execute on function public.run_weekly_gc_awards() from public, anon, authenticated;

-- SEC-005: reset another user's push coalescing window.
revoke execute on function public.push_clear_coalesce(uuid, uuid) from public, anon, authenticated;

-- SEC-006: read any user's paid-purchase count.
revoke execute on function public.gc_allowance(uuid) from public, anon, authenticated;


-- ── SEC-008 — storage had no DELETE policies
--
-- Uploads were permanent: nothing could be removed when a message was deleted
-- or an account closed. Scoped to the uploader (storage.objects.owner) rather
-- than to group membership, so a moderator deleting someone's message cannot
-- also destroy files in the same path prefix that were never theirs.
drop policy if exists "uploaders delete their own message media" on storage.objects;
create policy "uploaders delete their own message media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-media'
    and owner = (select auth.uid())
  );

-- Stickers were creatable but never removable from storage either.
drop policy if exists "uploaders delete their own stickers" on storage.objects;
create policy "uploaders delete their own stickers"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'stickers'
    and owner = (select auth.uid())
  );


-- ── SEC-003 — buckets had no size or MIME limits
--
-- Any authenticated member could upload a file of any size and any type,
-- including active content. SVG is excluded from every bucket deliberately: it
-- can carry script, and these are rendered from a Supabase origin.
update storage.buckets
set file_size_limit = 52428800,  -- 50 MB
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
      'video/mp4','video/quicktime','video/webm',
      'audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/webm','audio/m4a','audio/x-m4a',
      'application/pdf','text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
where id = 'message-media';

update storage.buckets
set file_size_limit = 5242880,  -- 5 MB
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
where id in ('user-avatars', 'group-avatars');

update storage.buckets
set file_size_limit = 2097152,  -- 2 MB
    allowed_mime_types = array['image/png','image/webp','image/jpeg']
where id = 'stickers';


-- ── SEC-001 — message-media was world-readable
--
-- Anyone holding an object URL could fetch a private group's photo, with no
-- auth, forever: removed members kept working links, and deleting a message
-- never revoked its media.
--
-- The bucket is private now and the "publicly readable" policy is replaced by
-- one scoped to the group whose id is the object's first path segment, which
-- is how uploads are already laid out (see the matching INSERT policy).
-- Clients render through short-lived signed URLs (src/lib/mediaUrl.ts), and
-- Storage re-checks membership every time one is minted.
--
-- Ordering matters on deploy: signed URLs work against a public bucket too, so
-- the client change must ship BEFORE this runs. Flipping first breaks media
-- for every client that has not updated yet.
update storage.buckets set public = false where id = 'message-media';

drop policy if exists "message media is publicly readable" on storage.objects;

create policy "members read media in their groups"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-media'
    and is_group_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );


-- ── SEC-007 — profiles were readable by every signed-in account
--
-- The SELECT policy was `using (true)`, so any account could page the whole
-- user directory: every display name, username, avatar and streak in the app,
-- including people they have no connection to.
--
-- Scoped to yourself plus anyone you share a GC with, which is exactly what
-- the app actually reads: member lists, mention pickers, read receipts,
-- notification actors and leaderboards are all co-members. Signup is
-- unaffected because username availability goes through the
-- username_available RPC, and joining goes through join_group_with_code —
-- neither selects from profiles.
drop policy if exists "profiles are viewable by authenticated users" on profiles;

create policy "profiles are viewable by people you share a gc with"
  on profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from group_members mine
      join group_members theirs on theirs.group_id = mine.group_id
      where mine.user_id = (select auth.uid())
        and theirs.user_id = profiles.id
    )
  );

-- The policy's subquery looks up both directions of the join on every profile
-- row read, so both columns need to be indexed for it to stay cheap.
create index if not exists group_members_user_id_idx on group_members (user_id);
create index if not exists group_members_group_id_idx on group_members (group_id);


-- ── PERF-004 — send-push made one RPC round trip per recipient
--
-- A 50-member group meant 50 sequential calls for a single message. This
-- decides for every recipient in one call, keeping the same per-user window
-- semantics and the same row locking.
create or replace function public.push_should_notify_batch(
  p_user_ids uuid[],
  p_group_id uuid,
  p_window_seconds integer default 15
)
returns table(user_id uuid, pending integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid;
begin
  foreach v_uid in array p_user_ids loop
    user_id := v_uid;
    pending := public.push_should_notify(v_uid, p_group_id, p_window_seconds);
    return next;
  end loop;
end;
$function$;

-- Service role only: this mutates other users' coalescing state by design,
-- which is exactly why the single-user version was revoked from clients.
revoke all on function public.push_should_notify_batch(uuid[], uuid, integer)
  from public, anon, authenticated;
