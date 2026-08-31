import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

/**
 * Push notification registration and delivery handling.
 *
 * Delivery goes through Expo's push service, so the app only ever deals in
 * ExpoPushTokens and the server never holds an APNs/FCM key — see
 * supabase/functions/send-push/index.ts for the other half.
 *
 * ⚠️ iOS requires a paid Apple Developer account. Getting a push token needs
 * the `aps-environment` entitlement, which free provisioning profiles do not
 * include, so `getExpoPushTokenAsync` throws outright on a free-account build.
 * That is a hard Apple requirement, not something the code can route around —
 * hence registerForPush() failing soft rather than surfacing an error the user
 * can do nothing about. Android needs no paid account.
 */

/** Which group's transcript is on screen right now, if any. A push for the
 *  chat you are already reading is noise, so the handler below drops it —
 *  set from ChatScreen as it focuses and blurs. */
let activeGroupId: string | null = null;

export function setActiveGroup(groupId: string | null) {
  activeGroupId = groupId;
}

/**
 * Decides what a notification does when it lands while the app is open (foreground).
 * We suppress the phone's native OS banner because our custom InAppNotificationBanner
 * component already handles displaying a sleek in-app toast without duplicate banners.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/**
 * Asks for permission, resolves an Expo push token, and stores it against the
 * signed-in user. Safe to call on every launch — the upsert is keyed on the
 * token, so a re-register is a no-op rather than a duplicate row.
 *
 * Returns the token, or null when push is unavailable (simulator, permission
 * denied, or an iOS build without the push entitlement).
 */
export async function registerForPush(
  userId: string
): Promise<{ token: string | null; error: string | null }> {
  if (Platform.OS === 'web') {
    console.warn('[push] web push is not supported by expo-notifications — skipping');
    return { token: null, error: 'Web platform does not support Expo push' };
  }

  if (!Device.isDevice) {
    console.warn('[push] skipping registration — not a physical device');
    return { token: null, error: 'Not a physical device (simulator/emulator)' };
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#818CF8',
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') {
      console.warn('[push] permission not granted:', status);
      return { token: null, error: `Permission not granted (${status})` };
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      'eda4be96-0e54-4b02-88a8-d7a456652f83';

    let token: string | null = null;
    try {
      const resp = await Notifications.getExpoPushTokenAsync({ projectId });
      token = resp?.data ?? null;
    } catch (tokErr: any) {
      const msg = tokErr?.message || String(tokErr);
      console.warn('[push] getExpoPushTokenAsync error:', msg);
      return { token: null, error: `Expo Push Token error: ${msg}` };
    }

    if (!token) {
      return { token: null, error: 'Empty token returned by Expo' };
    }

    const { error: dbError } = await supabase.from('device_push_tokens').upsert(
      {
        token,
        user_id: userId,
        platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );

    if (dbError) {
      console.warn(`[push] could not store token in db: ${dbError.message}`);
      return { token: null, error: `Database error: ${dbError.message}` };
    }

    console.log('[push] successfully registered device push token:', token);
    scheduleElevenElevenReminder().catch(() => {});
    return { token, error: null };
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[push] registration failed: ${msg}`);
    return { token: null, error: msg };
  }
}

/** Drops this device's token on sign-out */
export async function unregisterPush(): Promise<void> {
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      'eda4be96-0e54-4b02-88a8-d7a456652f83';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (token) await supabase.from('device_push_tokens').delete().eq('token', token);
  } catch {}
}

export async function sendTestNotification(): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔥 GC Push Test',
        body: 'Notifications are working perfectly on this device!',
        data: { test: true },
        sound: true,
      },
      trigger: null, // deliver immediately
    });
  } catch (e) {
    console.warn('[push] sendTestNotification failed:', e);
  }
}

/**
 * The 11:11 wish reminder.
 *
 * Fired two minutes EARLY on purpose. Do not "correct" this back to 11:11.
 *
 * These are OS-scheduled local notifications, and Android's DAILY trigger is an
 * *inexact* alarm: under Doze and App Standby the system batches it to save
 * battery, which in practice delivered the 11:11 reminder around 11:13. The
 * wish window is 11:11:00 to 11:11:59, so an on-the-minute schedule arrived
 * after the thing it was announcing had already closed.
 *
 * Firing exactly on time would need SCHEDULE_EXACT_ALARM, which Play restricts
 * to alarm and calendar apps and would risk a review rejection for a chat app,
 * and it would need a native rebuild. A lead time costs nothing and lands the
 * notification inside the window at the observed delay instead of after it.
 *
 * The copy is written to survive early or late delivery: it announces that the
 * window is about to open rather than claiming it is open right now, which was
 * the part that read as broken when the notification ran late.
 */
export async function scheduleElevenElevenReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    // Cancel existing 11:11 triggers to avoid duplication
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      if (notif.content.data?.type === '11_11_reminder') {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }

    const content = {
      title: '✨ 11:11 is almost here 🕯️',
      body: 'Your wish window opens in a moment. Open GC to get ready.',
      sound: 'default',
      data: { type: '11_11_reminder' },
    };

    /* Two minutes of lead time, so the observed Android delay lands the
       notification inside the 11:11 window rather than past it. */
    for (const hour of [11, 23]) {
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute: 9,
        },
      });
    }
  } catch (e) {
    console.warn('[push] scheduleElevenElevenReminder failed:', e);
  }
}

export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {}
}
