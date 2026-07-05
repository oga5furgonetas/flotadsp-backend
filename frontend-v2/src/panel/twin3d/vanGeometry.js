// ─────────────────────────────────────────────────────────────────────────────
// GEMELO DIGITAL 3D — geometría paramétrica del vehículo + mapeo de zonas.
//
// No usamos GLB por-modelo (no existen libres y con licencia para toda la gama):
// generamos una furgoneta procedural cuyas proporciones se ajustan a la clase de
// vehículo (Sprinter alto y largo, Custom más bajo, etc.). La arquitectura está
// lista para sustituir esto por un GLB real por modelo sin tocar el resto (ver
// VehicleModelLoader en VanModel.jsx): solo cambia de dónde sale la malla.
//
// Sistema de coordenadas local de la furgoneta (metros):
//   X: +delante  ·  -detrás           (largo)
//   Y: 0 suelo   ·  +H techo          (alto)
//   Z: +izquierda(conductor) · -derecha  (ancho)
// ─────────────────────────────────────────────────────────────────────────────

// ── Clase de vehículo a partir de marca/modelo ──────────────────────────────
export function classifyVan(brand = '', model = '') {
  const s = `${brand} ${model}`.toLowerCase()
  const has = (...w) => w.some((x) => s.includes(x))

  if (has('sprinter', 'crafter')) return 'large_tall'
  if (has('ducato', 'boxer', 'jumper', 'daily', 'master', 'movano')) return 'large_tall'
  if (has('transit custom', 'custom')) return 'mid'
  if (has('trafic', 'vivaro', 'nv300', 'transporter', 'primastar', 'talento', 'expert', 'jumpy', 'scudo', 'proace')) return 'mid'
  if (has('transit')) return 'large'
  if (has('caddy', 'berlingo', 'partner', 'kangoo', 'combo', 'doblo', 'connect')) return 'small'
  return 'default'
}

// ── Dimensiones y silueta por clase (metros) ────────────────────────────────
const CLASS_DIMS = {
  large_tall: { L: 6.0, H: 2.75, W: 2.05, cab: 0.34, roofDrop: 0.18, nose: 0.10 },
  large:      { L: 5.9, H: 2.55, W: 2.00, cab: 0.33, roofDrop: 0.20, nose: 0.14 },
  mid:        { L: 5.3, H: 2.05, W: 1.92, cab: 0.36, roofDrop: 0.14, nose: 0.20 },
  small:      { L: 4.6, H: 1.85, W: 1.80, cab: 0.42, roofDrop: 0.10, nose: 0.26 },
  default:    { L: 5.6, H: 2.45, W: 2.00, cab: 0.34, roofDrop: 0.18, nose: 0.16 },
}

export function vanDims(brand, model) {
  const cls = classifyVan(brand, model)
  return { cls, ...(CLASS_DIMS[cls] || CLASS_DIMS.default) }
}

// Dimensiones del vehículo priorizando la config REAL del modelo que devuelve el
// VehicleModelResolver (backend). Si no hay match en el catálogo, cae a la clase.
export function dimsFromResolver(resolved, brand, model) {
  if (resolved?.body && resolved.body.L) {
    return { cls: resolved.key || classifyVan(brand, model), ...resolved.body }
  }
  return vanDims(brand, model)
}

// Color de carrocería por marca (aprox., para reconocerla de un vistazo) —
// se ignora en modo inspección (gris).
export function bodyColorFor(brand = '') {
  const b = brand.toLowerCase()
  if (b.includes('mercedes')) return '#c9ccd1'
  if (b.includes('ford')) return '#e8ebef'
  if (b.includes('renault')) return '#dfe3e8'
  if (b.includes('fiat')) return '#e6e9ee'
  if (b.includes('peugeot') || b.includes('citro')) return '#dde1e7'
  if (b.includes('volkswagen') || b.includes('vw')) return '#d6dade'
  if (b.includes('iveco')) return '#e2e5ea'
  return '#e4e7ec'
}

// ── Detección de lado / extremo desde el texto libre del daño ───────────────
export function parseSide(locationHint = '', description = '') {
  const s = `${locationHint} ${description}`.toLowerCase()
  const left = /\bizq|izquierd|left|conductor|lado del conductor/.test(s)
  const right = /\bder|derech|right|copiloto|acompañante|pasajero/.test(s)
  const front = /delant|frontal|\bfront|morro|capó|capo|parabris/.test(s)
  const rear = /tras|traser|\brear|\bback|portón|porton|culo|cola/.test(s)
  return {
    side: left ? 'L' : right ? 'R' : null,   // izquierda / derecha / sin dato
    end: front ? 'F' : rear ? 'B' : null,    // delante / detrás / sin dato
  }
}

// ── Zona 3D de un panel (fracciones locales) ────────────────────────────────
// Devuelve { f:[fx,fy,fz], n:[nx,ny,nz], label } donde f son fracciones:
//   fx ∈ [-1,1] del semilargo, fy ∈ [0,1] del alto, fz ∈ [-1,1] del semiancho.
// n es la normal exterior (hacia dónde "mira" el panel), para empujar el pin y
// para el vuelo de cámara.
const ZONE = {
  capo:       { f: [0.72, 0.52, 0], n: [0.3, 0.95, 0], label: 'Capó' },
  parabrisas: { f: [0.45, 0.78, 0], n: [0.5, 0.86, 0], label: 'Parabrisas' },
  techo:      { f: [-0.1, 1.0, 0], n: [0, 1, 0], label: 'Techo' },
  porton:     { f: [-1.0, 0.5, 0], n: [-1, 0.05, 0], label: 'Portón trasero' },
  rejilla:    { f: [0.99, 0.32, 0], n: [1, 0, 0], label: 'Rejilla / calandra' },
  paragolpes: { f: [0.99, 0.18, 0], n: [1, -0.2, 0], label: 'Paragolpes' },
  optica:     { f: [0.9, 0.4, 0.62], n: [0.6, 0, 0.8], label: 'Óptica / faro' },
  retrovisor: { f: [0.5, 0.66, 1.06], n: [0.2, 0, 1], label: 'Retrovisor' },
  puerta:     { f: [0.05, 0.5, 1.0], n: [0, 0, 1], label: 'Puerta lateral' },
  aleta:      { f: [0.62, 0.42, 1.0], n: [0.2, 0, 1], label: 'Aleta / guardabarros' },
  faldon:     { f: [-0.05, 0.16, 1.0], n: [0, -0.2, 1], label: 'Faldón / bajos' },
  paso_rueda: { f: [0.6, 0.28, 1.0], n: [0.1, 0, 1], label: 'Paso de rueda' },
  rueda:      { f: [0.62, 0.18, 1.02], n: [0, -0.1, 1], label: 'Rueda' },
  lateral:    { f: [-0.45, 0.55, 1.0], n: [-0.1, 0, 1], label: 'Panel lateral' },
  moldura:    { f: [0.0, 0.32, 1.0], n: [0, -0.1, 1], label: 'Moldura' },
  menor:      { f: [-0.55, 0.42, 1.0], n: [-0.2, 0, 1], label: 'Detalle carrocería' },
  otros:      { f: [-0.2, 0.55, 1.0], n: [0, 0, 1], label: 'Carrocería' },
}

// Réplica ligera de _canon_panel del backend (para daños que no traen panel canon).
export function canonPanel(part = '') {
  const s = part.toLowerCase()
  const has = (...w) => w.some((x) => s.includes(x))
  if (has('suciedad', 'limpieza')) return null
  if (has('motor', 'freno', 'tpms', 'interior', 'salpicadero', 'neumát', 'neumat', 'mecán', 'mecan')) return null
  if (has('parabris', 'luna')) return 'parabrisas'
  if (has('retrovisor', 'espejo')) return 'retrovisor'
  if (has('faro', 'piloto', 'óptic', 'optic', 'intermitent', 'luz')) return 'optica'
  if (has('llanta', 'rueda', 'tapacubo')) return 'rueda'
  if (has('rejilla', 'calandra', 'parrilla')) return 'rejilla'
  if (has('paragolpes', 'parachoques')) return 'paragolpes'
  if (has('portón', 'porton')) return 'porton'
  if (has('puerta')) return 'puerta'
  if (has('aleta', 'guardabarros')) return 'aleta'
  if (has('faldón', 'faldon', 'umbral', 'estrib', 'bajo')) return 'faldon'
  if (has('paso de rueda', 'paso rueda')) return 'paso_rueda'
  if (has('capó', 'capo')) return 'capo'
  if (has('techo')) return 'techo'
  if (has('moldura', 'embellecedor')) return 'moldura'
  if (has('lateral', 'pilar', 'panel')) return 'lateral'
  if (has('matrícula', 'matricula', 'maneta', 'cerradura', 'depós', 'depos')) return 'menor'
  return 'otros'
}

// Posición 3D absoluta (metros) de un daño en la furgoneta.
export function zonePosition(panel, locationHint, description, dims) {
  const base = ZONE[panel] || ZONE.otros
  let [fx, fy, fz] = base.f
  let [nx, ny, nz] = base.n
  const { side, end } = parseSide(locationHint, description)

  // Lado: si el panel es lateral (fz≠0) y sabemos izq/der, lo colocamos.
  if (fz !== 0 && side) {
    const sign = side === 'L' ? 1 : -1
    fz = Math.abs(fz) * sign
    nz = Math.abs(nz) * sign
  }
  // Extremo delante/detrás para paneles que existen en ambos.
  if (end) {
    if (panel === 'paragolpes' || panel === 'optica' || panel === 'rejilla') {
      const fwd = end === 'F'
      fx = Math.abs(fx) * (fwd ? 1 : -1)
      nx = Math.abs(nx) * (fwd ? 1 : -1)
      if (panel === 'optica') fy = fwd ? 0.4 : 0.46
    }
    if (panel === 'aleta' || panel === 'rueda' || panel === 'paso_rueda') {
      fx = Math.abs(fx) * (end === 'F' ? 1 : -1)
    }
    if (panel === 'puerta' && end === 'B') fx = -0.35   // puerta corredera trasera
  }

  const { L, H, W } = dims
  const pos = [fx * (L / 2), fy * H, fz * (W / 2)]
  // Normaliza la normal
  const nl = Math.hypot(nx, ny, nz) || 1
  const normal = [nx / nl, ny / nl, nz / nl]
  return { pos, normal, label: base.label }
}

// Etiqueta legible de lado/extremo para la UI.
export function sideLabel(locationHint, description) {
  const { side, end } = parseSide(locationHint, description)
  const parts = []
  if (end === 'F') parts.push('delantero')
  if (end === 'B') parts.push('trasero')
  if (side === 'L') parts.push('izquierdo')
  if (side === 'R') parts.push('derecho')
  return parts.join(' ')
}
