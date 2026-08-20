-- Editing your identity from the Profile screen: display name freely, username
-- once every 30 days.
--
-- The cooldown is enforced here rather than in the app because the app is not
-- a trust boundary — `profiles` is directly updatable by its owner under RLS,
-- so anyone with the anon key could otherwise rename themselves in a loop.
--
-- Run this once in the Supabase SQL Editor.

alter table public.profiles
  add column if not exists username_changed_at timestamptz;

comment on column public.profiles.username_changed_at is
  'When the username was last changed. NULL means never — the first change is always free. Maintained by the profiles_identity_rules trigger; writing it directly has no effect.';

-- username_available() has always compared with lower(), but the column's
-- UNIQUE constraint is case-sensitive — so "Harsh" could be created while the
-- RPC reported "harsh" as taken, and two accounts could differ only by case.
-- Verified free of collisions before adding.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

/*
 * Gate for the two identity columns.
 *
 * Errors are raised with a machine-readable prefix so the client can turn them
 * into its own copy; the ISO timestamp on the cooldown error is what the app
 * shows as "you can change it again on ...".
 */
create or replace function public.enforce_profile_identity_rules()
returns trigger
language plpgsql
as $$
declare
  cooldown constant interval := interval '30 days';
  next_allowed timestamptz;
begin
  if btrim(coalesce(new.display_name, '')) = '' then
    raise exception 'DISPLAY_NAME_EMPTY' using errcode = 'check_violation';
  end if;
  new.display_name := btrim(new.display_name);

  if new.username is distinct from old.username then
    new.username := btrim(new.username);

    if new.username !~ '^[A-Za-z0-9._]{3,20}$' then
      raise exception 'USERNAME_INVALID' using errcode = 'check_violation';
    end if;

    next_allowed := old.username_changed_at + cooldown;
    if old.username_changed_at is not null and now() < next_allowed then
      raise exception 'USERNAME_COOLDOWN:%',
        to_char(next_allowed at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        using errcode = 'check_violation';
    end if;

    new.username_changed_at := now();
  else
    -- Only a real username change may move this clock. Without this branch the
    -- cooldown could be cleared by writing the column on its own.
    new.username_changed_at := old.username_changed_at;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_identity_rules on public.profiles;
create trigger profiles_identity_rules
  before update on public.profiles
  for each row
  execute function public.enforce_profile_identity_rules();
