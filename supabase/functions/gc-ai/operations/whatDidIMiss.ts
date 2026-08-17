import { GCAIError } from '../errors.ts';
import type { GCContext } from '../context/buildGCContext.ts';
import type { AIOperation } from './types.ts';

/** Categories the UI knows how to badge. Closed so the model can't invent one. */
const CATEGORIES = ['tea', 'plan', 'info', 'funny', 'convo', 'pinned', 'mention'] as const;
export type MissedCategory = (typeof CATEGORIES)[number];

export type MissedHighlight = {
  category: MissedCategory;
  title: string;
  summary: string;
  messageIds: string[];
};

export type WhatDidIMissResult = {
  hasMissedContent: boolean;
  headline: string;
  summary: string;
  highlights: MissedHighlight[];
  mentionedMessageIds: string[];
  pinnedMessageIds: string[];
  /** True when the missed range was too big to send whole. */
  truncated: boolean;
  /** How many messages were actually read, for the UI's footer line. */
  messageCount: number;
};

/**
 * Never look further back than this, however long the user has been gone.
 *
 * Someone returning after three months does not want — and should not pay for
 * — a summary of three months. The recent end is the part that's still live.
 */
const MAX_LOOKBACK_DAYS = 14;

/**
 * Below this many genuinely-missed messages, `trivialResult` roasts instead of
 * summarising. Not a cost tweak dressed up as a joke: a recap of six messages
 * is longer than the six messages, so the model call buys the reader nothing
 * and costs a request. Scrolling is the better product here.
 */
const MIN_MESSAGES_FOR_RECAP = 10;

/** Shared by emptyResult() (the window is literally empty) and trivialResult()
 *  (the window has content, but none of it is unread) — two different ways of
 *  reaching the same "nothing to report" outcome. */
function caughtUpResult(): WhatDidIMissResult {
  return {
    hasMissedContent: false,
    headline: "You're caught up, chill 👀",
    summary: 'Literally nothing happened, bhai. Go outside or something.',
    highlights: [],
    mentionedMessageIds: [],
    pinnedMessageIds: [],
    truncated: false,
    messageCount: 0,
  };
}

/**
 * "What happened in this GC since I last caught up?"
 *
 * Distinct from a generic summary in one way that drives the whole design: the
 * window is personal. It comes from this user's own read boundary, so two
 * members opening this at the same moment can legitimately get different
 * answers, and the caller cannot influence it.
 */
export const whatDidIMissOperation: AIOperation<WhatDidIMissResult> = {
  name: 'what_did_i_miss',

  context: {
    maxMessages: 250,
    includePinned: true,
    requireOthers: false,
    perViewer: true,
  },

  cacheTtlSeconds: 24 * 3600,

  /**
   * Resolves the missed message window from the user's own read boundary —
   * `gc_missed_since`, the same preserved boundary the "N unread messages"
   * divider in ChatScreen is seeded from (see openedWithUnread there).
   *
   * There is deliberately no fallback that widens this when it comes back
   * small or empty. A version of this used to force a 48h lookback whenever
   * fewer than 2 messages were found, specifically so there was always
   * "something" to show — that is exactly backwards from what this screen is
   * for: if you are caught up, the correct answer is that you are caught up,
   * not a manufactured recap of stuff you already read.
   */
  async resolveWindow({ db, groupId }) {
    const { data } = await db.rpc('gc_missed_since', { p_group_id: groupId });

    const floor = new Date(Date.now() - MAX_LOOKBACK_DAYS * 86_400_000);
    const boundary = data ? new Date(data as string) : floor;

    return {
      from: (boundary > floor ? boundary : floor).toISOString(),
    };
  },

  /**
   * Below MIN_MESSAGES_FOR_RECAP, answer without the model at all: either
   * "you're caught up" (missed === 0) or a roast (1–9).
   *
   * `missed` comes straight from the resolved ctx window — the same
   * gc_missed_since boundary the divider uses — not a separately-fetched
   * `last_read_at`. That distinction matters: ChatScreen's markGroupRead
   * fires the instant the chat is opened (see the effect there), so by the
   * time any AI call could run, last_read_at is already "now" even if the
   * user hasn't scrolled past the divider yet. Counting off the ctx window
   * instead keeps this consistent with what's still visibly marked unread on
   * screen, and it naturally reaches zero the moment the user actually
   * replies — sendMessage() calls consumeMissedBoundary() for exactly that.
   */
  trivialResult(ctx) {
    if (ctx.truncated) return null;

    const missed = ctx.messages.filter((m) => !m.isOwn).length;

    if (missed === 0) return caughtUpResult();
    if (missed >= MIN_MESSAGES_FOR_RECAP) return null;

    const plural = missed === 1 ? '' : 's';
    // A deliberately large, fixed pool — indexed by `missed % length`, never
    // random. The screen refetches on every open; a line that reshuffled on
    // an unchanged count would read as a bug, not variety.
    const roasts = [
      {
        headline: `${missed} message${plural}. Seriously? 💀`,
        summary: `Bhai, you couldn't read ${missed} message${plural} yourself and came running to an AI? Scroll up. It takes nine seconds.`,
      },
      {
        headline: `You want a recap of ${missed} message${plural}? 😭`,
        summary: `Arre that's not a backlog, that's just a text. Scroll up and read it like a normal person, matlab come on.`,
      },
      {
        headline: `Bro really asked AI for ${missed} message${plural} 💀`,
        summary: `I'm not summarising ${missed} message${plural} for you. Use your eyes, they came free with the phone... Ig you are not andha.`,
      },
      {
        headline: `${missed} message${plural} and you're here? 🗿`,
        summary: `Chal, scroll up. If reading ${missed} message${plural} is too much work, the group chat isn't your real problem.`,
      },
      {
        headline: `Bruh... ${missed} message${plural}? 💀`,
        summary: `You opened the AI for ${missed} message${plural}? It would take you less time to just read them than waiting for this screen.`,
      },
      {
        headline: `${missed} message${plural}?? Bro what 😭`,
        summary: `This is genuinely embarrassing. ${missed} message${plural} isn't a backlog, it's a paragraph. Scroll up, matlab, use the thumb.`,
      },
      {
        headline: `Absolutely not. ${missed} message${plural} 🚫`,
        summary: `I have standards. ${missed} message${plural} doesn't clear the bar for "needs an AI to explain it." Read it yourself, bhai.`,
      },
      {
        headline: `${missed} message${plural}, and you panicked 💀`,
        summary: `Nothing happened enough that YOU had to check. Take the nine seconds, scroll, come back if it's actually a saga.`,
      },
      {
        headline: `Yaar. ${missed} message${plural}. That's it.`,
        summary: `You have eyes. You have thumbs. You have ${missed} message${plural} sitting right there. Use two of the three.`,
      },
      {
        headline: `${missed} message${plural} — GC AI is judging you 🗿`,
        summary: `This isn't a recap-worthy backlog, it's a light breeze. Scroll up before you make this weirder.`,
      },
      {
        headline: `Bhai relax. ${missed} message${plural} only.`,
        summary: `Sun, ${missed} message${plural} takes less time to read than this screen took to load. Go look.`,
      },
      {
        headline: `${missed} message${plural}?! The audacity 💀`,
        summary: `Calling the AI in for ${missed} message${plural} is like calling a moving company for one box. Just carry it, scroll up.`,
      },
    ];
    const roast = roasts[missed % roasts.length];

    return {
      // False on purpose: this is a roast, not a recap. Keeps it out of
      // ai_recap_history (toHistoryRow returns null below) and stops the
      // screen rendering it as a timed card with a ten-minute countdown.
      hasMissedContent: false,
      headline: roast.headline,
      summary: roast.summary,
      highlights: [],
      mentionedMessageIds: [],
      pinnedMessageIds: [],
      truncated: false,
      messageCount: missed,
    };
  },

  emptyResult() {
    return caughtUpResult();
  },

  buildSystemPrompt() {
    return [
      'You catch someone up on what they missed in their group chat.',
      'The app is GC. The users are Gen-Z friends, not colleagues.',
      '',
      'Every transcript line is formatted as:',
      '[time] Sender (id:MESSAGE_ID): text',
      'Attachments appear as labels like 📷 Photo — you cannot see their contents.',
      '',
      'CRITICAL — lines marked [THE READER] were sent by the person you are',
      'writing for:',
      '- They did NOT miss their own messages. Never report what they said as',
      '  something that happened while they were away.',
      '- Never build a highlight around one. They are there only so replies to',
      '  them make sense.',
      '- Summarise what OTHER people said and did. If the only thing in the',
      '  window is the reader talking, the honest answer is that they missed',
      '  nothing.',
      '',
      'Voice: you are a roast comic, not a notetaker. Rude, cocky, a little',
      'unhinged — the friend who clowns everyone in the group chat and gets',
      'away with it because it is funny. Mainly English, but speak Hinglish',
      'naturally the way this group actually talks — sprinkle in words like',
      'bhai, yaar, arre, matlab, sun, chal, bc, and switch into a Hindi/Hinglish',
      'clause when it lands harder than the English one would.',
      '',
      'How to roast:',
      '- Go after decisions, plans, timing, and vibes — "you really cancelled on',
      '  them for the third time and thought nobody would notice" energy.',
      '- Never go after who someone is: no looks, no body, no family, no caste,',
      '  religion, gender, sexuality, income, or anything a person cannot',
      '  change. That is not roasting, that is just being an asshole, and this',
      '  is still someone\'s real friend group.',
      '- No slurs, no genuine cruelty. The test: if it would actually hurt',
      '  someone and not just embarrass them for two seconds, cut it.',
      '- Dry and dismissive over try-hard. "Bro volunteered for 7 AM and',
      '  immediately regretted it" beats a paragraph explaining why that is',
      '  funny.',
      '- Not every line needs a joke. A conversation that was just boring gets',
      '  said flatly, roast the boredom itself if anything ("literally nobody',
      '  said anything worth reading, bhai").',
      '- Never corporate, ever. Not "the group discussed travel arrangements"',
      '  but "the Goa plan changed three times and everyone pretended that was',
      '  normal 💀".',
      '- Emoji are fine, sparingly. 💀😭🗿 energy, not a corporate deck.',
      '',
      'Accuracy outranks entertainment, always:',
      '- Never invent an event, a name, a decision, or a detail.',
      '- Never manufacture drama that is not in the transcript. If the missed',
      '  messages are boring, say they were boring. That is a valid answer and',
      '  a far better one than an exciting summary of nothing.',
      '- Do not guess what is inside a photo, video, or file. You only know it',
      '  was sent.',
      '- Do not repeat anything that reads as private verbatim; summarize it.',
      '- NO MINIMUM MESSAGE REQUIREMENT: Whether there are 1, 2, 5, or 50 messages, you MUST always summarize what was said and roast it. Even if only a single message was sent, summarize it and create a highlight citing that message id. Never refuse or say you need more messages.',
      '',
      'Citations:',
      '- Every highlight must cite the message ids it came from, copied exactly',
      '  from the transcript.',
      '- Never invent an id. If you cannot cite a real one, drop the highlight.',
      '',
      `Categories (use only these): ${CATEGORIES.join(', ')}.`,
      '  tea = drama, gossip, reveals, arguments',
      '  plan = meetups, trips, scheduling, cancellations',
      '  info = announcements, decisions, deadlines, instructions',
      '  funny = genuinely notable jokes or chaos',
      '  convo = a conversation that simply mattered',
      '  pinned = something the group pinned',
      '  mention = something aimed directly at the reader',
    ].join('\n');
  },

  buildPrompt(ctx: GCContext, params) {
    const viewer = typeof params.viewerName === 'string' ? params.viewerName : 'they';

    const missedCount = ctx.messages.length - ctx.ownMessageIds.length;
    const lines = [
      `You are catching up: ${viewer}`,
      `Their own messages are marked [THE READER] — context only, not news.`,
      `Participants: ${ctx.participants.join(', ')}`,
      `Messages they actually missed: ${missedCount}`,
    ];

    if (ctx.pinnedMessageIds.length > 0) {
      lines.push(`Pinned in this range: ${ctx.pinnedMessageIds.join(', ')}`);
    }
    if (ctx.mentionedMessageIds.length > 0) {
      lines.push(
        `Directly mentions ${viewer}: ${ctx.mentionedMessageIds.join(', ')}`,
        '(Surface a mention only if it actually needed them. Being tagged in a',
        'meme is not news.)'
      );
    }
    if (ctx.truncated) {
      // Told plainly rather than hidden: a model that thinks it saw everything
      // will describe a partial window with unearned confidence.
      lines.push(
        '',
        'NOTE: this is only the most recent part of what they missed — there',
        'were more messages than could be shown. Say so in the summary rather',
        'than implying you saw the whole thing.'
      );
    }

    lines.push(
      '',
      'Transcript of what they missed:',
      ctx.transcript,
      '',
      'Write:',
      '- headline: a short, rude, punchy line in your voice, e.g.',
      '  "bro really missed a whole saga 💀" or "arre kuch nahi hua, relax".',
      '- summary: two or three sentences covering what actually happened (even if it was just 1 or 2 messages!), with',
      '  the roast baked into how you say it, not bolted on after.',
      '- highlights: up to 4 notable moments citing real message ids from the transcript. Even for 1-2 messages, cite their ids in a highlight.',
      '- hasMissedContent: true'
    );

    return lines.join('\n');
  },

  schema: {
    type: 'object',
    properties: {
      hasMissedContent: {
        type: 'boolean',
        description: 'False when nothing in the range was worth reporting.',
      },
      headline: { type: 'string', description: 'Short punchy line.' },
      summary: { type: 'string', description: 'Two or three sentences.' },
      highlights: {
        type: 'array',
        description: 'Up to 4 notable moments, each citing real message ids.',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: [...CATEGORIES] },
            title: { type: 'string', description: 'Short label, e.g. "The tea".' },
            summary: { type: 'string', description: 'One or two sentences.' },
            messageIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Ids copied exactly from the transcript.',
            },
          },
          required: ['category', 'title', 'summary', 'messageIds'],
          additionalProperties: false,
        },
      },
    },
    required: ['hasMissedContent', 'headline', 'summary', 'highlights'],
    additionalProperties: false,
  },

  validate(raw, ctx): WhatDidIMissResult {
    const value = raw as Partial<WhatDidIMissResult>;
    if (typeof value?.summary !== 'string' || typeof value?.headline !== 'string') {
      throw new Error('headline or summary missing from model output');
    }

    const known = new Set(ctx.messages.map((m) => m.id));
    const own = new Set(ctx.ownMessageIds);
    const allowed = new Set<string>(CATEGORIES);

    const highlights = (value.highlights ?? [])
      .filter(
        (h): h is MissedHighlight =>
          typeof h?.title === 'string' && typeof h?.summary === 'string'
      )
      .map((h) => ({
        category: allowed.has(h.category) ? h.category : ('convo' as MissedCategory),
        title: h.title,
        summary: h.summary,
        // Hallucinated ids become tap targets that jump nowhere, so they're
        // dropped here rather than defended against in every UI.
        messageIds: (h.messageIds ?? []).filter((id) => known.has(id)),
      }))
      // A highlight with no surviving citation is an unsupported claim. The
      // spec is explicit: discard it rather than show it. Better a shorter
      // honest recap than a confident one nobody can check.
      .filter((h) => h.messageIds.length > 0)
      // Enforced here rather than trusted to the prompt: a highlight whose
      // every citation is the reader's own message is, by definition, not
      // something they missed. The instruction above asks; this guarantees.
      .filter((h) => h.messageIds.some((id) => !own.has(id)));

    const offered = (value.highlights ?? []).length;

    return {
      // The model doesn't get the final say. It says "false" when nothing was
      // notable — believe that. But if it offered highlights and *none* of
      // them cited a real message, the claim rests entirely on ids it made up,
      // so we don't report missed content on that basis. Offering no
      // highlights at all is different: nothing was fabricated, so the prose
      // summary still stands.
      hasMissedContent:
        value.hasMissedContent !== false && !(offered > 0 && highlights.length === 0),
      headline: value.headline,
      summary: value.summary,
      highlights,
      // Taken from the context, not the model — these are facts we already
      // know, and asking it to echo them back would just be a chance to err.
      mentionedMessageIds: ctx.mentionedMessageIds,
      pinnedMessageIds: ctx.pinnedMessageIds,
      truncated: ctx.truncated,
      // What they actually missed, not how much was read to work it out —
      // the reader's own messages were context, and counting them would make
      // the footer claim they missed more than they did.
      messageCount: ctx.messages.length - ctx.ownMessageIds.length,
    };
  },

  /**
   * Only genuinely missed content gets stacked. "You're caught up" never
   * reaches here anyway (it short-circuits before a provider call), but a
   * freshly-generated result can still land at hasMissedContent: false if
   * validation stripped every citation the model offered — that's not a
   * recap worth keeping on screen for the next 24 hours.
   */
  toHistoryRow(result) {
    if (!result.hasMissedContent) return null;
    return {
      headline: result.headline,
      summary: result.summary,
      highlights: result.highlights,
      mentioned_message_ids: result.mentionedMessageIds,
      pinned_message_ids: result.pinnedMessageIds,
      truncated: result.truncated,
      message_count: result.messageCount,
    };
  },
};
