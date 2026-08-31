#!/usr/bin/env node
/* Un componente no puede llevar las clases de un tema y montarse en el otro.
   ═══════════════════════════════════════════════════════════════════════
   El panel va oscuro, pero hay pantallas que van en CLARO a propósito
   —Órdenes de taller es la única hoy: es la que se mira al lado de un
   taller, a veces al sol, y a veces se imprime—.

   Cuando un componente escrito para el panel oscuro (`text-dark-100`,
   `bg-dark-900`, `card`) se monta dentro de una de esas pantallas, pinta
   TEXTO CLARO SOBRE FONDO CLARO. No falla, no avisa: simplemente no se lee.

   Pasó el 31-08-2026 con `PautaTaller`, que entró en Órdenes de taller con
   53 clases del tema oscuro. Se vio contando clases, no mirando la pantalla
   — y estaba a horas de que lo abrieran dos empresas nuevas.

   `check-contraste.mjs` no lo pilla porque mide pares texto/fondo dentro de
   un mismo fichero, y aquí el fondo lo pone el padre.

   Se ejecuta con: node scripts/check-tema-mezclado.mjs                   */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGS = join(RAIZ, 'frontend-v2', 'src', 'panel', 'pages')
const COMPS = join(RAIZ, 'frontend-v2', 'src', 'panel', 'components')

/* Pantallas que van en claro. Se listan a mano y no se detectan solas: que
   una pantalla vaya en claro es una DECISIÓN, y si se adivinara por las
   clases que tenga, un fichero a medio migrar cambiaría de bando solo. */
const EN_CLARO = new Set(['OrdenesTrabajo.jsx'])

// Clases que solo se leen sobre fondo oscuro.
const OSCURAS = /\b(?:text|bg|border|ring|divide)-dark-\d{2,3}\b|\bbtn-primary\b|\bbrand-tinta\b|className="card[\s"]/g

const lee = (p) => { try { return readFileSync(p, 'utf8') } catch { return '' } }

let fallos = 0
for (const pag of EN_CLARO) {
  const src = lee(join(PAGS, pag))
  if (!src) {
    console.log(`AVISO: ${pag} no existe. ¿Se ha renombrado? Actualiza EN_CLARO.`)
    continue
  }

  // Qué componentes propios importa esa pantalla.
  const importados = [...src.matchAll(/from\s+'\.\.\/components\/(\w+)'/g)].map((m) => m[1])
  const sospechosos = [{ nombre: pag, ruta: join(PAGS, pag) },
    ...importados.map((n) => ({ nombre: `${n}.jsx`, ruta: join(COMPS, `${n}.jsx`) }))]

  for (const { nombre, ruta } of sospechosos) {
    const txt = lee(ruta)
    if (!txt) continue
    const encontradas = [...new Set(txt.match(OSCURAS) || [])]
    if (!encontradas.length) continue
    fallos++
    console.log(`\n  ${basename(ruta)} usa ${encontradas.length} clase(s) de tema OSCURO`)
    console.log(`  pero se monta en ${pag}, que va en CLARO:`)
    console.log(`     ${encontradas.slice(0, 8).join('  ')}`)
    console.log(`  → texto claro sobre fondo claro: no se lee.`)
  }
}

if (!fallos) {
  console.log(`tema-mezclado OK: los componentes de las ${EN_CLARO.size} pantalla(s) ` +
              `en claro no arrastran clases del tema oscuro`)
  process.exit(0)
}
console.log(`\nFALLO: ${fallos} fichero(s) con el tema equivocado.`)
console.log('Cámbialas por sus equivalentes claras (text-slate-700, bg-white,')
console.log('border-slate-200…) o saca el componente de esa pantalla.')
process.exit(1)
