/* FlotaDSP · Cortex Bridge — background (service worker).
 * Agrupa las observaciones y las envía al Package Intelligence Center cada ~20 s
 * (o al llegar a 200 paquetes). Guarda un pequeño estado para el popup. */
const DEFAULT_URL = 'https://flotadsp-backend.fly.dev/api/cortex/ingest';
const FLUSH_MS = 20000;
const MAX_BATCH = 200;

let buffer = new Map(); // tba -> obs
let timer = null;

async function cfg() {
  const { ingestToken = '', ingestUrl = DEFAULT_URL } = await chrome.storage.local.get(['ingestToken', 'ingestUrl']);
  return { ingestToken, ingestUrl: ingestUrl || DEFAULT_URL };
}
async function setState(patch) {
  const { state = {} } = await chrome.storage.local.get({ state: {} });
  await chrome.storage.local.set({ state: { ...state, ...patch, at: new Date().toISOString() } });
}

async function flush() {
  timer = null;
  if (!buffer.size) return;
  const { ingestToken, ingestUrl } = await cfg();
  if (!ingestToken) { await setState({ lastMessage: 'Falta el token: pégalo en el popup.' }); return; }
  const packages = [...buffer.values()];
  buffer = new Map();
  try {
    const r = await fetch(ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Ingest-Token': ingestToken },
      body: JSON.stringify({ captured_at: new Date().toISOString(), packages }),
    });
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      const { sent = 0 } = await chrome.storage.local.get({ sent: 0 });
      await chrome.storage.local.set({ sent: sent + packages.length });
      await setState({ lastMessage: `Enviados ${packages.length} paquetes (${j.new || 0} nuevos, ${j.changed || 0} cambios).`, ok: true });
    } else {
      await setState({ lastMessage: `Error ${r.status} al enviar. Revisa el token.`, ok: false });
    }
  } catch (e) {
    // Reintentar en el siguiente ciclo
    for (const o of packages) if (!buffer.has(o.tba)) buffer.set(o.tba, o);
    await setState({ lastMessage: `Sin conexión, reintentando… (${String(e.message || e).slice(0, 60)})`, ok: false });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'cortexPackages' && Array.isArray(msg.packages)) {
    for (const o of msg.packages) if (o?.tba) buffer.set(o.tba, o);
    setState({ lastMessage: `${buffer.size} paquetes en cola…`, buffered: buffer.size });
    if (buffer.size >= MAX_BATCH) flush();
    else if (!timer) timer = setTimeout(flush, FLUSH_MS);
    reply?.({ ok: true });
    return true;
  }
  if (msg?.type === 'flushNow') { flush().then(() => reply?.({ ok: true })); return true; }
});
