/* FlotaDSP · Cortex Bridge — background (service worker).
 * Robusto ante la suspensión del service worker de MV3: la cola se guarda en
 * chrome.storage.local (no en memoria) y el envío lo dispara chrome.alarms
 * (despierta el worker aunque esté dormido). Envía cada minuto o al llegar a 200.
 */
const DEFAULT_URL = 'https://flotadsp-backend.fly.dev/api/cortex/ingest';
const MAX_BATCH = 200;
const ALARM = 'flotadsp-flush';

/* QUE VERSION LLEVA ESTE EQUIPO. Un uuid que se crea la primera vez y vive en
   el almacen local del navegador. No identifica a nadie —ni nombre, ni usuario,
   ni maquina—: solo distingue una instalacion de otra, que es lo que hacia
   falta para poder probar una version nueva en UN solo PC sin dejar de ver la
   de los demas. Antes el backend guardaba una unica version por empresa y el
   ultimo equipo que hablara pisaba a los otros. */
let _idInst = null;
async function idInstalacion() {
  if (_idInst !== null) return _idInst;
  try {
    const { instalacion } = await chrome.storage.local.get({ instalacion: '' });
    if (instalacion) { _idInst = instalacion; return _idInst; }
    const nuevo = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).slice(0, 36);
    await chrome.storage.local.set({ instalacion: nuevo });
    _idInst = nuevo;
  } catch (_) { _idInst = ''; }
  return _idInst;
}

const AMZ = ['https://logistics.amazon.es/*', 'https://*.amazon.es/*'];

// Inyecta el interceptor (MAIN) + puente (ISOLATED) en una pestaña. Los scripts
// se auto-protegen contra doble carga, así que es seguro llamarlo varias veces.
async function inject(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['interceptor.js'] });
    await chrome.scripting.executeScript({ target: { tabId }, world: 'ISOLATED', files: ['bridge.js'] });
  } catch (_) { /* pestaña sin permiso o descargándose */ }
}
// Inyecta en TODAS las pestañas de Amazon ya abiertas (sin depender de recargar).
async function injectAll() {
  try {
    const tabs = await chrome.tabs.query({ url: AMZ });
    for (const t of tabs) if (t.id) inject(t.id);
  } catch (_) {}
}
function boot() {
  // Cada API va en su propio try: si una falla (p.ej. sin permiso), no tumba el resto.
  try { chrome.alarms?.create(ALARM, { periodInMinutes: 1 }); } catch (_) {}
  try { injectAll(); } catch (_) {}
}

async function cfg() {
  const { ingestToken = '', ingestUrl = DEFAULT_URL } = await chrome.storage.local.get(['ingestToken', 'ingestUrl']);
  return { ingestToken, ingestUrl: ingestUrl || DEFAULT_URL };
}
async function setState(patch) {
  const { state = {} } = await chrome.storage.local.get({ state: {} });
  await chrome.storage.local.set({ state: { ...state, ...patch, at: new Date().toISOString() } });
}

/* ── COMPUERTA POR ESTACIÓN ───────────────────────────────────────────────────
   Con dos pestañas abiertas de estaciones distintas —que es lo normal— la cola
   mezclaba paquetes de OGA5 y DGA1 y se enviaba todo junto. Luego el panel los
   reparte por `center`, pero si un paquete llegó sin estación reconocida acaba
   contando en el centro que no es, y un DCR con paquetes de otra nave es un
   número falso que nadie detecta.

   Ahora: se captura TODO (nunca se pierde nada), pero sólo se envía lo de las
   estaciones que tú marques. Y lo que llega sin estación no se envía jamás por
   defecto: se aparta y se enseña. Preferimos no mandar a mandar mal. */
function estacionDe(o) {
  return (o && (o.center || o.station_code || o.station || o.service_area_id)) || null;
}

/* Recuento por estación de lo que hay en cola, para que el popup pueda elegir. */
async function recuento(queue) {
  const porEstacion = {};
  let sinEstacion = 0;
  for (const o of Object.values(queue || {})) {
    const e = estacionDe(o);
    if (!e) { sinEstacion += 1; continue; }
    porEstacion[e] = (porEstacion[e] || 0) + 1;
  }
  await chrome.storage.local.set({ porEstacion, sinEstacion });
  return { porEstacion, sinEstacion };
}

async function enqueue(packages) {
  const { queue = {} } = await chrome.storage.local.get({ queue: {} });
  for (const o of packages) if (o && o.tba) queue[o.tba] = o;
  await chrome.storage.local.set({ queue });
  const n = Object.keys(queue).length;
  const { porEstacion, sinEstacion } = await recuento(queue);
  let { enviarEstaciones = [] } = await chrome.storage.local.get({ enviarEstaciones: [] });
  const nombres = Object.keys(porEstacion);

  /* ── PRIMERA VEZ Y UNA SOLA ESTACIÓN: se elige sola ───────────────────────
     La compuerta existe para no mezclar dos naves. Con UNA sola estación en
     cola no hay dos naves que mezclar, así que ahí no protege de nada y lo
     único que hace es dejar la extensión capturando SIN ENVIAR, en silencio,
     hasta que alguien abre el popup y marca la casilla.

     Pasó de verdad, y por eso está esto aquí: tras reinstalar, Chrome vacía el
     almacenamiento y con él la elección de estaciones; 2.579 paquetes se
     quedaron 20 minutos en cola con "0 enviados" y sin ninguna señal evidente.

     Sólo se auto-elige si el usuario NO ha elegido nunca. Si alguien desmarca a
     propósito, `eleccionHecha` queda puesto y no se le vuelve a marcar solo. */
  const { eleccionHecha = false } = await chrome.storage.local.get({ eleccionHecha: false });
  if (!enviarEstaciones.length && !eleccionHecha && nombres.length === 1) {
    enviarEstaciones = [nombres[0]];
    await chrome.storage.local.set({ enviarEstaciones });
  }
  const msg = nombres.length === 0
    ? `${n} paquetes en cola, sin estación reconocida.`
    : enviarEstaciones.length === 0
      ? `${n} en cola · elige qué estaciones enviar (${nombres.join(', ')}).`
      : `${n} en cola · enviando sólo ${enviarEstaciones.join(', ')}.`;
  await setState({ lastMessage: msg, buffered: n, sinEstacion });
  /* Sólo se autoenvía si ya hay estaciones elegidas: si no, esperar es lo
     correcto — el usuario todavía no ha dicho de qué nave son estos datos. */
  if (n >= MAX_BATCH && enviarEstaciones.length) flush();
}

let flushing = false;
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    const { queue = {} } = await chrome.storage.local.get({ queue: {} });
    const todos = Object.values(queue);
    if (!todos.length) return;

    /* La compuerta: sólo sale lo de las estaciones elegidas. Sin elección no se
       envía nada — es lo que evita mezclar dos naves teniendo dos pestañas. */
    const { enviarEstaciones = [] } = await chrome.storage.local.get({ enviarEstaciones: [] });
    const { porEstacion, sinEstacion } = await recuento(queue);
    if (!enviarEstaciones.length) {
      const nombres = Object.keys(porEstacion);
      await setState({
        ok: false,
        lastMessage: nombres.length
          ? `Nada enviado: elige estación (${nombres.map((n) => `${n} ${porEstacion[n]}`).join(', ')}).`
          : 'Nada enviado: ningún paquete trae estación reconocida.',
      });
      return;
    }
    const packages = todos.filter((o) => enviarEstaciones.includes(estacionDe(o)));
    if (!packages.length) {
      await setState({ ok: false, lastMessage: `En cola no hay nada de ${enviarEstaciones.join(', ')}.` });
      return;
    }

    const { ingestToken, ingestUrl } = await cfg();
    if (!ingestToken) { await setState({ lastMessage: 'Falta el token: pégalo y pulsa Guardar.', ok: false }); return; }
    // Envío por lotes de 500: con 40 rutas hay miles de paquetes y un solo POST
    // gigante fallaría o superaría los límites del backend.
    const CHUNK = 500;
    let sentNow = 0, newN = 0, chgN = 0;
    try {
      for (let i = 0; i < packages.length; i += CHUNK) {
        const part = packages.slice(i, i + CHUNK);
        const r = await fetch(ingestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json', 'X-Ingest-Token': ingestToken,
            'X-Ext-Version': chrome.runtime.getManifest().version,
            'X-Ext-Install': await idInstalacion(),
          },
          body: JSON.stringify({ captured_at: new Date().toISOString(), packages: part }),
        });
        if (!r.ok) {
          // La cola no se ha tocado: todo se reintentará en el próximo ciclo.
          const body = await r.text().catch(() => '');
          await setState({ lastMessage: `Error ${r.status}: ${body.slice(0, 80) || 'revisa el token'}`, ok: false });
          return;
        }
        const j = await r.json().catch(() => ({}));
        newN += j.new || 0; chgN += j.changed || 0; sentNow += part.length;
      }
      // Borra de la cola SOLO lo enviado (lo que llegó durante el envío se queda).
      const { queue: q2 = {} } = await chrome.storage.local.get({ queue: {} });
      for (const o of packages) delete q2[o.tba];
      const { sent = 0 } = await chrome.storage.local.get({ sent: 0 });
      await chrome.storage.local.set({ queue: q2, sent: sent + sentNow });
      await recuento(q2);
      const resto = Object.keys(q2).length;
      await setState({
        ok: true,
        buffered: resto,
        sinEstacion,
        lastMessage: `Enviados ${sentNow} de ${enviarEstaciones.join(', ')} (${newN} nuevos, ${chgN} cambios).`
          + (resto ? ` Quedan ${resto} de otras estaciones sin enviar.` : ''),
      });
    } catch (e) {
      await setState({ lastMessage: `Sin conexión, reintentando… (${String(e.message || e).slice(0, 50)})`, ok: false });
    }
  } finally { flushing = false; }
}

/* Diagnóstico al servidor: estructura, nunca paquetes.
   Va por libre y de forma silenciosa — si falla no se reintenta ni se avisa: es
   una foto del esquema, no un dato operativo, y no puede estorbar al envío de
   paquetes ni ensuciar el estado que ve el usuario en el popup. */
async function enviarDiagnostico(payload) {
  /* SI FALLA, SE DICE. Antes se tragaba el error entero y por eso el resumen de
     Cortex estuvo un dia entero sin llegar sin que nada lo delatara: el mensaje
     salia, alguien por el camino lo descartaba y la coleccion seguia vacia.
     Un fallo silencioso en el unico canal que trae los contadores de Amazon es
     justo el que no puede quedarse callado. Se apunta en la actividad, que es
     lo que se mira en el popup cuando algo no cuadra. */
  const que = payload?.kind || 'diagnostico';
  try {
    const { ingestToken, ingestUrl } = await cfg();
    if (!ingestToken) { await pushActivity(`${que}: sin token de ingesta`, 0); return; }
    const r = await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Ingest-Token': ingestToken,
        // Que version esta corriendo en cada nave. Con la extension repartida a
        // varias estaciones, sin esto no hay forma de saber quien tiene cual.
        'X-Ext-Version': chrome.runtime.getManifest().version,
        'X-Ext-Install': await idInstalacion(),
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) await pushActivity(`${que}: HTTP ${r.status}`, 0);
  } catch (e) {
    await pushActivity(`${que}: no salio (${String(e).slice(0, 40)})`, 0);
  }
}

async function pushActivity(url, count) {
  const { activity = [] } = await chrome.storage.local.get({ activity: [] });
  activity.unshift({ url: (url || '').replace(/^https?:\/\/[^/]+/, '').slice(0, 60), count, at: Date.now() });
  await chrome.storage.local.set({ activity: activity.slice(0, 12) });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'cortexPackages' && Array.isArray(msg.packages)) {
    enqueue(msg.packages).then(() => reply?.({ ok: true }));
    return true;
  }
  if (msg?.type === 'heartbeat') {
    const patch = { connected: true, hbUrl: msg.url, hbAt: Date.now() };
    if (msg.src === 'main') patch.mainAt = Date.now(); // el hook de red (MAIN) está vivo
    setState(patch);
    return false;
  }
  if (msg?.type === 'reinject') { injectAll().then(() => reply?.({ ok: true })); return true; }
  if (msg?.type === 'debug') {
    pushActivity(msg.url, msg.count || 0);
    return false;
  }
  if (msg?.type === 'sample') {
    chrome.storage.local.get({ diag: {} }).then(({ diag }) =>
      chrome.storage.local.set({ diag: { ...diag, keys: msg.keys || [], node: msg.node || '', at: Date.now() } }));
    return false;
  }
  if (msg?.type === 'estadosInforme') {
    /* Al servidor por el mismo camino que el esquema. Sin esto el resultado de
       la prueba vive solo en el popup de un equipo y no hay manera de saber si
       el informe de Cortex trae los paquetes que van en la furgoneta. */
    const usa = Array.isArray(msg.estados) ? msg.estados : [];
    const no = Array.isArray(msg.descartados) ? msg.descartados : [];
    enviarDiagnostico({
      kind: 'debug', which: 'estados_informe',
      url: `usa: ${usa.join(', ') || '(ninguno)'} · vacios: ${no.join(', ') || '(ninguno)'}`,
      count: usa.length, bytes: no.length,
    });
    return false;
  }
  if (msg?.type === 'schema') {
    const key = msg.which === 'summary' ? 'schemaSummary' : (msg.which === 'report' ? 'schemaReport' : 'schema');
    chrome.storage.local.get({ diag: {} }).then(({ diag }) =>
      chrome.storage.local.set({ diag: { ...diag, [key]: msg.schema || '', schemaUrl: msg.url || '', at: Date.now() } }));
    /* Y AL SERVIDOR. Hasta ahora el esquema se quedaba aquí, en el navegador de
       quien tuviera la extensión, donde nadie podía mirarlo. Es el único sitio
       donde consta QUÉ CAMPOS da Cortex de verdad (schemaOf conserva los
       valores de cadena cortos: taskType, taskState, taskStateContext...), y
       sin eso cualquier regla para descontar del DCR las anulaciones en nave se
       escribe a ojo. Es estructura, no datos de cliente. */
    enviarDiagnostico({ kind: 'schema', which: msg.which || 'details', url: msg.url, schema: msg.schema });
    return false;
  }
  /* LOS CONTADORES DEL PROPIO CORTEX. Van por el mismo camino que el esquema
     —diagnostico, no paquetes— porque no son datos de cliente: son totales por
     ruta y por conductor, mas el nombre y el telefono que Amazon publica de su
     propia plantilla. */
  if (msg?.type === 'resumenCortex') {
    enviarDiagnostico({ kind: 'resumen_cortex', url: msg.url, dia: msg.dia,
                        sa: msg.sa, datos: msg.datos });
    return false;
  }
  /* QUE ESTADOS DEL INFORME DE DIRECCIONES SE HAN APRENDIDO. Vivian en la
     memoria del interceptor y un F5 en Cortex los borraba: se volvia a pedir
     solo REATTEMPTABLE, los paquetes en furgoneta se quedaban sin dest_lat /
     dest_lng y el mapa de "Apoyo en ruta" los daba por sin ubicacion. Guardarlo
     aqui es lo unico que hace que el "aprende para siempre" sea verdad.

     Los estados se acumulan (son comunes a cualquier nave). La plantilla lleva
     el serviceAreaId dentro, asi que va POR ESTACION y solo se devuelve entera:
     el interceptor coge la de la estacion que esta mirando y descarta el resto.
     Nada de esto son datos de cliente: son nombres de estado y una URL. */
  if (msg?.type === 'informeAprendido') {
    chrome.storage.local.get({ informe: { estados: [], descartados: [], plantillas: {} } }).then(({ informe }) => {
      const estados = [...new Set([...(informe.estados || []),
                                   ...(Array.isArray(msg.estados) ? msg.estados : [])])];
      /* Un estado que ALGUNA vez trajo paquetes deja de estar descartado: puede
         venir vacio un dia flojo y no por eso hay que dejar de pedirlo. */
      const descartados = [...new Set([...(informe.descartados || []),
                                       ...(Array.isArray(msg.descartados) ? msg.descartados : [])])]
        .filter((s) => !estados.includes(s));
      const plantillas = { ...(informe.plantillas || {}) };
      if (msg.sa && typeof msg.plantilla === 'string' && msg.plantilla) plantillas[msg.sa] = msg.plantilla;
      chrome.storage.local.set({ informe: { estados, descartados, plantillas, at: Date.now() } });
    });
    return false;
  }
  if (msg?.type === 'informeGuardado') {
    chrome.storage.local.get({ informe: { estados: [], descartados: [], plantillas: {} } })
      .then(({ informe }) => reply?.({ estados: informe.estados || [],
                                       descartados: informe.descartados || [],
                                       plantillas: informe.plantillas || {} }));
    return true;   // respuesta asincrona: hay que mantener el canal abierto
  }
  if (msg?.type === 'flushNow') { flush().then(() => reply?.({ ok: true })); return true; }
  /* El popup manda aquí qué estaciones se envían. Lista vacía = no enviar nada. */
  if (msg?.type === 'setEstaciones') {
    const lista = Array.isArray(msg.estaciones) ? msg.estaciones : [];
    // `eleccionHecha` marca que la decisión la tomó una persona: a partir de
    // aquí no se auto-elige nada, ni aunque quede una sola estación. Desmarcar
    // a propósito tiene que aguantar.
    chrome.storage.local.set({ enviarEstaciones: lista, eleccionHecha: true }).then(async () => {
      await setState({ lastMessage: lista.length ? `Enviando sólo ${lista.join(', ')}.` : 'Envío en pausa: sin estación elegida.', ok: true });
      reply?.({ ok: true });
    });
    return true;
  }
  /* Descarta de la cola lo de una estación que NO quieres mandar. */
  if (msg?.type === 'descartarEstacion') {
    chrome.storage.local.get({ queue: {} }).then(async ({ queue }) => {
      for (const [tba, o] of Object.entries(queue)) if (estacionDe(o) === msg.estacion) delete queue[tba];
      await chrome.storage.local.set({ queue });
      await recuento(queue);
      await setState({ lastMessage: `Descartado lo de ${msg.estacion}.`, ok: true, buffered: Object.keys(queue).length });
      reply?.({ ok: true });
    });
    return true;
  }
});

// Registro de listeners al final (nunca antes de que existan sus funciones) y
// arranque el último: así, aunque boot() fallara, los listeners ya están vivos.
chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) flush(); });
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && /amazon\.es/.test(tab.url || '')) inject(tabId);
});
boot(); // al despertar el service worker
