#!/usr/bin/env node
/* Un useEffect que DEVUELVE algo revienta al salir de la pantalla.
   ═══════════════════════════════════════════════════════════════════════
   React usa lo que devuelve el efecto como funcion de LIMPIEZA y lo llama al
   desmontar el componente. Si no es una funcion —una promesa, el id de un
   setTimeout, un numero— salta «n is not a function».

   Lo malo es cuando y donde salta:

     · AL SALIR de la pantalla, no al entrar. La pantalla culpable funciona
       perfectamente mientras la miras.
     · El error se registra con la URL de DESTINO. El 30-08-2026 quedo
       apuntado en `/panel/usuarios` y en `/panel/ia-peritaje` y venia de
       Configuracion: quien lo investigara habria mirado dos pantallas sanas.

   Estaba en `Configuracion.jsx`:

       const cargar = () => getWhatsappEstado().then(...).catch(...)
       useEffect(cargar, [])

   Sin llaves, la flecha devuelve la promesa del `.catch()`. Con llaves,
   undefined. Un caracter.

   Ni el build ni el linter lo ven: devolver una promesa de una funcion es
   JavaScript perfectamente valido — el problema es a QUIEN se la das.

   Se ejecuta con: node scripts/check-efectos.mjs                          */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(RAIZ, 'frontend-v2', 'src')

function ficheros(dir) {
  const out = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...ficheros(p))
    else if (/\.jsx?$/.test(n)) out.push(p)
  }
  return out
}

/* Tres formas de meter la pata, y las tres se ven en el texto:
     useEffect(() => algo, [...])   flecha implicita: devuelve `algo`
     useEffect(async () => …)       siempre devuelve una promesa
     useEffect(nombre, [...])       devuelve lo que devuelva `nombre`
   La tercera hay que resolverla: se busca la definicion y se mira si es una
   flecha con llaves (segura) o implicita (devuelve). */
const IMPLICITA = /useEffect\(\s*\(\s*\)\s*=>\s*([^{,\s][^,\n]*?)\s*,\s*\[/g
const ASINCRONA = /useEffect\(\s*async\b/g
const POR_NOMBRE = /useEffect\(\s*([A-Za-z_$][\w$]*)\s*,\s*\[/g

/* Devolver una FUNCION es lo correcto: es la limpieza que React espera.
   `useEffect(() => () => clearTimeout(t), [])` es el patron bueno y hay
   cuatro asi en el panel. Sin esta comprobacion el checker los marcaba a los
   cuatro y no acertaba ni uno — y un checker que grita en falso deja de
   leerse, que es como se colo el de Configuracion. */
const devuelveFuncion = (txt) => {
  const t = (txt || '').trim()
  return /^\(\s*[\w,\s{}[\]:.=]*\)\s*=>/.test(t)   // () => …  /  (x) => …
      || /^function/.test(t)
      || /^[A-Za-z_$][\w$]*$/.test(t)                  // una referencia suelta
}

let fallos = 0
for (const f of ficheros(SRC)) {
  const src = readFileSync(f, 'utf8')
  const rel = relative(RAIZ, f).replace(/\\/g, '/')
  const linea = (i) => src.slice(0, i).split('\n').length

  for (const m of src.matchAll(IMPLICITA)) {
    if (devuelveFuncion(m[1])) continue
    fallos++
    console.log(`\n  ${rel}:${linea(m.index)}`)
    console.log(`     useEffect con flecha implicita: devuelve \`${m[1].slice(0, 60)}\``)
    console.log('     -> React lo llamara como limpieza al salir de la pantalla.')
    console.log('     Ponle llaves: useEffect(() => { … }, [...])')
  }
  for (const m of src.matchAll(ASINCRONA)) {
    fallos++
    console.log(`\n  ${rel}:${linea(m.index)}`)
    console.log('     useEffect ASINCRONO: siempre devuelve una promesa.')
    console.log('     Declara la funcion async DENTRO del efecto y llamala.')
  }
  for (const m of src.matchAll(POR_NOMBRE)) {
    const nombre = m[1]
    const hasta = src.slice(0, m.index)
    // La definicion mas cercana por encima.
    const re = new RegExp(
      `(?:function\\s+${nombre}\\s*\\(|const\\s+${nombre}\\s*=\\s*(?:useCallback\\()?)`, 'g')
    let def = null
    for (const d of hasta.matchAll(re)) def = d
    if (!def) continue
    const resto = src.slice(def.index)
    const flecha = resto.indexOf('=>')
    const llave = resto.indexOf('{')
    // `function f() {` no tiene flecha: seguro. Con flecha, lo que va justo
    // detras decide: `{` es cuerpo (seguro), cualquier otra cosa devuelve.
    if (flecha === -1 || flecha > llave) continue
    const tras = resto.slice(flecha + 2).trimStart()
    if (tras.startsWith('{') || devuelveFuncion(tras.split('\n')[0])) continue
    fallos++
    console.log(`\n  ${rel}:${linea(m.index)}`)
    console.log(`     useEffect(${nombre}, …) y \`${nombre}\` es una flecha SIN llaves:`)
    console.log(`     ${resto.slice(0, resto.indexOf('\n')).trim().slice(0, 88)}`)
    console.log('     -> devuelve un valor que React llamara como limpieza.')
  }
}

if (!fallos) {
  console.log('efectos OK: ningun useEffect devuelve algo que no sea una limpieza')
  process.exit(0)
}
console.log(`\nFALLO: ${fallos} efecto(s) que devuelven algo.`)
console.log('Revienta AL SALIR de la pantalla, y el error se apunta con la URL')
console.log('de destino: se investiga una pantalla sana mientras la culpable es otra.')
process.exit(1)
