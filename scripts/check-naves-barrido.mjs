#!/usr/bin/env node
/* TODAS LAS NAVES DESDE UNA PESTANA, CON EL INTERCEPTOR REAL CORRIENDO.
 * ═══════════════════════════════════════════════════════════════════════════
 * Por que existe: el 16-09-2026 se midio que solo entraban paquetes de la nave
 * que alguien tuviera abierta en Cortex. OGA5 con datos de hoy, DGA1 sin nada
 * desde el 27-08 (66.930 paquetes y luego cero) y DGA2 desde el 11-08. Una
 * nave nueva habria estado vacia para siempre salvo que alguien dejara una
 * pestana abierta en ella.
 *
 * Ahora una pestana barre todas las naves de la empresa. Lo que se prueba aqui
 * no es que pida mas cosas, sino que NO MEZCLE: cinco sitios usaban el area o el
 * centro de la pestana, y con rutas de otra nave cada uno corrompia algo sin un
 * solo error —los paquetes de DGA1 contados en OGA5, el resumen de DGA1 pisando
 * el de OGA5 del dia, la pestana creyendose en DGA1—.
 *
 * El parser suelto (centro y area de cada paquete) lo prueba check-destinos.mjs;
 * esto prueba el barrido: que peticiones salen y con que etiqueta vuelve cada
 * cosa. Probado reintroduciendo los fallos.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', 'cortex-extension')
const fuente = readFileSync(join(RAIZ, 'interceptor.js'), 'utf8')
const fallos = []
const ok = (cond, msg) => { if (!cond) fallos.push(msg) }

const ORIGEN = 'https://logistics.amazon.es'
const SA_OGA5 = '10ef2406-a250-45ce-8fa5-639099edff1a'
const SA_DGA1 = '2bf00778-6e51-40de-ad52-15c62e4892b9'
const RUTA = { [SA_OGA5]: { id: '7000001-1', code: 'XA_C1' }, [SA_DGA1]: { id: '8000002-2', code: 'CA_A2' } }
const saDe = (u) => { try { return new URL(u, ORIGEN).searchParams.get('serviceAreaId') } catch (_) { return null } }

const resumen = (sa) => ({
  rmsRouteSummaries: [{
    routeId: RUTA[sa].id, routeCode: RUTA[sa].code, transporterIdFromRms: 'T' + RUTA[sa].code,
    routeStatus: 'IN_PROGRESS', routeDeliveryProgress: { totalTasks: 2, completedTasks: 1 },
  }],
  transporters: [{ transporterId: 'T' + RUTA[sa].code, firstName: 'Ana', lastName: RUTA[sa].code }],
})

// El detalle SIN area dentro: el peor caso, el que obliga a usar la de la peticion.
const detalle = (id) => ({
  rmsRouteDetails: {
    routeId: id,
    routeCode: id === RUTA[SA_DGA1].id ? RUTA[SA_DGA1].code : RUTA[SA_OGA5].code,
    stops: [{
      addressId: 'a1', status: 'NOT_STARTED',
      tasks: [{ taskType: 'DELIVERY', taskState: 'DELIVERED', addressId: 'a1',
                domainMap: { scannableId: 'TBA' + id.replace(/\D/g, '').slice(0, 9).padEnd(9, '0') } }],
    }],
  },
  addresses: [{ addressId: 'a1', address1: 'Rua 1', geocode: { latitude: 42.5, longitude: -8.5 } }],
  transporters: [],
})

function arrancar() {
  const mensajes = []
  const oyentes = []
  const timers = []
  const pedidas = []
  const responder = (url) => {
    const u = new URL(url, ORIGEN)
    let obj = {}
    if (/route-summaries/.test(u.pathname)) obj = RUTA[saDe(url)] ? resumen(saDe(url)) : { rmsRouteSummaries: [] }
    else if (/route-details\/([^/?]+)/.test(u.pathname)) obj = detalle(u.pathname.match(/route-details\/([^/?]+)/)[1])
    const texto = JSON.stringify(obj)
    const r = {
      ok: true, status: 200, url,
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json'
        : k.toLowerCase() === 'content-length' ? String(texto.length) : null) },
      text: () => Promise.resolve(texto),
      json: () => Promise.resolve(JSON.parse(texto)),
    }
    r.clone = () => r
    return r
  }
  const href = `${ORIGEN}/operations/execution/routes?serviceAreaId=${SA_OGA5}`
  const win = {
    __flotadspCortexHooked: false,
    location: { href, origin: ORIGEN, pathname: '/operations/execution/routes', search: `?serviceAreaId=${SA_OGA5}` },
    postMessage: (m) => { mensajes.push(m) },
    addEventListener: (ev, fn) => { if (ev === 'message') oyentes.push(fn) },
    removeEventListener: () => {},
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length },
    clearTimeout: () => {},
    setInterval: () => 0,
    fetch: (url) => { pedidas.push(String(url)); return Promise.resolve(responder(String(url))) },
    XMLHttpRequest: function () {},
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    performance: { now: () => Date.now() },
    document: { querySelectorAll: () => [], querySelector: () => null, addEventListener: () => {},
                documentElement: {}, body: {}, title: '' },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    URL, JSON, Date, Math, RegExp, Number, String, Array, Object, Promise, Set, Map,
  }
  win.window = win
  win.self = win
  win.globalThis = win
  win.XMLHttpRequest.prototype = { open() {}, send() {}, setRequestHeader() {}, addEventListener() {} }
  vm.createContext(win)
  vm.runInContext(fuente, win, { filename: 'interceptor.js' })
  // El `window` que ve el codigo DENTRO del contexto: los oyentes comparan
  // `ev.source` con el, como en la pagina de verdad.
  const ventana = vm.runInContext("window", win)
  return { win, ventana, mensajes, oyentes, timers, pedidas }
}

const respirar = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)) }

const w = arrancar()
// 1. La pagina pide el resumen de SU nave, como hace al abrirse.
await w.win.fetch(`${ORIGEN}/operations/execution/api/route-summaries?historicalDay=false&localDate=2026-09-16&serviceAreaId=${SA_OGA5}`)
await respirar()
// 2. El puente le da las areas de la empresa.
for (const fn of [...w.oyentes]) {
  fn({ source: w.ventana, data: { __flotadspIn: true, kind: 'areas_cortex',
                              areas: [{ sa: SA_OGA5, centro: 'OGA5' }, { sa: SA_DGA1, centro: 'DGA1' }] } })
}
// 3. Vueltas de sobra para que haya al menos dos con resumenes (1.ª y 6.ª).
for (let v = 0; v < 200; v++) {
  const t = w.timers.splice(0)
  for (const { fn } of t) { try { fn() } catch (_) {} }
  await respirar()
}

const resumenesDga1 = w.pedidas.filter((u) => /route-summaries/.test(u) && saDe(u) === SA_DGA1)
ok(resumenesDga1.length > 0, 'no se pide el resumen de las otras naves: solo entraria la de la pestaña')

const detallesDga1 = w.pedidas.filter((u) => u.includes(`route-details/${RUTA[SA_DGA1].id}`))
ok(detallesDga1.length > 0, 'las rutas de la otra nave no se piden')
ok(detallesDga1.every((u) => saDe(u) === SA_DGA1),
  'una ruta de DGA1 se pide con el area de la pestaña: ' + (detallesDga1.find((u) => saDe(u) !== SA_DGA1) || ''))

// La pestaña NO cambia de nave: su propio resumen se sigue pidiendo con SU area.
// Cada vuelta con extras pide el suyo, tambien DESPUES de haber pedido el de
// DGA1: si la pestaña se quedara con esa URL, la segunda ya no seria de OGA5.
const resumenesPropios = w.pedidas.filter((u) => /route-summaries/.test(u) && saDe(u) === SA_OGA5)
const vueltasConExtras = w.mensajes.filter((m) => m && m.which === 'vuelta' && /extras/.test(m.url)).length
ok(vueltasConExtras >= 2, 'el arnes no llego a dar dos vueltas con resumenes (' + vueltasConExtras + '): no prueba nada')
ok(resumenesPropios.length >= 1 + vueltasConExtras,
  'tras pedir el resumen de DGA1 la pestaña deja de pedir el suyo (' + resumenesPropios.length + ' de '
  + (1 + vueltasConExtras) + '): se ha quedado con la URL de la otra nave')

// Y la pestaña sigue sabiendo que es de OGA5: el informe de faltas (las
// direcciones de los reintentos) se pide para SU nave. Si «aprendiera» su nave
// de una ruta de DGA1, empezaria a pedirlo para DGA1 sin avisar.
const informes = w.pedidas.filter((u) => /packagesByStatus/.test(u))
ok(informes.length > 0, 'el arnes no llego a pedir el informe de faltas: no prueba nada')
ok(informes.every((u) => saDe(u) === SA_OGA5),
  'la pestaña se ha creido de otra nave: pide el informe de faltas con ' + (informes.find((u) => saDe(u) !== SA_OGA5) || ''))

// Cada resumen, guardado con SU area. Si no, el de DGA1 pisa el de OGA5 del dia.
const resumenes = w.mensajes.filter((m) => m && m.kind === 'resumen_cortex')
const mal = resumenes.find((m) => (m.datos && JSON.stringify(m.datos).includes(RUTA[SA_DGA1].code)) && m.sa !== SA_DGA1)
ok(resumenes.some((m) => m.sa === SA_DGA1), 'el resumen de DGA1 no se manda con su area')
ok(!mal, 'el resumen de DGA1 se manda con el area de OGA5: pisaria el resumen de OGA5 de ese dia')

// Los paquetes de DGA1, con SU area y SU centro. Nunca con los de la pestaña.
const paquetes = w.mensajes.filter((m) => m && m.kind === 'cortex').flatMap((m) => m.packages || [])
const deDga1 = paquetes.filter((p) => p.route_code === RUTA[SA_DGA1].code)
ok(deDga1.length > 0, 'no llega ningun paquete de la otra nave')
ok(deDga1.every((p) => p.service_area_id === SA_DGA1 && p.center !== 'OGA5'),
  'un paquete de DGA1 llega como ' + JSON.stringify(deDga1.find((p) => p.service_area_id !== SA_DGA1 || p.center === 'OGA5') || {}))

// Y lo dice.
const aviso = w.mensajes.find((m) => m && m.which === 'naves-barrido')
ok(!!aviso && /DGA1: 1 rutas/.test(aviso.url), 'no avisa de cuantas rutas encuentra por nave: ' + (aviso ? aviso.url : 'sin aviso'))

// El puente y el service worker tienen su parte: sin ellas la lista no llega.
const puente = readFileSync(join(RAIZ, 'bridge.js'), 'utf8')
ok(/areas_pedir/.test(puente) && /kind: 'areas_cortex'/.test(puente),
  'el puente no le pasa las areas a la pagina: el barrido se quedaria en una nave')
const fondo = readFileSync(join(RAIZ, 'background.js'), 'utf8')
ok(/areasCortex/.test(fondo), 'el service worker no guarda las areas de la empresa')

if (fallos.length) {
  console.error('\nnaves-barrido: ' + fallos.length + ' fallos\n')
  for (const f of fallos) console.error('  - ' + f)
  console.error('')
  process.exit(1)
}
console.log('naves-barrido OK: una pestaña barre todas las naves y cada cosa vuelve con su nave')
