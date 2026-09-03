import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { onChannelStatus } from '../lib/realtime';

export type NotificationItem = {
  id: string;
  kind: 'mention' | 'mention_everyone' | 'private_comment';
  groupId: string;
  groupName: string;
  messageId: string;
  messageText: string;
  messageDeleted: boolean;
  actorId: string | null;
  actorName: string;
  actorEmoji: string;
  actorColor: string;
  actorAvatarUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

const PAGE_SIZE = 40;

/**
 * Notifications for the signed-in user — one row per mention (deduped and
 * diffed server-side by the messages triggers, see supabase/mentions.sql).
 * The list itself stays lightweight: it joins in just enough (group name,
 * actor name, message snippet) to render, not full profile/message objects.
 */
export function useNotifications(userId: string | undefined) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const channelId = useRef(Math.random().toString(36).slice(2, 10));

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: rows } = await supabase
      .from('notifications')
      .select('id, kind, group_id, message_id, actor_id, read_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    const rowsSafe = rows ?? [];
    const groupIds = Array.from(new Set(rowsSafe.map((r) => r.group_id)));
    const messageIds = Array.from(new Set(rowsSafe.map((r) => r.message_id)));
    const actorIds = Array.from(
      new Set(rowsSafe.map((r) => r.actor_id).filter((id): id is string => !!id))
    );

    const [{ data: groups }, { data: msgs }, { data: actors }] = await Promise.all([
      groupIds.length
        ? supabase.from('groups').select('id, name').in('id', groupIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      messageIds.length
        ? supabase.from('messages').select('id, text, is_deleted').in('id', messageIds)
        : Promise.resolve({ data: [] as { id: string; text: string; is_deleted: boolean }[] }),
      actorIds.length
        ? supabase.from('profiles').select('id, display_name, avatar_emoji, avatar_color, avatar_url').in('id', actorIds)
        : Promise.resolve({ data: [] as { id: string; display_name: string; avatar_emoji: string; avatar_color: string; avatar_url: string | null }[] }),
    ]);

    const groupById = new Map((groups ?? []).map((g) => [g.id, g.name]));
    const msgById = new Map((msgs ?? []).map((m) => [m.id, m]));
    const actorById = new Map((actors ?? []).map((a) => [a.id, a]));

    setItems(
      rowsSafe.map((r) => {
        const msg = msgById.get(r.message_id);
        const actor = r.actor_id ? actorById.get(r.actor_id) : undefined;
        return {
          id: r.id,
          kind: r.kind as NotificationItem['kind'],
          groupId: r.group_id,
          groupName: groupById.get(r.group_id) ?? 'a GC',
          messageId: r.message_id,
          messageText: msg?.is_deleted ? '' : msg?.text ?? '',
          messageDeleted: msg?.is_deleted ?? false,
          actorId: r.actor_id,
          actorName: actor?.display_name ?? 'someone',
          actorEmoji: actor?.avatar_emoji ?? '👤',
          actorColor: actor?.avatar_color ?? '#B98CFF',
          actorAvatarUrl: actor?.avatar_url ?? null,
          readAt: r.read_at,
          createdAt: r.created_at,
        };
      })
    );
    setUnreadCount(rowsSafe.filter((r) => !r.read_at).length);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}-${channelId.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => load()
      )
      .subscribe(onChannelStatus('notifications'));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .is('read_at', null);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })));
    setUnreadCount(0);
    await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('user_id', userId)
      .is('read_at', null);
  }, [userId]);

  return { items, unreadCount, loading, markRead, markAllRead, refetch: load };
}
