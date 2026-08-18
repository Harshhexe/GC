import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Web Push subscription management — the closed-tab/installed-PWA half of
 * web notifications. src/lib/webNotifications.ts covers the tab-open case
 * with the plain Notification API; this covers the tab-closed case with a
 * service worker + VAPID-signed push, which is also the only way an iOS PWA
 * (added to the home screen) ever receives a notification at all.
 */

function supported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/** VAPID public keys are base64url; the Push API wants a raw Uint8Array. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Registers the service worker, subscribes to push, and stores the
 * subscription against the signed-in user. Called right after the browser's
 * Notification permission is granted — same moment as the in-tab path, one
 * user action covers both.
 *
 * Safe to call repeatedly: `subscribe()` returns the existing subscription
 * if one is already active, and the upsert is keyed on endpoint.
 */
export async function subscribeWebPush(userId: string): Promise<{ error: string | null }> {
  if (!supported()) return { error: 'Web push not supported in this browser' };

  try {
    const publicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) return { error: 'VAPID public key not configured' };

    const registration = await navigator.serviceWorker.register('/sw.js');
    // Ready before subscribing — subscribing against an installing worker
    // can reject on some browsers.
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    const keys = json.keys;
    if (!json.endpoint || !keys?.p256dh || !keys?.auth) {
      return { error: 'Subscription missing required fields' };
    }

    const { error } = await supabase.from('web_push_subscriptions').upsert(
      {
        endpoint: json.endpoint,
        user_id: userId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[webPush] subscribe failed:', msg);
    return { error: msg };
  }
}

/** Drops this browser's subscription on sign-out, mirroring unregisterPush(). */
export async function unsubscribeWebPush(): Promise<void> {
  if (!supported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await supabase.from('web_push_subscriptions').delete().eq('endpoint', endpoint);
  } catch {
    // Best-effort — a stale row gets cleaned up server-side the next time a
    // push to it 404s/410s anyway.
  }
}
