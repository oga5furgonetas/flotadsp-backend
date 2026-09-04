/* FlotaDSP · Cortex Bridge — interceptor (MAIN world).
 * Parchea fetch y XHR para observar el JSON que Cortex ya pide con tu sesión.
 * NO lee la pantalla, NO usa OCR, NO toca cookies ni credenciales.
 * Extrae paquetes de CUALQUIER respuesta JSON que los contenga (no depende de
 * adivinar la URL exacta del endpoint).
 */
(() => {
  if (window.__flotadspCortexHooked) return;
  window.__flotadspCortexHooked = true;
  console.log('%c[FlotaDSP] Cortex Bridge activo — escuchando la API de Cortex', 'color:#fb923c;font-weight:bold');

  const post = (msg) => { try { window.postMessage({ __flotadsp: true, ...msg }, '*'); } catch (_) {} };
  // Heartbeat: le dice al popup que el interceptor está vivo en esta pestaña.
  const beat = () => post({ kind: 'heartbeat', url: location.href });
  beat();
  setInterval(beat, 25000);

  // Día de servicio seleccionado en Cortex (metadato de la página, no del paquete).
  // Se usa para separar los datos por día. Formato ISO YYYY-MM-DD.
  const serviceDay = () => {
    try {
      const di = document.querySelector('input[type="date"]');
      if (di && /^\d{4}-\d{2}-\d{2}$/.test(di.value || '')) return di.value;
      const m = location.search.match(/(?:date|day|serviceDate|planDate|localDate)=(\d{4}-\d{2}-\d{2})/i);
      if (m) return m[1];
    } catch (_) {}
    return null;
  };

  /* El día de HOY en la nave, compuesto a mano.
     ═══════════════════════════════════════════════════════════════════════
     Sacar el dia por ISO es lo que habia aqui, y en España
     (UTC+2) entre medianoche y las 2 devuelve el día ANTERIOR: la extensión
     le pedía a Cortex el resumen del día de ayer sin que nada fallara. La
     ventana no es teórica — el barrido sigue vivo hasta las 04:00.
     Es el gotcha 11: para un DÍA se compone con getFullYear/getMonth/getDate;
     `toISOString()` solo vale para un instante. */
  const hoyLocal = () => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`
      + `-${String(h.getDate()).padStart(2, '0')}`;
  };

  // Esquema de una respuesta: describe la ESTRUCTURA (claves + valores cortos)
  // sin volcar miles de items. Los estados de entrega son strings cortos, así
  // que aparecen literalmente y podemos localizar el campo real.
  const schemaOf = (v, depth) => {
    if (depth > 6) return '…';
    if (Array.isArray(v)) return v.length ? [schemaOf(v[0], depth + 1), `×${v.length}`] : [];
    if (v && typeof v === 'object') {
      const o = {}; let i = 0;
      for (const k of Object.keys(v)) {
        if (i++ > 45) { o['…'] = '…'; break; }
        o[k] = schemaOf(v[k], depth + 1);
      }
      return o;
    }
    if (typeof v === 'string') return v.length > 32 ? 'str' : v; // conserva valores cortos (estados)
    return typeof v;
  };
  let schemaSent = false, schemaSummarySent = false, schemaReportSent = false;

  // Auto-refresco: memorizamos las URLs GET de Cortex que devuelven paquetes y
  // las volvemos a pedir nosotros cada pocos minutos. Así todas las rutas se
  // cargan y actualizan solas sin que el usuario entre en cada una.
  /* DOS LISTAS, Y ESA ES LA CLAVE.
     ─────────────────────────────────────────────────────────────────────
     Antes había una sola con tope de 100 que expulsaba la más antigua. Ahí
     dentro competían las ~50 rutas del día con TODAS las demás llamadas que
     hace Cortex (resúmenes, informes, catálogos, cada navegación del
     usuario). Al llenarse, las URLs de ruta se iban cayendo del barrido EN
     SILENCIO: la ruta dejaba de refrescarse, sus paquetes se quedaban
     congelados en el último estado visto, y el cuadre del debrief seguía
     pidiendo paquetes que ya se habían entregado hacía horas.

     MEDIDO el 27-08 a las 18:00: solo 23 de 52 rutas habían recibido algún
     evento en los últimos 10 minutos. La app decía 376 paquetes "aún en la
     furgoneta" y Cortex 240 — la diferencia eran justo las rutas expulsadas.
     Una de ellas, XA_C15, llevaba 97 minutos sin un solo evento con 52
     paquetes sin resolver.

     Las rutas van ahora en su propia lista SIN TOPE: son las del día, unas
     70 como mucho, y son exactamente lo que no puede perderse. El tope se
     queda solo para lo demás, que sí es ilimitado y sí conviene acotar. */
  const knownGets = new Set();   // llamadas sueltas de la página
  const rutaGets = new Set();    // route-details: el barrido vive de esto
  const esRuta = (u) => /\/route-details\//i.test(u);
  const todasLasUrls = () => [...rutaGets, ...knownGets];

  /* La URL del resumen de rutas, guardada aparte para poder volver a pedirla.
     Es la que descubre las rutas del día: sin ella, una ruta que no esté ya
     en la lista no se descubre nunca. Se aprende de la petición real de la
     página —no se construye a mano— para no inventar parámetros. */
  let urlResumen = null;
  /* Y SI NO LA HEMOS VISTO, SE CONSTRUYE. Antes, sin haber visto la peticion
     real de la pagina, no se pedia el resumen — y el resumen es de donde salen
     las rutas del dia. Al recargar la extension esa URL se pierde, asi que
     hasta que la SPA la volviera a pedir por su cuenta, una ruta nueva NO SE
     DESCUBRIA NUNCA. Medido el 29-08: Cortex 41 rutas y 5.326 paquetes,
     nosotros 39 y 5.202 — las dos rutas que faltaban eran exactamente esos 124
     paquetes.

     La aprendida manda siempre; la construida es solo la red de seguridad. Si
     algun parametro no fuera correcto, la respuesta vendria vacia y no pasa
     nada: no se inventa ningun dato, simplemente no habria resumen hasta ver la
     peticion buena una vez. */
  const urlResumenFallback = () => {
    if (!saId) return null;   // sin estacion iria a la nave equivocada
    const dia = serviceDay() || hoyLocal();
    return `${location.origin}/operations/execution/api/route-summaries`
      + `?historicalDay=${histParam}&localDate=${dia}&serviceAreaId=${saId}`;
  };
  // Devuelve la promesa: el barrido la espera antes de cerrar la vuelta.
  const pedirResumen = () => {
    const u = urlResumen || urlResumenFallback();
    return u ? syntheticFetch(u) : Promise.resolve();
  };

  const rememberGet = (url, method) => {
    if ((method || 'GET').toUpperCase() !== 'GET') return;
    let abs;
    try { abs = new URL(url, location.origin).href; } catch (_) { return; }
    if (!/amazon\.es\//i.test(abs)) return;
    if (esRuta(abs)) { rutaGets.add(abs); return; }
    knownGets.add(abs);
    if (knownGets.size > 100) knownGets.delete(knownGets.values().next().value);
  };

  // Cabeceras que la propia página usa con la API de Cortex (csrf, accept…).
  // Las copiamos en nuestras peticiones para que el servidor las acepte igual.
  let apiHeaders = {};
  const noteHeaders = (h) => {
    if (!h || typeof h !== 'object') return;
    const clean = {};
    for (const [k, v] of Object.entries(h)) {
      if (typeof v === 'string' && !/^content-length$/i.test(k)) clean[k] = v;
    }
    apiHeaders = { ...apiHeaders, ...clean };
  };
  // Petición propia, educada y observable: mismas cabeceras que la página,
  // y si falla (403/429…) lo apunta en la actividad para diagnosticarlo.
  /* DEVUELVE LA PROMESA. Sin esto, el `await` del barrido no espera a nada y
     las peticiones salen todas de golpe: la limitacion a cuatro en paralelo no
     serviria y acabariamos en un 429. */
  const syntheticFetch = (url) => {
    try {
      return window.fetch(url, { credentials: 'include', headers: { accept: 'application/json, text/plain, */*', ...apiHeaders } })
        .then((r) => {
          if (!r || !r.ok) post({ kind: 'debug', url: `HTTP ${r ? r.status : '?'} · ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 100)}`, count: 0, bytes: 0 });
          return r;   // hace falta para poder CONTAR lo que trae un estado a prueba
        })
        .catch(() => post({ kind: 'debug', url: `sin respuesta · ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 100)}`, count: 0, bytes: 0 }));
    } catch (_) { return Promise.resolve(); }
  };
  /* ── BARRIDO ENCADENADO, Y SIN RELOJES DENTRO ────────────────────────────
     Encadenado y no a intervalo fijo: el numero de rutas cambia cada dia
     (mediana 45, maximo 71 en 30 dias medidos), y con un `setInterval` de 60 s
     los dias de mas volumen la vuelta no habria terminado cuando arranca la
     siguiente — se solapan y las peticiones se amontonan.

     Y sin temporizadores DENTRO de la vuelta, que es lo que la rompia: ver el
     comentario de `replay`. */
  const PAUSA_ENTRE = 20000;   // respiro entre barridos
  const CERROJO_MAX = 360000;  // si el cerrojo lleva 6 min puesto, algo fue mal
  let barriendo = 0;           // marca de tiempo de inicio, 0 = libre

  const replay = () => {
    /* EL VIGILANTE, ANTES QUE EL CERROJO. Un cerrojo que se queda puesto
       —pestaña dormida, service worker reciclado a media tanda— dejaria la
       captura muerta y EN SILENCIO, que es justo el fallo del 22-08: 712
       paquetes sin observar y nadie enterandose hasta tres dias despues. */
    if (barriendo && Date.now() - barriendo > CERROJO_MAX) {
      post({ kind: 'debug', url: 'barrido atascado > 6 min · se reanuda', count: 0, bytes: 0 });
      barriendo = 0;
    }
    if (barriendo) return;
    barriendo = Date.now();

    /* ── UN SOLO TEMPORIZADOR POR VUELTA, NO UNO POR RUTA ────────────────────
       Aqui habia un `setTimeout` por cada URL, escalonados a 1 por segundo.
       Sobre el papel, 39 rutas = 39 segundos. En la practica, CHROME FRENA LOS
       TEMPORIZADORES DE UNA PESTANA EN SEGUNDO PLANO A UNO POR MINUTO, y la
       pestana de Cortex esta siempre detras de otra cosa. Asi que 39 rutas
       pasaban a ser 39 MINUTOS.

       Medido el 29-08-2026 a las 11:21, con las rutas en la calle desde las 7:
           39 rutas · la mas fresca bajada hace 47 min · mediana 67 · peor 188
           cero rutas bajadas en los ultimos 15 minutos
           0 entregados de 5.201 en pantalla a las 11:21
       Y no era el barrido parado: era el barrido a un paso por minuto.

       La solucion no es acortar el intervalo —lo frenan igual— sino no depender
       de temporizadores DENTRO de la vuelta: un unico `await` sobre las
       peticiones, que resuelven por red y no por reloj, con cuatro en paralelo.
       Las 39 rutas salen en segundos aunque la pestana este dormida.

       Cuatro a la vez y no todas de golpe: la propia pagina de Cortex hace
       rafagas parecidas, y 39 peticiones simultaneas son las que acaban en un
       429 y en dejarnos sin datos del todo. */
    (async () => {
      const urls = todasLasUrls();
      const cola = urls.slice();
      const obrero = async () => {
        while (cola.length) {
          const u = cola.shift();
          if (u) { try { await syntheticFetch(u); } catch (_) {} }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, cola.length || 1) }, obrero));

      /* El informe de faltas y el resumen van al final de la misma vuelta.
         El informe es la categoria "se puede volver a intentar" del debrief y la
         unica fuente con la direccion en texto; el resumen es de donde salen las
         rutas —Cortex es una SPA y, si nadie navega, esa peticion no se repite
         nunca, asi que una ruta nueva no se descubriria jamas. */
      try { await pedirInforme(); } catch (_) {}
      try { await pedirResumen(); } catch (_) {}

      barriendo = 0;
      setTimeout(replay, PAUSA_ENTRE);
    })();
  };
  setTimeout(replay, 12000);   // el primero, tras dejar cargar la pagina

  // Descubrimiento de TODAS las rutas: de route-summaries sacamos la lista de
  // routeIds y pedimos el detalle de cada una nosotros mismos. Así se cargan
  // todas las rutas del día sin que el usuario entre en ninguna.
  /* El serviceAreaId SIEMPRE en minúsculas. Cortex lo escribe con una caja en
     la URL y puede escribirlo con otra dentro del JSON de route-details; si se
     guardan las dos, el panel ve DOS estaciones distintas que en realidad son
     la misma: dos casillas que marcar, el mapeo de centro duplicado y la mitad
     de los paquetes sin centro. Una sola forma y se acabó el problema. */
  const normSa = (s) => (typeof s === 'string' && s.trim() ? s.trim().toLowerCase() : null);
  /* Se arranca con el de la BARRA DE DIRECCIONES. Si sólo se aprendiera de las
     peticiones, una pestaña recién abierta se queda sin estación hasta que pase
     una, y hasta entonces no se puede pedir el informe de direcciones — que es
     justo lo que hay que pedir cuanto antes. Cortex siempre lo lleva en la URL
     de esta pantalla, y es el de la estación que se está mirando. */
  let saId = (() => {
    try { return normSa(new URL(location.href).searchParams.get('serviceAreaId')); }
    catch (_) { return null; }
  })();
  let histParam = 'false';
  const learnTemplate = (url) => {
    try {
      const u = new URL(url, location.origin);
      const s = normSa(u.searchParams.get('serviceAreaId')); if (s) saId = s;
      const h = u.searchParams.get('historicalDay'); if (h != null) histParam = h;
    } catch (_) {}
  };
  const ROUTE_ID_RE = /^\d{5,}-\d{1,3}$/; // p.ej. 7624078-2 (formato distintivo)
  const collectRoutes = (json) => {
    const ids = new Set(); let sa = null;

    /* ── EL CAMINO EXACTO PRIMERO: rmsRouteSummaries[].routeId ──────────────
       El barrido de abajo busca valores CON FORMA de routeId (`7715688-13`)
       sin mirar el nombre de la clave, y eso deja fuera las rutas RDM —las de
       rescate—, cuyo routeId es un UUID: `475d2ffe-bac7-4a10-af0a-...`.

       Nunca se descubrian, nunca se pedian, y sus paquetes no entraban jamas.
       Medido el 29-08-2026 a las 14:11, comparando con los contadores del
       propio Cortex ruta a ruta:

           RDM__PHne3aP   73 paquetes   nosotros 0
           RDM__rkRN6DE   45 paquetes   nosotros 0

       118 paquetes, y explicaban ELLOS SOLOS el descuadre: Cortex 5.310 y
       nosotros 5.202. Las otras 39 rutas cuadraban con ±1.

       No se arregla ensanchando el patron para que acepte UUIDs: en la misma
       respuesta hay decenas de UUIDs que no son rutas (serviceAreaId,
       addressId, itineraryId) y acabariamos pidiendo URLs inventadas. Se lee
       el campo por su nombre, que ahora sabemos cual es, y el barrido generico
       se queda de red por si la respuesta cambia de forma. */
    for (const r of (json && json.rmsRouteSummaries) || []) {
      const v = r && r.routeId;
      if (typeof v === 'string' && v.length > 6) ids.add(v);
      if (!sa && r && typeof r.serviceAreaId === 'string') sa = r.serviceAreaId;
    }

    const walk = (n) => {
      if (Array.isArray(n)) { for (const x of n) walk(x); return; }
      if (!n || typeof n !== 'object') return;
      for (const [k, v] of Object.entries(n)) {
        if (typeof v === 'string') {
          // Cualquier valor con forma de routeId, sin depender del nombre de la clave.
          if (ROUTE_ID_RE.test(v)) ids.add(v);
          else if (/serviceAreaId/i.test(k) && v.length > 8 && !sa) sa = v;
        } else if (v && typeof v === 'object') walk(v);
      }
    };
    walk(json);
    return { ids: [...ids], sa };
  };
  const fetchedRoutes = new Set();
  const harvestRoutes = (summaryJson) => {
    const { ids, sa } = collectRoutes(summaryJson);
    if (sa && !saId) saId = normSa(sa);
    let i = 0, nuevos = 0;
    for (const id of ids) {
      if (fetchedRoutes.has(id)) continue;
      fetchedRoutes.add(id);
      nuevos++;
      const url = `${location.origin}/operations/execution/api/route-details/${id}`
        + `?historicalDay=${histParam}&routeId=${id}${saId ? `&serviceAreaId=${saId}` : ''}`;
      rutaGets.add(url); // lista sin tope: una ruta no puede caerse del barrido
      setTimeout(() => syntheticFetch(url), (i++) * 1500); // 1 ruta cada 1,5 s
    }
    if (nuevos) {
      console.log(`%c[FlotaDSP] ${nuevos} rutas descubiertas → pidiendo detalle de todas`, 'color:#fb923c;font-weight:bold');
      post({ kind: 'debug', url: `descubiertas ${nuevos} rutas → cargando todas…`, count: nuevos, bytes: 0 });
    }
  };

  /* ── EL INFORME DE FALTAS, PEDIDO POR NOSOTROS ────────────────────────────
     `packagesByStatus` es el ÚNICO sitio de Cortex con la DIRECCIÓN en texto, y
     sólo se pide cuando alguien abre esa pantalla concreta. La lista de URLs que
     refrescamos solos vive en memoria y se vacía al recargar la pestaña: basta
     con un F5 —o reinstalar la extensión— para que ese informe deje de pedirse
     y las direcciones dejen de llegar sin que nadie se entere. Pasó: rutas
     entrando cada 3 minutos y CERO direcciones en 3.019 paquetes.

     Así que se pide sola. Dos formas, y la buena manda:
       · Si alguna vez hemos visto la petición de verdad, se guarda su URL con
         la fecha por rellenar y se reutiliza tal cual — cero suposiciones.
       · Si no la hemos visto todavía, se construye con los parámetros que usa
         Cortex (vistos en su propia URL). Si alguno no fuera correcto, la
         respuesta no traerá paquetes y no pasa nada: no se inventa ningún dato,
         simplemente no habría direcciones hasta ver la petición real una vez.

     No añade carga apreciable: una petición cada 3 minutos, la misma que hace
     la página cuando la tienes abierta. */
  /* QUÉ ESTADOS SE PIDEN. Empieza con REATTEMPTABLE y APRENDE: cada vez que
     alguien abre «Packages by status» con otro estado en Cortex, ese estado
     entra en la lista y se refresca solo en cada barrido, para siempre.
     Por qué importa: el informe es lo ÚNICO que trae la dirección y la
     geocodificación del DESTINO de cada paquete. route-details trae
     `executionGeocode`, que es el ÚLTIMO ESCANEO: para un paquete en
     furgoneta es la nave (medido el 02-09-2026: 191 de 200 PICKED_UP con la
     coordenada de la nave). El mapa de «Apoyo en ruta» del panel solo pinta
     lo que tiene destino conocido, así que sin esto las paradas en furgoneta
     salen sin ubicación. Un estado que Cortex no reconozca devuelve vacío y no
     pasa nada: no se inventa ningún dato. */
  let plantillaInforme = null;
  const estadosInforme = new Set(['REATTEMPTABLE']);

  /* ── QUE LOS DESCUBRA ELLA, EN VEZ DE ESPERAR A QUE ALGUIEN ABRA UNA PANTALLA ──
     Hasta la 2.23 un estado solo entraba en la lista si una persona abria
     «Packages by status» con ese estado en Cortex. Y eso no paso nunca: medido
     el 04-09-2026 con la 2.23 ya instalada en todos los equipos, 40 de 41
     paquetes REATTEMPTABLE tenian destino (97 %) y solo 42 de 2.592 en
     furgoneta (1,6 %). O sea que el arreglo anterior funcionaba y el problema
     era otro — nadie habia abierto esa pantalla con el estado de los que van en
     la furgoneta, que son justo los que necesita «Apoyo en ruta».

     Depender de que alguien navegue a un sitio concreto no es un diseno, es una
     esperanza. Asi que se PRUEBAN candidatos, que no es adivinar:
       · se pide cada uno UNA vez y se MIRA cuantos paquetes trae;
       · el que trae paquetes se aprende para siempre;
       · el que viene vacio se apunta como descartado y no se vuelve a pedir,
         asi que el coste es una tanda por equipo y no se repite cada dia;
       · si falla la red no se aprende NI se descarta: se probara otro dia.
     Un estado que Cortex no reconozca contesta vacio y no se inventa ni un
     dato. Los nombres salen de los que ya hemos visto de verdad en las URLs
     capturadas (REATTEMPTABLE y MISSING) mas las formas con las que Cortex
     nombra lo mismo en otras pantallas. Si ninguno trae los de la furgoneta se
     sabra, porque la lista de descartados queda escrita y se puede leer. */
  const CANDIDATOS_INFORME = [
    'PICKED_UP', 'OUT_FOR_DELIVERY', 'IN_TRANSIT', 'ON_ROAD', 'DISPATCHED',
    'LOADED', 'UNDELIVERED', 'NOT_DELIVERED', 'PENDING_PICKUP', 'MISSING',
  ];
  const descartadosInforme = new Set();   // probados y vacios: no se repiten
  /* …Y SE RECUERDAN ENTRE SESIONES. Ese «para siempre» de arriba no lo era: el
     Set y la plantilla vivían sólo en la memoria de la pestaña. Un F5 en Cortex
     —o cerrarla y volver por la mañana— y se arrancaba otra vez pidiendo
     únicamente REATTEMPTABLE, con lo que los paquetes que van en la furgoneta
     se quedaban sin `dest_lat/dest_lng` y «Apoyo en ruta» los listaba como
     «Cortex no da la ubicación». Es el mismo fallo que ya está descrito cuatro
     párrafos más arriba para las URLs del barrido, en la lista de al lado.
     Medido el 03-09-2026: 68 de 78 paradas de una ruta, sin ubicación.

     MAIN no tiene las APIs de la extensión, así que se guarda a través del
     puente (`informe_aprendido`) y se recupera al cargar (`informe_pedir`).

     La plantilla lleva el `serviceAreaId` DENTRO, así que va guardada POR
     ESTACIÓN y sólo se recupera la de la que se está mirando: restaurar la de
     otra nave pediría sus paquetes y los metería en el centro equivocado, que
     es justo contra lo que avisa el `return null` de aquí abajo. Los estados sí
     son comunes — `PICKED_UP` es `PICKED_UP` en cualquier nave. */
  const ESTADO_INFORME_OK = /^[A-Z][A-Z0-9_.-]{2,39}$/;
  let plantillasGuardadas = {};      // serviceAreaId → plantilla de sesiones anteriores
  let informeRespondido = false;
  const guardarInforme = () => post({
    kind: 'informe_aprendido', estados: [...estadosInforme],
    descartados: [...descartadosInforme],
    plantilla: plantillaInforme, sa: saId,
  });
  const plantillaInformeValida = (u) => {
    try {
      const x = new URL(u, location.origin);
      return x.origin === location.origin && /packagesByStatus/i.test(x.pathname);
    } catch (_) { return false; }
  };
  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__flotadspIn !== true || d.kind !== 'informe_guardado') return;
    informeRespondido = true;
    /* Sale de nuestro propio almacén, pero llega por `postMessage`, que
       cualquier script de la página puede falsificar. Se valida antes de usarlo:
       un estado inventado sería una petición de más, pero una plantilla ajena
       mandaría la sesión de Cortex del usuario a donde no debe. */
    let n = 0;
    for (const st of (Array.isArray(d.estados) ? d.estados : [])) {
      const s = String(st || '').trim().toUpperCase();
      if (ESTADO_INFORME_OK.test(s) && !estadosInforme.has(s)) { estadosInforme.add(s); n++; }
    }
    for (const st of (Array.isArray(d.descartados) ? d.descartados : [])) {
      const s = String(st || '').trim().toUpperCase();
      if (ESTADO_INFORME_OK.test(s)) descartadosInforme.add(s);
    }
    const ps = (d.plantillas && typeof d.plantillas === 'object') ? d.plantillas : {};
    for (const [sa, u] of Object.entries(ps)) {
      const k = normSa(sa);
      if (k && typeof u === 'string' && plantillaInformeValida(u)) plantillasGuardadas[k] = u;
    }
    if (n) post({ kind: 'debug', url: `informe: ${n} estado(s) recordados de la sesión anterior`, count: estadosInforme.size, bytes: 0 });
  });
  /* Se pregunta en cuanto arranca. `bridge.js` va en el mundo ISOLATED y el
     orden entre los dos no está garantizado, así que si a los 3 s nadie ha
     contestado se vuelve a preguntar — sigue sobrando margen para los 9 s del
     primer `pedirInforme`. */
  post({ kind: 'informe_pedir' });
  setTimeout(() => { if (!informeRespondido) post({ kind: 'informe_pedir' }); }, 3000);
  const urlInforme = (estado) => {
    const dia = serviceDay() || hoyLocal();
    // La aprendida en esta sesión manda; si no hay, la guardada DE ESTA MISMA
    // ESTACIÓN. Sin estación no se toca ninguna guardada: no sabríamos de cuál.
    const plantilla = plantillaInforme || (saId ? plantillasGuardadas[saId] : null);
    if (plantilla) {
      try {
        const u = new URL(plantilla.replace('__DIA__', dia));
        u.searchParams.set('packageStatus', estado);
        /* El `serviceAreaId` de una plantilla guardada puede ser de otra nave:
           manda el de la estación que se está mirando ahora. Dentro de la misma
           sesión coinciden y esto no hace nada. */
        if (saId && u.searchParams.has('serviceAreaId')) u.searchParams.set('serviceAreaId', saId);
        return u.href;
      } catch (_) { /* cae a la construcción de abajo */ }
    }
    if (!saId) return null;   // sin estación no se pide: iría al centro equivocado
    return `${location.origin}/operations/execution/api/packages/packagesByStatus`
      + `?historicalDay=false&localDate=${dia}&packageStatus=${encodeURIComponent(estado)}&serviceAreaId=${saId}`;
  };
  const aprenderInforme = (url) => {
    try {
      const u = new URL(url, location.origin);
      const st = (u.searchParams.get('packageStatus') || '').trim().toUpperCase();
      let cambio = false;
      if (st && !estadosInforme.has(st)) {
        estadosInforme.add(st);
        cambio = true;
        post({ kind: 'debug', url: `informe: estado nuevo aprendido ${st} (se refresca solo)`, count: estadosInforme.size, bytes: 0 });
      }
      u.searchParams.set('localDate', '__DIA__');
      if (plantillaInforme !== u.href) { plantillaInforme = u.href; cambio = true; }
      if (cambio) guardarInforme();   // que sobreviva al F5
    } catch (_) {}
  };
  const pedirInforme = async () => {
    let i = 0;
    for (const estado of estadosInforme) {
      const u = urlInforme(estado);
      if (!u) continue;
      if (i++) await new Promise((r) => setTimeout(r, 1500)); // uno cada 1,5 s, como las rutas
      try { await syntheticFetch(u); } catch (_) {}
    }
  };
  /* Prueba los candidatos que no se hayan probado nunca en este equipo. Va
     DESPUES del primer barrido para no competir con la carga de la pagina, y
     deja 15 s entre uno y otro: esto se hace una vez en la vida del equipo, no
     hay ninguna prisa. */
  const probarCandidatos = async () => {
    const porProbar = CANDIDATOS_INFORME.filter(
      (s) => !estadosInforme.has(s) && !descartadosInforme.has(s));
    if (!porProbar.length) return;
    post({ kind: 'debug', url: `informe: probando ${porProbar.length} estado(s) a ver cual trae los de la furgoneta`, count: porProbar.length, bytes: 0 });
    for (const estado of porProbar) {
      const u = urlInforme(estado);
      if (!u) return;                    // sin estacion todavia: se probara luego
      await new Promise((r) => setTimeout(r, 15000));
      let trajo = -1;                    // -1 = no se pudo saber
      try {
        const res = await syntheticFetch(u);
        if (res && res.ok) {
          const j = await res.clone().json();
          trajo = Array.isArray(j && j.packages) ? j.packages.length : 0;
        }
      } catch (_) { trajo = -1; }
      if (trajo > 0) {
        estadosInforme.add(estado);
        post({ kind: 'debug', url: `informe: ${estado} trae ${trajo} paquetes, se queda`, count: trajo, bytes: 0 });
      } else if (trajo === 0) {
        descartadosInforme.add(estado);
        post({ kind: 'debug', url: `informe: ${estado} viene vacio, descartado`, count: 0, bytes: 0 });
      }
      if (trajo >= 0) guardarInforme();
    }
  };

  setTimeout(pedirInforme, 9000);      // una vez al entrar, sin agobiar la carga
  setTimeout(probarCandidatos, 40000); // y luego los que no se hayan probado
  /* Ya NO tiene reloj propio: lo dispara el barrido al final de cada tanda.
     Tenerlo aparte a 180 s hacia que la pantalla mas mirada del debrief
     ("se puede volver a intentar") fuera la que peor se refrescaba. */

  const RELEVANT_URL = /route|task|stop|package|parcel|delivery|itinerary|summar|scan|assign|missing|falta|reason|exception|report/i;

  // Marcadores baratos: si el texto no los contiene, ni parseamos (evita coste).
  const MARK = /"(?:containerScannableId|scannableId|trackingId|taskState|executionStatus|deliveryStatus|recentTaskEvents|stopId|routeId)"|TBA[A-Z0-9]{6,}|\bES\d{8,}\b/;

  const TBA_RE = /^(?:TBA[A-Z0-9]{6,}|ES\d{8,})$/i;
  const KEYS = {
    tba: ['containerScannableId', 'scannableId', 'trackingId', 'trackingNumber', 'tba', 'packageId', 'parcelId', 'shipmentId', 'addressId'],
    state: ['taskState', 'executionStatus', 'deliveryStatus', 'status', 'state', 'packageStatus', 'stopState', 'taskStatus', 'reasonCode', 'missingReason', 'exceptionReason', 'reason', 'reasonDescription', 'exceptionCode', 'issueType'],
    /* Estados DE VERDAD, sin `packageStatus` (llega como objeto en el informe
       de faltas) y sin los campos de motivo (que son otra cosa y van a
       state_context). Ver la nota en buildObs. */
    stateReal: ['taskState', 'executionStatus', 'deliveryStatus', 'status', 'state', 'stopState', 'taskStatus'],
    stop: ['stopId', 'stopNumber', 'sequenceId', 'sequenceNumber', 'stopSequence', 'stop', 'stopKey'],
    address: ['address', 'formattedAddress', 'addressLine', 'destinationAddress', 'shortAddress', 'addressLine1'],
    container: ['containerId', 'toteId', 'binId', 'bagId', 'overrideContainerId', 'containerLabel'],
    driverName: ['driverName', 'associateName', 'transporterName', 'daName', 'personName'],
    driverId: ['driverId', 'transporterId', 'associateId', 'daId'],
    routeCode: ['routeCode', 'routeName', 'routeShortCode', 'cycleName', 'routeId'],
    routeId: ['routeId', 'routeUuid', 'itineraryId', 'routeKey'],
    lat: ['latitude', 'lat'],
    lng: ['longitude', 'lng', 'lon'],
    station: ['stationCode', 'stationId', 'nodeId', 'warehouseId'],
    events: ['recentTaskEvents', 'taskEvents', 'eventHistory', 'events', 'statusHistory', 'taskEventHistory'],
    time: ['lastUpdated', 'updatedAt', 'lastUpdatedTime', 'timestamp', 'time', 'lastEventTime'],
  };

  const firstKey = (obj, names) => {
    for (const k of names) if (obj && obj[k] != null && obj[k] !== '') return obj[k];
    return null;
  };
  /* Como firstKey pero SÓLO cadenas. Para campos donde un objeto colado hace
     daño: un `packageStatus: {...}` tomado por estado acaba guardándose como
     'OBSERVED' y borrando el estado real del paquete. */
  const firstStr = (obj, names) => {
    for (const k of names) {
      const v = obj && obj[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };
  const pickTba = (obj) => {
    for (const k of KEYS.tba) {
      const v = obj[k];
      if (typeof v === 'string' && TBA_RE.test(v.trim())) return v.trim().toUpperCase();
    }
    for (const k of ['id', 'value', 'code']) {
      const v = obj[k];
      if (typeof v === 'string' && TBA_RE.test(v.trim())) return v.trim().toUpperCase();
    }
    return null;
  };

  let sampled = false; // volcamos UNA muestra del nodo real al console para diagnosticar campos
  /* Geocodificación del DESTINO de un paquete: la de su dirección. NO es
     `latitude/longitude` sueltos del nodo, que en route-details son el último
     escaneo. Solo se acepta si viene dentro de `address` (o `geocode`) y son
     números; si no, null y el panel dice «sin ubicación», que es la verdad. */
  const destGeo = (node) => {
    if (!node || typeof node !== 'object') return null;
    const ad = node.address && typeof node.address === 'object' ? node.address : null;
    const g = (ad && (ad.geocode || ad)) || node.geocode || null;
    if (!g || typeof g !== 'object') return null;
    const la = g.latitude ?? g.lat, ln = g.longitude ?? g.lng ?? g.lon;
    return (typeof la === 'number' && typeof ln === 'number') ? { lat: la, lng: ln } : null;
  };

  const buildObs = (node, ctx) => {
    const tba = pickTba(node);
    if (!tba) return null;
    if (!sampled) {
      sampled = true;
      try {
        console.log('%c[FlotaDSP] muestra de paquete (campos reales de Cortex):', 'color:#fb923c;font-weight:bold', Object.keys(node));
        console.log('[FlotaDSP] nodo completo →', JSON.parse(JSON.stringify(node)));
        // También al popup, para el botón "Copiar diagnóstico" (sin DevTools).
        post({ kind: 'sample', keys: Object.keys(node), node: JSON.stringify(node).slice(0, 4000) });
      } catch (_) {}
    }
    const evs = firstKey(node, KEYS.events);
    let events = null;
    if (Array.isArray(evs)) {
      events = evs.map((e) => ({
        state: firstKey(e, ['type', 'eventType', 'state', 'status', 'code', 'taskState']) || '',
        at: firstKey(e, ['timestamp', 'time', 'eventTime', 'at', 'date', 'createdAt', 'eventTimestamp']) || null,
      })).filter((e) => e.at);
    }
    return {
      tba,
      reference_id: firstKey(node, ['referenceId', 'shipmentReference', 'orderId']) || null,
      route_code: firstKey(node, KEYS.routeCode) || ctx.routeCode || null,
      route_id: firstKey(node, KEYS.routeId) || ctx.routeId || null,
      driver_name: firstKey(node, KEYS.driverName) || ctx.driverName || null,
      driver_id: firstKey(node, KEYS.driverId) || ctx.driverId || null,
      stop_id: String(firstKey(node, KEYS.stop) ?? ctx.stop ?? '') || null,
      stop_address: (() => {
        const a = firstKey(node, KEYS.address) || ctx.address || null;
        if (!a || typeof a !== 'object') return a;
        /* SÓLO el punto de entrega. El informe de faltas trae dentro de
           `address` el nombre y el teléfono del cliente final, y no nos hacen
           falta para nada: lo que se investiga es el portal, no la persona.
           El backend ya los descartaba al guardar, pero lo correcto es que ni
           salgan del navegador. */
        return {
          address1: a.address1, address2: a.address2, address3: a.address3,
          city: a.city, state: a.state, postalCode: a.postalCode,
        };
      })(),
      container_id: firstKey(node, KEYS.container) || ctx.container || null,
      station: firstKey(node, KEYS.station) || ctx.station || null,
      /* ESTADO: sólo de campos que son ESTADOS de verdad, y sólo si son texto.
         Dos trampas reales del informe de faltas (packagesByStatus):
           · `packageStatus` viene como OBJETO. Cogido como estado, el backend
             no lo reconoce y lo deja en 'OBSERVED' — y eso pisaría el estado
             bueno de paquetes que route-details ya había dado por entregados.
           · `reasonCode` es un MOTIVO, no un estado. Va a `state_context`.
         Si aquí no hay estado, se manda null a propósito: el backend conserva
         el que ya tuviera. Una fuente que no sabe el estado no debe cambiarlo. */
      state: firstStr(node, KEYS.stateReal),
      raw_state: firstStr(node, KEYS.stateReal),
      /* El MOTIVO. En el informe de faltas viene como `reasonCode` y es el dato
         que dice "no puedo encontrar la dirección" (ADDRESS_NOT_FOUND) sin
         ambigüedad. Antes se tiraba, y el motivo había que deducirlo del
         `context` del timeline de route-details, que llega más tarde y no
         siempre. */
      state_context: (() => {
        const v = firstKey(node, ['reasonCode', 'taskStateContext', 'stateContext', 'reason']);
        if (typeof v !== 'string' || !v.trim()) return null;
        /* Cortex escribe el MISMO motivo de dos formas según de dónde salga:
           'ADDRESS_NOT_FOUND' en el timeline de route-details y
           'ADDRESS NOT FOUND' (con espacios) en el informe de faltas — se ve en
           la propia URL de Cortex: `&reasonCode=ADDRESS%20NOT%20FOUND`.
           Se normaliza aquí para que sea UNA sola cosa; si no, el panel filtra
           por una forma y se le escapan los paquetes que llegaron con la otra. */
        return v.trim().toUpperCase().replace(/[\s-]+/g, '_').slice(0, 80);
      })(),
      lat: firstKey(node, KEYS.lat) ?? ctx.lat ?? null,
      lng: firstKey(node, KEYS.lng) ?? ctx.lng ?? null,
      // El DESTINO (geocode de la dirección), aparte del último escaneo.
      dest_lat: destGeo(node)?.lat ?? null,
      dest_lng: destGeo(node)?.lng ?? null,
      observed_at: firstKey(node, KEYS.time) || null,
      events,
    };
  };

  const extract = (json) => {
    const out = [];
    const walk = (node, ctx) => {
      if (Array.isArray(node)) { for (const n of node) walk(n, ctx); return; }
      if (!node || typeof node !== 'object') return;
      const next = { ...ctx };
      const set = (k, names) => { const v = firstKey(node, names); if (v != null && v !== '') next[k] = v; };
      set('routeCode', KEYS.routeCode); set('routeId', KEYS.routeId);
      set('driverName', KEYS.driverName); set('driverId', KEYS.driverId);
      set('station', KEYS.station);
      if (firstKey(node, KEYS.stop) != null) next.stop = firstKey(node, KEYS.stop);
      if (firstKey(node, KEYS.address)) next.address = firstKey(node, KEYS.address);
      if (firstKey(node, KEYS.lat) != null) next.lat = firstKey(node, KEYS.lat);
      if (firstKey(node, KEYS.lng) != null) next.lng = firstKey(node, KEYS.lng);
      if (firstKey(node, KEYS.container)) next.container = firstKey(node, KEYS.container);

      const obs = buildObs(node, next);
      if (obs) { out.push(obs); return; }
      for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, next);
    };
    walk(json, {});
    const map = new Map();
    for (const o of out) map.set(o.tba, o);
    return [...map.values()];
  };

  // Parser específico de route-details: el paquete real es cada `task` dentro de
  // stops[].tasks[] — con taskState (estado), referenceId, y domainMap.scannableId
  // (el TBA). El conductor está en transporters[] y la dirección en addresses[].
  // Centro/estación seleccionado en Cortex. El selector muestra p.ej.:
  //  "OGA5 - O Milladoiro(OGA5)-Amazon Logistics(15895)"  (OGA5, código 15895)
  //  "DGA1 - Coruna (DGA1) - AMZL Logistics (15650)"      (DGA1, código 15650)
  // Aceptamos "Amazon" y "AMZL", con o sin espacios. Devuelve {center, code}.
  const STATION_RE = /^([A-Z0-9]{2,6})\s*-.*?(?:Amazon|AMZL)\s*Logistics\s*\(?\s*(\d{4,6})\s*\)?/i;
  const stationInfo = () => {
    try {
      const cands = [];
      document.querySelectorAll('select').forEach((s) => {
        const o = s.selectedOptions && s.selectedOptions[0];
        if (o && o.textContent) cands.push(o.textContent);
        if (s.value) cands.push(s.value);
      });
      document.querySelectorAll('[role="combobox"],[aria-haspopup],button,[class*="select"],[class*="Select"]').forEach((b) => {
        const t = (b.textContent || '').trim();
        if (t && t.length < 90) cands.push(t);
      });
      for (const raw of cands) {
        const m = raw.replace(/\s+/g, ' ').trim().match(STATION_RE);
        if (m) return { center: m[1].toUpperCase(), code: m[2] };
      }
    } catch (_) {}
    return { center: null, code: null };
  };
  // Mapas aprendidos en vivo para etiquetar bien los replays y fuentes pobres:
  const saCenter = {};      // serviceAreaId → centro
  const prefixCenter = {};  // prefijo de ruta (XA_C, CA_A) → centro
  const routePrefix = (rc) => { const m = String(rc || '').match(/^(.*?)(\d+)\s*$/); return m ? m[1] : null; };

  const extractRouteDetails = (json) => {
    const root = (json && json.rmsRouteDetails) || json;
    if (!root || !Array.isArray(root.stops)) return null;
    const routeCode = root.routeCode || null;
    const routeId = root.routeId || null;
    const said = normSa(root.serviceAreaId) || saId || null;
    const info = stationInfo();
    const pageCenter = info.center;
    const prefix = routePrefix(routeCode);
    if (said && pageCenter && !saCenter[said]) saCenter[said] = pageCenter; // 1ª vez = navegación real
    if (prefix && pageCenter && !prefixCenter[prefix]) prefixCenter[prefix] = pageCenter;
    // Prioridad: mapa por estación (duro) → página → mapa por prefijo de ruta.
    const center = (said && saCenter[said]) || pageCenter || (prefix && prefixCenter[prefix]) || null;
    const stationCode = info.code || null;
    const drivers = {};
    for (const t of (root.transporters || [])) {
      if (t && t.transporterId) {
        drivers[t.transporterId] = [t.firstName, t.lastName].filter(Boolean).join(' ').trim() || null;
      }
    }
    // Ruta con UN solo conductor: se lo asignamos a todas sus tareas aunque el
    // transporterId de la tarea no cuadre (rescates/ediciones lo desalinean).
    const driverVals = Object.values(drivers).filter(Boolean);
    const soloDriver = driverVals.length === 1 ? driverVals[0] : null;
    const addrs = {};
    for (const a of (root.addresses || [])) if (a && a.addressId) addrs[a.addressId] = a;
    let day = null;
    const ld = root.localDate;
    if (Array.isArray(ld) && ld.length >= 3) {
      day = `${ld[0]}-${String(ld[1]).padStart(2, '0')}-${String(ld[2]).padStart(2, '0')}`;
    }
    const out = [];
    for (const stop of root.stops) {
      const seq = stop.sequenceNumber;
      for (const task of (stop.tasks || [])) {
        const dm = task.domainMap || {};
        const tba = pickTba(dm) || pickTba(task);
        if (!tba) continue;
        const a = addrs[task.addressId || stop.addressId] || {};
        const addrStr = a.address1 ? [a.address1, a.address2, a.city].filter(Boolean).join(', ') : null;
        const geo = task.executionGeocode || a.geocode || {};
        const tid = task.transporterId || stop.transporterId;
        let events = null;
        if (Array.isArray(task.recentTaskEvents)) {
          events = task.recentTaskEvents.map((e) => ({
            state: firstKey(e, ['type', 'eventType', 'state', 'status', 'code', 'taskState', 'name']) || '',
            at: firstKey(e, ['timestamp', 'time', 'eventTime', 'at', 'date', 'createdAt', 'eventTimestamp', 'epochMillis']) || null,
            context: firstKey(e, ['taskStateContext', 'reasonCode', 'reason', 'context', 'detail', 'description']) || null,
          })).filter((e) => e.at);
        }
        out.push({
          tba,
          reference_id: task.referenceId || dm.orderId || null,
          route_code: routeCode, route_id: routeId,
          service_area_id: said, center, station_code: stationCode,
          driver_name: drivers[tid] || soloDriver || null, driver_id: tid || null,
          stop_id: seq != null ? String(seq) : null,
          stop_address: addrStr,
          container_id: task.containerScannableId || null,
          state: task.taskState || task.executionStatus || null,
          raw_state: task.taskState || null,
          state_context: task.taskStateContext || null,
          task_type: task.taskType || null,
          lat: geo.latitude ?? null, lng: geo.longitude ?? null,
          // Destino planificado (geocode de la dirección), si route-details lo trae.
          dest_lat: (a.geocode && typeof a.geocode.latitude === 'number') ? a.geocode.latitude : null,
          dest_lng: (a.geocode && typeof a.geocode.longitude === 'number') ? a.geocode.longitude : null,
          observed_at: task.actualExecutionTime || stop.actualEndTime || null,
          service_day: day,
          events,
        });
      }
    }
    return out.length ? out : null;
  };

  const emit = (url, text, method) => {
    try {
      if (!text || text.length < 2) return;
      const c = text[0];
      if (c !== '{' && c !== '[') return;
      const isSummary = /route-summaries/i.test(url);
      const isDetails = /route-details/i.test(url);
      if (isDetails) learnTemplate(url);
      /* Guardar la URL REAL del resumen para poder volver a pedirla en cada
         barrido. Se toma la que hace la página, con sus parámetros tal cual:
         construirla a mano significaría adivinar el serviceAreaId y la fecha,
         y una URL mal montada devuelve vacío sin avisar. */
      if (isSummary) { try { urlResumen = new URL(url, location.origin).href } catch (_) {} }
      // La petición REAL del informe manda sobre la que construimos nosotros.
      if (/packagesByStatus/i.test(url)) { learnTemplate(url); aprenderInforme(url); }
      const marked = MARK.test(text);
      // Nos interesan respuestas de datos (por URL o por contenido) y el sumario.
      if (!marked && !isSummary && !RELEVANT_URL.test(url)) return;
      let parsed = null;
      try { parsed = JSON.parse(text); } catch (_) {}
      // De route-summaries sacamos TODAS las rutas del día y pedimos su detalle.
      if (parsed && isSummary) harvestRoutes(parsed);

      /* ── LOS CONTADORES DEL PROPIO CORTEX ─────────────────────────────────
         `route-summaries` trae `rmsRouteSummaries` y `transporterPackageSummaries`:
         lo que Cortex cuenta por ruta y por conductor, hecho por Amazon y no por
         nosotros. Es la ÚNICA forma de saber si vamos por detrás.

         Hace falta porque el 28-08-2026 a las 14:37 Cortex decía 3.251 paquetes
         restantes y nosotros teníamos 1.039 entregados de 6.775: unas 2.500
         entregas sin capturar, y en pantalla no se notaba nada. Al cerrar el día
         cuadró (6.769 de 6.895), o sea que el barrido acaba llegando — pero a
         media tarde, que es cuando se mira, la app iba muy atrás y lo decía
         todo con la misma seguridad.

         Se manda tal cual y sin interpretarlo aquí: el esquema que teníamos se
         capturó a las 8:13 con los arrays vacíos, así que los nombres de dentro
         no se conocen todavía. Guardarlo primero y leerlo cuando haya datos de
         verdad es más lento y es lo único que no se inventa nada. */
      if (parsed && isSummary) {
        try {
          /* SE MANDA RECORTADO, NO ENTERO. Una sola ruta de `rmsRouteSummaries`
             trae paradas, descansos, meteorologia, bateria y treinta bloques
             mas; las 41 juntas son megabytes que no caben en un mensaje y que
             ademas no hacen falta. Se sacan cuatro cosas:

               · los contadores de Amazon por ruta (DELIVERED / REMAINING /
                 REATTEMPTABLE), que es con lo que se comprueba si vamos por
                 detras — el 29-08 Cortex decia 41 rutas y 5.326 paquetes y
                 nosotros teniamos 39 y 5.202;
               · la lista de rutas, para descubrir las que falten;
               · el NOMBRE y el TELEFONO de cada conductor. Esto es lo gordo:
                 `route-details` no manda nombres (0 de 7.171 paquetes medidos)
                 y por eso el debrief enseña "SIN FICHA" con un codigo. Aqui SI
                 vienen, y con el telefono, que falta en 150 fichas de 212. */
          const t = (v) => (typeof v === 'string' ? v.slice(0, 80) : v);
          const rutas = (parsed.rmsRouteSummaries || []).map((r) => ({
            routeId: t(r.routeId), routeCode: t(r.routeCode),
            transporterId: t(r.transporterIdFromRms),
            status: t(r.routeStatus), progreso: t(r.progressStatus),
            paquetes: (r.routeDeliveryProgress || {}).routePackageSummary || null,
            totalTasks: (r.routeDeliveryProgress || {}).totalTasks,
            completedTasks: (r.routeDeliveryProgress || {}).completedTasks,
            totalStops: (r.routeDeliveryProgress || {}).totalStops,
            completedStops: (r.routeDeliveryProgress || {}).completedStops,
          }));
          const gente = (parsed.transporters || []).map((x) => ({
            transporterId: t(x.transporterId),
            nombre: [t(x.firstName), t(x.lastName)].filter(Boolean).join(' ').trim(),
            telefono: t(x.workPhoneNumber),
          })).filter((x) => x.transporterId);
          const cuentas = (parsed.transporterPackageSummaries || []).map((x) => ({
            transporterId: t(x.transporterId), paquetes: x.packageStatus || null,
          })).filter((x) => x.transporterId);

          if (rutas.length || gente.length || cuentas.length) {
            post({ kind: 'resumen_cortex', url: url.slice(0, 160),
                   dia: serviceDay(), sa: saId,
                   datos: { rutas, gente, cuentas } });
          }
        } catch (_) {}
      }
      let packages = [];
      if (parsed && (marked || isDetails)) packages = extractRouteDetails(parsed) || extract(parsed);

      /* ── ADOPTAR LOS PAQUETES DEL INFORME DE FALTAS ──────────────────────
         `packagesByStatus` es el ÚNICO sitio de Cortex que da la DIRECCIÓN de
         texto (address1/city/postalCode) y el motivo (reasonCode). Pero sus
         paquetes NO traen estación: ni serviceAreaId, ni centro, ni nada.

         La compuerta de background.js aparta lo que llega sin estación y no lo
         envía nunca —y hace bien: un paquete contado en el centro que no es
         falsea el DCR de una nave entera—. El efecto colateral era que la
         dirección se capturaba, se quedaba en la cola y no llegaba jamás al
         panel: 0 de 3.019 paquetes con dirección, con el conductor marcando
         "no puedo encontrar la dirección" y nosotros sin poder buscarla.

         El serviceAreaId NO se adivina: viene en la URL de la MISMA petición
         que ha devuelto estos paquetes —
           …/packagesByStatus?…&serviceAreaId=10ef2406-a250-45ce-8fa5-…
         y también en la barra de direcciones de Cortex. Se lee de ahí y punto.

         (Antes esto se deducía del prefijo de la ruta, que era una suposición:
         si el prefijo estuviera mal aprendido, los paquetes se irían al centro
         equivocado sin que nadie lo notara. Leer el identificador que Cortex ya
         pone en la URL no admite ese error.)

         TRES SITIOS, por orden de fiabilidad, y ninguno es una suposición:
           1. la URL de la propia petición;
           2. la BARRA DE DIRECCIONES de Cortex, que en esta pantalla siempre lo
              lleva: …/dv/routes?…&serviceAreaId=10ef2406-a250-45ce-8fa5-…
              Es la estación que la persona está mirando en ese momento, y cada
              pestaña tiene la suya, así que con dos pestañas abiertas no se
              mezclan;
           3. el aprendido navegando por route-details.

         El punto 2 no estaba y era el que hacía falta: 83 paquetes se quedaban
         sin estación —los 82 reintentos y la falta del día— porque la petición
         del informe no lleva el parámetro y en esa pestaña no se había cargado
         ningún route-details del que aprenderlo. Sin estación no se envían, así
         que la dirección no salía del navegador. */
      const saDeUrl = (u) => {
        try { return normSa(new URL(u, location.origin).searchParams.get('serviceAreaId')); }
        catch (_) { return null; }
      };
      const saParaEstos = saDeUrl(url) || saDeUrl(location.href) || saId;
      if (saParaEstos) {
        for (const p of packages) {
          if (!p.service_area_id && !p.center) p.service_area_id = saParaEstos;
        }
      }
      // Diagnóstico de estructura: esquema de route-details y de route-summaries.
      if (!schemaSent && isDetails && parsed) {
        try {
          schemaSent = true;
          post({ kind: 'schema', which: 'details', url: url.slice(0, 120), schema: JSON.stringify(schemaOf(parsed, 0)).slice(0, 7000) });
        } catch (_) {}
      }
      if (!schemaSummarySent && isSummary && parsed) {
        try {
          schemaSummarySent = true;
          post({ kind: 'schema', which: 'summary', url: url.slice(0, 120), schema: JSON.stringify(schemaOf(parsed, 0)).slice(0, 7000) });
        } catch (_) {}
      }
      // Esquema del informe de faltas/motivos (una vez), para afinar su parser.
      if (!schemaReportSent && parsed && !isSummary && !isDetails
          && /missing|falta|reason|exception|report/i.test(url) && MARK.test(text)) {
        try {
          schemaReportSent = true;
          post({ kind: 'schema', which: 'report', url: url.slice(0, 120), schema: JSON.stringify(schemaOf(parsed, 0)).slice(0, 7000) });
        } catch (_) {}
      }
      // Diagnóstico: registra CADA respuesta relevante, aunque saque 0 paquetes.
      post({ kind: 'debug', url: url.slice(0, 130), count: packages.length, bytes: text.length });
      if (packages.length) {
        const day = serviceDay();
        // El día de route-details viene de localDate (fiable). Solo rellenamos con
        // el de la página si el paquete no trae ya el suyo.
        for (const p of packages) if (!p.service_day && day) p.service_day = day;
        rememberGet(url, method); // esta URL trae paquetes → la refrescaremos sola
        console.log(`%c[FlotaDSP] ${packages.length} paquetes capturados`, 'color:#34d399', url.slice(0, 80));
        post({ kind: 'cortex', url, packages });
      }
    } catch (_) { /* nunca romper la página */ }
  };

  // ── fetch ──
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    // Aprende las cabeceras que la página usa con la API de Cortex.
    try {
      const u0 = (typeof args[0] === 'string' ? args[0] : args[0]?.url) || '';
      if (/route-details|route-summaries/i.test(u0)) {
        const hh = (args[1] && args[1].headers) || (typeof args[0] === 'object' && args[0]?.headers) || null;
        if (hh) {
          const h = {};
          if (typeof hh.forEach === 'function') hh.forEach((v, k) => { h[k] = v; });
          else Object.assign(h, hh);
          noteHeaders(h);
        }
      }
    } catch (_) {}
    const p = origFetch.apply(this, args);
    p.then((res) => {
      try {
        const url = (typeof args[0] === 'string' ? args[0] : args[0]?.url) || res.url || '';
        const method = (args[1]?.method) || (typeof args[0] === 'object' ? args[0]?.method : '') || 'GET';
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('json') || /route|task|stop|package|parcel|delivery|itinerary|summar/i.test(url)) {
          res.clone().text().then((t) => emit(url, t, method)).catch(() => {});
        }
      } catch (_) {}
    }).catch(() => {});
    return p;
  };

  // ── XMLHttpRequest ──
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__flotadspUrl = url;
    this.__flotadspMethod = method;
    return origOpen.call(this, method, url, ...rest);
  };
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { (this.__flotadspHdrs = this.__flotadspHdrs || {})[k] = v; } catch (_) {}
    return origSetHeader.call(this, k, v);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    try {
      if (/route-details|route-summaries/i.test(this.__flotadspUrl || '')) noteHeaders(this.__flotadspHdrs);
    } catch (_) {}
    this.addEventListener('load', function () {
      try {
        const rt = this.responseType;
        const m = this.__flotadspMethod || 'GET';
        if (rt === '' || rt === 'text') emit(this.__flotadspUrl || '', this.responseText, m);
        else if (rt === 'json' && this.response) emit(this.__flotadspUrl || '', JSON.stringify(this.response), m);
      } catch (_) {}
    });
    return origSend.apply(this, args);
  };
})();
