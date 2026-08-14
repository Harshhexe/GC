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
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  #client: GoogleGenAI;

  constructor() {
    // GOOGLE_API_KEY is the SDK's own convention; GEMINI_API_KEY is what the
    // key is called in AI Studio, where people copy it from. Accept both so a
    // correct-looking secret name isn't silently ignored.
    const apiKey = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('GOOGLE_API_KEY');
    if (!apiKey) {
      // A misconfigured deploy shouldn't look like a model outage.
      throw new GCAIError('provider_unavailable', 'GEMINI_API_KEY is not set');
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
          schema: request.schema,
        },
        generation_config: {
          max_output_tokens: request.maxOutputTokens,
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
      // `incomplete` is overwhelmingly "hit max_output_tokens mid-object", which
      // is our configuration to fix, not the user's problem to retry forever.
      throw new GCAIError(
        'invalid_ai_response',
        `Interaction did not complete (${detail})`
      );
    }

    const text = interaction.output_text ?? '';
    if (!text.trim()) {
      throw new GCAIError('invalid_ai_response', 'Model returned no content');
    }

    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      // Schema-constrained output makes this close to impossible, but a
      // truncated response lands here — better a typed error than a crash
      // inside an operation's validator.
      throw new GCAIError('invalid_ai_response', 'Model output was not valid JSON');
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
function translateProviderError(error: unknown): GCAIError {
  const status = (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message : 'Provider call failed';

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
