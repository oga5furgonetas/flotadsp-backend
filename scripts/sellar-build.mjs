#!/usr/bin/env node
/* DEJA CONSTANCIA DE QUÉ COMPILACIÓN SE HA SUBIDO.
 * ═══════════════════════════════════════════════════════════════════════════
 * Por qué existe:
 *
 * El 16-09-2026 Dani me dijo «Eddy no me aparece para enviarle la formación».
 * Eddy estaba perfectamente en los datos: teléfono, código y su paso correcto.
 * Lo que pasaba es que su pestaña llevaba horas abierta con una compilación
 * anterior — la app funcionaba, solo que era la de antes.
 *
 * Eso es de lo peor que puede pasar: no falla nada, no hay error, y lo que ves
 * es mentira. El único aviso que había era el `ErrorBoundary`, y ese solo salta
 * cuando la página REVIENTA.
 *
 * Esto escribe el nombre del bundle recién compilado. La app lo pide cada pocos
 * minutos y, si no es el suyo, avisa con un botón de recargar.
 */
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..')
const DIST = path.join(RAIZ, 'frontend-v2', 'dist')
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')

/* El bundle de entrada: el `<script type="module" src="...">` del index. Es lo
   único que cambia con seguridad en cada compilación (lleva el hash dentro). */
const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)
if (!m) {
  console.error('[sellar-build] no encuentro el script de entrada en dist/index.html')
  process.exit(1)
}
const bundle = m[1].split('/').pop()
const sello = { bundle, en: new Date().toISOString() }
fs.writeFileSync(path.join(DIST, 'build.json'), JSON.stringify(sello, null, 2) + '\n')
console.log(`[sellar-build] ok — ${bundle}`)
