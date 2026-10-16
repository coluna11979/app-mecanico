/* Push de nova demanda — importado pelo service worker do vite-plugin-pwa
   (workbox.importScripts em vite.config.ts). Payload vem da edge function
   notify-new-job: { title, body, url, tag }. */

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { body: event.data ? event.data.text() : '' }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'MecânicoApp', {
      body: data.body || 'Você tem uma novidade no app.',
      icon: '/pwa-192.svg',
      badge: '/pwa-192.svg',
      tag: data.tag || 'mecanicoapp',
      renotify: true,
      requireInteraction: true,
      vibrate: [400, 150, 400, 150, 400],
      data: { url: data.url || '/mecanico/dashboard' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/mecanico/dashboard';

  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin !== self.location.origin) continue;
      try { await w.navigate(url); } catch { /* aba não controlada: só foca */ }
      return w.focus();
    }
    return self.clients.openWindow(url);
  })());
});
