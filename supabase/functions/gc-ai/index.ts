import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2.58.0';
import { assertGroupMembership, authenticate } from './auth.ts';
import { readCache, writeCache } from './cache.ts';
import { config } from './config.ts';
import { buildGCContext } from './context/buildGCContext.ts';
import { GCAIError, errorResponse } from './errors.ts';
import { getOperation } from './operations/registry.ts';
import type { ResolvedWindow } from './operations/types.ts';
import { getProvider } from './provider/index.ts';
import { assertWithinRateLimits, recordUsage } from './rateLimit.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * The single AI endpoint.
 *
 * The client sends `{ groupId, operation, params? }` and nothing else — no
 * prompt, no model, no messages. Everything that costs money or touches
 * private data is decided here, which is what makes the client safe to ship:
 * there is no request it can construct that reads another group's history or
 * runs an operation the server doesn't know about.
 *
 * The order below is deliberate — each step is cheaper than the next, so the
 * expensive one only runs for requests that have earned it:
 *   auth → membership → rate limit → context → cache → provider → cache write
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const startedAt = Date.now();
  let clients: Awaited<ReturnType<typeof authenticate>> | null = null;
  let groupId = '';
  let operationName = '';
  // Hoisted so the catch block can let an operation record its own failure —
  // a Tea report that fails must leave a retryable session behind, not
  // vanish.
  let operation: ReturnType<typeof getOperation> | null = null;
  let params: Record<string, unknown> = {};

  try {
    if (req.method !== 'POST') {
      throw new GCAIError('invalid_request', 'Use POST');
    }

    let body: { groupId?: unknown; operation?: unknown; params?: unknown };
    try {
      body = await req.json();
    } catch {
      throw new GCAIError('invalid_request', 'Body must be JSON');
    }

    clients = await authenticate(req);
    groupId = await assertGroupMembership(clients, body.groupId);

    operation = getOperation(body.operation);
    operationName = operation.name;
    params = (body.params ?? {}) as Record<string, unknown>;

    // Before any spend, and counted from the same ledger that records it.
    await assertWithinRateLimits(clients.asService, {
      userId: clients.userId,
      groupId,
      operation: operationName,
      perUserPerHour: operation.perUserPerHour,
    });

    // An operation may derive its window from server-side state (What Did I
    // Miss reads the caller's own read boundary) rather than a fixed lookback.
    // Resolved with the user's client so it can't widen past what they may
    // read, and it wins over caller-supplied bounds — otherwise a client could
    // hand itself a window its read state doesn't justify.
    const lookbackHours = operation.context.defaultLookbackHours;
    const window: ResolvedWindow = operation.resolveWindow
      ? await operation.resolveWindow({
          db: clients.asUser,
          groupId,
          userId: clients.userId,
          params,
        })
      : {
          from:
            typeof params.from === 'string'
              ? params.from
              : lookbackHours
                ? new Date(Date.now() - lookbackHours * 3600_000).toISOString()
                : undefined,
          to: typeof params.to === 'string' ? params.to : undefined,
        };

    // Data an operation computed server-side (e.g. weekly awards' objective
    // stats) and wants both buildPrompt and validate to see, the same way
    // every other caller-supplied field in params does. Merged rather than
    // passed alongside so operations without this concept never notice it.
    if (window.extraParams) {
      params = { ...params, ...window.extraParams };
    }

    // Built with the *user's* client, so RLS still applies to the messages
    // that make it into the prompt — the AI never sees more than they can.
    let ctx;
    try {
      ctx = await buildGCContext({
        db: clients.asUser,
        groupId,
        userId: clients.userId,
        operation: operationName,
        // A resolved window may resize the request (@gc sizes it per intent);
        // the operation's static value is the fallback, and buildGCContext
        // still clamps whatever wins to the global ceiling.
        maxMessages: window.maxMessages ?? operation.context.maxMessages,
        includePinned: operation.context.includePinned,
        perViewer: operation.context.perViewer,
        requireOthers: operation.context.requireOthers,
        from: window.from,
        to: window.to,
        retrieval: window.retrieval,
        subjectUserId: window.subjectUserId,
        anchorMessageId: window.anchorMessageId,
        teaSessionId: window.teaSessionId,
        cacheSeed: window.cacheSeed,
      });
    } catch (error) {
      // For most operations an empty window is an error. For What Did I Miss
      // it's the answer — and it must cost nothing, since paying a model to
      // report that nothing happened is the least defensible request there is.
      if (
        error instanceof GCAIError &&
        error.code === 'empty_context' &&
        operation.emptyResult
      ) {
        const emptyResult = operation.emptyResult(params);

        // A quiet day is still worth recording for daily_recap — otherwise
        // every reopen re-derives "nothing happened" from scratch instead of
        // finding it already there.
        if (operation.toDailyRecapRow) {
          const daily = operation.toDailyRecapRow(emptyResult, params);
          if (daily) await upsertDailyRecap(clients.asService, groupId, daily);
        }

        // Opt-in only — see AIOperation.persistEmptyResult. Without it, a
        // silent group's day was recomputed fresh (for free — no provider
        // call either way) but never actually saved, so the cron's own
        // "not exists" dedupe saw it as still unnamed and would call it
        // again every single night, and the app would never render anything
        // for that day no matter how many times someone opened the tab.
        if (operation.persistResult && operation.persistEmptyResult) {
          await operation.persistResult({
            db: clients.asService,
            groupId,
            userId: clients.userId,
            params,
            result: emptyResult,
          });
        }

        await recordUsage(clients.asService, {
          userId: clients.userId,
          groupId,
          operation: operationName,
          cacheHit: false,
          messageCount: 0,
          latencyMs: Date.now() - startedAt,
        });

        return jsonResponse({
          ok: true,
          cached: false,
          operation: operationName,
          result: emptyResult,
        });
      }
      throw error;
    }

    // Before the cache is even consulted: a window too small to be worth
    // summarising is answered from the context itself. Cheaper than a cache
    // hit and, unlike one, costs nothing to get wrong — there is no generated
    // text to store or invalidate.
    if (operation.trivialResult) {
      const trivial = operation.trivialResult(ctx, params);
      if (trivial) {
        if (operationName === 'what_did_i_miss' && clients.userId) {
          await clients.asUser
            .rpc('gc_consume_missed_boundary', { p_group_id: groupId })
            .then(undefined, () => {});
        }

        await recordUsage(clients.asService, {
          userId: clients.userId,
          groupId,
          operation: operationName,
          cacheHit: false,
          messageCount: ctx.messages.length,
          latencyMs: Date.now() - startedAt,
        });

        return jsonResponse({
          ok: true,
          cached: false,
          operation: operationName,
          result: trivial,
        });
      }
    }

    const cached = await readCache(
      clients.asService,
      groupId,
      operationName,
      ctx.hash
    );

    if (cached.hit) {
      // Still logged: the ledger is the rate-limit counter, and a free hit
      // that doesn't count would let one user loop forever on a warm cache.
      await recordUsage(clients.asService, {
        userId: clients.userId,
        groupId,
        operation: operationName,
        model: cached.model,
        cacheHit: true,
        messageCount: ctx.messages.length,
        latencyMs: Date.now() - startedAt,
      });

      // Opt-in only — see AIOperation.persistOnCacheHit. Without it, a cache
      // hit for a result whose durable home is a different table than the
      // cache (daily_gc_names) would return the right answer to this caller
      // while never actually reaching that table.
      if (operation.persistResult && operation.persistOnCacheHit) {
        await operation.persistResult({
          db: clients.asService,
          groupId,
          userId: clients.userId,
          params,
          result: cached.result,
        });
      }

      return jsonResponse({
        ok: true,
        cached: true,
        operation: operationName,
        result: cached.result,
      });
    }

    // The caller's own name, read server-side rather than accepted from the
    // body. A client-supplied name would let anyone put arbitrary text into
    // the prompt, which is the cheapest prompt-injection surface there is.
    // Skipped for the scheduler — there is no "you" in a group-level award.
    let viewerName = 'you';
    if (clients.userId) {
      const { data: me } = await clients.asUser
        .from('profiles')
        .select('display_name')
        .eq('id', clients.userId)
        .maybeSingle();
      viewerName = (me as { display_name?: string } | null)?.display_name ?? 'you';
    }

    const promptParams = { ...params, viewerName };

    const provider = getProvider();
    const completion = await provider.complete({
      system: operation.buildSystemPrompt(),
      prompt: operation.buildPrompt(ctx, promptParams),
      schema: operation.schema,
      maxOutputTokens: operation.maxOutputTokens ?? config.limits.maxOutputTokens,
    });

    let result: unknown;
    try {
      result = operation.validate(completion.data, ctx, params);
    } catch (error) {
      throw new GCAIError(
        'invalid_ai_response',
        error instanceof Error ? error.message : 'Operation rejected the model output'
      );
    }

    await writeCache(clients.asService, {
      groupId,
      operation: operationName,
      contextHash: ctx.hash,
      contextRange: ctx.range,
      result,
      model: completion.model,
      ttlSeconds: operation.cacheTtlSeconds,
    });

    // Runs only here — on a genuinely fresh generation, never on a cache hit.
    // A cache hit means this exact window was already stacked once; inserting
    // again would duplicate the same card every time the screen reopens.
    if (operation.toHistoryRow) {
      const row = operation.toHistoryRow(result);
      if (row) {
        try {
          await clients.asService
            .from('ai_recap_history')
            .insert({ user_id: clients.userId, group_id: groupId, operation: operationName, ...row });
        } catch (e: unknown) {
          console.error(`[gc-ai] history insert failed: ${String(e)}`);
        }

        // Best-effort prune, scoped to this user+group so it stays cheap.
        // Failure here just means one group's history table grows a bit —
        // never worth failing the request over.
        await clients.asService
          .from('ai_recap_history')
          .delete()
          .eq('user_id', clients.userId)
          .eq('group_id', groupId)
          .lt('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())
          .then(undefined, () => {});
      }
    }

    // Group-shared results (daily_recap) go to a different table than
    // personal ones (ai_recap_history) — everyone reads the same row, so it's
    // keyed by (group, date) rather than (user, group).
    if (operation.toDailyRecapRow) {
      const daily = operation.toDailyRecapRow(result, params);
      if (daily) await upsertDailyRecap(clients.asService, groupId, daily);
    }

    // The general persistence hook. Uses the service-role client so an
    // operation can write to a table clients may read but never write —
    // a Tea report has to come from the server that generated it.
    if (operation.persistResult) {
      await operation.persistResult({
        db: clients.asService,
        groupId,
        userId: clients.userId,
        params,
        result,
      });
    }

    await recordUsage(clients.asService, {
      userId: clients.userId,
      groupId,
      operation: operationName,
      model: completion.model,
      cacheHit: false,
      inputTokens: completion.usage.inputTokens,
      outputTokens: completion.usage.outputTokens,
      messageCount: ctx.messages.length,
      latencyMs: Date.now() - startedAt,
    });

    // 🧬 GC DNA rides the weekly awards run rather than owning a scheduler.
    // Strictly after the awards are persisted above, so a DNA failure can
    // only ever cost the DNA — the awards are already committed and this is
    // wrapped so nothing it throws reaches the caller.
    if (operationName === 'weekly_gc_awards') {
      await generateDNAAfterAwards(groupId, params);
    }

    return jsonResponse({
      ok: true,
      cached: false,
      operation: operationName,
      result,
    });
  } catch (error) {
    // Failures are logged to the ledger too, so a provider outage is visible
    // as a pattern rather than only as user complaints. Best-effort: we only
    // have somewhere to write it once auth has succeeded.
    const code = error instanceof GCAIError ? error.code : 'internal';

    if (clients && groupId && operationName) {
      await recordUsage(clients.asService, {
        userId: clients.userId,
        groupId,
        operation: operationName,
        cacheHit: false,
        latencyMs: Date.now() - startedAt,
        errorCode: code,
      });

      // Let the operation mark its own record as failed, so the feature can
      // offer a retry instead of the work silently disappearing. Best-effort:
      // a failure here must not replace the original error.
      if (operation?.persistFailure) {
        try {
          await operation.persistFailure({ db: clients.asService, groupId, params, code });
        } catch (persistError) {
          console.error(`[gc-ai] persistFailure failed: ${String(persistError)}`);
        }
      }
    }
    return errorResponse(error, CORS);
  }
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/**
 * `ignoreDuplicates` makes the (group_id, recap_date) unique constraint do
 * the race-safety work: whichever of two near-simultaneous requests lands
 * first wins, the second is a silent no-op rather than a duplicate row or a
 * thrown constraint error.
 */
async function upsertDailyRecap(
  db: SupabaseClient,
  groupId: string,
  daily: { date: string; row: Record<string, unknown> }
): Promise<void> {
  await db
    .from('daily_recaps')
    .upsert(
      { group_id: groupId, recap_date: daily.date, ...daily.row },
      { onConflict: 'group_id,recap_date', ignoreDuplicates: true }
    )
    .then(undefined, (e: unknown) =>
      console.error(`[gc-ai] daily recap upsert failed: ${String(e)}`)
    );
}

/**
 * Runs 🧬 GC DNA immediately after a weekly awards generation.
 *
 * Chained here rather than given its own pg_cron entry: DNA is *derived from*
 * the awards, so it has to run after they exist, and two independent weekly
 * schedulers would race. Reusing the awards run also means one weekly cadence
 * to reason about instead of two.
 *
 * Implemented as a self-request rather than by calling the runner inline so
 * DNA gets the identical treatment every operation gets — auth, context,
 * caching, rate limiting, usage logging — instead of a second, subtly
 * different execution path that could skip one of them.
 *
 * Every failure is swallowed on purpose. The awards are already stored and
 * are the user-visible feature; DNA missing for a week is a gap in a profile,
 * while awards failing is a broken Sunday. Logged, never rethrown.
 */
async function generateDNAAfterAwards(
  groupId: string,
  params: Record<string, unknown>
): Promise<void> {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const cronSecret = Deno.env.get('GC_AI_CRON_SECRET');
    if (!url || !cronSecret) {
      console.error('[gc-ai] DNA skipped: missing SUPABASE_URL or GC_AI_CRON_SECRET');
      return;
    }

    // The snapshot is keyed by the awards week, so a rerun of the same week
    // lands on the same row instead of minting a second personality.
    const { weekStartDate, weekEndDate } = params;
    if (typeof weekStartDate !== 'string' || typeof weekEndDate !== 'string') {
      console.error('[gc-ai] DNA skipped: awards run had no week dates to key on');
      return;
    }

    const response = await fetch(`${url}/functions/v1/gc-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
      body: JSON.stringify({
        groupId,
        operation: 'gc_dna',
        params: { weekStartDate, weekEndDate },
      }),
    });

    if (!response.ok) {
      console.error(`[gc-ai] DNA generation returned ${response.status} for group ${groupId}`);
      return;
    }
    console.log(`[gc-ai] DNA updated for group ${groupId} (week of ${weekStartDate})`);
  } catch (error) {
    console.error(`[gc-ai] DNA generation failed (awards unaffected): ${String(error)}`);
  }
}
