import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase';
import { onChannelStatus } from '../lib/realtime';
import type { PinnedMessage } from '../types';

type PinnedRow = { message_id: string; group_id: string; pinned_by: string | null; pinned_at: string };

/**
 * Pinned messages are a thin pointer table (messageId + who + when) joined
 * against the real `messages`/`profiles` rows here — never a copy of the
 * message itself, so edits/deletes to the original stay the single source
 * of truth. Newest pin first.
 */
export function usePinnedMessages(groupId: string) {
  const [pins, setPins] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const channelId = useRef(Math.random().toString(36).slice(2, 10));
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const load = useCallback(async () => {
    if (!groupId) return;
    const { data: rows } = await supabase
      .from('pinned_messages')
      .select('message_id, group_id, pinned_by, pinned_at')
      .eq('group_id', groupId)
      .order('pinned_at', { ascending: false });

    const pinRows = (rows ?? []) as PinnedRow[];
    if (pinRows.length === 0) {
      setPins([]);
      setLoading(false);
      return;
    }

    const messageIds = pinRows.map((r) => r.message_id);
    const pinnerIds = Array.from(new Set(pinRows.map((r) => r.pinned_by).filter(Boolean) as string[]));

    const [{ data: messageRows }, { data: pinnerRows }] = await Promise.all([
      supabase
        .from('messages')
        .select(
          'id, author_id, text, is_deleted, media_type, media_name, created_at'
        )
        .in('id', messageIds),
      pinnerIds.length > 0
        ? supabase.from('profiles').select('id, display_name').in('id', pinnerIds)
        : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    ]);

    const authorIds = Array.from(
      new Set((messageRows ?? []).map((m) => m.author_id).filter(Boolean) as string[])
    );
    const { data: authorRows } = authorIds.length > 0
      ? await supabase.from('profiles').select('id, display_name').in('id', authorIds)
      : { data: [] as { id: string; display_name: string }[] };

    const messageById = new Map((messageRows ?? []).map((m) => [m.id, m]));
    const authorNameById = new Map((authorRows ?? []).map((p) => [p.id, p.display_name]));
    const pinnerNameById = new Map((pinnerRows ?? []).map((p) => [p.id, p.display_name]));

    const built: PinnedMessage[] = pinRows.map((r) => {
      const msg = messageById.get(r.message_id);
      return {
        messageId: r.message_id,
        pinnedBy: r.pinned_by,
        pinnedByName: r.pinned_by ? pinnerNameById.get(r.pinned_by) ?? 'someone' : 'someone',
        pinnedAt: r.pinned_at,
        exists: !!msg && !msg.is_deleted,
        authorName: msg?.author_id ? authorNameById.get(msg.author_id) ?? 'someone' : 'Deleted User',
        text: msg?.is_deleted ? '' : msg?.text ?? '',
        mediaType: msg?.is_deleted ? null : msg?.media_type ?? null,
        mediaName: msg?.is_deleted ? null : msg?.media_name ?? null,
        messageCreatedAt: msg?.created_at ?? r.pinned_at,
      };
    });

    setPins(built);
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && appStateRef.current !== 'active') {
        load();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [load]);

  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`pinned-${groupId}-${channelId.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pinned_messages', filter: `group_id=eq.${groupId}` },
        () => load()
      )
      .subscribe(onChannelStatus('pinned'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, load]);

  const pin = useCallback(
    async (messageId: string, userId: string) => {
      setPins((prev) => [
        {
          messageId,
          pinnedBy: userId,
          pinnedByName: 'You',
          pinnedAt: new Date().toISOString(),
          exists: true,
          authorName: 'someone',
          text: '',
          mediaType: null,
          mediaName: null,
          messageCreatedAt: new Date().toISOString(),
        },
        ...prev.filter((p) => p.messageId !== messageId),
      ]);
      await supabase
        .from('pinned_messages')
        .insert({ message_id: messageId, group_id: groupId, pinned_by: userId });
      void load();
    },
    [groupId, load]
  );

  const unpin = useCallback(
    async (messageId: string) => {
      setPins((prev) => prev.filter((p) => p.messageId !== messageId));
      await supabase.from('pinned_messages').delete().eq('message_id', messageId);
      void load();
    },
    [load]
  );

  const isPinned = useCallback((messageId: string) => pins.some((p) => p.messageId === messageId), [pins]);

  return { pins, loading, pin, unpin, isPinned, refetch: load };
}
