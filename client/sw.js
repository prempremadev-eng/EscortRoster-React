// Service worker: runs in the phone's background even when the app is closed.
// The push service wakes it up with our message, and it shows the notification.

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Escort Duty', {
      body: data.body || '',
      data: { url: data.url || 'index.html' }
    })
  );
});

// Tapping the notification opens (or focuses) the app at the page the message points to.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data.url, self.registration.scope).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const tab of tabs) {
      if ('navigate' in tab) {
        await tab.navigate(url);
        return tab.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
