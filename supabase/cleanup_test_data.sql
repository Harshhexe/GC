-- Remove the test data generated while building GC.
-- Run in the Supabase SQL Editor. Read the preview first, then run the deletes.
--
-- There is deliberately no DELETE policy on messages/groups, so none of this
-- can happen from the app — it only runs here, with your eyes on it.

-- ── 1. PREVIEW — run this alone first to see what will go ───────────────
select 'group' as kind, g.name as label, count(m.id) as messages
from public.groups g
left join public.messages m on m.group_id = g.id
where g.name in ('code test gc', 'test')
group by g.name
union all
select 'account', p.username, count(m.id)
from public.profiles p
left join public.messages m on m.author_id = p.id
where p.username in ('codemaker', 'codejoiner', 'web')
group by p.username;

-- ── 2. DELETE the throwaway group ──────────────────────────────────────
-- Cascades to its messages, members and reactions.
delete from public.groups where name = 'code test gc';

-- ── 3. DELETE the test accounts ────────────────────────────────────────
-- Must come after the group above: messages.author_id references profiles,
-- so an account still holding messages anywhere can't be removed.
-- Deleting the auth user cascades to its profile.
delete from auth.users
where email in (
  'hdhiman0302+gcmaker@gmail.com',
  'hdhiman0302+gcjoiner@gmail.com'
);

-- ── 4. OPTIONAL — your own scratch data ────────────────────────────────
-- Left commented because these are yours, not mine. Uncomment what you want.
--
-- delete from public.groups where name in ('test', 'tea time 🍵');
--
-- Duplicate/scratch signups, if you don't want them:
-- delete from auth.users where id in (
--   select id from public.profiles where username in ('web', 'Harsh')
-- );

-- ── 5. VERIFY ──────────────────────────────────────────────────────────
select
  (select count(*) from public.groups) as groups_left,
  (select count(*) from public.messages) as messages_left,
  (select count(*) from public.profiles) as profiles_left;
