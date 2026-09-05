/* ¿Se usa en una pantalla algo NUESTRO que no está importado en ella?
 *
 * POR QUÉ EXISTE
 * ──────────────
 * El 04-09-2026 a las 16:34 un commit añadió `useOrden()` a cuatro pantallas y
 * puso el `import` en tres. La cuarta —Vehículos— quedó llamando a una función
 * que en ese fichero no existe: **pantalla en negro con «useOrden is not
 * defined» durante 19 horas**, en producción, y lo reportó Mery.
 *
 * Ni el build ni el linter lo vieron: `useOrden()` es JavaScript perfectamente
 * válido, y esbuild no resuelve identificadores libres — revienta en el
 * navegador, no al compilar. Es el gotcha 19 (los `undefined name` que caza
 * pyflakes en el backend) del lado del cliente, donde no había nada.
 *
 * QUÉ MIRA, Y POR QUÉ ASÍ: solo los nombres que ESTE repositorio exporta desde
 * `src/lib/` y `src/panel/api.js` —lo nuestro, lo que se importa a mano—. No
 * intenta resolver React, los iconos ni los globales del navegador: un checker
 * que grita en falso deja de leerse, y aquí se busca la clase exacta de fallo
 * que ya ha pasado.
 *
 * Y se miran los usos sobre el código SIN comentarios ni cadenas: en la primera
 * pasada dio dos avisos en falso, uno de ellos porque la palabra «lista» dentro
 * de «no los lista (datos viejos)» parecía una llamada a `lista(`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend-v2', 'src')
const problemas = []

function ficheros(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) ficheros(p, out)
    else if (/\.(jsx?|tsx?)$/.test(n)) out.push(p)
  }
  return out
}

const NL = String.fromCharCode(10)

/* Fuera comentarios y cadenas antes de buscar usos. */
function limpio(txt) {
  return txt
    .split(NL)
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1 '))
    .join(NL)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/`[^`]*`/g, '``')
}

const todos = ficheros(RAIZ)

/* Lo que exportan nuestros modulos propios. */
const nuestros = new Set()
for (const f of todos) {
  if (!/[\\/]lib[\\/]|[\\/]api\.js$/.test(f)) continue
  for (const m of readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('').matchAll(
    /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    nuestros.add(m[1])
  }
}

for (const f of todos) {
  /* Fuera el retorno de carro: estos ficheros van en CRLF y el resto que deja
     impide que `.*$` cierre la linea, asi que el comentario NO se borraba y
     salia un aviso en falso. */
  // `.*$` no cruza: el comentario NO se borraba y salia un aviso en falso.
  const bruto = readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('')
  const txt = limpio(bruto)

  /* Lo que este fichero tiene a mano: lo importado y lo que define el mismo.
     Los imports se leen del texto BRUTO y linea a linea: una sola expresion que
     cruce lineas se come el siguiente `import` y deja nombres fuera — asi salio
     el primer aviso en falso, con `ToastProvider`, que si estaba importado. */
  const disponibles = new Set()
  let dentro = false
  let acumulado = ''
  for (const linea of bruto.split(NL)) {
    // `import './index.css'` no trae nombres: si no se salta, deja el
    // acumulador abierto y se come los imports de debajo — asi salia
    // 'ToastProvider' como no importado estandolo.
    if (/^\s*import\s*['"]/.test(linea)) continue
    if (!dentro && /^\s*import\b/.test(linea)) { dentro = true; acumulado = '' }
    if (!dentro) continue
    acumulado += ' ' + linea
    if (!/\bfrom\b\s*['"]/.test(acumulado)) continue
    dentro = false
    const nombres = acumulado.replace(/^\s*import\s+/, '').split(/\bfrom\b/)[0]
    for (const n of nombres.replace(/[{}]/g, ' ').split(',')) {
      const nombre = n.trim().split(/\s+as\s+/).pop().trim()
      if (nombre && nombre !== '*') disponibles.add(nombre)
    }
  }
  for (const m of txt.matchAll(
    /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) {
    disponibles.add(m[1])
  }

  for (const nombre of nuestros) {
    if (disponibles.has(nombre)) continue
    // Se usa como llamada `nombre(` o como componente `<Nombre`.
    const usa = new RegExp('(?:^|[^\\w$.])' + nombre + '\\s*\\(|<' + nombre + '[\\s/>]')
    if (usa.test(txt)) {
      problemas.push(`${f.slice(RAIZ.length + 1).replace(/\\/g, '/')} usa '${nombre}' y no lo importa: `
        + `pantalla en blanco con «${nombre} is not defined»`)
    }
  }
}

if (problemas.length) {
  for (const p of problemas) console.error('  ' + p)
  console.error(`${NL}importaciones: ${problemas.length} problema(s).`)
  process.exit(1)
}
console.log(`importaciones OK: ${nuestros.size} nombres propios comprobados en ${todos.length} ficheros`)
