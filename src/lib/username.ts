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

/** Matches the pattern the profiles_identity_rules trigger enforces. */
const USERNAME_PATTERN = /^[A-Za-z0-9._]{3,20}$/;

/** How long you have to wait between username changes. Mirrors the trigger. */
export const USERNAME_COOLDOWN_DAYS = 30;

/**
 * Client-side mirror of the trigger's format rule, so a bad name is caught
 * before it costs a round trip. Returns null when the name is fine.
 */
export function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (!trimmed) return 'Pick a username first.';
  if (trimmed.length < 3) return 'Usernames need at least 3 characters.';
  if (trimmed.length > 20) return 'Usernames can be at most 20 characters.';
  if (!USERNAME_PATTERN.test(trimmed)) {
    return 'Usernames can only use letters, numbers, dots and underscores.';
  }
  return null;
}

export type UsernameCooldown = {
  /** False while the 30 days since the last change are still running. */
  canChange: boolean;
  /** When the next change becomes available; null when one is available now. */
  nextAllowedAt: Date | null;
  /** Whole days left, rounded up — 0 when a change is available. */
  daysRemaining: number;
};

/**
 * Works out whether the username is currently editable from the timestamp on
 * the profile. Purely for display and for disabling the field: the database
 * trigger is what actually enforces the rule, since the app is not a trust
 * boundary.
 */
export function usernameCooldown(changedAt: string | null | undefined): UsernameCooldown {
  if (!changedAt) return { canChange: true, nextAllowedAt: null, daysRemaining: 0 };

  const last = new Date(changedAt);
  if (Number.isNaN(last.getTime())) {
    // An unparseable timestamp shouldn't lock someone out — the trigger will
    // still refuse the write if the cooldown really is active.
    return { canChange: true, nextAllowedAt: null, daysRemaining: 0 };
  }

  const nextAllowedAt = new Date(last.getTime());
  nextAllowedAt.setDate(nextAllowedAt.getDate() + USERNAME_COOLDOWN_DAYS);

  const msLeft = nextAllowedAt.getTime() - Date.now();
  if (msLeft <= 0) return { canChange: true, nextAllowedAt: null, daysRemaining: 0 };

  return {
    canChange: false,
    nextAllowedAt,
    daysRemaining: Math.ceil(msLeft / (24 * 60 * 60 * 1000)),
  };
}

/**
 * Turns the identity trigger's machine-readable errors into copy. The cooldown
 * error carries the ISO timestamp of the next allowed change, which is more
 * authoritative than anything computed locally — it comes from the same clock
 * that enforced the refusal.
 */
export function friendlyProfileUpdateError(rawMessage: string): string {
  if (rawMessage.startsWith('USERNAME_COOLDOWN:')) {
    const iso = rawMessage.slice('USERNAME_COOLDOWN:'.length).trim();
    const when = new Date(iso);
    if (!Number.isNaN(when.getTime())) {
      return `You can change your username again on ${when.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}.`;
    }
    return `You can only change your username once every ${USERNAME_COOLDOWN_DAYS} days.`;
  }
  if (rawMessage.includes('USERNAME_INVALID')) {
    return 'Usernames can only use letters, numbers, dots and underscores (3–20 characters).';
  }
  if (rawMessage.includes('DISPLAY_NAME_EMPTY')) {
    return 'Your display name can’t be empty.';
  }
  // Both the case-insensitive index and the original UNIQUE constraint land here.
  if (rawMessage.includes('profiles_username') || rawMessage.includes('duplicate key')) {
    return 'That username is taken. Try another one.';
  }
  return rawMessage;
}

/**
 * Saves a display name and/or username. Only the fields that actually differ
 * are sent, so saving just the display name never trips the username cooldown.
 * Returns an error message, or null on success.
 */
export async function updateProfileIdentity(
  userId: string,
  changes: { displayName?: string; username?: string }
): Promise<string | null> {
  const patch: { display_name?: string; username?: string } = {};
  if (changes.displayName !== undefined) patch.display_name = changes.displayName.trim();
  if (changes.username !== undefined) patch.username = changes.username.trim();
  if (Object.keys(patch).length === 0) return null;

  if (patch.username !== undefined) {
    const invalid = validateUsername(patch.username);
    if (invalid) return invalid;

    // Cheap pre-check for the common collision. The unique index is what makes
    // this safe against a race — this only buys a better message.
    const available = await isUsernameAvailable(patch.username);
    if (available === false) return 'That username is taken. Try another one.';
  }

  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) return friendlyProfileUpdateError(error.message);
  return null;
}
