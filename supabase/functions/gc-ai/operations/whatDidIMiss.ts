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
    // You cannot miss your own messages. If nobody else spoke since the read
    // boundary, this resolves as "caught up" without a provider call.
    requireOthers: true,
    // The summary addresses the reader and flags mentions of them, so it must
    // not be served from a result computed for a different member.
    perViewer: true,
  },

  // A full day, not the global default. Freshness doesn't come from the TTL
  // here — it comes from the cache key: any new message changes ctx.hash and
  // forces a real regeneration regardless of TTL. So a long TTL costs
  // nothing in staleness and saves a full re-summarize every time the user
  // reopens the screen with nothing new to report.
  cacheTtlSeconds: 24 * 3600,

  /**
   * The missed window is whatever happened after this user's read boundary.
   *
   * `gc_missed_since` is the single source of truth for that boundary — the
   * same rule that `mark_group_read` maintains — so opening the chat (which
   * stamps last_read_at continuously) can't quietly move it. Called through
   * the user's own client, so it can only ever answer for the caller.
   */
  async resolveWindow({ db, groupId, userId }) {
    const { data, error } = await db.rpc('gc_missed_since', { p_group_id: groupId });
    if (error) {
      throw new GCAIError('internal', `Could not resolve read boundary: ${error.message}`);
    }

    const floor = new Date(Date.now() - MAX_LOOKBACK_DAYS * 86_400_000);
    const boundary = data ? new Date(data as string) : floor;

    // The *unread* mark, which is a different and always-later line than the
    // missed boundary above: gc_missed_since deliberately reaches back past
    // this sitting, while last_read_at is where the chat list's unread badge
    // counts from. The recap still covers the wider window — only the
    // "is this even worth summarising" check uses this, so the number it
    // quotes back is the same one the badge showed.
    let unreadSince: string | null = null;
    if (userId) {
      const { data: member } = await db
        .from('group_members')
        .select('last_read_at')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .maybeSingle();
      unreadSince = (member?.last_read_at as string | null) ?? null;
    }

    return {
      from: (boundary > floor ? boundary : floor).toISOString(),
      extraParams: { unreadSince },
    };
  },

  /**
   * Under a handful of messages, the honest answer is "scroll up" — so say
   * that, in this operation's own voice, without paying a model to summarise
   * something shorter than the summary would be.
   *
   * Counts only what the reader actually missed: `requireOthers` guarantees
   * somebody else spoke, but their own messages still sit in the window as
   * context for replies, and "you can't read 8 messages" is a worse roast when
   * three of them are theirs.
   *
   * Truncation is a hard override — if messages were dropped to fit the token
   * budget then the window was never small, and calling it trivial would
   * dismiss a genuinely busy stretch as nothing.
   */
  trivialResult(ctx, params) {
    if (ctx.truncated) return null;

    // Counted the same way the chat list's unread badge counts (see
    // unread_counts): after last_read_at, and not your own. Sizing this off
    // the recap window instead was wrong in a way that showed — the window
    // starts at prev_read_at, which reaches back before this sitting on
    // purpose, so a single unread message in a chat you had already opened
    // got roasted as three. The recap itself still covers the wider window;
    // it is only this count, and the number quoted back at the user, that
    // has to agree with the badge they just looked at.
    const unreadSince = typeof params.unreadSince === 'string' ? params.unreadSince : null;
    const missed = unreadSince
      ? ctx.messages.filter((m) => !m.isOwn && m.timestamp > unreadSince).length
      : ctx.messages.length - ctx.ownMessageIds.length;

    // 10+ genuinely missed: a real recap earns its keep, hand it to the model.
    if (missed >= MIN_MESSAGES_FOR_RECAP) return null;

    // The bug this exists to close: the badge can read 0 (nothing from
    // others since last_read_at) while the *recap* window — which starts
    // further back, at prev_read_at, on purpose — still holds a message or
    // two you already read earlier this sitting. That window isn't empty, so
    // buildGCContext never throws empty_context and emptyResult() never runs;
    // without this, a 0-unread open still reached the model. Badge-zero is
    // caught-up, full stop, regardless of what the wider window still holds.
    if (missed <= 0) return caughtUpResult();

    const plural = missed === 1 ? '' : 's';
    // Indexed by the count rather than randomised: the screen refetches on
    // every open, and a line that reshuffles each time reads like a bug.
    const roasts = [
      {
        headline: `${missed} message${plural}. Seriously?`,
        summary: `Bhai, you couldn't read ${missed} message${plural} yourself and came running to an AI? Scroll up. It takes nine seconds.`,
      },
      {
        headline: `You want a recap of ${missed} message${plural}?`,
        summary: `Arre that's not a backlog, that's a text. Scroll up and read it like a normal person, matlab come on.`,
      },
      {
        headline: `Absolutely not. ${missed} message${plural}?`,
        summary: `I'm not summarising ${missed} message${plural} for you. Use your eyes they came free with the phone, Ig you are not andha.`,
      },
      {
        headline: `${missed} message${plural} and you're here?`,
        summary: `Chal, scroll up. If ${missed} message${plural} is too much, the group chat isn't your real problem.`,
      },
    ];
    const roast = roasts[missed % roasts.length];

    return {
      // False on purpose: this is not a recap. It keeps the result out of
      // ai_recap_history (toHistoryRow returns null) and stops the screen
      // rendering it as a card with a ten-minute countdown.
      hasMissedContent: false,
      headline: roast.headline,
      summary: roast.summary,
      highlights: [],
      mentionedMessageIds: [],
      pinnedMessageIds: [],
      truncated: false,
      // The unread count, not the window size — this is the number the roast
      // just quoted, so anything else here would contradict it.
      messageCount: missed,
    };
  },

  /** Nothing after the boundary is the good case, not a failure. Also reused
   *  by trivialResult below for the badge-says-zero case, which is the same
   *  outcome reached a different way. */
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
