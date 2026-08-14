-- One recap per (group, calendar day) — shared by the whole group, unlike
-- ai_recap_history which is personal to one viewer. Generated once, the
-- moment someone opens the chat after midnight for a day that has one; the
-- unique constraint plus ignoreDuplicates on write makes concurrent triggers
-- (several members opening the app around midnight) converge on one row
-- instead of racing to generate it twice.
--
-- Applied as migration `daily_recaps`.

create table if not exists public.daily_recaps (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  recap_date date not null,
  total_messages integer not null default 0,
  truncated boolean not null default false,
  user_of_the_day jsonb,
  message_of_the_day jsonb,
  one_word text not null,
  best_tea jsonb,
  most_unhinged jsonb,
  created_at timestamptz not null default now(),
  unique (group_id, recap_date)
);

create index if not exists daily_recaps_group_date_idx
  on public.daily_recaps (group_id, recap_date desc);

alter table public.daily_recaps enable row level security;

-- Readable by any member of the group (it's a shared stat, not personal
-- output) — written only by the edge function's service-role client.
drop policy if exists daily_recaps_select_members on public.daily_recaps;
create policy daily_recaps_select_members
  on public.daily_recaps
  for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = daily_recaps.group_id
        and gm.user_id = auth.uid()
    )
  );
