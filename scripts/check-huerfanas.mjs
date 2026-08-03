// Detecta rutas del backend que ningún cliente llama.
//
// Por qué existe: en la auditoría aparecieron 61 rutas sin un solo consumidor.
// Entre ellas, el módulo de TURNOS entero (con generador de cuadrantes) y las
// tres subidas de MÉTRICAS. Sus pantallas llevaban meses mostrando ceros y
// nadie se enteró, porque una ruta sin UI no falla: simplemente no se usa.
//
// Este checker deja el número a la vista. Si añades una ruta y te olvidas de
// enchufarla, o borras la pantalla que la llamaba, salta aquí y no dentro de
// seis meses.
//
// Uso: node scripts/check-huerfanas.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/* Rutas que NO tienen UI a propósito: herramientas de operación que se llaman
   a mano (curl / consola) o endpoints de diagnóstico. Están aquí para que el
   checker no las cante cada vez; si borras una, bórrala también de esta lista. */
const SIN_UI_A_PROPOSITO = new Set([
  // Mantenimiento y diagnóstico, se lanzan a mano
  'POST /admin/backfill-new-damages',
  'POST /admin/send-weekly-digest',
  'POST /telegram/test',
  'POST /telegram/send-daily-summary',
  'POST /telegram/send-weekly-summary',
  'GET /r2-test',
  'POST /vehicles/fix-centers',
  'POST /drivers/import-ids',
  'GET /ai-dataset/export',
  'GET /inspections/{inspection_id}/debug-segment',
  'DELETE /metrics/reports/all',
  // Cálculo auxiliar que el frontend ya hace en cliente
  'GET /scorecard/week-range',
  // Raíz del servidor (sirve la SPA / healthcheck), no es una ruta de negocio
  'GET /',
  // Reseteo de contraseña de un admin: se hace a mano, va con require_admin
  // y filtrado por org_id (un admin no puede tocar cuentas de otro DSP).
  'POST /reset-admin-password',
])

const server = fs.readFileSync(path.join(RAIZ, 'backend', 'server.py'), 'utf8')

const rutas = []
const re = /@(?:app|api_router|router|auth_router)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g
let m
while ((m = re.exec(server)) !== null) {
  rutas.push({
    metodo: m[1].toUpperCase(),
    ruta: m[2],
    linea: server.slice(0, m.index).split('\n').length,
  })
}

/* Todo lo que puede llamar a la API: panel, portal, app Flutter, scripts y
   los propios tests. Se concatena y se busca dentro. */
const EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.dart', '.mjs', '.py'])
const consumidores = []
function recorrer(dir) {
  let entradas
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entradas) {
    if (e.name === 'node_modules' || e.name === '__pycache__' || e.name === 'dist') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) recorrer(p)
    else if (EXT.has(path.extname(e.name))) {
      try { consumidores.push(fs.readFileSync(p, 'utf8')) } catch { /* ilegible */ }
    }
  }
}
for (const sub of ['frontend-v2/src', 'frontend/src', 'flotadsp_app/lib', 'scripts', 'backend/tests']) {
  recorrer(path.join(RAIZ, ...sub.split('/')))
}
const TODO = consumidores.join('\n')

/* ¿Se usa? El prefijo literal hasta el primer {parámetro} debe aparecer, y si
   tras el parámetro queda un segmento fijo (…/{id}/km) también. Cubre las
   plantillas `/vehicles/${id}/km` del frontend. */
function seUsa({ ruta }) {
  const prefijo = ruta.split('{')[0].replace(/\/$/, '')
  if (!prefijo || !TODO.includes(prefijo)) return false
  const cola = ruta.split('}').pop().replace(/^\/|\/$/g, '')
  return !cola || TODO.includes(cola)
}

// Una ruta llamada desde otra ruta del propio backend también está viva.
function seLlamaInternamente({ linea }) {
  const desde = server.split('\n').slice(linea - 1, linea + 30).join('\n')
  const f = desde.match(/(?:async )?def (\w+)\(/)
  if (!f) return false
  const usos = server.split(new RegExp(`\\b${f[1]}\\b`)).length - 1
  return usos > 1
}

const huerfanas = rutas.filter((r) => {
  if (SIN_UI_A_PROPOSITO.has(`${r.metodo} ${r.ruta}`)) return false
  return !seUsa(r) && !seLlamaInternamente(r)
})

/* Trinquete. Quedan huérfanas de antes (turnos y métricas ya se engancharon,
   el resto sigue en la lista) y hacer fallar CI hoy solo serviría para que
   alguien lo desactive. Así que se tolera el número ACTUAL y ni una más: si
   añades una ruta sin engancharla, CI se pone en rojo. Cuando bajes el
   backlog, baja también este número — el checker te avisa de que lo hagas. */
const MAXIMO_TOLERADO = 29

if (huerfanas.length === 0) {
  console.log(`huerfanas OK: ${rutas.length} rutas, todas con consumidor ` +
              `(${SIN_UI_A_PROPOSITO.size} marcadas como solo-operación)`)
  process.exit(0)
}

console.log(`\n${huerfanas.length} ruta(s) sin ningún consumidor:\n`)
for (const r of huerfanas.sort((a, b) => a.ruta.localeCompare(b.ruta))) {
  console.log(`  ${r.metodo.padEnd(6)} ${r.ruta.padEnd(52)} server.py:${r.linea}`)
}
console.log(`
Cada una es trabajo hecho que nadie puede usar. Elige:
  · engánchala a una pantalla,
  · bórrala,
  · o si es una herramienta de operación sin UI a propósito, añádela a
    SIN_UI_A_PROPOSITO en este mismo fichero (con su motivo).
`)

if (huerfanas.length > MAXIMO_TOLERADO) {
  console.log(`FALLO: eran ${MAXIMO_TOLERADO} y ahora hay ${huerfanas.length}. ` +
              `Alguna ruta nueva se quedó sin enganchar.`)
  process.exit(1)
}
if (huerfanas.length < MAXIMO_TOLERADO) {
  console.log(`Bajaron de ${MAXIMO_TOLERADO} a ${huerfanas.length}: ` +
              `pon MAXIMO_TOLERADO = ${huerfanas.length} para no perder terreno.`)
  process.exit(1)
}
console.log(`Backlog conocido (${huerfanas.length}), sin rutas nuevas sueltas.`)
process.exit(0)
