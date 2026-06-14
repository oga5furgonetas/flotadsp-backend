// FlotaDSP — Service Worker DESACTIVADO (kill-switch).
// El SW anterior cacheaba el bundle con nombre fijo en modo Cache-First, lo que
// hacía que el navegador sirviera código viejo y las actualizaciones no llegaran.
// Este SW se desinstala a sí mismo, borra todas las cachés y recarga los clientes.
self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll(); })
      .then(function (clients) {
        clients.forEach(function (c) { try { c.navigate(c.url); } catch (e) {} });
      })
  );
});

// No interceptamos NADA: todo va directo a la red (siempre fresco).
