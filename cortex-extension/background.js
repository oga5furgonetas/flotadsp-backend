/* FlotaDSP · Cortex Bridge — background (service worker).
 * Robusto ante la suspensión del service worker de MV3: la cola se guarda en
 * chrome.storage.local (no en memoria) y el envío lo dispara chrome.alarms
 * (despierta el worker aunque esté dormido). Envía cada minuto o al llegar a 200.
 */
const DEFAULT_URL = 'https://flotadsp-backend.fly.dev/api/cortex/ingest';
const MAX_BATCH = 200;
const ALARM = 'flotadsp-flush';

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

async function enqueue(packages) {
  const { queue = {} } = await chrome.storage.local.get({ queue: {} });
  for (const o of packages) if (o && o.tba) queue[o.tba] = o;
  await chrome.storage.local.set({ queue });
  const n = Object.keys(queue).length;
  await setState({ lastMessage: `${n} paquetes en cola…`, buffered: n });
  if (n >= MAX_BATCH) flush();
}

let flushing = false;
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    const { queue = {} } = await chrome.storage.local.get({ queue: {} });
    const packages = Object.values(queue);
    if (!packages.length) return;
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
          headers: { 'Content-Type': 'application/json', 'X-Ingest-Token': ingestToken },
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
      await setState({ lastMessage: `Enviados ${sentNow} (${newN} nuevos, ${chgN} cambios).`, ok: true, buffered: Object.keys(q2).length });
    } catch (e) {
      await setState({ lastMessage: `Sin conexión, reintentando… (${String(e.message || e).slice(0, 50)})`, ok: false });
    }
  } finally { flushing = false; }
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
  if (msg?.type === 'schema') {
    const key = msg.which === 'summary' ? 'schemaSummary' : 'schema';
    chrome.storage.local.get({ diag: {} }).then(({ diag }) =>
      chrome.storage.local.set({ diag: { ...diag, [key]: msg.schema || '', schemaUrl: msg.url || '', at: Date.now() } }));
    return false;
  }
  if (msg?.type === 'flushNow') { flush().then(() => reply?.({ ok: true })); return true; }
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
