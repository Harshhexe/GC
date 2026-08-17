import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { GroupDNA } from '../lib/ai';

export type GroupDNASnapshot = {
  dna: GroupDNA;
  weekStart: string;
  weekEnd: string;
  createdAt: string;
};

/**
 * Reads the group's latest 🧬 DNA snapshot.
 *
 * Straight to Postgres, never through the AI function. DNA is generated once
 * per week as part of the awards run, so opening this screen is a row read —
 * calling Gemini here would mean paying for a fresh personality every time
 * somebody was curious, and would also let the answer change between two
 * people looking at it on the same day.
 *
 * `null` is the ordinary state for a young GC, not an error: the snapshot is
 * only written once the group clears the history threshold, so no row means
 * "still evolving" rather than "something failed".
 */
export function useGroupDNA(groupId: string) {
  const [snapshot, setSnapshot] = useState<GroupDNASnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('group_dna')
      .select('dna, week_start, week_end, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      setSnapshot(null);
      setLoading(false);
      return;
    }

    setSnapshot({
      dna: data.dna as GroupDNA,
      weekStart: data.week_start as string,
      weekEnd: data.week_end as string,
      createdAt: data.created_at as string,
    });
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  return { snapshot, loading, refresh: load };
}
