-- GC — Phase 4.1 AI foundation.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Two tables, both written only by the edge function (service role). Neither
-- stores message content: the cache holds the model's *output*, and usage
-- holds counters. That keeps conversation text out of any table that isn't
-- already `messages`, and keeps a cost audit trail cheap to retain.

-- ── cached results ──────────────────────────────────────────────────────
-- Keyed by what actually determines the answer: the group, the operation,
-- and a hash of the exact context that was fed in. If nobody has spoken
-- since the last run, the hash is identical and the stored result stands —
-- which is the whole point on a ₹0 budget.
create table if not exists public.ai_cache (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  operation text not null,
  -- Fingerprint of the normalized context (message ids + edit stamps).
  context_hash text not null,
  -- Human-readable note of the window the context covered, for debugging.
  context_range text,
  result jsonb not null,
  model text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (group_id, operation, context_hash)
);

create index if not exists ai_cache_lookup_idx
  on public.ai_cache (group_id, operation, context_hash);
create index if not exists ai_cache_expiry_idx on public.ai_cache (expires_at);

-- ── usage / cost ledger ─────────────────────────────────────────────────
-- Deliberately holds no message text — just who asked for what, how much it
-- cost, and whether the cache saved it. This is also what rate limiting
-- counts against, so it has to be written even for cache hits.
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  group_id uuid references public.groups (id) on delete cascade,
  operation text not null,
  model text,
  cache_hit boolean not null default false,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  message_count int not null default 0,
  latency_ms int,
  -- Populated only when the request failed, so failures are debuggable
  -- without keeping a separate log.
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_rate_limit_idx
  on public.ai_usage (user_id, operation, created_at desc);
create index if not exists ai_usage_group_idx
  on public.ai_usage (group_id, created_at desc);

alter table public.ai_cache enable row level security;
alter table public.ai_usage enable row level security;

-- No policies for `authenticated` on either table, deliberately. Every read
-- and write goes through the edge function under the service role, which
-- bypasses RLS — so the client can never read another group's cached result
-- or forge a usage row to reset its own rate limit. RLS stays enabled so a
-- direct client query returns nothing rather than everything.
