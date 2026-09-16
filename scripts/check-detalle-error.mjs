// El mensaje de error que pinta el panel es SIEMPRE texto.
//
// 186 sitios pintan `error.response.data.detail` tal cual. FastAPI manda una
// LISTA de objetos en los 422, y un objeto cuando el servidor quiere dar más
// datos (p. ej. `reactivar_id`). Pintar un objeto revienta la pantalla entera.
// `normalizarDetalle` (services/api.js) lo convierte en texto; esto ejecuta la
// función DE VERDAD, sacada del fichero, con las tres formas.
// Uso: node scripts/check-detalle-error.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend-v2', 'src')
const src = fs.readFileSync(path.join(ROOT, 'services', 'api.js'), 'utf8')
const ini = src.indexOf('export function normalizarDetalle')
if (ini < 0) { console.error('FALTA normalizarDetalle en services/api.js'); process.exit(1) }
let prof = 0, fin = -1
for (let i = src.indexOf('{', ini); i < src.length; i++) {
  if (src[i] === '{') prof++
  else if (src[i] === '}' && --prof === 0) { fin = i + 1; break }
}
const normalizarDetalle = new Function(src.slice(ini, fin).replace('export ', '') + '; return normalizarDetalle')()

const fallos = []
const casos = [
  ['texto', { detail: 'No existe' }, (r) => r.detail === 'No existe'],
  ['422 de FastAPI', { detail: [{ loc: ['body', 'km'], msg: 'Input should be a valid integer', type: 'int' }] },
    (r) => r.detail === 'km: Input should be a valid integer' && Array.isArray(r.detalle)],
  ['lista vacía', { detail: [] }, (r) => typeof r.detail === 'string' && r.detail.length > 0],
  ['objeto con mensaje', { detail: { mensaje: 'Reactívala', reactivar_id: 'x1' } },
    (r) => r.detail === 'Reactívala' && r.detalle.reactivar_id === 'x1'],
  ['objeto sin mensaje', { detail: { codigo: 7 } }, (r) => typeof r.detail === 'string'],
  ['sin detail', { ok: false }, (r) => r.ok === false && r.detail === undefined],
  ['nulo', null, (r) => r === null],
]
for (const [nombre, entrada, ok] of casos) {
  let r
  try { r = normalizarDetalle(entrada) } catch (e) { fallos.push(`${nombre}: lanza ${e.message}`); continue }
  if (!ok(r)) fallos.push(`${nombre}: devuelve ${JSON.stringify(r)}`)
  if (r && typeof r.detail !== 'undefined' && typeof r.detail !== 'string') fallos.push(`${nombre}: detail no es texto`)
}

if (fallos.length) {
  console.error('MENSAJES DE ERROR QUE NO SON TEXTO:')
  for (const f of fallos) console.error('  ' + f)
  process.exit(1)
}
console.log(`detalle de error OK: ${casos.length} formas convertidas a texto`)
