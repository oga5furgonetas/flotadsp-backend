#!/usr/bin/env node
/**
 * Busca en el código los patrones que YA han causado un bug en este proyecto.
 *
 * No es un linter genérico: cada regla de aquí sale de algo que se rompió de
 * verdad y está documentado en CLAUDE.md. Un patrón que no ha mordido nunca no
 * entra — el ruido hace que se deje de mirar.
 *
 * Los avisos NO son errores automáticos: son sitios que hay que mirar. Por eso
 * existe la lista de revisados: lo que ya se ha comprobado y está bien se
 * apunta ahí con su motivo, y deja de salir. Así lo que aparece es siempre algo
 * nuevo.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RAIZ = process.cwd()

/* Sitios ya mirados uno por uno y que están bien. Clave: "fichero:patrón".
   Si alguien cambia esa línea, el número de línea baila y vuelve a salir, que
   es justo lo que se quiere. */
const REVISADOS = new Map([
  // Mirados uno por uno el 30-08-2026 CONTRA LA BASE DE PRODUCCIÓN, que es la
  // única forma de saber si un patrón peligroso puede dispararse de verdad.
  ['backend/server.py:status-ne-deleted',
   'En `drivers` no existe el estado "baja" (solo null y "fusionada"), así que el $ne ' +
   'vale. Y en la subida de inspección ser permisivo es DELIBERADO: rechazar por el ' +
   'estado de la furgoneta ya tiró el trabajo de un conductor una vez.'],
  ['backend/server.py:find-one-por-correo',
   '`driver_accounts` está vacía, `founder_reservations` solo comprueba existencia, y en ' +
   '`admin_users` el único correo repetido es null (cuentas que entran por usuario).'],
  ['backend/server.py:group-id-directo',
   '0 paquetes sin `service_day` ni `state`, 0 daños sin `part` ni `severity`: hoy no ' +
   'puede reventar. Aun así se pasó a .get(), porque protegerlo es gratis y el día que ' +
   'entre uno sin campo el fallo es un 500 en el aviso diario.'],
  // Los scripts de análisis no corren en producción: una división por cero ahí
  // es un script que falla al ejecutarlo a mano, no un endpoint caído.
  ['scripts/regla_dsc.py:division-sin-guard', 'Script de análisis, no corre en producción'],
  ['scripts/conciliar_dsc.py:division-sin-guard', 'Script de análisis, no corre en producción'],
])

const PATRONES = [
  {
    id: 'group-id-directo',
    gotcha: 14,
    // r["_id"]["algo"] revienta con KeyError: Mongo OMITE la clave del _id de
    // un $group cuando el campo no existe en el documento. Pasó con los 94
    // paquetes de Cortex sin driver_id.
    re: /\[["']_id["']\]\s*\[["'][a-z_]+["']\]/g,
    que: 'Acceso directo dentro del _id de un $group',
    porque: 'Mongo omite la clave si el campo no existe en el documento: KeyError. Usa .get()',
  },
  {
    id: 'toisostring-fecha-local',
    gotcha: 11,
    // new Date(y, m, d).toISOString() cae en el día ANTERIOR en UTC+2.
    re: /new Date\([^)]*\)\s*\.toISOString\(\)/g,
    que: 'toISOString() sobre una fecha construida en local',
    porque: 'En UTC+2 devuelve el día ANTERIOR. Compón la clave con getFullYear/getMonth/getDate',
  },
  {
    id: 'division-sin-guard',
    // Divisiones por len() o por un campo sin protección.
    re: /\/\s*len\((?!.*\bor\b)[^)]+\)(?!\s*(if|or))/g,
    que: 'División por len() sin proteger el cero',
    porque: 'Una lista vacía es ZeroDivisionError. Usa max(len(x), 1)',
  },
  {
    id: 'find-one-por-correo',
    gotcha: 15,
    re: /find_one\(\s*\{\s*["']email["']/g,
    que: 'find_one por correo',
    porque: 'Hay personas con dos fichas: devuelve la que Mongo tenga primero. Usa _fichas_misma_persona',
  },
  {
    id: 'status-ne-deleted',
    gotcha: 13,
    // $ne: "deleted" a secas deja pasar las de baja.
    re: /["']status["']\s*:\s*\{\s*["']\$ne["']\s*:\s*["']deleted["']\s*\}/g,
    que: '$ne: "deleted" a secas',
    porque: 'Deja pasar las de baja. Debe ser $nin: ["deleted", "baja"]',
  },
  {
    id: 'igualdad-de-centro',
    gotcha: 6,
    // Solo dentro de una consulta a Mongo, no en cualquier diccionario que
    // lleve un campo `center`. La versión amplia daba 167 avisos, casi todos
    // construcción de documentos — y un checker con ese ruido se deja de
    // mirar, que es peor que no tenerlo.
    re: /\b(find|find_one|count_documents|update_one|update_many)\(\s*\{[^}]*["']center["']\s*:\s*(center|c)\b/g,
    que: 'Consulta a Mongo filtrando el centro por igualdad',
    porque: "El centro está sucio ('OGA5', 'OGA5 ', 'oga5'). Filtra por $regex",
  },
]

/* Ficheros a mirar. El frontend viejo y las dependencias no. */
function ficheros(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (['node_modules', '.git', 'dist', 'dist-lab', 'dist-staging', 'frontend',
         '__pycache__', '.venv'].includes(n)) continue
    const p = join(dir, n)
    const st = statSync(p)
    if (st.isDirectory()) ficheros(p, out)
    else if (/\.(py|jsx?|mjs)$/.test(n)) out.push(p)
  }
  return out
}

let avisos = 0
const porPatron = new Map()

for (const f of ficheros(RAIZ)) {
  const rel = relative(RAIZ, f).replace(/\\/g, '/')
  if (rel.startsWith('scripts/check-')) continue          // los checkers se citan a sí mismos
  const txt = readFileSync(f, 'utf8')
  const lineas = txt.split('\n')

  for (const p of PATRONES) {
    lineas.forEach((linea, i) => {
      // Los comentarios no ejecutan nada: citar el patrón para explicarlo no es un bug.
      const limpia = linea.replace(/#.*$/, '').replace(/\/\/.*$/, '')
      p.re.lastIndex = 0
      if (!p.re.test(limpia)) return
      const clave = `${rel}:${p.id}`
      if (REVISADOS.has(clave)) return
      avisos++
      porPatron.set(p.id, (porPatron.get(p.id) || 0) + 1)
      console.log(`\n  ${rel}:${i + 1}`)
      console.log(`    ${p.que}${p.gotcha ? ` (gotcha ${p.gotcha})` : ''}`)
      console.log(`    ${p.porque}`)
      console.log(`    → ${linea.trim().slice(0, 110)}`)
    })
  }
}

/* TRINQUETE, igual que check-huerfanas. Poner esto a cero de golpe serían horas
   de revisar sitios que en su mayoría están bien, y mientras tanto CI en rojo
   deja de mirarse. Lo que NO se tolera es que suba: un patrón nuevo es código
   recién escrito, y ese es el momento barato de arreglarlo. */
const TOLERADOS = 85

console.log(`\npatrones: ${PATRONES.length} reglas, todas salidas de un bug real de este proyecto`)
if (!avisos) {
  console.log('patrones OK: ningún sitio que mirar')
  process.exit(0)
}
console.log(`\n${avisos} sitio(s) que MIRAR — no son errores automáticos:`)
for (const [id, n] of [...porPatron].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(3)} × ${id}`)
}
if (avisos > TOLERADOS) {
  console.log(`\nFALLO: eran ${TOLERADOS} y ahora hay ${avisos}. Hay código nuevo que repite`)
  console.log('un patrón que ya causó un bug aquí. Míralo antes de que entre.')
  process.exit(1)
}
console.log(`\nBacklog conocido (${TOLERADOS}), sin patrones nuevos.`)
console.log(`Cada uno se mira y se decide: si está bien, se apunta en REVISADOS de este
mismo fichero con el motivo y deja de salir; si no, se arregla y se le pone un test.`)
process.exit(0)
