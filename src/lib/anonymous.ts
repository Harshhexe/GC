import { supabase } from './supabase';

/** How many anonymous messages one person gets per group per day. */
export const ANON_DAILY_LIMIT = 3;

/** The caller's local day, since the server's midnight is not the user's. */
function localDayBounds(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export type AnonSendResult =
  | { ok: true; remaining: number }
  | { ok: false; error: string; limitReached: boolean };

/**
 * Sends one anonymous message.
 *
 * Goes through an RPC rather than a plain insert because the messages insert
 * policy pins author_id to auth.uid(), and an anonymous message deliberately
 * has no author. The function re-checks membership and the daily allowance
 * server-side, so nothing here is trusted — this is only the caller.
 */
export async function sendAnonymousMessage(
  groupId: string,
  text: string
): Promise<AnonSendResult> {
  const { start, end } = localDayBounds();
  const { data, error } = await supabase.rpc('send_anonymous_message', {
    p_group_id: groupId,
    p_text: text,
    p_day_start: start,
    p_day_end: end,
    p_daily_limit: ANON_DAILY_LIMIT,
  });

  if (error) {
    const limitReached = error.message.includes('ANON_LIMIT_REACHED');
    return {
      ok: false,
      limitReached,
      error: limitReached
        ? `You've used all ${ANON_DAILY_LIMIT} anonymous messages for today.`
        : 'Could not send that anonymously — try again.',
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, remaining: row?.remaining ?? 0 };
}

/** How many the caller has left today. Only ever reads their own count. */
export async function anonymousRemaining(groupId: string): Promise<number> {
  const { start, end } = localDayBounds();
  const { data, error } = await supabase.rpc('anonymous_messages_remaining', {
    p_group_id: groupId,
    p_day_start: start,
    p_day_end: end,
    p_daily_limit: ANON_DAILY_LIMIT,
  });
  if (error || typeof data !== 'number') return ANON_DAILY_LIMIT;
  return data;
}
