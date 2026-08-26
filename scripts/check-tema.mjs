#!/usr/bin/env node
/* El modo híbrido tiene que seguir al modo día.
   ═══════════════════════════════════════════════════════════════════════
   Hay tres temas de panel y dos comparten casi todo:

     · noche    — la rampa `--dk-*` por defecto, todo oscuro
     · día      — la rampa invertida en <html>: TODO en claro, raíl incluido
     · híbrido  — la misma rampa invertida pero solo sobre <main>, así el
                  raíl y la cabecera se quedan negros

   La inversión de la rampa no lo cubre todo: hay texto `slate` pensado para
   fondo oscuro, vidrio `white/xx` y pasteles 300/400 que sobre papel no se
   leen. Para eso están las reglas de compensación del modo día, y el
   híbrido necesita EXACTAMENTE LAS MISMAS acotadas a <main>.

   El riesgo es silencioso: alguien arregla un color en el modo día, se
   olvida del híbrido, y el híbrido se queda con el color viejo. No falla
   nada, no avisa nadie, y solo se nota mirando la pantalla con calma —
   que es justo lo que no se hace cuando se va con prisa.

   Este checker compara las dos listas y falla si alguna regla del modo día
   no tiene su gemela en el híbrido.

   Se ejecuta con: node scripts/check-tema.mjs                            */

import { readFileSync } from 'node:fs'

const CSS = 'frontend-v2/src/index.css'
const css = readFileSync(new URL(`../${CSS}`, import.meta.url), 'utf8')

/* Las reglas del CROMO son las que el híbrido NO debe copiar: son
   precisamente las que deben seguir en oscuro. */
const CROMO = ['.atmosphere', '.rail', '.nav-item', '.nav-ghead', '.shimmer',
  'scrollbar', '::-webkit', ' body', '* {']

const selectores = (marca) => {
  const out = new Set()
  const re = new RegExp(`html\\[data-panel-theme='${marca}'\\]([^,{\\n]*)`, 'g')
  let m
  while ((m = re.exec(css)) !== null) {
    const sel = m[1].trim()
    if (!sel) continue                       // el bloque de variables
    const limpio = sel.replace(/^main\s*/, '')  // el híbrido lleva `main` delante
    if (!limpio) continue                    // `main` a secas = su bloque de variables
    out.add(limpio)
  }
  return out
}

const dia = [...selectores('light')].filter((s) => !CROMO.some((c) => s.includes(c.trim())))
const hib = selectores('hibrido')

const faltan = dia.filter((s) => !hib.has(s))
const sobran = [...hib].filter((s) => !dia.includes(s))

console.log(`tema: ${dia.length} reglas de contenido en modo día, ${hib.size} en híbrido`)

if (faltan.length) {
  console.error('\nREGLAS DEL MODO DÍA QUE EL HÍBRIDO NO TIENE:')
  for (const s of faltan) console.error(`  · ${s}`)
  console.error(
    '\nEl modo híbrido se quedará con el color viejo en esas, sin avisar.\n' +
    `Añádelas en ${CSS} con el prefijo:\n` +
    "  html[data-panel-theme='hibrido'] main <selector> { ... }\n" +
    'O, si de verdad son del raíl y deben seguir oscuras, mételas en CROMO\n' +
    'aquí arriba con un comentario que diga por qué.',
  )
  process.exit(1)
}

if (sobran.length) {
  console.log('\nAviso (no bloquea): reglas del híbrido sin pareja en modo día:')
  for (const s of sobran) console.log(`  · ${s}`)
}

console.log('tema OK: el híbrido cubre todas las compensaciones del modo día')
