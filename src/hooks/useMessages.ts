import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Message, Reaction } from '../types';
import { labelFor } from '../data/reactions';

type ProfileLite = { id: string; display_name: string; avatar_color: string; avatar_emoji: string };
type ReactionRow = { message_id: string; user_id: string; emoji: string; label: string };
type MessageRow = {
  id: string;
  group_id: string;
  author_id: string | null;
  text: string;
  created_at: string;
};

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const profilesRef = useRef<Map<string, ProfileLite>>(new Map());
  const reactionRowsRef = useRef<ReactionRow[]>([]);
  // The realtime subscription is set up once per group, so any `messages` it
  // closed over would be frozen at []. Keep a ref the handlers can read live.
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const buildMessages = useCallback(
    (rows: MessageRow[]) => {
      return rows.map((row) => {
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
            text: row.text,
            createdAt: row.created_at,
            isMine: false,
            reactions: aggregateReactions(reactionRowsRef.current, row.id, myId),
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
          text: row.text,
          createdAt: row.created_at,
          isMine: row.author_id === myId,
          reactions: aggregateReactions(reactionRowsRef.current, row.id, myId),
        };
        return message;
      });
    },
    [myId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const { data: messageRows } = await supabase
      .from('messages')
      .select('id, group_id, author_id, text, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    const rows = messageRows ?? [];
    const authorIds = Array.from(
      new Set(rows.map((r) => r.author_id).filter((id): id is string => id !== null))
    );

    if (authorIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_color, avatar_emoji')
        .in('id', authorIds);
      for (const p of profileRows ?? []) profilesRef.current.set(p.id, p);
    }

    const messageIds = rows.map((r) => r.id);
    if (messageIds.length > 0) {
      const { data: reactionRows } = await supabase
        .from('message_reactions')
        .select('message_id, user_id, emoji, label')
        .in('message_id', messageIds);
      reactionRowsRef.current = reactionRows ?? [];
    } else {
      reactionRowsRef.current = [];
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
              .select('id, display_name, avatar_color, avatar_emoji')
              .eq('id', row.author_id)
              .single();
            if (p) profilesRef.current.set(p.id, p);
          }
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, ...buildMessages([row])]
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
  }, [groupId, myId, buildMessages, refreshReactions]);

  async function sendMessage(text: string) {
    if (!myId || !text.trim()) return;
    await supabase.from('messages').insert({ group_id: groupId, author_id: myId, text: text.trim() });
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

  return { messages, loading, sendMessage, toggleReaction };
}
