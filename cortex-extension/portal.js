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

  /* ── COMO SE PIDE LA LISTA DE ASOCIADOS ───────────────────────────────────
     `/account-management/data/search-providers` trae, por persona, los trece
     pasos del onboarding y como va cada uno. Hoy solo entra cuando alguien abre
     esa pantalla; para que entre solo —como ya entran los horarios— hay que
     poder REPETIR la peticion, y va por POST: sin saber como se llaman los
     campos de su cuerpo no se puede.
     Aqui se apuntan SOLO LOS NOMBRES de esos campos, una vez. Ni un valor: los
     valores de esa peticion son a quien se busca. */
  const asociadosPedidosVistos = new Set();
  const mirarComoSePide = (url, metodo, cuerpoPeticion) => {
    let u = '';
    try { u = new URL(url, location.origin).pathname; } catch (_) { return; }
    if (!/\/account-management\/data\/search-providers/i.test(u)) return;
    let campos = '(sin cuerpo)';
    try {
      const j = JSON.parse(cuerpoPeticion || '{}');
      /* Nombres y TIPOS siempre; y el VALOR solo de los tres que hacen falta
         para pedir la pagina siguiente: que clase de persona se busca y por
         donde va la paginacion. Son una categoria y dos numeros, no el dato de
         nadie — si algun dia la pantalla manda por quien se busca, ese campo
         saldra con su nombre y su tipo, nunca con lo que se escribio. */
      const SEGUROS = new Set(['providerType', 'searchStart', 'searchSize']);
      campos = Object.keys(j).slice(0, 25).map((k) => {
        const t = Array.isArray(j[k]) ? 'lista' : typeof j[k];
        return SEGUROS.has(k) && (t === 'string' || t === 'number')
          ? `${k}=${String(j[k]).slice(0, 40)}` : `${k}:${t}`;
      }).join(',');
    } catch (_) { campos = '(cuerpo no JSON)'; }
    /* UNA VEZ POR FORMA, no una vez y ya. Si Dani filtra por nave, esa peticion
       llevara un campo mas — y con un solo apunte por pagina nos habriamos
       quedado con la primera, que es justo la que no lo lleva. */
    const forma = `${u}|${campos}`;
    if (asociadosPedidosVistos.has(forma)) return;
    asociadosPedidosVistos.add(forma);
    if (asociadosPedidosVistos.size > 12) return;
    post({ kind: 'debug', which: 'asociados-como-se-pide-' + asociadosPedidosVistos.size,
           url: `${metodo} ${u} · ${campos}`.slice(0, 260), count: 0, bytes: 0 });
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

    /* ── Y SE GUARDA LA LLAMADA PARA PODER REPETIRLA ─────────────────────
       Esta es la pieza que faltaba. La peticion es
         GET /performance/api/v1/getData ?dataSetId,dsp,from,station,timeFrame,to
       y devuelve los enlaces ya firmados. Repitiendola con la sesion que hay
       abierta salen enlaces FRESCOS, y con eso los informes entran sin que
       nadie abra ninguna pantalla.

       LA URL COMPLETA SE QUEDA EN EL NAVEGADOR. Va al service worker, que la
       guarda en `chrome.storage`; al diagnostico solo viaja la forma. Los
       parametros llevan el id del DSP y de la nave: no son credenciales, pero
       tampoco hacen falta en nuestro servidor.

       Solo se guarda si es un GET: repetir un POST a ciegas puede tener
       efectos, y esta no los necesita. */
    if (metodo.toUpperCase() === 'GET') {
      /* ENTERA, CON SU ORIGEN. La pagina la pide RELATIVA
         («/performance/api/v1/getData?...») porque para ella el origen se
         sobreentiende. Para el service worker no: ahi no hay pagina, y
         `fetch('/performance/...')` es `TypeError: Failed to fetch` — el mismo
         error que salio el 15-09-2026 en la vuelta de enlaces frescos. Y peor:
         `new URL(relativa)` tambien revienta, asi que `conNave` no podia
         cambiar la estacion y la traza mostraba `?` en vez del nombre.
         Un solo fallo, dos sintomas, y el resultado fue que los informes de
         DGA1 y DGA2 no se bajaron NUNCA: solo entraba la nave que hubiera
         abierta en pantalla.
         Tres lineas mas arriba, en `dondeVa`, ya se hacia bien. Aqui no. */
      let entera = String(url);
      try { entera = new URL(url, location.origin).toString(); } catch (_) {}
      try {
        chrome.runtime?.sendMessage?.({ type: 'llamadaInformes', url: entera });
      } catch (_) { /* MAIN world: el puente lo recoge por postMessage */ }
      post({ kind: 'llamada_informes', url: entera });
    }
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
    /* ANTES DEL TOPE. `encontrados` cuenta los hallazgos del bucket de
       informes, y cuando llega a su tope se deja de mirar TODO — incluida la
       peticion de asociados, que no tiene nada que ver. Por eso la sonda de
       «como se pide» no se disparo nunca: el tope ya estaba gastado por otra
       cosa. Dos controles que no tienen nada que ver compartiendo contador. */
    try {
      const u0 = (typeof args[0] === 'string' ? args[0] : args[0]?.url) || '';
      const m0 = (args[1]?.method) || (typeof args[0] === 'object' ? args[0]?.method : '') || 'GET';
      const b0 = typeof args[1]?.body === 'string' ? args[1].body : '';
      mirarComoSePide(u0, m0, b0);
    } catch (_) {}
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

  /* ── EL RESTO DE PAGINAS DE ASOCIADOS ─────────────────────────────────────
     La pantalla pide `{providerType:'DA', searchStart:0, searchSize:100}` y se
     queda en los cien primeros. Los de Dani estan repartidos entre todos los
     que ve su cuenta, asi que con una sola pagina entraban TRES.

     Se repite SU MISMA peticion cambiando solo `searchStart`. Ni se inventa la
     llamada ni se tocan sus cabeceras: se copian las que ella puso —incluido el
     anti-CSRF, que se queda en el navegador y no viaja a ningun sitio—. El
     interceptor ya recoge cada respuesta, asi que no hay que leer nada aqui:
     basta con pedir.

     Con freno: diez paginas como mucho, y se para en cuanto una vuelve
     incompleta (ya no hay mas). Una vez por carga de pagina. */
  /* DIEZ MIL PERSONAS, NO CIEN. El 16-09-2026 se midio: `totalResults` dice
     10.000. Con paginas de cien y un tope de diez, se barria el 10 % — y con
     eso llegue a decirle a Dani que sus 26 candidatos no tenian cuenta en
     Amazon. La tenian: estaban en el 90 % que no habia mirado.
     Se piden paginas de 250 (la respuesta ronda medio mega, por debajo del
     tope del interceptor) y hasta 45, o sea 11.250: cubre las 10.000 con
     margen. Se para sola en cuanto una pagina vuelve incompleta. */
  /* DOS FORMAS DE MIRAR, Y LA BUENA ES LA SEGUNDA.

     (a) BARRER. `totalResults` dice 10.000 personas. Barrerlas de cien en cien
         es lento, fragil y no garantiza nada: el 16-09-2026 se pidieron paginas
         de 250 «para ir mas rapido» y Amazon devolvio 100 igualmente —su tope
         es 100, lo pidas como lo pidas—. La regla de «si vuelve incompleta era
         la ultima» leyo esos 100 como final y el barrido SE PARO EN LA PAGINA
         1: entraron 100 de 10.000 y nadie vio un error. Se arregla midiendo
         contra lo que Amazon dice que hay, no contra lo que pedimos.

     (b) PREGUNTAR POR LOS NUESTROS. La propia pantalla admite `email` en la
         busqueda —capturado de sus peticiones el 16-09-2026, no supuesto—, asi
         que se le pregunta por cada persona que estamos siguiendo, una a una.
         Es lo mismo que haria la oficina escribiendo el correo en su buscador.
         Veintiseis peticiones en vez de cien paginas, y sin depender de la
         nave: Lois Barreiro esta asignada a Madrid y por eso no aparecia
         barriendo por nave, teniendo la cuenta hecha.

     Se hacen las dos: (b) es la que contesta la pregunta de verdad, (a) queda
     de red por si alguien no esta en nuestra lista todavia. */
  const PAGINAS_MAX = 120;      // 100 por pagina: cubre 12.000 con margen
  let paginando = false;

  /* El tope REAL de Amazon. No se supone: se lee de su propia respuesta. */
  const totalDe = (txt) => {
    try {
      const d = (JSON.parse(txt) || {}).data || {};
      return Number(d.totalResults || d.totalCount || 0) || 0;
    } catch (_) { return 0; }
  };
  const cuantosVinieron = (txt) => {
    try { return (((JSON.parse(txt) || {}).data || {}).resultList || []).length; }
    catch (_) { return -1; }
  };

  const repetir = (xhrOriginal, cuerpoJson, alCargar) => {
    const cabeceras = xhrOriginal.__fdCabeceras || {};
    const x = new XMLHttpRequest();
    x.open('POST', xhrOriginal.__fdUrl, true);
    for (const k of Object.keys(cabeceras)) {
      try { x.setRequestHeader(k, cabeceras[k]); } catch (_) {}
    }
    if (alCargar) x.addEventListener('load', function () { alCargar.call(this); });
    try { x.send(JSON.stringify(cuerpoJson)); } catch (_) {}
  };

  /* (b) UNO A UNO, POR CORREO. */
  let preguntados = false;
  const preguntarPorLosNuestros = (xhrOriginal, j) => {
    if (preguntados) return;
    preguntados = true;
    const alLlegar = (ev) => {
      const d = ev.data;
      if (!d || d.__flotadspIn !== true || d.kind !== 'seguidos') return;
      window.removeEventListener('message', alLlegar);
      const correos = (d.correos || []).filter((c) => /.+@.+/.test(String(c))).slice(0, 400);
      /* De uno en uno y sin prisa: es la sesion de Amazon de la oficina y no se
         le va a echar encima una rafaga de cuatrocientas peticiones. */
      let i = 0, conCuenta = 0, sinCuenta = 0;
      const siguiente = () => {
        if (i >= correos.length) {
          /* QUE DIGA LO QUE HA ENCONTRADO. «Preguntamos por 28» no vale de
             nada: lo que hay que saber es cuantos tienen cuenta y cuantos no,
             y sobre todo si Amazon esta entendiendo la busqueda por correo.
             Si `encontrados` fuera 0 con 28 preguntas, el filtro no funciona
             como creemos y hay que verlo, no suponerlo. */
          post({ kind: 'debug', which: 'asociados-por-correo',
                 url: 'preguntados=' + correos.length + ' con_cuenta=' + conCuenta
                      + ' sin_cuenta=' + sinCuenta,
                 count: conCuenta, bytes: 0 });
          return;
        }
        const correo = correos[i++];
        repetir(xhrOriginal, { ...j, email: correo, searchStart: 0, searchSize: 10 },
                function () {
                  if (cuantosVinieron(this.responseText) > 0) conCuenta++; else sinCuenta++;
                  setTimeout(siguiente, 250);
                });
      };
      siguiente();
    };
    window.addEventListener('message', alLlegar);
    post({ kind: 'seguidos_pedir' });
    // Si el worker esta dormido no contesta: se reintenta en la siguiente carga.
    setTimeout(() => window.removeEventListener('message', alLlegar), 30000);
  };

  /* (a) EL BARRIDO, de red. */
  const pedirMasPaginas = (xhrOriginal, cuerpo) => {
    if (paginando) return;
    let j;
    try { j = JSON.parse(cuerpo || '{}'); } catch (_) { return; }
    const suyo = Number(j.searchSize) || 0;
    if (!suyo || Number(j.searchStart) !== 0) return;   // solo desde la primera
    if (j.email || j.fullName) return;                  // ya es una busqueda concreta
    paginando = true;

    preguntarPorLosNuestros(xhrOriginal, j);

    /* SU MISMO TAMANO. Pedir mas del que usa la pantalla no trae mas: Amazon
       devuelve 100 igual, y creerse que 250 es el tamano de pagina rompe la
       cuenta de donde empieza la siguiente. */
    const tam = suyo;
    const pedir = (pagina, total) => {
      if (pagina >= PAGINAS_MAX) return;
      if (total && pagina * tam >= total) return;       // ya estan todas
      repetir(xhrOriginal, { ...j, searchStart: pagina * tam, searchSize: tam },
              function () {
                const n = cuantosVinieron(this.responseText);
                if (n <= 0) return;                     // vacia o ilegible: se para
                const t = total || totalDe(this.responseText);
                pedir(pagina + 1, t);
              });
    };
    pedir(1, 0);
  };

  // ── XMLHttpRequest ──
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    this.__fdUrl = url; this.__fdMetodo = metodo; this.__fdCabeceras = {};
    return origOpen.call(this, metodo, url, ...resto);
  };
  /* Las cabeceras que pone la propia pagina. Se guardan EN MEMORIA y solo para
     poder repetir su peticion: no se mandan a ningun sitio ni se apuntan en
     ningun diagnostico. El anti-CSRF es una credencial y se queda aqui. */
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { if (this.__fdCabeceras) this.__fdCabeceras[k] = v; } catch (_) {}
    return origSetHeader.call(this, k, v);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (cuerpo) {
    /* TAMBIEN POR XHR. La sonda de «como se pide» estaba solo en el hook de
       `fetch`, y la pantalla de asociados pide su lista por XHR: por eso no
       disparaba nunca aunque la respuesta si se capturaba (el interceptor
       engancha las dos cosas y esto solo una). Otra vez dos sitios que tenian
       que hacer lo mismo y no lo hacian. */
    try {
      mirarComoSePide(this.__fdUrl || '', this.__fdMetodo || 'GET',
                      typeof cuerpo === 'string' ? cuerpo : '');
    } catch (_) {}
    this.addEventListener('load', function () {
      try {
        if (/\/account-management\/data\/search-providers/i.test(this.__fdUrl || '')) {
          pedirMasPaginas(this, typeof cuerpo === 'string' ? cuerpo : '');
        }
      } catch (_) {}
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
