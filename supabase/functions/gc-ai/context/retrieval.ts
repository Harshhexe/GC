/**
 * Turning an @gc question into a database search.
 *
 * The whole point of this layer: search first, model second. Gemini reasons
 * over ~20 ranked messages rather than being handed a history and asked to
 * find things in it, which is what keeps a 50,000-message GC costing the same
 * as a 50-message one.
 */

/** Words too common to narrow a search — they'd pull noise, not the message. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'was', 'were', 'did', 'does', 'what', 'when', 'who', 'why',
  'how', 'where', 'this', 'that', 'they', 'them', 'there', 'here', 'about', 'said',
  'say', 'says', 'with', 'from', 'have', 'has', 'had', 'are', 'you', 'your', 'our',
  'we', 'us', 'me', 'my', 'it', 'is', 'in', 'on', 'at', 'to', 'of', 'a', 'an',
  'find', 'message', 'msg', 'search', 'gc', 'anyone', 'someone', 'tell', 'know',
  'think', 'let', 'get', 'got', 'can', 'will', 'would', 'been', 'being', 'his',
  'her', 'their', 'its', 'but', 'not', 'all', 'any', 'some', 'just', 'now', 'then',
  'talking', 'talked', 'mentioned', 'mention', 'ago', 'last', 'first',
]);

export type RetrievalPlan = {
  /** Content words, OR'd into the tsquery. */
  terms: string[];
  /** The question itself, for fuzzy and exact-phrase scoring. */
  phrase: string;
  /** Boost (never filter) messages from these people. */
  senderIds: string[];
  /** Bounds, only when the question actually named a period. */
  from?: string;
  to?: string;
};

/**
 * Content words of a question.
 *
 * Deliberately not stemmed here — Postgres does that with the same `english`
 * dictionary the index was built with, so doing it in TypeScript could only
 * disagree with it.
 */
export function extractTerms(question: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const word of question.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word.length < 3 || STOPWORDS.has(word) || seen.has(word)) continue;
    seen.add(word);
    terms.push(word);
    if (terms.length >= 8) break;
  }
  return terms;
}

/**
 * Names in the question that match someone in this GC.
 *
 * Matched against real members rather than guessed, so "what did Riya say"
 * boosts Riya's messages while "what did we decide" boosts nobody. Boost, not
 * filter: a question naming someone is usually still answered partly by what
 * others said back to them.
 */
export function detectSenders(
  question: string,
  members: { id: string; name: string }[]
): string[] {
  const haystack = ` ${question.toLowerCase()} `;
  const ids: string[] = [];

  for (const member of members) {
    const name = member.name.trim().toLowerCase();
    // Two characters would match half the alphabet inside other words.
    if (name.length < 3) continue;
    // Padded so "sam" doesn't fire on "same".
    if (haystack.includes(` ${name} `) || haystack.includes(` ${name}'`)) {
      ids.push(member.id);
    }
  }
  return ids;
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * A bounded search range, but only when the question actually asked for one.
 *
 * Returning nothing is the common and correct case: with no range the search
 * covers the entire history and lets ranking decide, which is the whole point
 * of the upgrade. Ranges are generous on purpose — they narrow the haystack,
 * they are not a precise filter, and clipping a day too early would hide the
 * exact message being asked about.
 */
export function detectTimeRange(question: string, now = new Date()): { from?: string; to?: string } {
  const q = question.toLowerCase();
  const day = 86_400_000;
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const range = (fromMs: number, toMs?: number) => ({
    from: new Date(fromMs).toISOString(),
    to: toMs === undefined ? undefined : new Date(toMs).toISOString(),
  });

  if (/\byesterday\b/.test(q)) return range(startOfToday - day, startOfToday + day);
  if (/\btoday\b/.test(q)) return range(startOfToday);

  // "two weeks ago" means around then, not since then — but the window stays
  // wide because people are vague about how long ago something was.
  const weeksAgo = q.match(/\b(\d+|a|two|three|four)\s+weeks?\s+ago\b/);
  if (weeksAgo) {
    const n = { a: 1, two: 2, three: 3, four: 4 }[weeksAgo[1]] ?? Number(weeksAgo[1]) ?? 1;
    return range(startOfToday - (n + 1) * 7 * day, startOfToday - (n - 1) * 7 * day);
  }

  const monthsAgo = q.match(/\b(\d+|a|two|three)\s+months?\s+ago\b/);
  if (monthsAgo) {
    const n = { a: 1, two: 2, three: 3 }[monthsAgo[1]] ?? Number(monthsAgo[1]) ?? 1;
    return range(startOfToday - (n + 1) * 31 * day, startOfToday - (n - 1) * 31 * day);
  }

  if (/\blast week\b/.test(q)) return range(startOfToday - 14 * day, startOfToday);
  if (/\bthis week\b/.test(q)) return range(startOfToday - 7 * day);
  if (/\blast month\b/.test(q)) return range(startOfToday - 62 * day, startOfToday);
  if (/\bthis month\b/.test(q)) return range(startOfToday - 31 * day);

  // "in June" — this year's June, or last year's if that hasn't happened yet.
  for (let i = 0; i < MONTHS.length; i++) {
    if (!new RegExp(`\\b${MONTHS[i]}\\b`).test(q)) continue;
    const year = i > now.getUTCMonth() ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    return range(Date.UTC(year, i, 1), Date.UTC(year, i + 1, 1));
  }

  return {};
}

export function buildRetrievalPlan(
  question: string,
  members: { id: string; name: string }[],
  now = new Date()
): RetrievalPlan {
  const { from, to } = detectTimeRange(question, now);
  return {
    terms: extractTerms(question),
    phrase: question.trim().slice(0, 200),
    senderIds: detectSenders(question, members),
    from,
    to,
  };
}
