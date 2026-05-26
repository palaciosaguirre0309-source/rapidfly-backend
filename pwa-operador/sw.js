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
  let data = {};
  try { if (event.data) data = event.data.json(); } catch(e) {}

  // Construir título y cuerpo con los datos reales del pedido
  const titulo = '🏍️ ¡Nuevo pedido RapiFly!';
  const cuerpo = data.nombre_cliente
    ? `👤 ${data.nombre_cliente}` +
      (data.costo_delivery ? ` · 💰 $${parseFloat(data.costo_delivery).toFixed(2)} delivery` : '') +
      (data.direccion_texto ? `\n📍 ${data.direccion_texto}` : '')
    : 'Hay un pedido disponible para ti. ¡Acepta rápido! 🏍️';

  event.waitUntil(
    Promise.all([
      // 1. Notificación del sistema: vibración intensa + sonido del OS
      self.registration.showNotification(titulo, {
        body:             cuerpo,
        icon:             '/icon-192.png',
        badge:            '/icon-192.png',
        vibrate:          [400, 100, 400, 100, 400, 100, 800, 200, 800],
        requireInteraction: true,   // no desaparece sola
        tag:              'pedido-nuevo',
        renotify:         true,     // re-suena aunque ya haya una
        silent:           false,
        data:             data
      }),
      // 2. Avisar a la app si el WebView está vivo (activa alerta visual/sonora)
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
