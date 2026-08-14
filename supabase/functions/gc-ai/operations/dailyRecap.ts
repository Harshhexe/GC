import type { GCContext, ProfileSummary } from '../context/buildGCContext.ts';
import type { AIOperation } from './types.ts';

/** Mirrors the client's live "message of the day" bar (ChatScreen.tsx,
 *  MOTD_MIN_REACTIONS) so the frozen daily version and the still-live today
 *  version agree on what counts as notable. */
const MOTD_MIN_REACTIONS = 3;

export type DailyRecapPerson = {
  userId: string;
  name: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  messageCount: number;
};

export type DailyRecapMessage = {
  messageId: string;
  sender: string;
  text: string;
  reactionCount: number;
};

export type DailyRecapPick = {
  caption: string;
  messageId: string;
};

export type DailyRecapResult = {
  date: string;
  totalMessages: number;
  truncated: boolean;
  userOfTheDay: DailyRecapPerson | null;
  messageOfTheDay: DailyRecapMessage | null;
  oneWord: string;
  bestTea: DailyRecapPick | null;
  mostUnhinged: DailyRecapPick | null;
};

function emptyRecap(date: string): DailyRecapResult {
  return {
    date,
    totalMessages: 0,
    truncated: false,
    userOfTheDay: null,
    messageOfTheDay: null,
    oneWord: 'dead',
    bestTea: null,
    mostUnhinged: null,
  };
}

/**
 * The end-of-day recap card — everyone in the group sees the same one.
 *
 * Distinct from What Did I Miss in the way that matters most: this is not
 * personal. It describes a calendar day that already fully happened, the
 * window is exact (the client supplies local midnight-to-midnight bounds via
 * params.from/to — "today" is a timezone-dependent idea no server clock can
 * guess correctly), and the result is written once to a shared table rather
 * than a per-viewer log.
 *
 * Numbers are never left to the model. Total messages, who talked most, and
 * which message got the most reactions are counted directly from the same
 * context the model reads — the model only picks the two subjective bits
 * (the day's funniest/most dramatic moment) and names the day in one word.
 */
export const dailyRecapOperation: AIOperation<DailyRecapResult> = {
  name: 'daily_recap',

  context: {
    maxMessages: 300,
  },

  // The day is closed and immutable by the time this runs — no TTL pressure.
  // The daily_recaps row is the real persistence; this only avoids a repeat
  // provider call in the rare case two members trigger within the same
  // instant, before either upsert has landed.
  cacheTtlSeconds: 24 * 3600,

  emptyResult(params) {
    return emptyRecap(typeof params.date === 'string' ? params.date : '');
  },

  buildSystemPrompt() {
    return [
      'You write a one-day recap card for GC, a group chat app. The reader is',
      'the whole group, not one person — do not address anyone by name.',
      '',
      'Every transcript line is formatted as:',
      '[time] Sender (id:MESSAGE_ID): text',
      'Attachments appear as labels like 📷 Photo — you cannot see their contents.',
      '',
      'Voice: same energy as the rest of GC AI — rude, cocky roast-comic,',
      'mainly English with natural Hinglish (bhai, yaar, arre, matlab, chal).',
      'Roast decisions, timing, and chaos — never identity, appearance, family,',
      'caste, religion, gender, sexuality, or income. If it would genuinely hurt',
      'someone rather than just embarrass them for a second, cut it.',
      '',
      'You are asked for exactly three things:',
      '',
      '1. oneWord — a single word (or a short hyphenated one, e.g.',
      '   "unemployed-arc") that captures the whole day\'s vibe. English or',
      '   Hindi/Hinglish, whichever lands harder. One word means one word — no',
      '   sentences, no punctuation beyond a hyphen.',
      '',
      '2. bestTea — the single most dramatic, gossipy, or reveal-y exchange of',
      '   the day, if there genuinely was one. present:false if the day had no',
      '   real tea — do not manufacture drama that is not in the transcript.',
      '',
      '3. mostUnhinged — the single funniest or most chaotic message of the',
      '   day, if one stood out. Distinct from bestTea: this is comedy/chaos,',
      '   not drama. present:false if nothing stood out.',
      '',
      'For both picks: messageId must be copied exactly from the transcript.',
      'Never invent one. caption is one short punchy line in your voice — not',
      'a summary, a roast of the moment.',
    ].join('\n');
  },

  buildPrompt(ctx: GCContext, params) {
    const date = typeof params.date === 'string' ? params.date : 'today';
    const lines = [
      `Recapping: ${date}`,
      `Participants: ${ctx.participants.join(', ')}`,
      `Messages: ${ctx.messages.length}`,
    ];

    if (ctx.truncated) {
      lines.push(
        '',
        'NOTE: this was a very active day — you are only seeing the most',
        'recent slice of it, not the whole thing. Do not imply you saw',
        'everything.'
      );
    }

    lines.push('', 'Transcript:', ctx.transcript);
    return lines.join('\n');
  },

  schema: {
    type: 'object',
    properties: {
      oneWord: { type: 'string', description: 'One word (or hyphenated) for the day.' },
      bestTea: {
        type: 'object',
        properties: {
          present: { type: 'boolean' },
          caption: { type: 'string' },
          messageId: { type: 'string' },
        },
        required: ['present', 'caption', 'messageId'],
        additionalProperties: false,
      },
      mostUnhinged: {
        type: 'object',
        properties: {
          present: { type: 'boolean' },
          caption: { type: 'string' },
          messageId: { type: 'string' },
        },
        required: ['present', 'caption', 'messageId'],
        additionalProperties: false,
      },
    },
    required: ['oneWord', 'bestTea', 'mostUnhinged'],
    additionalProperties: false,
  },

  validate(raw, ctx, params): DailyRecapResult {
    const value = raw as {
      oneWord?: unknown;
      bestTea?: { present?: unknown; caption?: unknown; messageId?: unknown };
      mostUnhinged?: { present?: unknown; caption?: unknown; messageId?: unknown };
    };

    const known = new Set(ctx.messages.map((m) => m.id));

    const pick = (
      p: typeof value.bestTea
    ): DailyRecapPick | null => {
      if (!p || p.present !== true) return null;
      if (typeof p.caption !== 'string' || typeof p.messageId !== 'string') return null;
      // Same hallucination guard as every other operation: an id that wasn't
      // in the transcript is a tap target that jumps nowhere.
      if (!known.has(p.messageId)) return null;
      return { caption: p.caption, messageId: p.messageId };
    };

    // A single word means a single word, whatever the model felt like doing.
    const rawWord = typeof value.oneWord === 'string' ? value.oneWord.trim() : '';
    const oneWord = (rawWord.split(/\s+/)[0] || 'unhinged').slice(0, 40);

    // Counted from the context directly — these are facts, not something to
    // trust a model's arithmetic on.
    const countsBySender = new Map<string, number>();
    for (const m of ctx.messages) {
      if (!m.senderId) continue;
      countsBySender.set(m.senderId, (countsBySender.get(m.senderId) ?? 0) + 1);
    }
    let topSenderId: string | null = null;
    let topCount = 0;
    for (const [id, count] of countsBySender) {
      if (count > topCount) {
        topCount = count;
        topSenderId = id;
      }
    }
    const topProfile: ProfileSummary | undefined = topSenderId
      ? ctx.profilesById.get(topSenderId)
      : undefined;
    const userOfTheDay: DailyRecapResult['userOfTheDay'] =
      topSenderId && topProfile
        ? {
            userId: topSenderId,
            name: topProfile.name,
            avatarEmoji: topProfile.avatarEmoji,
            avatarColor: topProfile.avatarColor,
            avatarUrl: topProfile.avatarUrl,
            messageCount: topCount,
          }
        : null;

    let motd: DailyRecapResult['messageOfTheDay'] = null;
    let bestReactions = MOTD_MIN_REACTIONS - 1;
    for (const m of ctx.messages) {
      const count = m.reactionCount ?? 0;
      if (count > bestReactions) {
        bestReactions = count;
        motd = { messageId: m.id, sender: m.sender, text: m.text, reactionCount: count };
      }
    }

    return {
      date: typeof params.date === 'string' ? params.date : '',
      totalMessages: ctx.messages.length,
      truncated: ctx.truncated,
      userOfTheDay,
      messageOfTheDay: motd,
      oneWord,
      bestTea: pick(value.bestTea),
      mostUnhinged: pick(value.mostUnhinged),
    };
  },

  toDailyRecapRow(result, params) {
    const date = typeof params.date === 'string' ? params.date : null;
    if (!date) return null;
    return {
      date,
      row: {
        total_messages: result.totalMessages,
        truncated: result.truncated,
        user_of_the_day: result.userOfTheDay,
        message_of_the_day: result.messageOfTheDay,
        one_word: result.oneWord,
        best_tea: result.bestTea,
        most_unhinged: result.mostUnhinged,
      },
    };
  },
};
