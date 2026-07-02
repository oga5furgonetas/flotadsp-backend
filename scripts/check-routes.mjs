// Detecta rutas FastAPI duplicadas (mismo router + method + path: la segunda
// jamás se ejecuta) y funciones top-level con el mismo nombre (la segunda pisa
// a la primera en runtime). Uso: node scripts/check-routes.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'server.py')
const lines = fs.readFileSync(SERVER, 'utf8').split('\n')

const routes = {}
const funcs = {}
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^@(api_router|app|auth_router)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/)
  if (m) {
    const key = `${m[1]} ${m[2].toUpperCase()} ${m[3]}`
    ;(routes[key] = routes[key] || []).push(i + 1)
  }
  const f = lines[i].match(/^(?:async )?def (\w+)\(/)
  if (f) (funcs[f[1]] = funcs[f[1]] || []).push(i + 1)
}

let failed = false
for (const [k, v] of Object.entries(routes)) {
  if (v.length > 1) {
    failed = true
    console.error(`RUTA DUPLICADA (la segunda es inalcanzable): ${k} -> líneas ${v.join(', ')}`)
  }
}
for (const [k, v] of Object.entries(funcs)) {
  if (v.length > 1) {
    failed = true
    console.error(`FUNCIÓN DEFINIDA 2+ VECES (la última pisa): def ${k} -> líneas ${v.join(', ')}`)
  }
}

if (failed) process.exit(1)
console.log(`rutas OK: ${Object.keys(routes).length} rutas, sin duplicados`)
