/* ── SONDA: QUÉ PETICIÓN FIRMA LOS ENLACES DE LOS INFORMES ───────────────────
 * ═══════════════════════════════════════════════════════════════════════════
 * ESTO NO ARREGLA NADA. Solo mira. Y está escrito así a propósito.
 *
 * Los informes del portal (Daily Report, DNR, horas) los sirve un bucket de S3
 * con URLs FIRMADAS que caducan a los 30 minutos. Eso significa que no se
 * pueden deducir ni guardar: hay que pedirle a Amazon que las firme cada vez.
 *
 * Alguna petición de esa pantalla las pide y las recibe firmadas. Cuál, no lo
 * sé — y escribirla a ojo es el fallo que costó veinte versiones con
 * `addresses` (gotcha 64) y otras cuatro rondas esta misma semana con el host
 * del bucket. Así que esta vez se mira primero y se construye después.
 *
 * CÓMO MIRA, Y QUÉ NO SE LLEVA
 *
 * Engancha `fetch` y `XMLHttpRequest` en el portal y busca respuestas que
 * mencionen el bucket. De las que encuentra manda **solo la forma**:
 *   · la RUTA de la petición y los NOMBRES de sus parámetros (nunca los
 *     valores: ahí van ids de nave y de día);
 *   · el método, y si es POST los NOMBRES de los campos del cuerpo;
 *   · el esqueleto de la respuesta: nombres de campo y tipos. Donde haya una
 *     URL firmada se manda la etiqueta `<url firmada>`, jamás la URL.
 *
 * Una firma es una credencial temporal de AWS. El 14-09-2026 una acabó
 * guardada en nuestra base por mandar URLs enteras a un diagnóstico; no se
 * repite.
 *
 * NO TOCA CORTEX. Se apaga sola en `/operations/execution/*`, que es donde
 * vive la captura de paquetes: ese código lleva veinte versiones afinándose y
 * no se le pone un segundo gancho encima para esto.
 */
(() => {
  if (window.__flotadspPortal) return;
  // Cortex, ni tocarlo.
  if (/^\/operations\/execution/.test(location.pathname)) return;
  window.__flotadspPortal = true;

  const BUCKET = /flex-peer-performance-reports|X-Amz-Signature/i;
  const MAX = 3;                       // como mucho tres hallazgos por pestaña
  let encontrados = 0;

  const post = (msg) => {
    try { window.postMessage({ __flotadsp: true, ...msg }, '*'); } catch (_) {}
  };

  /* El ESQUELETO de un JSON: nombres y tipos, nunca valores. Lo único que se
     conserva de un texto es si parece una URL firmada, y ni eso: se etiqueta. */
  const forma = (v, prof = 0) => {
    if (v === null) return 'null';
    if (Array.isArray(v)) return v.length ? [forma(v[0], prof + 1)] : [];
    if (typeof v === 'object') {
      if (prof > 3) return '{…}';
      const o = {};
      for (const k of Object.keys(v).slice(0, 25)) o[k] = forma(v[k], prof + 1);
      return o;
    }
    if (typeof v === 'string') {
      if (BUCKET.test(v)) return '<url firmada>';
      if (/^https?:\/\//i.test(v)) return '<url>';
      return v.length > 40 ? '<texto largo>' : 'texto';
    }
    return typeof v;
  };

  /* De una URL: la ruta y los NOMBRES de los parámetros. Los valores llevan el
     id de la nave y el día, y esto es un diagnóstico, no un registro de lo que
     mira la gente. */
  const dondeVa = (url, metodo) => {
    try {
      const u = new URL(url, location.origin);
      const params = [...u.searchParams.keys()].slice(0, 12).join(',');
      return `${metodo} ${u.origin === location.origin ? '' : u.origin}${u.pathname}${params ? ' ?' + params : ''}`;
    } catch (_) { return `${metodo} ${String(url).slice(0, 120)}`; }
  };

  const mirar = (url, metodo, cuerpoPeticion, texto) => {
    if (encontrados >= MAX || !texto || texto.length < 40) return;
    if (!BUCKET.test(texto)) return;
    let esqueleto = '';
    try { esqueleto = JSON.stringify(forma(JSON.parse(texto))).slice(0, 1200); }
    catch (_) { esqueleto = '(no es JSON)'; }
    let campos = '';
    if (cuerpoPeticion) {
      try { campos = Object.keys(JSON.parse(cuerpoPeticion)).slice(0, 15).join(','); }
      catch (_) { campos = '(cuerpo no JSON)'; }
    }
    encontrados += 1;
    post({ kind: 'firma_vista', url: dondeVa(url, metodo).slice(0, 200),
           campos: campos.slice(0, 200), esqueleto });
    console.log('%c[FlotaDSP] encontrada la peticion que firma los enlaces', 'color:#34d399;font-weight:bold');
  };

  /* ── ¿Y SI NO HAY PETICIÓN, Y VIENEN YA EN EL HTML? ──────────────────────
     Es la otra posibilidad real, y hay que poder distinguirla: si la página se
     sirve ya con los enlaces firmados dentro, no hay ninguna llamada que
     copiar y el camino es otro (leer el HTML, como hace `dsp.js`).
     Decirlo es tan útil como encontrar la petición: cierra una de las dos
     puertas en vez de dejarnos otra ronda adivinando. */
  const mirarElHtml = () => {
    if (encontrados >= MAX) return;
    let html = '';
    try { html = document.documentElement ? document.documentElement.outerHTML : ''; } catch (_) { return; }
    if (!html || !BUCKET.test(html)) return;
    encontrados += 1;
    post({ kind: 'firma_vista',
           url: `EN-EL-HTML-DE-LA-PAGINA ${location.pathname}`.slice(0, 200),
           campos: '', esqueleto: 'los enlaces firmados vienen dentro del HTML, no de una peticion aparte' });
  };
  // Al cargar y a los 4 y 12 s: estas pantallas pintan la lista con retraso.
  for (const ms of [0, 4000, 12000]) setTimeout(mirarElHtml, ms);

  // ── fetch ──
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    if (encontrados < MAX) {
      p.then((res) => {
        try {
          const url = (typeof args[0] === 'string' ? args[0] : args[0]?.url) || res.url || '';
          const metodo = (args[1]?.method) || (typeof args[0] === 'object' ? args[0]?.method : '') || 'GET';
          /* No se exige `content-type: json`. Una API que devuelve JSON con
             `text/plain` —o sin cabecera— es de lo más normal, y filtrar por
             ahí es dejar fuera justo lo que se busca sin enterarse. Lo que se
             acota es el TAMAÑO, que es lo que de verdad cuesta. */
          const ct = res.headers.get('content-type') || '';
          if (/image|font|video|audio|css|javascript/i.test(ct)) return;
          const largo = Number(res.headers.get('content-length') || 0);
          if (largo > 2000000) return;              // no se copia lo enorme
          const cuerpo = typeof args[1]?.body === 'string' ? args[1].body : '';
          res.clone().text().then((t) => mirar(url, metodo, cuerpo, t)).catch(() => {});
        } catch (_) {}
      }).catch(() => {});
    }
    return p;
  };

  // ── XMLHttpRequest ──
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    this.__fdUrl = url; this.__fdMetodo = metodo;
    return origOpen.call(this, metodo, url, ...resto);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (cuerpo) {
    this.addEventListener('load', function () {
      try {
        if (encontrados >= MAX) return;
        const rt = this.responseType;
        const t = (rt === '' || rt === 'text') ? this.responseText
          : (rt === 'json' && this.response) ? JSON.stringify(this.response) : '';
        mirar(this.__fdUrl || '', this.__fdMetodo || 'GET',
              typeof cuerpo === 'string' ? cuerpo : '', t);
      } catch (_) {}
    });
    return origSend.call(this, cuerpo);
  };
})();
