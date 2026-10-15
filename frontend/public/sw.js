// Service worker: runs in the phone's background even when the app is closed.
// The push service wakes it up with our message, and it shows the notification.

// A new version of this file takes over at once, and also takes control of tabs that were
// opened before it started (otherwise Android refuses to move those tabs to another page).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Escort Duty', {
      body: data.body || '',
      data: { url: data.url || 'index.html' }
    })
  );
});

// Tapping the notification brings the app to the front at the page the message points to.
// The browser allows focus / open window only for a moment after the tap, so nothing slow
// happens before them. An open tab is told where to go (it moves itself, see main.jsx);
// with no open tab, a new one opens.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data.url, self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(tabs => {
      const tab = tabs[0];
      if (!tab) return self.clients.openWindow(url);
      tab.postMessage({ type: 'open', url });
      return tab.focus().catch(() => self.clients.openWindow(url));
    })
  );
});
