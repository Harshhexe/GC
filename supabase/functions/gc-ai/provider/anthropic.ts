import Anthropic from 'npm:@anthropic-ai/sdk@^0.68.0';
import { config } from '../config.ts';
import { GCAIError } from '../errors.ts';
import type { AICompletionRequest, AICompletionResult, AIProvider } from './types.ts';

/**
 * Anthropic implementation of the provider seam.
 *
 * The API key is read from the function's environment and never leaves it —
 * this module only ever runs inside the edge function, which is why the
 * client's request carries an operation name and nothing else.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  #client: Anthropic;

  constructor() {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      // A misconfigured deploy shouldn't look like a model outage.
      throw new GCAIError('provider_unavailable', 'ANTHROPIC_API_KEY is not set');
    }
    this.#client = new Anthropic({ apiKey });
  }

  async complete<T>(request: AICompletionRequest): Promise<AICompletionResult<T>> {
    let response;
    try {
      response = await this.#client.messages.create({
        model: config.model,
        max_tokens: request.maxOutputTokens,
        system: request.system,
        // Structured output rather than prose: the UI needs message ids it can
        // attach taps to, and parsing those out of free text would be a
        // guessing game. The schema is enforced by the API, not by us.
        output_config: {
          format: {
            type: 'json_schema',
            schema: request.schema,
          },
        },
        messages: [{ role: 'user', content: request.prompt }],
      });
    } catch (error) {
      throw translateProviderError(error);
    }

    // A refusal is a successful HTTP response with no usable content — check
    // before reading, or this throws on `content[0]` with a confusing message.
    if (response.stop_reason === 'refusal') {
      throw new GCAIError('invalid_ai_response', 'Model declined the request');
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    if (!text.trim()) {
      throw new GCAIError('invalid_ai_response', 'Model returned no content');
    }

    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      // Schema-constrained output makes this close to impossible, but a
      // truncated response (hit max_tokens mid-object) lands here — better a
      // typed error than a crash inside an operation's formatter.
      throw new GCAIError('invalid_ai_response', 'Model output was not valid JSON');
    }

    return {
      data,
      usage: {
        inputTokens: response.usage.input_tokens ?? 0,
        outputTokens: response.usage.output_tokens ?? 0,
      },
      model: response.model ?? config.model,
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

  if (status === 429) return new GCAIError('rate_limited', message, 60);
  if (status === 401 || status === 403) {
    // The user's credentials are fine — ours aren't. Presenting this as an
    // auth error would send them to a sign-in screen that can't help.
    return new GCAIError('provider_unavailable', `Provider rejected our credentials: ${message}`);
  }
  if (status === 408 || status === 504) return new GCAIError('provider_timeout', message);
  if (status && status >= 500) return new GCAIError('provider_unavailable', message);
  if (status === 400) return new GCAIError('invalid_request', message);

  return new GCAIError('provider_unavailable', message);
}
