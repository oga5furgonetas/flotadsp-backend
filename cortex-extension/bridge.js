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
    /* EL RESUMEN DE CORTEX. Faltaba en esta lista y el mensaje se tiraba aqui
       en silencio: el interceptor lo mandaba, nadie lo recogia y `cortex_resumen`
       llevaba vacia desde que se monto. Es el mismo fallo que el gotcha 1 —una
       lista blanca que descarta sin avisar— en otro sitio.
       Al anadir un `kind` nuevo hay que tocarlo AQUI y en background.js. */
    else if (d.kind === 'resumen_cortex') chrome.runtime.sendMessage({ type: 'resumenCortex', url: d.url, dia: d.dia, sa: d.sa, datos: d.datos });
  });
}
