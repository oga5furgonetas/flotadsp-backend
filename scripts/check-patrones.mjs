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
  // ── DIVISIONES POR len() ──────────────────────────────────────────────
  // Las 22 miradas UNA A UNA el 31-08-2026, con el bloque entero delante y no
  // solo la linea. Ninguna puede dar ZeroDivisionError, y no por suerte:
  //
  //   · doce llevan su guarda EN LA MISMA LINEA (`… if xs else None`):
  //     puntualidad, evidencia y honestidad del scoring, dias e importes por
  //     taller, tasa y rescates del historial, ratios de la semana, y los dos
  //     de cortex_overview;
  //   · seis la llevan en un `if` justo encima que corta antes de llegar:
  //     `if len(poly_px) < 3: continue` al anotar la foto, `if len(g) <
  //     _EXP_MIN_MODELO: continue` en exposicion, `if center_scores:` en el
  //     ranking, `if vals:` en las dos del cuadrante, `if len(horas) >= 2:` en
  //     la sugerencia de direccion, `if total["despachados"] and
  //     len(cerrados):` en calidad;
  //   · dos son estructurales: `porn.setdefault(n, []).append(...)` en el
  //     geocodificador y `explicit.setdefault(key, []).append(...)` en la
  //     calibracion crean cada clave CON un elemento dentro, asi que una
  //     lista vacia no existe;
  //   · una la lleva en la linea siguiente (`hora_media`, `if g["horas"]`);
  //   · y la del WHC se arreglo hoy: era la unica que reventaba de verdad —
  //     una empresa sin conductores en el cuadrante se llevaba un 500 el
  //     primer dia.
  //
  // Se anota aqui y deja de salir. Veintidos avisos que no son nada tapan al
  // que si lo es: es lo mismo que pasaba con los toISOString.
  ['backend/server.py:division-sin-guard',
   'Las 22 revisadas una a una el 31-08-2026: doce con la guarda en la misma linea, ' +
   'seis con un `if` que corta antes, dos donde la coleccion se crea siempre con un ' +
   'elemento (setdefault+append), una con el guard en la linea siguiente. La unica que ' +
   'reventaba de verdad era la del WHC —empresa sin conductores, 500 el primer dia— y ' +
   'esa se arreglo, no se tolera.'],
  ['backend/fiabilidad.py:division-sin-guard',
   'Las tres revisadas el 31-08-2026. Dos llevan `if bajos`/`if altos` en la misma linea. ' +
   'La de `len(puntos)` esta protegida por la salida temprana `if len(datos) < ' +
   '_MIN_MUESTRAS: return`: los cinco cortes de la validacion cruzada reparten TODOS los ' +
   'datos, asi que len(puntos) == len(datos) y ya se sabe que no es cero.'],
  ['scripts/conciliar_diarios.py:division-sin-guard',
   'Dentro de `if v:`. Y es un script de analisis que se lanza a mano, no codigo servido.'],
  // ── FECHAS POR ISO ────────────────────────────────────────────────────
  // Los ocho revisados el 31-08-2026. Ninguno pinta un dato de nadie:
  ['frontend-v2/src/panel/pages/Scorecard.jsx:toisostring-fecha-local',
   '`addDays` construye la fecha con `T12:00:00Z` y avanza con `setUTCDate`: todo en UTC ' +
   'y a mediodia A PROPOSITO, asi que el ISO es exactamente lo correcto y el cambio de ' +
   'hora de marzo y octubre no puede mover el dia. Cambiarlo a hora local seria empeorarlo.'],
  ['frontend-v2/e2e/api-simulada.js:toisostring-fecha-local',
   'Fixtures de los tests de navegador: fabrican fechas de mentira para una API simulada. ' +
   'No hay dato de nadie detras.'],
  ['frontend-v2/src/panel/lab/apiLab.js:toisostring-fecha-local',
   'Laboratorio: datos inventados para probar pantallas. No sale a produccion.'],
  ['frontend-v2/src/panel/lab/app2/datosPlus.js:toisostring-fecha-local',
   'Laboratorio: la flota de mentira con la que se prueban las pantallas nuevas.'],
  ['frontend-v2/src/panel/lab/datos.js:toisostring-fecha-local',
   'Laboratorio: generador de datos de ejemplo.'],
  ['frontend-v2/src/panel/lab/v2/amazon.js:toisostring-fecha-local',
   'Laboratorio: semanas de scorecard simuladas para maquetar.'],
  ['scripts/eval_danos.py:division-sin-guard',
   'Script de evaluacion que se lanza a mano contra un lote de inspecciones ya elegido: ' +
   'con `common` vacio no hay nada que evaluar y el resultado no significaria nada. ' +
   'Reventar ahi avisa mejor que imprimir un cero que parece una medida.'],

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
  ['backend/server.py:igualdad-de-centro',
   'Medido el 30-08-2026 en las 37 colecciones con campo `center`: ninguna de las que ' +
   'tocan estas 33 líneas tiene el centro escrito de dos formas, así que la igualdad ' +
   'acierta. Y ya no es por suerte: `/checkers/centros` vigila las 37 —descubriéndolas ' +
   'solo, así que cubre también las futuras— y unifica con `_centro_norm`. En esa misma ' +
   'pasada salieron dos que SÍ estaban partidas y no se veían desde aquí: `maintenance_log` ' +
   '(5 de 9 registros invisibles) y `ordenes_trabajo`. Corregidas, con respaldo en ' +
   '`app_meta.respaldo_centros`.'],
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
    /* Dos formas del gotcha 11, y solo dos:
         · `new Date(y, m, d).toISOString()`  — fecha LOCAL pasada a ISO
         · `.toISOString().slice(0,10)` / `.split('T')[0]` — sacar el DÍA
       `new Date().toISOString()` a secas NO es el fallo: es un INSTANTE, y
       para un instante el ISO es lo correcto. Marcarlo tambien daba 15 avisos
       en falso por cada uno bueno —timestamps de logs, de capturas, de
       consentimiento— y con ese ruido los dos de verdad llevaban meses
       escondidos en el trinquete: la extension le pedia a Cortex el resumen
       del dia ANTERIOR entre medianoche y las 2.

       Ojo tambien a `new Date(x).toISOString()` con UN argumento: eso convierte
       un instante que ya existe y tampoco es el fallo. La fecha local se
       construye con VARIOS —`new Date(y, m, d)`—, de ahi la coma en el patron. */
    re: /new Date\([^)]*,[^)]*\)\s*\.toISOString\(\)|\.toISOString\(\)\s*\.(?:slice\(\s*0\s*,\s*10\s*\)|split\(\s*['"]T['"]\s*\))/g,
    que: 'toISOString() para sacar un DÍA (o sobre una fecha local)',
    porque: 'En UTC+2 devuelve el día ANTERIOR. Compón el día con getFullYear/getMonth/getDate',
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
/* El trinquete BAJA cuando se limpia, si no deja de apretar. De 45 a 8 el
   31-08-2026, y a CERO al terminar: cada aviso que queda en la cuenta es uno
   que ya nadie mira. Las 28 divisiones por len() se miraron UNA A UNA con el bloque
   entero delante: ninguna puede reventar y estan anotadas en REVISADOS con el
   motivo, que es lo que hay que hacer con un aviso que no es nada — dejarlo
   en la cuenta lo unico que consigue es tapar al que si lo es. Lo arreglado
   de verdad fue: la division del WHC (reventaba con una empresa sin conductores),
   los dos toISOString de la extension (le pedia a Cortex el resumen del dia
   ANTERIOR entre medianoche y las 2) y los dos del Dashboard (el rotulo decia
   un dia y el dato era el del anterior). Los 8 que quedan de fecha son datos
   de laboratorio, fixtures de e2e y el de Scorecard, que trabaja en UTC a
   mediodia A PROPOSITO y es correcto. */
const TOLERADOS = 0

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
