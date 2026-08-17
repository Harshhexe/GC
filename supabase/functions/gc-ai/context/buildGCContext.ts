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
import type { RetrievalPlan } from './retrieval.ts';

const MESSAGE_COLUMNS =
  'id, author_id, text, created_at, edited_at, is_deleted, reply_to_message_id, ' +
  'mentions, mention_everyone, media_type, media_name';

/** Ceiling on ranked hits pulled from history, so a broad question can't
 *  quietly drag the whole group into a prompt. */
const SEARCH_HIT_LIMIT = 20;

/** How many of those hits get their surrounding conversation fetched. */
const NEIGHBOURHOOD_ANCHORS = 6;

/** Messages either side of an anchor — enough to see what it answered. */
const NEIGHBOURHOOD_RADIUS = 3;

export type BuildContextParams = {
  db: SupabaseClient;
  groupId: string;
  /**
   * Whose view this is — their hidden messages are excluded.
   *
   * Null only for the scheduler's system calls: a weekly award has no single
   * viewer, so there's nothing to personalize (mentions, "own" messages,
   * hidden messages) around.
   */
  userId: string | null;
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
  /**
   * Extra text to fold into the cache fingerprint.
   *
   * Without this, two different @gc questions over an unchanged conversation
   * hash identically and the second would be served the first one's answer.
   * The window alone does not identify a request when the request includes a
   * question.
   */
  cacheSeed?: string;
  /**
   * Search the group's entire history and merge the best matches, plus the
   * conversation around each, into the window.
   *
   * "when did we decide Goa?" is answerable only by a message that may be
   * months outside any recency window, so recency alone cannot serve a
   * lookup. Ranking happens in the database; only the top handful and their
   * neighbours are ever loaded, and they're protected from token trimming —
   * dropping the one message the user asked about would defeat the query.
   */
  retrieval?: RetrievalPlan;
  /**
   * Centre the window on one specific message and its neighbours.
   *
   * This is what makes "reply to a message, ask @gc to explain it" work: the
   * message being asked about may be months old and nowhere near the recent
   * window, and on its own it's often meaningless anyway ("bro what") — the
   * conversation immediately around it is the actual answer. Anchor and
   * neighbours are protected from trimming.
   */
  anchorMessageId?: string;
  /**
   * Restrict the window to exactly one Tea session's messages.
   *
   * Membership comes from the column the insert trigger stamps, not from a
   * timestamp comparison — the boundary is then whatever the database
   * actually recorded at insert time, with no ambiguity about messages
   * landing on the same millisecond as the session ending.
   */
  teaSessionId?: string;
  /**
   * Treat a window with none of *other people's* messages as empty.
   *
   * For What Did I Miss the reader's own messages are context, never content
   * — so a window where only they spoke means they missed nothing.
   */
  requireOthers?: boolean;
  /**
   * Pull this person's own messages into the window, by authorship — not by
   * keyword.
   *
   * "describe Hari in one word" fails under the search path: `search_group_
   * messages` requires the question's words to appear IN a message, but
   * Hari's messages don't contain "describe" or "word", so a sender boost
   * has nothing to boost. Characterizing someone needs a sample of what they
   * actually said, not a lexical hit — so this fetches their most recent
   * messages directly by author_id, protected from trimming like a search hit.
   */
  subjectUserId?: string;
};

/** How many of a subject's own messages to pull in — enough to form an
 *  impression without turning "describe X" into "read me their history". */
const SUBJECT_MESSAGE_LIMIT = 40;

/** How many messages either side of an anchor come along with it. Enough to
 *  see what a short reply was reacting to, without pulling in a whole day. */
const ANCHOR_RADIUS = 12;

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
  /** Ids the viewer sent themselves — context, never "missed" content. */
  ownMessageIds: string[];
  /**
   * The message this request was pointed at, if one was requested and it
   * survived into the final context. Null when no anchor was asked for, or
   * when the id named nothing readable — so a prompt can tell the difference
   * between "no reply" and "replied to something I can't see".
   */
  anchorMessageId: string | null;
  /** The person a "describe X" question resolved to, once their own messages
   *  actually made it into the transcript. Null otherwise. */
  subjectUserId: string | null;
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

  if (params.teaSessionId) query = query.eq('tea_session_id', params.teaSessionId);
  if (params.from) query = query.gte('created_at', params.from);
  if (params.to) query = query.lte('created_at', params.to);

  const { data: rows, error } = await query;
  if (error) throw new GCAIError('internal', `Message fetch failed: ${error.message}`);

  const recent = (rows ?? []) as MessageRow[];

  // Keyword hits are fetched separately and merged: they're the messages the
  // question is *about*, and they usually sit outside the recent window
  // entirely. Searched with the user's own client, so RLS still decides what
  // is findable — a keyword can't surface a message they couldn't read.
  const searchHits: MessageRow[] = [];
  const plan = params.retrieval;

  if (plan && (plan.terms.length > 0 || plan.phrase)) {
    // Ranked in the database against the whole history. Both functions are
    // SECURITY INVOKER, so the caller's RLS — not a second membership check
    // written here — decides what is searchable at all.
    const { data: ranked, error: searchError } = await db.rpc('search_group_messages', {
      p_group_id: groupId,
      p_terms: plan.terms,
      p_phrase: plan.phrase,
      p_sender_ids: plan.senderIds.length > 0 ? plan.senderIds : null,
      p_from: plan.from ?? null,
      p_to: plan.to ?? null,
      p_limit: SEARCH_HIT_LIMIT,
    });

    if (searchError) {
      // Retrieval failing shouldn't take the whole answer down — the recent
      // window can still answer plenty. Logged so a broken index is visible.
      console.error(`[gc-ai] history search failed: ${searchError.message}`);
    }

    const hitIds = ((ranked ?? []) as { id: string }[]).map((r) => r.id);

    if (hitIds.length > 0) {
      // Only the strongest hits get their surrounding conversation — a lone
      // "yeah I booked it" is unreadable without what it answered, but
      // expanding all twenty would refill the window with noise.
      const anchors = hitIds.slice(0, NEIGHBOURHOOD_ANCHORS);

      const [{ data: neighbours }, { data: rest }] = await Promise.all([
        db.rpc('fetch_message_neighbourhoods', {
          p_group_id: groupId,
          p_ids: anchors,
          p_radius: NEIGHBOURHOOD_RADIUS,
        }),
        // The remaining hits are still worth showing, just without context.
        hitIds.length > anchors.length
          ? db
              .from('messages')
              .select(MESSAGE_COLUMNS)
              .in('id', hitIds.slice(NEIGHBOURHOOD_ANCHORS))
          : Promise.resolve({ data: [] as MessageRow[] }),
      ]);

      searchHits.push(
        ...((neighbours ?? []) as MessageRow[]),
        ...((rest ?? []) as MessageRow[])
      );
    }
  }

  // The anchored message plus the conversation around it. Fetched with the
  // user's client and re-scoped to this group, so a crafted id from another
  // group returns nothing rather than leaking a message.
  const anchorRows: MessageRow[] = [];
  if (params.anchorMessageId) {
    const { data: anchor } = await db
      .from('messages')
      .select(MESSAGE_COLUMNS)
      .eq('group_id', groupId)
      .eq('id', params.anchorMessageId)
      .eq('is_deleted', false)
      .maybeSingle();

    if (anchor) {
      const anchorRow = anchor as MessageRow;
      const [before, after] = await Promise.all([
        db
          .from('messages')
          .select(MESSAGE_COLUMNS)
          .eq('group_id', groupId)
          .eq('is_deleted', false)
          .lt('created_at', anchorRow.created_at)
          .order('created_at', { ascending: false })
          .limit(ANCHOR_RADIUS),
        db
          .from('messages')
          .select(MESSAGE_COLUMNS)
          .eq('group_id', groupId)
          .eq('is_deleted', false)
          .gt('created_at', anchorRow.created_at)
          .order('created_at', { ascending: true })
          .limit(ANCHOR_RADIUS),
      ]);

      anchorRows.push(
        anchorRow,
        ...((before.data ?? []) as MessageRow[]),
        ...((after.data ?? []) as MessageRow[])
      );
    }
  }

  // A person's own recent messages, fetched by authorship rather than by
  // matching the question's words against their content. RLS still applies —
  // the user's own client, scoped to this group — so this can never surface
  // more of that person's messages than the asker could already read.
  const subjectRows: MessageRow[] = [];
  if (params.subjectUserId) {
    const { data } = await db
      .from('messages')
      .select(MESSAGE_COLUMNS)
      .eq('group_id', groupId)
      .eq('author_id', params.subjectUserId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(SUBJECT_MESSAGE_LIMIT);
    subjectRows.push(...((data ?? []) as MessageRow[]));
  }

  const byIdRaw = new Map<string, MessageRow>();
  for (const row of [...recent, ...searchHits, ...anchorRows, ...subjectRows]) {
    byIdRaw.set(row.id, row);
  }

  const ordered = Array.from(byIdRaw.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  if (ordered.length === 0) {
    throw new GCAIError('empty_context', 'No messages in the requested window');
  }

  // Never trimmed away: these are the messages the question named, and the
  // one it was pointed directly at.
  const protectedIds = new Set([
    ...searchHits.map((r) => r.id),
    ...anchorRows.map((r) => r.id),
    ...subjectRows.map((r) => r.id),
  ]);

  // Hitting the page limit means older messages exist that we deliberately
  // didn't fetch — that's truncation just as much as trimming is.
  let truncated = recent.length === limit;

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
    // No viewer to hide anything from in the system path — a weekly award is
    // built for the whole group, not one person's filtered view of it.
    userId
      ? db
          .from('hidden_messages')
          .select('message_id')
          .eq('user_id', userId)
          .in('message_id', messageIds)
      : Promise.resolve({ data: [] as { message_id: string }[] }),
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

  let messages = normalizeMessages(
    ordered,
    nameById,
    reactionsByMessage,
    hiddenIds,
    userId ?? undefined
  );

  // For "what_did_i_miss", strictly exclude the viewer's own messages so the AI
  // gets ONLY other members' unread messages to summarize!
  if (params.operation === 'what_did_i_miss' && userId) {
    messages = messages.filter((m) => !m.isOwn && m.senderId !== userId);
  }

  if (messages.length === 0) {
    throw new GCAIError('empty_context', 'Nothing in this window the model can read');
  }

  const totalAvailable = messages.length;

  // Trim oldest-first until the estimate fits. Recency is what these features
  // are about, so the newest messages are the ones worth keeping — except for
  // keyword hits, which are kept regardless of age because they're the reason
  // the request was made at all.
  let transcript = renderTranscript(messages);
  while (
    estimateTokens(transcript) > config.limits.maxContextTokens &&
    messages.some((m) => !protectedIds.has(m.id))
  ) {
    const dropCount = Math.max(1, Math.ceil(messages.length * 0.15));
    let dropped = 0;
    messages = messages.filter((m) => {
      if (dropped >= dropCount || protectedIds.has(m.id)) return true;
      dropped += 1;
      return false;
    });
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

  // No viewer to be mentioned in the system path — a group-level award has no
  // "you" to flag.
  const mentionedMessageIds = userId
    ? ordered
        .filter((row) => {
          if (!surviving.has(row.id)) return false;
          if (row.mention_everyone) return true;
          return (row.mentions ?? []).some((m) => m.userId === userId);
        })
        .map((row) => row.id)
    : [];

  const first = messages[0];
  const last = messages[messages.length - 1];
  const range = `${first.timestamp}..${last.timestamp} (${messages.length} messages)`;

  return {
    messages,
    transcript,
    hash: await hashContext(
      operation,
      messages,
      params.perViewer ? userId : null,
      params.cacheSeed
    ),
    range,
    estimatedTokens: estimateTokens(transcript),
    participants: Array.from(new Set(messages.map((m) => m.sender))),
    truncated,
    totalAvailable,
    pinnedMessageIds,
    mentionedMessageIds,
    ownMessageIds: messages.filter((m) => m.isOwn).map((m) => m.id),
    // Only reported once it's actually in the transcript the model reads.
    anchorMessageId:
      params.anchorMessageId && surviving.has(params.anchorMessageId)
        ? params.anchorMessageId
        : null,
    subjectUserId:
      params.subjectUserId && messages.some((m) => m.senderId === params.subjectUserId)
        ? params.subjectUserId
        : null,
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
  viewerId: string | null,
  cacheSeed?: string
): Promise<string> {
  const scope = viewerId ? `${operation}@${viewerId}` : operation;
  const withSeed = cacheSeed ? `${scope}#${cacheSeed}` : scope;
  const seed = `${withSeed}|${messages.map((m) => `${m.id}:${m.timestamp}`).join(',')}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
