import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { invokeGCAI, type DailyRecapResult } from '../lib/ai';
import { yesterdayBounds } from '../utils/time';

type DailyRecapRow = {
  recap_date: string;
  total_messages: number;
  truncated: boolean;
  user_of_the_day: DailyRecapResult['userOfTheDay'];
  message_of_the_day: DailyRecapResult['messageOfTheDay'];
  one_word: string;
  best_tea: DailyRecapResult['bestTea'];
  most_unhinged: DailyRecapResult['mostUnhinged'];
  created_at: string;
};

function fromRow(row: DailyRecapRow): DailyRecapResult {
  return {
    date: row.recap_date,
    totalMessages: row.total_messages,
    truncated: row.truncated,
    userOfTheDay: row.user_of_the_day,
    messageOfTheDay: row.message_of_the_day,
    oneWord: row.one_word,
    bestTea: row.best_tea,
    mostUnhinged: row.most_unhinged,
  };
}

/** How long the recap stays woven into the live chat feed before it's only
 *  reachable from the Recaps list. A card that never went away would just be
 *  clutter by the afternoon. */
const INLINE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Yesterday's recap card — the same one every member of the group sees.
 *
 * Reads `daily_recaps` directly first (a plain RLS-scoped table read, free
 * and instant): if someone else already triggered generation for this date,
 * that's the common case after the first person opens the chat post-midnight,
 * and everyone after them just reads the stored row. Only calls the edge
 * function — which does cost a model call — when that read comes up empty.
 *
 * Deliberately quiet on failure: a missing recap is not worth an error state
 * cluttering the chat screen, so this only ever produces a recap or nothing.
 */
export function useDailyRecap(groupId: string) {
  const [recap, setRecap] = useState<DailyRecapResult | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  // The exact local-midnight boundary the recap covers up to — precise where
  // reconstructing it from just the date string wouldn't be for any timezone
  // ahead of UTC. This is what the chat screen sorts the inline card by.
  const [boundary, setBoundary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!groupId || startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    const { date, from, to } = yesterdayBounds();
    setBoundary(to);

    (async () => {
      const { data } = await supabase
        .from('daily_recaps')
        .select(
          'recap_date, total_messages, truncated, user_of_the_day, message_of_the_day, one_word, best_tea, most_unhinged, created_at'
        )
        .eq('group_id', groupId)
        .eq('recap_date', date)
        .maybeSingle();

      if (cancelled) return;

      if (data) {
        const row = data as DailyRecapRow;
        setRecap(fromRow(row));
        setGeneratedAt(row.created_at);
        setLoading(false);
        return;
      }

      // Nothing stored yet — this is the first person to open the chat since
      // midnight for this group. Generate it once; a race with another member
      // doing the same thing is resolved server-side by the unique constraint.
      const requestedAt = new Date().toISOString();
      const response = await invokeGCAI<DailyRecapResult>(groupId, 'daily_recap', {
        date,
        from,
        to,
      });

      if (cancelled) return;
      setLoading(false);
      if (response.ok) {
        setRecap(response.result);
        // Not the row's real `created_at` (the response doesn't carry it back),
        // but within a second or two of it — close enough for a client-side
        // "is this still worth showing inline" check.
        setGeneratedAt(requestedAt);
      }
      // A failure here just means no card today — not worth surfacing.
    })();

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const showInline = !!recap && !!generatedAt && Date.now() - new Date(generatedAt).getTime() < INLINE_WINDOW_MS;

  return { recap, loading, showInline, boundary };
}
