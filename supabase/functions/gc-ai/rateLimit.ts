import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2.58.0';
import { config } from './config.ts';
import { GCAIError } from './errors.ts';

const WINDOW_MS = 60 * 60 * 1000;

/**
 * Rolling-hour limits, counted from the usage ledger.
 *
 * Counting `ai_usage` rather than keeping a separate counter means the limit
 * is derived from the same record that proves what was spent — there's no
 * second source of truth to drift, and a restarted function loses nothing.
 * The table is service-role-only, so a client cannot delete its way out.
 *
 * Both limits are checked: per-user stops one person burning the budget, and
 * per-group stops a busy GC doing it collectively.
 */
export async function assertWithinRateLimits(
  db: SupabaseClient,
  params: {
    userId: string | null;
    groupId: string;
    operation: string;
    /** Operation-specific per-user ceiling; falls back to the global one. */
    perUserPerHour?: number;
  }
): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  // No per-user check for the scheduler (userId is null there): the weekly
  // job can legitimately fire for many groups within the same minute, and
  // that isn't the kind of runaway loop the per-user limit exists to catch.
  // The per-group limit still applies — one group still can't be regenerated
  // in a loop — so cost stays bounded either way.
  const [byUser, byGroup] = await Promise.all([
    params.userId
      ? db
          .from('ai_usage')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', params.userId)
          .eq('operation', params.operation)
          .gte('created_at', since)
      : Promise.resolve({ count: 0, error: null }),
    db
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', params.groupId)
      .gte('created_at', since),
  ]);

  // Fail open on a counting error. Refusing every AI request because a count
  // query hiccuped would be a worse outage than briefly over-serving.
  if (byUser.error || byGroup.error) {
    console.error(
      `[gc-ai] rate limit check failed: ${byUser.error?.message ?? byGroup.error?.message}`
    );
    return;
  }

  const userCeiling = params.perUserPerHour ?? config.limits.requestsPerUserPerHour;
  if (params.userId && (byUser.count ?? 0) >= userCeiling) {
    throw new GCAIError('rate_limited', 'Per-user hourly limit reached', 600);
  }
  if ((byGroup.count ?? 0) >= config.limits.requestsPerGroupPerHour) {
    throw new GCAIError('rate_limited', 'Per-group hourly limit reached', 600);
  }
}

/**
 * Records what a request cost. Written for cache hits and failures too — the
 * ledger is the rate-limit counter, so an un-logged request is a free one.
 */
export async function recordUsage(
  db: SupabaseClient,
  row: {
    userId: string | null;
    groupId: string;
    operation: string;
    model?: string | null;
    cacheHit: boolean;
    inputTokens?: number;
    outputTokens?: number;
    messageCount?: number;
    latencyMs?: number;
    errorCode?: string | null;
  }
): Promise<void> {
  const { error } = await db.from('ai_usage').insert({
    user_id: row.userId,
    group_id: row.groupId,
    operation: row.operation,
    model: row.model ?? null,
    cache_hit: row.cacheHit,
    input_tokens: row.inputTokens ?? 0,
    output_tokens: row.outputTokens ?? 0,
    message_count: row.messageCount ?? 0,
    latency_ms: row.latencyMs ?? null,
    error_code: row.errorCode ?? null,
  });

  if (error) console.error(`[gc-ai] usage write failed: ${error.message}`);
}
