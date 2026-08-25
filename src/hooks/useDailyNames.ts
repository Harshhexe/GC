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
 * Today's GC names — one AI-chosen title per member, generated automatically
 * from what they said yesterday (12:00 AM midnight closed window).
 *
 * Reads `daily_gc_names` first (fast, free RLS table read). If missing,
 * automatically generates the day's names in the background so that both
 * the GC Names screen and chat bubbles display them automatically.
 */
export function useDailyNames(
  groupId: string,
  options: { autoGenerate?: boolean } = { autoGenerate: true }
) {
  const [result, setResult] = useState<DailyNamesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<AIError | null>(null);
  /** Stops multiple simultaneous triggers for the same day */
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
    if (generating) return;
    setGenerating(true);
    setError(null);
    const { date, from, to } = yesterdayBounds();
    const res = await invokeGCAI<DailyNamesResult>(groupId, 'daily_names', { date, from, to });
    if (res.ok) {
      // Read stored row back so members converge on the first saved generation
      const stored = await readStored();
      setResult(stored ?? res.result);
    } else {
      setError(res.error);
    }
    setGenerating(false);
  }, [groupId, generating, readStored]);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const stored = await readStored();
      if (cancelled) return;
      if (stored) {
        setResult(stored);
        setLoading(false);
      } else {
        setLoading(false);
        // Automatically generate in background if not already stored
        if (options.autoGenerate !== false && !askedRef.current) {
          askedRef.current = true;
          generate();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, readStored, generate, options.autoGenerate]);

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

/**
 * Keyed daily names by user ID for showing beside senders in the chat bubbles.
 * Automatically synchronizes with useDailyNames.
 */
export function useDailyNameMap(groupId: string) {
  const { result } = useDailyNames(groupId, { autoGenerate: true });
  const [byUser, setByUser] = useState<Map<string, DailyName>>(new Map());

  useEffect(() => {
    if (result?.names) {
      setByUser(new Map(result.names.map((n) => [n.userId, n])));
    }
  }, [result]);

  return byUser;
}
