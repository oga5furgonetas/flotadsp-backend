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

  const RELEVANT_URL = /route|task|stop|package|parcel|delivery|itinerary|summar|scan|assign/i;

  // Marcadores baratos: si el texto no los contiene, ni parseamos (evita coste).
  const MARK = /"(?:containerScannableId|scannableId|trackingId|taskState|executionStatus|deliveryStatus|recentTaskEvents|stopId|routeId)"|TBA[A-Z0-9]{6,}|\bES\d{8,}\b/;

  const TBA_RE = /^(?:TBA[A-Z0-9]{6,}|ES\d{8,})$/i;
  const KEYS = {
    tba: ['containerScannableId', 'scannableId', 'trackingId', 'trackingNumber', 'tba', 'packageId', 'parcelId', 'shipmentId', 'addressId'],
    state: ['taskState', 'executionStatus', 'deliveryStatus', 'status', 'state', 'packageStatus', 'stopState', 'taskStatus'],
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

  const emit = (url, text) => {
    try {
      if (!text || text.length < 2) return;
      const c = text[0];
      if (c !== '{' && c !== '[') return;
      const marked = MARK.test(text);
      // Solo nos interesan respuestas de datos (por URL o por contenido).
      if (!marked && !RELEVANT_URL.test(url)) return;
      let packages = [];
      if (marked) { try { packages = extract(JSON.parse(text)); } catch (_) {} }
      // Diagnóstico: registra CADA respuesta relevante, aunque saque 0 paquetes.
      post({ kind: 'debug', url: url.slice(0, 130), count: packages.length, bytes: text.length });
      if (packages.length) {
        console.log(`%c[FlotaDSP] ${packages.length} paquetes capturados`, 'color:#34d399', url.slice(0, 80));
        post({ kind: 'cortex', url, packages });
      }
    } catch (_) { /* nunca romper la página */ }
  };

  // ── fetch ──
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    p.then((res) => {
      try {
        const url = (typeof args[0] === 'string' ? args[0] : args[0]?.url) || res.url || '';
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('json') || /route|task|stop|package|parcel|delivery|itinerary|summar/i.test(url)) {
          res.clone().text().then((t) => emit(url, t)).catch(() => {});
        }
      } catch (_) {}
    }).catch(() => {});
    return p;
  };

  // ── XMLHttpRequest ──
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__flotadspUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const rt = this.responseType;
        if (rt === '' || rt === 'text') emit(this.__flotadspUrl || '', this.responseText);
        else if (rt === 'json' && this.response) emit(this.__flotadspUrl || '', JSON.stringify(this.response));
      } catch (_) {}
    });
    return origSend.apply(this, args);
  };
})();
