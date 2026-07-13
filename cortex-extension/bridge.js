/* Puente content-script (ISOLATED world): SIEMPRE se ejecuta (no le afecta la
 * CSP de la página). Manda su propio latido para confirmar que la extensión
 * está inyectada, y relaya los eventos del interceptor (MAIN world). */
if (!window.__flotadspBridge) {
  window.__flotadspBridge = true;

  const hb = (src) => { try { chrome.runtime.sendMessage({ type: 'heartbeat', src, url: location.href }); } catch (_) {} };
  hb('bridge');                 // la extensión está inyectada en esta pestaña
  setInterval(() => hb('bridge'), 20000);

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__flotadsp !== true) return;
    if (d.kind === 'cortex') chrome.runtime.sendMessage({ type: 'cortexPackages', url: d.url, packages: d.packages });
    else if (d.kind === 'heartbeat') hb('main'); // el hook de red (MAIN) está vivo
    else if (d.kind === 'debug') chrome.runtime.sendMessage({ type: 'debug', url: d.url, count: d.count, bytes: d.bytes });
    else if (d.kind === 'sample') chrome.runtime.sendMessage({ type: 'sample', keys: d.keys, node: d.node });
    else if (d.kind === 'schema') chrome.runtime.sendMessage({ type: 'schema', which: d.which, url: d.url, schema: d.schema });
  });
}
