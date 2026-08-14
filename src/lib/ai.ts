import { supabase } from './supabase';

/**
 * The client's entire AI surface.
 *
 * It can name an operation and a group — nothing else. No prompt, no model,
 * no message selection, and no API key: all of that lives in the `gc-ai` edge
 * function, which re-checks membership under the caller's own token before
 * spending anything. Adding a feature means adding an operation server-side
 * and a name to `AIOperationName`, not new client capability.
 */

export type AIOperationName =
  | 'test_summary'
  | 'what_did_i_miss'
  | 'daily_recap'
  // Planned — each needs a matching operation in supabase/functions/gc-ai.
  | 'tea_summary'
  | 'explain_lore'
  | 'find_receipt'
  | 'gc_command'
  | 'gc_awards'
  | 'gc_dna'
  | 'member_personality';

export type AIErrorCode =
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

export type AIError = {
  code: AIErrorCode;
  retryable: boolean;
  retryAfterSeconds?: number;
};

export type AIResponse<T> =
  | { ok: true; cached: boolean; operation: string; result: T }
  | { ok: false; error: AIError };

/** An AI claim tied back to the messages that support it. The ids are the
 *  same ids the chat's jumpToMessage already takes. */
export type SourcedInsight = {
  text: string;
  sourceMessageIds: string[];
};

export type TestSummaryResult = {
  summary: string;
  highlights: SourcedInsight[];
};

/** Badge categories the recap UI knows how to render. */
export type MissedCategory =
  | 'tea'
  | 'plan'
  | 'info'
  | 'funny'
  | 'convo'
  | 'pinned'
  | 'mention';

export type MissedHighlight = {
  category: MissedCategory;
  title: string;
  summary: string;
  /** Always real, server-validated ids — safe to pass to jumpToMessage. */
  messageIds: string[];
};

export type WhatDidIMissResult = {
  hasMissedContent: boolean;
  headline: string;
  summary: string;
  highlights: MissedHighlight[];
  mentionedMessageIds: string[];
  pinnedMessageIds: string[];
  /** The missed range was too long to summarize whole. */
  truncated: boolean;
  messageCount: number;
};

export type DailyRecapPerson = {
  userId: string;
  name: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  messageCount: number;
};

export type DailyRecapMessage = {
  messageId: string;
  sender: string;
  text: string;
  reactionCount: number;
};

export type DailyRecapPick = {
  caption: string;
  messageId: string;
};

export type DailyRecapResult = {
  date: string;
  totalMessages: number;
  truncated: boolean;
  userOfTheDay: DailyRecapPerson | null;
  messageOfTheDay: DailyRecapMessage | null;
  oneWord: string;
  bestTea: DailyRecapPick | null;
  mostUnhinged: DailyRecapPick | null;
};

/**
 * Copy for each failure, in GC's voice. Keyed by code rather than by the
 * server's message, so no provider error text can ever surface to a user.
 */
const ERROR_COPY: Record<AIErrorCode, string> = {
  unauthorized: 'Sign in again and give it another go.',
  not_a_member: "You're not in this GC anymore.",
  group_not_found: "Couldn't find that GC.",
  unknown_operation: "GC AI doesn't know how to do that yet.",
  invalid_request: 'Something about that request was off.',
  rate_limited: "You've been asking a lot. Give it a minute 😮‍💨",
  empty_context: 'Nothing to read here yet — go say something first.',
  context_too_large: "That's way too much chat to read at once.",
  provider_unavailable: 'GC AI is taking a nap 😭 Try again in a moment.',
  provider_timeout: 'GC AI took too long thinking. Try again.',
  invalid_ai_response: 'GC AI said something incoherent. Try again.',
  internal: 'Something broke on our end 💀 Try again in a moment.',
};

export function aiErrorMessage(error: AIError | null | undefined): string {
  if (!error) return ERROR_COPY.internal;
  return ERROR_COPY[error.code] ?? ERROR_COPY.internal;
}

/**
 * Calls the AI edge function. Never throws — every path resolves to an
 * `AIResponse`, so a screen can render an error state without a try/catch
 * around its own render logic.
 */
export async function invokeGCAI<T>(
  groupId: string,
  operation: AIOperationName,
  params?: Record<string, unknown>
): Promise<AIResponse<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('gc-ai', {
      body: { groupId, operation, params },
    });

    // A non-2xx carries our structured error in the body, which
    // functions.invoke surfaces as a generic FunctionsHttpError — dig the
    // real code out of the response rather than reporting a bare failure.
    if (error) {
      const parsed = await parseFunctionError(error);
      return { ok: false, error: parsed };
    }

    if (data && typeof data === 'object' && 'ok' in data) {
      return data as AIResponse<T>;
    }

    return { ok: false, error: { code: 'internal', retryable: true } };
  } catch {
    // Offline, DNS, TLS — indistinguishable from here and all worth retrying.
    return { ok: false, error: { code: 'provider_unavailable', retryable: true } };
  }
}

async function parseFunctionError(error: unknown): Promise<AIError> {
  const response = (error as { context?: Response })?.context;
  if (response && typeof response.json === 'function') {
    try {
      const body = await response.json();
      if (body?.error?.code) return body.error as AIError;
    } catch {
      // Fall through to the generic error below.
    }
  }
  return { code: 'internal', retryable: true };
}
