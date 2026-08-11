import { useMemo } from 'react';
import { Message } from '../types';

export type Recap = {
  vibe: { label: string; detail: string };
  totalToday: number;
  topSender: { name: string; count: number } | null;
  peakHour: { label: string; count: number } | null;
  mentions: Message[];
  longestMessage: Message | null;
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
  me: { username?: string; displayName?: string }
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

    const needles = [me.username, me.displayName]
      .filter(Boolean)
      .map((s) => `@${s!.toLowerCase()}`);
    const mentions = messages
      .filter((m) => !m.isMine)
      .filter((m) => needles.some((n) => m.text.toLowerCase().includes(n)))
      .slice(-6)
      .reverse();

    const longestMessage =
      todays.length > 0
        ? todays.reduce((best, m) => (m.text.length > best.text.length ? m : best))
        : null;

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

    return { vibe, totalToday: n, topSender, peakHour, mentions, longestMessage };
  }, [messages, me.username, me.displayName]);
}
