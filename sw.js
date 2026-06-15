// GlutenGo Service Worker v1.1
// Cache-first para assets estáticos, network-first para data

const CACHE = 'glutengo-v1.1';
const STATIC = [
  '/',
  '/index.html',
  '/lugar.html',
  '/gracias.html',
  '/negocios.html',
  '/bienvenido.html',
  '/data.js',
  '/app.js',
  '/auth.js',
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

  // Siempre red para CDN externos (Leaflet, AOS, etc.)
  if (
    url.hostname.includes('cdn') ||
    url.hostname.includes('unpkg') ||
    url.hostname.includes('tile.openstreetmap') ||
    url.hostname.includes('basemaps.cartocdn') ||
    url.hostname.includes('carto.com')
  ) {
    return;
  }

  // Cache-first para nuestros archivos estáticos
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok && e.request.method === 'GET') {