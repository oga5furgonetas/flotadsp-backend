// FlotaDSP PWA Service Worker v1
// Estrategias:
//   - Assets estáticos (JS, CSS, iconos, fuentes): Cache First
//   - Navegaciones HTML (rutas): Network First con fallback a shell cacheado
//   - API /api/*: Network Only (nunca cachear datos sensibles ni respuestas firmadas)

const CACHE_NAME = 'flotadsp-v56';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Nunca interceptar el backend: necesitamos respuestas frescas y autenticadas.
  if (url.hostname.includes('flotadsp-backend.fly.dev') ||
      url.pathname.startsWith('/api/')) {
    return; // pasa directo a la red
  }

  // No interceptar POST/PUT/PATCH/DELETE
  if (req.method !== 'GET') return;

  // Navegaciones HTML (cuando el usuario va a una ruta): Network First
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          // Refrescamos shell cache con la respuesta más reciente
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return resp;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Assets (JS/CSS/PNG/SVG/woff): Cache First
  if (/\.(js|css|png|svg|jpg|jpeg|gif|woff2?|ttf)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return resp;
        });
      })
    );
  }
});

// Mensaje desde el cliente para forzar actualización
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
