/* ─────────────────────────────────────────────────────────────────────────────
   DÓNDE ESTÁ DE VERDAD ESTA DIRECCIÓN — varios buscadores a la vez
   ---------------------------------------------------------------------------
   Va al revés que geoPortal.js. Allí se pregunta "¿qué hay en esta coordenada?".
   Aquí se coge el TEXTO de la dirección (`stop_address`, tal cual lo manda
   Cortex) y se busca en varios geocodificadores independientes DÓNDE está.

   Para qué sirve: el paquete ya trae la coordenada de Amazon, y es justo donde
   mandaron al conductor y no encontró nada. Si varios buscadores independientes
   coinciden en OTRO punto, el dato accionable no es la dirección — es la
   DISTANCIA entre los dos puntos: "está a 400 m de donde te mandaron".

   ── LA REGLA: ACUERDO POR CERCANÍA, NUNCA POR TEXTO ──────────────────────────
   Dos buscadores escriben la misma calle de formas distintas ('RUA DO VILAR',
   'Rúa do Vilar', 'Calle Villar') y apuntan al mismo portal. Comparar cadenas
   daría desacuerdos falsos. Lo que no admite interpretación son las
   coordenadas: si dos resultados caen a menos de RADIO_ACUERDO_M el uno del
   otro, están hablando del mismo sitio.

   ── POR QUÉ ESTO NO INVENTA DIRECCIONES ──────────────────────────────────────
   Una coordenada equivocada es peor que no tener nada: manda al conductor a
   otro sitio y le hace perder el viaje con aire de certeza. Cuatro cerrojos, y
   cada uno tapa un fallo real observado al probar contra los servicios:

   1. FAMILIAS, no endpoints. Nominatim y Photon son dos servicios distintos
      pero leen la MISMA base (OpenStreetMap). Que coincidan no son dos fuentes
      de acuerdo, es la misma opinión dicha dos veces. Sólo se afirma con dos
      FAMILIAS distintas (OSM + el callejero oficial del IGN).
   2. Nada por debajo de la calle vota. Un geocodificador que no encuentra la
      dirección devuelve el centro del municipio, y es su respuesta más
      peligrosa: tres buscadores devolviendo el centro de Santiago caen todos a
      metros unos de otros y fabricarían un acuerdo perfecto sobre un punto que
      no es ninguna dirección. Sólo votan 'portal' y 'calle'.
   3. Guardia de lejanía. 'Rúa do Vilar' existe en media Galicia. Si el punto
      confirmado cae a más de MAX_KM_PLAUSIBLE de donde Amazon mandó al
      conductor, no es un hallazgo: es la misma calle en otro pueblo. No se
      afirma.
   4. Un solo resultado no confirma nada, por bueno que parezca.

   Cuando algún cerrojo salta, la respuesta es 'no lo sé'. Es una respuesta
   válida y es la que protege al conductor.
   ───────────────────────────────────────────────────────────────────────────── */

/* Dos resultados a menos de esto hablan del mismo portal. 150 m es menos que
   una manzana larga y más que el error típico entre callejeros: medido contra
   los servicios reales, dos aciertos sobre el mismo portal caen a 20-40 m. */
export const RADIO_ACUERDO_M = 150

/* Más lejos que esto de donde mandaron al conductor y deja de ser creíble que
   sea la misma dirección: es la calle homónima de otro municipio. Además, a esa
   distancia tampoco sería accionable para quien está repartiendo. */
export const MAX_KM_PLAUSIBLE = 25

/** Metros entre dos coordenadas (haversine). Gemelo de `_haversine_km` del
    backend, pero en metros: aquí la señal está en decenas de metros. */
export function metrosEntre(a, b) {
  if (!a || !b) return null
  const { lat: la1, lng: lo1 } = a
  const { lat: la2, lng: lo2 } = b
  if (![la1, lo1, la2, lo2].every((n) => Number.isFinite(n))) return null
  const R = 6371000
  const rad = Math.PI / 180
  const dLa = (la2 - la1) * rad
  const dLo = (lo2 - lo1) * rad
  const s = Math.sin(dLa / 2) ** 2
    + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)))
}

/* ── LEER LA DIRECCIÓN DE CORTEX ──────────────────────────────────────────────
   `_cortex_addr_str` la deja siempre como "address1, address2, address3, CP
   ciudad". El primer tramo es la vía con su número; los de en medio son piso y
   puerta (o la parroquia, en el rural gallego); el último, código postal y
   municipio.

   Esto importa más de lo que parece: probando contra Cartociudad, la dirección
   entera devuelve VACÍO, y con el código postal pegado sin comas devuelve una
   CALLE DISTINTA dándola por portal exacto. La fuente oficial sólo responde
   bien si se le da "vía número, municipio". Por eso se despieza aquí en vez de
   mandarle la cadena tal cual. */

/* Piso y puerta: '4 B', 'Bajo', '1º Izq', 'Esc 2', 'Pta 3', 'Ático'. Sobran
   para localizar el portal y sólo confunden al buscador. */
const RE_PISO = new RegExp(
  '^(?:'
  + 'bajo|bj|baixo|entlo|entresuelo|atico|ático|sotano|sótano|local|nave|'
  + '(?:esc|escalera|pta|puerta|piso|planta|bloque|blq|portal|pt)\\b.*|'
  + '\\d{1,2}\\s*[ºªo°.]?\\s*[a-zA-Z]?|'
  + '[a-zA-Z]|'
  + '(?:izq|izda|izquierda|dcha|dcha\\.|derecha|centro|ctro)\\w*'
  + ')$', 'i')

/** Despieza la dirección de Cortex. Todo lo que no se sabe se queda en ''. */
export function analizarDireccion(txt) {
  const bruto = String(txt || '').replace(/\s+/g, ' ').trim()
  const tramos = bruto.split(',').map((x) => x.trim()).filter(Boolean)
  if (!tramos.length) return null

  let cp = ''
  let ciudad = ''
  // El último tramo suele ser 'CP ciudad'. Sólo se acepta como tal si trae el
  // código postal de 5 cifras o si es texto sin números: cualquier otra cosa
  // (un 'Bajo B' final) no es un municipio y tratarlo como tal envenena la
  // consulta.
  if (tramos.length > 1) {
    const ult = tramos[tramos.length - 1]
    const m = ult.match(/^(\d{5})\s*(.*)$/)
    if (m) {
      cp = m[1]
      ciudad = m[2].trim()
      tramos.pop()
    } else if (/^[^\d]+$/.test(ult) && ult.length > 2 && !RE_PISO.test(ult)) {
      ciudad = ult
      tramos.pop()
    }
  }

  const via = tramos.shift() || ''
  // Lo que quede en medio y no sea piso/puerta es lugar o parroquia, y en el
  // rural es justo lo que localiza la casa. Se conserva aparte para poder
  // preguntar con y sin ello.
  const lugar = tramos.filter((s) => !RE_PISO.test(s)).join(', ')

  return { via, lugar, cp, ciudad, bruto }
}

/** ¿Tiene esta dirección lo mínimo para buscarla? Sin vía no hay nada que
    buscar, y sin municipio se corre el riesgo de acertar la calle del pueblo
    equivocado. */
export function esBuscable(d) {
  return !!(d && d.via && /[a-zA-ZÁ-ÿ]{3}/.test(d.via) && (d.ciudad || d.cp))
}

/* Consultas. Se construyen dos porque los servicios no aceptan lo mismo:
   · corta  → 'vía número, municipio'. Es la única forma con la que Cartociudad
     responde de verdad (probado: con el CP se queda mudo o se va a otra calle).
   · larga  → añade lugar/parroquia y CP. Photon y Nominatim la digieren bien y
     en el rural es lo que distingue una casa. */
export function consultaCorta(d) {
  return [d.via, d.ciudad].filter(Boolean).join(', ')
}
export function consultaLarga(d) {
  return [d.via, d.lugar, [d.cp, d.ciudad].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ')
}

/* ── LOS BUSCADORES ───────────────────────────────────────────────────────────
   Cada uno devuelve como mucho UN resultado, el mejor que dé. Que un servicio
   vote una sola vez no es una limitación: si pudiera votar dos veces con sus
   dos primeros candidatos, un buscador solo se confirmaría a sí mismo.

   `familia` es de dónde salen los datos, no quién los sirve. Es el campo que
   impide que OpenStreetMap se dé la razón a sí mismo dos veces. */

const TIEMPO_MAX_MS = 8000

/** fetch que no puede colgar la pantalla ni lanzar: o trae JSON, o null. */
async function pedirJSON(url, { signal } = {}) {
  const corte = new AbortController()
  const reloj = setTimeout(() => corte.abort(), TIEMPO_MAX_MS)
  const abortar = () => corte.abort()
  if (signal) signal.addEventListener('abort', abortar, { once: true })
  try {
    const r = await fetch(url, { signal: corte.signal, headers: { Accept: 'application/json' } })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  } finally {
    clearTimeout(reloj)
    if (signal) signal.removeEventListener('abort', abortar)
  }
}

/** Precisión declarada por lo que devuelve el servicio, nunca por lo que nos
    convendría. Sólo 'portal' y 'calle' votan (ver cerrojo 2 arriba). */
const PRECISIONES_QUE_VOTAN = new Set(['portal', 'calle'])

/* Nominatim (OpenStreetMap). Ojo: al SERVIDOR le contesta 403 — sólo funciona
   desde el navegador. Por eso todo esto vive en el navegador del panel y no en
   un cron del backend. Su política pide como máximo 1 petición/segundo. */
export async function buscarNominatim(d, opciones = {}) {
  const q = new URLSearchParams({
    q: consultaLarga(d), format: 'jsonv2', addressdetails: '1', limit: '1',
    countrycodes: 'es',
  })
  const j = await pedirJSON(`https://nominatim.openstreetmap.org/search?${q}`, opciones)
  const r = Array.isArray(j) ? j[0] : null
  if (!r) return null
  const lat = parseFloat(r.lat)
  const lng = parseFloat(r.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const a = r.address || {}
  const calle = a.road || a.pedestrian || a.footway || a.residential || ''
  const numero = a.house_number || ''
  return {
    fuente: 'nominatim',
    familia: 'osm',
    lat,
    lng,
    calle: String(calle).slice(0, 160),
    numero: String(numero).slice(0, 20),
    municipio: String(a.city || a.town || a.village || a.municipality || '').slice(0, 120),
    display: String(r.display_name || '').slice(0, 300),
    precision: numero && calle ? 'portal' : calle ? 'calle' : 'zona',
  }
}

/* Photon (Komoot). Servicio distinto y buscador distinto, pero el índice sale
   de OpenStreetMap: misma familia que Nominatim a propósito. */
export async function buscarPhoton(d, opciones = {}) {
  // Sin `lang`: Photon sólo admite default/de/en/fr y contesta 400 a `lang=es`
  // (probado). Un 400 aquí deja la consulta con una sola fuente y entonces ya
  // nunca se confirma nada — el fallo se veía como "no lo sé", no como error.
  const q = new URLSearchParams({ q: consultaLarga(d), limit: '1' })
  const j = await pedirJSON(`https://photon.komoot.io/api/?${q}`, opciones)
  const f = j?.features?.[0]
  const c = f?.geometry?.coordinates
  if (!f || !Array.isArray(c) || c.length < 2) return null
  const lng = Number(c[0])
  const lat = Number(c[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const p = f.properties || {}
  const numero = p.housenumber || ''
  const tipo = String(p.type || '').toLowerCase()
  /* Photon declara el tipo de acierto y hay que hacerle caso en las dos
     direcciones:

     · Cuando NO encuentra la dirección devuelve la ciudad o la comarca, con su
       nombre y todo. Ése es el resultado que fabricaría un acuerdo falso sobre
       el centro del municipio, así que no vota nunca.
     · Cuando acierta a nivel de vía (`type: 'street'`) el nombre viene en
       `name` y NO en `street`. Mirando sólo `street` se descartaban como
       'zona' aciertos de calle perfectamente buenos, y con ellos fuera la
       dirección se quedaba con un solo voto y no se confirmaba nunca. */
  const AMBITO = new Set(['city', 'district', 'locality', 'county', 'state', 'country', 'region'])
  const esVia = tipo === 'street'
  const calle = p.street || (esVia ? p.name : '') || ''
  const precision = AMBITO.has(tipo) ? 'zona'
    : (numero && p.street) ? 'portal'
      : ((p.street || esVia) ? 'calle' : 'zona')
  return {
    fuente: 'photon',
    familia: 'osm',
    lat,
    lng,
    calle: String(calle).slice(0, 160),
    numero: String(numero).slice(0, 20),
    municipio: String(p.city || p.county || '').slice(0, 120),
    display: [calle && `${calle} ${numero}`.trim(), p.postcode, p.city]
      .filter(Boolean).join(', ').slice(0, 300),
    precision,
  }
}

/* Cartociudad (IGN / CNIG): el callejero OFICIAL español y la única familia
   independiente de OpenStreetMap que tenemos. Es la que permite afirmar algo.
   Se le manda la consulta CORTA porque con la larga se queda mudo (probado).
   Su CORS ya viene abierto. */
export async function buscarCartociudad(d, opciones = {}) {
  const q = new URLSearchParams({ q: consultaCorta(d) })
  const j = await pedirJSON(`https://www.cartociudad.es/geocoder/api/geocoder/find?${q}`, opciones)
  if (!j || typeof j !== 'object') return null
  const lat = Number(j.lat)
  const lng = Number(j.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  // `state` distinto de 0 es un aviso del propio servicio de que no ha
  // localizado bien; se respeta en vez de discutirlo.
  if (j.state != null && Number(j.state) !== 0) return null
  const numero = (!j.noNumber && j.portalNumber != null) ? String(j.portalNumber) : ''
  const calle = [j.tip_via, j.address].filter(Boolean).join(' ').trim()
  // El propio servicio dice de qué tipo es el acierto: 'portal' es número
  // exacto, 'callejero'/'via' llega a la vía, 'municipio'/'poblacion' es el
  // centro del pueblo — y ése no vota.
  const tipo = String(j.type || '').toLowerCase()
  const precision = (tipo === 'portal' && numero) ? 'portal'
    : (tipo === 'portal' || tipo === 'callejero' || tipo === 'via' || tipo === 'vial') ? 'calle'
      : 'zona'
  return {
    fuente: 'cartociudad',
    familia: 'ign',
    lat,
    lng,
    calle: calle.slice(0, 160),
    numero: numero.slice(0, 20),
    municipio: String(j.muni || '').slice(0, 120),
    display: [calle + (numero ? ` ${numero}` : ''), j.postalCode, j.muni]
      .filter(Boolean).join(', ').slice(0, 300),
    precision,
  }
}

/* El orden no importa: se preguntan todos a la vez. Son servicios distintos,
   no comparten límite de uso. */
export const BUSCADORES = [buscarNominatim, buscarPhoton, buscarCartociudad]

/* ── EL ACUERDO ───────────────────────────────────────────────────────────────
   Se agrupa por cercanía: para cada resultado se mira cuántos caen a menos de
   RADIO_ACUERDO_M. Gana el grupo más grande, y sólo vale si dentro hay dos
   FAMILIAS distintas. */
function mejorGrupo(votos) {
  let mejor = null
  for (const centro of votos) {
    const grupo = votos.filter((v) => {
      const m = metrosEntre(centro, v)
      return m != null && m <= RADIO_ACUERDO_M
    })
    const familias = new Set(grupo.map((v) => v.familia))
    const cand = { grupo, familias }
    if (!mejor) { mejor = cand; continue }
    // Primero el que reúne más familias independientes; a igualdad, el que
    // agrupa más resultados.
    if (familias.size > mejor.familias.size
      || (familias.size === mejor.familias.size && grupo.length > mejor.grupo.length)) {
      mejor = cand
    }
  }
  return mejor
}

/** Punto que se le enseña a la persona: el resultado más preciso del grupo. Se
    prefiere un portal real a la media aritmética de las coordenadas, que es un
    punto donde no vive nadie. */
function representante(grupo) {
  const peso = (v) => (v.precision === 'portal' ? 2 : 1)
  return [...grupo].sort((a, b) => peso(b) - peso(a))[0]
}

/**
 * Busca la dirección en todos los buscadores a la vez y decide si se puede
 * afirmar algo.
 *
 * @param {string} texto      `stop_address` tal cual viene de Cortex.
 * @param {{lat:number,lng:number}} amazon  Donde mandaron al conductor.
 * @returns {{
 *   estado: 'confirmada'|'indicio'|'sin_acuerdo'|'sin_resultados'|'no_buscable'|'demasiado_lejos',
 *   punto: object|null, metros_amazon: number|null, familias: string[],
 *   dispersion_m: number|null, resultados: object[], consultada: string,
 * }}
 *
 * Estados, y lo que puede decirse con cada uno:
 *   'confirmada'      dos familias independientes en el mismo sitio. Es lo
 *                     único que se le enseña al conductor.
 *   'indicio'         coinciden, pero las dos leen OpenStreetMap. Vale para que
 *                     el gestor lo mire; NO para mandar a nadie.
 *   'demasiado_lejos' hay acuerdo, pero cae fuera del radio creíble: casi
 *                     seguro la misma calle en otro municipio.
 *   los demás         no se sabe.
 */
export async function buscarDireccion(texto, amazon, opciones = {}) {
  const d = analizarDireccion(texto)
  const vacio = {
    punto: null, metros_amazon: null, familias: [], dispersion_m: null,
    precision_acuerdo: null, resultados: [], consultada: d ? consultaLarga(d) : '',
  }
  if (!esBuscable(d)) return { ...vacio, estado: 'no_buscable' }

  const crudos = await Promise.all(
    BUSCADORES.map((f) => f(d, opciones).catch(() => null)))
  const resultados = crudos.filter(Boolean)
  if (!resultados.length) return { ...vacio, estado: 'sin_resultados' }

  const base = { ...vacio, resultados }
  // Cerrojo 2: lo que no llega a la calle no vota. Se conserva en `resultados`
  // para poder enseñarlo, pero no cuenta para el acuerdo.
  const votos = resultados.filter((v) => PRECISIONES_QUE_VOTAN.has(v.precision))
  if (votos.length < 2) return { ...base, estado: 'sin_acuerdo' }

  const mejor = mejorGrupo(votos)
  if (!mejor || mejor.grupo.length < 2) return { ...base, estado: 'sin_acuerdo' }

  const punto = representante(mejor.grupo)
  const dispersion = Math.max(...mejor.grupo.map((v) => metrosEntre(punto, v) ?? 0))
  const metros = metrosEntre(punto, amazon)
  /* Con qué fuerza se confirma el NÚMERO de portal. Que una fuente dé el portal
     y la otra sólo el centro de la vía confirma la calle —que es lo que
     descarta el error grave: otra calle u otro municipio— pero no el número.
     Se dice, en vez de dejar que parezca lo mismo que dos portales de acuerdo. */
  const portales = mejor.grupo.filter((v) => v.precision === 'portal')
  const conAcuerdo = {
    ...base,
    punto,
    metros_amazon: metros,
    familias: [...mejor.familias].sort(),
    dispersion_m: dispersion,
    precision_acuerdo: portales.length >= 2 ? 'portal' : 'calle',
  }

  // Cerrojo 3: acuerdo pero inverosímil. No se afirma.
  if (metros != null && metros > MAX_KM_PLAUSIBLE * 1000) {
    return { ...conAcuerdo, estado: 'demasiado_lejos' }
  }
  // Cerrojo 1: dos servicios de la MISMA familia no son dos fuentes.
  if (mejor.familias.size < 2) return { ...conAcuerdo, estado: 'indicio' }
  return { ...conAcuerdo, estado: 'confirmada' }
}
