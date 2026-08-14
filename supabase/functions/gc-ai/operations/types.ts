import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2.58.0';
import type { GCContext } from '../context/buildGCContext.ts';

/**
 * What every GC AI feature implements.
 *
 * The shape is deliberately narrow: an operation declares what context it
 * needs, writes its prompt, and names its output schema. It never talks to a
 * provider, never touches the cache, never checks membership — the runner
 * does all of that identically for every operation, so a new feature can't
 * accidentally skip an authorization check or a rate limit.
 */
export type AIOperation<TResult = unknown> = {
  /** Stable id used by the client, the cache key, and the usage ledger. */
  readonly name: string;

  /** What slice of conversation this operation needs. */
  readonly context: {
    /** Clamped by config.limits.maxMessagesPerRequest. */
    maxMessages?: number;
    /** Default lookback when the caller doesn't specify a window. */
    defaultLookbackHours?: number;
    /** Resolve which messages in the window are pinned. */
    includePinned?: boolean;
    /**
     * Scope cached results to the requesting user. Set when the output is
     * personal — otherwise two members hitting the same window would share a
     * result written to address one of them.
     */
    perViewer?: boolean;
  };

  /** Overrides the global cache TTL where an operation ages differently. */
  readonly cacheTtlSeconds?: number;

  /**
   * Decide the window from server-side state instead of a fixed lookback.
   *
   * What Did I Miss needs the user's own read boundary, which only the
   * database knows. Given the user's RLS-bound client so an operation can
   * never widen its own window beyond what the caller may read. Omit to use
   * `defaultLookbackHours`.
   */
  resolveWindow?(args: {
    db: SupabaseClient;
    groupId: string;
    userId: string;
    params: OperationParams;
  }): Promise<{ from?: string; to?: string }>;

  /**
   * What to return when the window holds nothing.
   *
   * For most operations an empty context is an error worth surfacing. For
   * What Did I Miss it's the good outcome — "you're caught up" — and it must
   * resolve without a provider call, since paying a model to tell the user
   * nothing happened is the one request most worth avoiding.
   */
  emptyResult?(params: OperationParams): TResult;

  /**
   * Append this result to the caller's `ai_recap_history` instead of only
   * caching it. Called once per freshly-generated (non-cached) result — a
   * cache hit means the same window was already stacked, so inserting again
   * would duplicate it.
   *
   * Return null to skip storing this particular result (e.g. nothing
   * meaningful happened). Operations that don't implement this are simply
   * never stacked — caching is still exactly what it was for them.
   */
  toHistoryRow?(result: TResult): Record<string, unknown> | null;

  /**
   * Upsert this result into `daily_recaps`, for results that describe the
   * whole group rather than one viewer — everyone sees the identical row, so
   * this is a table keyed by (group_id, date), not a per-user log.
   *
   * The runner upserts with `ignoreDuplicates`, so if two members trigger
   * this within moments of each other, the first insert wins and the second
   * is silently a no-op rather than a duplicate or an error. Called on both a
   * fresh generation and on `emptyResult()` — a quiet day is worth recording
   * too, so the next person to open the chat finds it already there instead
   * of re-deriving "nothing happened".
   */
  toDailyRecapRow?(
    result: TResult,
    params: OperationParams
  ): { date: string; row: Record<string, unknown> } | null;

  /** Server-side only — never shipped to the client. */
  buildSystemPrompt(): string;
  buildPrompt(ctx: GCContext, params: OperationParams): string;

  /** JSON Schema the model's output must satisfy. */
  readonly schema: Record<string, unknown>;

  /**
   * Last chance to reject a structurally valid but semantically wrong result
   * (e.g. citing message ids that weren't in the context). Returning the
   * value unchanged is a fine default.
   */
  validate(raw: unknown, ctx: GCContext, params: OperationParams): TResult;
};

/** Caller-supplied, operation-specific arguments. Always validated. */
export type OperationParams = Record<string, unknown>;

/**
 * Every operation's output carries the message ids that justify it.
 *
 * This is the contract that makes "tap an insight → jump to the message"
 * possible without a second navigation system: the ids are the same ids the
 * chat's existing jumpToMessage already takes.
 */
export type SourcedInsight = {
  text: string;
  sourceMessageIds: string[];
};
