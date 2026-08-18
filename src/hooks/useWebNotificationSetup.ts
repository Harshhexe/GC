import { useEffect, useState } from 'react';
import {
  requestWebNotificationPermission,
  webNotificationPermission,
  type WebNotificationPermission,
} from '../lib/webNotifications';
import { subscribeWebPush } from '../lib/webPush';

/**
 * Permission state + the "Turn on notifications" action, shared between
 * every web entry point that needs it. WebShell (desktop, width >= 900) and
 * GroupListScreen (everything else — mobile web, and an installed iOS PWA,
 * which renders at phone width and so never mounts WebShell at all) both
 * need this; keeping it in one hook is what stops a PWA from silently
 * having no way to ever grant permission.
 */
export function useWebNotificationSetup(userId: string | undefined) {
  const [permission, setPermission] = useState<WebNotificationPermission>(() =>
    webNotificationPermission()
  );

  // Permission was already granted in an earlier visit, but this specific
  // browser/profile might not have an active push subscription yet (first
  // load since this feature shipped, cleared storage, a different browser
  // profile). subscribeWebPush() is idempotent, so it's safe to just try
  // again on every mount rather than track whether it "should" be needed.
  useEffect(() => {
    if (permission === 'granted' && userId) {
      subscribeWebPush(userId).catch(() => {});
    }
  }, [permission, userId]);

  async function enableNotifications() {
    const result = await requestWebNotificationPermission();
    setPermission(result);
    // Same user action covers both: the in-tab Notification API (immediate,
    // tab must be open) and the Web Push subscription (reaches a closed tab
    // or an installed iOS PWA). No separate toggle for the second one.
    if (result === 'granted' && userId) {
      const { error } = await subscribeWebPush(userId);
      if (error) console.warn('[webPush] subscribe failed:', error);
    }
  }

  return { permission, enableNotifications };
}
