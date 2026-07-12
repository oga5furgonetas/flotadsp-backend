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
function boot() { chrome.alarms.create(ALARM, { periodInMinutes: 1 }); injectAll(); }

chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
boot(); // al despertar el service worker
chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) flush(); });
// Reinyecta cuando una pestaña de Amazon termina de cargar (navegación real).
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && /amazon\.es/.test(tab.url || '')) inject(tabId);
});

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
    try {
      const r = await fetch(ingestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ingest-Token': ingestToken },
        body: JSON.stringify({ captured_at: new Date().toISOString(), packages }),
      });
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        const { sent = 0 } = await chrome.storage.local.get({ sent: 0 });
        await chrome.storage.local.set({ queue: {}, sent: sent + packages.length });
        await setState({ lastMessage: `Enviados ${packages.length} (${j.new || 0} nuevos, ${j.changed || 0} cambios).`, ok: true, buffered: 0 });
      } else {
        const body = await r.text().catch(() => '');
        await setState({ lastMessage: `Error ${r.status}: ${body.slice(0, 80) || 'revisa el token'}`, ok: false });
      }
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
    setState({ connected: true, hbUrl: msg.url, hbAt: Date.now() });
    return false;
  }
  if (msg?.type === 'debug') {
    pushActivity(msg.url, msg.count || 0);
    return false;
  }
  if (msg?.type === 'flushNow') { flush().then(() => reply?.({ ok: true })); return true; }
});
