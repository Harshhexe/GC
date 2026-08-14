-- Persisted history of "meaningful" AI recaps (What Did I Miss and future
-- operations like it), so a new recap stacks on top of older ones from the
-- same day instead of replacing them. The ai_cache table is a single-slot
-- fingerprint cache (this window's summary); this is an append-only log of
-- every distinct summary a user has actually been shown recently.
--
-- Read directly by the client (RLS-scoped to the caller's own rows) rather
-- than through the edge function — it's just their own past AI output, no
-- provider call or membership check needed to read it back.
--
-- Applied as migration `ai_recap_history`.

create table if not exists public.ai_recap_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  operation text not null,
  headline text not null,
  summary text not null,
  highlights jsonb not null default '[]'::jsonb,
  mentioned_message_ids jsonb not null default '[]'::jsonb,
  pinned_message_ids jsonb not null default '[]'::jsonb,
  truncated boolean not null default false,
  message_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_recap_history_reader_idx
  on public.ai_recap_history (user_id, group_id, operation, created_at desc);

alter table public.ai_recap_history enable row level security;

-- Read-only for the owner. Written only by the edge function's service-role
-- client, after it has already generated and validated the content — a client
-- must never be able to insert its own "AI said this" row.
drop policy if exists ai_recap_history_select_own on public.ai_recap_history;
create policy ai_recap_history_select_own
  on public.ai_recap_history
  for select
  to authenticated
  using (user_id = auth.uid());
