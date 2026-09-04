/* Puente content-script (ISOLATED world): SIEMPRE se ejecuta (no le afecta la
 * CSP de la página). Manda su propio latido para confirmar que la extensión
 * está inyectada, y relaya los eventos del interceptor (MAIN world). */
if (!window.__flotadspBridge) {
  window.__flotadspBridge = true;

  const hb = (src, v) => { try { chrome.runtime.sendMessage({ type: 'heartbeat', src, v, url: location.href }); } catch (_) {} };
  hb('bridge');                 // la extensión está inyectada en esta pestaña
  setInterval(() => hb('bridge'), 20000);

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__flotadsp !== true) return;
    if (d.kind === 'cortex') chrome.runtime.sendMessage({ type: 'cortexPackages', url: d.url, packages: d.packages });
    else if (d.kind === 'heartbeat') hb('main', d.v); // el hook de red (MAIN) está vivo, y con qué versión
    else if (d.kind === 'debug') chrome.runtime.sendMessage({ type: 'debug', url: d.url, count: d.count, bytes: d.bytes });
    else if (d.kind === 'sample') chrome.runtime.sendMessage({ type: 'sample', keys: d.keys, node: d.node });
    else if (d.kind === 'schema') chrome.runtime.sendMessage({ type: 'schema', which: d.which, url: d.url, schema: d.schema });
    /* Que estados del informe traen paquetes y cuales vienen vacios. Es lo
       unico que dice si «Apoyo en ruta» va a tener direcciones o no. */
    else if (d.kind === 'estados_informe') chrome.runtime.sendMessage({ type: 'estadosInforme', estados: d.estados, descartados: d.descartados });
    /* EL RESUMEN DE CORTEX. Faltaba en esta lista y el mensaje se tiraba aqui
       en silencio: el interceptor lo mandaba, nadie lo recogia y `cortex_resumen`
       llevaba vacia desde que se monto. Es el mismo fallo que el gotcha 1 —una
       lista blanca que descarta sin avisar— en otro sitio.
       Al anadir un `kind` nuevo hay que tocarlo AQUI y en background.js. */
    else if (d.kind === 'resumen_cortex') chrome.runtime.sendMessage({ type: 'resumenCortex', url: d.url, dia: d.dia, sa: d.sa, datos: d.datos });
    /* LO QUE APRENDE EL INFORME DE DIRECCIONES, GUARDADO ENTRE SESIONES.
       Único camino de VUELTA del puente: el interceptor vive en MAIN y no puede
       tocar `chrome.storage`, así que pregunta y se le contesta por la misma
       ventana. `__flotadspIn` (no `__flotadsp`) para que no se confunda con los
       mensajes de ida y el bucle de arriba no se lo coma. */
    else if (d.kind === 'informe_aprendido') {
      chrome.runtime.sendMessage({ type: 'informeAprendido', estados: d.estados, descartados: d.descartados, plantilla: d.plantilla, sa: d.sa });
    } else if (d.kind === 'informe_pedir') {
      try {
        chrome.runtime.sendMessage({ type: 'informeGuardado' }, (r) => {
          if (chrome.runtime.lastError || !r) return;   // service worker dormido: se reintenta
          window.postMessage({ __flotadspIn: true, kind: 'informe_guardado',
                               estados: r.estados || [], descartados: r.descartados || [],
                               plantillas: r.plantillas || {} }, '*');
        });
      } catch (_) {}
    }
  });
}
