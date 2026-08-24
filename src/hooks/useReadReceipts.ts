import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { onChannelStatus } from '../lib/realtime';
import { Message } from '../types';

export type Reader = {
  id: string;
  displayName: string;
  avatarEmoji: string;
  avatarColor: string;
  avatarUrl: string | null;
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
      .select('id, display_name, avatar_emoji, avatar_color, avatar_url')
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
          avatarUrl: p?.avatar_url ?? null,
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
          event: '*',
          schema: 'public',
          table: 'group_members',
          filter: `group_id=eq.${groupId}`,
        },
        () => load()
      )
      .subscribe(onChannelStatus('reads'));

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
export function useReadersByMessage(
  messages: Message[],
  readers: Reader[],
  myUserId?: string
) {
  return useMemo(() => {
    const map = new Map<string, Reader[]>();
    if (messages.length === 0) return map;

    // Collect all members from readers list + any authors present in messages
    const allReadersMap = new Map<string, Reader>();

    // 1. Add known readers from group_members
    for (const r of readers) {
      if (!myUserId || r.id !== myUserId) {
        allReadersMap.set(r.id, r);
      }
    }

    // 2. Discover any message authors from messages (in case group_members hasn't loaded or member has no last_read_at)
    for (const msg of messages) {
      if (msg.authorId && (!myUserId || msg.authorId !== myUserId)) {
        const existing = allReadersMap.get(msg.authorId);
        if (!existing) {
          allReadersMap.set(msg.authorId, {
            id: msg.authorId,
            displayName: msg.authorName || 'someone',
            avatarEmoji: msg.authorEmoji || '👤',
            avatarColor: msg.authorColor || '#d0bcff',
            avatarUrl: msg.authorAvatarUrl || null,
            lastReadAt: msg.createdAt,
          });
        } else {
          // Enrich profile if needed
          if (!existing.avatarUrl && msg.authorAvatarUrl) existing.avatarUrl = msg.authorAvatarUrl;
          if (existing.avatarEmoji === '👤' && msg.authorEmoji) existing.avatarEmoji = msg.authorEmoji;
        }
      }
    }

    const allReaders = Array.from(allReadersMap.values());

    for (const reader of allReaders) {
      // If a member authored a message, they have seen at least up to their own latest message.
      let authoredUntil = 0;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].authorId === reader.id) {
          const t = new Date(messages[i].createdAt).getTime();
          if (!isNaN(t) && t > authoredUntil) {
            authoredUntil = t;
          }
        }
      }

      const rawReadTime = reader.lastReadAt ? new Date(reader.lastReadAt).getTime() : 0;
      const readUntil = Math.max(isNaN(rawReadTime) ? 0 : rawReadTime, authoredUntil);

      if (readUntil <= 0) continue;

      // Messages are ordered oldest → newest, so walk back for the first hit.
      let landedOn: string | null = null;
      for (let i = messages.length - 1; i >= 0; i--) {
        const msgTime = new Date(messages[i].createdAt).getTime();
        if (!isNaN(msgTime) && msgTime <= readUntil) {
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
  }, [messages, readers, myUserId]);
}
