/* ─────────────────────────────────────────────────────────────────────────────
   LAB · DATOS SINTÉTICOS
   ---------------------------------------------------------------------------
   TODO lo de este fichero es INVENTADO. No sale de ninguna base de datos, ni
   de producción ni del LAB. Sirve para probar interfaces, no para afirmar nada.

   Señales de que es falso, a propósito y a la vista:
     · todas las matrículas terminan en "LAB"
     · los nombres no corresponden a ninguna persona real
     · cada pantalla del laboratorio lleva una banda "DATOS SINTÉTICOS"

   REGLA DE ORO de este fichero: cada campo se llama IGUAL que el campo real
   del backend, para que el motor de señales (motor.js) esté escrito contra el
   esquema de verdad y se pueda enchufar a la API sin reescribirlo.

   Correspondencia con el backend real (comprobada en backend/server.py):
     vehiculos            → colección `vehicles`            (Vehicle, server.py:232)
     ledger               → colección `vehicle_damage_ledger` (server.py:6889)
     asignaciones         → colección `daily_assignments`   (server.py:5157)
     inspecciones         → colección `inspections`         (Inspection, server.py:502)
     rutas                → GET /cortex/routes              (server.py:21079)
     cortexOverview       → GET /cortex/overview            (server.py:21023)
     whc                  → GET /whc/analizar               (server.py:_whc_ritmo, 20220)
   ───────────────────────────────────────────────────────────────────────────── */

export const SINTETICO = true

/* Hoy fijo: un prototipo que cambia de estado según el día en que se abre no se
   puede comparar entre sesiones ni enseñar dos veces igual. */
export const HOY = '2026-08-08'          // sábado
const d = (n) => {                        // n días antes de HOY, ISO corto
  const t = new Date(HOY + 'T12:00:00Z')
  t.setUTCDate(t.getUTCDate() - n)
  return t.toISOString().slice(0, 10)
}
const hace = (min) => new Date(Date.parse(HOY + 'T14:20:00Z') - min * 60000).toISOString()

/* ── Conductores ─────────────────────────────────────────────────────────── */
export const conductores = [
  { id: 'c1', name: 'Marta Iglesias',  driver_id: 'A00000000000L1', center: 'LAB1', nivel: 'pleno', contrato: 'empresa' },
  { id: 'c2', name: 'Nuno Barreiro',   driver_id: 'A00000000000L2', center: 'LAB1', nivel: 'pleno', contrato: 'empresa' },
  { id: 'c3', name: 'Adriana Sixto',   driver_id: '',               center: 'LAB1', nivel: 'L2',    contrato: 'ett' },
  { id: 'c4', name: 'Héctor Lameiro',  driver_id: 'A00000000000L4', center: 'LAB1', nivel: 'pleno', contrato: 'empresa' },
  { id: 'c5', name: 'Olalla Ferreiro', driver_id: 'A00000000000L5', center: 'LAB1', nivel: 'L1',    contrato: 'ett' },
]
export const conductorPorId = (id) => conductores.find((c) => c.id === id) || null

/* ── Vehículos ───────────────────────────────────────────────────────────── */
export const vehiculos = [
  { id: 'v1', license_plate: '1001 LAB', brand: 'Mercedes-Benz', model: 'Sprinter', status: 'active',
    center: 'LAB1', provider: 'AYVENS', mileage: 148200, itv_date: d(-11), renting_end_date: d(-240),
    oil_last_change_km: 132000, oil_interval_km: 15000, oil_warning_before_km: 2500 },
  // ITV ya vencida a propósito: sin un caso pasado, la rama "caducada" del
  // motor nunca se ve y no se puede juzgar cómo queda en pantalla.
  { id: 'v2', license_plate: '1002 LAB', brand: 'Ford', model: 'Transit', status: 'active',
    center: 'LAB1', provider: 'BANSACAR', mileage: 96400, itv_date: d(4), renting_end_date: d(-410),
    oil_last_change_km: 94000, oil_interval_km: 15000, oil_warning_before_km: 2500 },
  { id: 'v3', license_plate: '1003 LAB', brand: 'Renault', model: 'Master', status: 'taller',
    center: 'LAB1', provider: 'AYVENS', mileage: 121050, itv_date: d(-95), renting_end_date: d(-300),
    workshop_status: 'chapa', workshop_reason: 'Lateral izquierdo — parte abierto con el renting',
    oil_last_change_km: 118000, oil_interval_km: 15000, oil_warning_before_km: 2500 },
  { id: 'v4', license_plate: '1004 LAB', brand: 'Volkswagen', model: 'Crafter', status: 'active',
    center: 'LAB1', provider: 'VAYVANS', mileage: 74300, itv_date: d(-320), renting_end_date: d(-520),
    oil_last_change_km: 60500, oil_interval_km: 15000, oil_warning_before_km: 2500 },
  { id: 'v5', license_plate: '1005 LAB', brand: 'MAN', model: 'TGE', status: 'active',
    center: 'LAB1', provider: 'AYVENS', mileage: 39900, itv_date: d(-420), renting_end_date: d(-600),
    oil_last_change_km: 30000, oil_interval_km: 15000, oil_warning_before_km: 2500 },
]
export const vehiculoPorId = (id) => vehiculos.find((v) => v.id === id) || null

/* ── Registro de daños (ledger) ──────────────────────────────────────────────
   Esquema real: {vehicle_id, panel, part, severity, rank, status, source,
                  first_seen, first_seen_inspection, repaired_at, repaired_note}
   `first_seen_inspection` es la pieza que permite ATRIBUIR: apunta a la
   inspección donde el daño se vio por PRIMERA vez. Todo lo anterior a esa
   inspección y posterior a la anterior es la ventana de incertidumbre. */
export const ledger = [
  { vehicle_id: 'v1', panel: 'lateral_izquierdo', part: 'puerta lateral izquierda', severity: 'moderado',
    rank: 2, status: 'open', source: 'ai', first_seen: d(1), first_seen_inspection: 'i-v1-07' },
  { vehicle_id: 'v1', panel: 'trasera', part: 'portón trasero', severity: 'leve',
    rank: 1, status: 'open', source: 'ai', first_seen: d(26), first_seen_inspection: 'i-v1-01' },
  { vehicle_id: 'v1', panel: 'frontal', part: 'paragolpes delantero', severity: 'leve',
    rank: 1, status: 'repaired', source: 'ai', first_seen: d(58), first_seen_inspection: 'i-v1-00',
    repaired_at: d(30), repaired_note: 'Paragolpes sustituido' },
  { vehicle_id: 'v2', panel: 'lateral_derecho', part: 'aleta trasera derecha', severity: 'leve',
    rank: 1, status: 'open', source: 'ai', first_seen: d(12), first_seen_inspection: 'i-v2-03' },
  { vehicle_id: 'v3', panel: 'lateral_izquierdo', part: 'panel lateral izquierdo', severity: 'grave',
    rank: 3, status: 'open', source: 'ai', first_seen: d(4), first_seen_inspection: 'i-v3-05' },
  { vehicle_id: 'v4', panel: 'techo', part: 'techo', severity: 'leve',
    rank: 1, status: 'open', source: 'ai', first_seen: d(40), first_seen_inspection: 'i-v4-01' },
]

/* ── Inspecciones (sólo los campos que usa el laboratorio) ───────────────── */
export const inspecciones = [
  { id: 'i-v1-07', vehicle_id: 'v1', driver_id: 'c3', created_at: d(1)  + 'T06:52:00Z', analysis_status: 'ok',
    severity: 'moderado', new_damages: 1, total_damages: 2, estimated_cost: 420, confidence: 0.71 },
  { id: 'i-v1-06', vehicle_id: 'v1', driver_id: 'c1', created_at: d(2)  + 'T06:41:00Z', analysis_status: 'ok',
    severity: 'leve',     new_damages: 0, total_damages: 1, estimated_cost: 0,   confidence: 0.83 },
  { id: 'i-v1-01', vehicle_id: 'v1', driver_id: 'c1', created_at: d(26) + 'T06:48:00Z', analysis_status: 'ok',
    severity: 'leve',     new_damages: 1, total_damages: 1, estimated_cost: 130, confidence: 0.66 },
  { id: 'i-v1-00', vehicle_id: 'v1', driver_id: 'c2', created_at: d(58) + 'T06:39:00Z', analysis_status: 'ok',
    severity: 'leve',     new_damages: 1, total_damages: 1, estimated_cost: 210, confidence: 0.74 },
  { id: 'i-v3-05', vehicle_id: 'v3', driver_id: 'c4', created_at: d(4)  + 'T06:35:00Z', analysis_status: 'ok',
    severity: 'grave',    new_damages: 1, total_damages: 1, estimated_cost: 1180, confidence: 0.88 },
  { id: 'i-v2-03', vehicle_id: 'v2', driver_id: 'c5', created_at: d(12) + 'T06:58:00Z', analysis_status: 'ok',
    severity: 'leve',     new_damages: 1, total_damages: 1, estimated_cost: 95,  confidence: 0.62 },
  { id: 'i-v4-09', vehicle_id: 'v4', driver_id: 'c2', created_at: d(0)  + 'T06:44:00Z', analysis_status: 'gemini_failed',
    severity: null,       new_damages: 0, total_damages: 0, estimated_cost: 0,   confidence: 0 },
  { id: 'i-v5-09', vehicle_id: 'v5', driver_id: 'c5', created_at: d(0)  + 'T06:31:00Z', analysis_status: 'ok',
    severity: 'sin_danos', new_damages: 0, total_damages: 0, estimated_cost: 0,  confidence: 0.91 },
]

/* ── Asignación diaria ───────────────────────────────────────────────────────
   Esquema real: {date, center, slots:[{vehicle_id, vehicle_plate, driver_id, driver_name}]}
   Es la ÚNICA forma de saber quién llevaba una furgoneta un día dado. */
export const asignaciones = (() => {
  const rot = [
    ['c1', 'c2', 'c3', 'c4', 'c5'],
    ['c3', 'c1', 'c4', 'c2', 'c5'],
    ['c2', 'c3', 'c1', 'c5', 'c4'],
  ]
  const out = []
  for (let n = 0; n <= 60; n++) {
    const fila = rot[n % rot.length]
    out.push({
      date: d(n), center: 'LAB1',
      slots: vehiculos.map((v, i) => ({
        vehicle_id: v.id, vehicle_plate: v.license_plate,
        driver_id: fila[i], driver_name: conductorPorId(fila[i])?.name || '',
      })),
    })
  }
  return out
})()

/* ── Cortex: rutas de hoy (GET /cortex/routes) ───────────────────────────── */
export const rutas = [
  { route_code: 'CX-101', driver_id: 'c1', driver_name: 'Marta Iglesias',  total: 168, delivered: 151, missing: 0, attempted: 4,  pendientes: 17, min_sin_entregar: 12,  ultima_entrega: hace(12) },
  { route_code: 'CX-102', driver_id: 'c2', driver_name: 'Nuno Barreiro',   total: 155, delivered: 143, missing: 1, attempted: 2,  pendientes: 12, min_sin_entregar: 9,   ultima_entrega: hace(9) },
  { route_code: 'CX-103', driver_id: 'c3', driver_name: 'Adriana Sixto',   total: 171, delivered: 118, missing: 0, attempted: 11, pendientes: 53, min_sin_entregar: 134, ultima_entrega: hace(134) },
  { route_code: 'CX-104', driver_id: 'c4', driver_name: 'Héctor Lameiro',  total: 149, delivered: 140, missing: 0, attempted: 1,  pendientes: 9,  min_sin_entregar: 7,   ultima_entrega: hace(7) },
  { route_code: 'CX-105', driver_id: 'c5', driver_name: 'Olalla Ferreiro', total: 162, delivered: 138, missing: 3, attempted: 6,  pendientes: 24, min_sin_entregar: 21,  ultima_entrega: hace(21) },
]

/* ── Cortex: cabecera (GET /cortex/overview) ─────────────────────────────── */
export const cortexOverview = {
  tracked: 805, missing_now: 4, missing_today: 4, recovered_today: 2, lost: 0,
  recovery_pct: 100, avg_recovery_min: 48, health: 76,
  last_capture_at: hace(8),          // ← frescura real de la extensión
}

/* ── WHC (GET /whc/analizar) ─────────────────────────────────────────────────
   Campos reales del backend: trabajado, planificado, margen_semanal,
   proyeccion, proyeccion_pasa, estado_ritmo, bloques_restantes, al_limite.
   Minutos, como en el backend. `limite_min` es el límite PROPIO (55 h), NO el
   de Amazon: docs/WHC.md §6 demuestra que el de Amazon está por encima de
   56 h 30 m y que no se conoce. */
export const whc = {
  pegado_el: d(5) + 'T09:12:00Z',     // el plan se pega a mano: esto es su frescura
  semana: 32,
  limite_min: 55 * 60,
  dia: 7,                              // sábado, 6.º bloque de la semana
  conductores: [
    { driver_id: 'c1', nombre: 'Marta Iglesias',  trabajado: 2886, planificado: 3105, bloques_restantes: 1, proyeccion: 3426, estado_ritmo: 'peligro' },
    { driver_id: 'c2', nombre: 'Nuno Barreiro',   trabajado: 2451, planificado: 2700, bloques_restantes: 1, proyeccion: 2991, estado_ritmo: 'ok' },
    { driver_id: 'c3', nombre: 'Adriana Sixto',   trabajado: 3180, planificado: 3285, bloques_restantes: 1, proyeccion: 3720, estado_ritmo: 'pasado' },
    { driver_id: 'c4', nombre: 'Héctor Lameiro',  trabajado: 2205, planificado: 2430, bloques_restantes: 1, proyeccion: 2745, estado_ritmo: 'ok' },
    { driver_id: 'c5', nombre: 'Olalla Ferreiro', trabajado: 1960, planificado: 2160, bloques_restantes: 1, proyeccion: 2500, estado_ritmo: 'ok' },
  ],
}

/* ── Cola de revisión / incidencias (contadores sueltos) ─────────────────── */
export const contadores = {
  cola_revision: 6,
  incidencias_abiertas: 2,
  inspecciones_fallidas: 1,           // analysis_status != 'ok'
  // Del cuadrante de hoy, las que aún no han pasado inspección.
  // Con datos reales sale de GET /stats/attention (missing_today).
  asignadas_hoy: 5,
  sin_inspeccion_hoy_total: 2,
  sin_inspeccion_hoy: [
    { plate: '1002 LAB', driver: 'Nuno Barreiro' },
    { plate: '1003 LAB', driver: 'Héctor Lameiro' },
  ],
}

/* ── Incidencias ─────────────────────────────────────────────────────────────
   Colección `incidents`. Campos reales: {id, vehicle_id, driver_id, type,
   description, status, created_at, resolved_at}.
   Ojo con el patrón: 1003 LAB acumula tres del mismo tipo. Eso es lo que hace
   posible el experimento de MEMORIA — y también donde es fácil pasarse: tres
   casos son un patrón débil, y la interfaz tiene que decirlo. */
export const incidencias = [
  { id: 'inc1', vehicle_id: 'v3', driver_id: 'c4', type: 'chapa', status: 'open',
    description: 'Golpe en lateral izquierdo maniobrando en rampa', created_at: d(4) + 'T18:20:00Z' },
  { id: 'inc2', vehicle_id: 'v3', driver_id: 'c1', type: 'chapa', status: 'resolved',
    description: 'Roce lateral izquierdo al salir de la estación', created_at: d(47) + 'T17:10:00Z', resolved_at: d(40) + 'T09:00:00Z' },
  { id: 'inc3', vehicle_id: 'v3', driver_id: 'c2', type: 'chapa', status: 'resolved',
    description: 'Retrovisor izquierdo partido en calle estrecha', created_at: d(96) + 'T16:40:00Z', resolved_at: d(90) + 'T11:00:00Z' },
  { id: 'inc4', vehicle_id: 'v1', driver_id: 'c3', type: 'mecanica', status: 'open',
    description: 'Testigo de presión de neumáticos encendido', created_at: d(1) + 'T07:05:00Z' },
  { id: 'inc5', vehicle_id: 'v2', driver_id: 'c5', type: 'lunas', status: 'resolved',
    description: 'Impacto en parabrisas', created_at: d(30) + 'T12:00:00Z', resolved_at: d(28) + 'T10:00:00Z' },
]

/* ── Scorecard por conductor (semana en curso) ───────────────────────────────
   Colección `driver_scorecard`. Sólo se usan los campos que la ficha enseña. */
export const scorecardConductores = [
  { driver_id: 'c1', semana: 32, dcr: 99.4, dnr_dpmo: 780,  pod: 98.9, tier: 'Great' },
  { driver_id: 'c2', semana: 32, dcr: 99.8, dnr_dpmo: 210,  pod: 99.5, tier: 'Fantastic' },
  { driver_id: 'c3', semana: 32, dcr: 96.1, dnr_dpmo: 2450, pod: 97.2, tier: 'Fair' },
  { driver_id: 'c4', semana: 32, dcr: 99.1, dnr_dpmo: 640,  pod: 99.0, tier: 'Great' },
  { driver_id: 'c5', semana: 32, dcr: 98.7, dnr_dpmo: 990,  pod: 98.1, tier: 'Great' },
]

/* ── Frescura declarada de cada fuente ───────────────────────────────────────
   Esto NO es adorno: es lo que permite decir "esto no lo sé" en vez de mentir.
   `desfase_dias` documenta retrasos ESTRUCTURALES conocidos de la fuente. */
export const fuentes = {
  cortex:     { etiqueta: 'Cortex (extensión Chrome)', actualizado: cortexOverview.last_capture_at, modo: 'automático', desfase_dias: 0 },
  whc:        { etiqueta: 'WHC (plan pegado a mano)',  actualizado: whc.pegado_el,                  modo: 'manual',     desfase_dias: 0 },
  scorecard:  { etiqueta: 'Scorecard semanal (PDF)',   actualizado: d(2) + 'T10:00:00Z',            modo: 'manual',     desfase_dias: 2 },
  inspecciones: { etiqueta: 'Inspecciones',            actualizado: hace(465),                      modo: 'automático', desfase_dias: 0 },
  flota:      { etiqueta: 'Ficha de vehículos',        actualizado: d(3) + 'T08:00:00Z',            modo: 'manual',     desfase_dias: 0 },
}

/* ── El paquete que consume el motor ─────────────────────────────────────────
   Misma forma exacta que devuelve apiLab.js con datos reales del LAB. Ése es
   todo el truco: el motor no distingue uno de otro. */
export const DATOS_SINTETICOS = {
  hoy: HOY,
  origen: 'sintetico',
  vehiculos, conductores, ledger, inspecciones, asignaciones,
  rutas, cortexOverview, whc, contadores, fuentes,
  incidencias, scorecardConductores,
}
