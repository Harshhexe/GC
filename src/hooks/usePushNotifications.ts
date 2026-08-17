import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { registerForPush } from '../lib/push';

type PushTapTarget = { groupId: string; messageId?: string };

/**
 * Registers this device for push once someone is signed in, and reports taps
 * on a notification back to the caller so it can navigate.
 *
 * Two separate paths matter and are easy to conflate:
 *   - `addNotificationResponseReceivedListener` fires when the app is already
 *     running and the user taps a notification.
 *   - `getLastNotificationResponseAsync` covers the cold start — the app was
 *     killed, the tap is what launched it, and no listener existed yet to
 *     hear it. Without this, tapping a notification from a closed app just
 *     opens the chat list.
 */
export function usePushNotifications(
  userId: string | undefined,
  onTap: (target: PushTapTarget) => void
) {
  // Kept in a ref so re-renders don't tear down and re-add the listeners, and
  // so the cold-start handler always calls the newest navigator.
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  useEffect(() => {
    if (!userId) return;
    registerForPush(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    function handle(response: Notifications.NotificationResponse | null) {
      const data = response?.notification.request.content.data as
        | { groupId?: string; messageId?: string }
        | undefined;
      if (!data?.groupId) return;
      onTapRef.current({ groupId: data.groupId, messageId: data.messageId });
    }

    // Cold start: the tap that opened the app already happened.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!cancelled) handle(response);
    });

    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [userId]);
}
