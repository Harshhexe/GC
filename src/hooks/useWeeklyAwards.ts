import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { onChannelStatus } from '../lib/realtime';
import type { Award, WeeklyAwardsResult, WeeklyAwardsStatus } from '../lib/ai';

type Row = {
  group_id: string;
  week_start: string;
  week_end: string;
  status: WeeklyAwardsStatus;
  awards: Award[] | null;
  title: string | null;
  summary: string | null;
  message_count: number;
  generated_at: string | null;
};

function fromRow(row: Row): WeeklyAwardsResult {
  return {
    groupId: row.group_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    status: row.status,
    messageCount: row.message_count,
    generatedAt: row.generated_at,
    title: row.title,
    summary: row.summary,
    awards: row.awards ?? [],
  };
}

const COLUMNS =
  'group_id, week_start, week_end, status, awards, title, summary, message_count, generated_at';

/**
 * 🏆 GC Awards for one group — entirely read-only from the client's side.
 *
 * There is no "generate" call here on purpose: awards are produced by the
 * Sunday scheduler alone (see `run_weekly_gc_awards` + the `weekly_gc_awards`
 * operation, which rejects any request carrying a real user). This hook only
 * ever reads what the scheduler already wrote, live via realtime so a
 * `generating` row flips to `completed` on screen without a refresh.
 */
export function useWeeklyAwards(groupId: string) {
  const [thisWeek, setThisWeek] = useState<WeeklyAwardsResult | null>(null);
  const [previousWeeks, setPreviousWeeks] = useState<WeeklyAwardsResult[]>([]);
  const [loading, setLoading] = useState(true);
  const channelId = useRef(Math.random().toString(36).slice(2, 10));

  const load = useCallback(async () => {
    if (!groupId) return;
    const { data } = await supabase
      .from('group_weekly_awards')
      .select(COLUMNS)
      .eq('group_id', groupId)
      .order('week_start', { ascending: false })
      .limit(12);

    const rows = ((data ?? []) as Row[]).map(fromRow);
    setThisWeek(rows[0] ?? null);
    setPreviousWeeks(rows.slice(1));
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`weekly-awards-${groupId}-${channelId.current}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_weekly_awards',
          filter: `group_id=eq.${groupId}`,
        },
        () => load()
      )
      .subscribe(onChannelStatus('weekly-awards'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, load]);

  return { thisWeek, previousWeeks, loading, refresh: load };
}
