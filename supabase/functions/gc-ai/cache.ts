import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2.58.0';
import { config } from './config.ts';

/**
 * Result cache, keyed on (group, operation, context fingerprint).
 *
 * The fingerprint is what makes this safe: two users opening the same summary
 * seconds apart produce an identical hash and share one generation, while a
 * single new message changes the hash and forces a fresh one. No invalidation
 * logic, no staleness heuristics — the key simply stops matching.
 */

export type CacheLookup<T> = { hit: true; result: T; model: string } | { hit: false };

export async function readCache<T>(
  db: SupabaseClient,
  groupId: string,
  operation: string,
  contextHash: string
): Promise<CacheLookup<T>> {
  const { data, error } = await db
    .from('ai_cache')
    .select('result, model, expires_at')
    .eq('group_id', groupId)
    .eq('operation', operation)
    .eq('context_hash', contextHash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  // A cache failure must never fail the request — worst case we regenerate.
  if (error || !data) return { hit: false };
  return { hit: true, result: data.result as T, model: data.model };
}

export async function writeCache(
  db: SupabaseClient,
  params: {
    groupId: string;
    operation: string;
    contextHash: string;
    contextRange: string;
    result: unknown;
    model: string;
    ttlSeconds?: number;
  }
): Promise<void> {
  const ttl = params.ttlSeconds ?? config.cache.ttlSeconds;
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  const { error } = await db.from('ai_cache').upsert(
    {
      group_id: params.groupId,
      operation: params.operation,
      context_hash: params.contextHash,
      context_range: params.contextRange,
      result: params.result,
      model: params.model,
      expires_at: expiresAt,
    },
    { onConflict: 'group_id,operation,context_hash' }
  );

  // Logged, not thrown: the caller already has a valid answer in hand, and
  // failing the response because we couldn't memoize it would be absurd.
  if (error) console.error(`[gc-ai] cache write failed: ${error.message}`);
}
