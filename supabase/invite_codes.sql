-- Join-by-code for GCs.
-- Run this once in the Supabase SQL Editor.
--
-- Why an RPC instead of plain inserts from the client: a person joining is not
-- yet a member, so RLS correctly hides the group from them (they can't look it
-- up by code) and blocks them from inserting their own group_members row. The
-- SECURITY DEFINER function below is the one narrow, audited path through that:
-- it only ever adds the *calling* user, and only when the code actually matches.

-- ── 1. the column ───────────────────────────────────────────────────────
alter table public.groups add column if not exists invite_code text;

-- ── 2. code generator ───────────────────────────────────────────────────
-- Charset deliberately omits I, L, O, 0 and 1 — codes get read aloud and
-- retyped from screenshots, and those are the characters people get wrong.
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text;
  i int;
  attempts int := 0;
begin
  loop
    result := '';
    for i in 1..6 loop
      result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups where invite_code = result);
    attempts := attempts + 1;
    if attempts > 50 then
      raise exception 'could not generate a unique invite code';
    end if;
  end loop;
  return result;
end;
$$;

-- ── 3. backfill existing groups, then lock the column down ──────────────
update public.groups set invite_code = public.generate_invite_code() where invite_code is null;

alter table public.groups alter column invite_code set not null;
alter table public.groups alter column invite_code set default public.generate_invite_code();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'groups_invite_code_key'
  ) then
    alter table public.groups add constraint groups_invite_code_key unique (invite_code);
  end if;
end
$$;

-- ── 4. the join RPC ─────────────────────────────────────────────────────
create or replace function public.join_group_with_code(_code text)
returns table (group_id uuid, group_name text, group_emoji text, already_member boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_group record;
  is_member boolean;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.' using errcode = '28000';
  end if;

  select id, name, emoji into found_group
  from public.groups
  where invite_code = upper(regexp_replace(coalesce(_code, ''), '\s', '', 'g'));

  if not found then
    raise exception 'No GC found with that code.' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.group_members
    where group_members.group_id = found_group.id and user_id = auth.uid()
  ) into is_member;

  if not is_member then
    insert into public.group_members (group_id, user_id)
    values (found_group.id, auth.uid());
  end if;

  return query select found_group.id, found_group.name, found_group.emoji, is_member;
end;
$$;

revoke all on function public.join_group_with_code(text) from public, anon;
grant execute on function public.join_group_with_code(text) to authenticated;
