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

if (fallos.length) {
  console.error(`\n[check-informes-portal] ${fallos.length} problema(s):`)
  for (const f of fallos) console.error('  - ' + f)
  process.exit(1)
}
console.log('[check-informes-portal] ok — la dirección del informe de cada día se deduce bien')
