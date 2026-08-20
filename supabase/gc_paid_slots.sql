-- Paid GC slots.
--
-- Everyone gets one GC free. Each additional GC you *create* costs a one-off
-- fee (₹500). Joining someone else's GC is always free and unlimited — the
-- charge is for hosting a group, not for being in one.
--
-- Enforced by a trigger on `groups` rather than in the app: groups are created
-- by a direct client insert under RLS, so anyone with the anon key could
-- otherwise create unlimited GCs by calling PostgREST directly.
--
-- Razorpay is the intended provider but nothing here talks to it. The purchase
-- row is created in `created` state and only ever becomes `paid` from the
-- server (a webhook using the service role) — see the guard trigger below,
-- which is what stops a client from granting itself free slots.
--
-- Run this once in the Supabase SQL Editor.

-- ── Config ──────────────────────────────────────────────────────────────
create or replace function public.gc_free_limit()
returns integer language sql immutable as $$ select 1 $$;

create or replace function public.gc_slot_price_paise()
returns integer language sql immutable as $$ select 50000 $$;  -- ₹500.00

comment on function public.gc_slot_price_paise() is
  'Price of one additional GC slot, in paise. Single source of truth — the app reads it through gc_entitlement().';

-- ── Purchases ───────────────────────────────────────────────────────────
create table if not exists public.gc_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_paise integer not null,
  currency text not null default 'INR',
  provider text not null default 'razorpay',
  /* Filled in by the payment flow once a gateway is wired up. */
  provider_order_id text,
  provider_payment_id text,
  status text not null default 'created'
    check (status in ('created', 'paid', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists gc_purchases_user_status_idx
  on public.gc_purchases (user_id, status);

alter table public.gc_purchases enable row level security;

drop policy if exists "users read their own purchases" on public.gc_purchases;
create policy "users read their own purchases"
  on public.gc_purchases for select
  using ((select auth.uid()) = user_id);

drop policy if exists "users start their own purchases" on public.gc_purchases;
create policy "users start their own purchases"
  on public.gc_purchases for insert
  with check ((select auth.uid()) = user_id);

-- Deliberately no UPDATE or DELETE policy: marking a purchase paid is the
-- server's job, and the service role bypasses RLS to do it. A client UPDATE
-- therefore matches zero rows rather than erroring.
alter table public.gc_purchases force row level security;

/*
 * A purchase always starts unpaid, and only the server may settle it.
 *
 * Without this, a client could insert a row with status 'paid' and hand itself
 * a free slot — the INSERT policy only checks *who* the row belongs to, not
 * what it says.
 */
create or replace function public.guard_gc_purchase()
returns trigger
language plpgsql
-- SECURITY INVOKER on purpose. This function's whole job is to tell an
-- end-user write from a server one via current_user; under SECURITY DEFINER
-- current_user is the function *owner* regardless of caller, so every client
-- write looks trusted and the rewrite below never fires. It needs no elevated
-- rights, so invoker is both correct and sufficient.
set search_path = public
as $$
declare
  /*
   * Checked on the database role, not auth.role(). PostgREST runs client
   * requests as `anon`/`authenticated`; `service_role` (webhook) and
   * `postgres` (direct connection, migration) are already-trusted server
   * context. auth.role() reads the JWT, which is NULL on a direct connection,
   * so admin writes would be misread as client writes.
   */
  is_server boolean := current_user not in ('anon', 'authenticated');
begin
  if TG_OP = 'INSERT' then
    if not is_server then
      new.status := 'created';
      new.provider_payment_id := null;
      new.paid_at := null;
      new.amount_paise := public.gc_slot_price_paise();
      new.currency := 'INR';
    end if;
    return new;
  end if;

  if not is_server then
    raise exception 'PURCHASE_READONLY' using errcode = 'check_violation';
  end if;

  if new.status = 'paid' and old.status <> 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists gc_purchases_guard on public.gc_purchases;
create trigger gc_purchases_guard
  before insert or update on public.gc_purchases
  for each row execute function public.guard_gc_purchase();

-- ── Enforcement ─────────────────────────────────────────────────────────
/*
 * How many GCs this user may own: the free one, plus one per settled purchase.
 *
 * Slots are held rather than consumed — deleting a GC frees its slot, so the
 * fee buys the right to run N groups at once, not N groups ever.
 */
create or replace function public.gc_allowance(target uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select public.gc_free_limit()
       + (select count(*) from public.gc_purchases
          where user_id = target and status = 'paid')::int;
$$;

create or replace function public.enforce_gc_creation_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owned integer;
  allowance integer;
begin
  -- Rows with no creator (backfills, admin inserts) are not gated.
  if new.created_by is null then
    return new;
  end if;

  select count(*) into owned from public.groups where created_by = new.created_by;
  allowance := public.gc_allowance(new.created_by);

  if owned >= allowance then
    raise exception 'GC_LIMIT_REACHED:%', allowance using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists groups_creation_limit on public.groups;
create trigger groups_creation_limit
  before insert on public.groups
  for each row execute function public.enforce_gc_creation_limit();

-- ── What the app reads ──────────────────────────────────────────────────
/*
 * One authoritative answer for "may I create another GC, and what would it
 * cost?". Returned as a single row so the paywall never has to derive the
 * rule client-side and risk disagreeing with the trigger.
 */
create or replace function public.gc_entitlement()
returns table (
  owned integer,
  allowance integer,
  free_limit integer,
  can_create boolean,
  price_paise integer,
  pending_purchase_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.groups where created_by = auth.uid())::int as owned,
    public.gc_allowance(auth.uid()) as allowance,
    public.gc_free_limit() as free_limit,
    (select count(*) from public.groups where created_by = auth.uid())
      < public.gc_allowance(auth.uid()) as can_create,
    public.gc_slot_price_paise() as price_paise,
    (select id from public.gc_purchases
      where user_id = auth.uid() and status = 'created'
      order by created_at desc limit 1) as pending_purchase_id;
$$;

grant execute on function public.gc_entitlement() to authenticated;
grant execute on function public.gc_allowance(uuid) to authenticated;
grant execute on function public.gc_slot_price_paise() to authenticated;
grant execute on function public.gc_free_limit() to authenticated;
