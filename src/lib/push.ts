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
 * Decides what a notification does when it lands while the app is open.
 * Registered once at module scope, before any listener, because a
 * notification can arrive before React has mounted anything.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as { groupId?: string } | undefined;
    const isOpenChat = !!data?.groupId && data.groupId === activeGroupId;

    return {
      // You are already looking at these messages arriving live.
      shouldShowBanner: !isOpenChat,
      shouldShowList: !isOpenChat,
      shouldPlaySound: !isOpenChat,
      // The badge is a whole-app unread count, so it stays accurate even for
      // the chat that is currently open.
      shouldSetBadge: true,
    };
  },
});

/**
 * Asks for permission, resolves an Expo push token, and stores it against the
 * signed-in user. Safe to call on every launch — the upsert is keyed on the
 * token, so a re-register is a no-op rather than a duplicate row.
 *
 * Returns the token, or null when push is unavailable (simulator, permission
 * denied, or an iOS build without the push entitlement).
 */
export async function registerForPush(userId: string): Promise<string | null> {
  // Web is a dead end for this pipeline, so don't even prompt. expo-notifications
  // ships no web implementation for handling or receiving: on web it resolves
  // the non-`.native` NotificationsHandlerModule/NotificationsEmitterModule,
  // which are no-op stubs that warn "…will have no effect". Registration could
  // technically still mint a browser push subscription (VAPID + service
  // worker), but nothing would ever be delivered to it, and Expo's push
  // service — which is what send-push talks to — deals in ExpoPushTokens.
  // Real web push would be a separate sender speaking the web-push protocol.
  if (Platform.OS === 'web') {
    console.warn('[push] web push is not supported by expo-notifications — skipping');
    return null;
  }

  // Simulators and emulators have no push transport at all.
  if (!Device.isDevice) {
    console.warn('[push] skipping registration — not a physical device');
    return null;
  }

  try {
    if (Platform.OS === 'android') {
      // Android needs a channel before anything can be delivered, and the
      // channel — not the payload — is what decides importance and whether a
      // heads-up banner appears.
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#818CF8',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      // Only ever prompt when we don't already have an answer — asking again
      // after a denial does nothing on iOS but does reset nothing either.
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') {
      console.warn('[push] permission not granted');
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('[push] no EAS projectId — cannot mint an Expo push token');
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return null;

    const { error } = await supabase.from('device_push_tokens').upsert(
      {
        token,
        user_id: userId,
        platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );
    if (error) {
      console.warn(`[push] could not store token: ${error.message}`);
      return null;
    }

    return token;
  } catch (e) {
    // The expected failure on an iOS build without the push entitlement.
    // Notifications simply don't work there; nothing else should break.
    console.warn(`[push] registration failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Drops this device's token on sign-out, so the next person to sign in on
 *  this phone doesn't receive the previous account's messages. */
export async function unregisterPush(): Promise<void> {
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (token) await supabase.from('device_push_tokens').delete().eq('token', token);
  } catch {
    // Nothing recoverable here — a stale token is pruned server-side the
    // first time Expo reports DeviceNotRegistered for it anyway.
  }
}

export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // Badges are unsupported on some Android launchers — not worth surfacing.
  }
}
