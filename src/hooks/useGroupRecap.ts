import { useMemo } from 'react';
import { Message } from '../types';

export type MissedElevenEleven = {
  id: string;
  authorName: string;
  authorColor: string;
  authorEmoji?: string;
  authorAvatarUrl?: string | null;
  text: string;
  timeLabel: string;
  roast: string;
  createdAt: string;
};

const ROASTS = [
  "Too busy yapping to make a wish 💀",
  "Traded an 11:11 wish for whatever this was 🪦",
  "Zero wish energy, 100% yap energy 😭",
  "Thought this text was more important than their destiny 🤡",
  "Missed the 11:11 portal because of this message 💀",
  "Wishes are temporary, yapping is forever 🗣️",
  "Priorities: 0/10 😭",
  "Fell asleep at the 11:11 wheel 😴",
];

function getRoast(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % ROASTS.length;
  return ROASTS[index];
}

export type Recap = {
  vibe: { label: string; detail: string };
  totalToday: number;
  topSender: { name: string; count: number } | null;
  peakHour: { label: string; count: number } | null;
  mentions: Message[];
  longestMessage: Message | null;
  missedElevenEleven: MissedElevenEleven[];
};

function hourLabel(hour: number) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}

/**
 * Everything on the recap screen that can be derived from the messages we
 * already have — counted locally, not sent to a model. Only the narrative
 * "key takeaways" genuinely need an LLM, and those stay gated behind Phase 4
 * so this screen costs nothing to open.
 */
export function useGroupRecap(
  messages: Message[],
  me: { userId?: string; username?: string; displayName?: string }
): Recap {
  return useMemo(() => {
    // A rolling 24h window, not the calendar day. "What did I miss" is about
    // time away, so a midnight rollover shouldn't wipe the recap of an evening
    // that's still the thing everyone is talking about.
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const todays = messages.filter((m) => new Date(m.createdAt).getTime() >= since);

    const byAuthor = new Map<string, number>();
    const byHour = new Map<number, number>();
    for (const m of todays) {
      byAuthor.set(m.authorName, (byAuthor.get(m.authorName) ?? 0) + 1);
      const h = new Date(m.createdAt).getHours();
      byHour.set(h, (byHour.get(h) ?? 0) + 1);
    }

    let topSender: Recap['topSender'] = null;
    for (const [name, count] of byAuthor) {
      if (!topSender || count > topSender.count) topSender = { name, count };
    }

    let peakHour: Recap['peakHour'] = null;
    for (const [hour, count] of byHour) {
      if (!peakHour || count > peakHour.count) peakHour = { label: hourLabel(hour), count };
    }

    const myId = me.userId ?? '';
    const myUsername = me.username?.toLowerCase() ?? '';
    const myDisplayName = me.displayName?.toLowerCase() ?? '';

    const mentions = todays
      .filter((m) => !m.isMine)
      .filter((m) => {
        // 1. Structured mention array by user ID
        if (myId && m.mentions?.some((mn) => mn.userId === myId)) {
          return true;
        }

        // 2. Mention Everyone tag
        if (m.mentionEveryone) {
          return true;
        }

        // 3. Text fallback for @username or @displayName
        const lowerText = m.text.toLowerCase();
        if (myUsername && (lowerText.includes(`@${myUsername}`) || lowerText.includes(myUsername))) {
          return true;
        }
        if (myDisplayName && (lowerText.includes(`@${myDisplayName}`) || lowerText.includes(myDisplayName))) {
          return true;
        }

        return false;
      })
      .slice(-10)
      .reverse();

    const longestMessage =
      todays.length > 0
        ? todays.reduce((best, m) => (m.text.length > best.text.length ? m : best))
        : null;

    // Search for messages sent today at 11:11 AM / 11:11 PM where the user typed a message
    // instead of typing "11:11"
    const missedElevenEleven: MissedElevenEleven[] = [];
    const seenMissedAuthors = new Set<string>();

    for (const m of todays) {
      if (m.isDeleted || !m.text.trim()) continue;
      const d = new Date(m.createdAt);
      const hours = d.getHours();
      const mins = d.getMinutes();

      // Check if message was detected at 11:11 AM or 11:11 PM
      if ((hours === 11 || hours === 23) && mins === 11) {
        const cleanText = m.text.trim().toLowerCase();
        const isWish =
          cleanText.includes('11:11') ||
          cleanText.includes('1111') ||
          cleanText === '11 11';

        if (!isWish && !seenMissedAuthors.has(m.authorName)) {
          seenMissedAuthors.add(m.authorName);
          const timeLabel = hours === 11 ? '11:11 AM' : '11:11 PM';
          missedElevenEleven.push({
            id: m.id,
            authorName: m.authorName,
            authorColor: m.authorColor,
            authorEmoji: m.authorEmoji,
            authorAvatarUrl: m.authorAvatarUrl,
            text: m.text,
            timeLabel,
            roast: getRoast(m.id),
            createdAt: m.createdAt,
          });
        }
      }
    }

    // Volume-based vibe read. A heuristic, not a model — but an honest one.
    const n = todays.length;
    const vibe =
      n === 0
        ? { label: 'Flatlined', detail: 'not a single message in 24 hours' }
        : n < 10
          ? { label: 'Chill / Dormant', detail: 'barely a pulse' }
          : n < 40
            ? { label: 'Warming Up', detail: 'steady chatter' }
            : n < 120
              ? { label: 'High Energy', detail: 'the GC is awake' }
              : { label: 'High Energy / Chaotic', detail: 'genuinely unwell behaviour' };

    return { vibe, totalToday: n, topSender, peakHour, mentions, longestMessage, missedElevenEleven };
  }, [messages, me.userId, me.username, me.displayName]);
}
