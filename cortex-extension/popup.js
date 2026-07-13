const DEFAULT_URL = 'https://flotadsp-backend.fly.dev/api/cortex/ingest';
const $ = (id) => document.getElementById(id);

function ago(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

async function render() {
  const st = await chrome.storage.local.get(['ingestToken', 'ingestUrl', 'state', 'sent', 'activity']);
  const { ingestToken = '', ingestUrl = DEFAULT_URL, state = {}, sent = 0, activity = [] } = st;
  $('ver').textContent = 'v' + (chrome.runtime.getManifest().version);
  if (document.activeElement !== $('token')) $('token').value = ingestToken;
  if (document.activeElement !== $('url')) $('url').value = ingestUrl || DEFAULT_URL;
  $('buffered').textContent = state.buffered || 0;
  $('sent').textContent = sent || 0;

  // Estado de conexión (dos señales: extensión inyectada + hook de red activo)
  const conn = $('conn'); const ct = $('connText');
  const injected = state.hbAt && (Date.now() - state.hbAt) < 90000;   // el bridge late
  const netHook = state.mainAt && (Date.now() - state.mainAt) < 90000; // el interceptor late
  if (netHook) { conn.className = 'conn ok'; ct.textContent = 'Conectado y capturando red ✓'; }
  else if (injected) { conn.className = 'conn ok'; ct.textContent = 'Extensión activa · esperando datos de Cortex…'; }
  else { conn.className = 'conn bad'; ct.textContent = 'No inyectada — recarga la extensión y abre Cortex'; }

  // Mensaje de estado del envío
  const s = $('status');
  s.textContent = state.lastMessage || 'Abre Cortex, entra en una ruta y sus paradas. Los datos se envían solos.';
  s.className = 'status' + (state.ok === true ? ' ok' : state.ok === false ? ' err' : '');
  if (!ingestToken) { s.textContent = 'Pega tu token de ingesta y pulsa Guardar y activar.'; s.className = 'status err'; }

  // Actividad
  const ul = $('activity');
  if (!activity.length) { ul.innerHTML = '<li class="empty">Nada aún. Recarga la pestaña de Cortex y navega por una ruta.</li>'; return; }
  ul.innerHTML = activity.map((a) =>
    `<li><span class="u" title="${a.url}">${a.url}</span><span class="c ${a.count ? 'some' : 'zero'}">${a.count} pkg · ${ago(a.at)}</span></li>`
  ).join('');
}

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    ingestToken: $('token').value.trim(),
    ingestUrl: ($('url').value.trim() || DEFAULT_URL),
  });
  const s = $('status'); s.textContent = 'Guardado ✓. Abre Cortex y navega; el envío es automático.'; s.className = 'status ok';
});

$('flush').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'flushNow' }));

$('diag').addEventListener('click', async () => {
  const { diag, activity = [] } = await chrome.storage.local.get(['diag', 'activity']);
  const payload = {
    version: chrome.runtime.getManifest().version,
    sample_keys: diag?.keys || null,
    sample_node: diag?.node || null,
    route_details_schema: diag?.schema || null,
    route_summaries_schema: diag?.schemaSummary || null,
    schema_url: diag?.schemaUrl || null,
    urls: activity.map((a) => ({ url: a.url, pkgs: a.count })),
  };
  const text = JSON.stringify(payload, null, 2);
  const s = $('status');
  try {
    await navigator.clipboard.writeText(text);
    s.textContent = diag ? 'Diagnóstico copiado ✓. Pégalo en el chat.' : 'Aún no hay muestra: navega por una ruta y reintenta.';
    s.className = 'status ' + (diag ? 'ok' : 'err');
  } catch (_) {
    s.textContent = 'No se pudo copiar. Abre la consola (F12) y busca "[FlotaDSP] muestra".';
    s.className = 'status err';
  }
});

// Al abrir el popup, fuerza reinyección en las pestañas de Cortex ya abiertas
// (por si el service worker se durmió o la pestaña se abrió antes que la extensión).
try { chrome.runtime.sendMessage({ type: 'reinject' }); } catch (_) {}

chrome.storage.onChanged.addListener(render);
render();
setInterval(render, 1500);
