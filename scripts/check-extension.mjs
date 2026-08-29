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

if (problemas.length) {
  for (const p of problemas) console.error('  ' + p)
  console.error(`\nextensión: ${problemas.length} problema(s).`)
  process.exit(1)
}
console.log(`extensión OK: ${new Set(mandaKind).size} kinds y ${new Set(mandaType).size} types enganchados, v${manifest.version}`)
