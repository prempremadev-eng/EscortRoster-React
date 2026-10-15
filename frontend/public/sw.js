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
// An open tab is reused when the phone allows it; otherwise a new tab opens.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data.url, self.registration.scope).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const tab of tabs) {
      try {
        const focused = await tab.focus();
        await (focused || tab).navigate(url);
        return;
      } catch (err) {
        // Not allowed for this tab (e.g. not controlled yet): try the next one, then a new tab.
      }
    }
    await self.clients.openWindow(url);
  })());
});
