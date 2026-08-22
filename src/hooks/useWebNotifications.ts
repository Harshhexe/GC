import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { onChannelStatus } from '../lib/realtime';
import { showWebNotification } from '../lib/webNotifications';

/**
 * Turns incoming messages into browser notifications on the web build.
 *
 * A separate realtime subscription rather than reusing the native path,
 * because there isn't one to reuse: the native banner listens to
 * expo-notifications foreground events, and expo-notifications does nothing
 * at all on web. This is that missing half.
 *
 * No-ops entirely off web, so it's safe to mount unconditionally.
 */
export function useWebNotifications(
  userId: string | undefined,
  groupIds: string[],
  activeGroupId: string | null,
  onOpenGroup: (groupId: string) => void
) {
  // Held in refs so the handler always reads current values without the
  // subscription tearing down and re-establishing every time you open a
  // different chat — a resubscribe drops messages in the gap.
  const activeRef = useRef(activeGroupId);
  activeRef.current = activeGroupId;
  const groupsRef = useRef(groupIds);
  groupsRef.current = groupIds;
  const openRef = useRef(onOpenGroup);
  openRef.current = onOpenGroup;

  const channelId = useRef(Math.random().toString(36).slice(2, 10));

  // A value rather than the array itself, so opening a chat (which rebuilds
  // groupIds) doesn't resubscribe and drop notifications in the gap. Only an
  // actual change of membership rebuilds the channel.
  const groupIdsKey = [...groupIds].sort().join(',');

  useEffect(() => {
    if (Platform.OS !== 'web' || !userId) return;
    if (!groupIdsKey) return;

    const channel = supabase
      .channel(`web-notify-${channelId.current}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          // Narrowed server-side as well as in the handler below: the check
          // there stays as the honest guard, this just stops the Realtime
          // server evaluating RLS for rooms this tab has no interest in.
          filter: `group_id=in.(${groupIdsKey})`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            group_id: string;
            author_id: string | null;
            text: string | null;
            media_type: string | null;
          };

          if (!row?.group_id) return;
          if (row.author_id === userId) return;
          // Realtime delivers inserts for rows RLS lets us read, but a
          // membership check here keeps it honest if that ever loosens.
          if (!groupsRef.current.includes(row.group_id)) return;
          // Already looking at this conversation — but only while the tab is
          // actually visible. `activeGroupId` is app state, not focus: it
          // stays pointed at the last-open chat while the tab is backgrounded,
          // so without the visibility check a message arriving in that same
          // chat got silently swallowed right when a notification mattered most.
          if (
            activeRef.current === row.group_id &&
            typeof document !== 'undefined' &&
            document.visibilityState === 'visible'
          )
            return;

          const [{ data: group }, { data: author }] = await Promise.all([
            supabase.from('groups').select('name, avatar_url').eq('id', row.group_id).maybeSingle(),
            row.author_id
              ? supabase.from('profiles').select('display_name').eq('id', row.author_id).maybeSingle()
              : Promise.resolve({ data: null }),
          ]);

          const preview =
            row.text?.trim() ||
            (row.media_type ? `sent ${row.media_type === 'image' ? 'a photo' : `a ${row.media_type}`}` : 'sent a message');

          showWebNotification({
            title: group?.name ?? 'GC',
            body: `${author?.display_name ?? 'Someone'}: ${preview}`,
            // One live notification per group, replaced rather than stacked.
            tag: row.group_id,
            // Same treatment as the Web Push path (see public/sw.js): the
            // GC's own avatar, falling back to the app icon.
            icon: group?.avatar_url ?? undefined,
            onClick: () => openRef.current(row.group_id),
          });
        }
      )
      .subscribe(onChannelStatus('web-notify'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, groupIdsKey]);
}
