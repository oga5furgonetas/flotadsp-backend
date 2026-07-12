/* FlotaDSP · Cortex Bridge — interceptor (MAIN world).
 * Parchea fetch y XHR para observar el JSON que Cortex ya pide con tu sesión.
 * NO lee la pantalla, NO usa OCR, NO toca cookies ni credenciales.
 * Solo procesa respuestas de endpoints de rutas/tareas y extrae paquetes.
 */
(() => {
  if (window.__flotadspCortexHooked) return;
  window.__flotadspCortexHooked = true;

  // ¿La URL parece de datos de ruta/paquetes de Cortex?
  const RELEVANT = /route-summaries|route-detail|routes?\/[0-9a-f-]{8,}|task|stop|itinerary|delivery|parcel|package/i;

  const TBA_RE = /^(?:TBA[A-Z0-9]{6,}|ES\d{8,})$/i;
  const KEYS = {
    tba: ['containerScannableId', 'scannableId', 'trackingId', 'trackingNumber', 'tba', 'packageId', 'parcelId', 'shipmentId'],
    state: ['taskState', 'executionStatus', 'deliveryStatus', 'status', 'state', 'packageStatus', 'stopState'],
    stop: ['stopId', 'stopNumber', 'sequenceId', 'sequenceNumber', 'stopSequence', 'stop'],
    address: ['address', 'formattedAddress', 'addressLine', 'destinationAddress', 'shortAddress'],
    container: ['containerId', 'toteId', 'binId', 'bagId', 'overrideContainerId'],
    driverName: ['driverName', 'associateName', 'transporterName', 'daName'],
    driverId: ['driverId', 'transporterId', 'associateId', 'daId'],
    routeCode: ['routeCode', 'routeName', 'routeShortCode', 'cycleName'],
    routeId: ['routeId', 'routeUuid', 'itineraryId'],
    lat: ['latitude', 'lat'],
    lng: ['longitude', 'lng', 'lon'],
    station: ['stationCode', 'stationId', 'nodeId', 'warehouseId'],
    events: ['recentTaskEvents', 'taskEvents', 'eventHistory', 'events', 'statusHistory'],
  };

  const firstKey = (obj, names) => {
    for (const k of names) if (obj[k] != null && obj[k] !== '') return obj[k];
    return null;
  };
  const pickTba = (obj) => {
    for (const k of KEYS.tba) {
      const v = obj[k];
      if (typeof v === 'string' && TBA_RE.test(v.trim())) return v.trim().toUpperCase();
    }
    // A veces el id útil está en un campo genérico "id"/"value"
    for (const k of ['id', 'value', 'code']) {
      const v = obj[k];
      if (typeof v === 'string' && TBA_RE.test(v.trim())) return v.trim().toUpperCase();
    }
    return null;
  };

  const buildObs = (node, ctx) => {
    const tba = pickTba(node);
    if (!tba) return null;
    const evs = firstKey(node, KEYS.events);
    let events = null;
    if (Array.isArray(evs)) {
      events = evs.map((e) => ({
        state: firstKey(e, ['type', 'eventType', 'state', 'status', 'code']) || '',
        at: firstKey(e, ['timestamp', 'time', 'eventTime', 'at', 'date', 'createdAt']) || null,
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
      observed_at: firstKey(node, ['lastUpdated', 'updatedAt', 'timestamp', 'time']) || null,
      events,
    };
  };

  // Recorre el JSON heredando contexto (ruta/conductor/stop de los ancestros).
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
      if (obs) { out.push(obs); return; } // es un paquete: no seguir dentro
      for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, next);
    };
    walk(json, {});
    // dedup por tba (nos quedamos con la última observación de cada uno)
    const map = new Map();
    for (const o of out) map.set(o.tba, o);
    return [...map.values()];
  };

  const emit = (url, json) => {
    try {
      const packages = extract(json);
      if (packages.length) {
        window.postMessage({ __flotadsp: true, kind: 'cortex', url, packages }, '*');
      }
    } catch (_) { /* nunca romper la página */ }
  };

  // ── fetch ──
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = (typeof args[0] === 'string' ? args[0] : args[0]?.url) || res.url || '';
      if (RELEVANT.test(url)) {
        res.clone().json().then((j) => emit(url, j)).catch(() => {});
      }
    } catch (_) {}
    return res;
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
        const url = this.__flotadspUrl || '';
        const isText = this.responseType === '' || this.responseType === 'text';
        if (RELEVANT.test(url) && isText) {
          const txt = this.responseText;
          if (txt && (txt[0] === '{' || txt[0] === '[')) emit(url, JSON.parse(txt));
        }
      } catch (_) {}
    });
    return origSend.apply(this, args);
  };
})();
