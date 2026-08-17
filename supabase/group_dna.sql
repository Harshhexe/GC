-- 🧬 GC DNA — the group's AI-generated personality.
--
-- Applied as migrations `group_dna` and `compute_group_dna_stats`.
--
-- Two pieces:
--   1. group_dna         — one snapshot per group per awards week.
--   2. compute_group_dna_stats() — every objective number behind the scores.
--
-- Generation lives in supabase/functions/gc-ai/operations/groupDNA.ts and is
-- chained onto the weekly awards run (see generateDNAAfterAwards in the
-- function's index.ts). There is no second scheduler and no manual trigger.

-- ── snapshots ───────────────────────────────────────────────────────────
--
-- Snapshots rather than one mutable row per group: "your GC evolved" and
-- "chaos is up 18% this month" both need last week's numbers to still exist.
-- Nothing reads history yet; the table is shaped so it can without a
-- migration.
create table if not exists public.group_dna (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  week_start date not null,
  week_end date not null,
  -- The whole validated payload: archetype, scores, communication style,
  -- observations, one-liner, plus the raw stats for a future diff. One jsonb
  -- rather than columns because the shape is versioned (`dna.version`) and
  -- read whole by exactly one screen.
  dna jsonb not null,
  created_at timestamptz not null default now(),
  -- Running the weekly job twice must not mint two personalities for one
  -- week. The operation upserts on this key with ignoreDuplicates.
  unique (group_id, week_start, week_end)
);

create index if not exists group_dna_group_created_idx
  on public.group_dna (group_id, created_at desc);

alter table public.group_dna enable row level security;

-- Any member may read their group's DNA. There is deliberately no insert or
-- update policy: generation is the scheduler's, through the service role, so
-- "no Update DNA button" is enforced by the database rather than only by the
-- absence of a button.
drop policy if exists "members read their group's dna" on public.group_dna;
create policy "members read their group's dna"
  on public.group_dna for select
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = group_dna.group_id
        and gm.user_id = auth.uid()
    )
  );

-- ── objective statistics ────────────────────────────────────────────────
--
-- The load-bearing rule of the whole feature: the model never picks a number.
-- This function counts, groupDNA.ts scales those counts into 0–100
-- dimensions, and Gemini only writes prose about numbers it was handed. A
-- model asked to invent "94% chaos" produces a different 94% next week from
-- identical data, which would make the feature noise.
--
-- The caller passes a long window (~8 weeks): DNA answers "what kind of group
-- are we", which one week cannot. The awards week supplies recent signal
-- separately.
--
-- See the applied migration for the full body — reproduced here for reference:
--   select pg_get_functiondef(oid) from pg_proc where proname = 'compute_group_dna_stats';
--
-- Metrics it returns:
--   volume        totalMessages · messagesPerDay · messagesPerActiveMember
--   membership    totalMembers · activeMembers · topMemberShare · lurkerCount
--   cadence       avgBurstSize · maxBurstSize · medianReplySeconds · replyRate
--   texture       avgMessageLength · shortMessageRate · longMessageRate
--   media         mediaRate · memeRate · voiceRate
--   social        reactionRate · positiveReactionRate · mentionRate
--   rhythm        lateNightRate · activeDays · activeDayRate · peakHourIst
--                 peakDayOfWeek · hourHistogram
--   artifacts     teaSessions · pinnedCount · planningRate
