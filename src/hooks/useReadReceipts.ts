import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Message } from '../types';

export type Reader = {
  id: string;
  displayName: string;
  avatarEmoji: string;
  avatarColor: string;
  lastReadAt: string;
};

/**
 * Instagram-style read state: instead of a per-message receipt, each member has
 * one "read up to" stamp, and their avatar sits under the newest message that
 * falls at or before it. Reuses the same `group_members.last_read_at` column
 * the unread badge already maintains — no extra writes, no receipts table.
 */
export function useReadReceipts(groupId: string, myUserId: string | undefined) {
  const [readers, setReaders] = useState<Reader[]>([]);
  const channelId = useRef(Math.random().toString(36).slice(2, 10));

  const load = useCallback(async () => {
    if (!groupId || !myUserId) return;

    const { data: rows } = await supabase
      .from('group_members')
      .select('user_id, last_read_at')
      .eq('group_id', groupId);

    const others = (rows ?? []).filter((r) => r.user_id !== myUserId);
    if (others.length === 0) {
      setReaders([]);
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_emoji, avatar_color')
      .in(
        'id',
        others.map((o) => o.user_id)
      );

    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    setReaders(
      others.map((o) => {
        const p = byId.get(o.user_id);
        return {
          id: o.user_id,
          displayName: p?.display_name ?? 'someone',
          avatarEmoji: p?.avatar_emoji ?? '👤',
          avatarColor: p?.avatar_color ?? '#d0bcff',
          lastReadAt: o.last_read_at,
        };
      })
    );
  }, [groupId, myUserId]);

  useEffect(() => {
    load();
  }, [load]);

  // Someone opening the chat updates their row; that's what moves their avatar.
  useEffect(() => {
    if (!groupId || !myUserId) return;

    const channel = supabase
      .channel(`reads-${groupId}-${channelId.current}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'group_members',
          filter: `group_id=eq.${groupId}`,
        },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, myUserId, load]);

  return readers;
}

/**
 * Bucket each reader under the newest message they've seen.
 * Returns messageId -> readers, so a bubble can render its own avatar row.
 */
export function useReadersByMessage(messages: Message[], readers: Reader[]) {
  return useMemo(() => {
    const map = new Map<string, Reader[]>();
    if (messages.length === 0 || readers.length === 0) return map;

    for (const reader of readers) {
      const readUntil = new Date(reader.lastReadAt).getTime();

      // Messages are ordered oldest → newest, so walk back for the first hit.
      let landedOn: string | null = null;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (new Date(messages[i].createdAt).getTime() <= readUntil) {
          landedOn = messages[i].id;
          break;
        }
      }
      if (!landedOn) continue;

      const list = map.get(landedOn) ?? [];
      list.push(reader);
      map.set(landedOn, list);
    }

    return map;
  }, [messages, readers]);
}
