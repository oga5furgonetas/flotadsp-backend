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
  // ── NO ENGANCHAR: parece un boton inofensivo y no lo es ────────────────
  // `read` tiene DOS usos en `alerts`, y el segundo no es evidente: ademas de
  // "visto", es lo que evita duplicar el aviso —`find_one({vehicle_id, title,
  // read: {$ne: true}})` antes de crear cada uno—. Marcarlas todas leidas de
  // golpe deja al generador sin nada que encontrar y **vuelve a crear la lista
  // entera** en la siguiente pasada: el usuario ve los avisos desaparecer y
  // reaparecer, ahora duplicados. Ademas `update_many({})` no filtra por
  // centro, asi que en una DSP con tres naves las borraria las tres.
  // El PATCH de UNA alerta si tiene sentido y si esta enganchado: si el
  // problema sigue sin arreglar, que vuelva a avisar es lo correcto.
  'PUT /alerts/read-all',
  // ── SUPERADAS POR LA SUBIDA UNIFICADA ─────────────────────────────────
  // `/scorecard/upload` detecta el tipo de fichero y llama a la funcion que
  // toca: el PDF por su contenido, y los dos Excel de baremos por sus
  // COLUMNAS (`..._wt_final` los pesos, `..._t0/_t1` los umbrales). Estas tres
  // siguen vivas como via directa, pero la que tiene boton es aquella.
  'POST /scorecard/import-official',
  'POST /scorecard/import-thresholds',
  'POST /scorecard/import-weights',
  // Lee `scorecard_official`, la misma coleccion que `/scorecard/full`, que si
  // esta enganchada y ademas cruza con lo demas. Esta devuelve el documento
  // crudo: util para depurar, no para una pantalla.
  'GET /scorecard/official',

  // ── SALIERON AL PODAR api.js (02-09-2026) ─────────────────────────────
  // Hasta ese dia un export de api.js sin importar contaba como consumidor y
  // estas cuatro pasaban por enganchadas. Ninguna tiene pantalla:
  // Mapa de calor de paquetes fallados por coordenadas. Paquetes IA enseña
  // rutas y direcciones que fallan (`/cortex/direcciones-problema`), que es
  // lo accionable; un mapa de puntos sin direccion no lo pidio nadie.
  'GET /cortex/heatmap',
  // Ritmo y rescates de un conductor a partir de `route_history`, que dejo
  // de escribirse el 15-06-2026 (363 documentos). Lo que se mira hoy es
  // `/diarios/conductores` y la scorecard por conductor.
  'GET /metrics/driver-history/{transporter_id}',
  // Donde quedo cada furgoneta la ultima vez que se confirmo la plaza. El
  // plano (`/parking/state`) ya enseña plaza mandada, reportada y confirmada
  // del dia; el historico se consulta a mano si hace falta.
  'GET /parking/last-known',
  // Disparo manual de los avisos de ITV por WhatsApp: los manda el cron a su
  // hora (`envio_itv_whatsapp`) y el canal sigue bloqueado por Meta.
  'POST /whatsapp/avisar-itv',

  // ── EL ROSTER SE PEGA EN LOCAL, Y ES MEJOR ────────────────────────────
  // `PasteModal` parsea el texto del roster en el navegador con `parseRoster`
  // y `matchRoster`: instantaneo, sin viaje al servidor y sin gastar cuota de
  // Gemini —que se agota y deja sin IA al resto de la app el resto del dia—.
  // Esta ruta hacia lo mismo pasando por el servidor.
  'POST /assignments/import-text',

  // ── SUPERADAS POR ALGO MEJOR QUE YA TIENE PANTALLA ────────────────────
  // `/damages/atribucion` hace esto y mucho mas: cada golpe con su ultima foto
  // limpia, la ventana en la que aparecio y quien la llevaba, con nivel de
  // certeza. Esta devuelve el `driver_id` que la inspeccion ya trae dentro.
  'GET /inspections/{inspection_id}/responsibility',
  // El portal del conductor usa `/portal/mi-ficha`, que ademas dice QUE le
  // falta rellenar. Esta devuelve la ficha cruda.
  'GET /me/driver',
  // Busca la furgoneta por `current_driver_id` —el conductor FIJO—, que no se
  // pone desde ninguna pantalla, asi que hoy devolveria 404 siempre. Lo que
  // usa el portal es `/auth/me/assigned-vehicle`, que va por el cuadrante.
  'GET /me/vehicle',
  // `PATCH /vehicles/{id}` ya admite `current_driver_id` (esta en la
  // whitelist) y esa pantalla si existe. Lo unico que añade esta ruta es un
  // apunte en `driver_assignments`... que no lee NADIE: es una coleccion de
  // solo escritura. Si algun dia hace falta el historial de conductor fijo,
  // el sitio es el PATCH, no resucitar esta.
  'PUT /vehicles/{vehicle_id}/assign-driver',

  // ── EL ROSTER POR IMAGEN: solo si el texto dejara de poderse copiar ────
  // `PasteModal` parsea el roster pegado como TEXTO en el propio navegador.
  // Esta ruta hace lo mismo desde una captura con Gemini Vision: mas lenta y
  // gastando cuota —que se agota y deja sin IA al resto de la app—. Se queda
  // por si Amazon deja de permitir copiar el roster; mientras tanto, el texto
  // es mejor camino.
  'POST /assignments/import-image',

  // ── SIN USO, Y CON EL MOTIVO A LA VISTA ───────────────────────────────
  // Pares clave/valor en `app_meta` para una pantalla que no existe: ninguna
  // linea del frontend menciona "mery". Se dejan por si aparece el cliente que
  // las escribia; no estorban y borrarlas sin saber que las puso seria peor.
  'GET /mery/stickers',
  'PUT /mery/stickers',
  // Lee `daily_ratios`, que esta VACIA en produccion (gotcha 34): depende de
  // que alguien suba el Resumen diario a mano y no lo sube nadie. Devolveria
  // siempre cero. Lo que si funciona es `/scorecard/en-vivo`, que calcula lo
  // mismo desde `cortex_packages`, que se actualiza solo.
  'GET /scorecard/ratios-raw',
  // Coste de subir de plan a mitad de ciclo. La pantalla de planes es de
  // super-admin y trabaja con `/admin/planes`; esto es para un flujo de
  // autoservicio que hoy no existe.
  'GET /org/upgrade-preview',
  // Siete enlaces de marketplace para buscar una pieza. No hay pantalla de
  // piezas: cuando la haya, este es el endpoint.
  'GET /parts/search',
  // El proveedor de renting ya se ve en la ficha de la furgoneta
  // (`vehicle.provider`). Esta busca por matricula y añade los talleres
  // concertados: util el dia que se busque por matricula desde fuera de la
  // ficha, que hoy no pasa.
  'GET /vehicles/plate/{plate}/provider-info',

  // Mantenimiento y diagnóstico, se lanzan a mano
  'POST /import/diagnose',            // el docstring lo dice: DIAGNOSTICO TEMPORAL
  'POST /inspections/batch-upload',   // carga masiva por carpetas, desde un script
  'POST /ai/detect/{inspection_id}',  // el detector CV sobre una foto suelta
  'GET /ai/status/{inspection_id}',   // y sus cajas, para comprobarlo a mano
  'POST /admin/backfill-new-damages',
  'POST /admin/send-weekly-digest',
  'POST /telegram/test',
  'POST /telegram/send-daily-summary',
  'POST /telegram/send-weekly-summary',
  'GET /r2-test',
  // Los llama META, no nuestro frontend. Sin esta excepción salen como
  // huérfanos para siempre y el trinquete acaba subiendo por rutas que sí
  // tienen consumidor — solo que está fuera. La URL se pega en la consola de
  // Meta for Developers y es la que verifica el webhook de WhatsApp.
  'GET /webhooks/whatsapp',
  'POST /webhooks/whatsapp',
  // Buzon de errores del navegador. Se consulta a mano cuando alguien reporta
  // "se me queda la pantalla en negro": hasta ahora esos errores solo iban a
  // Telegram y a una linea de log que dura minutos, asi que no habia nada que
  // leer. No lleva pantalla a proposito: nadie deberia mirar esto a diario.
  'GET /client-errors',
  // La foto diaria de Cortex. La toma sola `_bucle_congelar` cada media hora
  // por la tarde; estas dos son para operar y auditar a mano. La que SÍ tiene
  // pantalla es `/scorecard/en-vivo`, que ya devuelve el campo `congelado` de
  // cada día — que es donde esto se ve. Un panel propio para comparar con
  // Cortex tendría sentido el día que haya varias naves; con una, la
  // comparación se hace abriendo Cortex al lado.
  'POST /cortex/congelar-dia',
  'GET /cortex/dias-congelados',
  // La consume AMAZON con su propia llave, no nuestro frontend — igual que el
  // webhook de WhatsApp. Sin esta excepción sale como huérfana para siempre y
  // el trinquete acaba subiendo por rutas que sí tienen consumidor, solo que
  // está fuera. Lo que SÍ tiene pantalla es la gestión de las llaves
  // (/partner/tokens y /partner/accesos), que es donde se da y se corta.
  // Qué bucles siguen vivos. El aviso de verdad va por Telegram —si un proceso
  // se muere hay que enterarse sin abrir la app—, y esto es para mirarlo a mano
  // cuando ya sabes que algo falla.
  'GET /admin/latidos',
  'GET /partner/v1/flota',
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
// `mobile/lib` es la app Flutter. Hasta el 02-09-2026 aqui ponia
// `flotadsp_app/lib`, una carpeta que no existe: sus 23 rutas (`/drivers/ranking`,
// `/inspections/vehicle/…`, `/alerts/maintenance`…) no contaban como consumidas
// y una de ellas se podia haber borrado por "huerfana" dejando la app sin datos.
for (const sub of ['frontend-v2/src', 'frontend/src', 'mobile/lib', 'scripts', 'backend/tests']) {
  recorrer(path.join(RAIZ, ...sub.split('/')))
}

/* Un export de `api.js` que ninguna pantalla importa NO es un consumidor.
   El 02-09-2026 este checker daba "todas con consumidor" con 16 rutas cuyo
   unico rastro era su propia linea en api.js —`getAlerts`, `getDriverRanking`,
   `asignarMensajeTaller`…—: la bandeja del taller enseñaba "N sin saber de
   cual hablan" y la ruta para asignarlos existia, pero ningun boton la
   llamaba. Asi que las lineas de api.js cuyo nombre no aparece en ningun otro
   fichero se quitan antes de buscar. */
const apiJs = path.join(RAIZ, 'frontend-v2', 'src', 'panel', 'api.js')
let apiTexto = ''
try { apiTexto = fs.readFileSync(apiJs, 'utf8') } catch { /* sin api.js no hay nada que podar */ }
if (apiTexto) {
  const resto = consumidores.filter((t) => t !== apiTexto).join('\n')
  const podadas = []
  apiTexto = apiTexto.split('\n').filter((linea) => {
    const m = linea.match(/^export (?:const|function|async function) (\w+)/)
    if (!m) return true
    const vivo = new RegExp(`\\b${m[1]}\\b`).test(resto)
    if (!vivo) podadas.push(m[1])
    return vivo
  }).join('\n')
  const idx = consumidores.findIndex((t) => t.startsWith(apiTexto.slice(0, 200)) || t.includes('export const getVehicles'))
  if (idx >= 0) consumidores[idx] = apiTexto
  if (podadas.length) console.log(`huerfanas: ${podadas.length} export(s) de api.js sin usar no cuentan como consumidor: ${podadas.join(', ')}`)
}
const TODO = consumidores.join('\n')

/* ¿Se usa? El prefijo literal hasta el primer {parámetro} debe aparecer, y si
   tras el parámetro queda un segmento fijo (…/{id}/km) también. Cubre las
   plantillas `/vehicles/${id}/km` del frontend. */
function seUsa({ ruta }) {
  /* Sin el `/api` de delante. Las rutas colgadas de `@app` en vez del router
     lo llevan escrito dentro (`/api/tools/plantilla-compartida`), mientras que
     el cliente usa `apiFetch('/tools/...')` y el prefijo lo pone el helper. Al
     comparar la cadena tal cual, las CINCO rutas de plantilla compartida
     salian huerfanas teniendo consumidor a dos ficheros de distancia — y con
     cinco avisos en falso, la lista entera deja de leerse. */
  const sinApi = ruta.replace(/^\/api(?=\/)/, '')
  for (const r of new Set([ruta, sinApi])) {
    const prefijo = r.split('{')[0].replace(/\/$/, '')
    if (!prefijo || !TODO.includes(prefijo)) continue
    const cola = r.split('}').pop().replace(/^\/|\/$/g, '')
    if (!cola || TODO.includes(cola)) return true
  }
  return false
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
/* A CERO desde el 01-09-2026. Empezo el dia en 29 y se cerro asi:
     · 5 eran falsos positivos —las de plantilla compartida cuelgan de `@app` y
       llevan `/api` escrito dentro, mientras el cliente usa apiFetch('/tools/…')—
       y se arreglo la comparacion, no la lista;
     · 2 se engancharon: el PDF de flota y las bolsas de cada furgoneta, que la
       ficha ya ENSEÑABA sin que nadie pudiera rellenarlas;
     · 1 se marco como NO enganchar (alerts/read-all, que regeneraria la lista
       entera de avisos);
     · el resto estan aqui abajo, cada una con por que.
   Con el trinquete a cero, una ruta nueva sin cliente salta el mismo dia. Y esa
   es la unica forma de que esto no vuelva a acumular 29: mientras se tolera un
   backlog, lo que se añade encima no se distingue de lo que ya habia. */
const MAXIMO_TOLERADO = 0

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
