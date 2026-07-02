// Verifica que toda clave i18n usada en el frontend esté definida en DICT
// (una clave faltante se muestra literal en la UI) y que no haya duplicadas.
// Uso: node scripts/check-i18n.mjs  (sale con código 1 si hay problemas)
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend-v2', 'src')

// Prefijos usados dinámicamente: t('sev.' + x). Se validan aparte, no como clave literal.
const DYNAMIC_PREFIXES = ['sev.']

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(p)
  }
  return out
}

const i18nSrc = fs.readFileSync(path.join(ROOT, 'i18n.jsx'), 'utf8')
const defined = new Map()
for (const m of i18nSrc.matchAll(/^\s*'([^']+)':\s*\{/gm)) {
  defined.set(m[1], (defined.get(m[1]) || 0) + 1)
}

let failed = false

const dups = [...defined].filter(([, n]) => n > 1)
if (dups.length) {
  failed = true
  console.error('CLAVES DEFINIDAS 2+ VECES EN DICT (la última pisa a la primera):')
  for (const [k, n] of dups) console.error(`  ${k} (${n} veces)`)
}

const used = new Map()
for (const f of walk(ROOT)) {
  const src = fs.readFileSync(f, 'utf8')
  const rel = path.relative(ROOT, f)
  for (const re of [/\bt\(\s*'([^']+)'/g, /\bt\(\s*"([^"]+)"/g, /labelKey:\s*'([^']+)'/g]) {
    for (const m of src.matchAll(re)) {
      if (!used.has(m[1])) used.set(m[1], new Set())
      used.get(m[1]).add(rel)
    }
  }
}

const missing = [...used].filter(([k]) =>
  !defined.has(k) && !DYNAMIC_PREFIXES.some((p) => k === p || k.startsWith(p)))
if (missing.length) {
  failed = true
  console.error('\nCLAVES USADAS PERO NO DEFINIDAS (se verán literales en la UI):')
  for (const [k, files] of missing.sort()) console.error(`  ${k}  <- ${[...files].join(', ')}`)
}

if (failed) process.exit(1)
console.log(`i18n OK: ${defined.size} claves definidas, ${used.size} usadas, 0 problemas`)
