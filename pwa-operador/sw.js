const CACHE = 'rapidfly-v3';
const ASSETS = ['/', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: '🏍️ RapiFly — Nuevo pedido', body: 'Hay un pedido disponible para ti' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch(e) {}

  event.waitUntil(
    Promise.all([
      // 1. Mostrar notificación del sistema (sonido + vibración del OS)
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [500, 200, 500, 200, 500, 200, 500],
        requireInteraction: true,
        tag: 'pedido-nuevo',
        renotify: true,
        data: data
      }),
      // 2. Avisar a la app si está abierta (para que active la alerta visual/sonora)
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
        for (const client of clientList) {
          client.postMessage({ type: 'pedido:push', payload: data });
        }
      })
    ])
  );
});

// ── CLICK EN LA NOTIFICACIÓN ──────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        // App ya abierta — enfocarla y pasarle el pedido
        const client = clientList[0];
        client.postMessage({ type: 'pedido:push', payload: data });
        return client.focus();
      }
      // App cerrada — abrirla (cuando cargue, visibilitychange se encarga)
      return clients.openWindow('/');
    })
  );
});
