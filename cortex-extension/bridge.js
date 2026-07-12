/* Puente content-script (ISOLATED world): recibe los paquetes del interceptor
 * (que vive en el MAIN world) y los pasa al background para enviarlos a FlotaDSP. */
window.addEventListener('message', (ev) => {
  if (ev.source !== window) return;
  const d = ev.data;
  if (!d || d.__flotadsp !== true || d.kind !== 'cortex') return;
  chrome.runtime.sendMessage({ type: 'cortexPackages', url: d.url, packages: d.packages });
});
