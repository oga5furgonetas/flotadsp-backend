// El catalogo de modulos por empresa (MODULOS_PANEL en server.py) y el menu
// del panel (NAV_DEF en PanelLayout.jsx) tienen que coincidir.
// Una pantalla del menu que no este en el catalogo no se puede activar a
// ninguna empresa y desaparece para todas en silencio (gotcha 27); una clave
// del catalogo que no este en el menu es una casilla que no hace nada.
// Uso: node scripts/check-modulos.mjs  (sale con codigo 1 si no cuadran)
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const layout = fs.readFileSync(path.join(RAIZ, 'frontend-v2/src/panel/PanelLayout.jsx'), 'utf8')
const server = fs.readFileSync(path.join(RAIZ, 'backend/server.py'), 'utf8')

// Solo las lineas VIVAS del menu (las comentadas no cuentan).
const ini = layout.indexOf('const NAV_DEF = [')
const fin = layout.indexOf('\n]\n', ini) > 0 ? layout.indexOf('\n]\n', ini) : layout.indexOf('\n]\r\n', ini)
const menu = layout.slice(ini, fin).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const enMenu = new Set([...menu.matchAll(/to: '\/panel(?:\/([a-z0-9-]+))?'/g)].map((m) => m[1] || 'dashboard'))
// Del negocio de FlotaDSP, no de la flota del cliente: nunca se activa.
enMenu.delete('tienda')

const bloque = server.slice(server.indexOf('MODULOS_PANEL = ['), server.indexOf('_MODULOS_CLAVES ='))
const enCatalogo = new Set([...bloque.matchAll(/"clave": "([a-z0-9-]+)"/g)].map((m) => m[1]))
const estandar = server.match(/MODULOS_ESTANDAR = \[([\s\S]*?)\]/)
const enEstandar = estandar ? [...estandar[1].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]) : []

const problemas = []
if (enMenu.size < 10) problemas.push(`solo se han leido ${enMenu.size} entradas del menu: el checker no ve el menu`)
if (enCatalogo.size < 10) problemas.push(`solo se han leido ${enCatalogo.size} modulos del catalogo`)
for (const k of enMenu) if (!enCatalogo.has(k)) problemas.push(`«${k}» esta en el menu y no en MODULOS_PANEL: ninguna empresa podria verla`)
for (const k of enCatalogo) if (!enMenu.has(k)) problemas.push(`«${k}» esta en MODULOS_PANEL y no en el menu`)
for (const k of enEstandar) if (!enCatalogo.has(k)) problemas.push(`«${k}» esta en MODULOS_ESTANDAR y no en el catalogo`)

if (problemas.length) {
  console.log('MODULOS DESCUADRADOS:')
  for (const p of problemas) console.log('  ' + p)
  process.exit(1)
}
console.log(`Modulos OK: ${enMenu.size} pantallas en el menu, todas activables; estandar ${enEstandar.length}.`)
