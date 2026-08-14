/**
 * The seam between GC and whoever is generating text.
 *
 * Operations depend on this interface and nothing below it, so swapping model
 * or vendor is a change to one file in this folder rather than a change to
 * every AI feature. Nothing here mentions a vendor, a wire format, or a
 * message-block shape.
 */

export type AICompletionRequest = {
  /** Instructions for the model. Always server-authored — see operations/. */
  system: string;
  /** The rendered conversation context plus the operation's ask. */
  prompt: string;
  /**
   * JSON Schema the response must satisfy. Every GC operation asks for
   * structured output, so the UI renders fields rather than parsing prose.
   */
  schema: Record<string, unknown>;
  maxOutputTokens: number;
};

export type AICompletionResult<T = unknown> = {
  /** Already parsed and schema-shaped — providers never hand back raw text. */
  data: T;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** The model that actually served this, which may differ from the request
   *  (fallbacks). Recorded in ai_usage so cost attribution stays honest. */
  model: string;
};

export interface AIProvider {
  /** Identifier recorded in ai_usage, e.g. "anthropic". */
  readonly name: string;
  complete<T>(request: AICompletionRequest): Promise<AICompletionResult<T>>;
}
