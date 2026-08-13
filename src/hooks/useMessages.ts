import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Mention, Message, MessageKind, MessageMedia, Reaction, ReplyPreview } from '../types';
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
  media_url: string | null;
  media_thumb_url: string | null;
  media_type: 'image' | 'video' | 'gif' | 'file' | null;
  media_mime: string | null;
  media_name: string | null;
  media_size: number | null;
  media_width: number | null;
  media_height: number | null;
  media_duration_ms: number | null;
};

const MESSAGE_COLUMNS =
  'id, group_id, author_id, text, created_at, reply_to_message_id, edited_at, is_deleted, deleted_by, mentions, mention_everyone, media_url, media_thumb_url, media_type, media_mime, media_name, media_size, media_width, media_height, media_duration_ms';

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
  };
}

/** A moderator takedown, as opposed to the author deleting their own. */
function deletedByAdminFor(row: MessageRow): boolean {
  return !!row.is_deleted && !!row.deleted_by && row.deleted_by !== row.author_id;
}

function kindFor(row: MessageRow): MessageKind {
  return row.media_type ?? 'text';
}

const DELETED_AUTHOR = {
  name: 'Deleted User',
  color: '#5C5670',
  emoji: '👻',
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

export function useMessages(groupId: string) {
  const { session } = useAuth();
  const myId = session?.user.id ?? '';
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
        authorName: authorNameFor(target.author_id),
        text: target.is_deleted ? '' : target.media_name && kindFor(target) === 'file' ? target.media_name : target.text,
        kind: target.is_deleted ? 'text' : kindFor(target),
        isDeleted: target.is_deleted,
      };
    },
    [authorNameFor]
  );

  const buildMessages = useCallback(
    (rows: MessageRow[]) => {
      // Populate the row cache first so a reply pointing at another row in
      // this very batch (or one already cached) resolves on the first pass.
      for (const row of rows) rowsRef.current.set(row.id, row);

      return rows.map((row) => {
        const reactions = aggregateReactions(reactionRowsRef.current, row.id, myId);
        const replyPreview = buildReplyPreview(row.reply_to_message_id);
        const displayText = row.is_deleted ? '' : row.text;

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
            media: row.is_deleted ? null : mediaFor(row),
            isMine: false,
            reactions,
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
          media: row.is_deleted ? null : mediaFor(row),
          isMine: row.author_id === myId,
          reactions,
        };
        return message;
      });
    },
    [myId, buildReplyPreview]
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

  const load = useCallback(async () => {
    setLoading(true);
    const { data: messageRows } = await supabase
      .from('messages')
      .select(MESSAGE_COLUMNS)
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    const rows = (messageRows ?? []) as MessageRow[];
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
      const [{ data: reactionRows }, { data: hiddenRows }] = await Promise.all([
        supabase
          .from('message_reactions')
          .select('message_id, user_id, emoji, label')
          .in('message_id', messageIds),
        supabase.from('hidden_messages').select('message_id').in('message_id', messageIds),
      ]);
      reactionRowsRef.current = reactionRows ?? [];
      setHiddenIds(new Set((hiddenRows ?? []).map((r) => r.message_id)));
    } else {
      reactionRowsRef.current = [];
      setHiddenIds(new Set());
    }

    setMessages(buildMessages(rows));
    setLoading(false);
  }, [groupId, buildMessages]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshReactions = useCallback(async () => {
    const currentIds = messagesRef.current.map((m) => m.id);
    if (currentIds.length === 0) return;
    const { data: reactionRows } = await supabase
      .from('message_reactions')
      .select('message_id, user_id, emoji, label')
      .in('message_id', currentIds);
    reactionRowsRef.current = reactionRows ?? [];
    setMessages((prev) =>
      prev.map((m) => ({ ...m, reactions: aggregateReactions(reactionRowsRef.current, m.id, myId) }))
    );
  }, [myId]);

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
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, ...buildMessages([row])]
          );
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
                    media: row.is_deleted ? null : mediaFor(row),
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => {
        refreshReactions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, myId, buildMessages, refreshReactions, resolveReplyPreview, authorNameFor]);

  // Any bubble whose reply preview came back unresolved (target not in the
  // loaded page yet) gets a one-shot lookup so it fills itself in.
  useEffect(() => {
    for (const m of messages) {
      if (m.replyToMessageId && m.replyPreview?.isDeleted && !m.replyPreview.authorName) {
        resolveReplyPreview(m.replyToMessageId);
      }
    }
  }, [messages, resolveReplyPreview]);

  async function sendMessage(
    text: string,
    replyToMessageId?: string | null,
    mentions: Mention[] = [],
    mentionEveryone = false,
    media?: MessageMedia | null
  ) {
    // A media-only message needs no caption; a plain-text one still needs
    // real content — no sending an empty bubble.
    if (!myId || (!text.trim() && !media)) return;
    await supabase.from('messages').insert({
      group_id: groupId,
      author_id: myId,
      text: text.trim(),
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
    });
  }

  async function editMessage(
    messageId: string,
    text: string,
    mentions: Mention[] = [],
    mentionEveryone = false
  ) {
    const trimmed = text.trim();
    if (!myId || !trimmed) return;
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
  }

  /** Delete for everyone: the message becomes a tombstone for every member.
   *  Who may do this is enforced by RLS (author, or the group's owner/admin). */
  async function deleteMessage(messageId: string) {
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
              deletedByAdmin: !!target && target.authorId !== myId,
            }
          : m
      )
    );
    await supabase.from('messages').update({ is_deleted: true }).eq('id', messageId);
  }

  /** Delete for me: hides the message for this viewer only. The message
   *  itself is untouched, so everyone else still sees it. */
  async function hideMessage(messageId: string) {
    if (!myId) return;
    setHiddenIds((prev) => new Set(prev).add(messageId));
    const { error } = await supabase
      .from('hidden_messages')
      .insert({ message_id: messageId, user_id: myId });
    if (error) {
      // Put it back rather than leaving it hidden on this device only — a
      // hide that didn't persist would reappear on the next load anyway.
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  }

  async function toggleReaction(messageId: string, emoji: string, label?: string) {
    if (!myId) return;
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
        .match({ message_id: messageId, user_id: myId, emoji });
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
        .insert({ message_id: messageId, user_id: myId, emoji, label: resolved });
    }
    refreshReactions();
  }

  return { messages, loading, sendMessage, editMessage, deleteMessage, hideMessage, toggleReaction };
}
