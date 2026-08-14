import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@^2.58.0';
import { GCAIError } from './errors.ts';

/**
 * Two clients, deliberately.
 *
 * `asUser` carries the caller's JWT and is subject to RLS — it's what proves
 * who they are and what they may see. `asService` bypasses RLS and is used
 * only after membership has been established, for the cache and usage tables
 * the client must never touch directly.
 */
export type Clients = {
  asUser: SupabaseClient;
  asService: SupabaseClient;
  userId: string;
};

export async function authenticate(req: Request): Promise<Clients> {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !anonKey || !serviceKey) {
    throw new GCAIError('internal', 'Supabase environment is not configured');
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

  const asService = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { asUser, asService, userId: data.user.id };
}

/**
 * Confirms the caller is actually in the group they're asking about.
 *
 * Checked explicitly rather than leaned on implicitly: RLS would already stop
 * them reading another group's messages, but this turns a silently empty
 * context into a clear 403, and it runs *before* any provider spend.
 */
export async function assertGroupMembership(
  clients: Clients,
  groupId: unknown
): Promise<string> {
  if (typeof groupId !== 'string' || !groupId) {
    throw new GCAIError('invalid_request', 'groupId is required');
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
