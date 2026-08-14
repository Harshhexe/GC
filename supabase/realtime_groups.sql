-- GC — publish `groups` for realtime.
-- Run once in the Supabase SQL editor. Safe to re-run (ignore the error if it
-- reports the table is already a member of the publication).
--
-- The chat list subscribes to UPDATEs on groups so a rename, new avatar or
-- theme change shows up without a reload.
--
-- The subtle part, and the reason this file exists: a postgres_changes binding
-- for a table that isn't in the publication is *rejected by the server*, and
-- that rejection fails the entire channel — not just that one binding. The
-- group-list channel also carries the `messages` INSERT binding, so an
-- unpublished `groups` silently stopped new messages from updating the chat
-- list's last-message preview. It only refreshed via the on-focus refetch,
-- which reads exactly like "it needs a reload".
--
-- If you ever add a `.on('postgres_changes', ...)` for a new table, add it
-- here too, or you'll break every other subscription sharing that channel.

alter publication supabase_realtime add table public.groups;
