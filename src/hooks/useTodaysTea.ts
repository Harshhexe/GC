import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { TeaSession, TeaStatus } from './useTeaSession';
import type { TeaReportResult } from '../lib/ai';

type TeaRow = {
  id: string;
  group_id: string;
  started_by: string | null;
  started_at: string;
  ended_by: string | null;
  ended_at: string | null;
  status: TeaStatus;
  report: TeaReportResult | null;
};

/**
 * Tea sessions that ended today, newest first.
 *
 * Reads the stored report straight off the row — never regenerates. A session
 * that already has a report is a finished, immutable record, so opening this
 * screen should cost a table read and nothing else.
 *
 * Scoped by `ended_at` rather than a status filter so `failed` sessions show
 * up too: they can be retried from the report screen, and hiding them would
 * make a failure look like the tea never happened.
 */
export function useTodaysTea(groupId: string) {
  const [sessions, setSessions] = useState<TeaSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!groupId) return;

    // Local midnight, like the daily recap — "today" is the user's day, not
    // the server's.
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const { data } = await supabase
      .from('tea_sessions')
      .select('id, group_id, started_by, started_at, ended_by, ended_at, status, report')
      .eq('group_id', groupId)
      .gte('ended_at', startOfToday.toISOString())
      .order('ended_at', { ascending: false });

    const rows = (data ?? []) as TeaRow[];
    const starterIds = Array.from(
      new Set(rows.map((r) => r.started_by).filter((id): id is string => !!id))
    );

    const nameById = new Map<string, string>();
    if (starterIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', starterIds);
      for (const p of (profiles ?? []) as { id: string; display_name: string }[]) {
        nameById.set(p.id, p.display_name);
      }
    }

    setSessions(
      rows.map((r) => ({
        id: r.id,
        groupId: r.group_id,
        startedBy: r.started_by,
        startedByName: r.started_by ? nameById.get(r.started_by) ?? 'someone' : 'someone',
        startedAt: r.started_at,
        endedBy: r.ended_by,
        endedAt: r.ended_at,
        status: r.status,
        report: r.report,
      }))
    );
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  return { sessions, loading, refresh };
}
