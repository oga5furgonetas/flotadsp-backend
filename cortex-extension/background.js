/* FlotaDSP · Cortex Bridge — background (service worker).
 * Robusto ante la suspensión del service worker de MV3: la cola se guarda en
 * chrome.storage.local (no en memoria) y el envío lo dispara chrome.alarms
 * (despierta el worker aunque esté dormido). Envía cada minuto o al llegar a 200.
 */
const DEFAULT_URL = 'https://flotadsp-backend.fly.dev/api/cortex/ingest';
const MAX_BATCH = 200;
const ALARM = 'flotadsp-flush';

/* QUE VERSION LLEVA ESTE EQUIPO. Un uuid que se crea la primera vez y vive en
   el almacen local del navegador. No identifica a nadie —ni nombre, ni usuario,
   ni maquina—: solo distingue una instalacion de otra, que es lo que hacia
   falta para poder probar una version nueva en UN solo PC sin dejar de ver la
   de los demas. Antes el backend guardaba una unica version por empresa y el
   ultimo equipo que hablara pisaba a los otros. */
let _vInterceptor = '';   // la version que corre dentro de la pagina de Cortex
let _idInst = null;
async function idInstalacion() {
  if (_idInst !== null) return _idInst;
  try {
    const { instalacion } = await chrome.storage.local.get({ instalacion: '' });
    if (instalacion) { _idInst = instalacion; return _idInst; }
    const nuevo = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).slice(0, 36);
    await chrome.storage.local.set({ instalacion: nuevo });
    _idInst = nuevo;
  } catch (_) { _idInst = ''; }
  return _idInst;
}

const AMZ = ['https://logistics.amazon.es/*', 'https://*.amazon.es/*'];

// Inyecta el interceptor (MAIN) + puente (ISOLATED) en una pestaña. Los scripts
// se auto-protegen contra doble carga, así que es seguro llamarlo varias veces.
async function inject(tabId) {
  try {
    /* LOS CUATRO, NO DOS. `dsp.js` y `portal.js` se declaran en el manifiesto,
       o sea que solo entran al CARGAR la página — y al reinstalar la extensión
       las pestañas ya abiertas no se recargan. Resultado: se instalaba una
       versión nueva, se abría el portal que ya estaba abierto, y allí seguía
       corriendo el código viejo (o ninguno). Eso costó tres rondas enteras
       —14-09-2026— buscando el fallo en el sitio equivocado.
       Los cuatro se auto-protegen contra la doble carga, así que reinyectar es
       seguro y se puede llamar tantas veces como haga falta. */
    await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['interceptor.js'] });
    await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['portal.js'] });
    await chrome.scripting.executeScript({ target: { tabId }, world: 'ISOLATED', files: ['bridge.js'] });
    await chrome.scripting.executeScript({ target: { tabId }, world: 'ISOLATED', files: ['dsp.js'] });
  } catch (_) { /* pestaña sin permiso o descargándose */ }
}
// Inyecta en TODAS las pestañas de Amazon ya abiertas (sin depender de recargar).
async function injectAll() {
  try {
    const tabs = await chrome.tabs.query({ url: AMZ });
    for (const t of tabs) if (t.id) inject(t.id);
  } catch (_) {}
}
function boot() {
  // Cada API va en su propio try: si una falla (p.ej. sin permiso), no tumba el resto.
  try { chrome.alarms?.create(ALARM, { periodInMinutes: 1 }); } catch (_) {}
  try { injectAll(); } catch (_) {}
}

async function cfg() {
  const { ingestToken = '', ingestUrl = DEFAULT_URL } = await chrome.storage.local.get(['ingestToken', 'ingestUrl']);
  return { ingestToken, ingestUrl: ingestUrl || DEFAULT_URL };
}
async function setState(patch) {
  const { state = {} } = await chrome.storage.local.get({ state: {} });
  await chrome.storage.local.set({ state: { ...state, ...patch, at: new Date().toISOString() } });
}

/* ── COMPUERTA POR ESTACIÓN ───────────────────────────────────────────────────
   Con dos pestañas abiertas de estaciones distintas —que es lo normal— la cola
   mezclaba paquetes de OGA5 y DGA1 y se enviaba todo junto. Luego el panel los
   reparte por `center`, pero si un paquete llegó sin estación reconocida acaba
   contando en el centro que no es, y un DCR con paquetes de otra nave es un
   número falso que nadie detecta.

   Ahora: se captura TODO (nunca se pierde nada), pero sólo se envía lo de las
   estaciones que tú marques. Y lo que llega sin estación no se envía jamás por
   defecto: se aparta y se enseña. Preferimos no mandar a mandar mal. */
function estacionDe(o) {
  return (o && (o.center || o.station_code || o.station || o.service_area_id)) || null;
}

/* Recuento por estación de lo que hay en cola, para que el popup pueda elegir. */
async function recuento(queue) {
  const porEstacion = {};
  let sinEstacion = 0;
  for (const o of Object.values(queue || {})) {
    const e = estacionDe(o);
    if (!e) { sinEstacion += 1; continue; }
    porEstacion[e] = (porEstacion[e] || 0) + 1;
  }
  await chrome.storage.local.set({ porEstacion, sinEstacion });
  return { porEstacion, sinEstacion };
}

/* ── POR QUE HAY UN BUFFER EN MEMORIA ANTES DE LA COLA ────────────────────────
   Esto era, con diferencia, lo que ponia lento el ordenador de la oficina.
   Cada respuesta capturada llamaba a `enqueue`, y `enqueue` leia la cola
   ENTERA de `chrome.storage.local`, la fundia y la volvia a escribir ENTERA —
   mas `recuento`, que la recorre otra vez y escribe, mas tres lecturas sueltas
   y el `setState`—: seis idas y venidas al almacen por respuesta, dos de ellas
   serializando toda la cola a disco.

   Y el barrido vuelve a capturar TODAS las rutas cada minuto: unas cincuenta
   respuestas seguidas, o sea unas cien serializaciones por minuto de una
   estructura que puede tener miles de paquetes. Ahi se iba la RAM y la CPU, no
   en leer la API.

   Ahora se acumula en memoria y se vuelca UNA vez —al llegar al lote o al
   segundo de calma—, asi que el barrido entero hace uno o dos volcados en vez
   de cien. La cola sigue viviendo en el almacen, que es lo que la protege de
   que MV3 duerma al service worker; lo que se pierde si el worker muere en ese
   segundo es como mucho un segundo de capturas, y el barrido las vuelve a
   traer al minuto siguiente. Ademas se vuelca al suspenderse. */
let _pend = new Map();      // tba -> paquete, aun sin escribir
let _temporizador = null;

async function enqueue(packages) {
  for (const o of packages) if (o && o.tba) _pend.set(o.tba, o);
  if (_pend.size >= MAX_BATCH) return volcar();
  if (!_temporizador) _temporizador = setTimeout(() => { _temporizador = null; volcar(); }, 1000);
}

async function volcar() {
  if (_temporizador) { clearTimeout(_temporizador); _temporizador = null; }
  if (!_pend.size) return;
  const lote = _pend;
  _pend = new Map();        // lo nuevo que llegue mientras se escribe no se pierde
  const { queue = {} } = await chrome.storage.local.get({ queue: {} });
  for (const [tba, o] of lote) queue[tba] = o;
  await chrome.storage.local.set({ queue });
  const n = Object.keys(queue).length;
  const { porEstacion, sinEstacion } = await recuento(queue);
  let { enviarEstaciones = [] } = await chrome.storage.local.get({ enviarEstaciones: [] });
  const nombres = Object.keys(porEstacion);

  /* ── PRIMERA VEZ Y UNA SOLA ESTACIÓN: se elige sola ───────────────────────
     La compuerta existe para no mezclar dos naves. Con UNA sola estación en
     cola no hay dos naves que mezclar, así que ahí no protege de nada y lo
     único que hace es dejar la extensión capturando SIN ENVIAR, en silencio,
     hasta que alguien abre el popup y marca la casilla.

     Pasó de verdad, y por eso está esto aquí: tras reinstalar, Chrome vacía el
     almacenamiento y con él la elección de estaciones; 2.579 paquetes se
     quedaron 20 minutos en cola con "0 enviados" y sin ninguna señal evidente.

     Sólo se auto-elige si el usuario NO ha elegido nunca. Si alguien desmarca a
     propósito, `eleccionHecha` queda puesto y no se le vuelve a marcar solo. */
  const { eleccionHecha = false } = await chrome.storage.local.get({ eleccionHecha: false });
  if (!enviarEstaciones.length && !eleccionHecha && nombres.length === 1) {
    enviarEstaciones = [nombres[0]];
    await chrome.storage.local.set({ enviarEstaciones });
  }
  const msg = nombres.length === 0
    ? `${n} paquetes en cola, sin estación reconocida.`
    : enviarEstaciones.length === 0
      ? `${n} en cola · elige qué estaciones enviar (${nombres.join(', ')}).`
      : `${n} en cola · enviando sólo ${enviarEstaciones.join(', ')}.`;
  await setState({ lastMessage: msg, buffered: n, sinEstacion });
  /* Sólo se autoenvía si ya hay estaciones elegidas: si no, esperar es lo
     correcto — el usuario todavía no ha dicho de qué nave son estos datos. */
  if (n >= MAX_BATCH && enviarEstaciones.length) flush();
}

let flushing = false;
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    // Lo que este en memoria entra en este envio: si no, un paquete capturado
    // en el ultimo segundo esperaria al ciclo siguiente sin motivo.
    await volcar();
    const { queue = {} } = await chrome.storage.local.get({ queue: {} });
    const todos = Object.values(queue);
    if (!todos.length) return;

    /* La compuerta: sólo sale lo de las estaciones elegidas. Sin elección no se
       envía nada — es lo que evita mezclar dos naves teniendo dos pestañas. */
    const { enviarEstaciones = [] } = await chrome.storage.local.get({ enviarEstaciones: [] });
    const { porEstacion, sinEstacion } = await recuento(queue);
    if (!enviarEstaciones.length) {
      const nombres = Object.keys(porEstacion);
      await setState({
        ok: false,
        lastMessage: nombres.length
          ? `Nada enviado: elige estación (${nombres.map((n) => `${n} ${porEstacion[n]}`).join(', ')}).`
          : 'Nada enviado: ningún paquete trae estación reconocida.',
      });
      return;
    }
    const packages = todos.filter((o) => enviarEstaciones.includes(estacionDe(o)));
    if (!packages.length) {
      await setState({ ok: false, lastMessage: `En cola no hay nada de ${enviarEstaciones.join(', ')}.` });
      return;
    }

    const { ingestToken, ingestUrl } = await cfg();
    if (!ingestToken) { await setState({ lastMessage: 'Falta el token: pégalo y pulsa Guardar.', ok: false }); return; }
    // Envío por lotes de 500: con 40 rutas hay miles de paquetes y un solo POST
    // gigante fallaría o superaría los límites del backend.
    const CHUNK = 500;
    let sentNow = 0, newN = 0, chgN = 0;
    try {
      for (let i = 0; i < packages.length; i += CHUNK) {
        const part = packages.slice(i, i + CHUNK);
        const r = await fetch(ingestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json', 'X-Ingest-Token': ingestToken,
            'X-Ext-Version': chrome.runtime.getManifest().version,
            'X-Ext-Install': await idInstalacion(),
            'X-Ext-Interceptor': _vInterceptor || '',
          },
          body: JSON.stringify({ captured_at: new Date().toISOString(), packages: part }),
        });
        if (!r.ok) {
          // La cola no se ha tocado: todo se reintentará en el próximo ciclo.
          const body = await r.text().catch(() => '');
          await setState({ lastMessage: `Error ${r.status}: ${body.slice(0, 80) || 'revisa el token'}`, ok: false });
          return;
        }
        const j = await r.json().catch(() => ({}));
        newN += j.new || 0; chgN += j.changed || 0; sentNow += part.length;
      }
      // Borra de la cola SOLO lo enviado (lo que llegó durante el envío se queda).
      const { queue: q2 = {} } = await chrome.storage.local.get({ queue: {} });
      for (const o of packages) delete q2[o.tba];
      const { sent = 0 } = await chrome.storage.local.get({ sent: 0 });
      await chrome.storage.local.set({ queue: q2, sent: sent + sentNow });
      await recuento(q2);
      const resto = Object.keys(q2).length;
      await setState({
        ok: true,
        buffered: resto,
        sinEstacion,
        lastMessage: `Enviados ${sentNow} de ${enviarEstaciones.join(', ')} (${newN} nuevos, ${chgN} cambios).`
          + (resto ? ` Quedan ${resto} de otras estaciones sin enviar.` : ''),
      });
    } catch (e) {
      await setState({ lastMessage: `Sin conexión, reintentando… (${String(e.message || e).slice(0, 50)})`, ok: false });
    }
  } finally { flushing = false; }
}

/* Diagnóstico al servidor: estructura, nunca paquetes.
   Va por libre y de forma silenciosa — si falla no se reintenta ni se avisa: es
   una foto del esquema, no un dato operativo, y no puede estorbar al envío de
   paquetes ni ensuciar el estado que ve el usuario en el popup. */
/* ── UN INFORME DEL PORTAL AL BACKEND ────────────────────────────────────────
   Puerta propia: `/cortex/ingest-informe`, no la cola de paquetes. Un Daily
   Report es un documento entero que el backend ya sabe leer —el mismo lector
   que usa el pegado a mano—, no observaciones que se acumulen.

   Y el resultado SE DEVUELVE a quien lo mandó. Si el documento no se reconoce,
   `dsp.js` lo marca y deja de insistir con lo mismo; si se tragara el error, la
   pestaña reintentaria el mismo informe cada quince segundos para siempre. */
async function mandarInforme(tipo, texto, center) {
  try {
    const { ingestToken, ingestUrl } = await cfg();
    if (!ingestToken) { await pushActivity(`informe ${tipo}: sin token`, 0); return { ok: false, motivo: 'sin token' }; }
    // La URL de informes sale de la de ingesta, para no tener dos ajustes que
    // puedan quedarse desparejados.
    const url = String(ingestUrl).replace(/\/ingest$/, '/ingest-informe');
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Ingest-Token': ingestToken },
      body: JSON.stringify({ tipo, texto, center: center || '' }),
    });
    const j = await r.json().catch(() => null);
    await pushActivity(`informe ${tipo}: ${r.ok && j?.ok ? 'guardado' : (j?.motivo || 'HTTP ' + r.status)}`,
                       r.ok && j?.ok ? 1 : 0);
    return j || { ok: false, motivo: 'HTTP ' + r.status };
  } catch (e) {
    await pushActivity(`informe ${tipo}: ${String(e).slice(0, 60)}`, 0);
    return { ok: false, motivo: String(e).slice(0, 120) };
  }
}

/* ── LOS INFORMES DEL PORTAL, PEDIDOS POR EL SERVICE WORKER ──────────────────
   Los enlaces los descubre `dsp.js` cuando alguien pasa por la carpeta, PERO
   quien los pide es esto, por dos razones que se aprendieron probándolo:

   · UNA CAPTURA QUE DEPENDE DE QUÉ PANTALLA ESTÉ ABIERTA NO ES AUTOMÁTICA. En
     la primera prueba real (14-09-2026) los enlaces se descubrieron a las
     17:33 y a las 17:51 la pestaña estaba en otra pantalla: no se pidió ni
     uno. Guardándolos, se piden desde cualquier pestaña de Amazon.
   · EL SERVICE WORKER NO TIENE EL CORS DE LA PÁGINA: usa los permisos de la
     extensión (`host_permissions`) y manda las cookies de la sesión igual.

   Cada media hora y tres como mucho: la semana trae siete informes y bajarlos
   todos de golpe es una ráfaga que no hace falta. El backend descarta el
   repetido por su propio id, así que volver a mandarlo no duplica nada. */
const INFORME_CADA_MS = 30 * 60 * 1000;
const INFORME_MAX_GUARDADOS = 40;

async function recordarInformes(urls, center) {
  const { informes = {} } = await chrome.storage.local.get({ informes: {} });
  let nuevos = 0;
  for (const u of urls || []) {
    if (typeof u !== 'string' || !/^https:\/\//i.test(u)) continue;
    if (!informes[u]) { informes[u] = { visto: Date.now(), pedido: 0, center: center || '' }; nuevos++; }
  }
  // Los más viejos se caen: son ficheros por día y semana, no crecen sin fin
  // pero tampoco hay que guardar los de hace dos meses.
  const claves = Object.keys(informes);
  if (claves.length > INFORME_MAX_GUARDADOS) {
    claves.sort((a, b) => (informes[a].visto || 0) - (informes[b].visto || 0));
    for (const k of claves.slice(0, claves.length - INFORME_MAX_GUARDADOS)) delete informes[k];
  }
  if (nuevos) await chrome.storage.local.set({ informes });
  return nuevos;
}

/* ── DEDUCIR EL INFORME DE UN DÍA A PARTIR DE UNO CONOCIDO ───────────────────
   Hasta aquí, para bajar el informe de hoy había que pasar otra vez por la
   carpeta. Eso no es automático: es acordarse de hacerlo.

   Pero la forma del nombre es completamente regular, y no lo digo de memoria —
   está medido con los enlaces reales de DOS naves y DOS semanas (14-09-2026):

     /es/tdsl/oga5/2026/week-37/ES-TDSL-OGA5-Daily-Report_2026-09-08_Tue.html
     /es/tdsl/dga1/2026/week-37/ES-TDSL-DGA1-Daily-Report_2026-09-11_Fri.html
     /es/tdsl/oga5/2026/week-38/ES-TDSL-OGA5-Daily-Report_2026-09-13_Sun.html

   La semana 37 va del domingo 06 al sábado 12, y el 13 (domingo) ya es la 38:
   o sea que la semana del portal EMPIEZA EN DOMINGO, igual que la de los
   reportes diarios. Con un enlace conocido como ancla —su fecha y su número de
   semana— se calcula el de cualquier otro día contando semanas desde ahí.

   NO ES ADIVINAR: es extrapolar de lo observado, y encima se comprueba solo. Si
   la dirección deducida no existe, el portal contesta 404, se apunta y ya está
   — no se inventa ningún dato, solo se pierde una petición. */
const DIA_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function deducirInforme(urlConocida, fechaISO) {
  const m = String(urlConocida).match(
    /^(https:\/\/[^/]+)(\/[a-z]{2}\/tdsl\/[a-z0-9]+\/)(\d{4})\/week-(\d{1,2})\/(.*Daily-Report_)(\d{4}-\d{2}-\d{2})(_[A-Za-z]{3}\.html?)$/i);
  if (!m) return null;
  const [, origen, base, , semana, prefijo, fechaBase, sufijo] = m;
  const d0 = new Date(fechaBase + 'T12:00:00Z');       // mediodía: sin sustos de huso
  const d1 = new Date(fechaISO + 'T12:00:00Z');
  if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) return null;
  // Domingo de cada una de las dos semanas, y cuántas semanas hay entre ellas.
  const domingoDe = (d) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x; };
  const semanas = Math.round((domingoDe(d1) - domingoDe(d0)) / (7 * 86400000));
  const nSemana = Number(semana) + semanas;
  if (nSemana < 1 || nSemana > 53) return null;
  const anio = d1.getUTCFullYear();
  const dia = DIA_EN[d1.getUTCDay()];
  return `${origen}${base}${anio}/week-${nSemana}/${prefijo}${fechaISO}${sufijo.slice(0, 1)}${dia}${sufijo.slice(4)}`;
}

/* Los días que interesan: hoy y los tres anteriores. El reporte de un día no
   está completo hasta el día siguiente —la columna DSC se rellena tarde— así
   que volver a pedir los de atrás es lo que hace que acabe cuadrando. */
function diasAPedir() {
  /* LA FECHA SE COMPONE A MANO, no con `toISOString`. `new Date()` es hora
     LOCAL y su ISO es UTC: en España, entre medianoche y las dos de la mañana,
     `toISOString().slice(0,10)` devuelve el día ANTERIOR (gotcha 11). Aquí eso
     seria pedir el informe de un día creyendo que es el de otro — y como el
     nombre del fichero lleva la fecha dentro, saldría un 404 o, peor, el
     informe que no es. Lo cazó `check-patrones`. */
  const clave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const out = [];
  for (let k = 0; k <= 3; k++) out.push(clave(new Date(Date.now() - k * 86400000)));
  return out;
}

async function deducirYGuardar() {
  const { informes = {} } = await chrome.storage.local.get({ informes: {} });
  /* SOLO SE DEDUCE LO QUE NO VA FIRMADO, Y HOY NO VA NINGUNO.
     Descubierto el 14-09-2026: los informes no los sirve el portal, los sirve
     un bucket de S3
     (`flex-peer-performance-reports-prod-euamazon.s3.eu-west-1.amazonaws.com`)
     con una URL FIRMADA — el enlace lleva una firma al final y caduca. Abrirlo
     sin ella devuelve `AccessDenied`.
     Eso tumba la idea de deducir la dirección de mañana: una firma no se puede
     inventar. Lo que hay que hacer es coger el enlace FRESCO cada vez y
     pedirlo en el momento, no guardarlo para dentro de media hora.
     La deducción se queda para el día que alguno venga sin firmar. */
  const conocidas = Object.keys(informes)
    .filter((u) => /Daily-Report_/i.test(u) && !/[?&](X-Amz-|Signature|Expires)/i.test(u));
  if (!conocidas.length) return 0;
  // Una ancla por NAVE: con dos naves hay que deducir las dos.
  const porNave = {};
  for (const u of conocidas) {
    const m = u.match(/\/tdsl\/([a-z0-9]+)\//i);
    const nave = m ? m[1].toLowerCase() : '?';
    if (!porNave[nave] || u > porNave[nave]) porNave[nave] = u;   // la más reciente
  }
  const nuevas = [];
  for (const [nave, ancla] of Object.entries(porNave)) {
    for (const dia of diasAPedir()) {
      const u = deducirInforme(ancla, dia);
      if (u && !informes[u]) nuevas.push([u, nave.toUpperCase()]);
    }
  }
  if (!nuevas.length) return 0;
  for (const [u, nave] of nuevas) informes[u] = { visto: Date.now(), pedido: 0, center: nave, deducida: true };
  await chrome.storage.local.set({ informes });
  return nuevas.length;
}

async function bajarInformesPendientes() {
  await deducirYGuardar();
  const { informes = {} } = await chrome.storage.local.get({ informes: {} });
  const ahora = Date.now();
  // Los más recientes primero: el nombre lleva la fecha, así que ordenar por
  // nombre ordena por día sin tener que parsearla.
  /* UNA URL FIRMADA CADUCA, ASÍ QUE SE PIDE YA O NO SE PIDE.
     Guardarla para dentro de media hora es guardar una llave que para entonces
     ya no abre: se intenta una sola vez, en cuanto llega, y si falla se espera
     a que alguien vuelva a pasar por la pantalla y la firme de nuevo. Las que
     no van firmadas —si algún día las hay— siguen reintentándose cada rato. */
  const firmada = (u) => /[?&](X-Amz-|Signature|Expires)/i.test(u);
  const pendientes = Object.keys(informes)
    .filter((u) => (firmada(u) ? !informes[u].pedido
                               : ahora - (informes[u].pedido || 0) > INFORME_CADA_MS))
    .sort().reverse().slice(0, 4);
  /* ── SE CUENTA LO QUE PASA, AUNQUE NO PASE NADA ───────────────────────────
     El 14-09-2026 esto no bajó ni un informe y no había forma de saber por qué:
     el backend solo veía lo que llegaba, y aquí no llegaba nada. Tres rondas
     mirando el sitio equivocado. Ahora cada pasada manda UNA línea de
     diagnóstico —cuántas direcciones conoce, cuáles intentó y con qué
     resultado— por el mismo canal que ya funciona. Cuesta una petición cada
     media hora y es la diferencia entre saber y adivinar (gotcha 65). */
  const traza = [];
  let ok = 0;
  /* SOLO EL NOMBRE DEL FICHERO, NUNCA LA URL. Las direcciones del portal van
     FIRMADAS: llevan `X-Amz-Security-Token` y `X-Amz-Signature`, o sea una
     credencial temporal de AWS. Esta rama mandaba las URLs enteras al
     diagnóstico «para ver qué conoce», y con eso una firma acabó guardada en
     nuestra base (14-09-2026, borrada en cuanto se vio). Caducaba en 30
     minutos, pero eso no lo hace correcto: un diagnóstico no puede llevarse
     credenciales de nadie. */
  const soloNombre = (u) => (u.split('?')[0].split('/').pop() || '').slice(-44);
  if (!pendientes.length) {
    await enviarDiagnostico({ kind: 'debug', which: 'informes',
                              url: `conocidas=${Object.keys(informes).length} pendientes=0`,
                              schema: Object.keys(informes).slice(0, 6).map(soloNombre).join(' | ').slice(0, 700) });
    return 0;
  }
  for (const u of pendientes) {
    informes[u].pedido = ahora;
    /* EL NOMBRE DEL FICHERO, NO EL FINAL DE LA URL. Con las direcciones
       firmadas, los últimos 46 caracteres son la FIRMA: la traza salía como
       `0c61e25c26949756...` y no había forma de saber de qué informe hablaba —
       me costó una ronda entera. Y además una firma es una credencial: no
       tiene por qué viajar a nuestro servidor. */
    const corto = ((u.split('?')[0].split('/').pop()) || u).slice(-44);
    try {
      const r = await fetch(u, { credentials: 'include', cache: 'no-store' });
      if (!r || !r.ok) { traza.push(`${corto} HTTP${r ? r.status : '?'}`); continue; }
      const html = await r.text();
      if (!html || html.length < 400) { traza.push(`${corto} vacio(${html ? html.length : 0})`); continue; }
      const res = await mandarInforme('diario', html.slice(0, 8000000), informes[u].center || '');
      if (res && res.ok) { ok++; traza.push(`${corto} OK(${html.length})`); }
      else traza.push(`${corto} rechazado:${String(res && res.motivo).slice(0, 40)}`);
    } catch (e) {
      traza.push(`${corto} ERR:${String(e).slice(0, 40)}`);
    }
  }
  await chrome.storage.local.set({ informes });
  await enviarDiagnostico({ kind: 'debug', which: 'informes',
                            url: `conocidas=${Object.keys(informes).length} intentadas=${pendientes.length} ok=${ok}`,
                            count: ok, bytes: pendientes.length,
                            schema: traza.join(' || ').slice(0, 1500) });
  return ok;
}

async function enviarDiagnostico(payload) {
  /* SI FALLA, SE DICE. Antes se tragaba el error entero y por eso el resumen de
     Cortex estuvo un dia entero sin llegar sin que nada lo delatara: el mensaje
     salia, alguien por el camino lo descartaba y la coleccion seguia vacia.
     Un fallo silencioso en el unico canal que trae los contadores de Amazon es
     justo el que no puede quedarse callado. Se apunta en la actividad, que es
     lo que se mira en el popup cuando algo no cuadra. */
  const que = payload?.kind || 'diagnostico';
  try {
    const { ingestToken, ingestUrl } = await cfg();
    if (!ingestToken) { await pushActivity(`${que}: sin token de ingesta`, 0); return; }
    const r = await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Ingest-Token': ingestToken,
        // Que version esta corriendo en cada nave. Con la extension repartida a
        // varias estaciones, sin esto no hay forma de saber quien tiene cual.
        'X-Ext-Version': chrome.runtime.getManifest().version,
        'X-Ext-Install': await idInstalacion(),
        'X-Ext-Interceptor': _vInterceptor || '',
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) await pushActivity(`${que}: HTTP ${r.status}`, 0);
  } catch (e) {
    await pushActivity(`${que}: no salio (${String(e).slice(0, 40)})`, 0);
  }
}

async function pushActivity(url, count) {
  const { activity = [] } = await chrome.storage.local.get({ activity: [] });
  activity.unshift({ url: (url || '').replace(/^https?:\/\/[^/]+/, '').slice(0, 60), count, at: Date.now() });
  await chrome.storage.local.set({ activity: activity.slice(0, 12) });
}

/* Antes de que MV3 apague el worker, lo que quede en memoria se escribe. */
try { chrome.runtime.onSuspend?.addListener(() => { volcar(); }); } catch (_) {}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'cortexPackages' && Array.isArray(msg.packages)) {
    enqueue(msg.packages).then(() => reply?.({ ok: true }));
    return true;
  }
  if (msg?.type === 'heartbeat') {
    /* Que version corre DENTRO de la pagina. No es la del manifiesto: el
       interceptor se queda inyectado hasta que se recarga la pestaña de Cortex,
       asi que puede ser mas vieja — y creerse la del manifiesto es lo que hizo
       dar por instaladas tres versiones que no estaban corriendo. */
    if (msg.src === 'main' && typeof msg.v === 'string' && /^[0-9.]{1,12}$/.test(msg.v)) _vInterceptor = msg.v;
    const patch = { connected: true, hbUrl: msg.url, hbAt: Date.now() };
    if (msg.src === 'main') patch.mainAt = Date.now(); // el hook de red (MAIN) está vivo
    setState(patch);
    return false;
  }
  if (msg?.type === 'reinject') { injectAll().then(() => reply?.({ ok: true })); return true; }
  if (msg?.type === 'debug') {
    pushActivity(msg.url, msg.count || 0);
    /* Un debug CON NOMBRE es un dato de diagnostico, no una linea de actividad:
       ademas de la lista del popup se guarda en el servidor, que es donde se
       puede mirar sin pedirle a nadie que abra el navegador. Asi se comprueba si
       una version nueva funciona en segundos en vez de al dia siguiente. */
    if (msg.which) enviarDiagnostico({ kind: 'debug', which: msg.which, url: msg.url,
                                       count: msg.count, bytes: msg.bytes });
    return false;
  }
  if (msg?.type === 'sample') {
    chrome.storage.local.get({ diag: {} }).then(({ diag }) =>
      chrome.storage.local.set({ diag: { ...diag, keys: msg.keys || [], node: msg.node || '', at: Date.now() } }));
    return false;
  }
  if (msg?.type === 'estadosInforme') {
    /* Al servidor por el mismo camino que el esquema. Sin esto el resultado de
       la prueba vive solo en el popup de un equipo y no hay manera de saber si
       el informe de Cortex trae los paquetes que van en la furgoneta. */
    const usa = Array.isArray(msg.estados) ? msg.estados : [];
    const no = Array.isArray(msg.descartados) ? msg.descartados : [];
    enviarDiagnostico({
      kind: 'debug', which: 'estados_informe',
      url: `usa: ${usa.join(', ') || '(ninguno)'} · vacios: ${no.join(', ') || '(ninguno)'}`,
      count: usa.length, bytes: no.length,
    });
    return false;
  }
  if (msg?.type === 'schema') {
    const key = msg.which === 'summary' ? 'schemaSummary' : (msg.which === 'report' ? 'schemaReport' : 'schema');
    chrome.storage.local.get({ diag: {} }).then(({ diag }) =>
      chrome.storage.local.set({ diag: { ...diag, [key]: msg.schema || '', schemaUrl: msg.url || '', at: Date.now() } }));
    /* Y AL SERVIDOR. Hasta ahora el esquema se quedaba aquí, en el navegador de
       quien tuviera la extensión, donde nadie podía mirarlo. Es el único sitio
       donde consta QUÉ CAMPOS da Cortex de verdad (schemaOf conserva los
       valores de cadena cortos: taskType, taskState, taskStateContext...), y
       sin eso cualquier regla para descontar del DCR las anulaciones en nave se
       escribe a ojo. Es estructura, no datos de cliente. */
    enviarDiagnostico({ kind: 'schema', which: msg.which || 'details', url: msg.url, schema: msg.schema });
    return false;
  }
  /* LOS CONTADORES DEL PROPIO CORTEX. Van por el mismo camino que el esquema
     —diagnostico, no paquetes— porque no son datos de cliente: son totales por
     ruta y por conductor, mas el nombre y el telefono que Amazon publica de su
     propia plantilla. */
  if (msg?.type === 'posicionesVivas') {
    enviarDiagnostico({ kind: 'posiciones_vivas', url: msg.url, dia: msg.dia,
                        sa: msg.sa, datos: msg.datos });
    return false;
  }
  if (msg?.type === 'resumenCortex') {
    enviarDiagnostico({ kind: 'resumen_cortex', url: msg.url, dia: msg.dia,
                        sa: msg.sa, datos: msg.datos });
    return false;
  }
  /* QUE ESTADOS DEL INFORME DE DIRECCIONES SE HAN APRENDIDO. Vivian en la
     memoria del interceptor y un F5 en Cortex los borraba: se volvia a pedir
     solo REATTEMPTABLE, los paquetes en furgoneta se quedaban sin dest_lat /
     dest_lng y el mapa de "Apoyo en ruta" los daba por sin ubicacion. Guardarlo
     aqui es lo unico que hace que el "aprende para siempre" sea verdad.

     Los estados se acumulan (son comunes a cualquier nave). La plantilla lleva
     el serviceAreaId dentro, asi que va POR ESTACION y solo se devuelve entera:
     el interceptor coge la de la estacion que esta mirando y descarta el resto.
     Nada de esto son datos de cliente: son nombres de estado y una URL. */
  if (msg?.type === 'informeAprendido') {
    chrome.storage.local.get({ informe: { estados: [], descartados: [], plantillas: {} } }).then(({ informe }) => {
      const estados = [...new Set([...(informe.estados || []),
                                   ...(Array.isArray(msg.estados) ? msg.estados : [])])];
      /* Un estado que ALGUNA vez trajo paquetes deja de estar descartado: puede
         venir vacio un dia flojo y no por eso hay que dejar de pedirlo. */
      const descartados = [...new Set([...(informe.descartados || []),
                                       ...(Array.isArray(msg.descartados) ? msg.descartados : [])])]
        .filter((s) => !estados.includes(s));
      const plantillas = { ...(informe.plantillas || {}) };
      if (msg.sa && typeof msg.plantilla === 'string' && msg.plantilla) plantillas[msg.sa] = msg.plantilla;
      chrome.storage.local.set({ informe: { estados, descartados, plantillas, at: Date.now() } });
    });
    return false;
  }
  if (msg?.type === 'informeGuardado') {
    chrome.storage.local.get({ informe: { estados: [], descartados: [], plantillas: {} } })
      .then(({ informe }) => reply?.({ estados: informe.estados || [],
                                       descartados: informe.descartados || [],
                                       plantillas: informe.plantillas || {} }));
    return true;   // respuesta asincrona: hay que mantener el canal abierto
  }
  /* ── RAMA DSP: los informes del portal ─────────────────────────────────
     Van por su propia puerta (`/cortex/ingest-informe`) y NO por la cola de
     paquetes: no son observaciones que se acumulen, es un documento entero que
     el backend ya sabe leer. Mezclarlos en la cola habria significado
     reescribir el lector que ya existe y esta probado. */
  if (msg?.type === 'informesVistos') {
    recordarInformes(msg.urls, msg.center).then((n) => {
      if (n) bajarInformesPendientes();   // los recien descubiertos, ya
      reply?.({ ok: true, nuevos: n });
    });
    return true;
  }
  if (msg?.type === 'informePortal') {
    mandarInforme(msg.tipo, msg.texto, msg.center).then((r) => reply?.(r));
    return true;   // respuesta asincrona
  }
  /* La sonda del portal: qué petición devuelve los enlaces firmados. Viaja la
     FORMA —ruta, nombres de parámetros y esqueleto de la respuesta—, nunca una
     firma ni un valor. Es lo único que falta para poder pedirlos nosotros. */
  if (msg?.type === 'firmaVista') {
    enviarDiagnostico({ kind: 'schema', which: 'firma-informes', url: msg.url,
                        schema: `campos:${msg.campos || '-'} :: ${msg.esqueleto || ''}`.slice(0, 7000) });
    return false;
  }
  if (msg?.type === 'caminoPortal') {
    enviarDiagnostico({ kind: 'url_vista', which: 'portal', url: msg.camino,
                        schema: String(msg.texto || '').slice(0, 120) });
    return false;
  }
  if (msg?.type === 'flushNow') { flush().then(() => reply?.({ ok: true })); return true; }
  /* El popup manda aquí qué estaciones se envían. Lista vacía = no enviar nada. */
  if (msg?.type === 'setEstaciones') {
    const lista = Array.isArray(msg.estaciones) ? msg.estaciones : [];
    // `eleccionHecha` marca que la decisión la tomó una persona: a partir de
    // aquí no se auto-elige nada, ni aunque quede una sola estación. Desmarcar
    // a propósito tiene que aguantar.
    chrome.storage.local.set({ enviarEstaciones: lista, eleccionHecha: true }).then(async () => {
      await setState({ lastMessage: lista.length ? `Enviando sólo ${lista.join(', ')}.` : 'Envío en pausa: sin estación elegida.', ok: true });
      reply?.({ ok: true });
    });
    return true;
  }
  /* Descarta de la cola lo de una estación que NO quieres mandar. */
  if (msg?.type === 'descartarEstacion') {
    chrome.storage.local.get({ queue: {} }).then(async ({ queue }) => {
      for (const [tba, o] of Object.entries(queue)) if (estacionDe(o) === msg.estacion) delete queue[tba];
      await chrome.storage.local.set({ queue });
      await recuento(queue);
      await setState({ lastMessage: `Descartado lo de ${msg.estacion}.`, ok: true, buffered: Object.keys(queue).length });
      reply?.({ ok: true });
    });
    return true;
  }
});

// Registro de listeners al final (nunca antes de que existan sus funciones) y
// arranque el último: así, aunque boot() fallara, los listeners ya están vivos.
chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
/* La misma alarma de cada minuto tira tambien de los informes: la funcion
   decide sola si toca (media hora por fichero), asi que llamarla cada minuto
   no pide nada de mas y la deja pedir aunque nadie abra ninguna pestaña. */
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== ALARM) return;
  flush();
  bajarInformesPendientes();
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && /amazon\.es/.test(tab.url || '')) inject(tabId);
});
boot(); // al despertar el service worker
