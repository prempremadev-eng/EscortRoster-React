// Service worker: runs in the phone's background even when the app is closed.
// The push service wakes it up with our message, and it shows the notification.

// A new version of this file takes over at once, and also takes control of tabs that were
// opened before it started (otherwise Android refuses to move those tabs to another page).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// `urgent` (cover request, "come back", empty post): long buzz and it stays on the screen
// until the guard touches it, so it is noticed with the phone in a pocket. The sound is the
// phone's own notification sound (a web app cannot pick its own ringtone).
// An open app page is also told, so it refreshes itself at once (no polling needed).
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const urgent = !!data.urgent;
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title || 'GuardDesk', {
      body: data.body || '',
      data: { url: data.url || 'index.html' },
      tag: data.tag || undefined,
      // Same tag = replaces the last one; it buzzes again only when renotify is on.
      renotify: !!data.tag && (data.renotify === undefined ? true : !!data.renotify),
      requireInteraction: urgent,
      vibrate: urgent ? [500, 200, 500, 200, 500, 200, 800] : [200]
    }),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(tabs => tabs.forEach(tab => tab.postMessage({ type: 'push', urgent })))
  ]));
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
      // The tab already on that page (the supervisor tab, or that guard's tab) first.
      const page = url.split('#')[1] || '';
      const kind = page.split('/')[0];
      const tab = tabs.find(t => t.url.split('#')[1] === page)
        || tabs.find(t => (t.url.split('#')[1] || '').split('/')[0] === kind)
        || tabs[0];
      if (!tab) return self.clients.openWindow(url);
      tab.postMessage({ type: 'open', url });
      return tab.focus().catch(() => self.clients.openWindow(url));
    })
  );
});
