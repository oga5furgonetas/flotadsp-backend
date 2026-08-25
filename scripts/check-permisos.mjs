#!/usr/bin/env node
/* Toda entrada del menu tiene que poder concederse.
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
   Los dos casos se veian igual desde fuera: "no me sale". Este checker los
   habria cazado en el commit.

   Se ejecuta con: node scripts/check-permisos.mjs                        */

import { readFileSync } from 'node:fs'

const LAYOUT = 'frontend-v2/src/panel/PanelLayout.jsx'
const USUARIOS = 'frontend-v2/src/panel/pages/Usuarios.jsx'
const AUTH = 'frontend-v2/src/panel/auth.js'

const lee = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const layout = lee(LAYOUT)
const usuarios = lee(USUARIOS)
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

const claves = [...new Set(
  [...layout.matchAll(/to:\s*'(\/panel[^']*)'/g)]
    .map((m) => m[1])
    .map((r) => (r === '/panel' ? 'dashboard' : r.replace(/\/+$/, '').split('/').pop())),
)]

// Las casillas de la pantalla de Usuarios: ['clave', 'Etiqueta']
const catalogo = new Set(
  [...usuarios.matchAll(/\['([a-z0-9_-]+)',\s*'/g)].map((m) => m[1]),
)

// Las que se ven siempre, sin permiso que valga.
const bloqueSiempre = auth.match(/SIEMPRE_VISIBLES = new Set\(\[([\s\S]*?)\]\)/)
const siempre = new Set(
  bloqueSiempre ? [...bloqueSiempre[1].matchAll(/'([a-z0-9_-]+)'/g)].map((m) => m[1]) : [],
)

/* Las que PanelLayout resuelve a mano (`if (k === 'x') ...`): heredan de otro
   permiso, son solo de super-admin, o son pantallas propias del usuario.
   Se leen del propio fichero para que añadir una excepcion alli baste. */
const manuales = new Set(
  [...layout.matchAll(/k === '([a-z0-9_-]+)'/g)].map((m) => m[1]),
)

const huerfanas = claves.filter(
  (k) => !catalogo.has(k) && !siempre.has(k) && !manuales.has(k),
)

// Al reves: una casilla que no corresponde a ninguna pantalla ni es una
// capacidad conocida solo confunde a quien reparte permisos.
const CAPACIDADES = new Set(['aprobar-dias'])   // permisos que no son pantallas
const sinPantalla = [...catalogo].filter(
  (k) => !claves.includes(k) && !CAPACIDADES.has(k) && !siempre.has(k),
)

console.log(
  `permisos: ${claves.length} entradas de menu, ${catalogo.size} casillas, ` +
  `${siempre.size} siempre visibles, ${manuales.size} resueltas a mano`,
)

if (huerfanas.length) {
  console.error('\nENTRADAS DE MENU QUE NADIE PUEDE CONCEDER:')
  for (const k of huerfanas) console.error(`  · ${k}`)
  console.error(
    '\nQuien tenga permisos definidos NO vera estas pantallas, aunque lo tenga\n' +
    'todo marcado, y la ruta tampoco abrira. Elige una:\n' +
    `  · añade la casilla en ${USUARIOS} (MODULES),\n` +
    '  · o resuelvela a mano en PanelLayout (`if (k === "x") return canSee("otra")`)\n' +
    '    en LOS DOS sitios: `itemVisible` y `routeAllowed`,\n' +
    '  · o metela en SIEMPRE_VISIBLES si de verdad la ve todo el mundo.',
  )
  process.exit(1)
}

if (sinPantalla.length) {
  console.log('\nAviso (no bloquea): casillas sin pantalla asociada:')
  for (const k of sinPantalla) console.log(`  · ${k}`)
  console.log('Si no son capacidades, sobran: dan una sensacion falsa de control.')
}

console.log('permisos OK: toda entrada del menu se puede conceder')
