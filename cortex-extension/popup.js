const DEFAULT_URL = 'https://flotadsp-backend.fly.dev/api/cortex/ingest';
const $ = (id) => document.getElementById(id);

async function render() {
  const { ingestToken = '', ingestUrl = DEFAULT_URL, state = {}, sent = 0 } =
    await chrome.storage.local.get(['ingestToken', 'ingestUrl', 'state', 'sent']);
  $('token').value = ingestToken;
  $('url').value = ingestUrl || DEFAULT_URL;
  $('buffered').textContent = state.buffered || 0;
  $('sent').textContent = sent || 0;
  const s = $('status');
  s.textContent = state.lastMessage || 'Abre Cortex y navega tus rutas. Los datos se envían solos.';
  s.className = 'status' + (state.ok === true ? ' ok' : state.ok === false ? ' err' : '');
}

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    ingestToken: $('token').value.trim(),
    ingestUrl: ($('url').value.trim() || DEFAULT_URL),
  });
  $('status').textContent = 'Guardado. Abre Cortex y navega; el envío es automático.';
  $('status').className = 'status ok';
});

$('flush').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'flushNow' }));

chrome.storage.onChanged.addListener(render);
render();
setInterval(render, 2000);
