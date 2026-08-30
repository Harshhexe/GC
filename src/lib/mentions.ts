import type { GroupMember, Mention } from '../types';

/** The literal token for "notify everyone" — stored the same shape as a real
 *  mention's username so the same parsing/rendering code handles both. */
export const EVERYONE_TOKEN = 'everyone';

const QUERY_CHAR = /[^\s@]/;

export type ActiveMentionQuery = { start: number; query: string };

/**
 * Finds the @query currently under the cursor, e.g. typing "hey @ha|" (cursor
 * at |) returns { start: 4, query: 'ha' }. Requires whitespace/start-of-string
 * immediately before the @ — that's what keeps "email@test.com" from ever
 * being read as a mention attempt.
 */
export function findActiveMentionQuery(text: string, cursor: number): ActiveMentionQuery | null {
  if (cursor < 0 || cursor > text.length) return null;
  let i = cursor - 1;
  while (i >= 0 && QUERY_CHAR.test(text[i])) i--;
  if (i < 0 || text[i] !== '@') return null;
  const before = text[i - 1];
  if (before !== undefined && !/\s/.test(before)) return null;
  return { start: i, query: text.slice(i + 1, cursor) };
}

/**
 * Replaces the active @query with `@{token} ` and reports where the cursor
 * should land afterward. `token` is whatever gets shown and later re-found in
 * the text (this app inserts the display name, e.g. "@Harsh Dhiman") — every
 * match below is a literal substring search, never a word-boundary regex, so
 * a token containing spaces still matches correctly.
 */
export function insertMentionToken(
  text: string,
  active: ActiveMentionQuery,
  token: string
): { text: string; cursor: number } {
  const insertion = `@${token} `;
  const nextText =
    text.slice(0, active.start) + insertion + text.slice(active.start + 1 + active.query.length);
  return { text: nextText, cursor: active.start + insertion.length };
}

/**
 * The source of truth for what a message actually mentions — derived from
 * the composer text plus every member ever selected via the picker this
 * compose/edit session. Deleting the "@username " text after inserting it
 * silently drops that mention here, so it's never sent or notified.
 */
export function deriveMentionsFromText(
  text: string,
  candidates: Mention[]
): { mentions: Mention[]; mentionEveryone: boolean } {
  const seen = new Set<string>();
  const mentions: Mention[] = [];
  for (const c of candidates) {
    if (seen.has(c.userId)) continue;
    if (text.toLowerCase().includes(`@${c.username.toLowerCase()}`)) {
      seen.add(c.userId);
      mentions.push(c);
    }
  }
  const mentionEveryone = /@everyone\b/i.test(text);
  return { mentions, mentionEveryone };
}

/** Members ranked for the suggestion dropdown: exact match, then
 *  prefix match, then substring — username and display name both count. */
export function filterMembersForQuery(
  members: GroupMember[],
  query: string,
  excludeUserId?: string
): GroupMember[] {
  const pool = excludeUserId ? members.filter((m) => m.id !== excludeUserId) : members;
  const q = query.trim().toLowerCase();
  if (!q) return pool.slice(0, 20);

  const ranked = pool
    .map((m) => {
      const uname = m.username.toLowerCase();
      const dname = m.displayName.toLowerCase();
      let score = -1;
      if (uname === q || dname === q) score = 0;
      else if (uname.startsWith(q) || dname.startsWith(q)) score = 1;
      else if (uname.includes(q) || dname.includes(q)) score = 2;
      return { m, score };
    })
    .filter((r) => r.score >= 0)
    .sort((a, b) => a.score - b.score || a.m.displayName.localeCompare(b.m.displayName));

  return ranked.slice(0, 20).map((r) => r.m);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const GC_TOKEN = 'gc';

export type MentionSegment =
  | { type: 'text'; key: string; value: string }
  | {
      type: 'mention';
      key: string;
      value: string;
      userId: string | null;
      mentionKind: 'member' | 'everyone' | 'gc';
    };

/**
 * Splits message text into plain-text and mention runs for rendering. Uses
 * the message's *structured* mentions as the whitelist of what counts.
 * Also highlights @everyone and @gc case-insensitively whenever present.
 */
export function segmentMentionText(
  text: string,
  mentions: Mention[],
  mentionEveryone: boolean
): MentionSegment[] {
  const hasEveryone = mentionEveryone || /@everyone\b/i.test(text);
  const hasGC = /(?:^|\s)@gc\b/i.test(text);

  if (mentions.length === 0 && !hasEveryone && !hasGC) {
    return [{ type: 'text', key: 't0', value: text }];
  }

  const tokens: { username: string; userId: string | null; kind: 'member' | 'everyone' | 'gc' }[] =
    mentions.map((m) => ({
      username: m.username,
      userId: m.userId,
      kind: 'member' as const,
    }));

  if (hasEveryone) tokens.push({ username: EVERYONE_TOKEN, userId: null, kind: 'everyone' });
  if (hasGC) tokens.push({ username: GC_TOKEN, userId: null, kind: 'gc' });

  // Longest first so e.g. "@Harsh" alongside "@HarshK" never eats into the
  // longer name's match.
  tokens.sort((a, b) => b.username.length - a.username.length);

  const re = new RegExp(tokens.map((t) => `@${escapeRegExp(t.username)}\\b`).join('|'), 'gi');

  const segments: MentionSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', key: `t${i++}`, value: text.slice(lastIndex, match.index) });
    }
    const matchedUsername = match[0].slice(1).toLowerCase();
    const token = tokens.find((t) => t.username.toLowerCase() === matchedUsername);
    segments.push({
      type: 'mention',
      key: `m${i++}`,
      value: match[0],
      userId: token?.userId ?? null,
      mentionKind: token?.kind ?? 'member',
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', key: `t${i++}`, value: text.slice(lastIndex) });
  }
  return segments;
}
