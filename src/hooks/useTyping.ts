import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const TYPING_TTL_MS = 3000; // how long a keystroke keeps you "cooking"
const SEND_THROTTLE_MS = 1200; // don't broadcast on every keystroke

/**
 * Typing presence over Supabase Realtime *broadcast* — deliberately not the
 * database. Typing is ephemeral noise; writing it to Postgres would burn rows
 * and realtime quota for something nobody needs to persist.
 */
export function useTyping(groupId: string, myId: string, myName: string) {
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const seenRef = useRef<Map<string, { name: string; at: number }>>(new Map());
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!groupId || !myId) return;

    function flush() {
      const now = Date.now();
      const alive: string[] = [];
      for (const [uid, entry] of seenRef.current) {
        if (now - entry.at > TYPING_TTL_MS) seenRef.current.delete(uid);
        else alive.push(entry.name);
      }
      setTypingNames((prev) => (prev.join('|') === alive.join('|') ? prev : alive));
    }

    const channel = supabase
      .channel(`typing-${groupId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload?.userId || payload.userId === myId) return;
        seenRef.current.set(payload.userId, { name: payload.name ?? 'someone', at: Date.now() });
        flush();
      })
      .subscribe();

    channelRef.current = channel;
    const interval = setInterval(flush, 1000);

    return () => {
      clearInterval(interval);
      seenRef.current.clear();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [groupId, myId]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSentRef.current < SEND_THROTTLE_MS) return;
    lastSentRef.current = now;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: myId, name: myName },
    });
  }, [myId, myName]);

  return { typingNames, notifyTyping };
}
