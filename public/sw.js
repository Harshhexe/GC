// GC — Web Push service worker.
//
// Handles two events only: a push arriving (show it) and a tap on it (focus
// or open the app, deep-linked to the right chat where possible). Everything
// else about the app — caching, offline support, etc. — is deliberately not
// this file's job; it exists purely so Web Push can reach a closed tab or an
// installed iOS PWA that isn't running.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'GC', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'GC';
  const options = {
    body: payload.body || '',
    tag: payload.tag,
    // Same tag replaces rather than stacks — matches the in-tab Notification
    // behavior in src/lib/webNotifications.ts.
    renotify: !!payload.tag,
    // The GC's own avatar when it has one, so the card is recognisable at a
    // glance the way the title is; the app icon is only the fallback.
    icon: payload.icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const groupId = event.notification.data && event.notification.data.groupId;
  const targetUrl = groupId ? `/?openGroup=${encodeURIComponent(groupId)}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Prefer focusing an already-open tab over opening a new one — and
      // hand it the group id via postMessage since focus() can't carry a
      // navigation, the tab is already on some URL.
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (groupId) client.postMessage({ type: 'gc-open-group', groupId });
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
