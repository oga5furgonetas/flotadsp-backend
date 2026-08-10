/* ─────────────────────────────────────────────────────────────────────────────
   FLOTADSP 2.0 · DATOS DE LABORATORIO CON VOLUMEN REAL
   ---------------------------------------------------------------------------
   Los prototipos anteriores tenían 5 furgonetas y 5 conductores. Con eso no se
   puede juzgar nada: una lista de 5 filas se ve bien siempre. Una flota de
   verdad son decenas de vehículos y de personas, y ahí es donde una interfaz
   se rompe o se sostiene.

   Esto genera una operación completa y coherente —24 furgonetas, 31
   conductores, ~9 meses de historial— procedimentalmente, para tener volumen
   sin un fichero de 5.000 líneas.

   TODO ES INVENTADO. Las matrículas acaban en «LAB» y los nombres no
   corresponden a ninguna persona real. Los NOMBRES DE CAMPO son los reales del
   backend, para que la lógica escrita aquí sirva el día que se enchufe.
   ───────────────────────────────────────────────────────────────────────────── */

export const HOY = '2026-08-09'
const MS = 86400000
const hoyMs = Date.parse(HOY + 'T12:00:00Z')
export const dia = (n) => new Date(hoyMs - n * MS).toISOString().slice(0, 10)
export const iso = (n, h = 7, m = 0) =>
  new Date(hoyMs - n * MS).toISOString().slice(0, 11) + `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`

/* Aleatorio reproducible: la misma flota en cada carga. Sin esto, comparar dos
   sesiones es imposible y cada captura de pantalla sale distinta. */
let semilla = 20260809
const rnd = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648 }
const elige = (a) => a[Math.floor(rnd() * a.length)]
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1))

/* ── Centros ─────────────────────────────────────────────────────────────── */
export const centros = ['LAB1', 'LAB2']

/* ── Vehículos ───────────────────────────────────────────────────────────── */
const MODELOS = [
  ['Mercedes-Benz', 'Sprinter', 'AYVENS'], ['Ford', 'Transit', 'BANSACAR'],
  ['Renault', 'Master', 'AYVENS'], ['Volkswagen', 'Crafter', 'VAYVANS'],
  ['MAN', 'TGE', 'AYVENS'], ['Peugeot', 'Boxer', 'SABADELL RENTING'],
  ['Fiat', 'Ducato', 'BANSACAR'], ['Iveco', 'Daily', 'ONE FURGO'],
]
/* 81 furgonetas: el tamaño real de la flota de OGA5. Con 24 las listas y los
   gráficos se ven engañosamente cómodos — la densidad sólo se puede juzgar con
   el volumen de verdad. */
export const vehiculos = Array.from({ length: 81 }, (_, i) => {
  const [brand, model, provider] = MODELOS[i % MODELOS.length]
  const km = entre(28000, 198000)
  const enTaller = i === 2 || i === 11 || i === 19
  const itvDias = i === 5 ? -6 : i === 9 ? 3 : i === 16 ? 11 : entre(40, 700)
  return {
    id: `v${i + 1}`,
    license_plate: `${1001 + i} LAB`,
    brand, model, provider,
    center: centros[i % 2],
    status: enTaller ? 'taller' : 'active',
    workshop_status: enTaller ? elige(['chapa', 'mecanica', 'lunas']) : null,
    workshop_reason: enTaller ? elige([
      'Lateral izquierdo — parte abierto con el renting',
      'Revisión de 40.000 km',
      'Sustitución de parabrisas por impacto',
    ]) : null,
    mileage: km,
    itv_date: dia(-itvDias),
    renting_end_date: dia(-entre(60, 900)),
    oil_last_change_km: km - entre(2000, 16000),
    oil_interval_km: 15000,
    oil_warning_before_km: 2500,
    bags_remaining: entre(0, 40),
    vehicle_type: 'furgon',
    fuel_type: elige(['diesel', 'diesel', 'electrico']),
  }
})
export const vehPorId = (id) => vehiculos.find((v) => v.id === id)

/* ── Conductores ─────────────────────────────────────────────────────────── */
const NOM = ['Marta', 'Nuno', 'Adriana', 'Héctor', 'Olalla', 'Iago', 'Sabela', 'Brais',
  'Antía', 'Xoán', 'Uxía', 'Martiño', 'Noa', 'Anxo', 'Lucía', 'Roi',
  'Carme', 'Xurxo', 'Alba', 'Manuel', 'Iria', 'Diego', 'Xiana', 'Pablo',
  'Nerea', 'Álvaro', 'Sara', 'Denis', 'Ana', 'Tomé', 'Laura']
const APE = ['Iglesias', 'Barreiro', 'Sixto', 'Lameiro', 'Ferreiro', 'Ventoso', 'Randé',
  'Souto', 'Carballo', 'Ledo', 'Pardiñas', 'Vilar', 'Quintás', 'Moldes', 'Fraga']
export const conductores = NOM.map((n, i) => ({
  id: `c${i + 1}`,
  name: `${n} ${APE[i % APE.length]}`,
  driver_id: i === 4 || i === 17 || i === 26 ? '' : `A${String(10000000000 + i * 7919)}L`,
  center: centros[i % 2],
  contrato: i % 4 === 0 ? 'ett' : 'empresa',
  nivel: i < 3 ? 'L1' : i < 6 ? 'L2' : 'pleno',
  phone: `6${entre(10000000, 89999999)}`,
  active: i < 29,
  zona: elige(['Centro', 'Ensanche', 'Rural norte', 'Rural sur', 'Polígono']),
}))
export const condPorId = (id) => conductores.find((c) => c.id === id)
const activos = conductores.filter((c) => c.active)

/* ── Asignación diaria: 18 rutas al día, 120 días ────────────────────────── */
export const asignaciones = Array.from({ length: 120 }, (_, n) => ({
  date: dia(n),
  center: 'LAB1',
  slots: Array.from({ length: 18 }, (_, k) => {
    const v = vehiculos[(k + n * 3) % vehiculos.length]
    const c = activos[(k + n * 5) % activos.length]
    return { vehicle_id: v.id, vehicle_plate: v.license_plate, driver_id: c.id, driver_name: c.name }
  }),
}))

/* ── Inspecciones ────────────────────────────────────────────────────────── */
const SEV = ['sin_danos', 'sin_danos', 'sin_danos', 'leve', 'leve', 'moderado', 'grave']
export const inspecciones = []
for (let n = 0; n < 90; n++) {
  const slots = asignaciones[n].slots
  for (const s of slots) {
    if (rnd() > 0.82) continue                       // no todos inspeccionan cada día
    const sev = elige(SEV)
    const nuevos = sev === 'sin_danos' ? 0 : rnd() > 0.72 ? 1 : 0
    const fallo = rnd() > 0.97
    inspecciones.push({
      id: `i-${n}-${s.vehicle_id}`,
      vehicle_id: s.vehicle_id,
      driver_id: s.driver_id,
      created_at: iso(n, 6, entre(20, 59)),
      analysis_status: fallo ? 'gemini_failed' : 'ok',
      severity: fallo ? null : sev,
      new_damages: nuevos,
      total_damages: sev === 'sin_danos' ? 0 : entre(1, 3),
      estimated_cost: nuevos ? entre(90, 1400) : 0,
      confidence: 0.55 + rnd() * 0.42,
      reviewed: n > 3,
    })
  }
}
inspecciones.sort((a, b) => b.created_at.localeCompare(a.created_at))

/* ── Daños con estado de gestión ─────────────────────────────────────────── */
const PANELES = ['frontal', 'trasera', 'lateral_izquierdo', 'lateral_derecho', 'techo', 'lunas']
const PARTES = {
  frontal: 'paragolpes delantero', trasera: 'portón trasero',
  lateral_izquierdo: 'puerta lateral izquierda', lateral_derecho: 'aleta trasera derecha',
  techo: 'techo', lunas: 'parabrisas',
}
export const danos = []
for (let i = 0; i < 46; i++) {
  const v = elige(vehiculos)
  const panel = elige(PANELES)
  const sev = elige(['leve', 'leve', 'moderado', 'grave'])
  const edad = entre(1, 200)
  const cerrado = edad > 60 && rnd() > 0.35
  const enTaller = !cerrado && rnd() > 0.72
  const est = { leve: entre(80, 260), moderado: entre(280, 620), grave: entre(700, 1600) }[sev]
  danos.push({
    id: `dm${i + 1}`,
    vehicle_id: v.id, panel, part: PARTES[panel], severity: sev,
    repair_status: cerrado ? 'done' : enTaller ? 'assigned' : 'pending',
    workshop_id: cerrado || enTaller ? elige(['w1', 'w2', 'w3']) : null,
    estimated_cost: est,
    actual_cost: cerrado ? Math.round(est * (0.75 + rnd() * 0.6)) : null,
    first_seen: dia(edad),
    /* Fecha de reparación: sin ella no se puede saber cuánto tiempo estuvo
       abierto un daño, que es justo lo que hace visible la línea de vida. */
    repaired_at: cerrado ? dia(Math.max(1, edad - entre(5, 30))) : null,
    first_seen_inspection: null,
  })
}

/* Ledger: los daños abiertos, que es lo que la IA usa como memoria del vehículo */
export const ledger = danos.map((d) => ({
  vehicle_id: d.vehicle_id, panel: d.panel, part: d.part, severity: d.severity,
  rank: { leve: 1, moderado: 2, grave: 3 }[d.severity],
  status: d.repair_status === 'done' ? 'repaired' : 'open',
  first_seen: d.first_seen,
  repaired_at: d.repair_status === 'done' ? dia(entre(1, 40)) : null,
}))

/* ── Incidencias ─────────────────────────────────────────────────────────── */
const TIPOS = ['chapa', 'mecanica', 'lunas', 'neumaticos', 'electrico']
const DESC = {
  chapa: ['Golpe en lateral maniobrando en rampa', 'Roce al salir de la estación', 'Retrovisor partido en calle estrecha'],
  mecanica: ['Testigo de presión de neumáticos', 'Ruido en la transmisión', 'Batería descargada por la mañana'],
  lunas: ['Impacto en parabrisas', 'Luna trasera rayada'],
  neumaticos: ['Pinchazo en rueda delantera', 'Desgaste irregular'],
  electrico: ['Fallo en luz de freno', 'Puerta lateral no cierra'],
}
export const incidencias = Array.from({ length: 34 }, (_, i) => {
  const v = elige(vehiculos)
  const tipo = elige(TIPOS)
  const edad = entre(1, 180)
  const resuelta = edad > 20 && rnd() > 0.25
  return {
    id: `inc${i + 1}`, vehicle_id: v.id, driver_id: elige(activos).id,
    type: tipo, description: elige(DESC[tipo]),
    status: resuelta ? 'resolved' : 'open',
    created_at: iso(edad, entre(8, 20), 0),
    resolved_at: resuelta ? iso(edad - entre(2, 12), 10, 0) : null,
  }
})

/* ── Talleres ────────────────────────────────────────────────────────────── */
export const talleres = [
  { id: 'w1', name: 'Chapa y Pintura Ponte · LAB', city: 'LAB1', categories: ['chapa', 'pintura'], convenios: ['AYVENS'], rating: 4.4, rating_count: 87, phone: '900 000 001', hours: 'L-V 8-18h' },
  { id: 'w2', name: 'Cristalería Vieiro · LAB', city: 'LAB1', categories: ['lunas'], convenios: ['*'], rating: 4.7, rating_count: 213, phone: '900 000 002', hours: 'L-S 9-20h' },
  { id: 'w3', name: 'Mecánica Ribeira · LAB', city: 'LAB2', categories: ['mecanica', 'neumaticos'], convenios: ['BANSACAR', 'VAYVANS'], rating: 4.1, rating_count: 45, phone: '900 000 003', hours: 'L-V 8-17h' },
  { id: 'w4', name: 'Oficial Furgo · LAB', city: 'LAB2', categories: ['mecanica', 'oficial'], convenios: ['*'], rating: 4.9, rating_count: 156, phone: '900 000 004', hours: 'L-V 9-19h', is_official: true },
]

/* ── Reparto de hoy (Cortex) ─────────────────────────────────────────────── */
const hace = (m) => new Date(Date.now() - m * 60000).toISOString()
export const rutas = Array.from({ length: 18 }, (_, i) => {
  const total = entre(140, 195)
  const avance = i === 4 ? 0.62 : i === 11 ? 0.71 : 0.82 + rnd() * 0.16
  const delivered = Math.round(total * avance)
  const parado = i === 4 ? 147 : i === 11 ? 128 : entre(3, 40)
  const s = asignaciones[0].slots[i]
  return {
    route_code: `CX-${101 + i}`,
    driver_id: s.driver_id, driver_name: s.driver_name, vehicle_id: s.vehicle_id,
    total, delivered,
    pendientes: total - delivered,
    missing: rnd() > 0.86 ? entre(1, 3) : 0,
    attempted: entre(0, 9),
    min_sin_entregar: parado,
    ultima_entrega: hace(parado),
  }
})
export const cortexOverview = {
  tracked: rutas.reduce((a, r) => a + r.total, 0),
  missing_now: rutas.reduce((a, r) => a + r.missing, 0),
  recovered_today: 3, lost: 0, recovery_pct: 100, avg_recovery_min: 51,
  last_capture_at: hace(9),
}

/* ── Aparcamiento ────────────────────────────────────────────────────────── */
export const aparcamiento = {
  filas: ['A', 'B', 'C'],
  porFila: 8,
  ocupacion: vehiculos.slice(0, 20).map((v, i) => ({
    plaza: `${['A', 'B', 'C'][Math.floor(i / 8)]}${(i % 8) + 1}`,
    vehicle_id: v.id, license_plate: v.license_plate,
  })),
}

/* ── Métricas semanales del DSP ──────────────────────────────────────────── */
export const semanas = [
  { semana: 28, whc: 81.5, dcr: 98.4, dsc_dpmo: 1840, tier: 'Poor', overall: 62.1, excepciones: 12 },
  { semana: 29, whc: 100, dcr: 99.1, dsc_dpmo: 1610, tier: 'Fair', overall: 69.49, excepciones: 0 },
  { semana: 30, whc: 100, dcr: 99.4, dsc_dpmo: 1120, tier: 'Great', overall: 78.2, excepciones: 0 },
  { semana: 31, whc: 97.1, dcr: 99.2, dsc_dpmo: 980, tier: 'Great', overall: 79.6, excepciones: 2 },
]
export const semanaEnCurso = { semana: 32, excepciones_hasta_ahora: 0, conductores: 29, cerrada: false }

/* ── WHC de la semana: horas por conductor ───────────────────────────────── */
export const whc = {
  pegado_el: iso(4, 9, 12),
  semana: 32,
  limite_min: 55 * 60,
  dia: 7,
  conductores: activos.slice(0, 22).map((c, i) => {
    const trabajado = entre(2100, 3300)
    const restantes = i % 3 === 0 ? 0 : 1
    return {
      driver_id: c.id, nombre: c.name,
      trabajado, planificado: trabajado + entre(60, 300),
      bloques_restantes: restantes,
      proyeccion: trabajado + restantes * 540,
    }
  }),
}

/* ── DSC por conductor ───────────────────────────────────────────────────── */
export const FLOTA_PCT = 8.31
export const dscConductores = activos.slice(0, 20).map((c, i) => {
  const entregas = entre(90, 640)
  const pct = i === 0 ? 19.4 : i === 1 ? 15.1 : i === 19 ? 2.2 : 4 + rnd() * 9
  return { driver_id: c.id, nombre: c.name, entregas, sin_nadie: Math.round((entregas * pct) / 100) }
})

/* ── Turnos / cuadrante de la semana ─────────────────────────────────────── */
export const turnos = activos.slice(0, 24).map((c) => ({
  driver_id: c.id, nombre: c.name, contrato: c.contrato,
  dias: Array.from({ length: 7 }, () => (rnd() > 0.22 ? 'ruta' : 'libre')),
}))

/* ── Chat del centro ─────────────────────────────────────────────────────── */
export const chat = [
  { id: 'm1', autor: 'Dani', at: hace(35), txt: '¿Alguien ha visto la llave de la 1012 LAB?' },
  { id: 'm2', autor: 'Marta Iglesias', at: hace(28), txt: 'La dejé en el panel, colgada en el gancho 3.' },
  { id: 'm3', autor: 'Dani', at: hace(12), txt: 'La 1003 LAB entra en chapa mañana, no la asignéis.' },
  { id: 'm4', autor: 'Nuno Barreiro', at: hace(6), txt: 'En CX-105 me faltan 2 bolsas, aviso por si aparecen.' },
]

/* ── Frescura de las fuentes ─────────────────────────────────────────────── */
export const fuentes = {
  cortex: { etiqueta: 'Cortex (extensión)', actualizado: cortexOverview.last_capture_at, modo: 'automático', desfase_dias: 0 },
  whc: { etiqueta: 'Plan de horas', actualizado: whc.pegado_el, modo: 'manual', desfase_dias: 0 },
  scorecard: { etiqueta: 'Scorecard semanal', actualizado: iso(2, 10), modo: 'manual', desfase_dias: 2 },
  inspecciones: { etiqueta: 'Inspecciones', actualizado: inspecciones[0]?.created_at, modo: 'automático', desfase_dias: 0 },
  flota: { etiqueta: 'Ficha de vehículos', actualizado: iso(3, 8), modo: 'manual', desfase_dias: 0 },
}
