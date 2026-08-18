import { Platform } from 'react-native';

/**
 * Browser notifications for the web build.
 *
 * Deliberately the Notification API and not Web Push. Web Push (VAPID + a
 * service worker + a server speaking the web-push protocol) is what delivers
 * with the tab *closed*; this delivers while the tab is open in the
 * background, which is the case that actually matters for a WhatsApp
 * Web-style client and needs no keys, no service worker, and no second
 * sender path on the server.
 *
 * expo-notifications is useless here: on web it resolves the non-`.native`
 * modules, which are no-op stubs that log "will have no effect".
 */

function supported(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window;
}

export type WebNotificationPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function webNotificationPermission(): WebNotificationPermission {
  if (!supported()) return 'unsupported';
  return Notification.permission as WebNotificationPermission;
}

/**
 * Asks once, and only in response to something the user did.
 *
 * Browsers increasingly ignore (or permanently auto-deny) permission prompts
 * that fire on page load, so this must be called from a real interaction —
 * the toggle in the web sidebar — rather than on mount.
 */
export async function requestWebNotificationPermission(): Promise<WebNotificationPermission> {
  if (!supported()) return 'unsupported';
  if (Notification.permission !== 'default') {
    return Notification.permission as WebNotificationPermission;
  }
  try {
    return (await Notification.requestPermission()) as WebNotificationPermission;
  } catch {
    return 'denied';
  }
}

/**
 * Shows a notification, if we're allowed to and the user isn't already
 * looking at the page.
 *
 * `tag` collapses repeats: a busy group replaces its own notification rather
 * than stacking twenty, which is what the OS does for a native chat app and
 * what people expect here too.
 */
export function showWebNotification(options: {
  title: string;
  body: string;
  tag?: string;
  icon?: string;
  onClick?: () => void;
}): void {
  if (!supported() || Notification.permission !== 'granted') return;
  // Notifying someone about a message they're actively watching arrive is
  // just noise — the same rule the native handler applies via setActiveGroup.
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;

  try {
    const notification = new Notification(options.title, {
      body: options.body,
      tag: options.tag,
      icon: options.icon ?? '/icon-192.png',
      badge: '/icon-192.png',
    });
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // Some browsers refuse focus() outside a user gesture; the click
        // still fires onClick below, which is the part that matters.
      }
      notification.close();
      options.onClick?.();
    };
  } catch {
    // Constructing a Notification throws on some mobile browsers even when
    // permission reads as granted. Nothing to recover — it's a nicety.
  }
}

/** Unread count on the tab title, the web stand-in for an app-icon badge. */
export function setWebTitleBadge(count: number, baseTitle = 'GC'): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
}
