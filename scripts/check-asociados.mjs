#!/usr/bin/env node
/* LAS CUENTAS DE ASOCIADOS, CON EL INTERCEPTOR REAL CORRIENDO.
 * ═══════════════════════════════════════════════════════════════════════════
 * Por que existe: el 16-09-2026 la pantalla decia que Lois Barreiro «no tiene
 * cuenta» teniendola hecha (11 de 14). Buscando el motivo aparecieron DOS
 * fallos encadenados, los dos silenciosos, y ninguno se veia leyendo el codigo:
 *
 *   1. LA HUELLA. Para no mandar la lista cada vez que la tabla se repinta se
 *      guardaba `personas.length + ':' + (...).join('').length` — una LONGITUD.
 *      Dos respuestas distintas con el mismo numero de personas daban la misma
 *      huella y la segunda se tiraba ENTERA. Preguntando por correo, que
 *      devuelve una persona por respuesta, la huella habria sido la misma para
 *      todo el mundo y solo habria entrado el primero.
 *   2. EL TAMANO DE PAGINA. Se pedian paginas de 250 «para ir mas rapido».
 *      Amazon devuelve 100 pidas lo que pidas, y la regla de «si vuelve
 *      incompleta era la ultima» leyo esos 100 como el final: el barrido se
 *      paraba en la primera pagina. 100 personas de 10.000, sin un solo error.
 *
 * Se ejecuta el fichero REAL en una ventana de mentira, igual que
 * check-interceptor-ahorro.mjs, y se mira lo que sale hacia el bridge.
 * Probado reintroduciendo los dos fallos.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', 'cortex-extension')
const fuente = readFileSync(join(RAIZ, 'interceptor.js'), 'utf8')
const portal = readFileSync(join(RAIZ, 'portal.js'), 'utf8')
const fallos = []
const ok = (cond, msg) => { if (!cond) fallos.push(msg) }

const URL_BUSCAR = 'https://logistics.amazon.es/account-management/data/search-providers'

const persona = (id, nombre, correo, area) => ({
  providerId: id,
  fullName: nombre,
  emailAddress: correo,
  operationalStatus: 'ONBOARDING',
  onboardingWorkflowState: 'IN_PROGRESS',
  serviceAreaIds: [area],
  moduleStatusMap: { A: 'Complete', B: 'Complete', C: 'Pending' },
})

const respuesta = (personas, total) => ({ data: { resultList: personas, totalResults: total } })

function arrancar() {
  const mensajes = []
  let cuerpo = null
  const respuestaFalsa = (obj) => {
    const texto = JSON.stringify(obj)
    const r = {
      ok: true,
      status: 200,
      url: URL_BUSCAR,
      headers: {
        get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json'
          : k.toLowerCase() === 'content-length' ? String(texto.length) : null),
      },
      text: () => Promise.resolve(texto),
      json: () => Promise.resolve(JSON.parse(texto)),
    }
    r.clone = () => r
    return r
  }
  const href = 'https://logistics.amazon.es/account-management/delivery-associates'
  const win = {
    __flotadspCortexHooked: false,
    location: { href, origin: new URL(href).origin, pathname: new URL(href).pathname },
    postMessage: (m) => mensajes.push(m),
    addEventListener: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    fetch: () => Promise.resolve(respuestaFalsa(cuerpo)),
    XMLHttpRequest: function () {},
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    performance: { now: () => Date.now() },
    document: {
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      documentElement: {},
      body: {},
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
    servir: (obj) => { cuerpo = obj },
    pedir: () => win.fetch(URL_BUSCAR),
  }
}

const genteDe = (mensajes) => mensajes
  .filter((m) => m && m.kind === 'asociados' && Array.isArray(m.personas))
  .flatMap((m) => m.personas)

const respirar = () => new Promise((r) => setImmediate(r))

/* ── 1. Dos busquedas por correo, dos personas ─────────────────────────────
   Es EXACTAMENTE la forma que tiene ahora: una respuesta, una persona. */
{
  const w = arrancar()
  w.servir(respuesta([persona('P1', 'Lois Barreiro Figueira', 'loibarfig@winiw.es', 'VAD4')], 1))
  await w.pedir(); await respirar()
  w.servir(respuesta([persona('P2', 'Eddy Nazareno Ordonez', 'eddnazord@winiw.es', 'OGA5')], 1))
  await w.pedir(); await respirar()

  const gente = genteDe(w.mensajes)
  ok(gente.length === 2,
    'dos busquedas por correo tenian que dar dos personas y dieron ' + gente.length
    + ' — la huella tira a los siguientes, que es por lo que a Lois se le veia «sin cuenta»')
  ok(gente.some((p) => p.correo === 'loibarfig@winiw.es'), 'falta la primera')
  ok(gente.some((p) => p.correo === 'eddnazord@winiw.es'), 'falta la segunda')
}

/* ── 2. La misma persona dos veces NO se manda dos veces ───────────────────
   Lo que la huella venia a evitar sigue evitandose: repintar no manda nada. */
{
  const w = arrancar()
  const uno = respuesta([persona('P1', 'Lois Barreiro Figueira', 'loibarfig@winiw.es', 'VAD4')], 1)
  w.servir(uno); await w.pedir(); await respirar()
  w.servir(uno); await w.pedir(); await respirar()
  ok(genteDe(w.mensajes).length === 1,
    'la misma respuesta dos veces tiene que mandarse una sola: se esta repitiendo')
}

/* ── 3. Si alguien AVANZA, se vuelve a mandar ──────────────────────────────
   Un onboarding que pasa de 2/3 a 3/3 es justo de lo que hay que enterarse. */
{
  const w = arrancar()
  const antes = persona('P1', 'Lois Barreiro Figueira', 'loibarfig@winiw.es', 'VAD4')
  w.servir(respuesta([antes], 1)); await w.pedir(); await respirar()
  const ahora = JSON.parse(JSON.stringify(antes))
  ahora.moduleStatusMap.C = 'Complete'
  w.servir(respuesta([ahora], 1)); await w.pedir(); await respirar()
  const gente = genteDe(w.mensajes)
  ok(gente.length === 2, 'alguien que avanza tiene que volver a mandarse y no se mando')
  ok((gente[1] || {}).hechos === 3, 'se mando, pero con lo de antes')
}

/* ── 4. Personas distintas con ids del mismo largo ─────────────────────────
   Es el caso exacto que la huella por LONGITUD confundia. */
{
  const w = arrancar()
  w.servir(respuesta([persona('AAAA1111', 'Ana Perez Lopez', 'anaperlop@winiw.es', 'OGA5')], 2))
  await w.pedir(); await respirar()
  w.servir(respuesta([persona('BBBB2222', 'Ana Perez Lopez', 'anaperlop2@winiw.es', 'OGA5')], 2))
  await w.pedir(); await respirar()
  ok(genteDe(w.mensajes).length === 2,
    'dos personas con ids del mismo largo: la segunda se perdia')
}

/* ── 5. EL TAMANO DE PAGINA lo manda la pantalla, no nosotros ──────────────
   Pedir 250 no trae 250: Amazon devuelve 100 y el barrido se creia acabado. */
{
  ok(!/POR_PAGINA/.test(portal),
    'vuelve a haber un tamano de pagina propio: Amazon devuelve 100 pidas lo que pidas,'
    + ' y entonces «pagina incompleta» se lee como «ultima pagina» en la primera vuelta')
  ok(/const tam = suyo/.test(portal),
    'el tamano de pagina tiene que ser el que usa la propia pantalla')
  ok(/totalResults/.test(portal),
    'sin mirar cuantas dice Amazon que hay no se puede saber cuando parar')
}

/* ── 6. Se pregunta por los NUESTROS, por correo ───────────────────────────
   Es lo que hace que aparezca quien esta en otra nave, como Lois (Madrid). */
{
  ok(/email: correo/.test(portal), 'ya no se pregunta por correo')
  ok(/seguidos_pedir/.test(portal), 'no pide la lista de a quien seguimos')
  const puente = readFileSync(join(RAIZ, 'bridge.js'), 'utf8')
  ok(/seguidos_pedir/.test(puente) && /kind: 'seguidos'/.test(puente),
    'el puente no relaya la lista: el mensaje se tiraria en silencio (lista blanca)')
  const fondo = readFileSync(join(RAIZ, 'background.js'), 'utf8')
  ok(/seguidosPedir/.test(fondo), 'el service worker no contesta a quien seguimos')
}

/* ── 7. LA VUELTA POR CORREO, CON EL portal.js REAL ────────────────────────
   El 16-09-2026 corrio con la 2.89 y no dejo NI UN rastro: solo avisaba al
   terminar, y la siguiente peticion se lanzaba en `load`, que no salta si la
   anterior falla por red. Una sola caida paraba la cadena en silencio. */
function arrancarPortal() {
  const mensajes = []
  const oyentes = []
  const timers = []
  const enviadas = []
  function XHR() { this._l = {}; this.responseText = ''; this.responseType = ''; this.status = 0 }
  XHR.prototype.open = function (m, u) { this._m = m; this._u = u }
  XHR.prototype.setRequestHeader = function () {}
  XHR.prototype.addEventListener = function (ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn) }
  XHR.prototype.send = function (body) { this._body = body; enviadas.push(this) }
  const href = 'https://logistics.amazon.es/account-management/delivery-associates'
  const win = {
    location: { href, origin: 'https://logistics.amazon.es', pathname: '/account-management/delivery-associates' },
    postMessage: (m) => mensajes.push(m),
    addEventListener: (ev, fn) => { if (ev === 'message') oyentes.push(fn) },
    removeEventListener: (ev, fn) => { const i = oyentes.indexOf(fn); if (i >= 0) oyentes.splice(i, 1) },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length },
    clearTimeout: () => {},
    setInterval: () => 0,
    fetch: () => new Promise(() => {}),
    XMLHttpRequest: XHR,
    document: {
      querySelectorAll: () => [], querySelector: () => null, addEventListener: () => {},
      documentElement: { outerHTML: '' }, body: {}, readyState: 'loading',
    },
    MutationObserver: function () { this.observe = () => {} },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    URL, JSON, Date, Math, RegExp, Number, String, Array, Object, Promise, Set, Map,
  }
  win.window = win
  win.self = win
  win.globalThis = win
  vm.createContext(win)
  vm.runInContext(portal, win, { filename: 'portal.js' })
  /* Como el navegador: `load` solo si hubo respuesta, `loadend` SIEMPRE. */
  const responder = (x, obj, status) => {
    x.status = status
    x.responseText = obj ? JSON.stringify(obj) : ''
    if (obj) for (const fn of x._l.load || []) fn.call(x)
    for (const fn of x._l.loadend || []) fn.call(x)
  }
  const correr = () => { const t = timers.splice(0); for (const { fn } of t) fn() }
  // La pagina pide su propia lista, como hace al abrirse.
  const x = new win.XMLHttpRequest()
  x.open('POST', '/account-management/data/search-providers')
  x.send(JSON.stringify({ providerType: 'DA', searchStart: 0, searchSize: 100 }))
  responder(x, { data: { resultList: [{ providerId: 'x' }], totalResults: 1 } }, 200)
  const contestar = (correos) => {
    for (const fn of [...oyentes]) fn({ data: { __flotadspIn: true, kind: 'seguidos', correos, nombres: [] } })
  }
  const porCorreo = () => enviadas.filter((e) => /"email"/.test(e._body || ''))
  const avisos = () => mensajes.filter((m) => /^asociados-correo-/.test(m.which || ''))
  return { mensajes, contestar, porCorreo, responder, correr, avisos }
}

/* 7a. Una peticion que falla a mitad NO para a las demas. */
{
  const p = arrancarPortal()
  p.contestar(['a@winiw.es', 'loibarfig@winiw.es', 'c@winiw.es'])
  for (let v = 0; v < 12; v++) {
    for (const e of p.porCorreo()) {
      if (e._hecha) continue
      e._hecha = true
      if (/a@winiw/.test(e._body)) p.responder(e, null, 0)          // corte de red
      else p.responder(e, { data: { resultList: /loibarfig/.test(e._body) ? [{ providerId: 'L' }] : [] } }, 200)
    }
    p.correr()
  }
  ok(p.porCorreo().length === 3,
    'una peticion caida paro la cadena: se preguntaron ' + p.porCorreo().length + ' de 3'
    + ' (la siguiente se lanza en `load`, que no salta si la anterior falla)')
  const fin = p.avisos().find((m) => m.which === 'asociados-correo-3-fin')
  ok(!!fin, 'la vuelta por correo no dijo como acabo')
  ok(fin && /con_cuenta=1 /.test(fin.url) && /fallidas=1/.test(fin.url),
    'el resumen no separa «tiene cuenta», «no la tiene» y «la peticion no volvio»: ' + (fin && fin.url))
  ok(p.avisos().some((m) => m.which === 'asociados-correo-1-pide'),
    'no avisa al arrancar: «no arranco» y «se atasco» se verian igual')
}

/* 7b. Si el service worker no contesta, se reintenta y se DICE. */
{
  const p = arrancarPortal()
  for (let v = 0; v < 10; v++) p.correr()
  const pedidas = p.mensajes.filter((m) => m.kind === 'seguidos_pedir').length
  ok(pedidas > 1, 'si el worker no contesta a la primera no se vuelve a pedir la lista')
  ok(p.avisos().some((m) => m.which === 'asociados-correo-x-sin-respuesta'),
    'el worker no contesto nunca y no quedo ningun aviso: es el silencio del 16-09-2026')
}

/* 7c. Y el puente, si falla, lo apunta. */
{
  const puente = readFileSync(join(RAIZ, 'bridge.js'), 'utf8')
  ok(/asociados-correo-x-puente/.test(puente),
    'el puente vuelve a tragarse el `lastError` sin decir nada')
}

if (fallos.length) {
  console.error('\nasociados: ' + fallos.length + ' fallos\n')
  for (const f of fallos) console.error('  - ' + f)
  console.error('')
  process.exit(1)
}
console.log('asociados OK: las cuentas llegan una a una, sin perder a nadie y sin repetir')
