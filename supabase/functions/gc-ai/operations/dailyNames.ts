import type { GCContext } from '../context/buildGCContext.ts';
import type { AIOperation } from './types.ts';

/**
 * 🏷️ Names everyone in the GC for the day, from what they actually said.
 *
 * Someone who spent the day saying they had a fever becomes "The Patient";
 * whoever would not stop sending restaurant links becomes "The Reservation".
 * It is the joke a group makes about each other anyway, written down once a
 * day.
 *
 * Distinct from Weekly Awards, which picks winners for a fixed list of
 * categories. Here the *category itself* is invented per person, which is why
 * it can't reuse that operation: there is no title table to draw from.
 *
 * Only people who actually spoke get named. Inventing a title for a silent
 * member would mean inventing the evidence for it too, and "lurker" jokes at
 * the expense of someone who simply wasn't there stop being funny the second
 * they're automated.
 */

export type DailyName = {
  userId: string;
  /** The title itself — a short noun phrase, not a sentence. */
  name: string;
  emoji: string;
  /** One line on why, in the group's own voice. */
  reason: string;
  /** Messages that earned it, so a name is always traceable to real evidence. */
  sourceMessageIds: string[];
};

export type DailyNamesResult = {
  date: string;
  totalMessages: number;
  /** GC's one-line read on the day, above the individual names. */
  headline: string;
  names: DailyName[];
};

/** Long enough to be a joke, short enough to sit on a card. */
const MAX_NAME_CHARS = 24;
const MAX_REASON_CHARS = 120;
/** A day with fewer than this is not a day worth naming anyone over. */
const MIN_MESSAGES = 8;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const dailyNamesOperation: AIOperation<DailyNamesResult> = {
  name: 'daily_names',

  context: {
    maxMessages: 250,
    defaultLookbackHours: 24,
    // Everyone sees the same names — it is a group artefact, not a personal
    // read, so one generation serves the whole GC.
    perViewer: false,
  },

  // Names are for *today*. An hour-long TTL would hand the evening a set of
  // names decided at breakfast, so this caches until the day itself moves on;
  // the runner's key already includes the window, so a genuinely new
  // conversation produces a new set anyway.
  cacheTtlSeconds: 6 * 60 * 60,

  emptyResult(): DailyNamesResult {
    return {
      date: today(),
      totalMessages: 0,
      headline: 'Nothing happened today.',
      names: [],
    };
  },

  /**
   * A handful of messages cannot characterise anyone, and paying a model to
   * insist otherwise produces exactly the kind of invented trait that makes
   * this feature feel bad rather than funny.
   */
  trivialResult(ctx: GCContext): DailyNamesResult | null {
    if (ctx.messages.length >= MIN_MESSAGES) return null;
    return {
      date: today(),
      totalMessages: ctx.messages.length,
      headline: 'Too quiet to name anyone today.',
      names: [],
    };
  },

  /**
   * Store the day's names for the whole group.
   *
   * Written with the service client on purpose: daily_gc_names has no client
   * write policy, so a name can only ever come from a generation that
   * actually read the day — not from whoever happened to open the tab.
   */
  async persistResult({ db, groupId, result }): Promise<void> {
    if (result.names.length === 0) return;
    await db
      .from('daily_gc_names')
      .upsert(
        {
          group_id: groupId,
          name_date: result.date,
          headline: result.headline,
          total_messages: result.totalMessages,
          names: result.names,
        },
        { onConflict: 'group_id,name_date', ignoreDuplicates: true }
      );
  },

  buildSystemPrompt() {
    return [
      "You name each member of a group chat for the day, based on what they",
      'actually said. Think of the nickname the group would land on by evening.',
      '',
      'Rules:',
      `- A name is a short noun phrase, at most ${MAX_NAME_CHARS} characters.`,
      '  "The Patient", "Reply Guy", "Menu Curator". Not a sentence, not an',
      '  adjective on its own, and never just their real name back.',
      '- The name must come from something they actually said today. If you',
      '  cannot point at messages that earned it, do not name that person.',
      '- Only name people who sent messages in this window. Never invent a',
      '  name for someone who was silent.',
      '- One name per person. Never name the same person twice.',
      `- reason is one line, at most ${MAX_REASON_CHARS} characters, in the`,
      "  group's voice — dry and specific, not a compliment.",
      '- sourceMessageIds must be ids present in the transcript.',
      '',
      'Tone: affectionate teasing between friends. Roast the behaviour, never',
      'the person. Nothing about anyone\'s appearance, body, intelligence,',
      'race, gender, sexuality, religion, or health beyond what they',
      'themselves joked about. If the only material you have on someone is',
      'genuinely distressing — grief, illness described seriously, a crisis —',
      'leave them out rather than making it a punchline.',
    ].join('\n');
  },

  buildPrompt(ctx: GCContext): string {
    return [
      `Conversation (${ctx.range}):`,
      ctx.transcript,
      '',
      ctx.truncated
        ? 'Note: this is a trimmed sample of a busier day, so judge only what you can see.'
        : '',
      '',
      'Give each person who spoke a name for the day, plus one headline for',
      'the day as a whole. Cite the message ids that earned each name.',
    ]
      .filter(Boolean)
      .join('\n');
  },

  schema: {
    type: 'object',
    properties: {
      headline: { type: 'string' },
      names: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sender: { type: 'string' },
            name: { type: 'string' },
            emoji: { type: 'string' },
            reason: { type: 'string' },
            sourceMessageIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['sender', 'name', 'emoji', 'reason', 'sourceMessageIds'],
          additionalProperties: false,
        },
      },
    },
    required: ['headline', 'names'],
    additionalProperties: false,
  },

  validate(raw, ctx): DailyNamesResult {
    const v = raw as { headline?: unknown; names?: unknown };

    // The model names people by the sender label it saw in the transcript;
    // map that back to a real user id here rather than trusting it to echo
    // one. A name that cannot be tied to an actual member is dropped — the
    // card renders avatars, and there is nothing to render for a stranger.
    const idBySender = new Map<string, string>();
    for (const m of ctx.messages) {
      if (m.sender && m.senderId) idBySender.set(m.sender.toLowerCase(), m.senderId);
    }
    const idsInContext = new Set(ctx.messages.map((m) => m.id));

    const seen = new Set<string>();
    const names: DailyName[] = [];

    for (const entry of Array.isArray(v.names) ? v.names : []) {
      const e = entry as Record<string, unknown>;
      const sender = typeof e.sender === 'string' ? e.sender.trim() : '';
      const userId = idBySender.get(sender.toLowerCase());
      if (!userId || seen.has(userId)) continue;

      const name = typeof e.name === 'string' ? e.name.trim().slice(0, MAX_NAME_CHARS) : '';
      if (!name) continue;

      // Citations are the whole basis for trusting a name, so anything
      // pointing outside the window is dropped rather than shown.
      const sourceMessageIds = (Array.isArray(e.sourceMessageIds) ? e.sourceMessageIds : [])
        .filter((id): id is string => typeof id === 'string' && idsInContext.has(id))
        .slice(0, 4);
      if (sourceMessageIds.length === 0) continue;

      seen.add(userId);
      names.push({
        userId,
        name,
        emoji: typeof e.emoji === 'string' && e.emoji.trim() ? e.emoji.trim().slice(0, 4) : '🏷️',
        reason:
          typeof e.reason === 'string' ? e.reason.trim().slice(0, MAX_REASON_CHARS) : '',
        sourceMessageIds,
      });
    }

    return {
      date: today(),
      totalMessages: ctx.totalAvailable,
      headline:
        typeof v.headline === 'string' && v.headline.trim()
          ? v.headline.trim()
          : 'Today in the GC.',
      names,
    };
  },
};
