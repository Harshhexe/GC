import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2.58.0';
import { config } from '../config.ts';
import { GCAIError } from '../errors.ts';
import {
  estimateTokens,
  normalizeMessages,
  renderTranscript,
  type MessageRow,
  type NormalizedMessage,
} from './normalize.ts';

const MESSAGE_COLUMNS =
  'id, author_id, text, created_at, edited_at, is_deleted, reply_to_message_id, ' +
  'mentions, mention_everyone, media_type, media_name';

export type BuildContextParams = {
  db: SupabaseClient;
  groupId: string;
  /** Whose view this is — their hidden messages are excluded. */
  userId: string;
  operation: string;
  /** Inclusive lower bound. Omit for "the most recent N messages". */
  from?: string;
  /** Inclusive upper bound. */
  to?: string;
  /** Operation-specific cap, clamped to the global limit. */
  maxMessages?: number;
  /**
   * Fold the viewer into the cache fingerprint. Needed when the output is
   * personal to the requester (What Did I Miss addresses them by name and
   * flags mentions of them), since two members can otherwise share a window
   * and collide on a result written for someone else.
   */
  perViewer?: boolean;
  /** Also resolve which of these messages are pinned. One extra small query. */
  includePinned?: boolean;
};

export type GCContext = {
  messages: NormalizedMessage[];
  /** The rendered transcript handed to the provider. */
  transcript: string;
  /** Fingerprint of exactly this context — the cache key. */
  hash: string;
  /** Human-readable window, stored alongside cached results for debugging. */
  range: string;
  estimatedTokens: number;
  participants: string[];
  /**
   * True when messages were dropped to fit the token budget. Surfaced to the
   * prompt so the model can say the range was long rather than confidently
   * summarizing a window it only partly saw.
   */
  truncated: boolean;
  /** How many messages matched before trimming. */
  totalAvailable: number;
  /** Messages in this context that are pinned. Empty unless includePinned. */
  pinnedMessageIds: string[];
  /** Messages in this context that mention the viewer (or @everyone). */
  mentionedMessageIds: string[];
  /**
   * Display details for everyone who sent a message in this context, keyed by
   * user id. Separate from `nameFor` inside normalize.ts because that only
   * needs a string for the transcript — this is for operations that build a
   * UI card about a specific person (e.g. "user of the day") and need their
   * avatar too.
   */
  profilesById: Map<string, ProfileSummary>;
};

export type ProfileSummary = {
  name: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
};

/**
 * Assembles the conversation context for one operation.
 *
 * Deliberately independent of the provider: it returns text and a fingerprint,
 * and knows nothing about models, prompts, or vendors. An operation decides
 * *what* window it needs; this decides how to fetch it safely and cheaply.
 */
export async function buildGCContext(params: BuildContextParams): Promise<GCContext> {
  const { db, groupId, userId, operation } = params;

  const limit = Math.min(
    params.maxMessages ?? config.limits.maxMessagesPerRequest,
    config.limits.maxMessagesPerRequest
  );

  // Newest-first with a hard limit, then reversed — never an unbounded scan.
  // This is what keeps a million-message GC costing the same as a small one.
  // For a window query this also means we keep the *newest* slice of a huge
  // missed range, which is the half that still matters when you get back.
  let query = db
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('group_id', groupId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (params.from) query = query.gte('created_at', params.from);
  if (params.to) query = query.lte('created_at', params.to);

  const { data: rows, error } = await query;
  if (error) throw new GCAIError('internal', `Message fetch failed: ${error.message}`);

  const ordered = [...((rows ?? []) as MessageRow[])].reverse();
  if (ordered.length === 0) {
    throw new GCAIError('empty_context', 'No messages in the requested window');
  }

  // Hitting the page limit means older messages exist that we deliberately
  // didn't fetch — that's truncation just as much as trimming is.
  let truncated = ordered.length === limit;

  const messageIds = ordered.map((r) => r.id);
  const authorIds = Array.from(
    new Set(ordered.map((r) => r.author_id).filter((id): id is string => !!id))
  );

  // Small lookups in parallel rather than a join, matching how the app already
  // reads this data — and scoped to this page of messages, so they stay
  // proportional to the context rather than to the group's history.
  const [profiles, reactions, hidden, pinned] = await Promise.all([
    authorIds.length > 0
      ? db
          .from('profiles')
          .select('id, display_name, avatar_emoji, avatar_color, avatar_url')
          .in('id', authorIds)
      : Promise.resolve({ data: [] as ProfileRow[] }),
    db.from('message_reactions').select('message_id').in('message_id', messageIds),
    db
      .from('hidden_messages')
      .select('message_id')
      .eq('user_id', userId)
      .in('message_id', messageIds),
    params.includePinned
      ? db.from('pinned_messages').select('message_id').in('message_id', messageIds)
      : Promise.resolve({ data: [] as { message_id: string }[] }),
  ]);

  const profileRows = (profiles.data ?? []) as ProfileRow[];
  const nameById = new Map(profileRows.map((p) => [p.id, p.display_name]));
  const profilesById = new Map<string, ProfileSummary>(
    profileRows.map((p) => [
      p.id,
      {
        name: p.display_name,
        avatarEmoji: p.avatar_emoji,
        avatarColor: p.avatar_color,
        avatarUrl: p.avatar_url,
      },
    ])
  );

  const reactionsByMessage = new Map<string, number>();
  for (const r of (reactions.data ?? []) as { message_id: string }[]) {
    reactionsByMessage.set(r.message_id, (reactionsByMessage.get(r.message_id) ?? 0) + 1);
  }

  const hiddenIds = new Set(
    ((hidden.data ?? []) as { message_id: string }[]).map((r) => r.message_id)
  );

  let messages = normalizeMessages(ordered, nameById, reactionsByMessage, hiddenIds);
  if (messages.length === 0) {
    throw new GCAIError('empty_context', 'Nothing in this window the model can read');
  }

  const totalAvailable = messages.length;

  // Trim oldest-first until the estimate fits. Recency is what these features
  // are about, so the newest messages are the ones worth keeping.
  let transcript = renderTranscript(messages);
  while (
    estimateTokens(transcript) > config.limits.maxContextTokens &&
    messages.length > 1
  ) {
    messages = messages.slice(Math.ceil(messages.length * 0.15));
    transcript = renderTranscript(messages);
    truncated = true;
  }

  if (estimateTokens(transcript) > config.limits.maxContextTokens) {
    // One message alone blew the budget — clipping already ran, so this means
    // the limit is set impractically low rather than the data being odd.
    throw new GCAIError('context_too_large', 'Context exceeds the configured token limit');
  }

  // Resolved after trimming so these only ever name messages the model was
  // actually shown — a pinned id the model never saw would be an untappable
  // reference in the UI.
  const surviving = new Set(messages.map((m) => m.id));

  const pinnedMessageIds = ((pinned.data ?? []) as { message_id: string }[])
    .map((r) => r.message_id)
    .filter((id) => surviving.has(id));

  const mentionedMessageIds = ordered
    .filter((row) => {
      if (!surviving.has(row.id)) return false;
      if (row.mention_everyone) return true;
      return (row.mentions ?? []).some((m) => m.userId === userId);
    })
    .map((row) => row.id);

  const first = messages[0];
  const last = messages[messages.length - 1];
  const range = `${first.timestamp}..${last.timestamp} (${messages.length} messages)`;

  return {
    messages,
    transcript,
    hash: await hashContext(operation, messages, params.perViewer ? userId : null),
    range,
    estimatedTokens: estimateTokens(transcript),
    participants: Array.from(new Set(messages.map((m) => m.sender))),
    truncated,
    totalAvailable,
    pinnedMessageIds,
    mentionedMessageIds,
    profilesById,
  };
}

type ProfileRow = {
  id: string;
  display_name: string;
  avatar_emoji: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
};

/**
 * Fingerprints the exact context, so a cached result is reused only when the
 * input is genuinely identical.
 *
 * Built from message ids plus edit stamps rather than the rendered text: an
 * edited message changes the fingerprint (the summary should change too),
 * while a re-render of unchanged data does not. The operation name is folded
 * in so two operations over the same window never collide, and the viewer is
 * folded in for operations whose output is personal.
 */
async function hashContext(
  operation: string,
  messages: NormalizedMessage[],
  viewerId: string | null
): Promise<string> {
  const scope = viewerId ? `${operation}@${viewerId}` : operation;
  const seed = `${scope}|${messages.map((m) => `${m.id}:${m.timestamp}`).join(',')}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
