/* ─────────────────────────────────────────────────────────────────────────────
   QUÉ HAY EN ESTA COORDENADA — segunda opinión sobre un portal que falla
   ---------------------------------------------------------------------------
   Cuando un conductor marca ADDRESS_NOT_FOUND, ya tenemos la dirección que dio
   Amazon. Lo que NO tenemos es una forma de saber si esa dirección lleva de
   verdad a la coordenada donde le mandan. Aquí se pregunta al mapa qué hay en
   ESA coordenada, y se guarda junto a la de Amazon.

   ── LO QUE ESTO NO ES ────────────────────────────────────────────────────────
   Esto NO resuelve "la dirección correcta". Nadie puede: ni OpenStreetMap ni
   Google saben cuál de las dos tiene razón, y un buzón mal rotulado no sale en
   ningún mapa. Lo que sí se puede afirmar es si las DOS FUENTES COINCIDEN, y el
   desacuerdo es la señal útil: si Amazon dice una calle y la coordenada cae en
   otra, ahí está el motivo de que nadie lo encuentre.

   Por eso todo lo que sale de aquí viaja con su PRECISIÓN declarada:
     'portal' → OSM tiene número de portal en ese punto
     'calle'  → solo llega al nombre de la vía
     'zona'   → ni eso; solo municipio o barrio. Casi nunca sirve.

   ── POR QUÉ EL NAVEGADOR Y NO EL SERVIDOR ────────────────────────────────────
   La política de uso de Nominatim prohíbe los barridos masivos. Un proceso del
   backend recorriendo 300 portales sería justo eso y nos ganaría un bloqueo.
   Aquí lo pide una persona, de uno en uno, y el resultado se guarda en el
   servidor para no volver a pedirlo nunca. `nominatim.openstreetmap.org` ya
   estaba permitido en el CSP (public/_headers).
   ───────────────────────────────────────────────────────────────────────────── */

const URL_BASE = 'https://nominatim.openstreetmap.org/reverse'

/** Quita acentos, signos y el tipo de vía: 'Rúa da Peregrina' → 'peregrina'. */
const TIPOS_VIA = new Set([
  'calle', 'c', 'rua', 'rúa', 'avenida', 'avda', 'avd', 'av', 'plaza', 'praza',
  'pza', 'pl', 'camino', 'camiño', 'carretera', 'ctra', 'paseo', 'po',
  'travesia', 'travesía', 'trav', 'ronda', 'rda', 'alameda', 'canton', 'cantón',
  'lugar', 'lg', 'barrio', 'bo', 'urbanizacion', 'urbanización', 'urb',
  'poligono', 'polígono', 'pol', 'estrada', 'parque', 'costa', 'campo',
  'street', 'road', 'via', 'vía', 'de', 'del', 'da', 'do', 'la', 'el', 'los',
  'las', 'y', 'e', 'a', 'o',
])
/* Código de carretera: N-550, AC-841, SC-20, CP-0204. Aquí el número NO sobra,
   es el nombre de la vía. Sin esto una dirección de carretera se quedaba en
   nada al normalizar y nunca se podía comparar — y en Galicia se reparte en
   carretera todos los días. */
const RE_CARRETERA = /\b([a-z]{1,3})\s*-\s*(\d{1,4})\b/g
/* La misma vía se escribe 'AC-841' o 'AC 841'. Sin guion NO se puede
   generalizar: 'Calle Sol 12' se convertiría en 'sol12' y dejaría de casar con
   nada. Así que sin guion sólo valen los prefijos de carretera que existen de
   verdad (red del Estado, Galicia y diputaciones). */
const PREFIJOS_CARRETERA = 'n|a|ap|ac|ag|vg|cg|cp|dp|ep|ou|po|lu|sc|vrg|se|ce'
const RE_CARRETERA_SIN_GUION = new RegExp(`\\b(${PREFIJOS_CARRETERA})\\s+(\\d{2,4})\\b`, 'g')

export function nucleoVia(s) {
  const base = String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  // Los códigos se pegan (n-550 → n550) para que sobrevivan al filtro de
  // números sueltos y al de palabras cortas.
  const conCodigos = base
    .replace(RE_CARRETERA, (_, l, n) => `${l}${n}`)
    .replace(RE_CARRETERA_SIN_GUION, (_, l, n) => `${l}${n}`)
  return conCodigos
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !TIPOS_VIA.has(w) && !/^\d+$/.test(w))
    .join(' ')
    .trim()
}

/**
 * Número de portal dentro de una dirección de Amazon.
 *
 * Cortex la entrega como "address1, address2, address3, CP ciudad"
 * (_cortex_addr_str en el backend), así que el portal vive en el primer tramo
 * y el piso, el CP y la ciudad vienen detrás.
 *
 * No vale con coger el primer número que aparezca: en 'C/ 12 de Octubre 5' ese
 * número es parte del NOMBRE de la calle, y compararlo contra el portal que
 * devuelve el mapa cantaría un desacuerdo que no existe. En español el portal
 * va DESPUÉS del nombre, así que se coge el último número del primer tramo.
 *
 * Si no hay forma de saberlo se devuelve '' y la comparación se queda en el
 * nombre de la vía. Mejor comparar menos que comparar mal.
 */
function numeroDe(s) {
  const tramos = String(s || '').split(',').map((x) => x.trim()).filter(Boolean)
  if (!tramos.length) return ''
  // 's/n' = sin número. Decirlo es un dato; inventarle uno, no.
  if (/\bs\s*\/?\s*n\b/i.test(tramos[0])) return ''
  /* Fuera lo que parece un portal y no lo es:
     · 'KM 12' de una carretera es un punto kilométrico, no un número de puerta.
     · 'N-550' es el nombre de la vía. */
  const limpiar = (x) => String(x)
    .replace(/\b[a-zA-ZÁ-ú]{1,3}\s*-\s*\d{1,4}\b/g, ' ')
    .replace(/\bkm\.?\s*\d+([.,]\d+)?\b/gi, ' ')
  const enTramo = (x) => {
    const todos = limpiar(x).match(/\b\d{1,4}\b/g)
    return todos ? todos[todos.length - 1] : ''
  }
  // Primer tramo: 'Rúa do Vilar 30' → 30, 'C/ 12 de Octubre 5' → 5.
  const n = enTramo(tramos[0])
  if (n) return n
  /* Patrón 'Avda. de Lugo, 12' o 'Rúa X, Nº 5': el número quedó en el tramo
     siguiente. Solo se acepta si ese tramo es prácticamente el número solo —
     'Bajo B' o '15705 Santiago' no son portales. */
  const seg = (tramos[1] || '').replace(/^(n[.ºo°]*|num\.?|numero)\s*/i, '').trim()
  if (/^\d{1,4}\s*[a-zA-Z]?$/.test(seg)) return enTramo(seg)
  return ''
}

/**
 * Compara la dirección de Amazon con la que devuelve el mapa.
 * Devuelve un veredicto que NUNCA afirma cuál es la buena.
 *   'coincide'      las dos apuntan a la misma vía
 *   'otro_numero'   misma vía, número distinto
 *   'discrepa'      vías distintas
 *   'no_comparable' falta una de las dos, o el mapa no llegó a nivel de calle
 */
export function compararDirecciones(amazon, geo) {
  const vGeo = nucleoVia(geo?.calle)
  const vAmz = nucleoVia(amazon)
  if (!vGeo || !vAmz || geo?.precision === 'zona') return 'no_comparable'

  const tGeo = new Set(vGeo.split(' ').filter((w) => w.length > 2))
  const tAmz = new Set(vAmz.split(' ').filter((w) => w.length > 2))
  if (!tGeo.size || !tAmz.size) return 'no_comparable'
  const comunes = [...tGeo].filter((w) => tAmz.has(w)).length
  // Basta con que compartan una palabra significativa: los nombres de vía se
  // escriben de mil maneras ('Av. Rosalía de Castro' / 'Rosalia Castro').
  if (comunes === 0) return 'discrepa'

  const nGeo = geo?.numero || ''
  const nAmz = numeroDe(amazon)
  if (nGeo && nAmz && nGeo !== nAmz) return 'otro_numero'
  return 'coincide'
}

/**
 * Pregunta al mapa qué hay en (lat, lng). Devuelve null si no se puede saber.
 * No lanza nunca: un fallo de red no puede tumbar la libreta.
 */
export async function resolverCoordenada(lat, lng, { signal } = {}) {
  if (!isFinite(lat) || !isFinite(lng)) return null
  const q = new URLSearchParams({
    lat: String(lat), lon: String(lng), format: 'jsonv2',
    zoom: '18', addressdetails: '1',
  })
  let r
  try {
    r = await fetch(`${URL_BASE}?${q}`, {
      signal,
      headers: { Accept: 'application/json', 'Accept-Language': 'es' },
    })
  } catch { return null }
  if (!r.ok) return null

  let j
  try { j = await r.json() } catch { return null }
  const a = j?.address || {}
  const calle = a.road || a.pedestrian || a.footway || a.residential || ''
  const numero = a.house_number || ''

  // La precisión se declara por lo que DEVUELVE el mapa, no por lo que nos
  // gustaría que fuese. Sin calle no hay nada que comparar.
  const precision = numero && calle ? 'portal' : calle ? 'calle' : 'zona'

  const display = String(j?.display_name || '').trim()
  if (!display) return null
  return {
    display: display.slice(0, 300),
    calle: String(calle).slice(0, 160),
    numero: String(numero).slice(0, 20),
    cp: String(a.postcode || '').slice(0, 12),
    municipio: String(a.city || a.town || a.village || a.municipality || '').slice(0, 120),
    precision,
  }
}
