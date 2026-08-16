/**
 * The `@gc` token — the AI's handle in the composer.
 *
 * Deliberately parsed separately from member mentions rather than added to
 * that system: a member mention resolves to a user id and notifies a person,
 * while this one routes the whole message somewhere else entirely instead of
 * sending it. Sharing the pipeline would mean every mention code path had to
 * ask "…unless it's the AI".
 */
export const GC_TOKEN = 'gc';

export type GCCommandParse = {
  /** Everything the user typed other than the @gc token itself. */
  question: string;
};

/**
 * `@gc` followed by a word character would be someone's name (@gcorge), so the
 * token only counts when the next character can't continue it. Same guard on
 * the left as the mention parser uses, which is what keeps an email address
 * from ever reading as a mention.
 */
const GC_TOKEN_RE = /(^|\s)@gc(?![\p{L}\p{N}_])/iu;

/** True when this draft should go to the AI instead of into the group chat. */
export function hasGCCommand(text: string): boolean {
  return GC_TOKEN_RE.test(text);
}

/**
 * Splits a draft into the AI question, or returns null if there's no @gc in it.
 *
 * Other mentions are left in the question text on purpose — "@Harsh @gc what
 * is happening" is a real thing someone types, and the names are context the
 * model can use, not noise to strip. They just don't notify anyone, because
 * the message never becomes a group message at all.
 */
export function parseGCCommand(text: string): GCCommandParse | null {
  if (!hasGCCommand(text)) return null;

  const question = text
    // Keep the leading whitespace group's spacing intact so words either side
    // of the token don't get glued together.
    .replace(GC_TOKEN_RE, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  return { question };
}

/** Does what the user has typed after "@" look like they're reaching for GC? */
export function matchesGCQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  return q.length > 0 ? GC_TOKEN.startsWith(q) : true;
}
