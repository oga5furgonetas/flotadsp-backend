/* ── RAMA DSP: LOS INFORMES DEL PORTAL, SIN COPIAR Y PEGAR ───────────────────
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ ES ESTO Y POR QUÉ ESTÁ APARTE
 *
 * `interceptor.js` captura Cortex —rutas y paquetes— y lleva veinte versiones
 * afinándose. No se toca. Esto es otra cosa y por eso es otro fichero: los
 * INFORMES del portal del DSP que hoy alguien descarga y pega a mano todos los
 * días.
 *
 *   · el **Daily Report** (de donde salen los DNR, RTS, POD y fallos de
 *     contacto). Es un .html que el portal genera y su título dice de qué nave
 *     es: «ES TDSL OGA5 Daily Report 2026-09-12».
 *   · el **plan de horas semanal** (WHC).
 *
 * El día que nadie los pega, la pantalla de Rendimiento enseña ceros en «fallos
 * de contacto» — y un cero ahí se lee como «no ha fallado nadie», que es
 * justamente lo contrario de la verdad (gotcha 33).
 *
 * CÓMO RECONOCE LO QUE VE, Y POR QUÉ ASÍ
 *
 * Por el CONTENIDO, no por la URL. Escribir a ojo la dirección de una pantalla
 * de Amazon es el fallo que costó veinte versiones con `addresses` (gotcha 64),
 * y además las URLs del portal cambian sin avisar. Las marcas que se usan aquí
 * salen de los parsers REALES del backend:
 *   · Daily Report → `ES TDSL <CENTRO>` en el título, que es lo que
 *     `_parsea_diario_html` busca para saber de qué nave es;
 *   · plan de horas → la cabecera de días («dom., ago. 02»), que es lo que mira
 *     `_whc_dias_del_plan`.
 * Si el documento no es lo que creemos, el backend contesta que no lo reconoce
 * y aquí se deja de insistir. No se inventa nada.
 *
 * DOS CAMINOS DE ENTRADA, y el segundo es el que de verdad quita trabajo:
 *   1. lo que ya está abierto: si alguien abre el informe, entra solo;
 *   2. **los informes se piden solos.** El 14-09-2026, con la v2.41 puesta,
 *      aparecieron los enlaces reales del portal y resultó que son ficheros
 *      .html colgados de una ruta fija —uno por día—. Con la sesión que ya hay
 *      abierta se piden y se mandan, sin que nadie abra ni descargue nada.
 *      Ver `pedirInformes`.
 */
if (!window.__flotadspDsp) {
  window.__flotadspDsp = true;

  /* Marcas sacadas de los parsers del backend. Si alguna cambia allí, esto deja
     de reconocer y el informe vuelve a entrar a mano — no se rompe nada, pero
     hay que saberlo: por eso el backend anota cuándo entró cada uno por última
     vez (`GET /cortex/informes-auto`). */
  const MARCA_DIARIO = /\bES\s+TDSL\s+[A-Z0-9]{3,6}\b/i;
  const MARCA_DIARIO_2 = /Daily\s*Report/i;
  const MARCA_WHC = /\b(dom|lun|mar|mi[ée]|jue|vie|s[áa]b)\.?,\s*(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.?\s+\d{1,2}/i;

  const MIN_LARGO = 400;          // menos que esto no es un informe
  const CADA_MS = 15000;          // se mira el documento cada 15 s; no pide nada
  const enviados = new Set();     // huellas de lo ya mandado

  /* Huella barata para no mandar dos veces lo mismo: largo + un trozo del
     principio y del final. Comparar medio mega entero costaría más que mandarlo. */
  const huella = (t) => `${t.length}:${t.slice(0, 120)}:${t.slice(-120)}`;

  const mandar = (tipo, texto, center) => {
    const h = `${tipo}:${huella(texto)}`;
    if (enviados.has(h)) return;
    enviados.add(h);
    if (enviados.size > 50) enviados.clear();
    try {
      chrome.runtime.sendMessage({ type: 'informePortal', tipo, texto, center }, (r) => {
        if (chrome.runtime.lastError) return;          // worker dormido: se reintenta
        if (r && r.ok === false) {
          // No se reconoció: se deja marcado para no insistir con lo mismo.
          console.log('%c[FlotaDSP] informe no reconocido: ' + (r.motivo || ''), 'color:#f59e0b');
        } else if (r && r.ok) {
          console.log('%c[FlotaDSP] ' + tipo + ' enviado ✓', 'color:#34d399;font-weight:bold');
        }
      });
    } catch (_) {}
  };

  /* La nave, si el propio documento la dice. No se adivina del selector de
     Cortex: la extensión puede estar mirando una nave y el informe ser de otra,
     y eso le colgaría los DNR a la gente equivocada. Vacío = que lo decida el
     backend leyendo el título, que es la fuente buena. */
  const centroDe = (t) => {
    const m = t.match(/\bES\s+TDSL\s+([A-Z0-9]{3,6})\b/i);
    return m ? m[1].toUpperCase() : '';
  };

  const mirar = () => {
    let html = '';
    let texto = '';
    try {
      html = document.documentElement ? document.documentElement.outerHTML : '';
      texto = document.body ? document.body.innerText : '';
    } catch (_) { return; }
    if (!html || html.length < MIN_LARGO) return;

    // El Daily Report se manda EN HTML: el backend lo prefiere así porque las
    // cinco tablas van etiquetadas y el título trae la nave y la fecha. Del
    // texto plano se pierde qué columna es cuál.
    if (MARCA_DIARIO.test(html) && MARCA_DIARIO_2.test(html)) {
      mandar('diario', html.slice(0, 8000000), centroDe(html));
      return;
    }
    // El plan de horas va en TEXTO: es lo que se pegaba a mano y lo que
    // `_whc_parsear` sabe leer.
    //
    // EL CENTRO SALE DE LA RUTA (`/es/tdsl/oga5/...`). El plan no lo dice en
    // ninguna parte, y sin centro el backend analiza pero NO GUARDA la semana:
    // la primera vez que entró solo, el 14-09-2026, se evaluó correctamente y
    // se perdió. Un dato que se calcula y no se guarda parece que funciona.
    if (texto && texto.length > MIN_LARGO && MARCA_WHC.test(texto)) {
      mandar('whc', texto.slice(0, 2000000), centroDeRuta());
    }
  };

  /* ── LOS INFORMES SE PIDEN SOLOS ─────────────────────────────────────────
     Descubierto el 14-09-2026, mirando los enlaces REALES del portal (no
     adivinando): los informes son ficheros .html colgados de una ruta con
     forma fija, uno por día y semana:

       /es/tdsl/oga5/2026/week-37/ES-TDSL-OGA5-Daily-Report_2026-09-12_Sat.html
       /es/tdsl/oga5/2026/week-37/DNR_Investigations_ES-TDSL-OGA5.html
       /es/tdsl/oga5/2026/week-37/ES-TDSL-OGA5-Week37-Contact-Compliance-report.html

     O sea que no hace falta que nadie abra ni descargue nada: basta con pedir
     esas direcciones con la sesión que ya hay abierta, igual que se hace con
     el informe de direcciones de Cortex.

     NO SE CONSTRUYEN A MANO. Se usan los enlaces que la página trae: el número
     de semana del portal no es el ISO (su semana va de domingo a sábado) y
     calcularlo por nuestra cuenta acabaría pidiendo una semana que no existe y
     recibiendo un 404 en silencio. Si están en pantalla, están bien.

     UNA VEZ POR FICHERO Y RATO. Se vuelve a mirar cada media hora —las dos o
     tres pasadas al día que pedía Dani— y el backend descarta el repetido por
     su propio id, así que reenviar no duplica nada. */
  const HORA_MS = 3600000;
  const RE_DIARIO = /Daily-Report_(\d{4}-\d{2}-\d{2})/i;
  /* Y las INVESTIGACIONES DE DNR, que son otro fichero de la misma carpeta:
     `DNR_Investigations_ES-TDSL-OGA5.html`. No lleva fecha en el nombre —es
     siempre el mismo y se sobrescribe con las que siguen abiertas—, asi que no
     se puede ordenar por nombre ni deducir: se coge tal cual aparezca. */
  const RE_DNR = /DNR_Investigations_/i;
  const esInforme = (h) => (RE_DIARIO.test(h) || RE_DNR.test(h)) && /\.html?($|\?|#)/i.test(h);
  const pedidos = new Map();      // camino -> cuándo se pidió

  const centroDeRuta = () => {
    const m = location.pathname.match(/\/es\/tdsl\/([a-z0-9]{3,6})\//i);
    return m ? m[1].toUpperCase() : '';
  };

  /* LOS ENLACES SE RECUERDAN, NO SE MIRAN SOLO AQUÍ. La primera versión pedía
     los informes únicamente si la carpeta estaba abierta en esa pestaña, y en
     la primera prueba real (14-09-2026, 17:51) Dani tenía delante
     `/performance`: los enlaces se habían descubierto a las 17:33 y no se pidió
     ni uno, porque la pestaña ya estaba en otra pantalla. Una captura que
     depende de en qué pantalla esté alguien no es automática.

     Ahora se mandan al service worker, que los guarda y los pide él por su
     cuenta cada media hora desde cualquier pestaña de Amazon — y con los
     permisos de la extensión, así que tampoco le afecta el CORS de la página. */
  const pedirInformes = () => {
    let enlaces = [];
    try {
      enlaces = [...document.querySelectorAll('a[href]')]
        .map((a) => { try { return new URL(a.getAttribute('href'), location.href).href; } catch (_) { return ''; } })
        .filter((h) => h && esInforme(h));
    } catch (_) { return; }
    if (!enlaces.length) return;
    const nuevos = [...new Set(enlaces)].filter((u) => !pedidos.has(u));
    if (!nuevos.length) return;
    for (const u of nuevos) pedidos.set(u, Date.now());
    try {
      chrome.runtime.sendMessage({ type: 'informesVistos', urls: nuevos.slice(0, 20),
                                   center: centroDeRuta() });
    } catch (_) {}
  };

  /* ── APUNTADOR DE CAMINOS ────────────────────────────────────────────────
     Para poder pedir el informe nosotros mismos 2 o 3 veces al día hace falta
     saber QUÉ dirección lo devuelve. No se adivina: se apunta la de los enlaces
     de descarga que haya en la página, sin abrirlos y sin sus parámetros (ahí
     van ids de nave y de día). Con que alguien entre una vez en esa pantalla,
     el camino aparece en el diagnóstico y ya se puede automatizar — es
     exactamente como se resolvió el informe de direcciones. */
  const caminosVistos = new Set();
  const apuntarCaminos = () => {
    try {
      const enlaces = document.querySelectorAll('a[href], button[data-url]');
      for (const a of enlaces) {
        const href = a.getAttribute('href') || a.getAttribute('data-url') || '';
        const txt = (a.textContent || '').trim().slice(0, 60);
        if (!/report|informe|download|descarg|export|hours|horas|whc|dnr/i.test(href + ' ' + txt)) continue;
        let p = href;
        try { p = new URL(href, location.origin).pathname; } catch (_) {}
        if (!p || p.length < 4 || caminosVistos.has(p)) continue;
        caminosVistos.add(p);
        if (caminosVistos.size > 60) caminosVistos.clear();
        chrome.runtime.sendMessage({ type: 'caminoPortal', camino: p.slice(0, 180), texto: txt });
      }
    } catch (_) {}
  };

  const vuelta = () => { mirar(); apuntarCaminos(); pedirInformes(); };
  // Al cargar y luego cada 15 s: el portal es una SPA y la pantalla del informe
  // aparece sin recargar la página, así que mirar una sola vez no vale.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', vuelta, { once: true });
  } else { vuelta(); }
  setInterval(vuelta, CADA_MS);
}
