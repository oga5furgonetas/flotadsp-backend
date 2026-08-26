#!/usr/bin/env node
/* Toda pantalla del menú tiene que explicarse.
   ═══════════════════════════════════════════════════════════════════════
   Hay 30 pantallas y se siguen añadiendo. Quien entra nuevo no tiene forma
   de saber para qué sirve cada una, y quien lleva meses se encuentra
   módulos que no estaban.

   El riesgo no es escribir la ayuda: es OLVIDARSE la próxima vez. Una
   pantalla nueva sin ficha no falla, no avisa, y solo se nota cuando
   alguien abre el `?` y se encuentra un hueco — normalmente delante de la
   persona a la que estabas enseñando la app.

   Es el mismo patrón que ya mordió dos veces con los permisos (gotcha 27):
   algo que hay que acordarse de hacer a mano, y que nadie comprueba.

   Este checker compara las entradas del menú con las fichas de ayuda.js.

   Se ejecuta con: node scripts/check-ayuda.mjs                            */

import { readFileSync } from 'node:fs'

const LAYOUT = 'frontend-v2/src/panel/PanelLayout.jsx'
const AYUDA = 'frontend-v2/src/panel/ayudaFichas.js'

const lee = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const layout = lee(LAYOUT)
const ayuda = lee(AYUDA)

/* La clave de una entrada es el último segmento de su ruta, igual que hace
   `keyOf` en PanelLayout y que el checker de permisos. */
const claves = [...new Set(
  [...layout.matchAll(/to:\s*'(\/panel[^']*)'/g)]
    .map((m) => m[1])
    .map((r) => (r === '/panel' ? 'dashboard' : r.replace(/\/+$/, '').split('/').pop())),
)]

/* Las fichas: claves de primer nivel del objeto AYUDA, con o sin comillas. */
const bloque = ayuda.match(/export const AYUDA = \{([\s\S]*?)\n\}/)
if (!bloque) {
  console.error('check-ayuda: no encuentro `export const AYUDA = {` en ayuda.js.')
  process.exit(1)
}
const fichas = new Set(
  [...bloque[1].matchAll(/^\s{2}'?([a-z0-9_-]+)'?:\s*\{/gm)].map((m) => m[1]),
)

const sinFicha = claves.filter((k) => !fichas.has(k))
const sobran = [...fichas].filter((k) => !claves.includes(k))

console.log(`ayuda: ${claves.length} entradas de menú, ${fichas.size} fichas escritas`)

/* Una ficha vacía es peor que ninguna: quien la lee se lleva la impresión de
   que la ayuda no sirve y no vuelve a abrirla. */
const flojas = [...fichas].filter((k) => {
  const m = bloque[1].match(new RegExp(`^\\s{2}'?${k}'?:\\s*\\{([\\s\\S]*?)^\\s{2}\\},`, 'm'))
  if (!m) return false
  const que = m[1].match(/que:\s*'([^']*)'/)
  return !que || que[1].trim().length < 25
})

if (sinFicha.length) {
  console.error('\nPANTALLAS DEL MENÚ SIN FICHA DE AYUDA:')
  for (const k of sinFicha) console.error(`  · ${k}`)
  console.error(
    `\nQuien abra el "?" en esas pantallas verá un hueco.\n` +
    `Añade la ficha en ${AYUDA}:\n` +
    "  clave: { que: 'para qué sirve, en una línea',\n" +
    "           pasos: ['lo que hace una persona un martes'],\n" +
    "           ojo: 'lo que confunde de verdad — solo si existe' }",
  )
  process.exit(1)
}

if (flojas.length) {
  console.error('\nFICHAS CON UN `que` DEMASIADO CORTO PARA SERVIR DE ALGO:')
  for (const k of flojas) console.error(`  · ${k}`)
  console.error('\nUna ficha vacía quema la confianza en todas las demás.')
  process.exit(1)
}

if (sobran.length) {
  console.log('\nAviso (no bloquea): fichas sin entrada en el menú:')
  for (const k of sobran) console.log(`  · ${k}`)
  console.log('Puede ser una pantalla retirada, o una clave mal escrita.')
}

console.log('ayuda OK: toda pantalla del menú se explica')
