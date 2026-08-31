-- Automated 10-Day Data & Media Retention Policy
-- Cleans up messages, media files, AI cache, recaps, and temporary notifications
-- older than 10 days to keep the database and storage well under free-tier quotas.

create or replace function public.cleanup_old_data_10_days()
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  cutoff timestamptz := now() - interval '10 days';
  deleted_msgs_count int := 0;
  deleted_storage_count int := 0;
  deleted_notifs_count int := 0;
begin
  -- 1. Enable storage direct deletion within this security definer transaction
  perform set_config('storage.allow_delete_query', 'true', true);

  -- 2. Delete message media storage objects older than 10 days
  with deleted_objs as (
    delete from storage.objects
    where bucket_id = 'message-media'
      and created_at < cutoff
    returning id
  )
  select count(*) into deleted_storage_count from deleted_objs;

  -- 3. Delete messages older than 10 days (retaining pinned messages)
  with deleted_m as (
    delete from public.messages
    where created_at < cutoff
      and id not in (select message_id from public.pinned_messages where message_id is not null)
    returning id
  )
  select count(*) into deleted_msgs_count from deleted_m;

  -- 4. Delete AI caches, usage, and recaps older than 10 days
  delete from public.ai_cache where created_at < cutoff;
  delete from public.ai_usage where created_at < cutoff;
  delete from public.ai_recap_history where created_at < cutoff;
  delete from public.daily_recaps where created_at < cutoff;

  -- 5. Delete notifications and feedback older than 10 days
  with deleted_n as (
    delete from public.notifications where created_at < cutoff
    returning id
  )
  select count(*) into deleted_notifs_count from deleted_n;

  delete from public.app_feedback where created_at < cutoff;
  delete from public.daily_gc_names where created_at < cutoff;
  delete from public.wordle_attempts where created_at < cutoff;
  delete from public.tea_sessions where created_at < cutoff;
  delete from public.anonymous_messages where created_at < cutoff;

  return jsonb_build_object(
    'deleted_messages', deleted_msgs_count,
    'deleted_storage_objects', deleted_storage_count,
    'deleted_notifications', deleted_notifs_count,
    'cutoff', cutoff
  );
end;
$$;

revoke execute on function public.cleanup_old_data_10_days() from anon, authenticated;

-- Schedule daily execution at 03:00 UTC via pg_cron
select cron.unschedule('daily-10-day-cleanup') where exists (select 1 from cron.job where jobname = 'daily-10-day-cleanup');
select cron.schedule(
  'daily-10-day-cleanup',
  '0 3 * * *',
  'select public.cleanup_old_data_10_days();'
);
