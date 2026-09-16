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
let _vEsperada = '';      // la que ESTE paquete lleva dentro (leida del fichero)

/* Cual DEBERIA estar corriendo. Se lee del `interceptor.js` que va dentro de la
   propia extension, no de una constante copiada aqui: una copia se queda vieja
   el dia que alguien toque el otro fichero y volveriamos a comparar contra algo
   que no es (gotcha 40).

   Hace falta porque la version de la extension y la del interceptor son DOS
   contadores distintos —2.89.0 frente a 2.54.0— y compararlos entre si da
   «distinto» SIEMPRE: el aviso de «recarga Cortex (F5)» llevaba encendido
   permanentemente, o sea que no avisaba de nada. */
async function versionEsperada() {
  if (_vEsperada) return _vEsperada;
  try {
    const txt = await (await fetch(chrome.runtime.getURL('interceptor.js'))).text();
    const m = txt.match(new RegExp("VERSION_INTERCEPTOR" + String.fromCharCode(92) + "s*=" +
                                   String.fromCharCode(92) + "s*['" + String.fromCharCode(34) +
                                   "]([0-9.]{1,12})"));
    if (m) _vEsperada = m[1];
  } catch (_) {}
  return _vEsperada;
}
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
            'X-Ext-Interceptor-Esperado': await versionEsperada(),
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
async function mandarInforme(tipo, texto, center, extra) {
  try {
    const { ingestToken, ingestUrl } = await cfg();
    if (!ingestToken) { await pushActivity(`informe ${tipo}: sin token`, 0); return { ok: false, motivo: 'sin token' }; }
    // La URL de informes sale de la de ingesta, para no tener dos ajustes que
    // puedan quedarse desparejados.
    const url = String(ingestUrl).replace(/\/ingest$/, '/ingest-informe');
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Ingest-Token': ingestToken },
      // `extra` son datos del propio envio (por ejemplo, si lo de asociados es
      // el listado o una ficha). Opcional: quien no lo manda queda igual.
      body: JSON.stringify({ tipo, texto, center: center || '', ...(extra || {}) }),
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

/* ── PEDIRLE A AMAZON QUE FIRME LOS ENLACES, NOSOTROS ────────────────────────
   La sonda encontro la peticion (14-09-2026):

     GET /performance/api/v1/getData ?dataSetId,dsp,from,station,timeFrame,to
     -> { tableData: { dsp_station_weekly_supp_reports: { rows: [ <url firmada> ] } } }

   Repitiendola con la sesion que ya hay abierta salen enlaces FRESCOS. Eso es
   lo que convierte esto en automatico de verdad: ya no hace falta que nadie
   abra la pantalla de informes.

   DOS DECISIONES:

   · LAS URLS SE BUSCAN POR CONTENIDO, no por la ruta del JSON. Da igual que
     manana `rows` pase a llamarse de otra forma o que la tabla cambie de
     sitio: se recorre la respuesta entera y se coge todo texto que apunte al
     bucket. Es la leccion de `addresses`, que estaba un nivel mas arriba de
     donde se buscaba y costo veinte versiones (gotcha 64).

   · LA LLAMADA SE GUARDA TAL CUAL, con sus parametros. No se construye a mano:
     `from`/`to` y el id del DSP no se adivinan. Cada vez que alguien pasa por
     la pantalla se refresca, y entre medias se repite la ultima. */
const LLAMADA_CADA_MS = 6 * 60 * 60 * 1000;      // cuatro veces al dia

async function guardarLlamadaInformes(url) {
  if (typeof url !== 'string' || !/\/performance\/api\//i.test(url)) return false;
  /* SOLO LA QUE SE PUEDE REPETIR POR NAVE, y tiene que ser absoluta.
     `/performance/api/` lo cumplen varias llamadas de esa pantalla
     —`getPageConfig`, el widget de avisos— y cualquiera de ellas podia pisar a
     la buena. La util es la que firma los enlaces, y se reconoce porque lleva
     `station`: es el parametro que se cambia para pedir las otras naves. Sin
     el, la vuelta por naves se queda en una sola y no sirve para nada.
     Y absoluta, porque quien la va a repetir es el service worker, que no
     tiene origen del que colgar una ruta relativa. */
  let abs;
  try { abs = new URL(url); } catch (_) { return false; }
  if (!/^https?:$/.test(abs.protocol) || !abs.searchParams.has('station')) return false;
  url = abs.toString();
  const { llamadaInformes } = await chrome.storage.local.get({ llamadaInformes: null });
  // Se sobrescribe siempre: la ultima que hizo la pagina es la mas reciente y
  // la que apunta a la semana que se esta mirando.
  await chrome.storage.local.set({ llamadaInformes: { url, visto: Date.now(),
                                                      pedido: (llamadaInformes || {}).pedido || 0 } });
  return true;
}

/** Recorre cualquier JSON y saca todo texto que apunte al bucket de informes. */
/** La nave que lleva dentro la ruta de un informe.
 *
 *  UNA SOLA FORMA DE SACARLA. Habia dos escritas por separado en este fichero
 *  —una para deducir los diarios y otra para repartir las bajadas— y eran
 *  distintas. Hoy mismo, 15-09-2026, un desacuerdo asi entre dos trozos de
 *  codigo (`portal.js` buscando el enlace en todo el texto y `urlsFirmadasDe`
 *  exigiendo que empezara por el) dejo sin informes a dos naves durante dias.
 *  No hacen falta dos.
 *
 *  La ruta es `/es/{dsp}/{nave}/{año}/week-NN/...`. Se coge el segmento de la
 *  nave, no un `tdsl` fijo: el dia que el DSP sea otro esto sigue valiendo. */
/** Que sabemos hacer con este fichero: 'dnr_inv', 'diario', o nada.
 *
 *  DOS COSAS EN UNA A PROPOSITO. Antes el tipo se decidia en el momento de
 *  mandarlo (`DNR_Investigations` -> dnr_inv, y TODO lo demas -> diario), y eso
 *  hacia que se bajaran ficheros que el backend no sabe leer y los rechazara
 *  uno por uno. Medido el 15-09-2026: de las 12 bajadas de una vuelta, 4 se
 *  iban en informes DWC-IADC que volvian rechazados... y a la vuelta siguiente
 *  se volvian a pedir, porque cada firma nueva es una URL distinta.
 *
 *  Si no hay lector, no se pide. No es tirar informacion: el fichero sigue
 *  apuntado y sale en el diagnostico, asi que el dia que se escriba su lector
 *  ya sabemos que esta ahi. Lo que se ahorra son huecos de bajada, y un hueco
 *  perdido con una URL que caduca en media hora es un informe que ese dia no
 *  entra. */
function lectorDe(u) {
  if (/DNR_Investigations_/i.test(u)) return 'dnr_inv';
  if (/-Daily-Report_/i.test(u)) return 'diario';
  return null;
}

function naveDeLaUrl(u) {
  const m = /\/es\/[a-z0-9]+\/([a-z0-9]{3,6})\/[0-9]{4}\//i.exec(String(u || ''));
  return m ? m[1].toLowerCase() : '';
}

function urlsFirmadasDe(v, salida = [], prof = 0) {
  if (prof > 8 || salida.length > 40) return salida;
  if (typeof v === 'string') {
    /* DENTRO DEL TEXTO, NO SOLO AL PRINCIPIO.
       Esto pedia que la cadena EMPEZARA por la URL. Pero quien decide que una
       respuesta trae enlaces —`portal.js`— los busca en cualquier parte del
       texto. O sea que una respuesta con el enlace metido dentro de un trozo de
       HTML pasaba el primer filtro, se guardaba como «la llamada que firma los
       enlaces»... y aqui daba CERO. Sin error, sin HTTP raro, sin nada: el
       `DIC1:0 OGA5:0 DGA1:0 DGA2:0` del 15-09-2026.
       Dos trozos de codigo que tienen que estar de acuerdo y no lo estaban.

       Y las dos formas de escapar el `&`: dentro de HTML viene `&amp;` y dentro
       de JSON incrustado `&`. Dejarlas sin deshacer da una URL que PARECE
       buena y devuelve 403 —la firma se calcula sobre los parametros—, y como
       una URL firmada solo se intenta una vez, ese informe se pierde del todo.
       Un fallo asi no avisa: simplemente ese dia no hay informe. */
    const DENTRO = /https?:\/\/[^\s"'<>]*flex-peer-performance-reports[^\s"'<>]*/gi;
    for (const encontrada of (v.match(DENTRO) || [])) {
      const limpia = encontrada.replace(/&amp;/gi, '&').replace(/\\u0026/gi, '&');
      if (!salida.includes(limpia)) salida.push(limpia);
      if (salida.length > 40) break;
    }
    return salida;
  }
  if (Array.isArray(v)) { for (const x of v) urlsFirmadasDe(x, salida, prof + 1); return salida; }
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) urlsFirmadasDe(v[k], salida, prof + 1); }
  return salida;
}

/* ── LAS NAVES DE LA EMPRESA ─────────────────────────────────────────────────
   El portal firma los enlaces de sus informes por NAVE, y la peticion que los
   firma lleva `station` como parametro. O sea que se pueden pedir los de las
   tres... si se sabe cuales son las tres.

   La extension no lo sabe: su llave es de una nave y la pantalla que ve es la
   que alguien tenga abierta. Por eso el 15-09-2026 entraban los informes de
   OGA5 y de DGA2 —las dos que se abrieron— y los de DGA1 no llegaban NUNCA, sin
   que fallara nada y sin dejar rastro. La lista la da el backend. */
const NAVES_CADA_MS = 12 * 60 * 60 * 1000;

async function navesDeLaEmpresa() {
  const { naves, navesEn } = await chrome.storage.local.get({ naves: null, navesEn: 0 });
  if (Array.isArray(naves) && naves.length && Date.now() - navesEn < NAVES_CADA_MS) return naves;
  try {
    const { ingestToken, ingestUrl } = await cfg();
    if (!ingestToken) return naves || [];
    const url = String(ingestUrl).replace(/\/ingest$/, '/naves');
    const r = await fetch(url, { headers: { 'X-Ingest-Token': ingestToken } });
    const j = await r.json().catch(() => null);
    const lista = (j && Array.isArray(j.naves) ? j.naves : []).filter(Boolean).slice(0, 12);
    if (lista.length) {
      /* Y el area de Amazon de cada una: la pestana de Cortex la lee de aqui
         (por el puente) para barrer todas las naves, no solo la que se ve. */
      const areas = (j && Array.isArray(j.areas) ? j.areas : []).slice(0, 12);
      await chrome.storage.local.set({ naves: lista, navesEn: Date.now(),
                                       areasCortex: areas, areasCortexEn: Date.now() });
      return lista;
    }
  } catch (_) { /* sin lista se sigue con la nave de la pantalla, como antes */ }
  return naves || [];
}

/** La misma peticion, cambiandole la nave. No se inventa nada: es el parametro
 *  que la propia pagina usa. Si la URL no lo trae, se devuelve tal cual. */
function conNave(url, nave) {
  try {
    const u = new URL(url);
    if (!u.searchParams.has('station')) return null;
    u.searchParams.set('station', nave);
    return u.toString();
  } catch (_) { return null; }
}

async function pedirEnlacesFrescos() {
  const { llamadaInformes } = await chrome.storage.local.get({ llamadaInformes: null });
  if (!llamadaInformes || !llamadaInformes.url) {
    // Callarse aqui fue lo que hizo falta tres rondas para ver el fallo: desde
    // fuera, «no hay llamada guardada» y «la vuelta fallo» se veian igual.
    await enviarDiagnostico({ kind: 'debug', which: 'enlaces-frescos',
                              url: 'sin llamada guardada: hay que abrir Informes complementarios una vez',
                              count: 0, bytes: 0 });
    return 0;
  }
  /* UNA VERSION NUEVA SE PRUEBA YA, NO DENTRO DE SEIS HORAS.
     La espera existe para no machacar el portal repitiendo lo mismo. Pero si lo
     que ha cambiado es justo el codigo que hace la vuelta, repetir NO es hacer
     lo mismo: es la unica forma de ver si el arreglo sirve. El 15-09-2026 la
     vuelta corrio a las 21:12 y con la espera puesta el siguiente intento
     habria sido a las 3 de la manana — o sea, sin saber nada hasta el dia
     siguiente. */
  const version = chrome.runtime.getManifest().version;
  const recienActualizada = llamadaInformes.version !== version;
  if (!recienActualizada && Date.now() - (llamadaInformes.pedido || 0) < LLAMADA_CADA_MS) return 0;
  llamadaInformes.pedido = Date.now();
  llamadaInformes.version = version;
  await chrome.storage.local.set({ llamadaInformes });

  /* UNA VUELTA POR NAVE. La de la pantalla va siempre —es la que seguro
     funciona— y las demas solo si la URL trae `station`. Si una falla, las
     otras siguen: que DGA1 de error no puede dejar sin informe a OGA5. */
  const naves = await navesDeLaEmpresa();
  const destinos = [llamadaInformes.url];
  for (const nave of naves) {
    const u = conNave(llamadaInformes.url, nave);
    if (u && !destinos.includes(u)) destinos.push(u);
  }

  let urls = [];
  const traza = [];
  for (const destino of destinos.slice(0, 6)) {
    const nave = (() => { try { return new URL(destino).searchParams.get('station') || '?'; }
                          catch (_) { return '?'; } })();
    try {
      /* `Accept: application/json`. La pagina la manda; el service worker no la
         mandaba. Un portal que no la ve puede contestar 200 con el HTML de la
         aplicacion en vez del JSON, y entonces `r.json()` falla, `j` queda en
         null y la cuenta sale 0 SIN error: exactamente lo que se vio el
         15-09-2026 con las cuatro naves a cero.
         Es una apuesta, no una certeza — por eso, justo debajo, la traza dice
         que llego de verdad. Si no era esto, la proxima vuelta lo dira sola en
         vez de dejarnos otra ronda adivinando. */
      const r = await fetch(destino, { credentials: 'include', cache: 'no-store',
                                       headers: { Accept: 'application/json' } });
      if (!r || !r.ok) { traza.push(`${nave}:HTTP${r ? r.status : '?'}`); continue; }
      const claseRespuesta = (r.headers.get('content-type') || '?').split(';')[0];
      const j = await r.json().catch(() => null);
      /* TRES CASOS DISTINTOS, TRES PALABRAS DISTINTAS. Antes los tres salian
         como `0` y no habia forma de saber cual era: si no es JSON el problema
         es la peticion, y si es JSON y no trae enlaces el problema es que esa
         nave no tiene informes esa semana. Cosas opuestas. */
      if (!j) { traza.push(`${nave}:noJSON(${claseRespuesta})`); continue; }
      const suyas = urlsFirmadasDe(j);
      traza.push(`${nave}:${suyas.length || 'sinEnlaces'}`);
      urls = urls.concat(suyas);
    } catch (e) {
      traza.push(`${nave}:${String(e).slice(0, 24)}`);
    }
  }
  const n = await recordarInformes(urls, '');
  await enviarDiagnostico({ kind: 'debug', which: 'enlaces-frescos',
                            url: `${traza.join(' ')} · nuevas=${n}`,
                            count: urls.length, bytes: n });
  if (n) await bajarInformesPendientes();
  return urls.length;
}

/* ── EL PLAN DE HORAS, PEDIDO DIRECTAMENTE ───────────────────────────────────
   Hasta ahora el plan semanal (WHC) se leia de la PANTALLA: el texto que hay a
   la vista en «Programacion». Por eso solo entraba el de la nave que alguien
   tuviera abierta, y el de DGA1 no llego nunca.

   La sonda del 15-09-2026 apunto lo que pide esa pantalla, y ahi estaba:

     GET /scheduling/home/api/v2/service-areas
         -> [{ serviceAreaId, serviceAreaName, defaultStationCode }, x37]
     GET /scheduling/home/api/v2/rosters ?serviceAreaId,fromDate,toDate
         -> el turno de cada persona (va en `meta`, no en `data`)
     GET /scheduling/home/api/v2/service-area-config ?serviceAreaId
         -> `leapConfig`: los umbrales DE AMAZON, semanal y diario

   O sea que se puede pedir por nave, igual que se hizo con los informes
   cambiando `station`. Nadie tiene que abrir nada.

   SOLO NUESTRAS NAVES. `service-areas` devuelve 37, y ahi hay areas que no son
   nuestras. Se cruza contra la lista que da el backend y se exige coincidencia
   EXACTA; si una nave casara con dos areas no se pide ninguna. Pedir el
   cuadrante de otro DSP no es un error tecnico, es mirar donde no se debe. */
const HORARIOS_CADA_MS = 3 * 60 * 60 * 1000;      // cuatro veces al dia
const CORTEX_ORIGEN = 'https://logistics.amazon.es';

/** Domingo y sabado de la semana de HOY, en AAAA-MM-DD.
 *  Compuesta a mano: `toISOString()` sobre una fecha local corre el dia en
 *  Espana y pediria la semana que no es (gotcha 11). */
function semanaAmazon() {
  const h = new Date();
  const clave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dom = new Date(h); dom.setDate(dom.getDate() - dom.getDay());
  const sab = new Date(dom); sab.setDate(sab.getDate() + 6);
  return { desde: clave(dom), hasta: clave(sab) };
}

async function jsonDeCortex(camino) {
  const r = await fetch(CORTEX_ORIGEN + camino, { credentials: 'include', cache: 'no-store' });
  if (!r || !r.ok) return { error: `HTTP ${r ? r.status : '?'}` };
  const j = await r.json().catch(() => null);
  return j ? { json: j } : { error: 'respuesta no es JSON' };
}

/* ── LAS CUENTAS DE ONBOARDING, SIN QUE NADIE ABRA NADA ──────────────────────
   `search-providers` trae, por persona, los trece pasos del onboarding y como
   va cada uno. Pero va por POST y no se sabe como se llama su cuerpo, asi que
   no se puede repetir la peticion a mano — y adivinarla seria inventarse una
   estructura, el fallo que costo veinte versiones con las direcciones.

   La forma honesta de conseguirlo es que la pagina la haga ELLA: se abre la
   pantalla de Asociados en una pestaña de fondo, la propia web hace sus
   llamadas, el interceptor las recoge como siempre, y se cierra la pestaña.
   Ni un dato inventado y ni una peticion que la pagina no haga por su cuenta.

   POR QUE HACE FALTA. Si depende de que alguien abra esa pantalla, los dias que
   nadie la abra no hay datos — y el 16-09-2026 Dani se fue a trabajar dejando
   el ordenador encendido justo con eso pendiente. Un dato que solo llega si
   alguien se acuerda no es automatico.

   CON CUIDADO: en segundo plano (`active: false`), una vez cada cuatro horas, y
   la pestaña se cierra sola pase lo que pase. */
const ASOCIADOS_CADA_MS = 4 * 60 * 60 * 1000;
const ASOCIADOS_URL = 'https://logistics.amazon.es/account-management/delivery-associates';

/* A QUIEN SEGUIMOS. La lista de la gente que esta entrando —correo y nombre—
   que da el backend. Se guarda y se refresca cada hora: cambia cuando alguien
   pega un listado nuevo, no cada minuto. */
const SEGUIMIENTO_CADA_MS = 60 * 60 * 1000;

async function aQuienSeguimos() {
  const { seguimiento, seguimientoEn = 0 } =
    await chrome.storage.local.get({ seguimiento: null, seguimientoEn: 0 });
  if (seguimiento && Date.now() - seguimientoEn < SEGUIMIENTO_CADA_MS) return seguimiento;
  try {
    const { ingestToken, ingestUrl } = await cfg();
    if (!ingestToken) return seguimiento || { correos: [], nombres: [] };
    const url = String(ingestUrl).replace(/\/ingest$/, '/seguimiento');
    const r = await fetch(url, { headers: { 'X-Ingest-Token': ingestToken } });
    const j = await r.json().catch(() => null);
    if (j && Array.isArray(j.correos)) {
      await chrome.storage.local.set({ seguimiento: j, seguimientoEn: Date.now() });
      return j;
    }
  } catch (_) { /* sin lista se sigue con la de antes */ }
  return seguimiento || { correos: [], nombres: [] };
}

/** El nombre sin tildes ni orden, igual que lo normaliza el backend. */
function clavesDeNombre(n) {
  const t = String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return t.replace(/,/g, ' ').split(/\s+/).filter((w) => w.length > 2);
}

/* ── CÓMO ESTÁ CADA CUENTA POR DENTRO ───────────────────────────────────────
   La lista de Asociados da un resumen. La FICHA de cada persona da las tareas
   de verdad, repartidas en tres grupos: las que hace la DSP, las que hace
   Amazon y las que tiene que hacer la propia persona. Es la diferencia entre
   «le falta algo» y «le falta la sesion de formacion».

   Dos peticiones por persona, las mismas que hace la pagina al abrir su ficha,
   y GET con la sesion abierta: ni CSRF ni cuerpo que inventar. */
const ASOC_DETALLE_MAX = 60;

async function pedirDetalleAsociados(gente) {
  const base = 'https://logistics.amazon.es/account-management/data/';
  const fuera = [];
  let fallos = 0;
  for (const p of (gente || []).slice(0, ASOC_DETALLE_MAX)) {
    if (!p || !p.id) continue;
    const q = `?providerId=${encodeURIComponent(p.id)}`;
    try {
      const [rt, rc] = await Promise.all([
        fetch(`${base}get-workflow-modules${q}`,
              { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } }),
        fetch(`${base}get-qualification${q}`,
              { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } }),
      ]);
      const jt = rt && rt.ok ? await rt.json().catch(() => null) : null;
      const jc = rc && rc.ok ? await rc.json().catch(() => null) : null;
      const lista = (jt && Array.isArray(jt.data)) ? jt.data : null;
      if (!lista) { fallos++; continue; }
      fuera.push({
        id: p.id,
        // De cada tarea: como se llama, quien la tiene que hacer y como va. Ni
        // fechas ni URLs: no hacen falta para saber que falta.
        tareas: lista.slice(0, 40).map((m) => ({
          que: String(m.moduleName || '').slice(0, 60),
          de: String(m.moduleOwner || '').slice(0, 20),
          estado: String(m.moduleClientStatus || m.moduleStatus || '').slice(0, 30),
          nota: String(m.moduleMessage || '').slice(0, 60),
        })).filter((x) => x.que),
        cualifica: Object.values(((jc || {}).data || {}).qualifications || {})
          .slice(0, 8)
          .map((x) => ({ que: String(x.id || '').slice(0, 20),
                         estado: String(x.status || '').slice(0, 20) }))
          .filter((x) => x.que),
      });
    } catch (_) { fallos++; }
    // Un respiro: esto no tiene ninguna prisa y el portal es de Amazon.
    await new Promise((ok) => setTimeout(ok, 150));
  }
  await enviarDiagnostico({ kind: 'debug', which: 'asociados-detalle',
                            url: `pedidos=${Math.min((gente || []).length, ASOC_DETALLE_MAX)}`
                                 + ` con_tareas=${fuera.length} fallos=${fallos}`,
                            count: fuera.length, bytes: 0 });
  if (!fuera.length) return 0;
  // En tandas: un mensaje con sesenta fichas dentro es el que no llega.
  for (let i = 0; i < fuera.length; i += 15) {
    await mandarInforme('asociados', JSON.stringify({ detalle: fuera.slice(i, i + 15) }), '');
  }
  return fuera.length;
}

async function pedirAsociados() {
  const { asociadosEn = 0, asociadosOk = 0, asociadosVersion = '', tabAsociados = 0 } =
    await chrome.storage.local.get({ asociadosEn: 0, asociadosOk: 0,
                                     asociadosVersion: '', tabAsociados: 0 });

  /* ── PRIMERO: ¿HAY UNA PESTAÑA ABIERTA DE LA VUELTA ANTERIOR? ───────────
     El service worker de MV3 lo mata Chrome a los pocos segundos de estar
     quieto. La primera version esperaba TRES MINUTOS dentro de la propia
     funcion para dar tiempo a paginar, y si Chrome la mataba a mitad, la
     pestaña se quedaba abierta y la vuelta a medias — pero ya marcada como
     hecha, asi que no se reintentaba hasta dentro de cuatro horas.
     Ahora se abre y se sale. La pestaña se cierra en una vuelta POSTERIOR del
     aviso, que llega cada minuto: sobrevive a que Chrome apague el worker. */
  if (tabAsociados) {
    const abierta = Date.now() - (await chrome.storage.local.get({ tabAsociadosEn: 0 })).tabAsociadosEn;
    if (abierta > 3 * 60 * 1000) {
      try { await chrome.tabs.remove(tabAsociados); } catch (_) {}
      await chrome.storage.local.set({ tabAsociados: 0 });
      // AHORA si se da la version por probada: cuando la vuelta ha terminado
      // de verdad, no cuando se empezo.
      await chrome.storage.local.set({ asociadosVersion: chrome.runtime.getManifest().version });
      await enviarDiagnostico({ kind: 'debug', which: 'asociados-solo',
                                url: 'vuelta terminada y pestaña cerrada',
                                count: 0, bytes: 0 });
    }
    return 0;                       // mientras haya una abierta, no se abre otra
  }

  const cada = asociadosOk ? ASOCIADOS_CADA_MS : 20 * 60 * 1000;
  // Una ronda tras cada actualizacion: si lo que ha cambiado es el codigo que
  // captura, esperar cuatro horas a saber si sirve no tiene sentido.
  const recienActualizada = asociadosVersion !== chrome.runtime.getManifest().version;
  if (!recienActualizada && Date.now() - asociadosEn < cada) return 0;
  await chrome.storage.local.set({ asociadosEn: Date.now() });

  /* La lista de a quien seguimos, al almacen ANTES de abrir: el puente de la
     pestaña la lee de ahi para preguntar por correo, y sin ella esa vuelta
     solo podria barrer. */
  try { await aQuienSeguimos(); } catch (_) {}
  try {
    const t = await chrome.tabs.create({ url: ASOCIADOS_URL, active: false });
    await chrome.storage.local.set({ tabAsociados: t.id, tabAsociadosEn: Date.now() });
    await enviarDiagnostico({ kind: 'debug', which: 'asociados-solo',
                              url: 'abierta en segundo plano', count: 0, bytes: 0 });
    return 1;
  } catch (e) {
    await chrome.storage.local.set({ tabAsociados: 0 });
    await enviarDiagnostico({ kind: 'debug', which: 'asociados-solo',
                              url: `no se pudo abrir: ${String(e).slice(0, 80)}`,
                              count: 0, bytes: 0 });
    return 0;
  }
}

async function pedirHorarios() {
  const { horariosEn } = await chrome.storage.local.get({ horariosEn: 0 });
  if (Date.now() - horariosEn < HORARIOS_CADA_MS) return 0;
  await chrome.storage.local.set({ horariosEn: Date.now() });

  const naves = await navesDeLaEmpresa();
  if (!naves.length) return 0;

  const areas = await jsonDeCortex('/scheduling/home/api/v2/service-areas');
  if (areas.error) {
    await enviarDiagnostico({ kind: 'debug', which: 'horarios',
                              url: `service-areas: ${areas.error}`, count: 0, bytes: 0 });
    return 0;
  }
  const lista = Array.isArray(areas.json && areas.json.data) ? areas.json.data : [];
  const { desde, hasta } = semanaAmazon();
  const traza = [];
  let mandados = 0;

  for (const nave of naves) {
    /* COINCIDENCIA EXACTA, Y UNA SOLA. `defaultStationCode` es el codigo de la
       nave; el nombre se mira tambien porque no todas lo traen, pero como
       palabra entera. Con dos candidatas no se elige: se dice y se pasa. */
    const suyas = lista.filter((a) => {
      const cod = String((a && a.defaultStationCode) || '').toUpperCase();
      const nom = String((a && a.serviceAreaName) || '').toUpperCase();
      return cod === nave || new RegExp(`\\b${nave}\\b`).test(nom);
    });
    if (suyas.length !== 1) { traza.push(`${nave}:${suyas.length}areas`); continue; }
    const said = suyas[0].serviceAreaId;
    if (!said) { traza.push(`${nave}:sin-id`); continue; }

    const q = encodeURIComponent(said);
    const cfg = await jsonDeCortex(`/scheduling/home/api/v2/service-area-config?serviceAreaId=${q}`);
    const ros = await jsonDeCortex(
      `/scheduling/home/api/v2/rosters?serviceAreaId=${q}&fromDate=${desde}&toDate=${hasta}`);
    if (ros.error) { traza.push(`${nave}:${ros.error}`); continue; }

    const carga = JSON.stringify({
      nave, serviceAreaId: said, desde, hasta,
      config: cfg.json || null, rosters: ros.json || null,
    });
    const r = await mandarInforme('horarios', carga, nave);
    traza.push(`${nave}:${r && r.ok ? 'ok' : (r && r.motivo) || 'falla'}`);
    if (r && r.ok) mandados++;
  }
  await enviarDiagnostico({ kind: 'debug', which: 'horarios',
                            url: `${desde}..${hasta} · ${traza.join(' ')}`.slice(0, 300),
                            count: naves.length, bytes: mandados });
  return mandados;
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
    const nave = naveDeLaUrl(u) || '?';
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
  let sinLector = 0;
  const candidatos = Object.keys(informes)
    .filter((u) => (firmada(u) ? !informes[u].pedido
                               : ahora - (informes[u].pedido || 0) > INFORME_CADA_MS))
    .filter((u) => { if (lectorDe(u)) return true; sinLector++; return false; })
    .sort().reverse();
  /* UN POCO DE CADA NAVE, NO DOCE DE LA PRIMERA.
     Antes se cogian los doce primeros por nombre. Con una sola nave daba igual;
     con cuatro, no: la ruta lleva la nave dentro (`/es/tdsl/dga1/...`) y ordenar
     por nombre agrupa todos los de una nave seguidos. O sea que OGA5 se llevaba
     la vuelta entera y DGA1 y DGA2 esperaban a la siguiente... con la URL ya
     caducada, porque una firma dura media hora y estas se intentan UNA vez.
     Resultado: la nave que va detras en el abecedario no baja NUNCA su informe.
     Se reparte en vueltas: uno de cada nave, luego el segundo de cada nave, y
     asi. Si una nave tiene menos ficheros, su hueco lo aprovechan las demas. */
  const porNave = new Map();
  for (const u of candidatos) {
    const nave = naveDeLaUrl(u) || (informes[u].center || '?').toLowerCase();
    if (!porNave.has(nave)) porNave.set(nave, []);
    porNave.get(nave).push(u);
  }
  const pendientes = [];
  const colas = [...porNave.values()];
  while (pendientes.length < 12 && colas.some((c) => c.length)) {
    for (const cola of colas) {
      if (!cola.length) continue;
      pendientes.push(cola.shift());
      if (pendientes.length >= 12) break;
    }
  }
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
      /* CADA FICHERO CON SU TIPO. El Daily Report y las investigaciones de
         DNR salen de la misma carpeta y se bajan igual, pero los lee gente
         distinta en el backend: mandar los dos como 'diario' haria que el
         lector de diarios rechazara las investigaciones y no entraran nunca. */
      const tipo = lectorDe(u);
      const res = await mandarInforme(tipo, html.slice(0, 8000000), informes[u].center || '');
      if (res && res.ok) { ok++; traza.push(`${corto} OK(${html.length})`); }
      else traza.push(`${corto} rechazado:${String(res && res.motivo).slice(0, 40)}`);
    } catch (e) {
      traza.push(`${corto} ERR:${String(e).slice(0, 40)}`);
    }
  }
  await chrome.storage.local.set({ informes });
  await enviarDiagnostico({ kind: 'debug', which: 'informes',
                            url: `conocidas=${Object.keys(informes).length} intentadas=${pendientes.length} ok=${ok}`
                                 + (sinLector ? ` sin-lector=${sinLector}` : ''),
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
        'X-Ext-Interceptor-Esperado': await versionEsperada(),
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

/* ── SE ACTUALIZA SOLA ───────────────────────────────────────────────────────
   Dani se instalo la extension a mano CINCO veces en una noche. Y no por
   cambios de fondo: la mayoria eran patrones y filtros, o sea datos. Cincuenta
   y tantas carpetas «FlotaDSP-Cortex (35)» en Descargas es la prueba de que el
   metodo estaba mal, no el que lo usaba.

   COMO FUNCIONA. Cargada descomprimida desde una carpeta FIJA,
   `chrome.runtime.reload()` vuelve a leer los ficheros DEL DISCO. O sea que si
   alguien deja ahi la version nueva, la extension se pone al dia sola. Lo unico
   que hace falta es enterarse, y para eso ya esta `extension.json`, que el
   propio despliegue publica con la version.

   NO ES CODIGO REMOTO —que ademas MV3 prohibe—: lo que se descarga es un numero
   de version. El codigo sale del disco de Dani, puesto ahi por el despliegue.

   EL SEGURO CONTRA EL BUCLE. Si la carpeta NO se ha actualizado, al recargar
   seguiriamos en la version vieja y esto se reiniciaria cada cinco minutos para
   siempre. Por eso se apunta la version por la que ya se intento: si se vuelve
   a mirar y seguimos igual, no se insiste. Un fallo que se repite solo es peor
   que el problema que arregla. */
const VERSION_CADA_MS = 5 * 60 * 1000;

function esMasNueva(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function mirarSiHayVersionNueva() {
  const mia = chrome.runtime.getManifest().version;
  const { versionMirada = 0, recargaIntento = '' } =
    await chrome.storage.local.get({ versionMirada: 0, recargaIntento: '' });
  if (Date.now() - versionMirada < VERSION_CADA_MS) return;
  await chrome.storage.local.set({ versionMirada: Date.now() });

  /* QUE SE SEPA QUE PASO, PASE LO QUE PASE.
     La primera version se tragaba el fallo del `fetch` con un `catch` mudo, y
     el 15-09-2026 la 2.65 se quedo sin actualizar a la 2.66 sin que hubiera
     forma de saber por que: ni fallo, ni aviso, ni nada. Es el mismo error que
     llevo el dia entero arreglando en otros sitios (gotcha 65), cometido por mi
     en el codigo que tenia que arreglar justo eso.
     Ahora cada intento deja una linea en el servidor. Cuesta una peticion cada
     cinco minutos y es la diferencia entre saber y adivinar. */
  const contar = (que) => enviarDiagnostico({
    kind: 'debug', which: 'autoactualizar',
    url: `${que} · corriendo=${mia}`, count: 0, bytes: 0,
  }).catch(() => {});

  let fuera = '';
  try {
    const r = await fetch('https://flotadsp.com/extension.json', { cache: 'no-store' });
    if (!r || !r.ok) { await contar(`HTTP ${r ? r.status : '?'} al pedir la version`); return; }
    fuera = String(((await r.json()) || {}).version || '');
  } catch (e) {
    await contar(`no se pudo pedir la version: ${String(e).slice(0, 60)}`);
    return;
  }
  if (!fuera) { await contar('la respuesta no traia version'); return; }
  if (!esMasNueva(fuera, mia)) { await contar(`al dia (publicada ${fuera})`); return; }
  if (recargaIntento === fuera) {
    await contar(`ya lo intente con la ${fuera} y sigo en la ${mia}: la carpeta no esta al dia`);
    await pushActivity(`hay una version ${fuera} y esta carpeta sigue en la ${mia}`, 0);
    return;
  }
  await chrome.storage.local.set({ recargaIntento: fuera });
  await contar(`recargando: ${mia} -> ${fuera}`);
  /* CON TOPE DE TIEMPO. `flush()` sale a la red; si se queda colgado, el
     `await` no vuelve NUNCA y no se llega a recargar — un cuelgue silencioso
     que deja la extension vieja para siempre. Cinco segundos y se sigue: como
     mucho se reintenta el envio despues de recargar, que es reversible;
     quedarse sin actualizar no lo es. */
  try {
    await Promise.race([flush(), new Promise((ok) => setTimeout(ok, 5000))]);
  } catch (_) {}
  try { await pushActivity(`actualizando: ${mia} -> ${fuera}`, 1); } catch (_) {}
  chrome.runtime.reload();
}

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
  /* A QUIEN SEGUIMOS: QUE LA TRAIGA. El puente lee la lista directamente de
     `chrome.storage.local` (ver bridge.js: pedirla con respuesta fallaba 4 de 4
     en Chrome). Si aun no esta, pide esto y el siguiente intento ya la tiene.
     No se contesta nada, a proposito. */
  /* LAS AREAS DE LAS NAVES: que las traiga. El puente las lee del almacen; si
     faltan o son viejas, pide esto (sin esperar respuesta, igual que con la
     lista de Asociados: esperar respuesta desde una pestana fallaba en Chrome). */
  if (msg?.type === 'areasRefrescar') {
    chrome.storage.local.set({ navesEn: 0 }).then(() => navesDeLaEmpresa()).catch(() => {});
    return false;
  }
  if (msg?.type === 'seguidosRefrescar') {
    aQuienSeguimos().catch(() => {});
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
  /* La llamada que devuelve los enlaces firmados. Se guarda para repetirla;
     no sale del navegador. */
  /* LA LLAMADA QUE FIRMA LOS ENLACES DE LOS INFORMES. Se guarda para poder
     repetirla por cada nave; sin esto solo entran los informes de la estacion
     que alguien tenga abierta, que es lo que dejo a DGA1 y DGA2 sin pre-DNR
     durante dias.
     EL CUERPO DE ESTE MANEJADOR SE PERDIO el 16-09-2026 al borrar dos
     manejadores muertos de al lado: quedo un `if` abierto y los manejadores
     siguientes acabaron DENTRO de el, o sea que ni se guardaba la llamada ni
     entraban las cuentas de asociados. Sintacticamente valido, silencioso, y
     solo se vio al medir por que no llegaban los datos. */
  if (msg?.type === 'llamadaInformes') {
    guardarLlamadaInformes(msg.url).then((ok) => {
      if (ok) pedirEnlacesFrescos();   // con una recien vista, ya
      reply?.({ ok });
    });
    return true;
  }
  if (msg?.type === 'asociadosAreas' && msg.mapa) {
    // El mapa area -> nave, guardado. Asi el orden en que lleguen las dos
    // llamadas deja de importar (ver `mirarAsociados` en interceptor.js).
    chrome.storage.local.get({ areasNave: {} }).then(({ areasNave }) => {
      chrome.storage.local.set({ areasNave: { ...areasNave, ...msg.mapa } });
    });
    reply?.({ ok: true });
    return true;
  }
  if (msg?.type === 'asociadosCuentas' && Array.isArray(msg.personas)) {
    /* SOLO LA GENTE DE NUESTRAS NAVES. La pantalla de Asociados llega a
       devolver personas de otras estaciones —en la primera captura salio una de
       Murcia, de otra empresa— y esas no son nuestras: no tienen por que salir
       de este navegador. Se filtra AQUI, que es donde se sabe cuales son las
       naves, y antes de mandar nada.
       Si de alguien no consta la nave, no se manda: mejor perderse uno que
       llevarse a quien no toca. */
    navesDeLaEmpresa().then(async (naves) => {
      const mias = new Set((naves || []).map((n) => String(n).toUpperCase()));
      /* Si la lista llego ANTES que el mapa de areas, las personas vienen sin
         nave resuelta. Se resuelve aqui con el mapa guardado de la vuelta
         anterior, en vez de descartarlas: descartar en silencio a todo el mundo
         por un problema de orden es exactamente lo que paso el 16-09-2026. */
      const { areasNave = {} } = await chrome.storage.local.get({ areasNave: {} });
      for (const p of msg.personas) {
        if ((!p.naves || !p.naves.length) && Array.isArray(p.areas)) {
          p.naves = p.areas.map((a) => areasNave[a]).filter(Boolean);
        }
      }
      /* QUIEN ESTA EN NUESTRA LISTA, PRIMERO. Filtrar solo por nave tiraba a
         quien mas importa: el 16-09-2026 Lois Barreiro Figueira estaba en la
         lista de la ETT para OGA5, tenia su cuenta al 11/14, y su Service Area
         en Amazon era «Madrid (VAD4)» — se descartaba, y la pantalla decia que
         no tenia cuenta. La nave de la cuenta NO es la nave de la ETT.
         Asi que manda la lista: si esa persona esta en Incorporaciones, entra
         este donde este. Y ademas, los de nuestras naves, para poder mirar la
         estacion entera cuando haga falta. */
      const sigo = await aQuienSeguimos();
      const correos = new Set((sigo.correos || []).map((x) => String(x).toLowerCase()));
      const nombres = new Set(sigo.nombres || []);
      const esDeLaLista = (p) => {
        if (p.correo && correos.has(String(p.correo).toLowerCase())) return true;
        const pal = clavesDeNombre(p.nombre);
        if (pal.length < 3) return false;
        // Mismo criterio que el backend: uno contiene al otro, con tres o mas
        // palabras en comun. Dos no bastan: «Garcia Lopez» casaria media Galicia.
        for (const n of nombres) {
          const otras = n.split(' ').filter((w) => w.length > 2);
          if (otras.length < 3) continue;
          const comunes = pal.filter((w) => otras.includes(w)).length;
          if (comunes >= 3 && (comunes === pal.length || comunes === otras.length)) return true;
        }
        return false;
      };
      const suyas = msg.personas.filter((p) =>
        esDeLaLista(p)
        || (Array.isArray(p.naves) && p.naves.some((n) => mias.has(String(n).toUpperCase()))));
      if (!suyas.length) {
        await enviarDiagnostico({ kind: 'debug', which: 'asociados-cuentas',
                                  url: `vistas=${msg.personas.length} de los nuestros=0`
                                       + ` naves=${[...mias].join('/')}`
                                       + ` lista=${correos.size}+${nombres.size}`,
                                  count: msg.personas.length, bytes: 0 });
        reply?.({ ok: false, motivo: 'ninguna de nuestras naves' });
        return;
      }
      const r = await mandarInforme('asociados', JSON.stringify({ personas: suyas }), '');
      // Ya ha traido datos: a partir de aqui basta con refrescar cada 4 h.
      if (r && r.ok) await chrome.storage.local.set({ asociadosOk: Date.now() });
      // Y AHORA EL DETALLE de cada uno: las veinte tareas de su ficha. Aqui y
      // no antes, porque hasta ahora no se sabia quienes son los nuestros.
      try { await pedirDetalleAsociados(suyas); } catch (_) {}
      reply?.(r || { ok: false });
    });
    return true;
  }
  if (msg.type === 'candidatosWiniw') {
    /* Los candidatos de la ETT. Va por la misma puerta que los informes —el
       token de ingesta— y con el MISMO texto que se pegaba a mano, que es lo
       que lo hace seguro: el lector del backend esta escrito contra ese texto
       y probado con las 26 fichas de verdad. */
    mandarInforme('candidatos', String(msg.texto || '').slice(0, 2000000), '')
      .then((r) => reply?.(r || { ok: false }));
    return true;
  }
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
  // ¿Hay una version nueva en el disco? Se mira cada cinco minutos (la propia
  // funcion se encarga), no cada vuelta del aviso.
  mirarSiHayVersionNueva();
  bajarInformesPendientes();
  // Y pedirle a Amazon enlaces frescos: la funcion decide sola si toca (cada
  // seis horas), asi que llamarla cada minuto no pide nada de mas.
  pedirEnlacesFrescos();
  /* Y el plan de horas de las tres naves, que ya no depende de que nadie abra
     la pantalla de Programacion: se pide a la API que esa pantalla usa. Cada
     tres horas, y la funcion decide sola si toca. */
  pedirHorarios();
  // Y las cuentas de onboarding, que si no dependen de que alguien abra esa
  // pantalla. Cada cuatro horas; la funcion decide sola si toca.
  pedirAsociados();
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && /amazon\.es/.test(tab.url || '')) inject(tabId);
});
boot(); // al despertar el service worker
