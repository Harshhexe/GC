import { supabase } from './supabase';

export type PollOption = { id: string; text: string };

export type Poll = {
  id: string;
  groupId: string;
  messageId: string | null;
  question: string;
  options: PollOption[];
  allowMultiple: boolean;
  anonymous: boolean;
  /** Maintained server-side by trigger — never derived on the client, so two
   *  people can't disagree about the tally. */
  voteCounts: Record<string, number>;
  createdBy: string | null;
  createdAt: string;
};

export type PollDraft = {
  question: string;
  options: string[];
  allowMultiple: boolean;
  anonymous: boolean;
};

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 10;

type PollRow = {
  id: string;
  group_id: string;
  message_id: string | null;
  question: string;
  options: PollOption[];
  allow_multiple: boolean;
  anonymous: boolean;
  vote_counts: Record<string, number>;
  created_by: string | null;
  created_at: string;
};

export const POLL_COLUMNS =
  'id, group_id, message_id, question, options, allow_multiple, anonymous, vote_counts, created_by, created_at';

export function pollFromRow(row: PollRow): Poll {
  return {
    id: row.id,
    groupId: row.group_id,
    messageId: row.message_id,
    question: row.question,
    options: Array.isArray(row.options) ? row.options : [],
    allowMultiple: row.allow_multiple,
    anonymous: row.anonymous,
    voteCounts: row.vote_counts ?? {},
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/**
 * Cleans a draft into something creatable, or explains why it isn't.
 *
 * Shared by both creation paths on purpose: the manual composer and the
 * @gc-generated draft must be held to identical rules, or "make me a poll"
 * becomes a way to create polls the composer would have rejected.
 */
export function normalizeDraft(draft: PollDraft): { draft: PollDraft } | { error: string } {
  const question = draft.question.trim();
  if (!question) return { error: 'Give it a question first.' };

  const seen = new Set<string>();
  const options: string[] = [];
  for (const raw of draft.options) {
    const text = raw.trim();
    if (!text) continue;
    // Case-insensitive: two options that read the same are the same option,
    // and a poll offering "Pizza" and "pizza" is a bug the voter pays for.
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(text);
  }

  if (options.length < MIN_OPTIONS) return { error: `Needs at least ${MIN_OPTIONS} different options.` };
  if (options.length > MAX_OPTIONS) return { error: `That's more than ${MAX_OPTIONS} options.` };

  return { draft: { ...draft, question, options } };
}

/**
 * Creates the poll row. The carrier message is sent separately by the caller
 * and linked back — the poll has to exist first so the message has an id to
 * point at.
 */
export async function createPoll(
  groupId: string,
  userId: string,
  draft: PollDraft
): Promise<{ poll: Poll | null; error: string | null }> {
  const normalized = normalizeDraft(draft);
  if ('error' in normalized) return { poll: null, error: normalized.error };

  const options: PollOption[] = normalized.draft.options.map((text, i) => ({
    id: `o${i + 1}`,
    text,
  }));

  const { data, error } = await supabase
    .from('polls')
    .insert({
      group_id: groupId,
      question: normalized.draft.question,
      options,
      allow_multiple: normalized.draft.allowMultiple,
      anonymous: normalized.draft.anonymous,
      created_by: userId,
    })
    .select(POLL_COLUMNS)
    .single();

  if (error || !data) return { poll: null, error: error?.message ?? 'Could not create the poll.' };
  return { poll: pollFromRow(data as PollRow), error: null };
}

/** Replaces the caller's whole selection. An empty array retracts. */
export async function castVote(
  pollId: string,
  optionIds: string[]
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('poll_vote', {
    p_poll_id: pollId,
    p_option_ids: optionIds,
  });
  return { error: error?.message ?? null };
}

export type PollVoter = {
  userId: string;
  name: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
};

/**
 * Who voted for what, keyed by option id.
 *
 * The server refuses outright for anonymous polls, so this can be called
 * without the caller re-checking the flag — but the UI hides the entry point
 * anyway, because an affordance that only ever errors is worse than no
 * affordance.
 */
export async function fetchPollVoters(
  pollId: string
): Promise<{ voters: Record<string, PollVoter[]>; error: string | null }> {
  const { data, error } = await supabase.rpc('poll_voters', { p_poll_id: pollId });
  if (error) return { voters: {}, error: error.message };
  return { voters: (data ?? {}) as Record<string, PollVoter[]>, error: null };
}
