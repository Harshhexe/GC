-- 🔒 GC — closing the default RPC surface.
--
-- PostgREST publishes every function in `public` at /rest/v1/rpc/<name>, and
-- the anon key that reaches it ships inside the app bundle. "Only our app calls
-- this" is therefore not an access control. Three classes were reachable that
-- should not have been.
--
-- Apply with:  npx supabase db push
-- or paste into the SQL editor in the Supabase dashboard.

-- ── 1. Trigger functions ────────────────────────────────────────────────
--
-- Invoked by their triggers as the table owner; they never need an EXECUTE
-- grant. PostgREST published all 13 anyway, including handle_new_user and
-- notify_new_message. Revoking cannot affect trigger execution.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from anon, authenticated, public', fn.sig);
  end loop;
end $$;

-- ── 2. The daily cleanup ────────────────────────────────────────────────
--
-- cleanup_old_data_10_days() mass-deletes messages, storage objects, tea
-- sessions, notifications and AI caches, and performs no caller check of its
-- own — it was never meant to be reachable, so it never grew one. It was
-- callable by anon.
--
-- pg_cron job `daily-10-day-cleanup` runs it as `postgres`, which owns it, so
-- nothing legitimate loses access.
revoke all on function public.cleanup_old_data_10_days() from anon, authenticated, public;
grant execute on function public.cleanup_old_data_10_days() to postgres, service_role;

-- ── 3. The blanket PUBLIC grant on the remaining SECURITY DEFINER RPCs ──
--
-- This section originally revoked from `anon` alone. That would have failed
-- silently, and there is direct evidence of it failing before: migration
-- 20260812090208 `lock_down_trigger_functions` ran
--
--     revoke execute on function public.enforce_message_edit_rules()
--       from anon, authenticated;
--
-- and those functions are still executable by both roles today. The reason is
-- visible in the ACL, which reads
--
--     =X/postgres | postgres=X/postgres | service_role=X/postgres
--
-- The leading `=X/postgres` is PUBLIC holding EXECUTE. anon and authenticated
-- inherit through PUBLIC, so revoking their direct grants removes nothing that
-- was actually granting access. The revoke reported success and changed
-- nothing. Every function sampled on this database shows the same pattern.
--
-- So the grant that has to go is PUBLIC's, and `authenticated` is then granted
-- back explicitly — it is the one role that legitimately calls these.
--
-- Two exclusions matter, because without them this section would undo the two
-- sections above by re-granting `authenticated`:
--   * trigger functions, already fully revoked in section 1;
--   * cleanup_old_data_10_days, already restricted in section 2.
--
-- username_available is excluded as before: the signup screen calls it while
-- the person typing still has no account, so anon must keep reaching it.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype <> 'trigger'::regtype
      and p.proname not in ('username_available', 'cleanup_old_data_10_days')
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    execute format('revoke all on function %s from public, anon', fn.sig);
    execute format('grant execute on function %s to authenticated', fn.sig);
  end loop;
end $$;

-- ── 4. Verification ─────────────────────────────────────────────────────
--
-- Run this after the sections above. A revoke can report success and change
-- nothing (that is exactly what happened in 20260812090208, see section 3), so
-- this checks the resulting privileges rather than trusting the statements ran.
--
-- EXPECTED RESULT: zero rows.
--
-- Scope is the 35 functions the three sections above actually target: 13
-- trigger functions, 1 destructive maintenance function, and 21 SECURITY
-- DEFINER RPCs.
--
-- The ~41 SECURITY INVOKER functions anon can also reach are deliberately NOT
-- checked here. Those run with the caller's own privileges, so RLS still
-- applies to them and reaching one grants nothing a direct table read would
-- not. Including them would make this query return rows forever and train you
-- to ignore it.
select p.oid::regprocedure::text as still_reachable,
       case when p.prorettype = 'trigger'::regtype then 'trigger function (section 1)'
            when p.proname = 'cleanup_old_data_10_days' then 'destructive maintenance (section 2)'
            else 'security definer rpc (section 3)' end as should_have_been_locked_by,
       case when p.proacl is null
                 or exists (select 1 from aclexplode(p.proacl) a
                            where a.grantee = 0 and a.privilege_type = 'EXECUTE')
            then 'PUBLIC grant still present'
            else 'direct anon grant still present' end as why
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname <> 'username_available'
  and (
        p.prorettype = 'trigger'::regtype
     or p.proname = 'cleanup_old_data_10_days'
     or p.prosecdef
      )
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 2, 1;

-- Companion check: the cleanup function must also be unreachable by signed-in
-- users, not just anon. Expected result: zero rows.
select 'cleanup_old_data_10_days still reachable by authenticated' as problem
where has_function_privilege(
        'authenticated', 'public.cleanup_old_data_10_days()'::regprocedure, 'EXECUTE');
