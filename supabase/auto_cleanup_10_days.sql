-- 10-Day Media Retention Policy
--
-- Deletes message media (photos, videos, voice notes) from storage after 10
-- days. Nothing else is touched.
--
-- This function used to delete far more: messages themselves, AI caches and
-- usage, recaps, notifications, feedback, daily GC names, wordle attempts, tea
-- sessions and anonymous messages. Deleting the messages was not wanted — a
-- chat that quietly erases its own history ten days back loses the thing people
-- come to a group chat for. Storage is the only quota pressure that actually
-- needed relieving, and media is the only thing large enough to matter, so
-- media is the only thing that expires now.
--
-- The message row is deliberately kept when its media goes. That is what lets
-- the transcript show an "expired" placeholder in place of the photo instead of
-- a hole where a message used to be.
--
-- Apply by pasting into the Supabase SQL editor.

create or replace function public.cleanup_old_data_10_days()
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  cutoff timestamptz := now() - interval '10 days';
  deleted_storage_count int := 0;
begin
  -- Storage rows are not directly deletable inside a plain transaction without
  -- this; it is scoped to this transaction only (the `true` third argument).
  perform set_config('storage.allow_delete_query', 'true', true);

  with deleted_objs as (
    delete from storage.objects
    where bucket_id = 'message-media'
      and created_at < cutoff
    returning id
  )
  select count(*) into deleted_storage_count from deleted_objs;

  return jsonb_build_object(
    'deleted_storage_objects', deleted_storage_count,
    'cutoff', cutoff
  );
end;
$$;

-- Deletes data and takes no caller into account, so it stays off the public API
-- entirely. pg_cron runs it as `postgres`, which owns it.
revoke all on function public.cleanup_old_data_10_days() from anon, authenticated, public;
grant execute on function public.cleanup_old_data_10_days() to postgres, service_role;

-- Daily at 03:00 UTC.
select cron.unschedule('daily-10-day-cleanup')
where exists (select 1 from cron.job where jobname = 'daily-10-day-cleanup');

select cron.schedule(
  'daily-10-day-cleanup',
  '0 3 * * *',
  'select public.cleanup_old_data_10_days();'
);
