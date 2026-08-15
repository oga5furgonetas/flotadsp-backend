/* ─────────────────────────────────────────────────────────────────────────────
   CUARTA DEFENSA: el bundle de entrada envenenado (pantalla en blanco)
   ---------------------------------------------------------------------------
   Las otras tres defensas contra assets envenenados (vite:preloadError, el
   centinela del CSS y el ErrorBoundary) viven todas DENTRO de main.jsx, que se
   compila en `assets/v2/index-<hash>.js`. Eso deja un agujero:

     si el asset envenenado es JUSTO ESE, ninguna de las tres llega a
     ejecutarse. El navegador rechaza el módulo ("Expected a JavaScript module
     but the server responded with MIME type text/html"), React no monta nunca
     y la persona ve una pantalla EN BLANCO, sin error y sin recuperación,
     durante las 4 h que dura la caché.

   Visto en producción el 2026-08-15, justo después de un deploy: curl servía el
   JS correcto byte a byte mientras el navegador tenía cacheado el index.html
   bajo la URL .js — el mismo patrón de los envenenamientos anteriores.

   Este fichero es la red que va POR DEBAJO de todo eso. Es un script clásico
   (no módulo) y externo: la CSP no admite 'unsafe-inline', igual que pasó con
   gtag-init.js. Va servido con no-cache desde _headers para que él mismo no
   pueda quedarse envenenado.

   ── POR QUÉ UN VIGILANTE Y NO UN onerror ─────────────────────────────────────
   El <script type="module"> sí emite 'error', pero no en todos los navegadores
   ni en todos los modos de fallo. Comprobar un HECHO —¿ha arrancado la app?— es
   más fiable que confiar en que llegue un evento concreto.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict'

  /* Margen antes de dar por muerto el arranque. Tiene que ser mayor que una
     carga lenta de verdad: en 3G flojo el bundle puede tardar bastante, y
     recargarle la página a alguien que sólo va lento sería un fallo peor que el
     que se intenta arreglar. */
  var ESPERA_MS = 10000
  var MARCA = 'arranque_reparado'

  function reparar() {
    /* Lo mismo que repairAssetCache() de main.jsx, pero sin poder importarlo:
       está dentro del fichero que no ha cargado. Se re-descarga el index.html
       saltándose la caché, se sacan sus assets y se re-descargan también. */
    return fetch('/index.html', { cache: 'reload' })
      .then(function (r) { return r.text() })
      .then(function (html) {
        var rutas = (html.match(/assets\/[A-Za-z0-9/_.-]+\.(?:js|css)/g) || [])
        return Promise.all(rutas.map(function (p) {
          return fetch('/' + p, { cache: 'reload' }).catch(function () {})
        }))
      })
      .catch(function () { /* sin red no hay nada que reparar */ })
  }

  setTimeout(function () {
    // ¿Arrancó? main.jsx lo marca en cuanto se ejecuta.
    if (window.__flotaArrancada) return
    // Nada que hacer si ya hay algo pintado: puede ser una pantalla de error
    // legítima del ErrorBoundary, y recargar encima se la comería.
    var raiz = document.getElementById('root')
    if (raiz && raiz.children.length > 0) return

    /* UNA sola vez por pestaña. Si tras reparar y recargar sigue sin arrancar,
       el problema no es la caché y otro intento sólo haría un bucle de recargas
       — que en una PWA que alguien usa repartiendo sería mucho peor que la
       pantalla en blanco. */
    try {
      if (sessionStorage.getItem(MARCA)) return
      sessionStorage.setItem(MARCA, String(Date.now()))
    } catch (e) { return }   // sin sessionStorage no hay forma de evitar el bucle

    reparar().then(function () { window.location.reload() })
  }, ESPERA_MS)
})()
