import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@^2.58.0';
import { GCAIError } from './errors.ts';

/**
 * Two clients, deliberately.
 *
 * `asUser` carries the caller's JWT and is subject to RLS — it's what proves
 * who they are and what they may see. `asService` bypasses RLS and is used
 * only after membership has been established, for the cache and usage tables
 * the client must never touch directly.
 *
 * `userId` is null only for the trusted scheduler path (see `authenticate`):
 * a weekly award belongs to the group, not to whoever happened to trigger the
 * cron tick, so there is no real "requesting user" to attribute it to.
 */
export type Clients = {
  asUser: SupabaseClient;
  asService: SupabaseClient;
  userId: string | null;
  /** True only for the trusted internal scheduler — never settable by a client. */
  isSystem: boolean;
};

export async function authenticate(req: Request): Promise<Clients> {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !anonKey || !serviceKey) {
    throw new GCAIError('internal', 'Supabase environment is not configured');
  }

  const asService = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The scheduler's own secret, checked in addition to (never instead of) the
  // platform's own JWT gate on this endpoint — pg_cron sends the service-role
  // key as the Authorization header to get past that gate, and this header
  // separately proves the call is really our own weekly job and not just
  // anyone who obtained a service key. Constant-time compare: this is a
  // secret-equality check, and a timing side-channel would defeat the point.
  const cronSecret = Deno.env.get('GC_AI_CRON_SECRET');
  const provided = req.headers.get('x-cron-secret');
  if (cronSecret && provided && timingSafeEqual(cronSecret, provided)) {
    return { asUser: asService, asService, userId: null, isSystem: true };
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new GCAIError('unauthorized', 'Missing Authorization header');
  }

  // The caller's own token, so every query this client makes is filtered by
  // the same RLS the app runs under — no privilege is gained by asking the AI.
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await asUser.auth.getUser();
  if (error || !data.user) {
    throw new GCAIError('unauthorized', error?.message ?? 'Invalid session');
  }

  return { asUser, asService, userId: data.user.id, isSystem: false };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Confirms the caller is actually in the group they're asking about.
 *
 * Checked explicitly rather than leaned on implicitly: RLS would already stop
 * them reading another group's messages, but this turns a silently empty
 * context into a clear 403, and it runs *before* any provider spend.
 *
 * Skipped for the system caller — it isn't impersonating a member, and
 * `group_id` in that path only ever comes from our own scheduler's query over
 * real groups, never from external input. A cheap existence check stands in.
 */
export async function assertGroupMembership(
  clients: Clients,
  groupId: unknown
): Promise<string> {
  if (typeof groupId !== 'string' || !groupId) {
    throw new GCAIError('invalid_request', 'groupId is required');
  }

  if (clients.isSystem) {
    const { data, error } = await clients.asService
      .from('groups')
      .select('id')
      .eq('id', groupId)
      .maybeSingle();
    if (error) throw new GCAIError('internal', `Group lookup failed: ${error.message}`);
    if (!data) throw new GCAIError('group_not_found', 'No such group');
    return groupId;
  }

  const { data, error } = await clients.asUser
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('user_id', clients.userId)
    .maybeSingle();

  if (error) throw new GCAIError('internal', `Membership check failed: ${error.message}`);
  if (!data) {
    // Same response whether the group doesn't exist or they simply aren't in
    // it — distinguishing the two would confirm a group's existence to a
    // stranger probing ids.
    throw new GCAIError('not_a_member', 'Caller is not a member of this group');
  }

  return groupId;
}
