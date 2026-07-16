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
  const knownGets = new Set();
  const rememberGet = (url, method) => {
    if ((method || 'GET').toUpperCase() !== 'GET') return;
    let abs;
    try { abs = new URL(url, location.origin).href; } catch (_) { return; }
    if (!/amazon\.es\//i.test(abs)) return;
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
  const syntheticFetch = (url) => {
    try {
      window.fetch(url, { credentials: 'include', headers: { accept: 'application/json, text/plain, */*', ...apiHeaders } })
        .then((r) => {
          if (!r || !r.ok) post({ kind: 'debug', url: `HTTP ${r ? r.status : '?'} · ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 100)}`, count: 0, bytes: 0 });
        })
        .catch(() => post({ kind: 'debug', url: `sin respuesta · ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 100)}`, count: 0, bytes: 0 }));
    } catch (_) {}
  };
  const replay = () => {
    let i = 0;
    for (const url of knownGets) {
      setTimeout(() => syntheticFetch(url), (i++) * 1000); // 1 req/s: ritmo suave
    }
  };
  setInterval(replay, 180000); // cada 3 min

  // Descubrimiento de TODAS las rutas: de route-summaries sacamos la lista de
  // routeIds y pedimos el detalle de cada una nosotros mismos. Así se cargan
  // todas las rutas del día sin que el usuario entre en ninguna.
  let saId = null, histParam = 'false';
  const learnTemplate = (url) => {
    try {
      const u = new URL(url, location.origin);
      const s = u.searchParams.get('serviceAreaId'); if (s) saId = s;
      const h = u.searchParams.get('historicalDay'); if (h != null) histParam = h;
    } catch (_) {}
  };
  const ROUTE_ID_RE = /^\d{5,}-\d{1,3}$/; // p.ej. 7624078-2 (formato distintivo)
  const collectRoutes = (json) => {
    const ids = new Set(); let sa = null;
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
    if (sa && !saId) saId = sa;
    let i = 0, nuevos = 0;
    for (const id of ids) {
      if (fetchedRoutes.has(id)) continue;
      fetchedRoutes.add(id);
      nuevos++;
      const url = `${location.origin}/operations/execution/api/route-details/${id}`
        + `?historicalDay=${histParam}&routeId=${id}${saId ? `&serviceAreaId=${saId}` : ''}`;
      knownGets.add(url); // el replay periódico lo mantendrá fresco
      setTimeout(() => syntheticFetch(url), (i++) * 1500); // 1 ruta cada 1,5 s
    }
    if (nuevos) {
      console.log(`%c[FlotaDSP] ${nuevos} rutas descubiertas → pidiendo detalle de todas`, 'color:#fb923c;font-weight:bold');
      post({ kind: 'debug', url: `descubiertas ${nuevos} rutas → cargando todas…`, count: nuevos, bytes: 0 });
    }
  };

  const RELEVANT_URL = /route|task|stop|package|parcel|delivery|itinerary|summar|scan|assign|missing|falta|reason|exception|report/i;

  // Marcadores baratos: si el texto no los contiene, ni parseamos (evita coste).
  const MARK = /"(?:containerScannableId|scannableId|trackingId|taskState|executionStatus|deliveryStatus|recentTaskEvents|stopId|routeId)"|TBA[A-Z0-9]{6,}|\bES\d{8,}\b/;

  const TBA_RE = /^(?:TBA[A-Z0-9]{6,}|ES\d{8,})$/i;
  const KEYS = {
    tba: ['containerScannableId', 'scannableId', 'trackingId', 'trackingNumber', 'tba', 'packageId', 'parcelId', 'shipmentId', 'addressId'],
    state: ['taskState', 'executionStatus', 'deliveryStatus', 'status', 'state', 'packageStatus', 'stopState', 'taskStatus', 'reasonCode', 'missingReason', 'exceptionReason', 'reason', 'reasonDescription', 'exceptionCode', 'issueType'],
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
      stop_address: firstKey(node, KEYS.address) || ctx.address || null,
      container_id: firstKey(node, KEYS.container) || ctx.container || null,
      station: firstKey(node, KEYS.station) || ctx.station || null,
      state: firstKey(node, KEYS.state) || null,
      raw_state: firstKey(node, KEYS.state) || null,
      lat: firstKey(node, KEYS.lat) ?? ctx.lat ?? null,
      lng: firstKey(node, KEYS.lng) ?? ctx.lng ?? null,
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
  const extractRouteDetails = (json) => {
    const root = (json && json.rmsRouteDetails) || json;
    if (!root || !Array.isArray(root.stops)) return null;
    const routeCode = root.routeCode || null;
    const routeId = root.routeId || null;
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
          })).filter((e) => e.at);
        }
        out.push({
          tba,
          reference_id: task.referenceId || dm.orderId || null,
          route_code: routeCode, route_id: routeId,
          driver_name: drivers[tid] || soloDriver || null, driver_id: tid || null,
          stop_id: seq != null ? String(seq) : null,
          stop_address: addrStr,
          container_id: task.containerScannableId || null,
          state: task.taskState || task.executionStatus || null,
          raw_state: task.taskState || null,
          task_type: task.taskType || null,
          lat: geo.latitude ?? null, lng: geo.longitude ?? null,
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
      const marked = MARK.test(text);
      // Nos interesan respuestas de datos (por URL o por contenido) y el sumario.
      if (!marked && !isSummary && !RELEVANT_URL.test(url)) return;
      let parsed = null;
      try { parsed = JSON.parse(text); } catch (_) {}
      // De route-summaries sacamos TODAS las rutas del día y pedimos su detalle.
      if (parsed && isSummary) harvestRoutes(parsed);
      let packages = [];
      if (parsed && (marked || isDetails)) packages = extractRouteDetails(parsed) || extract(parsed);
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
