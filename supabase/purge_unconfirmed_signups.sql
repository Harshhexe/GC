-- 🧹 GC — releasing usernames and emails from abandoned signups.
--
-- With "Confirm email" on, a signup creates a real auth.users row and a real
-- profile before the emailed link is ever opened. That row holds the username
-- and the email address, so someone who starts signing up and never finishes
-- silently squats on both. Over a launch that is a slow leak of exactly the
-- identifiers new users want.
--
-- This removes accounts that never confirmed within 24 hours. Deleting the
-- auth.users row is enough to free both identifiers at once: profiles.id is a
-- foreign key to auth.users with ON DELETE CASCADE, so the profile (and the
-- username on it) goes with the account, and the email leaves with the row.
--
-- Apply by pasting into the Supabase SQL editor.

-- ── the purge ───────────────────────────────────────────────────────────
create or replace function public.purge_unconfirmed_signups()
returns integer
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  removed integer;
begin
  /*
   * Safe when confirmation is off, without needing to know whether it is.
   * With the setting disabled Supabase stamps email_confirmed_at at signup,
   * so the predicate below matches nothing and this becomes a no-op rather
   * than deleting every account on the system.
   */
  with gone as (
    delete from auth.users u
    where u.email_confirmed_at is null
      and u.created_at < now() - interval '24 hours'
      /*
       * Belt and braces. An unconfirmed account should not be able to own or
       * join anything — enforce_gc_creation_limit already refuses group
       * creation without a confirmed email — but this function deletes real
       * user rows, so it refuses to touch an account holding any data at all
       * rather than trusting that invariant to hold forever.
       */
      and not exists (select 1 from public.groups g where g.created_by = u.id)
      and not exists (select 1 from public.group_members m where m.user_id = u.id)
      and not exists (select 1 from public.messages msg where msg.author_id = u.id)
      and not exists (select 1 from public.gc_purchases p
                       where p.user_id = u.id and p.status = 'paid')
    returning u.id
  )
  select count(*) into removed from gone;

  return removed;
end;
$function$;

-- Never reachable from the API. It deletes accounts, and the only caller that
-- should ever exist is the scheduled job below, which runs as `postgres`.
revoke all on function public.purge_unconfirmed_signups() from anon, authenticated, public;
grant execute on function public.purge_unconfirmed_signups() to postgres, service_role;

-- ── the schedule ────────────────────────────────────────────────────────
--
-- Hourly, not daily: the rule is "24 hours", and an hourly sweep means an
-- abandoned username is released within an hour of expiring instead of
-- whenever a once-a-day job next happens to run.
select cron.unschedule('purge-unconfirmed-signups')
where exists (select 1 from cron.job where jobname = 'purge-unconfirmed-signups');

select cron.schedule(
  'purge-unconfirmed-signups',
  '7 * * * *',
  $$select public.purge_unconfirmed_signups();$$
);

-- ── verification ────────────────────────────────────────────────────────
-- Who WOULD be removed on the next run. Inspect before trusting it; this is a
-- read-only preview and deletes nothing.
select u.email, u.created_at,
       round(extract(epoch from (now() - u.created_at)) / 3600, 1) as hours_old
from auth.users u
where u.email_confirmed_at is null
  and u.created_at < now() - interval '24 hours'
order by u.created_at;
