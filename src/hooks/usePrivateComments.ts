import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { onChannelStatus } from '../lib/realtime';
import { useAuth } from '../context/AuthContext';
import {
  PRIVATE_COMMENT_COLUMNS,
  toPrivateComment,
  type PrivateComment,
  type PrivateCommentRow,
} from '../lib/privateComments';

/**
 * Every private comment on one message that this viewer is allowed to see.
 *
 * The query has no `where author = me or recipient = me` clause on purpose —
 * RLS already restricts the rows, and duplicating the rule here would create a
 * second place for it to drift. What comes back is exactly this viewer's
 * threads, which is also why the counts derived from it are correctly scoped
 * per person without any extra work.
 */
export function usePrivateComments(messageId: string | null) {
  const { session } = useAuth();
  const myId = session?.user.id ?? '';
  const [comments, setComments] = useState<PrivateComment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!messageId) {
      setComments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('private_comments')
      .select(PRIVATE_COMMENT_COLUMNS)
      .eq('message_id', messageId)
      .order('created_at', { ascending: true });
    setComments(((data ?? []) as PrivateCommentRow[]).map(toPrivateComment));
    setLoading(false);
  }, [messageId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime is scoped to this message; RLS still decides per subscriber, so a
  // non-participant's socket simply never receives these rows.
  useEffect(() => {
    if (!messageId || !myId) return;
    const channel = supabase
      .channel(`pc-${messageId}-${Math.random().toString(36).slice(2, 7)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'private_comments',
          filter: `message_id=eq.${messageId}`,
        },
        () => load()
      )
      .subscribe(onChannelStatus('private-comments'));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId, myId, load]);

  /**
   * Grouped into conversations. A message's author can hold several separate
   * threads on the same message (one per person who commented); everyone else
   * only ever has the single thread they are part of.
   */
  const threads = useMemo(() => {
    const byThread = new Map<string, PrivateComment[]>();
    for (const c of comments) {
      const list = byThread.get(c.threadUserId) ?? [];
      list.push(c);
      byThread.set(c.threadUserId, list);
    }
    return Array.from(byThread.entries()).map(([threadUserId, items]) => ({
      threadUserId,
      comments: items,
      lastAt: items[items.length - 1]?.createdAt ?? '',
    }));
  }, [comments]);

  return { comments, threads, loading, reload: load };
}

/**
 * messageId -> how many private comments this viewer may see on it.
 *
 * Used for the small lock indicator under a bubble. Because RLS filters the
 * rows, the count is already per-viewer: the message's author sees the total
 * across their threads, a commenter sees only their own, and everyone else
 * gets no row at all and therefore no indicator.
 */
export function usePrivateCommentCounts(groupId: string) {
  const { session } = useAuth();
  const myId = session?.user.id ?? '';
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const groupRef = useRef(groupId);
  groupRef.current = groupId;

  const load = useCallback(async () => {
    if (!groupId || !myId) return;
    const { data } = await supabase
      .from('private_comments')
      .select('message_id, deleted_at')
      .eq('group_id', groupId);

    const next = new Map<string, number>();
    for (const row of (data ?? []) as { message_id: string; deleted_at: string | null }[]) {
      if (row.deleted_at) continue;
      next.set(row.message_id, (next.get(row.message_id) ?? 0) + 1);
    }
    setCounts(next);
  }, [groupId, myId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!groupId || !myId) return;
    const channel = supabase
      .channel(`pc-count-${groupId}-${Math.random().toString(36).slice(2, 7)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'private_comments', filter: `group_id=eq.${groupId}` },
        () => load()
      )
      .subscribe(onChannelStatus('private-comment-counts'));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, myId, load]);

  return counts;
}

/**
 * Private comments addressed to me across a group, newest first — the
 * "commented on your message" items for What Did I Miss.
 */
export function usePrivateCommentsForMe(groupId: string, since?: string | null) {
  const { session } = useAuth();
  const myId = session?.user.id ?? '';
  const [items, setItems] = useState<PrivateComment[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!groupId || !myId) return;
      let q = supabase
        .from('private_comments')
        .select(PRIVATE_COMMENT_COLUMNS)
        .eq('group_id', groupId)
        .eq('recipient_id', myId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(30);
      if (since) q = q.gte('created_at', since);
      const { data } = await q;
      if (!cancelled) {
        setItems(((data ?? []) as PrivateCommentRow[]).map(toPrivateComment));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, myId, since]);

  return items;
}
