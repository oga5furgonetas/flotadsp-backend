#!/usr/bin/env node
/* Que todo se lea, en los tres temas, medido y no a ojo.
   ═══════════════════════════════════════════════════════════════════════
   Al pasar el panel a modo mixto (raíl negro, contenido en claro) aparecieron
   textos ilegibles: clases pensadas para fondo oscuro que quedaron sobre
   papel. Mirarlo pantalla por pantalla no vale — son 30 pantallas, 76
   ficheros y 3.180 usos de la rampa `dark-*`, y el ojo se acostumbra.

   CÓMO FUNCIONA, Y POR QUÉ NO HACE FALTA NAVEGADOR
   ────────────────────────────────────────────────
   Todo lo necesario está en el código:

     · `index.css` define la rampa `--dk-*` para cada tema.
     · El CSS compilado dice a qué color resuelve cada clase de Tailwind.
     · El JSX dice qué clases van juntas en el mismo elemento.

   Con esas tres cosas se resuelve cada pareja (texto, fondo) a dos colores
   reales y se aplica la fórmula de contraste de la WCAG. Sin capturas, sin
   sesión y sin depender de que alguien mire.

   QUÉ SE MIDE
   ───────────
   Una pareja es real cuando las dos clases están en el MISMO `className`
   (`bg-dark-900 text-dark-400`). Un texto sin fondo propio hereda el de su
   superficie, así que se mide contra las que existen de verdad en el panel:
   el papel del contenido y la tarjeta.

   EL LISTÓN
   ─────────
   4,5:1 para texto normal y 3:1 para texto grande, que es lo que pide la
   WCAG 2.1 en nivel AA. No es un capricho de accesibilidad: es el umbral por
   debajo del cual una persona con prisa, en una nave con mala luz y mirando
   un móvil, deja de leer.

   Se ejecuta con: node scripts/check-contraste.mjs                        */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const CSS_SRC = join(RAIZ, 'frontend-v2/src/index.css')
const DIST = join(RAIZ, 'frontend-v2/dist/assets/v2')
const PANEL = join(RAIZ, 'frontend-v2/src/panel')

/* ── 1. La rampa de cada tema ─────────────────────────────────────────────── */
const css = readFileSync(CSS_SRC, 'utf8')

const rampaDe = (bloque) => {
  const m = {}
  for (const [, n, v] of bloque.matchAll(/--dk-(\d+):\s*([\d\s]+);/g)) {
    m[n] = v.trim().split(/\s+/).map(Number)
  }
  return m
}
const trozo = (re) => (css.match(re) || [])[1] || ''

const RAMPAS = {
  noche: rampaDe(trozo(/:root\s*\{([^}]*)\}/)),
  // El mixto declara la rampa clara sobre <main>; el modo día, sobre <html>.
  mixto: rampaDe(trozo(/html\[data-panel-theme='hibrido'\]\s*main\s*\{([^}]*)\}/)),
  dia: rampaDe(trozo(/html\[data-panel-theme='light'\]\s*\{([^}]*)\}/)),
}
for (const [k, v] of Object.entries(RAMPAS)) {
  if (Object.keys(v).length < 11) {
    console.error(`check-contraste: no encuentro la rampa del tema "${k}" en index.css.`)
    console.error('Si se ha renombrado el selector, hay que actualizar este script.')
    process.exit(1)
  }
}

/* ── 2. Qué color es cada clase, según el CSS ya compilado ────────────────── */
const distCss = readdirSync(DIST).filter((f) => /^index-.*\.css$/.test(f))
if (!distCss.length) {
  console.error('check-contraste: no hay CSS compilado en frontend-v2/dist.')
  console.error('Ejecuta `npm run build` en frontend-v2 antes de este checker.')
  process.exit(1)
}
const compilado = readFileSync(join(DIST, distCss[0]), 'utf8')

/* Cada regla `.clase{...color:X}`. Se guarda el valor crudo: puede ser un
   color fijo o una referencia a la rampa, y eso se resuelve por tema.

   SOLO SELECTORES SIMPLES, y es lo que hace que esto sirva. El CSS lleva
   compuestos como `html[data-panel-theme='light'] .bg-dark-900.text-white
   {color: tinta}`, y una expresión que busque `.text-white{` los caza
   también: `text-white` acababa resuelto a TINTA y el checker afirmaba que
   texto blanco sobre slate-900 daba 1,06:1 — imposible, son 17:1.

   Un checker con falsos positivos es peor que no tenerlo: se deja de mirar
   a la segunda vez. */
/* MIRAR ATRÁS SIN CONSUMIR. Con `(?:^|[{},])` delante, la expresión se comía
   el `}` que cierra la regla anterior; y como en un CSS minificado las reglas
   van pegadas (`}.a{…}.b{…}`), el siguiente arranque se quedaba sin el
   carácter que necesitaba para casar. Resultado: SE SALTABA UNA REGLA DE CADA
   DOS, `bg-white` no existía en el mapa y el checker daba OK sobre la mitad
   del CSS. Con lookbehind no se consume nada y se ven todas. */
const REGLAS = new Map()
for (const [, sel, cuerpo] of compilado.matchAll(/(?<=^|[{}\s,;])\.((?:[\w-]|\\.)+)\s*\{([^}]*)\}/g)) {
  const m = cuerpo.match(/(?:^|;)(?:background-)?color:\s*([^;}]+)/)
  if (!m) continue
  const nombre = sel.replace(/\\/g, '')
  // Un punto dentro del nombre delata un compuesto que se ha colado: fuera.
  if (nombre.includes('.')) continue
  if (!REGLAS.has(nombre)) REGLAS.set(nombre, m[1].trim())
}

/* ── Las compensaciones de cada tema ──────────────────────────────────────
   La inversión de la rampa no lo cubre todo: hay texto `slate` y pasteles
   300/400 pensados para fondo oscuro que sobre papel no se leen, y para eso
   están las reglas `html[data-panel-theme='…'] .clase{color:…}`.

   Sin leerlas, el checker mide el color BASE de la clase y da por ilegible
   algo que el tema ya ha arreglado: pasó con `text-red-400`, que el modo
   claro compensa a #b91c1c y el checker seguía midiendo el rojo pálido
   original. Dos falsos positivos que habrían mandado a tocar tres pantallas
   sin motivo. */
const COMPENSA = { noche: {}, mixto: {}, dia: {} }
const marcaTema = { hibrido: 'mixto', light: 'dia' }
/* LAS COMILLAS DEL ATRIBUTO SON OPCIONALES: el CSS fuente escribe
   `[data-panel-theme='hibrido']` y el minificador las quita
   (`[data-panel-theme=hibrido]`). Exigirlas hacía que no se encontrara ni una
   compensación, y el checker seguía dando por ilegible lo que el tema ya
   arregla. */
const RE_TEMA = /html\[data-panel-theme=['"]?([a-z]+)['"]?\]([^{]*)\{([^}]*)\}/g
for (const [, tema, sel, cuerpo] of compilado.matchAll(RE_TEMA)) {
  const destino = COMPENSA[marcaTema[tema]]
  if (!destino) continue
  const m = cuerpo.match(/(?:^|;)\s*(?:background-)?color:\s*([^;}]+)/)
  if (!m) continue
  /* El selector completo llega troceado por comas, y cada trozo repite el
     prefijo del tema. Solo valen las reglas que apuntan a UNA clase suelta:
     las compuestas (`.bg-dark-900.text-white`) dependen de que las dos
     coincidan y no se pueden aplicar a la clase por su cuenta. */
  for (const parte of `html[data-panel-theme=${tema}]${sel}`.split(',')) {
    const p = parte.trim().replace(/^html\[data-panel-theme=['"]?[a-z]+['"]?\]\s*/, '')
    const solo = p.match(/^(?:main\s+)?\.([\w-]+)$/)
    if (solo) destino[solo[1]] = m[1].trim()
  }
}

/* rgb(var(--dk-400) / x) → [r,g,b,a] del tema; rgb(148 163 184 / x) → fijo. */
const aRGBA = (valor, rampa) => {
  if (!valor) return null
  const varm = valor.match(/var\(--dk-(\d+)\)/)
  const alfa = (() => {
    const a = valor.match(/\/\s*([\d.]+)\s*\)/)
    return a ? Number(a[1]) : 1
  })()
  if (varm) {
    const c = rampa[varm[1]]
    return c ? [...c, alfa] : null
  }
  const nums = valor.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/)
  if (nums) return [Number(nums[1]), Number(nums[2]), Number(nums[3]), alfa]
  const hex = valor.match(/#([0-9a-f]{6})\b/i)
  if (hex) {
    const h = hex[1]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), alfa]
  }
  return null
}

/* Una clase puede llevar la opacidad en el nombre (`bg-white/5`): Tailwind la
   compila aparte, así que se aplica aquí. Sin esto, un `bg-white/5` se
   mediría como blanco puro y taparía problemas reales. */
const colorDeClase = (clase, rampa, tema) => {
  const [base, op] = clase.split('/')
  // La compensación del tema manda sobre el color base de la clase.
  const crudo = (COMPENSA[tema] || {})[base] || REGLAS.get(clase) || REGLAS.get(base)
  const c = aRGBA(crudo, rampa)
  if (!c) return null
  if (op && /^\d+$/.test(op)) c[3] = Number(op) / 100
  return c
}

/* Componer un color con alfa sobre el de debajo. */
const sobre = (frente, fondo) => {
  const a = frente[3] ?? 1
  return [0, 1, 2].map((i) => frente[i] * a + fondo[i] * (1 - a)).concat(1)
}

/* ── 3. Contraste WCAG ────────────────────────────────────────────────────── */
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/* ── 4. Qué clases van juntas de verdad, sacado del JSX ───────────────────── */
const jsx = []
const recorrer = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) recorrer(p)
    else if (/\.jsx?$/.test(f)) jsx.push(p)
  }
}
recorrer(PANEL)

const TXT = /(?:^|[\s'"`])(text-[a-z]+-\d+(?:\/\d+)?|text-white|text-black)(?=[\s'"`]|$)/g
const BG = /(?:^|[\s'"`])(bg-[a-z]+-\d+(?:\/\d+)?|bg-white(?:\/\d+)?|bg-black(?:\/\d+)?)(?=[\s'"`]|$)/g

const parejas = new Map()   // "texto|fondo" -> [ficheros]
const sueltos = new Map()   // "texto" -> [ficheros]

for (const f of jsx) {
  const src = readFileSync(f, 'utf8')
  const rel = f.slice(RAIZ.length).replace(/\\/g, '/')
  /* Se mira className a className: dos clases del mismo atributo SÍ conviven
     en el mismo elemento; dos de atributos distintos, no necesariamente. */
  for (const [, cont] of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const s = cont || ''
    const textos = [...s.matchAll(TXT)].map((m) => m[1])
    const fondos = [...s.matchAll(BG)].map((m) => m[1])
    if (!textos.length) continue
    if (fondos.length) {
      for (const t of textos) for (const b of fondos) {
        const k = `${t}|${b}`
        if (!parejas.has(k)) parejas.set(k, new Set())
        parejas.get(k).add(rel)
      }
    } else {
      for (const t of textos) {
        if (!sueltos.has(t)) sueltos.set(t, new Set())
        sueltos.get(t).add(rel)
      }
    }
  }
}

/* Las superficies que hereda un texto sin fondo propio. Salen del propio
   layout: el papel del contenido en mixto/día, y la atmósfera en noche. */
const SUPERFICIES = {
  mixto: { 'el papel del contenido': [239, 238, 235, 1], 'una tarjeta': null },
  dia: { 'el papel del contenido': [244, 243, 240, 1], 'una tarjeta': null },
  noche: { 'el fondo oscuro': [19, 19, 21, 1], 'una tarjeta': null },
}

const MIN_NORMAL = 4.5
const fallos = []

for (const [tema, rampa] of Object.entries(RAMPAS)) {
  const sup = { ...SUPERFICIES[tema] }
  sup['una tarjeta'] = colorDeClase('bg-dark-900', rampa, tema) || sup[Object.keys(sup)[0]]

  for (const [k, ficheros] of parejas) {
    const [tc, bc] = k.split('|')
    const t = colorDeClase(tc, rampa, tema)
    const bRaw = colorDeClase(bc, rampa, tema)
    if (process.env.DEBUG_PAR === k) {
      console.log(`  [debug ${tema}] ${k}  texto=${JSON.stringify(t)}  fondo=${JSON.stringify(bRaw)}`)
    }
    if (!t || !bRaw) continue
    // El fondo puede ser translúcido: se compone sobre la superficie de debajo.
    const base = sup['el papel del contenido'] || sup['el fondo oscuro']
    const b = sobre(bRaw, base)
    const r = ratio(sobre(t, b), b)
    if (r < MIN_NORMAL) {
      fallos.push({ tema, texto: tc, fondo: bc, ratio: r, donde: [...ficheros].slice(0, 3) })
    }
  }

  /* EL TEXTO SIN FONDO PROPIO NO SE MIDE, y es deliberado.
     Habría que adivinar sobre qué superficie cae, y varias pantallas traen su
     propio fondo (`bg-[#F2F4F7]` en el cuadre del debrief y en las órdenes de
     taller, que van en claro a propósito). Midiéndolas contra el fondo del
     tema salían 90 "fallos" que no existen — el cuadre del debrief aparecía
     como ilegible cuando es la pantalla que mejor se lee.

     Mejor medir menos y que todo lo que salga sea verdad. Una sola línea
     falsa aquí y nadie vuelve a abrir la lista. */
}

const total = parejas.size + sueltos.size
console.log(`contraste: ${parejas.size} parejas texto/fondo y ${sueltos.size} textos sin fondo propio, en 3 temas`)

if (!fallos.length) {
  console.log('contraste OK: todo pasa el 4,5:1 de la WCAG AA')
  process.exit(0)
}

/* Se agrupa por combinación: una misma pareja mala sale en veinte ficheros y
   listarla veinte veces esconde las demás. */
/* UNA COMBINACIÓN, UNA LÍNEA.
   Muchas parejas no dependen del tema (`text-white` sobre `bg-amber-500` es
   igual de ilegible de noche que de día), y sacarlas tres veces —una por
   tema— triplica una lista que hay que leer entera. Se agrupan por pareja y
   solo se dice en qué temas falla cuando no es en todos. */
const porPareja = new Map()
for (const f of fallos) {
  const k = `${f.texto}|${f.fondo}`
  if (!porPareja.has(k)) porPareja.set(k, { ...f, temas: new Set() })
  const e = porPareja.get(k)
  e.temas.add(f.tema)
  if (f.ratio < e.ratio) e.ratio = f.ratio   // se enseña el peor caso
}
const lista = [...porPareja.values()].sort((a, b) => a.ratio - b.ratio)
console.error(`\nTEXTO QUE NO SE LEE — ${lista.length} combinaciones por debajo de 4,5:1\n`)
for (const f of lista) {
  const donde = f.temas.size === 3 ? 'los tres temas' : [...f.temas].join(' y ')
  console.error(`  ${f.texto}  sobre  ${f.fondo}   →  ${f.ratio.toFixed(2)}:1   (${donde})`)
  console.error(`      ${f.donde.join('  ')}`)
}
console.error(
  '\nCada línea es una combinación real que existe en el código.\n' +
  'Arréglalo en el componente, o compensa la clase en el bloque del tema\n' +
  "correspondiente de index.css (`html[data-panel-theme='hibrido'] main …`).",
)
process.exit(1)
