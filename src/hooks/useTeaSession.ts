import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { onChannelStatus } from '../lib/realtime';
import { invokeGCAI, type TeaReportResult } from '../lib/ai';

export type TeaStatus = 'active' | 'generating' | 'completed' | 'failed';

export type TeaSession = {
  id: string;
  groupId: string;
  startedBy: string | null;
  startedByName: string;
  startedAt: string;
  endedBy: string | null;
  endedAt: string | null;
  status: TeaStatus;
  report: TeaReportResult | null;
};

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

/** Sessions still worth showing in the chat header: the live one, or the most
 *  recent finished one so its report is one tap away rather than buried. */
const BANNER_STATUSES: TeaStatus[] = ['active', 'generating', 'completed', 'failed'];

/** How long a completed/failed tea report banner remains visible before expiring (5 minutes). */
export const TEA_REPORT_BANNER_DURATION_MS = 5 * 60 * 1000;

/**
 * The group's Tea state, live for every member.
 *
 * One realtime binding on `tea_sessions` (which is in the supabase_realtime
 * publication — a binding on a table that isn't kills the whole channel and
 * every sibling binding with it) so starting or ending Tea reaches everyone
 * without a refresh.
 */
export function useTeaSession(
  groupId: string,
  opts: { userId?: string; canModerate?: boolean } = {}
) {
  const { userId, canModerate } = opts;
  const [session, setSession] = useState<TeaSession | null>(null);
  const [loading, setLoading] = useState(true);
  const channelId = useRef(Math.random().toString(36).slice(2, 10));
  // Guards against two report requests for one session. The realtime update
  // reaches every member, but only the one who ended Tea should pay for the
  // generation.
  const generatingRef = useRef<string | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!groupId) return;

    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }

    const { data } = await supabase
      .from('tea_sessions')
      .select('id, group_id, started_by, started_at, ended_by, ended_at, status, report')
      .eq('group_id', groupId)
      .in('status', BANNER_STATUSES)
      .order('started_at', { ascending: false })
      .limit(1);

    const row = ((data ?? []) as TeaRow[])[0];
    if (!row) {
      setSession(null);
      setLoading(false);
      return;
    }

    // A completed or failed report only stays on the chat banner for 5 minutes
    // after the tea session ended.
    const isFinished = row.status === 'completed' || row.status === 'failed';
    if (isFinished) {
      const endedTime = row.ended_at
        ? new Date(row.ended_at).getTime()
        : new Date(row.started_at).getTime();
      const elapsed = Date.now() - endedTime;
      const remaining = TEA_REPORT_BANNER_DURATION_MS - elapsed;

      if (remaining <= 0) {
        setSession(null);
        setLoading(false);
        return;
      }

      expiryTimerRef.current = setTimeout(() => {
        setSession(null);
      }, remaining);
    }

    let startedByName = 'someone';
    if (row.started_by) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', row.started_by)
        .maybeSingle();
      startedByName = (profile as { display_name?: string } | null)?.display_name ?? 'someone';
    }

    setSession({
      id: row.id,
      groupId: row.group_id,
      startedBy: row.started_by,
      startedByName,
      startedAt: row.started_at,
      endedBy: row.ended_by,
      endedAt: row.ended_at,
      status: row.status,
      report: row.report,
    });
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
    return () => {
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }
    };
  }, [load]);

  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`tea-${groupId}-${channelId.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tea_sessions', filter: `group_id=eq.${groupId}` },
        () => load()
      )
      .subscribe(onChannelStatus('tea'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, load]);

  /**
   * Asks the server to write the report for a session. Safe to call again on
   * a failed session — the operation regenerates from the same session id and
   * overwrites its own row, so a retry never forks a second Tea.
   */
  const generateReport = useCallback(
    async (sessionId: string) => {
      if (generatingRef.current === sessionId) return;
      generatingRef.current = sessionId;

      await invokeGCAI<TeaReportResult>(groupId, 'tea_report', { teaSessionId: sessionId });

      generatingRef.current = null;
      // The row moved to completed or failed server-side either way; reload
      // to pick up whichever it was.
      await load();
    },
    [groupId, load]
  );

  const startTea = useCallback(async () => {
    const { error } = await supabase.rpc('start_tea', { p_group_id: groupId });
    // The realtime INSERT will bring the session in; reload anyway so the
    // starter never waits on a round trip they already initiated.
    if (!error) await load();
    return !error;
  }, [groupId, load]);

  const endTea = useCallback(async () => {
    if (!session) return false;
    // The RPC re-checks permission in the database — the UI gate below is a
    // courtesy, this is the rule.
    const { error } = await supabase.rpc('end_tea', { p_session_id: session.id });
    if (error) return false;

    await load();
    generateReport(session.id);
    return true;
  }, [session, load, generateReport]);

  const retryReport = useCallback(() => {
    if (session) generateReport(session.id);
  }, [session, generateReport]);

  const isActive = session?.status === 'active';
  const canEnd =
    !!session && isActive && !!userId && (session.startedBy === userId || !!canModerate);

  return { session, loading, isActive, canEnd, startTea, endTea, retryReport, refresh: load };
}
