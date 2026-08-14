import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { MissedCategory, MissedHighlight } from '../lib/ai';

export type MissedRecapEntry = {
  id: string;
  headline: string;
  summary: string;
  highlights: MissedHighlight[];
  truncated: boolean;
  messageCount: number;
  createdAt: string;
};

type RecapRow = {
  id: string;
  headline: string;
  summary: string;
  highlights: unknown;
  truncated: boolean;
  message_count: number;
  created_at: string;
};

function isMissedCategory(value: unknown): value is MissedCategory {
  return (
    typeof value === 'string' &&
    ['tea', 'plan', 'info', 'funny', 'convo', 'pinned', 'mention'].includes(value)
  );
}

/** Defensive parse — this is our own stored output, but jsonb is untyped at the wire. */
function parseHighlights(raw: unknown): MissedHighlight[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (h): h is MissedHighlight =>
      h &&
      typeof h === 'object' &&
      isMissedCategory((h as MissedHighlight).category) &&
      typeof (h as MissedHighlight).title === 'string' &&
      typeof (h as MissedHighlight).summary === 'string' &&
      Array.isArray((h as MissedHighlight).messageIds)
  );
}

/**
 * Reads the caller's own persisted "What Did I Miss?" recaps for a group.
 *
 * Straight to Postgres, RLS-scoped to `user_id = auth.uid()` — reading your
 * own past AI output doesn't need the edge function, a provider call, or a
 * membership check. Each row was written by the server the moment it
 * generated a genuinely new recap, so this is a plain append-only log: the
 * screen renders newest first and lets old entries fall off after 24h
 * (enforced by the server's prune-on-insert, not filtered here).
 */
export function useMissedRecapHistory(groupId: string) {
  const [entries, setEntries] = useState<MissedRecapEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('ai_recap_history')
      .select('id, headline, summary, highlights, truncated, message_count, created_at')
      .eq('group_id', groupId)
      .eq('operation', 'what_did_i_miss')
      .order('created_at', { ascending: false });

    if (error) {
      // Read-only convenience data — a failed fetch just means an empty
      // stack, not a broken screen. The AI check below still runs.
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as RecapRow[];
    setEntries(
      rows.map((r) => ({
        id: r.id,
        headline: r.headline,
        summary: r.summary,
        highlights: parseHighlights(r.highlights),
        truncated: r.truncated,
        messageCount: r.message_count,
        createdAt: r.created_at,
      }))
    );
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  return { entries, loading, refresh };
}
