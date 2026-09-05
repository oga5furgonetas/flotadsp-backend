/* ¿La extensión saca de `route-details` la DIRECCIÓN y las COORDENADAS del
 * destino de cada parada? Se ejecuta el parser REAL contra una respuesta con la
 * forma REAL de Cortex.
 *
 * POR QUÉ EXISTE ESTE FICHERO
 * ───────────────────────────
 * Durante una semana se instalaron ~20 versiones de la extensión sin conseguir
 * que Apoyo en ruta pintara las paradas: el mapa decía «Cortex no da la
 * ubicación» en 66 de las 67 paradas de la XA_C29 (05-09-2026). La causa era
 * una sola línea:
 *
 *     const root = json.rmsRouteDetails
 *     for (const a of (root.addresses || [])) ...      // SIEMPRE vacío
 *
 * `addresses` es HERMANO de `rmsRouteDetails`, no hijo. Y como salía vacío, se
 * escribió en un comentario que «route-details no trae la dirección», y esa
 * conclusión equivocada se dio por buena en cada versión siguiente. Lo mismo
 * con `transporters`: el de dentro no lleva `firstName`, así que `driver_name`
 * estaba a **0 de 292.927 paquetes** desde el primer día.
 *
 * Ninguna de esas 20 versiones se pudo probar sin instalarla: el único modo de
 * saber si funcionaba era mirar la pantalla al día siguiente. Esto lo cierra —
 * el parser corre aquí, en CI, con la forma real capturada por la propia
 * extensión (`cortex_diagnostico._id = "schema:details"`).
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', 'cortex-extension')
const fuente = readFileSync(join(RAIZ, 'interceptor.js'), 'utf8')
const problemas = []

/* Se extraen del fichero REAL las funciones que hacen el trabajo (gotcha 40:
 * una copia deja de probar el código que corre en cuanto alguien toca el
 * original). `stationInfo` se sustituye por un doble: lee el DOM de Cortex. */
function trozo(desde, hasta) {
  const i = fuente.indexOf(desde)
  if (i < 0) { problemas.push(`no se encuentra en interceptor.js: ${desde}`); return '' }
  const j = fuente.indexOf(hasta, i)
  if (j < 0) { problemas.push(`no se encuentra el final: ${hasta}`); return '' }
  return fuente.slice(i, j)
}

function linea(desde) {
  const i = fuente.indexOf(desde)
  if (i < 0) { problemas.push(`no se encuentra en interceptor.js: ${desde}`); return '' }
  return fuente.slice(i, fuente.indexOf('\n', i))
}

const codigo = [
  linea('const normSa ='),
  linea('const TBA_RE ='),
  trozo('const KEYS = {', '  const firstKey'),
  trozo('const firstKey =', '  const buildObs'),      // firstKey + pickTba + addrId + destGeo
  trozo('const routePrefix =', '  const emit ='),      // routePrefix + extractRouteDetails
  'globalThis.__extract = extractRouteDetails;',
].join('\n')

const ctx = {
  console,
  saId: null,
  saCenter: {},
  prefixCenter: {},
  stationInfo: () => ({ center: 'OGA5', code: 'XA' }),
  post: () => {},
}
try {
  vm.createContext(ctx)
  vm.runInContext(codigo, ctx)
} catch (e) {
  problemas.push(`el parser no se puede ni cargar: ${e.message}`)
}

/* ── La respuesta REAL de Cortex, con su forma de dos niveles ───────────── */
const RESPUESTA = {
  rmsRouteDetails: {
    routeId: '7730020-29',
    routeCode: 'XA_C29',
    serviceAreaId: '10ef2406-a250-45ce-8fa5-639099edff1a',
    localDate: [2026, 9, 5],
    // OJO: el de DENTRO no trae nombres. Es el de fuera el que los tiene.
    transporters: [{ transporterId: 'A2GH1OM90XUWP1', plannedBreaks: [] }],
    stops: [
      {
        routeCode: 'XA_C29', transporterId: 'A2GH1OM90XUWP1', sequenceNumber: 2,
        addressId: '1054524845203', status: 'NOT_STARTED',
        tasks: [{
          taskId: 't1', transporterId: 'A2GH1OM90XUWP1', referenceId: 'tr-cw-1',
          taskType: 'DELIVERY', taskState: 'PENDING_PICKUP', taskStateContext: 'NONE',
          addressId: '1054524845203', executionGeocode: null,
          domainMap: { scannableId: 'ES2601567644', orderId: 'o1' },
          recentTaskEvents: [{ type: 'PENDING_PICKUP', timestamp: 1757052529010 }],
        }],
      },
      {
        routeCode: 'XA_C29', transporterId: 'A2GH1OM90XUWP1', sequenceNumber: 3,
        addressId: '724642942813', status: 'NOT_STARTED',
        tasks: [{
          taskId: 't2', transporterId: 'A2GH1OM90XUWP1',
          taskType: 'DELIVERY', taskState: 'ATTEMPTED', addressId: '724642942813',
          executionGeocode: { latitude: 42.9, longitude: -8.5 },
          domainMap: { scannableId: 'ES2601567999' },
        }],
      },
    ],
  },
  // ── El nivel de arriba: esto es lo que no se estaba leyendo ──
  addresses: [
    {
      addressId: '1054524845203', address1: 'RUA DE SALVORA 45', address2: null,
      city: 'Ribeira', state: 'A Coruña', postalCode: '15965',
      geocode: { latitude: 42.5563, longitude: -8.9928, scope: 4 },
    },
    {
      addressId: '724642942813', address1: 'Calle Jesús Garrido 11', address2: null,
      city: 'Carril (santiago P)', state: 'Pontevedra', postalCode: '36613',
      geocode: { latitude: 42.6122, longitude: -8.7654, scope: 4 },
    },
  ],
  transporters: [{
    transporterId: 'A2GH1OM90XUWP1', firstName: 'Belen', lastName: 'Fernandez Larino',
    initials: 'BF', workPhoneNumber: '+34600111222',
    lastLocation: { latitude: 42.7001, longitude: -8.8002, timestamp: 1757060000000 },
  }],
  company: { companyId: 'x' },
}

if (!problemas.length) {
  let filas = null
  try {
    filas = ctx.__extract(RESPUESTA)
  } catch (e) {
    problemas.push(`el parser revienta con una respuesta real: ${e.message}`)
  }

  if (filas == null) {
    problemas.push('el parser no devuelve nada con una respuesta real de route-details')
  } else {
    const porTba = Object.fromEntries(filas.map((f) => [f.tba, f]))
    const a = porTba['ES2601567644']   // parada pendiente, sin escaneo todavia
    const b = porTba['ES2601567999']   // parada ya intentada, con escaneo

    if (!a) problemas.push('no sale el paquete de la parada pendiente')
    else {
      // LO QUE HACE QUE EL MAPA SE PINTE.
      if (a.dest_lat !== 42.5563 || a.dest_lng !== -8.9928) {
        problemas.push(`la parada pendiente sale SIN destino (dest_lat=${a.dest_lat}, `
          + `dest_lng=${a.dest_lng}): en el mapa dira «Cortex no da la ubicacion»`)
      }
      if (!a.stop_address || !a.stop_address.includes('SALVORA')) {
        problemas.push(`la parada pendiente sale sin direccion: ${JSON.stringify(a.stop_address)}`)
      }
      // `lat`/`lng` son el ESCANEO, no el destino: mezclarlos cambiaria en
      // silencio el significado de un campo que ya usan 281.559 documentos.
      if (a.lat != null || a.lng != null) {
        problemas.push(`sin escaneo, lat/lng tienen que ser null y son ${a.lat}/${a.lng}`)
      }
      if (a.driver_name !== 'Belen Fernandez Larino') {
        problemas.push(`el nombre del conductor no sale del transporters de arriba: `
          + `${JSON.stringify(a.driver_name)}`)
      }
      if (a.address_id !== '1054524845203') {
        problemas.push(`address_id mal: ${JSON.stringify(a.address_id)}`)
      }
    }

    // DONDE ESTA LA PERSONA. Sin esto, al que va a ayudar se le manda el
    // ultimo portal donde entrego el otro, que puede ser de hace 20 minutos.
    if (a) {
      if (a.driver_lat !== 42.7001 || a.driver_lng !== -8.8002) {
        problemas.push(`no sale la posicion en vivo del conductor `
          + `(driver_lat=${a.driver_lat}, driver_lng=${a.driver_lng})`)
      }
      if (a.driver_pos_at !== 1757060000000) {
        problemas.push(`no sale la hora de esa posicion: ${a.driver_pos_at}`)
      }
      if (a.driver_phone !== '+34600111222') {
        problemas.push(`no sale el telefono del conductor: ${a.driver_phone}`)
      }
    }

    if (!b) problemas.push('no sale el paquete de la parada intentada')
    else {
      if (b.lat !== 42.9 || b.lng !== -8.5) {
        problemas.push(`con escaneo real, lat/lng tienen que ser el escaneo y son ${b.lat}/${b.lng}`)
      }
      if (b.dest_lat !== 42.6122) {
        problemas.push(`la parada intentada tambien tiene que traer su destino: ${b.dest_lat}`)
      }
    }
  }
}

/* ── Y LO QUE NO SE PUEDE HACER NUNCA: inventarse una posicion ───────────
   Si Amazon manda `lastLocation` con otra forma, la respuesta correcta es NO
   dar posicion —y decirlo— en vez de colocar a la persona en un punto que no
   es. Mandar al que ayuda a otro sitio es peor que no mandarlo. */
if (!problemas.length) {
  const raro = JSON.parse(JSON.stringify(RESPUESTA))
  raro.transporters[0].lastLocation = { x: 42.7, y: -8.8, precision: 5 }
  let filas2 = null
  try { filas2 = ctx.__extract(raro) } catch (e) { problemas.push(`revienta con una forma rara: ${e.message}`) }
  if (filas2) {
    const c = filas2.find((f) => f.tba === 'ES2601567644')
    if (c && (c.driver_lat != null || c.driver_lng != null)) {
      problemas.push(`con un lastLocation que no entendemos se inventa una posicion: `
        + `${c.driver_lat},${c.driver_lng} — mandaria al que ayuda a otro sitio`)
    }
    if (c && c.dest_lat !== 42.5563) {
      problemas.push('un lastLocation raro se lleva por delante los destinos')
    }
  }
}

if (problemas.length) {
  console.error('\nLos destinos de las paradas NO llegan:\n')
  for (const p of problemas) console.error('  · ' + p)
  console.error('\nEsto es lo que hace que Apoyo en ruta diga «Cortex no da la ubicacion».\n')
  process.exit(1)
}
console.log('ok - route-details entrega direccion, destino, conductor y telefono')
