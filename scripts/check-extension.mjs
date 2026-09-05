/* La extensión de Cortex tiene TRES saltos y cada uno con su lista blanca:
 *
 *     interceptor.js  --post({kind})-->  bridge.js  --sendMessage({type})-->  background.js
 *
 * Si un `kind` nuevo no se da de alta en los tres, el mensaje se pierde SIN
 * ERROR. Pasó el 29-08-2026: el resumen de Cortex —el único sitio que trae los
 * contadores de Amazon, los nombres de los conductores y sus teléfonos— se
 * mandaba, `bridge.js` no lo tenía en su lista y `cortex_resumen` llevaba
 * vacía desde que se montó. Nadie lo vio hasta que los totales no cuadraron.
 *
 * Es el mismo fallo que el gotcha 1 (whitelist de PATCH que descarta en
 * silencio), y como aquel, sólo se caza comprobándolo.
 *
 * Comprueba además que el manifiesto declara los ficheros que existen: una
 * extensión que se reparte a varias naves no puede fallar al cargarse.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', 'cortex-extension')
const leer = (f) => readFileSync(join(RAIZ, f), 'utf8')

const problemas = []

const interceptor = leer('interceptor.js')
const bridge = leer('bridge.js')
const background = leer('background.js')

/* ── 1. interceptor -> bridge ─────────────────────────────────────────── */
const mandaKind = [...interceptor.matchAll(/kind:\s*'([a-z_]+)'/g)].map((m) => m[1])
const recogeKind = [...bridge.matchAll(/d\.kind\s*===\s*'([a-z_]+)'/g)].map((m) => m[1])
for (const k of new Set(mandaKind)) {
  if (!recogeKind.includes(k)) {
    problemas.push(`interceptor manda kind '${k}' y bridge.js no lo recoge: se pierde en silencio`)
  }
}

/* NO HAY CHECKER DE CAMPOS, Y ES A PROPOSITO.
 * El 05-09-2026 se perdio el campo `which` de un `debug`: el interceptor lo
 * mandaba, `bridge.js` no lo copiaba, y el aviso llegaba sin identidad. La
 * tentacion es comprobar que cada campo de cada `post({...})` se reenvia, y se
 * probo: da SEIS avisos en falso, porque hay campos que el puente no reenvia a
 * proposito —`heartbeat` manda `url` y solo se usa `v`— y otros que renombra.
 * Un checker con lista de excepciones no distingue lo nuevo de lo viejo, que es
 * justo lo que aqui no se tolera, asi que mejor ninguno: al anadir un campo,
 * mirar bridge.js Y background.js, como con los `kind`.
 */

/* ── 2. bridge -> background ──────────────────────────────────────────── */
const mandaType = [...bridge.matchAll(/type:\s*'([a-zA-Z]+)'/g)].map((m) => m[1])
const recogeType = [...background.matchAll(/msg\?\.type\s*===\s*'([a-zA-Z]+)'/g)].map((m) => m[1])
for (const t of new Set(mandaType)) {
  if (!recogeType.includes(t)) {
    problemas.push(`bridge manda type '${t}' y background.js no lo recoge: se pierde en silencio`)
  }
}

/* ── 3. el manifiesto apunta a ficheros que existen ───────────────────── */
const manifest = JSON.parse(leer('manifest.json'))
const declarados = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...(manifest.content_scripts || []).flatMap((c) => c.js || []),
].filter(Boolean)
for (const f of declarados) {
  if (!existsSync(join(RAIZ, f))) {
    problemas.push(`manifest.json declara '${f}' y ese fichero no existe: la extensión no carga`)
  }
}

/* ── 4. permisos que el código usa de verdad ──────────────────────────── */
const permisos = new Set(manifest.permissions || [])
const usa = [
  ['alarms', /chrome\.alarms\./],
  ['storage', /chrome\.storage\./],
  ['scripting', /chrome\.scripting\./],
  ['tabs', /chrome\.tabs\./],
]
for (const [permiso, re] of usa) {
  if (re.test(background) && !permisos.has(permiso)) {
    // Pasó de verdad: sin 'alarms' declarado, el service worker se cae al
    // arrancar y la extensión queda muerta sin decir nada.
    problemas.push(`el código usa chrome.${permiso} y el manifiesto no pide ese permiso`)
  }
}

/* ── 5. lo que la extensión APRENDE tiene que sobrevivir al F5 ─────────── */
/* Los estados del informe de direcciones y su plantilla vivían sólo en la
 * memoria del interceptor. Un F5 en Cortex y volvía a pedir únicamente
 * REATTEMPTABLE: los paquetes que van en la furgoneta se quedaban sin
 * `dest_lat/dest_lng` y «Apoyo en ruta» los daba por sin ubicación (medido el
 * 03-09-2026: 68 de 78 paradas de una ruta). No da error, no sale en ningún
 * log: simplemente deja de haber direcciones. Si alguien quita el guardado,
 * que salte aquí y no tres semanas después mirando un mapa vacío. */
if (!/chrome\.storage\.local\.set\(\{\s*informe:/.test(background)) {
  problemas.push('background.js ya no guarda `informe` en chrome.storage: '
    + 'los estados aprendidos se perderán en cada recarga de Cortex')
}
if (!/__flotadspIn/.test(background + bridge + interceptor)) {
  problemas.push('no queda camino de vuelta al interceptor (`__flotadspIn`): '
    + 'lo guardado no se puede recuperar al cargar la página')
}

if (problemas.length) {
  for (const p of problemas) console.error('  ' + p)
  console.error(`\nextensión: ${problemas.length} problema(s).`)
  process.exit(1)
}
console.log(`extensión OK: ${new Set(mandaKind).size} kinds y ${new Set(mandaType).size} types enganchados, v${manifest.version}`)
