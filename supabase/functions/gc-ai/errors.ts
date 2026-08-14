/**
 * Every failure the client can see, as a closed set.
 *
 * The client renders copy from the `code`, never from `message` — so a
 * provider's raw error text can never reach a user, and a new failure mode
 * can't leak internals by accident. `message` exists for logs only.
 */
export type GCAIErrorCode =
  | 'unauthorized'
  | 'not_a_member'
  | 'group_not_found'
  | 'unknown_operation'
  | 'invalid_request'
  | 'rate_limited'
  | 'empty_context'
  | 'context_too_large'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'invalid_ai_response'
  | 'internal';

const STATUS: Record<GCAIErrorCode, number> = {
  unauthorized: 401,
  not_a_member: 403,
  group_not_found: 404,
  unknown_operation: 400,
  invalid_request: 400,
  rate_limited: 429,
  empty_context: 422,
  context_too_large: 413,
  provider_unavailable: 503,
  provider_timeout: 504,
  invalid_ai_response: 502,
  internal: 500,
};

/**
 * Which failures are worth trying again. Sent to the client so the UI can
 * offer a retry only when one could actually help — a "try again" button on
 * `not_a_member` is a lie.
 */
const RETRYABLE: ReadonlySet<GCAIErrorCode> = new Set([
  'rate_limited',
  'provider_unavailable',
  'provider_timeout',
  'invalid_ai_response',
  'internal',
]);

export class GCAIError extends Error {
  readonly code: GCAIErrorCode;
  /** Seconds until a retry could succeed; only set for rate limits. */
  readonly retryAfterSeconds?: number;

  constructor(code: GCAIErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'GCAIError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function errorResponse(error: unknown, headers: HeadersInit): Response {
  const gcError =
    error instanceof GCAIError
      ? error
      : new GCAIError('internal', error instanceof Error ? error.message : 'Unknown failure');

  // Logged server-side in full; the client sees only the code.
  console.error(`[gc-ai] ${gcError.code}: ${gcError.message}`);

  return new Response(
    JSON.stringify({
      ok: false,
      error: {
        code: gcError.code,
        retryable: RETRYABLE.has(gcError.code),
        retryAfterSeconds: gcError.retryAfterSeconds,
      },
    }),
    {
      status: STATUS[gcError.code],
      headers: { ...headers, 'Content-Type': 'application/json' },
    }
  );
}
