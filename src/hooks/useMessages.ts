import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { onChannelStatus } from '../lib/realtime';
import { consumeMissedBoundary } from '../lib/readState';
import { useAuth } from '../context/AuthContext';
import { useNetworkStatus } from './useNetworkStatus';
import {
  getCachedMessages,
  saveCachedMessages,
  getOfflineQueue,
  enqueueOfflineMessage,
  dequeueOfflineMessage,
  updateQueuedMessageStatus,
  QueuedMessage,
} from '../lib/offlineQueue';
import { AIShare, MediaType, Mention, MediaViewerProfile, Message, MessageKind, MessageMedia, Reaction, ReplyPreview } from '../types';
import { labelFor } from '../data/reactions';

type ProfileLite = {
  id: string;
  display_name: string;
  avatar_color: string;
  avatar_emoji: string;
  avatar_url: string | null;
};
type ReactionRow = { message_id: string; user_id: string; emoji: string; label: string };
type MessageRow = {
  id: string;
  group_id: string;
  author_id: string | null;
  text: string;
  created_at: string;
  reply_to_message_id: string | null;
  edited_at: string | null;
  is_deleted: boolean;
  deleted_by: string | null;
  mentions: Mention[] | null;
  mention_everyone: boolean;
  is_anonymous?: boolean | null;
  media_url: string | null;
  media_thumb_url: string | null;
  media_type: MediaType | null;
  media_view_once: boolean;
  media_mime: string | null;
  media_name: string | null;
  media_size: number | null;
  media_width: number | null;
  media_height: number | null;
  media_duration_ms: number | null;
  sticker_id: string | null;
  poll_id: string | null;
  ai_share: AIShare | null;
};

const MESSAGE_COLUMNS =
  'id, group_id, author_id, text, created_at, reply_to_message_id, edited_at, is_deleted, deleted_by, mentions, mention_everyone, media_url, media_thumb_url, media_type, media_mime, media_name, media_size, media_width, media_height, media_duration_ms, media_view_once, sticker_id, poll_id, ai_share, is_anonymous';

/** A shared AI answer, but only on a message that still exists — deleting a
 *  shared answer should blank it like any other message, not leave the AI
 *  card rendering under a "message deleted" bubble. */
function aiShareFor(row: MessageRow): AIShare | undefined {
  if (row.is_deleted || !row.ai_share) return undefined;
  const share = row.ai_share;
  if (typeof share.question !== 'string' || typeof share.answer !== 'string') return undefined;
  return {
    question: share.question,
    answer: share.answer,
    sourceMessageIds: Array.isArray(share.sourceMessageIds) ? share.sourceMessageIds : [],
  };
}

function mediaFor(row: MessageRow): MessageMedia | null {
  if (!row.media_url || !row.media_type) return null;
  return {
    url: row.media_url,
    thumbUrl: row.media_thumb_url,
    type: row.media_type,
    mime: row.media_mime ?? '',
    name: row.media_name,
    size: row.media_size,
    width: row.media_width,
    height: row.media_height,
    durationMs: row.media_duration_ms,
    viewOnce: row.media_view_once,
  };
}

/** A moderator takedown, as opposed to the author deleting their own. */
function deletedByAdminFor(row: MessageRow): boolean {
  return !!row.is_deleted && !!row.deleted_by && row.deleted_by !== row.author_id;
}

function kindFor(row: MessageRow): MessageKind {
  // Poll before media: a poll message carries no media_type at all (it has no
  // file, and the media_url_required_with_type constraint would reject one),
  // so without this it would fall through to 'text' and render as an empty
  // bubble. Also what makes a reply preview say "📊 poll" instead of blank.
  if (row.poll_id) return 'poll';
  return row.media_type ?? 'text';
}

const DELETED_AUTHOR = {
  name: 'Deleted User',
  color: '#5C5670',
  emoji: '👻',
} as const;

/** An anonymous message has no author on purpose, which looks identical in the
 *  row to an account that was deleted. They must not render the same: one says
 *  "somebody here chose not to sign this", the other says "this person left". */
const ANONYMOUS_AUTHOR = {
  name: 'Anonymous',
  color: '#9CA3AF',
  emoji: '🎭',
} as const;

function aggregateReactions(rows: ReactionRow[], messageId: string, myUserId: string): Reaction[] {
  const relevant = rows.filter((r) => r.message_id === messageId);
  const byEmoji = new Map<string, Reaction>();
  for (const r of relevant) {
    const existing = byEmoji.get(r.emoji);
    if (existing) {
      existing.count += 1;
      if (r.user_id === myUserId) existing.reactedByMe = true;
    } else {
      byEmoji.set(r.emoji, {
        emoji: r.emoji,
        label: r.label || labelFor(r.emoji),
        count: 1,
        reactedByMe: r.user_id === myUserId,
      });
    }
  }
  return Array.from(byEmoji.values());
}

export function useMessages(groupId: string, options?: { initialLimit?: number }) {
  const { session } = useAuth();
  const myId = session?.user.id ?? '';
  const myIdRef = useRef(myId);
  myIdRef.current = myId;

  const { isOnline, isReconnecting, reconnect } = useNetworkStatus();

  const [allMessages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  // Messages this viewer has "deleted for me". They still exist for everyone
  // else, so they're filtered out here rather than removed from the table.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const messages = useMemo(
    () => (hiddenIds.size === 0 ? allMessages : allMessages.filter((m) => !hiddenIds.has(m.id))),
    [allMessages, hiddenIds]
  );
  const profilesRef = useRef<Map<string, ProfileLite>>(new Map());
  const reactionRowsRef = useRef<ReactionRow[]>([]);

  // Initial cache hydration from AsyncStorage for instant render
  useEffect(() => {
    let active = true;
    (async () => {
      if (!groupId) return;
      const cached = await getCachedMessages(groupId);
      if (active && cached.length > 0 && messagesRef.current.length === 0) {
        setMessages(cached);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [groupId]);

  // Persist messages to AsyncStorage cache (debounced)
  const saveCacheTimer = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!groupId || messages.length === 0) return;
    if (saveCacheTimer.current) clearTimeout(saveCacheTimer.current);
    saveCacheTimer.current = setTimeout(() => {
      saveCachedMessages(groupId, messages);
    }, 400);
    return () => {
      if (saveCacheTimer.current) clearTimeout(saveCacheTimer.current);
    };
  }, [groupId, messages]);
  // messageId -> everyone who has burned their one look at it. Holds every
  // group member's views, not just mine: the sender's own bubble needs to know
  // whether *anyone* has opened it to show "Opened".
  const viewsRef = useRef<Map<string, Set<string>>>(new Map());
  // Every message row seen so far, keyed by id — lets a reply preview resolve
  // synchronously from what's already loaded instead of a query per bubble.
  const rowsRef = useRef<Map<string, MessageRow>>(new Map());
  // Ids currently being fetched for a reply preview whose target wasn't in
  // rowsRef yet (e.g. history not loaded, or genuinely gone) — de-dupes
  // concurrent lookups for the same target across several replies.
  const pendingReplyFetchRef = useRef<Set<string>>(new Set());
  // Ids already looked up once, successful or not — a target that's truly
  // gone would otherwise get re-queried on every subsequent message arrival.
  const triedReplyFetchRef = useRef<Set<string>>(new Set());
  // Last seen AppState, so the resume listener can tell a real
  // background → active transition from the transient 'inactive' events that
  // fire without the app ever actually leaving.
  // Whether the app has actually been backgrounded since it was last
  // foregrounded. See the resume handler for why the previous state alone
  // is not enough to tell a real resume from a notification banner.
  const wasBackgrounded = useRef(AppState.currentState === 'background');
  // Debounces reaction refetches so a burst collapses into one query.
  const reactionRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The realtime subscription is set up once per group, so any `messages` it
  // closed over would be frozen at []. Keep a ref the handlers can read live.
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const authorNameFor = useCallback(
    (authorId: string | null) => {
      if (!authorId) return DELETED_AUTHOR.name;
      return profilesRef.current.get(authorId)?.display_name ?? 'someone';
    },
    []
  );

  const buildReplyPreview = useCallback(
    (replyToId: string | null): ReplyPreview | null => {
      if (!replyToId) return null;
      const target = rowsRef.current.get(replyToId);
      if (!target) {
        // Not loaded (yet) — render as unresolved and kick off a one-shot
        // fetch so it fills in without the user having to do anything.
        return { messageId: replyToId, authorId: null, authorName: '', text: '', kind: 'text', isDeleted: true };
      }
      return {
        messageId: target.id,
        authorId: target.author_id,
        // An anonymous message has a null author, which authorNameFor reads as
        // a deleted account — quoting it would mislabel it rather than leak
        // anything, but mislabelling is still wrong.
        authorName: target.is_anonymous
          ? ANONYMOUS_AUTHOR.name
          : authorNameFor(target.author_id),
        text: target.is_deleted ? '' : target.media_name && kindFor(target) === 'file' ? target.media_name : target.text,
        kind: target.is_deleted ? 'text' : kindFor(target),
        isDeleted: target.is_deleted,
      };
    },
    [authorNameFor]
  );

  const getViewerProfiles = useCallback((messageId: string): MediaViewerProfile[] => {
    const viewerIds = Array.from(viewsRef.current.get(messageId) ?? []);
    return viewerIds.map((id) => {
      const p = profilesRef.current.get(id);
      return {
        id,
        name: p?.display_name ?? 'someone',
        avatarColor: p?.avatar_color ?? '#B98CFF',
        avatarEmoji: p?.avatar_emoji ?? '👤',
        avatarUrl: p?.avatar_url ?? null,
      };
    });
  }, []);

  /** Folds the per-viewer view state onto a view-once attachment. Kept out of
   *  mediaFor() so that stays a pure row→media mapping. */
  const withViewState = useCallback(
    (media: MessageMedia | null, messageId: string): MessageMedia | null => {
      if (!media?.viewOnce) return media;
      const viewers = viewsRef.current.get(messageId);
      return {
        ...media,
        viewed: !!viewers?.has(myIdRef.current),
        viewedByAnyone: !!viewers && viewers.size > 0,
        viewers: getViewerProfiles(messageId),
      };
    },
    [getViewerProfiles]
  );

  const buildMessages = useCallback(
    (rows: MessageRow[]) => {
      // Populate the row cache first so a reply pointing at another row in
      // this very batch (or one already cached) resolves on the first pass.
      for (const row of rows) rowsRef.current.set(row.id, row);

      return rows.map((row) => {
        const reactions = aggregateReactions(reactionRowsRef.current, row.id, myIdRef.current);
        const replyPreview = buildReplyPreview(row.reply_to_message_id);
        const displayText = row.is_deleted ? '' : row.text;

        // Checked before the deleted-account branch below, which is the other
        // reason author_id is null. Order matters: an anonymous message would
        // otherwise be labelled as coming from a deleted account.
        if (row.is_anonymous) {
          const message: Message = {
            id: row.id,
            groupId: row.group_id,
            authorId: null,
            authorName: ANONYMOUS_AUTHOR.name,
            authorColor: ANONYMOUS_AUTHOR.color,
            authorEmoji: ANONYMOUS_AUTHOR.emoji,
            isAnonymous: true,
            text: displayText,
            kind: row.is_deleted ? 'text' : kindFor(row),
            createdAt: row.created_at,
            editedAt: row.edited_at,
            isDeleted: row.is_deleted,
            deletedByAdmin: deletedByAdminFor(row),
            replyToMessageId: row.reply_to_message_id,
            replyPreview,
            mentions: row.mentions ?? [],
            mentionEveryone: row.mention_everyone,
            media: null,
            stickerId: null,
            pollId: null,
            // Never "mine", even to the person who sent it: a bubble aligned
            // to the right would tell everyone looking over your shoulder
            // exactly who wrote it.
            isMine: false,
            reactions,
            aiShare: undefined,
          };
          return message;
        }

        // author_id goes null when that account is deleted (ON DELETE SET
        // NULL) — the message stays, attributed to a fixed "Deleted User"
        // placeholder rather than crashing on a missing profile lookup.
        if (!row.author_id) {
          const message: Message = {
            id: row.id,
            groupId: row.group_id,
            authorId: null,
            authorName: DELETED_AUTHOR.name,
            authorColor: DELETED_AUTHOR.color,
            authorEmoji: DELETED_AUTHOR.emoji,
            isDeletedAuthor: true,
            text: displayText,
            kind: row.is_deleted ? 'text' : kindFor(row),
            createdAt: row.created_at,
            editedAt: row.edited_at,
            isDeleted: row.is_deleted,
            deletedByAdmin: deletedByAdminFor(row),
            replyToMessageId: row.reply_to_message_id,
            replyPreview,
            mentions: row.mentions ?? [],
            mentionEveryone: row.mention_everyone,
            media: row.is_deleted ? null : withViewState(mediaFor(row), row.id),
            stickerId: row.is_deleted ? null : row.sticker_id,
            pollId: row.is_deleted ? null : row.poll_id,
            isMine: false,
            reactions,
            aiShare: aiShareFor(row),
          };
          return message;
        }

        const profile = profilesRef.current.get(row.author_id);
        const message: Message = {
          id: row.id,
          groupId: row.group_id,
          authorId: row.author_id,
          authorName: profile?.display_name ?? 'someone',
          authorColor: profile?.avatar_color ?? '#B98CFF',
          authorEmoji: profile?.avatar_emoji ?? '👤',
          authorAvatarUrl: profile?.avatar_url ?? null,
          text: displayText,
          kind: row.is_deleted ? 'text' : kindFor(row),
          createdAt: row.created_at,
          editedAt: row.edited_at,
          isDeleted: row.is_deleted,
          deletedByAdmin: deletedByAdminFor(row),
          replyToMessageId: row.reply_to_message_id,
          replyPreview,
          mentions: row.mentions ?? [],
          mentionEveryone: row.mention_everyone,
          media: row.is_deleted ? null : withViewState(mediaFor(row), row.id),
          stickerId: row.is_deleted ? null : row.sticker_id,
          pollId: row.is_deleted ? null : row.poll_id,
          isMine: row.author_id === myIdRef.current,
          reactions,
          aiShare: aiShareFor(row),
        };
        return message;
      });
    },
    [buildReplyPreview, withViewState]
  );

  /** Fills in a reply preview that came back unresolved because its target
   *  wasn't loaded yet — history not fetched, or (after a real lookup)
   *  genuinely deleted/gone. Patches just that one message in place. */
  const resolveReplyPreview = useCallback(
    async (replyToId: string) => {
      if (
        rowsRef.current.has(replyToId) ||
        pendingReplyFetchRef.current.has(replyToId) ||
        triedReplyFetchRef.current.has(replyToId)
      )
        return;
      pendingReplyFetchRef.current.add(replyToId);
      try {
        const { data: row } = await supabase
          .from('messages')
          .select(MESSAGE_COLUMNS)
          .eq('id', replyToId)
          .maybeSingle();

        let preview: ReplyPreview;
        if (!row) {
          preview = { messageId: replyToId, authorId: null, authorName: '', text: '', kind: 'text', isDeleted: true };
        } else {
          rowsRef.current.set(row.id, row as MessageRow);
          if (row.author_id && !profilesRef.current.has(row.author_id)) {
            const { data: p } = await supabase
              .from('profiles')
              .select('id, display_name, avatar_color, avatar_emoji, avatar_url')
              .eq('id', row.author_id)
              .single();
            if (p) profilesRef.current.set(p.id, p);
          }
          const typedRow = row as MessageRow;
          preview = {
            messageId: typedRow.id,
            authorId: typedRow.author_id,
            authorName: authorNameFor(typedRow.author_id),
            text: typedRow.is_deleted
              ? ''
              : typedRow.media_name && kindFor(typedRow) === 'file'
                ? typedRow.media_name
                : typedRow.text,
            kind: typedRow.is_deleted ? 'text' : kindFor(typedRow),
            isDeleted: typedRow.is_deleted,
          };
        }

        setMessages((prev) =>
          prev.map((m) => (m.replyToMessageId === replyToId ? { ...m, replyPreview: preview } : m))
        );
      } finally {
        pendingReplyFetchRef.current.delete(replyToId);
        triedReplyFetchRef.current.add(replyToId);
      }
    },
    [authorNameFor]
  );

  const PAGE_SIZE = 35;
  const initialFetchLimit = useMemo(() => {
    const minNeeded = options?.initialLimit ?? PAGE_SIZE;
    return Math.max(PAGE_SIZE, minNeeded);
  }, [options?.initialLimit]);

  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const oldestCreatedAtRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: messageRows } = await supabase
      .from('messages')
      .select(MESSAGE_COLUMNS)
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(initialFetchLimit);

    const rawRows = (messageRows ?? []) as MessageRow[];
    setHasMore(rawRows.length === initialFetchLimit);

    const rows = [...rawRows].reverse();
    if (rows.length > 0) {
      oldestCreatedAtRef.current = rows[0].created_at;
    } else {
      oldestCreatedAtRef.current = null;
    }

    const authorIds = Array.from(
      new Set(rows.map((r) => r.author_id).filter((id): id is string => id !== null))
    );

    if (authorIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_color, avatar_emoji, avatar_url')
        .in('id', authorIds);
      for (const p of profileRows ?? []) profilesRef.current.set(p.id, p);
    }

    const messageIds = rows.map((r) => r.id);
    if (messageIds.length > 0) {
      // Scoped to this page of messages rather than every hide the user has
      // ever made, so the query stays proportional to what's on screen.
      const [{ data: reactionRows }, { data: hiddenRows }, { data: viewRows }] = await Promise.all([
        supabase
          .from('message_reactions')
          .select('message_id, user_id, emoji, label')
          .in('message_id', messageIds),
        supabase.from('hidden_messages').select('message_id').in('message_id', messageIds),
        supabase.from('media_views').select('message_id, user_id').in('message_id', messageIds),
      ]);
      reactionRowsRef.current = reactionRows ?? [];
      setHiddenIds(new Set((hiddenRows ?? []).map((r) => r.message_id)));

      const views = new Map<string, Set<string>>();
      const viewerUserIds = new Set<string>();
      for (const v of viewRows ?? []) {
        const set = views.get(v.message_id) ?? new Set<string>();
        set.add(v.user_id);
        views.set(v.message_id, set);
        viewerUserIds.add(v.user_id);
      }
      viewsRef.current = views;

      const missingProfileIds = Array.from(viewerUserIds).filter((id) => !profilesRef.current.has(id));
      if (missingProfileIds.length > 0) {
        const { data: viewerProfileRows } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_color, avatar_emoji, avatar_url')
          .in('id', missingProfileIds);
        for (const p of viewerProfileRows ?? []) profilesRef.current.set(p.id, p);
      }
    } else {
      reactionRowsRef.current = [];
      setHiddenIds(new Set());
      viewsRef.current = new Map();
    }

    setMessages(buildMessages(rows));
    setLoading(false);
  }, [groupId, initialFetchLimit, buildMessages]);

  const fetchOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMore || !oldestCreatedAtRef.current) return;
    setLoadingMore(true);

    try {
      const oldest = oldestCreatedAtRef.current;
      const { data: messageRows } = await supabase
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .eq('group_id', groupId)
        .lt('created_at', oldest)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      const rawRows = (messageRows ?? []) as MessageRow[];
      if (rawRows.length === 0) {
        setHasMore(false);
        return;
      }

      setHasMore(rawRows.length === PAGE_SIZE);
      const rows = [...rawRows].reverse();
      oldestCreatedAtRef.current = rows[0].created_at;

      const authorIds = Array.from(
        new Set(rows.map((r) => r.author_id).filter((id): id is string => id !== null))
      );
      const missingProfileIds = authorIds.filter((id) => !profilesRef.current.has(id));

      if (missingProfileIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_color, avatar_emoji, avatar_url')
          .in('id', missingProfileIds);
        for (const p of profileRows ?? []) profilesRef.current.set(p.id, p);
      }

      const messageIds = rows.map((r) => r.id);
      if (messageIds.length > 0) {
        const [{ data: reactionRows }, { data: hiddenRows }, { data: viewRows }] = await Promise.all([
          supabase
            .from('message_reactions')
            .select('message_id, user_id, emoji, label')
            .in('message_id', messageIds),
          supabase.from('hidden_messages').select('message_id').in('message_id', messageIds),
          supabase.from('media_views').select('message_id, user_id').in('message_id', messageIds),
        ]);

        if (reactionRows && reactionRows.length > 0) {
          reactionRowsRef.current = [...reactionRowsRef.current, ...reactionRows];
        }
        if (hiddenRows && hiddenRows.length > 0) {
          setHiddenIds((prev) => {
            const next = new Set(prev);
            for (const r of hiddenRows) next.add(r.message_id);
            return next;
          });
        }
        for (const v of viewRows ?? []) {
          const set = viewsRef.current.get(v.message_id) ?? new Set<string>();
          set.add(v.user_id);
          viewsRef.current.set(v.message_id, set);
        }
      }

      const olderBuiltMessages = buildMessages(rows);
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const uniqueOlder = olderBuiltMessages.filter((m) => !existing.has(m.id));
        if (uniqueOlder.length === 0) return prev;
        return [...uniqueOlder, ...prev];
      });
    } finally {
      setLoadingMore(false);
    }
  }, [groupId, hasMore, loadingMore, buildMessages]);

  const loadUntilMessage = useCallback(
    async (targetMessageId: string): Promise<boolean> => {
      if (allMessages.some((m) => m.id === targetMessageId)) {
        return true;
      }

      try {
        const { data: targetRow } = await supabase
          .from('messages')
          .select('id, created_at')
          .eq('id', targetMessageId)
          .eq('group_id', groupId)
          .maybeSingle();

        if (!targetRow) return false;

        const oldest = oldestCreatedAtRef.current ?? new Date().toISOString();

        const { data: messageRows } = await supabase
          .from('messages')
          .select(MESSAGE_COLUMNS)
          .eq('group_id', groupId)
          .lte('created_at', oldest)
          .gte('created_at', targetRow.created_at)
          .order('created_at', { ascending: false })
          .limit(100);

        const rawRows = (messageRows ?? []) as MessageRow[];
        if (rawRows.length === 0) return false;

        const rows = [...rawRows].reverse();
        oldestCreatedAtRef.current = rows[0].created_at;

        const authorIds = Array.from(
          new Set(rows.map((r) => r.author_id).filter((id): id is string => id !== null))
        );
        const missingProfileIds = authorIds.filter((id) => !profilesRef.current.has(id));

        if (missingProfileIds.length > 0) {
          const { data: profileRows } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_color, avatar_emoji, avatar_url')
            .in('id', missingProfileIds);
          for (const p of profileRows ?? []) profilesRef.current.set(p.id, p);
        }

        const messageIds = rows.map((r) => r.id);
        if (messageIds.length > 0) {
          const [{ data: reactionRows }, { data: hiddenRows }, { data: viewRows }] = await Promise.all([
            supabase
              .from('message_reactions')
              .select('message_id, user_id, emoji, label')
              .in('message_id', messageIds),
            supabase.from('hidden_messages').select('message_id').in('message_id', messageIds),
            supabase.from('media_views').select('message_id, user_id').in('message_id', messageIds),
          ]);

          if (reactionRows && reactionRows.length > 0) {
            reactionRowsRef.current = [...reactionRowsRef.current, ...reactionRows];
          }
          if (hiddenRows && hiddenRows.length > 0) {
            setHiddenIds((prev) => {
              const next = new Set(prev);
              for (const r of hiddenRows) next.add(r.message_id);
              return next;
            });
          }
          for (const v of viewRows ?? []) {
            const set = viewsRef.current.get(v.message_id) ?? new Set<string>();
            set.add(v.user_id);
            viewsRef.current.set(v.message_id, set);
          }
        }

        const olderBuiltMessages = buildMessages(rows);
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m.id));
          const uniqueOlder = olderBuiltMessages.filter((m) => !existing.has(m.id));
          if (uniqueOlder.length === 0) return prev;
          return [...uniqueOlder, ...prev];
        });

        return true;
      } catch (err) {
        console.error('loadUntilMessage error:', err);
        return false;
      }
    },
    [groupId, allMessages, buildMessages]
  );

  useEffect(() => {
    load();
  }, [groupId]);

  /**
   * Re-fetch when the app comes back to the foreground.
   *
   * The realtime socket is torn down while backgrounded, so anything sent in
   * the meantime arrives at nobody — and `load()` above only re-runs when
   * groupId changes. React Navigation's focus hooks don't help either: the
   * screen never lost *navigation* focus, the whole app lost OS focus, which
   * is a different thing entirely.
   *
   * The symptom was that reopening the app on an open chat showed a stale
   * transcript until you went back to the list and re-entered — that
   * round trip remounts the screen, which is what was really doing the
   * refetch. This closes the gap without the detour.
   */
  useEffect(() => {
    if (!groupId) return;

    const sub = AppState.addEventListener('change', (next) => {
      // Only a real resume. This cannot be decided from the previous state:
      // iOS backgrounds via active → inactive → background and resumes via
      // background → inactive → active, so the step before 'active' is
      // 'inactive' either way — and 'inactive' is also what a notification
      // banner, the app switcher peek and a Control Centre pull produce
      // without ever leaving the foreground. Against the old `!== 'active'`
      // guard every banner looked like a resume and triggered a full refetch,
      // which is what made the app appear to refresh itself whenever a
      // message arrived. Tracking whether 'background' was actually reached
      // separates the two.
      if (next === 'active' && wasBackgrounded.current) {
        wasBackgrounded.current = false;
        load();
      }
      if (next === 'background') wasBackgrounded.current = true;
    });

    return () => sub.remove();
  }, [groupId, load]);

  const refreshReactions = useCallback(async () => {
    const currentIds = messagesRef.current.map((m) => m.id);
    if (currentIds.length === 0) return;
    const { data: reactionRows } = await supabase
      .from('message_reactions')
      .select('message_id, user_id, emoji, label')
      .in('message_id', currentIds);
    reactionRowsRef.current = reactionRows ?? [];
    setMessages((prev) =>
      prev.map((m) => ({ ...m, reactions: aggregateReactions(reactionRowsRef.current, m.id, myIdRef.current) }))
    );
  }, []);

  useEffect(() => {
    if (!groupId || !myId) return;

    const channelId = `chat-${groupId}-${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` },
        async (payload) => {
          const row = payload.new as MessageRow;
          // A brand-new INSERT always carries a real author_id (RLS requires
          // author_id = auth.uid()); it only ever goes null later via the
          // account-deletion UPDATE, which this INSERT-only subscription
          // doesn't see — that case is picked up on the next full reload.
          if (row.author_id && !profilesRef.current.has(row.author_id)) {
            const { data: p } = await supabase
              .from('profiles')
              .select('id, display_name, avatar_color, avatar_emoji, avatar_url')
              .eq('id', row.author_id)
              .single();
            if (p) profilesRef.current.set(p.id, p);
          }
          const built = buildMessages([row]);
          if (built.length === 0) return;
          const newMsg = built[0];

          setMessages((prev) => {
            // Check if this incoming server message matches an optimistic client message
            const optimisticIndex = prev.findIndex(
              (m) =>
                m.id === row.id ||
                (m.deliveryStatus === 'sending' &&
                  m.authorId === row.author_id &&
                  m.text === newMsg.text &&
                  ((!m.media && !row.media_url) || (m.media?.url === row.media_url)))
            );

            if (optimisticIndex >= 0) {
              const next = [...prev];
              next[optimisticIndex] = { ...newMsg, deliveryStatus: 'sent' };
              return next;
            }

            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, newMsg];
          });
          if (row.reply_to_message_id) resolveReplyPreview(row.reply_to_message_id);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          rowsRef.current.set(row.id, row);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === row.id
                ? {
                    ...m,
                    text: row.is_deleted ? '' : row.text,
                    kind: row.is_deleted ? 'text' : kindFor(row),
                    media: row.is_deleted ? null : withViewState(mediaFor(row), row.id),
                    editedAt: row.edited_at,
                    isDeleted: row.is_deleted,
                    deletedByAdmin: deletedByAdminFor(row),
                    mentions: row.mentions ?? [],
                    mentionEveryone: row.mention_everyone,
                  }
                : m.replyToMessageId === row.id
                ? {
                    ...m,
                    replyPreview: {
                      messageId: row.id,
                      authorId: row.author_id,
                      authorName: authorNameFor(row.author_id),
                      text: row.is_deleted
                        ? ''
                        : row.media_name && kindFor(row) === 'file'
                          ? row.media_name
                          : row.text,
                      kind: row.is_deleted ? 'text' : kindFor(row),
                      isDeleted: row.is_deleted,
                    },
                  }
                : m
            )
          );
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (payload) => {
        // message_reactions carries no group_id, so this subscription cannot be
        // narrowed server-side — it receives every reaction in the entire
        // database. Dropping events for messages this chat has not loaded turns
        // a global fan-out into a local one; without it, one busy group made
        // every other open chat refetch all of its reactions and re-render.
        const row = (payload.new ?? payload.old) as { message_id?: string } | null;
        const changedId = row?.message_id;
        if (!changedId || !messagesRef.current.some((m) => m.id === changedId)) return;

        // A burst (several people reacting at once) collapses into one refetch.
        if (reactionRefreshTimer.current) clearTimeout(reactionRefreshTimer.current);
        reactionRefreshTimer.current = setTimeout(() => {
          reactionRefreshTimer.current = null;
          refreshReactions();
        }, 150);
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'media_views' },
        async (payload) => {
          const row = payload.new as { message_id: string; user_id: string };
          // media_views has no group_id, so like message_reactions this cannot
          // be narrowed server-side. Discarding views on messages this chat
          // hasn't loaded stops the handler doing a profile lookup and a full
          // setMessages pass for a view that could never be drawn here.
          if (!messagesRef.current.some((m) => m.id === row.message_id)) return;
          const viewers = viewsRef.current.get(row.message_id) ?? new Set<string>();
          if (!viewers.has(row.user_id)) {
            viewers.add(row.user_id);
            viewsRef.current.set(row.message_id, viewers);
          }

          if (!profilesRef.current.has(row.user_id)) {
            const { data: p } = await supabase
              .from('profiles')
              .select('id, display_name, avatar_color, avatar_emoji, avatar_url')
              .eq('id', row.user_id)
              .maybeSingle();
            if (p) profilesRef.current.set(p.id, p);
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === row.message_id && m.media
                ? {
                    ...m,
                    media: {
                      ...m.media,
                      viewed: viewers.has(myId),
                      viewedByAnyone: true,
                      viewers: getViewerProfiles(row.message_id),
                    },
                  }
                : m
            )
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hidden_messages', filter: `user_id=eq.${myId}` },
        (payload) => {
          const row = payload.new as { message_id: string; user_id: string };
          setHiddenIds((prev) => new Set(prev).add(row.message_id));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'hidden_messages', filter: `user_id=eq.${myId}` },
        (payload) => {
          const row = payload.old as { message_id: string; user_id: string };
          setHiddenIds((prev) => {
            const next = new Set(prev);
            next.delete(row.message_id);
            return next;
          });
        }
      )
      .subscribe(onChannelStatus('chat'));

    return () => {
      // Without this a queued refetch can fire after the screen is gone.
      if (reactionRefreshTimer.current) {
        clearTimeout(reactionRefreshTimer.current);
        reactionRefreshTimer.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [groupId, myId, buildMessages, refreshReactions, resolveReplyPreview, authorNameFor, getViewerProfiles]);

  // Any bubble whose reply preview came back unresolved (target not in the
  // loaded page yet) gets a one-shot lookup so it fills itself in.
  useEffect(() => {
    for (const m of messages) {
      if (m.replyToMessageId && m.replyPreview?.isDeleted && !m.replyPreview.authorName) {
        resolveReplyPreview(m.replyToMessageId);
      }
    }
  }, [messages, resolveReplyPreview]);

  const drainingRef = useRef(false);

  const drainQueue = useCallback(async () => {
    if (drainingRef.current || !groupId || !myIdRef.current || !isOnline) return;
    drainingRef.current = true;
    try {
      const queue = await getOfflineQueue(groupId);
      if (queue.length === 0) return;

      for (const item of queue) {
        try {
          const { error } = await supabase.from('messages').insert({
            ai_share: item.aiShare ?? null,
            group_id: item.groupId,
            author_id: item.authorId,
            text: item.text,
            reply_to_message_id: item.replyToMessageId ?? null,
            mentions: item.mentions ?? [],
            mention_everyone: item.mentionEveryone ?? false,
            media_url: item.media?.url ?? null,
            media_thumb_url: item.media?.thumbUrl ?? null,
            media_type: item.media?.type ?? null,
            media_mime: item.media?.mime ?? null,
            media_name: item.media?.name ?? null,
            media_size: item.media?.size ?? null,
            media_width: item.media?.width ?? null,
            media_height: item.media?.height ?? null,
            media_duration_ms: item.media?.durationMs ?? null,
            media_view_once: item.media?.viewOnce ?? false,
            sticker_id: item.stickerId ?? null,
            poll_id: item.pollId ?? null,
          });

          if (error) {
            console.warn('[useMessages] drainQueue item error:', error);
            await updateQueuedMessageStatus(groupId, item.clientMessageId, 'failed');
            setMessages((prev) =>
              prev.map((m) =>
                m.clientMessageId === item.clientMessageId
                  ? { ...m, deliveryStatus: 'failed' }
                  : m
              )
            );
          } else {
            await dequeueOfflineMessage(groupId, item.clientMessageId);
            setMessages((prev) =>
              prev.map((m) =>
                m.clientMessageId === item.clientMessageId
                  ? { ...m, deliveryStatus: 'sent' }
                  : m
              )
            );
          }
        } catch (err) {
          console.warn('[useMessages] drainQueue exception:', err);
          await updateQueuedMessageStatus(groupId, item.clientMessageId, 'failed');
          setMessages((prev) =>
            prev.map((m) =>
              m.clientMessageId === item.clientMessageId
                ? { ...m, deliveryStatus: 'failed' }
                : m
            )
          );
        }
      }
    } finally {
      drainingRef.current = false;
    }
  }, [groupId, isOnline]);

  useEffect(() => {
    if (isOnline) {
      drainQueue();
    }
  }, [isOnline, drainQueue]);

  const sendMessage = useCallback(
    async (
      text: string,
      replyToMessageId?: string | null,
      mentions: Mention[] = [],
      mentionEveryone = false,
      media?: MessageMedia | null,
      aiShare?: AIShare | null,
      stickerId?: string | null,
      pollId?: string | null
    ) => {
      const uid = myIdRef.current;
      if (!uid || (!text.trim() && !media && !pollId)) return;

      const trimmed = text.trim();
      const clientMessageId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const myProfile = profilesRef.current.get(uid);

      const optimisticMsg: Message = {
        id: clientMessageId,
        clientMessageId,
        groupId,
        authorId: uid,
        authorName: myProfile?.display_name ?? 'You',
        authorColor: myProfile?.avatar_color ?? '#818CF8',
        authorEmoji: myProfile?.avatar_emoji ?? '👤',
        authorAvatarUrl: myProfile?.avatar_url ?? null,
        text: trimmed,
        kind: pollId ? 'poll' : (media?.type ?? 'text'),
        createdAt: new Date().toISOString(),
        replyToMessageId: replyToMessageId ?? null,
        replyPreview: replyToMessageId
          ? {
              messageId: replyToMessageId,
              authorId: null,
              authorName: authorNameFor(rowsRef.current.get(replyToMessageId)?.author_id ?? null),
              text: rowsRef.current.get(replyToMessageId)?.text ?? '',
              kind: rowsRef.current.get(replyToMessageId)
                ? kindFor(rowsRef.current.get(replyToMessageId)!)
                : 'text',
              isDeleted: false,
            }
          : null,
        mentions,
        mentionEveryone,
        media: media ?? null,
        stickerId: stickerId ?? null,
        pollId: pollId ?? null,
        reactions: [],
        isMine: true,
        deliveryStatus: 'sending',
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      consumeMissedBoundary(groupId, uid);

      const queuedItem: QueuedMessage = {
        id: clientMessageId,
        clientMessageId,
        groupId,
        authorId: uid,
        text: trimmed,
        replyToMessageId: replyToMessageId ?? null,
        mentions,
        mentionEveryone,
        media: media ?? null,
        aiShare: aiShare ?? null,
        stickerId: stickerId ?? null,
        pollId: pollId ?? null,
        createdAt: optimisticMsg.createdAt,
        status: 'sending',
        retryCount: 0,
      };

      await enqueueOfflineMessage(queuedItem);

      if (!isOnline) {
        return;
      }

      try {
        const { error } = await supabase.from('messages').insert({
          ai_share: aiShare ?? null,
          group_id: groupId,
          author_id: uid,
          text: trimmed,
          reply_to_message_id: replyToMessageId ?? null,
          mentions,
          mention_everyone: mentionEveryone,
          media_url: media?.url ?? null,
          media_thumb_url: media?.thumbUrl ?? null,
          media_type: media?.type ?? null,
          media_mime: media?.mime ?? null,
          media_name: media?.name ?? null,
          media_size: media?.size ?? null,
          media_width: media?.width ?? null,
          media_height: media?.height ?? null,
          media_duration_ms: media?.durationMs ?? null,
          media_view_once: media?.viewOnce ?? false,
          sticker_id: stickerId ?? null,
          poll_id: pollId ?? null,
        });

        if (error) {
          console.warn('[useMessages] sendMessage insert error:', error);
          await updateQueuedMessageStatus(groupId, clientMessageId, 'failed');
          setMessages((prev) =>
            prev.map((m) =>
              m.clientMessageId === clientMessageId ? { ...m, deliveryStatus: 'failed' } : m
            )
          );
        } else {
          await dequeueOfflineMessage(groupId, clientMessageId);
          setMessages((prev) =>
            prev.map((m) =>
              m.clientMessageId === clientMessageId ? { ...m, deliveryStatus: 'sent' } : m
            )
          );
        }
      } catch (err) {
        console.warn('[useMessages] sendMessage exception:', err);
        await updateQueuedMessageStatus(groupId, clientMessageId, 'failed');
        setMessages((prev) =>
          prev.map((m) =>
            m.clientMessageId === clientMessageId ? { ...m, deliveryStatus: 'failed' } : m
          )
        );
      }
    },
    [groupId, isOnline, authorNameFor]
  );

  const retryMessage = useCallback(
    async (messageId: string) => {
      const queue = await getOfflineQueue(groupId);
      const item = queue.find((q) => q.id === messageId || q.clientMessageId === messageId);
      if (!item) return;

      await updateQueuedMessageStatus(groupId, item.clientMessageId, 'sending');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId || m.clientMessageId === item.clientMessageId
            ? { ...m, deliveryStatus: 'sending' }
            : m
        )
      );

      try {
        const { error } = await supabase.from('messages').insert({
          ai_share: item.aiShare ?? null,
          group_id: item.groupId,
          author_id: item.authorId,
          text: item.text,
          reply_to_message_id: item.replyToMessageId ?? null,
          mentions: item.mentions ?? [],
          mention_everyone: item.mentionEveryone ?? false,
          media_url: item.media?.url ?? null,
          media_thumb_url: item.media?.thumbUrl ?? null,
          media_type: item.media?.type ?? null,
          media_mime: item.media?.mime ?? null,
          media_name: item.media?.name ?? null,
          media_size: item.media?.size ?? null,
          media_width: item.media?.width ?? null,
          media_height: item.media?.height ?? null,
          media_duration_ms: item.media?.durationMs ?? null,
          media_view_once: item.media?.viewOnce ?? false,
          sticker_id: item.stickerId ?? null,
          poll_id: item.pollId ?? null,
        });

        if (error) {
          await updateQueuedMessageStatus(groupId, item.clientMessageId, 'failed');
          setMessages((prev) =>
            prev.map((m) =>
              m.clientMessageId === item.clientMessageId
                ? { ...m, deliveryStatus: 'failed' }
                : m
            )
          );
        } else {
          await dequeueOfflineMessage(groupId, item.clientMessageId);
          setMessages((prev) =>
            prev.map((m) =>
              m.clientMessageId === item.clientMessageId
                ? { ...m, deliveryStatus: 'sent' }
                : m
            )
          );
        }
      } catch {
        await updateQueuedMessageStatus(groupId, item.clientMessageId, 'failed');
        setMessages((prev) =>
          prev.map((m) =>
            m.clientMessageId === item.clientMessageId
              ? { ...m, deliveryStatus: 'failed' }
              : m
          )
        );
      }
    },
    [groupId]
  );

  const retryAllFailed = useCallback(async () => {
    const queue = await getOfflineQueue(groupId);
    const failed = queue.filter((q) => q.status === 'failed');
    for (const item of failed) {
      await retryMessage(item.clientMessageId);
    }
  }, [groupId, retryMessage]);

  const editMessage = useCallback(
    async (
      messageId: string,
      text: string,
      mentions: Mention[] = [],
      mentionEveryone = false
    ) => {
      const trimmed = text.trim();
      if (!myIdRef.current || !trimmed) return;
      // Optimistic — the realtime UPDATE will confirm (and the server may
      // still strip mentionEveryone if the cooldown/permission check fails).
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, text: trimmed, editedAt: new Date().toISOString(), mentions, mentionEveryone }
            : m
        )
      );
      await supabase
        .from('messages')
        .update({ text: trimmed, edited_at: new Date().toISOString(), mentions, mention_everyone: mentionEveryone })
        .eq('id', messageId);
    },
    []
  );

  /**
   * Burns this viewer's single look at a view-once attachment. Called when
   * the fullscreen viewer *closes* rather than when it opens — opening and
   * immediately losing the photo to a mis-tap would be the worst possible
   * version of this feature.
   *
   * Recorded locally first so the bubble flips instantly; the insert ignores
   * a duplicate-key conflict because a second view is a no-op by definition.
   */
  const markMediaViewed = useCallback(
    async (messageId: string) => {
      const uid = myIdRef.current;
      if (!uid) return;
      const viewers = viewsRef.current.get(messageId) ?? new Set<string>();
      if (!viewers.has(uid)) {
        viewers.add(uid);
        viewsRef.current.set(messageId, viewers);
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.media
            ? {
                ...m,
                media: {
                  ...m.media,
                  viewed: true,
                  viewedByAnyone: true,
                  viewers: getViewerProfiles(messageId),
                },
              }
            : m
        )
      );

      await supabase.from('media_views').insert({ message_id: messageId, user_id: uid });
    },
    [getViewerProfiles]
  );

  /** Delete for everyone: the message becomes a tombstone for every member.
   *  Who may do this is enforced by RLS (author, or the group's owner/admin). */
  const deleteMessage = useCallback(async (messageId: string) => {
    const target = messagesRef.current.find((m) => m.id === messageId);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              text: '',
              media: null,
              isDeleted: true,
              // Mirrors what the trigger will stamp, so the label doesn't
              // flicker in after the realtime UPDATE lands.
              deletedByAdmin: !!target && target.authorId !== myIdRef.current,
            }
          : m
      )
    );
    await supabase.from('messages').update({ is_deleted: true }).eq('id', messageId);
  }, []);

  /** Delete for me: hides the message for this viewer only. The message
   *  itself is untouched, so everyone else still sees it. */
  const hideMessage = useCallback(async (messageId: string): Promise<{ error: string | null }> => {
    const uid = myIdRef.current;
    if (!uid) return { error: 'Not signed in.' };
    setHiddenIds((prev) => new Set(prev).add(messageId));
    const { error } = await supabase
      .from('hidden_messages')
      .insert({ message_id: messageId, user_id: uid });
    if (error) {
      // Put it back rather than leaving it hidden on this device only — a
      // hide that didn't persist would reappear on the next load anyway, and
      // a message silently returning with no explanation reads as a bug.
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
      return { error: error.message };
    }
    return { error: null };
  }, []);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string, label?: string) => {
      const uid = myIdRef.current;
      if (!uid) return;
      const message = messagesRef.current.find((m) => m.id === messageId);
      const existing = message?.reactions.find((r) => r.emoji === emoji);

      if (existing?.reactedByMe) {
        // Optimistic: realtime will confirm, but the tap should feel instant.
        setMessages((prev) =>
          prev.map((m) =>
            m.id !== messageId
              ? m
              : {
                ...m,
                reactions: m.reactions
                  .map((r) =>
                    r.emoji === emoji ? { ...r, count: r.count - 1, reactedByMe: false } : r
                  )
                  .filter((r) => r.count > 0),
              }
          )
        );
        await supabase
          .from('message_reactions')
          .delete()
          .match({ message_id: messageId, user_id: uid, emoji });
      } else {
        const resolved = label || labelFor(emoji);
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const has = m.reactions.some((r) => r.emoji === emoji);
            return {
              ...m,
              reactions: has
                ? m.reactions.map((r) =>
                  r.emoji === emoji ? { ...r, count: r.count + 1, reactedByMe: true } : r
                )
                : [...m.reactions, { emoji, label: resolved, count: 1, reactedByMe: true }],
            };
          })
        );
        await supabase
          .from('message_reactions')
          .insert({ message_id: messageId, user_id: uid, emoji, label: resolved });
      }
      refreshReactions();
    },
    [refreshReactions]
  );

  /** Clear chat for me: hides all messages currently in this group for this viewer only. */
  const clearChatForMe = useCallback(async (): Promise<{ error: string | null }> => {
    if (!myIdRef.current) return { error: 'Not signed in.' };
    // Optimistically hide all current messages locally
    setHiddenIds(new Set(messagesRef.current.map((m) => m.id)));
    const { error } = await supabase.rpc('clear_chat_for_me', { p_group_id: groupId });
    if (error) {
      load();
      return { error: error.message };
    }
    return { error: null };
  }, [groupId, load]);

  return {
    messages,
    loading,
    hasMore,
    loadingMore,
    fetchOlderMessages,
    loadUntilMessage,
    sendMessage,
    editMessage,
    deleteMessage,
    hideMessage,
    clearChatForMe,
    reloadMessages: load,
    markMediaViewed,
    toggleReaction,
    isOnline,
    isReconnecting,
    reconnect,
    retryMessage,
    retryAllFailed,
  };
}
