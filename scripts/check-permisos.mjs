#!/usr/bin/env node
/* Toda entrada del menu tiene que poder concederse, Y el menu y la ruta
   tienen que decir LO MISMO.
   ═══════════════════════════════════════════════════════════════════════
   El menu filtra cada entrada con `canSee(clave)`, y `canSee` devuelve false
   si la clave no esta en la lista de permisos del usuario. Si una pantalla
   nueva no tiene su casilla en Usuarios.jsx, NADIE puede concederla: la
   entrada desaparece del menu para todo el que tenga permisos definidos, sin
   ningun error, y la ruta tampoco abre porque el guard usa la misma
   comprobacion.

   Ha pasado dos veces:
     · 'ordenes'  (Ordenes de taller) — se arreglo heredando de 'talleres';
     · 'diarios'  (DNR · Diarios)     — Mery tenia las 27 casillas marcadas y
                                        aun asi no lo veia.
   Los dos casos se veian igual desde fuera: "no me sale".

   Y HAY UNA SEGUNDA FORMA DE ROMPERLO, que este checker no cazaba hasta el
   26-08-2026: la excepcion a mano puesta en UN SOLO SITIO. Heredar un
   permiso se escribe dos veces —`if (k === 'x') ...` en `itemVisible` y otra
   vez en `routeAllowed`— y ponerlo solo en el primero deja el menu
   ensenando una entrada que la ruta rechaza: pulsas y te echa a otra
   pantalla. Antes se leian los `k === 'x'` del fichero ENTERO sin mirar en
   que funcion estaban, asi que media excepcion pasaba en verde. Ahora se lee
   cada funcion por separado y se exige que las dos coincidan.

   Se ejecuta con: node scripts/check-permisos.mjs                        */

import { readFileSync } from 'node:fs'

const LAYOUT = 'frontend-v2/src/panel/PanelLayout.jsx'
const USUARIOS = 'frontend-v2/src/panel/pages/Usuarios.jsx'
const AUTH = 'frontend-v2/src/panel/auth.js'

const lee = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

/* Tapa los comentarios con espacios SIN mover ni un caracter de sitio: hace
   falta para contar llaves (un `{` dentro de un comentario descuadraba el
   recuento) pero los indices tienen que seguir valiendo sobre el original. */
const sinComentarios = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))

/* El texto del bloque que empieza en `marca`, equilibrando `abre`/`cierra`.
   Se cuenta sobre la copia sin comentarios y se recorta sobre el original. */
function bloque(original, limpio, marca, abre, cierra) {
  const i = limpio.indexOf(marca)
  if (i < 0) return null
  const desde = i + marca.length - 1
  let n = 0
  for (let j = desde; j < limpio.length; j++) {
    if (limpio[j] === abre) n++
    else if (limpio[j] === cierra && !--n) return original.slice(desde, j + 1)
  }
  return null
}

const layoutRaw = lee(LAYOUT)
const layout = sinComentarios(layoutRaw)
const usuariosRaw = lee(USUARIOS)
const auth = lee(AUTH)

/* La clave de una entrada es el ultimo segmento de su ruta — la misma cuenta
   que hace `keyOf` en PanelLayout. Si eso cambia alli, hay que cambiarlo aqui:
   por eso se comprueba que `keyOf` sigue siendo lo que creemos. */
const keyOfReal = layout.match(/const keyOf = \(to\) => \(to === '\/panel' \? 'dashboard' : to\.split\('\/'\)\.pop\(\)\)/)
if (!keyOfReal) {
  console.error('check-permisos: `keyOf` ha cambiado en PanelLayout.jsx.')
  console.error('Este checker deduce la clave de cada entrada igual que `keyOf`.')
  console.error('Revisa que sigan calculandola de la misma forma y actualiza este script.')
  process.exit(1)
}

/* Las cuatro piezas que hay que leer POR SEPARADO. Si alguna no aparece es
   que PanelLayout se ha reestructurado, y entonces este checker ya no esta
   comprobando lo que cree: mejor romper el CI que dar un verde falso. */
const piezas = {
  'NAV_DEF': bloque(layoutRaw, layout, 'const NAV_DEF = [', '[', ']'),
  'PALETTE_EXTRA': bloque(layoutRaw, layout, 'const PALETTE_EXTRA = [', '[', ']'),
  'itemVisible': bloque(layoutRaw, layout, 'const itemVisible = (it) => {', '{', '}'),
  'routeAllowed': bloque(layoutRaw, layout, 'const routeAllowed = (k) => {', '{', '}'),
}
const faltan = Object.entries(piezas).filter(([, v]) => !v).map(([k]) => k)
if (faltan.length) {
  console.error(`check-permisos: no encuentro ${faltan.join(', ')} en ${LAYOUT}.`)
  console.error('O se han renombrado, o han cambiado de forma. Actualiza este script:')
  console.error('sin leerlos no se puede comprobar que menu y ruta digan lo mismo.')
  process.exit(1)
}

const clavesDe = (txt) => [...new Set(
  [...txt.matchAll(/to:\s*'(\/panel[^']*)'/g)]
    .map((m) => m[1])
    .map((r) => (r === '/panel' ? 'dashboard' : r.replace(/\/+$/, '').split('/').pop())),
)]

// Las del menu de verdad: son las unicas que pasan por `itemVisible`.
const claves = clavesDe(piezas['NAV_DEF'])
// Las que ya no estan en el menu pero se llegan por la paleta o por URL. La
// paleta las filtra con `canSee(key)` directo, sin excepciones a mano.
const clavesPaleta = clavesDe(piezas['PALETTE_EXTRA'])

// Las casillas de la pantalla de Usuarios: ['clave', 'Etiqueta'].
// Solo dentro de MODULES: buscarlas por todo el fichero hacia que cualquier
// otra tupla ['x', 'y'] colase como si fuera un permiso.
const modules = bloque(usuariosRaw, sinComentarios(usuariosRaw), 'const MODULES = [', '[', ']')
if (!modules) {
  console.error(`check-permisos: no encuentro \`const MODULES = [\` en ${USUARIOS}.`)
  process.exit(1)
}
const catalogo = new Set([...modules.matchAll(/\['([a-z0-9_-]+)',\s*'/g)].map((m) => m[1]))

// Las que se ven siempre, sin permiso que valga.
const bloqueSiempre = auth.match(/SIEMPRE_VISIBLES = new Set\(\[([\s\S]*?)\]\)/)
const siempre = new Set(
  bloqueSiempre ? [...bloqueSiempre[1].matchAll(/'([a-z0-9_-]+)'/g)].map((m) => m[1]) : [],
)

/* Las excepciones a mano (`if (k === 'x') ...`), leidas de CADA funcion por
   separado: heredan de otro permiso, son solo de super-admin o son pantallas
   propias del usuario. Que una clave este en una lista y no en la otra es
   precisamente el fallo que buscamos. */
const manualesDe = (txt) => new Set([...txt.matchAll(/k === '([a-z0-9_-]+)'/g)].map((m) => m[1]))
const manualMenu = manualesDe(piezas['itemVisible'])
const manualRuta = manualesDe(piezas['routeAllowed'])

// Una casilla en Usuarios vale para los dos lados: las dos funciones acaban
// cayendo en `canSee(k)`.
const enMenu = (k) => siempre.has(k) || catalogo.has(k) || manualMenu.has(k)
const enRuta = (k) => siempre.has(k) || catalogo.has(k) || manualRuta.has(k)

const huerfanas = claves.filter((k) => !enMenu(k) && !enRuta(k))
// Menu y ruta discrepan: o se ve y no abre, o abre y no se ve.
const asimetricas = claves.filter((k) => !huerfanas.includes(k) && enMenu(k) !== enRuta(k))
// Las de la paleta no pasan por `itemVisible`, pero alguien tiene que poder
// concederlas igual.
const paletaHuerfanas = clavesPaleta.filter((k) => !catalogo.has(k) && !siempre.has(k) && !enRuta(k))

// Al reves: una casilla que no corresponde a ninguna pantalla ni es una
// capacidad conocida solo confunde a quien reparte permisos.
const CAPACIDADES = new Set(['aprobar-dias'])   // permisos que no son pantallas
const sinPantalla = [...catalogo].filter(
  (k) => !claves.includes(k) && !clavesPaleta.includes(k) && !CAPACIDADES.has(k) && !siempre.has(k),
)

console.log(
  `permisos: ${claves.length} entradas de menu (+${clavesPaleta.length} de paleta), ` +
  `${catalogo.size} casillas, ${siempre.size} siempre visibles, ` +
  `${manualMenu.size} excepciones en el menu y ${manualRuta.size} en la ruta`,
)

let mal = false

if (huerfanas.length || paletaHuerfanas.length) {
  mal = true
  console.error('\nENTRADAS QUE NADIE PUEDE CONCEDER:')
  for (const k of [...huerfanas, ...paletaHuerfanas]) console.error(`  · ${k}`)
  console.error(
    '\nQuien tenga permisos definidos NO vera estas pantallas, aunque lo tenga\n' +
    'todo marcado, y la ruta tampoco abrira. Elige una:\n' +
    `  · añade la casilla en ${USUARIOS} (MODULES),\n` +
    '  · o resuelvela a mano en PanelLayout (`if (k === "x") return canSee("otra")`)\n' +
    '    en LOS DOS sitios: `itemVisible` y `routeAllowed`,\n' +
    '  · o metela en SIEMPRE_VISIBLES si de verdad la ve todo el mundo.',
  )
}

if (asimetricas.length) {
  mal = true
  console.error('\nEL MENU Y LA RUTA NO DICEN LO MISMO:')
  for (const k of asimetricas) {
    const donde = enMenu(k)
      ? 'se resuelve en `itemVisible` pero NO en `routeAllowed`: el menu la ensena y al pulsarla te echa'
      : 'se resuelve en `routeAllowed` pero NO en `itemVisible`: la ruta abre pero la entrada no sale en el menu'
    console.error(`  · ${k} — ${donde}`)
  }
  console.error(
    '\nUna excepcion a mano se escribe DOS veces, una en cada funcion. Con media\n' +
    'excepcion el sintoma es el de siempre —"no me sale", "me saca"— y no hay\n' +
    'ningun error en consola que lo explique.',
  )
}

if (mal) process.exit(1)

if (sinPantalla.length) {
  console.log('\nAviso (no bloquea): casillas sin pantalla asociada:')
  for (const k of sinPantalla) console.log(`  · ${k}`)
  console.log('Si no son capacidades, sobran: dan una sensacion falsa de control.')
}

console.log('permisos OK: toda entrada se puede conceder y menu y ruta coinciden')
