import { supabase } from './supabase';

/**
 * Turn the raw Postgres/GoTrue error from a failed sign-up into something a
 * person can act on. The trigger that creates a profile row can fail for
 * reasons that have nothing to do with auth itself (a taken username), but
 * GoTrue flattens all of them into "Database error saving new user" — so the
 * useful detail has to be recovered from the message text.
 */
export function friendlySignUpError(rawMessage: string): string {
  const msg = rawMessage.toLowerCase();
  if (msg.includes('profiles_username_key') || (msg.includes('username') && msg.includes('duplicate'))) {
    return 'That username is taken. Try another one.';
  }
  if (msg.includes('already registered') || msg.includes('user already exists')) {
    return 'An account with that email already exists — try signing in instead.';
  }
  if (msg.includes('database error saving new user')) {
    return 'That username is probably taken — try a different one.';
  }
  return rawMessage;
}

/**
 * Checked before submitting the sign-up form so the common case (name's
 * taken) never has to round-trip through a failed account creation. Backed by
 * a SECURITY DEFINER RPC because signed-out users have no RLS access to
 * `profiles` at all — this is the one lookup they're allowed to make pre-auth,
 * and it can only ever return true/false.
 */
export async function isUsernameAvailable(username: string): Promise<boolean | null> {
  const trimmed = username.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.rpc('username_available', { check_username: trimmed });
  if (error) return null; // Unknown — don't block signup on a network hiccup.
  return data as boolean;
}
