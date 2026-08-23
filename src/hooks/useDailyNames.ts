import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { invokeGCAI, type AIError, type DailyName, type DailyNamesResult } from '../lib/ai';

type DailyNamesRow = {
  name_date: string;
  headline: string;
  total_messages: number;
  names: DailyName[];
  created_at: string;
};

/** Local calendar date, matching how the day reads to the person looking at
 *  it rather than to UTC. */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Today's GC names — one AI-chosen title per member, from what they said.
 *
 * Reads `daily_gc_names` first, which is a plain RLS-scoped row read and
 * costs nothing. Only when there is no row for today does it call the edge
 * function, so the first person to open the tab pays for the generation and
 * everyone after them reads the identical names. That shared-ness is the
 * point: names the group can argue about only work if everyone sees the same
 * ones.
 *
 * Generation is never automatic. A scheduled nightly run would spend model
 * quota on every group whether anyone was going to look or not, which the
 * ₹0 AI budget does not have room for.
 */
export function useDailyNames(groupId: string) {
  const [result, setResult] = useState<DailyNamesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<AIError | null>(null);
  /** Stops a re-render from firing a second generation for the same day. */
  const askedRef = useRef(false);

  const readStored = useCallback(async (): Promise<DailyNamesResult | null> => {
    const { data } = await supabase
      .from('daily_gc_names')
      .select('name_date, headline, total_messages, names, created_at')
      .eq('group_id', groupId)
      .eq('name_date', todayLocal())
      .maybeSingle();

    if (!data) return null;
    const row = data as DailyNamesRow;
    return {
      date: row.name_date,
      headline: row.headline,
      totalMessages: row.total_messages,
      names: Array.isArray(row.names) ? row.names : [],
    };
  }, [groupId]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    const res = await invokeGCAI<DailyNamesResult>(groupId, 'daily_names');
    if (res.ok) {
      setResult(res.result);
    } else {
      // A failed generation leaves the day unnamed rather than half-named;
      // the tab shows a retry instead of an empty card that looks like
      // "nobody did anything today".
      setError(res.error);
    }
    setGenerating(false);
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const stored = await readStored();
      if (cancelled) return;
      setResult(stored);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, readStored]);

  /** Asks for today's names if nobody has yet. Safe to call repeatedly. */
  const ensure = useCallback(() => {
    if (loading || result || generating || askedRef.current) return;
    askedRef.current = true;
    generate();
  }, [loading, result, generating, generate]);

  const retry = useCallback(() => {
    askedRef.current = true;
    generate();
  }, [generate]);

  return { result, loading, generating, error, ensure, retry };
}
