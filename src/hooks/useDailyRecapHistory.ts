import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { DailyRecapResult } from '../lib/ai';

type DailyRecapRow = {
  recap_date: string;
  total_messages: number;
  truncated: boolean;
  user_of_the_day: DailyRecapResult['userOfTheDay'];
  message_of_the_day: DailyRecapResult['messageOfTheDay'];
  one_word: string;
  best_tea: DailyRecapResult['bestTea'];
  most_unhinged: DailyRecapResult['mostUnhinged'];
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

/**
 * Every daily recap this group has ever had, newest first.
 *
 * Unlike the chat feed's inline card (which only shows for an hour) or the
 * personal `ai_recap_history` stack (which ages out after 24h), a day that
 * already happened is a permanent fact — there's no reason for it to stop
 * being reachable, just to stop being the first thing you see.
 */
export function useDailyRecapHistory(groupId: string) {
  const [entries, setEntries] = useState<DailyRecapResult[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('daily_recaps')
      .select(
        'recap_date, total_messages, truncated, user_of_the_day, message_of_the_day, one_word, best_tea, most_unhinged'
      )
      .eq('group_id', groupId)
      .order('recap_date', { ascending: false });

    setEntries(((data ?? []) as DailyRecapRow[]).map(fromRow));
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  return { entries, loading, refresh };
}
