import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { onChannelStatus } from '../lib/realtime';
import { useAuth } from '../context/AuthContext';
import { POLL_COLUMNS, castVote, pollFromRow, type Poll } from '../lib/polls';

/**
 * Every poll in a group, with live vote counts.
 *
 * Counts arrive by subscribing to `polls` rather than `poll_votes`, which is
 * what lets anonymous polls still update live: the realtime payload is the
 * poll row — question, options, `vote_counts` — and never contains a voter.
 * A subscription to the votes table would stream user ids to everyone.
 *
 * (The trigger in supabase/polls.sql recomputes `vote_counts` on every vote,
 * so an UPDATE lands here for free whenever anyone votes.)
 */
export function usePolls(groupId: string) {
  const { session } = useAuth();
  const myId = session?.user.id;
  const [polls, setPolls] = useState<Map<string, Poll>>(new Map());
  const [myVotes, setMyVotes] = useState<Map<string, string[]>>(new Map());
  const channelId = useRef(Math.random().toString(36).slice(2, 10));

  const load = useCallback(async () => {
    if (!groupId) return;
    const { data } = await supabase.from('polls').select(POLL_COLUMNS).eq('group_id', groupId);
    const rows = (data ?? []).map((r) => pollFromRow(r as never));
    setPolls(new Map(rows.map((p) => [p.id, p])));

    if (rows.length > 0 && myId) {
      // One call for every poll on screen rather than per card — a chat with
      // twenty polls shouldn't open twenty round trips.
      const { data: mine } = await supabase.rpc('poll_my_votes', {
        p_poll_ids: rows.map((p) => p.id),
      });
      const map = new Map<string, string[]>();
      for (const [pollId, opts] of Object.entries((mine ?? {}) as Record<string, string[]>)) {
        map.set(pollId, opts);
      }
      setMyVotes(map);
    }
  }, [groupId, myId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!groupId) return;

    const channel = supabase
      .channel(`polls-${groupId}-${channelId.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'polls', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row?.id) return;
          const poll = pollFromRow(row as never);
          setPolls((prev) => {
            const next = new Map(prev);
            next.set(poll.id, poll);
            return next;
          });
        }
      )
      .subscribe(onChannelStatus('polls'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  /**
   * Votes, with the selection applied locally first so the tap feels
   * instant. The server's recount arrives over realtime moments later and
   * replaces it — and on failure the optimistic state is rolled back rather
   * than left showing a vote that was refused.
   */
  const vote = useCallback(
    async (pollId: string, optionIds: string[]) => {
      const previous = myVotes.get(pollId) ?? [];
      setMyVotes((prev) => new Map(prev).set(pollId, optionIds));

      const { error } = await castVote(pollId, optionIds);
      if (error) {
        setMyVotes((prev) => new Map(prev).set(pollId, previous));
        return error;
      }
      // Counts come back over realtime, but refresh this poll directly too:
      // your own vote landing shouldn't depend on a websocket round trip.
      const { data } = await supabase
        .from('polls')
        .select(POLL_COLUMNS)
        .eq('id', pollId)
        .maybeSingle();
      if (data) {
        const poll = pollFromRow(data as never);
        setPolls((prev) => new Map(prev).set(poll.id, poll));
      }
      return null;
    },
    [myVotes]
  );

  return { polls, myVotes, vote, refresh: load };
}
