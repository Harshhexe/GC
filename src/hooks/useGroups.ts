import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase';
import { onChannelStatus } from '../lib/realtime';
import { useAuth } from '../context/AuthContext';
import { Group, MediaType } from '../types';
import { describeMedia } from '../lib/media';

/** A media-only last message has empty `text` — fall back to "📷 Photo" /
 *  "🎥 Video" / the filename so the group card isn't blank. */
function previewFor(text: string | null | undefined, mediaType: MediaType | null | undefined) {
  if (text) return text;
  if (!mediaType) return null;
  const { label } = describeMedia(mediaType, null);
  const emojiMap: Record<string, string> = {
    image: '📷',
    gif: '🎞️',
    video: '🎥',
    file: '📄',
    voice: '🎙️',
    sticker: '🏷️',
  };
  const emoji = emojiMap[mediaType] ?? '📎';
  return `${emoji} ${label}`;
}

/**
 * @param realtime Subscribe to live updates. Bottom-tab screens stay mounted,
 * so several of them can hold this hook at once — only the list that actually
 * displays incoming messages needs a channel. The others would just burn
 * realtime quota, and a second subscriber on a shared channel name throws
 * ("cannot add postgres_changes callbacks after subscribe()").
 */
export function useGroups({ realtime = true }: { realtime?: boolean } = {}) {
  const { session } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  // Unique per hook instance so two subscribers never collide on one channel.
  const channelId = useRef(Math.random().toString(36).slice(2, 10));
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const fetchGroups = useCallback(async () => {
    if (!session?.user?.id) {
      setGroups([]);
      setLoading(false);
      return;
    }

    try {
      const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', session.user.id);

      const groupIds = (memberships ?? []).map((m) => m.group_id);
      if (groupIds.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      const { data: groupRows } = await supabase
        .from('groups')
        .select('id, name, emoji, avatar_url, theme, created_at')
        .in('id', groupIds);

      const enriched = await Promise.all(
        (groupRows ?? []).map(async (g) => {
          const [{ data: lastMsg }, { count }] = await Promise.all([
            supabase
              .from('messages')
              .select('text, created_at, author_id, media_type')
              .eq('group_id', g.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('group_members')
              .select('user_id', { count: 'exact', head: true })
              .eq('group_id', g.id),
          ]);

          const group: Group = {
            id: g.id,
            name: g.name,
            emoji: g.emoji,
            avatarUrl: g.avatar_url,
            theme: g.theme,
            memberCount: count ?? 0,
            lastMessage: previewFor(lastMsg?.text, lastMsg?.media_type as MediaType | null) ?? undefined,
            lastMessageAt: lastMsg?.created_at ?? g.created_at,
            lastMessageAuthorId: lastMsg?.author_id,
            unreadCount: 0,
          };
          return group;
        })
      );

      // Resolve the last sender's name once for the whole list rather than
      // per row, so N groups cost one extra query instead of N.
      const authorIds = Array.from(
        new Set(enriched.map((g) => g.lastMessageAuthorId).filter(Boolean) as string[])
      );
      if (authorIds.length > 0) {
        const { data: authors } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', authorIds);

        const nameById = new Map((authors ?? []).map((a) => [a.id, a.display_name]));
        for (const g of enriched) {
          if (!g.lastMessageAuthorId) continue;
          g.lastMessageAuthor =
            g.lastMessageAuthorId === session.user.id
              ? 'You'
              : nameById.get(g.lastMessageAuthorId) ?? 'someone';
        }
      }

      // Every unread count in a single round trip (see unread_counts() in
      // supabase/unread_tracking.sql) rather than one query per group.
      const { data: unreadRows } = await supabase.rpc('unread_counts');
      if (unreadRows) {
        const unreadById = new Map(
          (unreadRows as { group_id: string; unread: number }[]).map((r) => [
            r.group_id,
            Number(r.unread) || 0,
          ])
        );
        for (const g of enriched) g.unreadCount = unreadById.get(g.id) ?? 0;
      }

      enriched.sort(
        (a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime()
      );

      setGroups(enriched);
    } catch (e) {
      console.warn('[useGroups] failed to fetch groups:', e);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  /**
   * Re-fetch on resume, for the same reason useMessages does: the realtime
   * socket dies while backgrounded, and GroupListScreen's useFocusEffect only
   * covers *navigation* focus — it never fires if the app was backgrounded
   * while already sitting on the list.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && appStateRef.current !== 'active') {
        fetchGroups();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [fetchGroups]);

  // Sorted and joined so this is a *value*, not an identity: fetchGroups
  // replaces the groups array on every refetch, and depending on the array
  // itself would tear the channel down and rebuild it several times a minute.
  const groupIdsKey = groups
    .map((g) => g.id)
    .sort()
    .join(',');

  useEffect(() => {
    if (!session?.user || !realtime) return;

    // Realtime already withholds rows RLS won't let this user read, so these
    // filters aren't what keeps other people's groups out. They spare the
    // Realtime server an RLS evaluation per subscriber per insert, which is
    // the part that actually costs something as the group gets chattier.
    const ids = groupIdsKey ? groupIdsKey.split(',') : [];
    const inFilter = ids.length > 0 ? `in.(${ids.join(',')})` : null;

    // The group list only shows each group's latest message, so N messages
    // arriving in a burst need one refetch, not N. Without this, an active
    // conversation re-ran the whole list query on every single message.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleFetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fetchGroups();
      }, 250);
    };

    let channel = supabase.channel(`group-list-${channelId.current}`);

    if (inFilter) {
      channel = channel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=${inFilter}` },
          scheduleFetch
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'groups', filter: `id=${inFilter}` },
          scheduleFetch
        );
    }

    // Unfiltered by group on purpose — this is how a *new* group first
    // appears, so it cannot be scoped to the ones already known.
    channel = channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'group_members',
        filter: `user_id=eq.${session.user.id}`,
      },
      scheduleFetch
    );

    channel.subscribe(onChannelStatus('group-list'));

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, fetchGroups, realtime, groupIdsKey]);

  return { groups, loading, refetch: fetchGroups };
}
