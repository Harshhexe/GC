-- Fixes "Database error saving new user" on sign-up.
--
-- Root cause: a duplicate username hits profiles' UNIQUE constraint inside the
-- handle_new_user trigger, which fails the whole auth.users insert. GoTrue then
-- reports that as a generic, unhelpful "Database error saving new user" — the
-- real Postgres error (23505 duplicate key) never reaches the client.
--
-- Fix is two-part:
--  1. A username_available() RPC the sign-up screen can call *before*
--     submitting, so the common case never hits the failure at all.
--  2. The app also now translates the raw error into a friendly message for
--     any signup that still collides (e.g. a race between two people signing
--     up with the same name at once).
--
-- Run this once in the Supabase SQL Editor.

create or replace function public.username_available(check_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = lower(check_username)
  );
$$;

-- Deliberately grants to anon: this is the one profiles lookup someone must be
-- able to make *before* they have a session. It can only ever return a
-- boolean — no usernames, emails, or other profile data are exposed.
grant execute on function public.username_available(text) to anon, authenticated;
