#!/usr/bin/env node
/* NINGÚN HOOK DETRÁS DE UN `return`.
 * ═══════════════════════════════════════════════════════════════════════════
 * Por qué existe:
 *
 * El 16-09-2026 la pantalla de Incorporaciones se cayó entera en producción con
 * «Minified React error #310». La causa: un `useMemo` colocado DEBAJO de los
 * `return` tempranos (`if (!d) return <Cargando/>`).
 *
 * React cuenta los hooks en cada render. El primero —sin datos todavía— salía
 * por el `return` de arriba y ejecutaba 27; el segundo, ya con datos, llegaba
 * al final y ejecutaba 28. Distinto número, y React tira la pantalla entera.
 *
 * Y es el peor tipo de fallo: `vite build` pasa, los tests pasan y el checker
 * de rutas pasa. Solo se ve abriendo la página. Por eso esto se mide aquí.
 */
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..')
const problemas = []

/** Los componentes de React: funciones con mayúscula que devuelven JSX. */
const HOOK = /\buse(?:State|Effect|Memo|Callback|Ref|Context|Reducer|LayoutEffect)\s*\(/g

function revisar(fichero) {
  const src = fs.readFileSync(fichero, 'utf8')
  /* Donde EMPIEZA cada componente, LEYENDO LINEAS y no con una expresion
     regular. La primera version solo veia `function Algo(` y `export default
     function Algo(`, y se dejaba fuera `export function Algo(`: los hooks de un
     componente hijo se le atribuian al anterior y salian dos avisos EN FALSO.
     Un checker que avisa en falso se acaba ignorando, asi que esto se lee
     linea a linea, que es aburrido y no se equivoca. */
  const inicios = []
  const lineas = src.split(String.fromCharCode(10))
  let pos = 0
  for (const linea of lineas) {
    const t = linea.trimStart()
    let resto = null
    for (const pre of ['export default async function ', 'export default function ',
                       'export async function ', 'export function ',
                       'async function ', 'function ', 'export const ', 'const ']) {
      if (t.startsWith(pre)) { resto = t.slice(pre.length); break }
    }
    if (resto) {
      const nom = (resto.match(new RegExp("^([A-Za-z_$][\\w$]*)")) || [])[1]
      // Solo los que empiezan por mayuscula: un componente de React. Y de los
      // `const`, solo si lo que sigue es una funcion.
      const esFuncion = !t.startsWith('const') && !t.startsWith('export const')
        ? true
        : new RegExp("=\\s*(?:memo\\()?\\s*(?:\\(|function|async)").test(resto)
      /* Componentes (mayuscula) Y hooks propios (`useAlgo`). Sin lo
         segundo, un `export function useToast()` declarado debajo del
         Provider no cortaba, y su `useContext` se le atribuia al Provider:
         otros dos avisos en falso. Un hook propio tiene las mismas reglas
         que un componente, asi que tambien hay que mirarlo. */
      const esComponente = new RegExp("^[A-Z]").test(nom)
      const esHookPropio = new RegExp("^use[A-Z]").test(nom)
      if (nom && (esComponente || esHookPropio) && esFuncion) {
        inicios.push({ nombre: nom, pos })
      }
    }
    pos += linea.length + 1
  }
  for (let k = 0; k < inicios.length; k++) {
    const { nombre, pos: desde } = inicios[k]
    const hasta = k + 1 < inicios.length ? inicios[k + 1].pos : src.length
    const cuerpo = src.slice(desde, hasta)

    /* El primer `return` que corta el render: uno con indentacion de dos
       espacios, que es el nivel del cuerpo del componente. Los `return` de
       dentro de un `map` o de un `useMemo` van mas indentados y no cuentan. */
    const corte = cuerpo.search(new RegExp("\\n {2}(?:if \\(.*\\) )?return[ (\\n]"))
    if (corte < 0) continue
    /* SOLO LOS HOOKS DEL PRIMER NIVEL, que son los que React cuenta. Un
       `return useContext(x)` ES el return, no un hook detras de el; y un hook
       dentro del JSX que se devuelve vive en otro componente. Contarlos daba
       tres avisos en falso mas.
       El primer nivel del cuerpo de un componente son DOS espacios de
       indentacion: eso es lo que se mira, y nada mas. */
    const dosEspacios = new RegExp('^  [^ ]')
    const sueltos = []
    /* Con un contador, no con `indexOf`: `indexOf` busca la PRIMERA vez que
       aparece ese texto en todo el cuerpo, asi que una linea repetida —un `}`,
       un espacio— daba una posicion de mucho antes y el recorte salia mal. */
    let off = 0
    for (const l of cuerpo.split(String.fromCharCode(10))) {
      const aqui = off
      off += l.length + 1
      if (aqui < corte) continue
      if (!dosEspacios.test(l)) continue
      /* Un hook EN la linea del return forma parte del return, no viene
         detras: `export function useToast() { return useContext(x) }` es un
         hook propio perfectamente correcto. Contarlo daba tres avisos en falso
         sobre codigo que no tiene nada malo. */
      const t2 = l.trimStart()
      if (t2.startsWith('return') || t2.includes(') return')) continue
      const h = l.match(HOOK)
      if (h) sueltos.push(...h)
    }
    if (!sueltos.length) continue
    const linea = src.slice(0, desde + corte).split(String.fromCharCode(10)).length
    problemas.push(
      `${path.relative(RAIZ, fichero)}: ${nombre} tiene ${sueltos.length} hook(s) `
      + `DESPUES del return de la linea ~${linea} `
      + `(${[...new Set(sueltos.map((x) => String(x).replace('(', '')))].join(', ')}). `
      + 'React contara distinto numero de hooks en cada render y tirara la pantalla.')
  }
}

function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) recorrer(p)
    else if (/\.jsx?$/.test(e.name)) revisar(p)
  }
}
recorrer(path.join(RAIZ, 'frontend-v2', 'src'))

if (problemas.length) {
  console.error(`\n[check-hooks] ${problemas.length} componente(s) con hooks mal puestos:\n`)
  for (const p of problemas) console.error('  - ' + p)
  console.error('\nTodos los hooks van ANTES de cualquier `return` del componente.')
  process.exit(1)
}
console.log('[check-hooks] ok — ningún hook detrás de un return')
