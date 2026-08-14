/**
 * Every cost and safety limit in one place, all environment-driven.
 *
 * Hard-coding these would mean a redeploy to react to a bill, and would let a
 * generous default ship silently. They're read once at module load — edge
 * functions are short-lived, so a config change takes effect on the next cold
 * start without any invalidation logic.
 */

function num(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function str(name: string, fallback: string): string {
  return Deno.env.get(name)?.trim() || fallback;
}

export const config = {
  /** Which provider implementation to construct. See provider/index.ts. */
  provider: str('GC_AI_PROVIDER', 'gemini'),

  /**
   * Pinned rather than defaulted-to-latest: a model change alters both cost
   * and output shape, so it should be a deliberate deploy-time decision.
   *
   * A Flash model by default because GC's AI budget is ₹0 — Gemini's free
   * tier covers these, and the operations here are summarisation, which is
   * squarely what Flash is for. Must be a model the configured provider
   * actually serves; the two move together.
   */
  model: str('GC_AI_MODEL', 'gemini-3.6-flash'),

  limits: {
    /**
     * How many messages may be pulled into one context. The single most
     * important cost lever — a GC with 100k messages must never send 100k
     * messages, so the context builder always slices rather than scanning.
     */
    maxMessagesPerRequest: num('GC_AI_MAX_MESSAGES', 300),

    /**
     * Soft ceiling on rendered context size. Enforced by trimming oldest-first
     * before the request is sent, using a character-per-token estimate — the
     * real tokenizer lives behind a network call, and spending a request to
     * find out how big a request is defeats the purpose.
     */
    maxContextTokens: num('GC_AI_MAX_CONTEXT_TOKENS', 12_000),

    /** Ceiling on what the model may generate per operation. */
    maxOutputTokens: num('GC_AI_MAX_OUTPUT_TOKENS', 2_000),

    /** Rate limits, counted from ai_usage over a rolling window. */
    requestsPerUserPerHour: num('GC_AI_MAX_REQUESTS_PER_USER', 20),
    requestsPerGroupPerHour: num('GC_AI_MAX_REQUESTS_PER_GROUP', 60),

    /** Upper bound on a single message's text before it's clipped. Keeps one
     *  pasted wall of text from consuming a whole context window. */
    maxCharsPerMessage: num('GC_AI_MAX_CHARS_PER_MESSAGE', 600),
  },

  cache: {
    /** How long a result stays reusable. Operations may shorten this. */
    ttlSeconds: num('GC_AI_CACHE_TTL_SECONDS', 15 * 60),
  },

  /**
   * Rough characters-per-token for the trim estimate. English prose sits
   * around 4; this is intentionally conservative so the estimate errs toward
   * trimming more rather than overshooting the real limit.
   */
  charsPerToken: num('GC_AI_CHARS_PER_TOKEN', 3.5),
} as const;

export type GCAIConfig = typeof config;
