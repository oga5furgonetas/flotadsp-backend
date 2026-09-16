#!/usr/bin/env node
/* LA DIRECCIÓN DEL INFORME DE UN DÍA, DEDUCIDA DE OTRA QUE SÍ CONOCEMOS.
 * ═══════════════════════════════════════════════════════════════════════════
 * Por qué existe:
 *
 * Para que el Daily Report entre solo todos los días hay que pedir su fichero,
 * y su dirección cambia cada día Y cada semana. Hasta el 14-09-2026 eso obligaba
 * a que alguien pasara por la carpeta del portal — o sea, a acordarse: no era
 * automático.
 *
 * Ahora se deduce de un enlace conocido. Y deducir es peligroso: una dirección
 * mal construida devuelve 404 y el informe deja de entrar **sin que falle
 * nada**, que es exactamente el fallo que costó veinte versiones con
 * `addresses` (gotcha 64).
 *
 * Así que aquí se comprueba contra los enlaces REALES capturados del portal el
 * 14-09-2026 —dos naves y dos semanas—, y el caso que de verdad prueba algo es
 * el cruzado: partiendo del fichero del 08 (semana 37) tiene que salir el del
 * 13 (semana 38), que es OTRO enlace real que vimos. Si la cuenta de semanas
 * estuviera mal, ahí se ve.
 *
 * Probado reintroduciendo el fallo: contando las semanas sobre el día en vez de
 * sobre su domingo, el caso cruzado falla.
 */
import { readFileSync } from 'node:fs'

const src = readFileSync('cortex-extension/background.js', 'utf8')
const fallos = []
const ok = (cond, msg) => { if (!cond) fallos.push(msg) }

/* La función REAL, sacada del fichero (gotcha 40): una copia aquí dejaría de
   probar lo que corre en cuanto alguien tocara el original. */
const i = src.indexOf('const DIA_EN')
const j = src.indexOf('async function deducirYGuardar')
ok(i > 0 && j > i, 'no se encuentran deducirInforme/diasAPedir en background.js')
let deducirInforme, diasAPedir
if (i > 0 && j > i) {
  /* `new Function` y NO `eval`: un módulo de ES va en modo estricto, y ahí el
     `eval` se queda con sus propias declaraciones — las funciones no salían
     fuera, quedaban en `undefined`, y las comprobaciones de abajo se SALTABAN
     enteras. El checker daba «ok» sin haber probado nada.
     Se vio al reintroducir el fallo de las semanas a propósito: seguía en
     verde. Por eso ahora se comprueba que de verdad se han cargado. */
  // eslint-disable-next-line no-new-func
  const m = new Function(`${src.slice(i, j)}; return { deducirInforme, diasAPedir }`)()
  deducirInforme = m.deducirInforme
  diasAPedir = m.diasAPedir
}
ok(typeof deducirInforme === 'function', 'deducirInforme no se ha cargado: nada de lo de abajo se habría probado')
ok(typeof diasAPedir === 'function', 'diasAPedir no se ha cargado')

/* Enlaces REALES del portal, tal cual los capturó la extensión el 14-09-2026.
   La semana del portal empieza en DOMINGO: la 37 va del 06 al 12 de septiembre
   y el 13 (domingo) ya es la 38. */
const O = 'https://logistics.amazon.es'
const OGA5_08 = `${O}/es/tdsl/oga5/2026/week-37/ES-TDSL-OGA5-Daily-Report_2026-09-08_Tue.html`
const OGA5_13 = `${O}/es/tdsl/oga5/2026/week-38/ES-TDSL-OGA5-Daily-Report_2026-09-13_Sun.html`
const OGA5_12 = `${O}/es/tdsl/oga5/2026/week-37/ES-TDSL-OGA5-Daily-Report_2026-09-12_Sat.html`
const DGA1_11 = `${O}/es/tdsl/dga1/2026/week-37/ES-TDSL-DGA1-Daily-Report_2026-09-11_Fri.html`

if (deducirInforme) {
  /* ── EL CASO QUE PRUEBA ALGO: cruzar de semana ─────────────────────────── */
  ok(deducirInforme(OGA5_08, '2026-09-13') === OGA5_13,
    `del 08 (semana 37) al 13 (semana 38) sale mal:\n      ${deducirInforme(OGA5_08, '2026-09-13')}\n      esperado ${OGA5_13}`)

  /* Dentro de la misma semana, y el día de la semana en inglés. */
  ok(deducirInforme(OGA5_08, '2026-09-12') === OGA5_12,
    'dentro de la misma semana tiene que quedarse en week-37 y poner _Sat')

  /* Hacia atrás también: el 13 (semana 38) -> el 12 (semana 37). */
  ok(deducirInforme(OGA5_13, '2026-09-12') === OGA5_12,
    'hacia atrás la semana también tiene que bajar')

  /* La nave viaja en la ruta Y en el nombre del fichero, en cajas distintas. */
  const d = deducirInforme(DGA1_11, '2026-09-14')
  ok(d && d.includes('/tdsl/dga1/') && d.includes('ES-TDSL-DGA1-'),
    `la nave se pierde al deducir: ${d}`)

  /* Lo que NO es un Daily Report no se toca: deducir sobre otro informe
     construiría una dirección que no existe y encima parecería buena. */
  ok(deducirInforme(`${O}/es/tdsl/oga5/2026/week-37/DNR_Investigations_ES-TDSL-OGA5.html`, '2026-09-14') === null,
    'solo se deduce el Daily Report, que es el único con fecha en el nombre')
  ok(deducirInforme('https://otro.sitio/lo-que-sea.html', '2026-09-14') === null,
    'una dirección que no tiene la forma del portal no se deduce')

  /* Que no se salga del calendario. */
  ok(deducirInforme(OGA5_08, '2028-01-01') === null,
    'saltar de año se sale de la numeración de semanas: mejor no deducir')
}

if (diasAPedir) {
  const dias = diasAPedir()
  ok(dias.length >= 3 && dias.length <= 5, `se piden ${dias.length} días: ni uno ni la semana entera`)
  ok(dias[0] > dias[1], 'el primero tiene que ser el más reciente')
  ok(/^\d{4}-\d{2}-\d{2}$/.test(dias[0]), 'las fechas van en AAAA-MM-DD')
}

/* Y que el que baja los informes deduzca antes de mirar la lista: si no, hay
   que pasar por la carpeta del portal a mano, que es lo que se venía a quitar. */
ok(/async function bajarInformesPendientes\(\)\s*\{\s*await deducirYGuardar\(\)/.test(src),
  'bajarInformesPendientes tiene que deducir primero, o vuelve a depender de que alguien abra la carpeta')

/* ── SACAR LOS ENLACES FIRMADOS DE LA RESPUESTA ───────────────────────────
   La sonda encontro el 14-09-2026 la peticion que los devuelve:

     GET /performance/api/v1/getData ?dataSetId,dsp,from,station,timeFrame,to
     -> { tableData: { dsp_station_weekly_supp_reports: { rows: [ ... ] } } }

   Se buscan POR CONTENIDO y no por esa ruta: si manana `rows` se llama de otra
   forma o la tabla cambia de sitio, esto tiene que seguir encontrandolos. Es
   la leccion de `addresses`, que estaba un nivel mas arriba de donde se
   buscaba y costo veinte versiones (gotcha 64). */
{
  const iU = src.indexOf('function urlsFirmadasDe')
  const jU = src.indexOf('async function pedirEnlacesFrescos')
  ok(iU > 0 && jU > iU, 'no se encuentra urlsFirmadasDe en background.js')
  let urlsFirmadasDe
  if (iU > 0 && jU > iU) {
    // eslint-disable-next-line no-new-func
    urlsFirmadasDe = new Function(`${src.slice(iU, jU)}; return urlsFirmadasDe`)()
  }
  ok(typeof urlsFirmadasDe === 'function', 'urlsFirmadasDe no se ha cargado: no se prueba nada')

  if (urlsFirmadasDe) {
    const FIRMADA = 'https://flex-peer-performance-reports-prod-euamazon.s3.eu-west-1.amazonaws.com'
      + '/es/tdsl/oga5/2026/week-38/ES-TDSL-OGA5-Daily-Report_2026-09-13_Sun.html?X-Amz-Signature=abc'
    // La forma REAL que devolvio el portal.
    const real = { tableData: { dsp_station_weekly_supp_reports: { rows: [FIRMADA] } } }
    ok(urlsFirmadasDe(real).length === 1, 'no saca el enlace de la forma real que vimos')
    ok(urlsFirmadasDe(real)[0] === FIRMADA, 'lo saca cambiado')

    // Y si manana cambia de sitio o de nombre, tiene que seguir saliendo.
    ok(urlsFirmadasDe({ otra: { cosa: [{ x: [FIRMADA] }] } }).length === 1,
      'busca por ruta fija en vez de por contenido: es el gotcha 64 otra vez')

    // Lo que NO es del bucket no se toca: pedir una URL cualquiera del portal
    // con la sesion abierta es hacer algo que nadie pidio.
    ok(urlsFirmadasDe({ a: 'https://logistics.amazon.es/performance' }).length === 0,
      'se cuela una URL que no es del bucket de informes')
    ok(urlsFirmadasDe({ a: 'texto cualquiera', b: 42, c: null }).length === 0,
      'saca cosas que no son URLs')

    // Sin fondo: una respuesta enorme no puede colgar el service worker.
    let hondo = FIRMADA
    for (let i = 0; i < 30; i++) hondo = { x: hondo }
    ok(urlsFirmadasDe(hondo).length === 0, 'no hay tope de profundidad')
  }
}

/* ── NINGUNA FIRMA PUEDE SALIR EN UN DIAGNOSTICO ──────────────────────────
   Las direcciones del portal van FIRMADAS: llevan `X-Amz-Security-Token` y
   `X-Amz-Signature`, o sea una credencial temporal de AWS. El 14-09-2026 una
   acabó guardada en nuestra base porque una rama del diagnóstico mandaba las
   URLs enteras «para ver qué conoce». Caducaba en 30 minutos; da igual: un
   diagnóstico no se lleva credenciales de nadie.
   Aquí se comprueba que todo lo que va a `enviarDiagnostico` pase antes por
   algo que se quede solo con el nombre del fichero. */
{
  const llamadas = src.split('enviarDiagnostico(').slice(1)
    .map((t) => t.slice(0, t.indexOf('});') + 1))
  for (const c of llamadas) {
    /* Solo molesta cuando las claves de `informes` se usan como LISTA. Contar
       cuántas hay (`.length`) no lleva ninguna URL dentro, y marcarlo sería un
       aviso en falso — y un checker que grita en falso deja de leerse, que es
       justo como se cuelan los de verdad. */
    const comoLista = /Object\.keys\(informes\)(?!\.length)/.test(c)
    if (!comoLista) continue
    ok(/\.map\(soloNombre\)/.test(c),
      `las URLs de los informes salen al diagnostico sin recortar —ahi va la firma de AWS—:\n      ${c.replace(/\s+/g, ' ').slice(0, 170)}`)
  }
  // Y la traza de cada intento, que fue la otra puerta.
  ok(/const corto = \(\(u\.split\('\?'\)\[0\]/.test(src),
    'la traza de cada intento vuelve a cortar la URL por el final, que es la firma')
}

/* ── LAS INVESTIGACIONES DE DNR SON OTRO FICHERO DE LA MISMA CARPETA ──────
   `DNR_Investigations_ES-TDSL-OGA5.html` va al lado del Daily Report y se pide
   igual, pero NO lleva fecha en el nombre —es siempre el mismo y Amazon lo
   sobrescribe con las que siguen abiertas—, así que no se puede deducir: o se
   reconoce el enlace tal cual aparece, o no se pide nunca.

   Se ejecuta el `esInforme` DE VERDAD de dsp.js, no una copia (gotcha 40): una
   copia deja de probar el código que corre en cuanto alguien toca el original.
   Y se comprueba que se ha cargado, porque un reconocedor que no llega a
   ejecutarse pasaría en verde sin mirar nada. */
{
  const dsp = readFileSync(new URL('../cortex-extension/dsp.js', import.meta.url), 'utf8')
  const iD = dsp.indexOf('const RE_DIARIO')
  const jD = dsp.indexOf('const pedidos')
  ok(iD > 0 && jD > iD, 'no se encuentra el reconocedor de informes en dsp.js')
  let esInforme
  if (iD > 0 && jD > iD) {
    try {
      esInforme = new Function(`${dsp.slice(iD, jD)}; return esInforme`)()
    } catch (e) { ok(false, `el reconocedor de dsp.js no carga: ${e.message}`) }
  }
  ok(typeof esInforme === 'function',
    'esInforme no se ha cargado: nada de lo de abajo se habría probado')
  if (typeof esInforme === 'function') {
    const O = 'https://logistics.amazon.es/es/tdsl/oga5/2026/week-37'
    ok(esInforme(`${O}/DNR_Investigations_ES-TDSL-OGA5.html`),
      'no se reconoce el fichero de investigaciones: no se pediría nunca')
    ok(esInforme(`${O}/ES-TDSL-OGA5-Daily-Report_2026-09-12_Sat.html`),
      'se ha dejado de reconocer el Daily Report al añadir el de investigaciones')
    /* Y lo que NO es ninguno de los dos se queda fuera: pedir de más es pedir,
       con la sesión de la nave, páginas que no sabemos leer. */
    ok(!esInforme(`${O}/ES-TDSL-OGA5-Week37-Contact-Compliance-report.html`),
      'se reconoce un informe que todavía no sabemos leer')
    ok(!esInforme(`${O}/DNR_Investigations_ES-TDSL-OGA5.pdf`),
      'solo se piden los .html')
  }

  /* Y que al mandarlo se le ponga el TIPO que es. El backend guarda por tipo:
     mandar las investigaciones como 'diario' las metería en el parser del
     Daily Report, que no las reconoce — y se perderían en silencio. */
  // A LA LINEA QUE ES, no a la primera que se llame `tipo`. Buscando solo
  // `const tipo = ` este control cogio una variable nueva de otra funcion y
  // reviento con «r is not defined»: un control que falla por el nombre de
  // una variable ajena no protege nada, solo estorba.
  const iT = src.indexOf('function lectorDe(')
  ok(iT > 0, 'background.js ya no decide el tipo del informe que manda')
  if (iT > 0) {
    const jT = src.indexOf(String.fromCharCode(10) + '}', iT)
    let tipoDe
    try {
      tipoDe = new Function(`${src.slice(iT, jT + 2)}; return lectorDe`)()
    } catch (e) { ok(false, `la decisión del tipo no carga: ${e.message}`) }
    if (tipoDe) {
      ok(tipoDe('https://x/es/tdsl/oga5/2026/week-37/DNR_Investigations_ES-TDSL-OGA5.html') === 'dnr_inv',
        'las investigaciones se mandarían como diario y el backend no las reconocería')
      ok(tipoDe('https://x/es/tdsl/oga5/2026/week-37/ES-TDSL-OGA5-Daily-Report_2026-09-12_Sat.html') === 'diario',
        'el Daily Report ha dejado de mandarse como diario')
      /* Y LO QUE NO SABEMOS LEER NO SE PIDE. Antes todo lo que no fuera
         `DNR_Investigations` se mandaba como 'diario', el backend lo rechazaba
         y el hueco de bajada se perdia — con una firma que caduca en media
         hora, un hueco perdido es un informe que ese dia no entra. Medido el
         15-09-2026: 4 de las 12 bajadas de una vuelta se iban en DWC-IADC, y se
         volvian a pedir en la vuelta siguiente porque cada firma es otra URL. */
      for (const nada of [
        'https://x/es/tdsl/oga5/2026/week-38/ES-TDSL-OGA5-DWC-IADC-Report_2026-38.html',
        'https://x/es/tdsl/oga5/2026/week-37/ES-TDSL-OGA5-Week37-Contact-Compliance-report.html',
        'https://x/es/tdsl/oga5/2026/week-37/ES-TDSL-OGA5-Week37-Customer-Escalation-report.pdf']) {
        ok(tipoDe(nada) === null, `se sigue bajando ${nada.split('/').pop()}, que nadie sabe leer`)
      }
      ok(/sinLector\+\+/.test(src), 'los ficheros sin lector ya no se descartan de la cola')
    }
  }
}

/* ── LOS INFORMES DE LAS TRES NAVES ─────────────────────────────
   El portal firma los enlaces por nave y la peticion que los firma lleva
   `station`. Cambiar ESE parametro —y solo ese— es lo que trae los informes de
   las naves que nadie tiene abiertas. El 15-09-2026 entraban los de OGA5 y DGA2
   y los de DGA1 no llegaban nunca, sin fallar nada.

   Lo que se vigila aqui es que no se toque nada mas de la URL: son peticiones
   firmadas contra el portal de Amazon con la sesion de la oficina, y cambiar de
   mas es pedir cosas que nadie ha pedido. */
{
  const iC = src.indexOf('function conNave')
  const jC = src.indexOf('async function pedirEnlacesFrescos')
  ok(iC > 0 && jC > iC, 'no se encuentra conNave en background.js')
  let conNave
  if (iC > 0 && jC > iC) {
    try { conNave = new Function(`${src.slice(iC, jC)}; return conNave`)() }
    catch (e) { ok(false, `conNave no carga: ${e.message}`) }
  }
  ok(typeof conNave === 'function', 'conNave no se ha cargado: no se prueba nada')
  if (typeof conNave === 'function') {
    const base = 'https://logistics.amazon.es/performance/api/v1/getData'
      + '?dataSetId=dsp_station_weekly_supp_reports&dsp=TDSL&from=2026-09-13'
      + '&station=OGA5&timeFrame=WEEK&to=2026-09-19'
    const salida = conNave(base, 'DGA1')
    ok(salida && salida.includes('station=DGA1'), 'no cambia la nave')
    ok(salida && !salida.includes('station=OGA5'), 'deja la nave vieja dentro')
    // Y NADA MAS cambia: mismo host, misma ruta, mismos demas parametros.
    const a = new URL(base); const b = new URL(salida)
    ok(a.origin === b.origin && a.pathname === b.pathname, 'ha cambiado el destino')
    for (const k of ['dataSetId', 'dsp', 'from', 'timeFrame', 'to']) {
      ok(a.searchParams.get(k) === b.searchParams.get(k), `ha tocado ${k}`)
    }
    // Una URL que no lleva `station` NO se toca: seria pedir a ciegas.
    ok(conNave('https://logistics.amazon.es/performance/api/v1/getData?dsp=TDSL', 'DGA1') === null,
      'toca una URL que no tiene nave')
    ok(conNave('no es una url', 'DGA1') === null, 'no aguanta una URL rota')
  }

  /* Y que la vuelta se haga POR NAVE, no una sola vez. */
  ok(/for \(const nave of naves\)/.test(src),
    'pedirEnlacesFrescos ya no recorre las naves: vuelve a entrar solo la que este abierta')
  ok(/navesDeLaEmpresa/.test(src), 'no pide la lista de naves al backend')
  // Un fallo en una nave no puede dejar sin informe a las demas.
  const iP = src.indexOf('async function pedirEnlacesFrescos')
  // Hasta el final de la funcion, no los primeros 1.800 caracteres: al
  // añadirle el diagnostico de «sin llamada guardada» el `catch` se salio de
  // la ventana y este control empezo a fallar sin que nada estuviera mal.
  const cuerpo = src.slice(iP, src.indexOf(String.fromCharCode(10) + 'async function', iP + 10))
  ok(/catch \(e\) \{\s*traza\.push/.test(cuerpo),
    'un error en una nave tumba la vuelta entera')
}

/* ── LA LLAMADA QUE SE GUARDA TIENE QUE PODER REPETIRSE ──────────────────────
   El 15-09-2026 los informes de DGA1 y DGA2 no entraron NUNCA —cero intentos en
   el historial del backend, mientras los horarios de las tres naves entraban
   sin problema— y la unica pista era `?:TypeError: Failed to fetch` en la
   traza. La causa: la pagina de Amazon pide `getData` con una URL RELATIVA y se
   guardaba tal cual. Desde el service worker una ruta relativa no se puede
   pedir (no hay origen) ni se puede parsear (por eso la nave salia como `?`),
   asi que la vuelta por naves moria antes de empezar.
   Se cierra por los dos lados: quien la captura la deja absoluta, y quien la
   guarda no acepta ninguna que no sirva para lo unico que se le pide —cambiarle
   la nave. */
{
  const portal = readFileSync(new URL('../cortex-extension/portal.js', import.meta.url), 'utf8')
  const fondo = src

  // 1) Al capturarla: absoluta, con el origen de la pagina.
  const iG = portal.indexOf("type: 'llamadaInformes'")
  const alrededor = portal.slice(Math.max(0, iG - 700), iG + 200)
  ok(/new URL\(url, location\.origin\)/.test(alrededor),
    'portal.js guarda la llamada sin origen: relativa no se puede repetir desde el service worker')
  ok(!/type: 'llamadaInformes', url: String\(url\)/.test(portal),
    'portal.js vuelve a mandar la URL en crudo')

  // 2) Al guardarla: solo la que lleva `station`, y solo absoluta.
  let guardar = null
  const iS = fondo.indexOf('async function guardarLlamadaInformes')
  if (iS < 0) ok(false, 'no existe guardarLlamadaInformes')
  else {
    const jS = fondo.indexOf(String.fromCharCode(10) + '}', iS)
    try {
      guardar = new Function('chrome', `${fondo.slice(iS, jS + 2)}; return guardarLlamadaInformes`)(
        { storage: { local: { get: async () => ({}), set: async () => {} } } })
    } catch (e) { ok(false, `guardarLlamadaInformes no carga: ${e.message}`) }
  }
  if (guardar) {
    const buena = 'https://logistics.amazon.es/performance/api/v1/getData'
      + '?dataSetId=x&dsp=TDSL&from=2026-09-13&station=OGA5&timeFrame=WEEK&to=2026-09-19'
    const prueba = async () => {
      ok(await guardar(buena) === true, 'rechaza la llamada buena')
      // La que reventaba todo: relativa.
      ok(await guardar('/performance/api/v1/getData?station=OGA5') === false,
        'acepta una URL relativa: desde el service worker no se puede pedir')
      // Las otras de la misma pantalla, que no firman nada y la pisaban.
      ok(await guardar('https://logistics.amazon.es/performance/api/v1/getPageConfig?page=x') === false,
        'acepta getPageConfig: sin `station` la vuelta por naves se queda en una')
      ok(await guardar('https://logistics.amazon.es/otra/cosa?station=OGA5') === false,
        'acepta algo que no es de /performance/api/')
    }
    await prueba()
  }
}

/* ── SACAR EL ENLACE ESTE DONDE ESTE ────────────────────────────────────────
   `portal.js` decide que una respuesta trae enlaces buscandolos en CUALQUIER
   parte del texto; `urlsFirmadasDe` solo se quedaba con el texto si EMPEZABA
   por la URL. Dos piezas que tienen que estar de acuerdo y no lo estaban: una
   respuesta con el enlace dentro de un trozo de HTML se guardaba como «la
   llamada buena» y luego daba cero enlaces, sin error ninguno. Es el
   `DIC1:0 OGA5:0 DGA1:0 DGA2:0` del 15-09-2026. */
{
  const iU = src.indexOf('function urlsFirmadasDe')
  let sacar = null
  if (iU < 0) ok(false, 'ya no existe urlsFirmadasDe')
  else {
    const jU = src.indexOf(String.fromCharCode(10) + '}', iU)
    try { sacar = new Function(`${src.slice(iU, jU + 2)}; return urlsFirmadasDe`)() }
    catch (e) { ok(false, `urlsFirmadasDe no carga: ${e.message}`) }
  }
  if (sacar) {
    const U = 'https://flex-peer-performance-reports-eu.s3.eu-west-1.amazonaws.com'
      + '/es/tdsl/dga2/2026/week-38/DNR_Investigations_ES-TDSL-DGA2.html'
      + '?X-Amz-Signature=abc123&X-Amz-Expires=1800'
    // Lo que ya funcionaba tiene que seguir funcionando.
    ok(sacar({ rows: [{ url: U }] }).length === 1, 'ha dejado de ver un enlace suelto')
    // Y lo que fallaba: el enlace metido dentro de otra cosa.
    ok(sacar({ rows: [{ html: `<a href="${U}">Descargar</a>` }] })[0] === U,
      'no ve el enlace cuando viene dentro de un trozo de HTML')
    ok(sacar([`ver el informe en ${U} antes del viernes`])[0] === U,
      'no ve el enlace cuando viene dentro de una frase')
    // LAS DOS FORMAS DE ESCAPAR EL `&`. Sin deshacerlas la URL parece buena y
    // devuelve 403, porque la firma se calcula sobre los parametros. Y como una
    // URL firmada solo se intenta UNA vez, ese informe se pierde entero.
    const conAmp = U.replace(/&/g, '&amp;')
    ok(sacar({ a: `<a href="${conAmp}">x</a>` })[0] === U, 'deja el &amp; dentro: la firma no valdria')
    const conJson = U.replace(/&/g, String.fromCharCode(92) + 'u0026')
    ok(sacar({ a: `{"url":"${conJson}"}` })[0] === U, String.fromCharCode(92) + 'u0026 sin deshacer: la firma no valdria')
    // Y no se repite el mismo enlace por salir dos veces en la misma cadena.
    ok(sacar([`${U} y otra vez ${U}`]).length === 1, 'duplica el mismo enlace')
    // Lo que NO es del bucket de informes no se toca.
    ok(sacar({ x: 'https://logistics.amazon.es/performance' }).length === 0, 'se trae URLs que no son informes')
  }
}

/* ── EL REPARTO DE BAJADAS ENTRE NAVES ──────────────────────────────────────
   Doce ficheros por vuelta y una URL firmada que dura media hora. Con una nave
   daba igual; con cuatro, coger «los doce primeros por nombre» se los lleva
   todos la misma nave —la ruta lleva la nave dentro, asi que ordenar agrupa— y
   las otras esperan a la vuelta siguiente con la firma ya caducada. O sea que
   la nave que va detras en el abecedario no baja NUNCA su informe, sin que
   falle nada. Aqui se comprueba que a cada nave le toca algo. */
{
  const iN = src.indexOf('function naveDeLaUrl')
  ok(iN > 0, 'ya no existe naveDeLaUrl: la nave se vuelve a sacar por varios sitios')
  // Y que NO haya vuelto a aparecer una segunda forma de sacarla.
  ok(!src.includes("/tdsl/([a-z0-9]"),
    'vuelve a haber un extractor de nave con el DSP escrito a mano')

  const iB = src.indexOf('const porNave = new Map()')
  ok(iB > 0, 'el reparto por naves ha desaparecido: volveria a llevarselo todo una')
  if (iB > 0 && iN > 0) {
    const jN = src.indexOf(String.fromCharCode(10) + '}', iN)
    const nave = new Function(`${src.slice(iN, jN + 2)}; return naveDeLaUrl`)()
    const jB = src.indexOf('while (pendientes.length < 12', iB)
    const fin = src.indexOf(String.fromCharCode(10) + '  }', jB)
    const cuerpo = `${src.slice(iB, fin + 4)}`
    const hacer = new Function('candidatos', 'informes', 'naveDeLaUrl',
      `${cuerpo} return pendientes`)
    // Cuatro naves con once ficheros cada una: el caso real del 15-09-2026.
    const candidatos = []
    for (const n of ['oga5', 'dga1', 'dga2', 'dic1']) {
      for (let k = 0; k < 11; k++) {
        candidatos.push(`https://b.s3.amazonaws.com/es/tdsl/${n}/2026/week-38/f${k}.html?X-Amz-Signature=s`)
      }
    }
    candidatos.sort().reverse()
    const salen = hacer(candidatos, {}, nave)
    ok(salen.length === 12, `deberia coger 12 y coge ${salen.length}`)
    const naves = new Set(salen.map(nave))
    ok(naves.size === 4, `solo baja de ${naves.size} nave(s) de 4: las demas caducan`)
  }
}

if (fallos.length) {
  console.error(`\n[check-informes-portal] ${fallos.length} problema(s):`)
  for (const f of fallos) console.error('  - ' + f)
  process.exit(1)
}
console.log('[check-informes-portal] ok — la dirección del informe de cada día se deduce bien')
