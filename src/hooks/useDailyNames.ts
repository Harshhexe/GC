import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { invokeGCAI, type AIError, type DailyName, type DailyNamesResult } from '../lib/ai';
import { yesterdayBounds } from '../utils/time';

type DailyNamesRow = {
  name_date: string;
  headline: string;
  total_messages: number;
  names: DailyName[];
  created_at: string;
};

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
      .eq('name_date', yesterdayBounds().date)
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
    const { date, from, to } = yesterdayBounds();
    const res = await invokeGCAI<DailyNamesResult>(groupId, 'daily_names', { date, from, to });
    if (res.ok) {
      // Prefer the stored row over the response we just received. If two
      // members opened the tab at the same instant they each generated, and
      // the table's upsert keeps whichever landed first — reading it back is
      // what makes everyone converge on one set of names instead of two
      // people quoting different ones at each other.
      const stored = await readStored();
      setResult(stored ?? res.result);
    } else {
      // A failed generation leaves the day unnamed rather than half-named;
      // the tab shows a retry instead of an empty card that reads as
      // "nobody did anything".
      setError(res.error);
    }
    setGenerating(false);
  }, [groupId, readStored]);

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
