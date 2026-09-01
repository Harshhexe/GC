/**
 * Invite links — one shape, defined once.
 *
 * A GC has always had a six-character invite code, but sharing it meant the
 * other person had to read it, remember it, open the app, find the join tab and
 * type it in. Every one of those steps loses people, which matters more than
 * any single feature for an app whose value is other people being in the chat.
 *
 * The link carries the code so the whole sequence collapses into one tap.
 *
 * Two forms exist for one reason: `gc://` opens the installed app directly and
 * is what the landing page reaches for first, while the https form is what is
 * safe to paste into WhatsApp or Instagram, since a custom scheme in a message
 * is either unclickable or actively frightening. Both resolve to the same code.
 */

/** Where the web landing page lives. Matches CONFIRM_PAGE in gc-checkout. */
const WEB_ORIGIN = 'https://the-gc.vercel.app';

/** Registered in app.json as `scheme`. */
const APP_SCHEME = 'gc';

/**
 * Codes are six characters drawn from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
 * (see generate_invite_code) — deliberately no O/0 or I/1, so a code read
 * aloud survives being retyped. Validating against the wider A-Z0-9 set is
 * intentional: a link is not typed by hand, and rejecting a real code because
 * the alphabet later gains a character would be the worse failure.
 */
const CODE_PATTERN = /^[A-Z0-9]{6}$/;

export function isValidInviteCode(code: string | null | undefined): boolean {
  return !!code && CODE_PATTERN.test(code.trim().toUpperCase());
}

/** The link to put in front of a human. */
export function inviteLinkFor(code: string): string {
  return `${WEB_ORIGIN}/join/${encodeURIComponent(code.trim().toUpperCase())}`;
}

/** The link that opens the installed app directly, used by the landing page. */
export function inviteDeepLinkFor(code: string): string {
  return `${APP_SCHEME}://join/${encodeURIComponent(code.trim().toUpperCase())}`;
}

/** Ready-to-send message. The code is included in plain text on purpose: if the
 *  link is stripped by a messaging app, or opened on a device where GC is not
 *  installed, the code alone is still enough to join by hand. */
export function inviteMessageFor(code: string, groupName: string): string {
  return `Join "${groupName}" on GC\n\n${inviteLinkFor(code)}\n\nOr enter the code in the app: ${code.toUpperCase()}`;
}

/**
 * Pulls an invite code out of any URL the app can be opened with.
 *
 * Three shapes are accepted because the same invite arrives through three
 * different doors:
 *   gc://join/AB12CD                     — the landing page handing off
 *   https://the-gc.vercel.app/join/AB12CD — the link as shared
 *   https://the-gc.vercel.app/?join=AB12CD — the landing page continuing on
 *                                            the web, where the path is owned
 *                                            by the single-page app
 *
 * Returns null for anything else, so callers can pass every incoming URL
 * through this without checking first.
 */
export function inviteCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  let candidate: string | null = null;

  // ?join=CODE wins when present — it is the explicit form.
  const query = url.match(/[?&]join=([^&#]+)/i);
  if (query) {
    candidate = query[1];
  } else {
    // Otherwise take the segment after /join/, for both the https and the
    // gc:// shapes. `gc://join/CODE` has no leading slash before `join`, hence
    // the optional one.
    const path = url.match(/(?:^|\/|:)\/?join\/([^/?#]+)/i);
    if (path) candidate = path[1];
  }

  if (!candidate) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    // A malformed escape sequence is not a code; treat it as no match rather
    // than letting decodeURIComponent throw out of a link handler.
    decoded = candidate;
  }

  const normalised = decoded.trim().toUpperCase();
  return CODE_PATTERN.test(normalised) ? normalised : null;
}
