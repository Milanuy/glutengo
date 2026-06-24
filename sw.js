// GlutenGo Service Worker v4.7
// Cache-first solo para assets estáticos. Las APIs siempre van a red.

const CACHE = 'glutengo-v4.7';
const STATIC = [
  '/',
  '/index.html',
  '/lugar.html',
  '/gracias.html',
  '/negocios.html',
  '/bienvenido.html',
  '/data.js?v=2.6',
  '/app.js?v=3.1',
  '/auth.js?v=2.1',
  '/business-cta.js?v=2.2',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Nunca cachear APIs ni requests no-GET.
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // Siempre red para CDN externos (Leaflet, AOS, tiles, fonts, etc.).
  if (url.origin !== self.location.origin) {
    return;
  }

  // HTML network-first para que cambios de contenido se vean enseguida.
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Cache-first para nuestros archivos estáticos.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
