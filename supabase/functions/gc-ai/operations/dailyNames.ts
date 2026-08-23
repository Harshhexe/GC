import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2.58.0';
import type { GCContext } from '../context/buildGCContext.ts';
import type { AIOperation, OperationParams, ResolvedWindow } from './types.ts';

/**
 * 🏷️ Names every member of the GC for a day, from what they said.
 *
 * Someone who spent the day saying they had a fever becomes "The Patient";
 * whoever would not stop sending restaurant links becomes "The Reservation";
 * whoever said nothing at all still gets named, because being the person who
 * never speaks is itself the joke the group already makes.
 *
 * Distinct from Weekly Awards, which picks winners for a fixed list of
 * categories. Here the category itself is invented per person, so there is no
 * title table to draw from.
 *
 * Runs on a closed day — the same window the daily recap uses, with the client
 * sending its own local midnight boundary, since "yesterday" is a
 * timezone-dependent idea no server clock can guess. Because the window is
 * finished and immutable, the names are stable for the whole day rather than
 * re-rolling as new messages arrive, which is what makes them something the
 * group can argue about instead of a slot machine.
 */

export type DailyName = {
  userId: string;
  /** The title itself — a short noun phrase, not a sentence. */
  name: string;
  emoji: string;
  /** One line on why, in the group's own voice. */
  reason: string;
  /** Whether this person actually said anything that day. */
  spoke: boolean;
  /** Messages that earned it. Always empty for someone who was silent. */
  sourceMessageIds: string[];
};

export type DailyNamesResult = {
  date: string;
  totalMessages: number;
  /** GC's one-line read on the day, above the individual names. */
  headline: string;
  names: DailyName[];
};

type MemberRow = { user_id: string; profiles: { display_name: string | null } | null };
type Roster = { userId: string; displayName: string }[];

/** Long enough to be a joke, short enough to sit on a card. */
const MAX_NAME_CHARS = 24;
const MAX_REASON_CHARS = 120;

/**
 * Names for members who said nothing, used when the model skips someone.
 * Varied rather than a single "Ghost" so a quiet group doesn't render as ten
 * identical rows.
 */
const SILENT_FALLBACKS: { name: string; emoji: string; reason: string }[] = [
  { name: 'The Ghost', emoji: '👻', reason: 'Present in the group, absent from the chat.' },
  { name: 'Read Receipt', emoji: '👀', reason: 'Saw everything. Said nothing.' },
  { name: 'The Lurker', emoji: '🫥', reason: 'Watched the whole day go by without a word.' },
  { name: 'Silent Partner', emoji: '🤐', reason: 'Contributed exactly zero messages.' },
  { name: 'The Archivist', emoji: '📖', reason: 'Here to read, not to write.' },
];

function fallbackFor(index: number) {
  return SILENT_FALLBACKS[index % SILENT_FALLBACKS.length];
}

export const dailyNamesOperation: AIOperation<DailyNamesResult> = {
  name: 'daily_names',

  context: {
    maxMessages: 300,
    // Everyone sees the same names — a group artefact, not a personal read.
    perViewer: false,
  },

  // The day is closed by the time this runs, so a full day of caching costs
  // nothing in freshness. The daily_gc_names row is the real persistence;
  // this only stops a second provider call when two members open the tab in
  // the same instant, before the first upsert has landed.
  cacheTtlSeconds: 24 * 3600,

  /**
   * Everyone in the group, not just whoever spoke.
   *
   * The roster cannot come from the transcript: the whole point is to name
   * members whose messages are not in it, including members with no messages
   * at all. Read with the caller's own RLS-bound client, so this can only see
   * a group the caller is actually in.
   */
  async resolveWindow({
    db,
    groupId,
    params,
  }: {
    db: SupabaseClient;
    groupId: string;
    userId: string | null;
    params: OperationParams;
  }): Promise<ResolvedWindow> {
    const from = typeof params.from === 'string' ? params.from : undefined;
    const to = typeof params.to === 'string' ? params.to : undefined;
    const date = typeof params.date === 'string' ? params.date : '';

    const { data } = await db
      .from('group_members')
      .select('user_id, profiles(display_name)')
      .eq('group_id', groupId);

    const roster: Roster = ((data ?? []) as unknown as MemberRow[]).map((m) => ({
      userId: m.user_id,
      displayName: m.profiles?.display_name ?? 'Someone',
    }));

    return {
      from,
      to,
      // The date alone fingerprints the request: the window is closed, so the
      // same day always means the same names.
      cacheSeed: date,
      extraParams: { date, roster },
    };
  },

  emptyResult(params: OperationParams): DailyNamesResult {
    // Nobody spoke at all. Everyone is a ghost, and that needs no model call.
    const roster = (params.roster ?? []) as Roster;
    return {
      date: typeof params.date === 'string' ? params.date : '',
      totalMessages: 0,
      headline: 'Total silence. Not one message all day.',
      names: roster.map((m, i) => ({
        userId: m.userId,
        ...fallbackFor(i),
        spoke: false,
        sourceMessageIds: [],
      })),
    };
  },

  /**
   * Store the day's names for the whole group.
   *
   * Written with the service client on purpose: daily_gc_names has no client
   * write policy, so a name can only come from a generation that actually
   * read the day, never from whoever happened to open the tab.
   */
  async persistResult({ db, groupId, result }): Promise<void> {
    if (result.names.length === 0) return;
    await db.from('daily_gc_names').upsert(
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
      'You name every member of a group chat for one day, based on what they',
      'said. Think of the nickname the group would land on by the end of it.',
      '',
      'Rules:',
      '- Name EVERY person on the roster. Not only the talkative ones.',
      `- A name is a short noun phrase, at most ${MAX_NAME_CHARS} characters.`,
      '  "The Patient", "Reply Guy", "Menu Curator". Not a sentence, not an',
      '  adjective alone, and never just their real name back.',
      '- For someone who sent messages: the name must come from something they',
      '  actually said, and sourceMessageIds must cite the ids that earned it.',
      '- For someone who sent nothing: name them for the absence — ghost,',
      '  lurker, read-receipt energy — and leave sourceMessageIds empty. Do',
      '  not invent messages or traits for them.',
      '- One name per person. Never name the same person twice.',
      `- reason is one line, at most ${MAX_REASON_CHARS} characters, in the`,
      "  group's voice — dry and specific, not a compliment.",
      '',
      'Tone: affectionate teasing between friends. Roast the behaviour, never',
      "the person. Nothing about anyone's appearance, body, intelligence,",
      'race, gender, sexuality, religion, or health beyond what they',
      'themselves joked about. If the only material you have on someone is',
      'genuinely distressing — grief, illness described seriously, a crisis —',
      'give them a warm neutral name instead of a punchline.',
    ].join('\n');
  },

  buildPrompt(ctx: GCContext, params: OperationParams): string {
    const roster = (params.roster ?? []) as Roster;
    const spoke = new Set(ctx.messages.map((m) => m.senderId).filter(Boolean) as string[]);

    return [
      `Conversation (${ctx.range}):`,
      ctx.transcript || '(no messages)',
      '',
      ctx.truncated
        ? 'Note: this is a trimmed sample of a busier day, so judge only what you can see.'
        : '',
      '',
      'Everyone who must be named:',
      ...roster.map(
        (m) => `- ${m.displayName}${spoke.has(m.userId) ? '' : ' (sent nothing all day)'}`
      ),
      '',
      'Give every person above a name for the day, plus one headline for the',
      'day as a whole. Cite message ids for anyone who spoke.',
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
            member: { type: 'string' },
            name: { type: 'string' },
            emoji: { type: 'string' },
            reason: { type: 'string' },
            sourceMessageIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['member', 'name', 'emoji', 'reason', 'sourceMessageIds'],
          additionalProperties: false,
        },
      },
    },
    required: ['headline', 'names'],
    additionalProperties: false,
  },

  validate(raw, ctx, params): DailyNamesResult {
    const v = raw as { headline?: unknown; names?: unknown };
    const roster = (params.roster ?? []) as Roster;

    // Match on the roster's own display names rather than trusting the model
    // to echo a user id back.
    const idByName = new Map<string, string>();
    for (const m of roster) idByName.set(m.displayName.toLowerCase(), m.userId);

    const spoke = new Set(ctx.messages.map((m) => m.senderId).filter(Boolean) as string[]);
    const idsInContext = new Set(ctx.messages.map((m) => m.id));

    const byUser = new Map<string, DailyName>();

    for (const entry of Array.isArray(v.names) ? v.names : []) {
      const e = entry as Record<string, unknown>;
      const member = typeof e.member === 'string' ? e.member.trim() : '';
      const userId = idByName.get(member.toLowerCase());
      if (!userId || byUser.has(userId)) continue;

      const name = typeof e.name === 'string' ? e.name.trim().slice(0, MAX_NAME_CHARS) : '';
      if (!name) continue;

      // Citations are the basis for trusting a name about someone who spoke,
      // so anything pointing outside the window is dropped. Someone silent has
      // nothing to cite, and requiring it would delete them from the card.
      const cited = (Array.isArray(e.sourceMessageIds) ? e.sourceMessageIds : [])
        .filter((id): id is string => typeof id === 'string' && idsInContext.has(id))
        .slice(0, 4);
      const didSpeak = spoke.has(userId);
      if (didSpeak && cited.length === 0) continue;

      byUser.set(userId, {
        userId,
        name,
        emoji: typeof e.emoji === 'string' && e.emoji.trim() ? e.emoji.trim().slice(0, 4) : '🏷️',
        reason: typeof e.reason === 'string' ? e.reason.trim().slice(0, MAX_REASON_CHARS) : '',
        spoke: didSpeak,
        sourceMessageIds: didSpeak ? cited : [],
      });
    }

    // Anyone the model skipped, or whose name failed validation, still gets a
    // row: a card that silently omits half the group reads as a bug, and the
    // people most likely to be dropped are exactly the quiet ones this is
    // meant to include.
    let fallbackIndex = 0;
    const names: DailyName[] = roster.map((m) => {
      const existing = byUser.get(m.userId);
      if (existing) return existing;
      const fb = fallbackFor(fallbackIndex++);
      return {
        userId: m.userId,
        name: fb.name,
        emoji: fb.emoji,
        reason: spoke.has(m.userId) ? 'Hard to pin down today.' : fb.reason,
        spoke: spoke.has(m.userId),
        sourceMessageIds: [],
      };
    });

    // Speakers first — the names with real material behind them are the ones
    // worth reading, and the ghosts make a natural tail.
    names.sort((a, b) => Number(b.spoke) - Number(a.spoke));

    return {
      date: typeof params.date === 'string' ? params.date : '',
      totalMessages: ctx.totalAvailable,
      headline:
        typeof v.headline === 'string' && v.headline.trim()
          ? v.headline.trim()
          : 'Yesterday in the GC.',
      names,
    };
  },
};
