#!/usr/bin/env node
/* El ErrorBoundary solo se cura solo si RECONOCE el mensaje del chunk roto.

   Cada navegador describe el mismo fallo con otras palabras. El 26-08-2026 y
   tres veces mas hasta el 01-09, conductores con iPhone se quedaron en la
   pantalla de error del portal: Safari decia "undefined is not an object
   (evaluating 'y._result.default')" y el patron solo conocia la frase de
   Chrome. Estos son los mensajes REALES guardados en `client_errors`; si uno
   deja de reconocerse, este checker se pone en rojo antes que un conductor.

   Se ejecuta con: node scripts/check-chunk-error.mjs */
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const mod = await import(pathToFileURL(path.join(RAIZ, 'frontend-v2', 'src', 'lib', 'chunkError.js')).href)
const { isStaleChunkError } = mod

const RECONOCER = [
  // Chrome / Edge (panel, 31-08-2026)
  "Cannot read properties of undefined (reading 'default')",
  // Safari iOS (portal del conductor, 26-08 → 01-09-2026, cuatro veces)
  "undefined is not an object (evaluating 'y._result.default')",
  "undefined is not an object (evaluating 'v._result.default')",
  // Firefox
  'error loading dynamically imported module: https://flotadsp.com/assets/v2/x.js',
  // Safari, import() que devuelve HTML
  'Importing a module script failed.',
  // Webpack/Vite clasico
  'Loading chunk 12 failed',
]
const NO_RECONOCER = [
  // Fallos de codigo de verdad, que SI hay que reportar y no tapar con una recarga
  'Minified React error #310; visit https://reactjs.org/docs/error-decoder.html?invariant=310',
  'n is not a function',
  "Cannot read properties of undefined (reading 'M_ID')",
  'Error creating WebGL context.',
  "Failed to execute 'insertBefore' on 'Node'",
]

let mal = 0
for (const m of RECONOCER) if (!isStaleChunkError(m)) { mal++; console.log('  NO reconoce (y deberia):', m) }
for (const m of NO_RECONOCER) if (isStaleChunkError(m)) { mal++; console.log('  reconoce (y NO deberia):', m) }
if (mal) {
  console.log(`chunk-error: ${mal} mensaje(s) mal clasificados. Un chunk roto que no se reconoce deja al usuario en la pantalla de error sin curarse.`)
  process.exit(1)
}
console.log(`chunk-error OK: ${RECONOCER.length} mensajes reales de chunk roto se reconocen y ${NO_RECONOCER.length} fallos de codigo no se confunden`)
