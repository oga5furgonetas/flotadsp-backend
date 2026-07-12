/* Puente content-script (ISOLATED world): recibe los eventos del interceptor
 * (que vive en el MAIN world) y los pasa al background.
 * Guarda contra doble carga (se puede inyectar por manifest y por scripting). */
if (!window.__flotadspBridge) {
  window.__flotadspBridge = true;
  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__flotadsp !== true) return;
    if (d.kind === 'cortex') chrome.runtime.sendMessage({ type: 'cortexPackages', url: d.url, packages: d.packages });
    else if (d.kind === 'heartbeat') chrome.runtime.sendMessage({ type: 'heartbeat', url: d.url });
    else if (d.kind === 'debug') chrome.runtime.sendMessage({ type: 'debug', url: d.url, count: d.count, bytes: d.bytes });
  });
}
