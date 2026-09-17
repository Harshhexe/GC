import { GoogleGenAI } from 'npm:@google/genai@^2.17.1';
import { config } from '../config.ts';
import { GCAIError } from '../errors.ts';
import type { AICompletionRequest, AICompletionResult, AIProvider } from './types.ts';

/**
 * Google Gemini implementation of the provider seam.
 *
 * Same contract as the Anthropic one: take a system prompt, a prompt and a
 * JSON schema, return parsed data plus token counts. Everything vendor-shaped
 * — field names, error codes, refusal handling — is absorbed here so no
 * operation, and certainly no client, has to know which vendor is in use.
 *
 * The API key is read from the function's environment and never leaves it.
 *
 * Note on style: this SDK uses snake_case property names (`system_instruction`,
 * `generation_config`) rather than the camelCase usual in JS libraries. That's
 * genuinely what @google/genai expects — the names below are taken from the
 * package's own type definitions, not converted.
 */
function sanitizeSchemaForGemini(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForGemini);

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'additionalProperties') continue;
    clean[key] = sanitizeSchemaForGemini(value);
  }
  return clean;
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  #client: GoogleGenAI;

  constructor() {
    // GOOGLE_API_KEY is the SDK's own convention; GEMINI_API_KEY is what the
    // key is called in AI Studio, where people copy it from. Accept both so a
    // correct-looking secret name isn't silently ignored.
    const raw = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('GOOGLE_API_KEY');
    if (!raw) {
      // A misconfigured deploy shouldn't look like a model outage.
      throw new GCAIError('provider_unavailable', 'GEMINI_API_KEY is not set');
    }

    /*
     * Whitespace and wrapping quotes are stripped before the key is used.
     *
     * The value was previously passed exactly as stored, so a key set with a
     * trailing newline — which is what a copied line or `echo` leaves behind —
     * or with the quotes from a shell command captured into the value, was sent
     * to Google verbatim and came back as "API key not valid". That failure is
     * indistinguishable from a genuinely revoked key, which is an expensive
     * thing to be unable to tell apart during an outage.
     */
    const apiKey = raw.trim().replace(/^["']|["']$/g, '');

    /*
     * A sanity check on the stored value, logged once per cold start.
     *
     * This deliberately does NOT assert a key format. An earlier version
     * required "AIza" and 39 characters, which was the older Google key shape;
     * current AI Studio keys are issued as "AQ."-prefixed values of a different
     * length, so that check reported a perfectly valid key as malformed and
     * sent the investigation the wrong way. Google is the only authority on
     * whether a key is valid, and it says so plainly in the 400 body.
     *
     * What is still worth catching locally is a value that cannot be a
     * credential at all — empty after trimming, or short enough to be a label
     * or a fragment rather than a key. Nothing secret is logged: only the
     * length, and whether surrounding whitespace had to be removed.
     */
    if (apiKey.length < 20 || apiKey.length !== raw.length) {
      console.warn(
        `[gc-ai] api key looks wrong: length=${apiKey.length} (raw ${raw.length})` +
        `${apiKey.length !== raw.length ? ' — whitespace or quotes were stripped' : ''}`
      );
    }

    this.#client = new GoogleGenAI({ apiKey });
  }

  async complete<T>(request: AICompletionRequest): Promise<AICompletionResult<T>> {
    let interaction;
    try {
      interaction = await this.#client.interactions.create({
        model: config.model,
        input: request.prompt,
        system_instruction: request.system,
        // Structured output rather than prose: the UI needs message ids it can
        // attach taps to, and parsing those out of free text would be a
        // guessing game. Gemini enforces the schema server-side.
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: request.schema ? sanitizeSchemaForGemini(request.schema) : undefined,
        },
        generation_config: {
          max_output_tokens: request.maxOutputTokens,
          // Thinking tokens are billed as output AND count against
          // max_output_tokens, so an unbounded budget here truncates the JSON
          // mid-object and surfaces as `incomplete` — which is exactly what
          // was happening in production. Every GC operation is schema-guided
          // extraction and summarisation over a transcript, not a reasoning
          // problem, so a low budget costs nothing in quality and buys back
          // both the token headroom and a chunk of latency.
          thinking_level: 'low',
        },
        // Stateless. GC keeps its own history in Postgres, and letting the
        // provider retain group chat content would quietly widen where that
        // content lives — the exact thing the rest of this function avoids.
        store: false,
      });
    } catch (error) {
      throw translateProviderError(error);
    }

    // A non-completed interaction is a successful HTTP response with no usable
    // output — a safety block, an exhausted token budget, a platform fault.
    // Check before reading, or the JSON.parse below fails with a confusing
    // message that hides the real cause.
    if (interaction.status !== 'completed') {
      const detail = interaction.errors?.[0]?.message ?? interaction.status;
      // `incomplete` is overwhelmingly "hit max_output_tokens mid-object",
      // which is our configuration to fix rather than the user's problem to
      // retry forever — so say so in the log line, with the numbers needed to
      // act on it instead of a status word that requires a separate dig.
      const detailWithBudget =
        interaction.status === 'incomplete'
          ? `${detail}: likely hit max_output_tokens (budget ${request.maxOutputTokens}, ` +
            `used ${interaction.usage?.total_output_tokens ?? 0} output + ` +
            `${interaction.usage?.total_thought_tokens ?? 0} thinking)`
          : detail;

      throw new GCAIError(
        'invalid_ai_response',
        `Interaction did not complete (${detailWithBudget})`
      );
    }

    const rawText = interaction.output_text ?? '';
    if (!rawText.trim()) {
      throw new GCAIError('invalid_ai_response', 'Model returned no content');
    }

    const cleaned = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let data: T;
    try {
      data = JSON.parse(cleaned) as T;
    } catch {
      // Fallback: extract substring between first { and last }
      const startIdx = cleaned.indexOf('{');
      const endIdx = cleaned.lastIndexOf('}');
      if (startIdx >= 0 && endIdx > startIdx) {
        try {
          data = JSON.parse(cleaned.slice(startIdx, endIdx + 1)) as T;
        } catch {
          throw new GCAIError('invalid_ai_response', 'Model output was not valid JSON');
        }
      } else {
        throw new GCAIError('invalid_ai_response', 'Model output was not valid JSON');
      }
    }

    return {
      data,
      usage: {
        // Thinking tokens are billed as output but reported separately, so
        // adding them keeps the cost ledger honest for reasoning models.
        inputTokens: interaction.usage?.total_input_tokens ?? 0,
        outputTokens:
          (interaction.usage?.total_output_tokens ?? 0) +
          (interaction.usage?.total_thought_tokens ?? 0),
      },
      model: interaction.model ?? config.model,
    };
  }
}

/**
 * Provider failures become GC's own error vocabulary here, so nothing
 * downstream — including the client — ever sees a vendor's error shape.
 */
/**
 * Pulls whatever detail the SDK actually carries.
 *
 * @google/genai formats its message as `400 API error occurred: {...}` where
 * the braces are an httpMeta envelope that is usually empty, so the reason
 * Google gave — "model not found", "unsupported field", the actual complaint —
 * never reached the logs. A 401 and a bad model name looked identical: a bare
 * status and nothing else. Everything the error object holds is folded in here
 * so the next failure is diagnosable from one log line.
 */
function describeProviderError(error: unknown): string {
  const base = error instanceof Error ? error.message : String(error);
  const extra: string[] = [];
  const e = error as Record<string, unknown> | null;

  if (e && typeof e === 'object') {
    for (const key of ['status', 'code', 'statusText', 'name']) {
      const v = e[key];
      if (v !== undefined && v !== null) extra.push(`${key}=${String(v)}`);
    }
    // The response body is where Google's real message lives when the SDK
    // manages to attach it at all.
    for (const key of ['body', 'error', 'response', 'cause']) {
      const v = e[key];
      if (v === undefined || v === null) continue;
      try {
        const rendered = typeof v === 'string' ? v : JSON.stringify(v);
        if (rendered && rendered !== '{}' && rendered !== '""') {
          extra.push(`${key}=${rendered.slice(0, 600)}`);
        }
      } catch {
        // A circular or exotic value is not worth failing the error path for.
      }
    }
  }

  return extra.length ? `${base} | ${extra.join(' ')}` : base;
}

function translateProviderError(error: unknown): GCAIError {
  const status = (error as { status?: number })?.status;
  const message = describeProviderError(error);

  // 429 is the one users on the free tier will actually hit. Gemini's free
  // quota is per-day as well as per-minute, so the retry hint is deliberately
  // vague rather than promising a minute that might not be enough.
  if (status === 429) return new GCAIError('rate_limited', message, 60);
  if (status === 401 || status === 403) {
    // Our credentials are wrong, not the user's. Presenting this as an auth
    // error would send them to a sign-in screen that can't help.
    return new GCAIError('provider_unavailable', `Provider rejected our credentials: ${message}`);
  }
  if (status === 408 || status === 504) return new GCAIError('provider_timeout', message);
  if (status && status >= 500) return new GCAIError('provider_unavailable', message);
  if (status === 400) return new GCAIError('invalid_request', message);

  return new GCAIError('provider_unavailable', message);
}
