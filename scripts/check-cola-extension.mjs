/* La cola de la extension: que no pierda nada y que no escriba de mas.
   ══════════════════════════════════════════════════════════════════════════
   POR QUE. El ordenador de la oficina se arrastraba con Cortex abierto, y no
   era leer la API: era `enqueue`. Cada respuesta capturada leia la cola ENTERA
   de `chrome.storage.local`, la fundia y la reescribia ENTERA —mas `recuento`,
   que la recorre otra vez y escribe, mas tres lecturas sueltas y el
   `setState`—. Seis idas y venidas al almacen por respuesta, dos de ellas
   serializando toda la cola. Y el barrido recaptura TODAS las rutas cada
   minuto: unas cincuenta respuestas seguidas.

   Ahora se acumula en memoria y se vuelca al llegar al lote o al segundo de
   calma. Lo que hay que vigilar de un buffer es justo lo que se comprueba
   aqui, y son dos cosas distintas:

     · QUE NO PIERDA NADA. Un paquete que entra tiene que acabar en la cola,
       incluso el que llega mientras se esta escribiendo el volcado anterior.
     · QUE DE VERDAD ESCRIBA MENOS. Si el ahorro no se mide, no existe: se
       cuentan las escrituras al almacen y se exige que sean muchas menos que
       las respuestas capturadas.

   Se ejecuta el `background.js` DE VERDAD con un `chrome` de mentira (gotcha
   40): una copia de la logica dejaria de probar el codigo que corre.
*/
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const aqui = dirname(fileURLToPath(import.meta.url))
const FUENTE = join(aqui, '..', 'cortex-extension', 'background.js')

function montar() {
  const almacen = { queue: {} }
  const cuenta = { get: 0, set: 0, setQueue: 0, fetch: 0 }
  const oyentes = {}
  const chrome = {
    storage: {
      local: {
        async get(def) {
          cuenta.get++
          const claves = typeof def === 'string' ? [def] : Array.isArray(def) ? def : Object.keys(def || {})
          const out = {}
          for (const k of claves) out[k] = k in almacen ? almacen[k] : (def && !Array.isArray(def) ? def[k] : undefined)
          return out
        },
        async set(obj) {
          cuenta.set++
          if ('queue' in obj) cuenta.setQueue++
          Object.assign(almacen, obj)
        },
      },
    },
    alarms: { create() {}, onAlarm: { addListener(f) { oyentes.alarma = f } } },
    runtime: {
      onMessage: { addListener(f) { oyentes.mensaje = f } },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onSuspend: { addListener(f) { oyentes.suspender = f } },
      getManifest: () => ({ version: '0.0.0' }),
      id: 'test',
    },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {}, setTitle() {} },
    tabs: { query: async () => [], sendMessage: async () => {},
            onUpdated: { addListener() {} } },
    scripting: { executeScript: async () => [] },
  }
  const ctx = {
    chrome, console: { log() {}, warn() {}, error() {} },
    fetch: async () => { cuenta.fetch++; return { ok: true, status: 200, json: async () => ({}), text: async () => '' } },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval,
    crypto: globalThis.crypto, Date, JSON, Object, Array, Map, Set, Promise, String, Number, Math,
url: '', URL,
  }
  ctx.globalThis = ctx
  vm.createContext(ctx)
  vm.runInContext(readFileSync(FUENTE, 'utf8'), ctx)
  return { ctx, almacen, cuenta, oyentes }
}

const paquete = (i) => ({ tba: 'TBA' + String(i).padStart(9, '0'), center: 'OGA5', state: 'DELIVERED' })
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

let fallos = 0
const mal = (m) => { console.error('  MAL: ' + m); fallos++ }

async function pruebaNoPierdeNada() {
  const { ctx, almacen, cuenta, oyentes } = montar()
  // 50 respuestas de 20 paquetes, como un barrido: 1.000 paquetes distintos.
  for (let r = 0; r < 50; r++) {
    const lote = []
    for (let i = 0; i < 20; i++) lote.push(paquete(r * 20 + i))
    await new Promise((ok) => oyentes.mensaje({ type: 'cortexPackages', packages: lote }, {}, ok))
  }
  await espera(1300)             // que salte el volcado por calma
  const enCola = Object.keys(almacen.queue || {}).length
  if (enCola !== 1000) mal(`se han perdido paquetes: ${enCola} de 1000 en la cola`)
  else console.log(`  ok - los 1.000 paquetes estan en la cola`)
  console.log(`  ok - escrituras de la cola: ${cuenta.setQueue} para 50 respuestas`)
  if (cuenta.setQueue > 12) mal(`escribe la cola ${cuenta.setQueue} veces: el buffer no esta agrupando`)
  if (!ctx) mal('sin contexto')
}

async function pruebaVuelcaAlSuspender() {
  const { almacen, oyentes } = montar()
  await new Promise((ok) => oyentes.mensaje({ type: 'cortexPackages', packages: [paquete(1)] }, {}, ok))
  if (Object.keys(almacen.queue || {}).length) mal('ha escrito antes de tiempo, sin agrupar nada')
  await oyentes.suspender()      // MV3 apaga el worker
  await espera(50)
  if (Object.keys(almacen.queue || {}).length !== 1) {
    mal('al suspenderse el worker se ha perdido lo que habia en memoria')
  } else console.log('  ok - al suspenderse, lo pendiente se escribe')
}

console.log('cola de la extension:')
await pruebaNoPierdeNada()
await pruebaVuelcaAlSuspender()
if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1) }
console.log('\ncola OK: no pierde paquetes y agrupa las escrituras')
