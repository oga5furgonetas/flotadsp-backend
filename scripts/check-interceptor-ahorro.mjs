#!/usr/bin/env node
/* EL INTERCEPTOR ENTERO, CORRIENDO DE VERDAD, CON UNA VENTANA DE MENTIRA.
 * ═══════════════════════════════════════════════════════════════════════════
 * Por qué existe:
 *
 * El 14-09-2026 se optimizó el barrido para que dejara de comerse el PC de la
 * oficina, y dos de los tres cambios tocan el camino por el que entran TODOS
 * los paquetes:
 *
 *   · `route-details` pasa a parsearse del flujo (`.json()`) en vez de montar
 *     una cadena de 0,8 MB y parsearla después. Dentro de `emit`, eso deja el
 *     `text` vacío, y ahí hay tres comprobaciones que miran el texto. Si una
 *     se porta distinto, se dejan de capturar paquetes **sin que falle nada**:
 *     el panel se queda con los de ayer y nadie se entera hasta el día
 *     siguiente. Es exactamente lo que pasó con `addresses` y costó ~20
 *     versiones a ciegas.
 *   · una respuesta con el mismo `content-length` que la anterior ya no se
 *     abre. Si eso se pasara de listo, una ruta viva se congelaría.
 *
 * Así que aquí no se prueba una función suelta: se ejecuta el fichero REAL
 * dentro de una ventana falsa, se le meten respuestas por el `fetch` que él
 * mismo engancha, y se mira lo que manda al bridge. Es la primera vez que se
 * puede saber si el interceptor captura sin instalarlo en un navegador.
 *
 * Probado reintroduciendo los fallos: quitando el `yaParseado` de `comoObjeto`
 * y quitando la guarda de `FORZAR_LECTURA` falla uno por cada uno.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', 'cortex-extension')
const fuente = readFileSync(join(RAIZ, 'interceptor.js'), 'utf8')
const fallos = []
const ok = (cond, msg) => { if (!cond) fallos.push(msg) }

/* Una respuesta de route-details con la forma REAL: `addresses` y
 * `transporters` son HERMANOS de `rmsRouteDetails`, no hijos (gotcha 64). */
const respuesta = (nEntregados) => ({
  rmsRouteDetails: {
    routeId: '7624078-2',
    transporters: [{ transporterId: 'A1TRANSP' }],
    stops: Array.from({ length: 3 }, (_, i) => ({
      stopId: `s${i}`,
      tasks: [{
        taskState: i < nEntregados ? 'DELIVERED' : 'LOADED',
        referenceId: `ref${i}`,
        addressId: `addr${i}`,
        domainMap: { scannableId: `TBA30${i}999999` },
      }],
    })),
  },
  addresses: [
    { addressId: 'addr0', address1: 'Rua Isaac Peral 14', city: 'Santiago', geocode: { latitude: 42.87, longitude: -8.54 } },
    { addressId: 'addr1', address1: 'Rua do Vilar 2', city: 'Santiago', geocode: { latitude: 42.88, longitude: -8.55 } },
    { addressId: 'addr2', address1: 'Praza Galicia 1', city: 'Santiago', geocode: { latitude: 42.86, longitude: -8.53 } },
  ],
  transporters: [{ transporterId: 'A1TRANSP', firstName: 'Iago', lastName: 'Barreiro', workPhoneNumber: '600111222' }],
})

const URL_RUTA = 'https://logistics.amazon.es/operations/execution/api/route-details/7624078-2?historicalDay=false&routeId=7624078-2&serviceAreaId=abc'

/* Monta una ventana de mentira y ejecuta el interceptor dentro. Devuelve el
 * `fetch` ya enganchado y la lista de mensajes que salen hacia el bridge. */
function arrancar() {
  const mensajes = []
  let cuerpoServido = null      // lo que devolverá el fetch falso
  let lecturasDeCuerpo = 0      // cuántas veces se ha abierto de verdad

  const respuestaFalsa = (obj, largo) => {
    const texto = JSON.stringify(obj)
    const leer = () => { lecturasDeCuerpo += 1; return texto }
    const r = {
      ok: true, status: 200, url: URL_RUTA,
      headers: { get: (k) => (k.toLowerCase() === 'content-length' ? String(largo)
                            : k.toLowerCase() === 'content-type' ? 'application/json' : null) },
      text: () => Promise.resolve(leer()),
      json: () => Promise.resolve(JSON.parse(leer())),
    }
    r.clone = () => r
    return r
  }

  const win = {
    __flotadspCortexHooked: false,
    location: { href: 'https://logistics.amazon.es/operations/execution?serviceAreaId=abc', origin: 'https://logistics.amazon.es' },
    postMessage: (m) => mensajes.push(m),
    addEventListener: () => {},
    // Nada de relojes: el barrido no debe arrancar solo dentro del test.
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    fetch: () => Promise.resolve(respuestaFalsa(cuerpoServido.obj, cuerpoServido.largo)),
    XMLHttpRequest: function () {},
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    performance: { now: () => Date.now() },
    document: {
      querySelectorAll: () => [], querySelector: () => null,
      addEventListener: () => {}, documentElement: {}, body: {},
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    URL, JSON, Date, Math, RegExp, Number, String, Array, Object, Promise, Set, Map,
  }
  win.window = win
  win.self = win
  win.globalThis = win
  win.XMLHttpRequest.prototype = { open() {}, send() {}, setRequestHeader() {}, addEventListener() {} }

  vm.createContext(win)
  vm.runInContext(fuente, win, { filename: 'interceptor.js' })

  return {
    mensajes,
    servir: (obj, largo) => { cuerpoServido = { obj, largo } },
    pedir: () => win.fetch(URL_RUTA),
    lecturas: () => lecturasDeCuerpo,
  }
}

const paquetesDe = (mensajes) => mensajes
  .filter((m) => m && m.kind === 'cortex' && Array.isArray(m.packages))
  .flatMap((m) => m.packages)

/* ── 1. Se capturan los paquetes, con dirección y conductor ─────────────── */
{
  const w = arrancar()
  w.servir(respuesta(1), 5000)
  await w.pedir()
  await new Promise((r) => setImmediate(r))
  const paq = paquetesDe(w.mensajes)
  ok(paq.length === 3, `tenían que salir 3 paquetes y salieron ${paq.length}`)
  const uno = paq[0] || {}
  ok(!!uno.tba, 'un paquete sin TBA no sirve para nada')
  ok(!!(uno.dest_lat || uno.address), 'se perdió el destino: es el gotcha 64 otra vez')
}

/* ── 2. La misma respuesta DOS veces: la segunda ni se abre ─────────────── */
{
  const w = arrancar()
  w.servir(respuesta(1), 5000)
  await w.pedir(); await new Promise((r) => setImmediate(r))
  await w.pedir(); await new Promise((r) => setImmediate(r))
  const tras2 = w.lecturas()
  await w.pedir(); await new Promise((r) => setImmediate(r))
  ok(tras2 === 2, `la 2ª aún se lee (hace falta verla repetida una vez): ${tras2}`)
  ok(w.lecturas() === 2, `la 3ª respuesta idéntica NO debía abrirse; lecturas=${w.lecturas()}`)
}

/* ── 3. Si la respuesta CAMBIA de tamaño, se lee y se captura ───────────── */
{
  const w = arrancar()
  w.servir(respuesta(1), 5000)
  await w.pedir(); await new Promise((r) => setImmediate(r))
  await w.pedir(); await new Promise((r) => setImmediate(r))
  await w.pedir(); await new Promise((r) => setImmediate(r))   // esta se salta
  const antes = w.lecturas()
  w.servir(respuesta(3), 5400)                                  // la ruta se ha movido
  await w.pedir(); await new Promise((r) => setImmediate(r))
  ok(w.lecturas() === antes + 1, 'una ruta que cambia de tamaño TIENE que volver a leerse')
}

/* ── 4. Aunque no cambie nunca, se lee entera cada FORZAR_LECTURA ───────── */
{
  const forzar = Number((fuente.match(/const FORZAR_LECTURA = (\d+)/) || [])[1] || 0)
  ok(forzar > 0 && forzar <= 20, `FORZAR_LECTURA fuera de rango: ${forzar}`)
  const w = arrancar()
  w.servir(respuesta(1), 5000)
  for (let i = 0; i < forzar + 4; i++) { await w.pedir(); await new Promise((r) => setImmediate(r)) }
  ok(w.lecturas() >= 3,
    'sin relectura forzada, una ruta podría quedarse congelada para siempre y en silencio')
}

/* ── 5. Los frenos siguen puestos (que nadie los suba sin querer) ───────── */
{
  const pausa = Number((fuente.match(/const PAUSA_ENTRE = (\d+)/) || [])[1] || 0)
  const tope = Number((fuente.match(/acotar\(rutaGets, (\d+)\)/) || [])[1] || 0)
  ok(pausa >= 20000, `PAUSA_ENTRE en ${pausa} ms: por debajo de 20 s el barrido encadena sin respirar`)
  ok(tope > 0 && tope <= 200, `el tope de rutas (${tope}) vuelve a acumular días`)
  ok(/rutaGets\.clear\(\)/.test(fuente), 'falta el olvido al cambiar de día: la lista crece sin fin')
  ok(/const PAUSA_DORMIDA/.test(fuente), 'falta la pausa larga de cuando no se mueve nada')
}

if (fallos.length) {
  console.error(`\n[check-interceptor-ahorro] ${fallos.length} problema(s):`)
  for (const f of fallos) console.error('  - ' + f)
  process.exit(1)
}
console.log('[check-interceptor-ahorro] ok — captura lo mismo, y no abre lo que no ha cambiado')
