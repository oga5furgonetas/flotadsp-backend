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
    /* `which` viaja tambien en los debug: sin el, un aviso con nombre llegaba
       al fondo sin identidad y el backend no podia guardarlo (se perdio el de
       cobertura de destinos, 05-09-2026). No basta con dar de alta el `kind`:
       cada CAMPO que el interceptor manda hay que reenviarlo aqui. */
    else if (d.kind === 'debug') chrome.runtime.sendMessage({ type: 'debug', which: d.which, url: d.url, count: d.count, bytes: d.bytes });
    else if (d.kind === 'sample') chrome.runtime.sendMessage({ type: 'sample', keys: d.keys, node: d.node });
    else if (d.kind === 'schema') chrome.runtime.sendMessage({ type: 'schema', which: d.which, url: d.url, schema: d.schema });
    /* La sonda del portal: que peticion devuelve los enlaces firmados. Solo
       viaja la FORMA -ruta, nombres de parametros y esqueleto-, nunca una
       firma. */
    else if (d.kind === 'firma_vista') chrome.runtime.sendMessage({ type: 'firmaVista', url: d.url, campos: d.campos, esqueleto: d.esqueleto });
    /* La llamada que devuelve los enlaces FIRMADOS, entera. Se queda en el
       navegador: el service worker la guarda para repetirla. Al servidor solo
       va la forma (`firma_vista`), nunca esto. */
    else if (d.kind === 'llamada_informes') chrome.runtime.sendMessage({ type: 'llamadaInformes', url: d.url });
    /* Que estados del informe traen paquetes y cuales vienen vacios. Es lo
       unico que dice si «Apoyo en ruta» va a tener direcciones o no. */
    /* LAS CUENTAS DE ONBOARDING. Solo nombre, estados y areas: ni correo, ni
       telefono, ni documento. El filtro por nave lo hace el service worker,
       que es quien sabe cuales son las naves de la empresa. */
    /* CON RED. Si `sendMessage` falla —mensaje demasiado grande, worker
       caido—, la excepcion sale del listener y se pierde SIN RASTRO: el
       16-09-2026 la lista de asociados no llegaba y desde fuera se veia igual
       que si la pagina no la hubiera pedido. Ahora se dice. */
    else if (d.kind === 'asociados') {
      try {
        chrome.runtime.sendMessage({ type: 'asociadosCuentas', personas: d.personas });
      } catch (e) {
        chrome.runtime.sendMessage({ type: 'debug', which: 'asociados-puente',
                                     url: `no se pudo reenviar: ${String(e).slice(0, 80)}`,
                                     count: (d.personas || []).length, bytes: 0 });
      }
    }
    /* El mapa area -> nave. Se guarda en el service worker para que el orden
       en que lleguen las dos llamadas deje de importar. */
    else if (d.kind === 'asociados_areas') chrome.runtime.sendMessage({ type: 'asociadosAreas', mapa: d.mapa });
    else if (d.kind === 'estados_informe') chrome.runtime.sendMessage({ type: 'estadosInforme', estados: d.estados, descartados: d.descartados });
    /* EL RESUMEN DE CORTEX. Faltaba en esta lista y el mensaje se tiraba aqui
       en silencio: el interceptor lo mandaba, nadie lo recogia y `cortex_resumen`
       llevaba vacia desde que se monto. Es el mismo fallo que el gotcha 1 —una
       lista blanca que descarta sin avisar— en otro sitio.
       Al anadir un `kind` nuevo hay que tocarlo AQUI y en background.js. */
    else if (d.kind === 'posiciones_vivas') chrome.runtime.sendMessage({ type: 'posicionesVivas', url: d.url, dia: d.dia, sa: d.sa, datos: d.datos });
    else if (d.kind === 'resumen_cortex') chrome.runtime.sendMessage({ type: 'resumenCortex', url: d.url, dia: d.dia, sa: d.sa, datos: d.datos });
    /* LO QUE APRENDE EL INFORME DE DIRECCIONES, GUARDADO ENTRE SESIONES.
       Único camino de VUELTA del puente: el interceptor vive en MAIN y no puede
       tocar `chrome.storage`, así que pregunta y se le contesta por la misma
       ventana. `__flotadspIn` (no `__flotadsp`) para que no se confunda con los
       mensajes de ida y el bucle de arriba no se lo coma. */
    else if (d.kind === 'informe_aprendido') {
      chrome.runtime.sendMessage({ type: 'informeAprendido', estados: d.estados, descartados: d.descartados, plantilla: d.plantilla, sa: d.sa });
    /* Los correos de nuestra gente, de vuelta hacia la pagina. Mismo camino
       que `informe_pedir`: `__flotadspIn` para no confundirlo con la ida. */
    } else if (d.kind === 'seguidos_pedir') {
      try {
        chrome.runtime.sendMessage({ type: 'seguidosPedir' }, (r) => {
          if (chrome.runtime.lastError || !r) return;   // worker dormido: se reintenta
          window.postMessage({ __flotadspIn: true, kind: 'seguidos',
                               correos: r.correos || [], nombres: r.nombres || [] }, '*');
        });
      } catch (_) {}
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
