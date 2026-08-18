import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** One mark per letter: green / yellow / absent. */
export type WordleMark = 'g' | 'y' | 'x';

export type WordleAttempt = { guess: string; result: string };

export type WordleState = {
  puzzleId: string;
  puzzleDate: string;
  attempts: WordleAttempt[];
  attemptCount: number;
  solved: boolean;
  finished: boolean;
  /** Null until the game is over — the server refuses to send it earlier. */
  answer: string | null;
};

export type WordleStats = {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  bestStreak: number;
  guessDistribution: Record<string, number>;
};

export type WordleGroupResult = {
  user_id: string;
  display_name: string;
  avatar_emoji: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  attempts: number;
  solved: boolean;
  /** Colour patterns only. The words they typed are never sent. */
  patterns: string[];
};

/** Why a guess bounced. `not_a_word` is the only one worth a message. */
export type GuessRejection = 'not_a_word' | 'malformed' | 'finished' | 'error';

export const WORD_LENGTH = 5;
export const MAX_ATTEMPTS = 6;

/**
 * Today's Wordle, for the signed-in user.
 *
 * Every rule lives in Postgres — this hook submits a five-letter string and
 * renders whatever comes back. It deliberately keeps no local notion of
 * "correct", "attempts left" or "today", because any of those would be a
 * second source of truth the server would then have to disagree with.
 */
export function useWordle(groupId?: string) {
  const [state, setState] = useState<WordleState | null>(null);
  const [stats, setStats] = useState<WordleStats | null>(null);
  const [groupResults, setGroupResults] = useState<WordleGroupResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    const [{ data: today }, { data: s }] = await Promise.all([
      supabase.rpc('wordle_today'),
      supabase.rpc('wordle_stats'),
    ]);
    if (today) setState(today as WordleState);
    if (s) setStats(s as WordleStats);

    if (groupId) {
      const { data: g } = await supabase.rpc('wordle_group_results', { p_group_id: groupId });
      setGroupResults((g ?? []) as WordleGroupResult[]);
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  // Realtime updates: when another group member plays or guesses, update leaderboard live
  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`wordle_live_${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wordle_attempts' },
        () => {
          refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, refresh]);

  /**
   * Submits a guess. Resolves to null on success, or why it was refused.
   *
   * A rejected guess must not cost an attempt, which is enforced server-side —
   * this just avoids optimistically drawing a row that the server never
   * recorded.
   */
  const submitGuess = useCallback(
    async (guess: string): Promise<GuessRejection | null> => {
      if (submitting) return null;
      setSubmitting(true);
      try {
        const { data, error } = await supabase.rpc('wordle_guess', { p_guess: guess.toLowerCase() });
        if (error || !data) return 'error';

        const res = data as { ok: boolean; reason?: GuessRejection };
        if (!res.ok) return res.reason ?? 'error';

        // Re-read rather than patching local state from the response: the
        // board, the stats and the group leaderboard all move on a win, and
        // one round trip keeps them consistent with each other.
        await refresh();
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [refresh, submitting]
  );

  return { state, stats, groupResults, loading, submitting, submitGuess, refresh };
}

/**
 * Best-known state per letter, for colouring the keyboard.
 *
 * Green beats yellow beats grey — a letter confirmed in place must not be
 * downgraded by a later guess that puts it somewhere wrong.
 */
export function keyboardStateFrom(attempts: WordleAttempt[]): Record<string, WordleMark> {
  const rank: Record<WordleMark, number> = { x: 0, y: 1, g: 2 };
  const best: Record<string, WordleMark> = {};

  for (const attempt of attempts) {
    for (let i = 0; i < attempt.guess.length; i++) {
      const letter = attempt.guess[i].toUpperCase();
      const mark = attempt.result[i] as WordleMark;
      if (!best[letter] || rank[mark] > rank[best[letter]]) best[letter] = mark;
    }
  }
  return best;
}
