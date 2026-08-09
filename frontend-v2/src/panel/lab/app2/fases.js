/* ─────────────────────────────────────────────────────────────────────────────
   FLOTADSP 2.0 · EL MODELO MENTAL
   ---------------------------------------------------------------------------
   La aplicación actual tiene 35 pantallas organizadas por MÓDULOS: vehículos,
   conductores, inspecciones, turnos, scorecard, talleres… Eso obliga al manager
   a saber en qué módulo vive lo que necesita, y a reconstruir su día saltando
   entre ellos.

   Pero un DSP no trabaja por módulos. Trabaja por HORAS, y su día tiene una
   forma que se repite todos los días:

     05-09  ANTES DE SALIR   ¿sale todo el mundo? ¿con qué furgoneta?
     09-20  EN RUTA          ¿va bien? ¿hay que rescatar algo?
     20-23  AL CERRAR        ¿qué ha vuelto? ¿qué se ha roto?
     ——     LA SEMANA        ¿voy a mantener el tier? ¿qué decidí y funcionó?

   Así que 2.0 no es un menú: es una jornada. La aplicación sabe qué hora es y
   te pone delante la fase en la que estás. Puedes moverte a otra, pero no
   tienes que elegir un módulo — y sobre todo, no tienes que acordarte de mirar.

   Las cuatro fases cubren lo que hoy son 35 pantallas. Lo que no cabe en una
   fase es que probablemente no había que mirarlo cada día.

   Datos: LAB/SIMULATED (datos.js). La lógica va contra los campos reales.
   ───────────────────────────────────────────────────────────────────────────── */
import {
  HOY, vehiculos, conductores, asignaciones, inspecciones, rutas,
  cortexOverview, whc, incidencias, danos, ledger, semanaEnCurso,
} from '../datos'
import { estadoTier } from '../v2/negocio'
import { causasRetorno, analisisCierre, estadoVentana, rankingDSC, FOCOS } from '../v2/amazon'
import { detectarCasos, historial, resultado } from '../v3/deteccion'

const nombreDe = (id) => conductores.find((c) => c.id === id)?.name || '—'
const vehDe = (id) => vehiculos.find((v) => v.id === id)
const min = (iso) => (iso ? Math.round((Date.now() - Date.parse(iso)) / 60000) : null)

export const FASES = [
  { id: 'arranque', nombre: 'Antes de salir', desde: 5,  hasta: 9,  sub: 'Que salga todo el mundo' },
  { id: 'ruta',     nombre: 'En ruta',        desde: 9,  hasta: 20, sub: 'Cómo va el reparto' },
  { id: 'cierre',   nombre: 'Al cerrar',      desde: 20, hasta: 24, sub: 'Qué ha vuelto y qué se ha roto' },
  { id: 'semana',   nombre: 'La semana',      desde: -1, hasta: -1, sub: 'El tier y lo que decidiste' },
]

export function faseActual(hora = new Date().getHours()) {
  const f = FASES.find((x) => x.desde >= 0 && hora >= x.desde && hora < x.hasta)
  return f ? f.id : 'semana'
}

/* ═══ FASE 1 · ANTES DE SALIR ══════════════════════════════════════════════
   Sustituye a: Asignación, Turnos, Checklist, AvisosITV, Vencimientos,
   Renting, ExpiryAlerts y media pantalla de Vehículos.
   La pregunta única: ¿puede salir cada ruta? */
export function arranque() {
  const cuadrante = asignaciones.find((a) => a.date === HOY)?.slots || []
  const inspHoy = new Set(inspecciones.filter((i) => i.created_at.startsWith(HOY)).map((i) => i.vehicle_id))
  const inspFallida = new Set(
    inspecciones.filter((i) => i.created_at.startsWith(HOY) && i.analysis_status !== 'ok').map((i) => i.vehicle_id))

  const filas = cuadrante.map((s) => {
    const v = vehDe(s.vehicle_id)
    const bloqueos = []
    if (v?.status === 'taller') bloqueos.push({ tipo: 'taller', txt: 'En taller', detalle: v.workshop_reason || '' })
    if (v?.itv_date) {
      const d = Math.round((Date.parse(v.itv_date + 'T12:00:00Z') - Date.parse(HOY + 'T12:00:00Z')) / 86400000)
      if (d <= 0) bloqueos.push({ tipo: 'itv', txt: 'ITV caducada', detalle: `venció el ${v.itv_date}` })
      else if (d <= 15) bloqueos.push({ tipo: 'itv', txt: `ITV en ${d} días`, detalle: '', leve: true })
    }
    return {
      vehicle_id: s.vehicle_id,
      matricula: v?.license_plate || s.vehicle_plate || '—',
      modelo: v ? `${v.brand} ${v.model}` : '',
      conductor: s.driver_name || nombreDe(s.driver_id),
      driver_id: s.driver_id,
      inspeccion: inspFallida.has(s.vehicle_id) ? 'fallida' : inspHoy.has(s.vehicle_id) ? 'ok' : 'falta',
      bloqueos,
      puedeSalir: !bloqueos.some((b) => !b.leve),
    }
  })

  const reserva = vehiculos.filter(
    (v) => v.status !== 'taller' && !cuadrante.some((s) => s.vehicle_id === v.id))

  return {
    filas,
    reserva: reserva.map((v) => v.license_plate),
    bloqueadas: filas.filter((f) => !f.puedeSalir).length,
    sinInspeccion: filas.filter((f) => f.inspeccion === 'falta').length,
    alertas: filas.filter((f) => !f.puedeSalir).length + filas.filter((f) => f.inspeccion !== 'ok').length,
  }
}

/* ═══ FASE 2 · EN RUTA ═════════════════════════════════════════════════════
   Sustituye a: PackageIntel, Dashboard "en vivo", Actividad.
   La pregunta única: ¿hay algo que atender AHORA? */
const PARON = 120
export function ruta() {
  const filas = rutas.map((r) => ({
    ...r,
    pct: Math.round((r.delivered / r.total) * 100),
    parada: (r.min_sin_entregar ?? 0) >= PARON,
  })).sort((a, b) => (b.min_sin_entregar ?? 0) - (a.min_sin_entregar ?? 0))

  const frescura = min(cortexOverview.last_capture_at)
  return {
    filas,
    paradas: filas.filter((r) => r.parada).length,
    perdidos: cortexOverview.missing_now || 0,
    entregados: filas.reduce((a, r) => a + r.delivered, 0),
    total: filas.reduce((a, r) => a + r.total, 0),
    frescura,
    // Frescura por encima de 45 min: lo de esta pantalla está congelado.
    congelado: frescura !== null && frescura > 45,
    alertas: filas.filter((r) => r.parada).length + (cortexOverview.missing_now || 0),
  }
}

/* ═══ FASE 3 · AL CERRAR ═══════════════════════════════════════════════════
   Sustituye a: Inspecciones, RevisiónRápida, Incidencias, Talleres.
   La pregunta única: ¿qué ha pasado hoy que mañana sea un problema? */
export function cierre() {
  const cas = detectarCasos(nombreDe)
  const nuevos = ledger.filter((l) => l.status === 'open' &&
    Math.abs(Math.round((Date.parse(l.first_seen + 'T12:00:00Z') - Date.parse(HOY + 'T12:00:00Z')) / 86400000)) <= 2)
  const sinGestionar = danos.filter((d) => d.repair_status !== 'done' && !d.workshop_id)
  const incidenciasAbiertas = incidencias.filter((i) => i.status !== 'resolved')
  const c = analisisCierre()

  return {
    casos: cas,
    danosNuevos: nuevos.map((l) => ({
      ...l, matricula: vehDe(l.vehicle_id)?.license_plate || l.vehicle_id,
    })),
    sinGestionar: sinGestionar.length,
    sinGestionarEur: sinGestionar.reduce((a, d) => a + (d.estimated_cost || 0), 0),
    incidencias: incidenciasAbiertas.map((i) => ({
      ...i, matricula: vehDe(i.vehicle_id)?.license_plate || i.vehicle_id, quien: nombreDe(i.driver_id),
    })),
    causas: causasRetorno,
    cierreHorario: c,
    alertas: cas.filter((x) => x.veredicto !== 'sin_distinguir').length + nuevos.length,
  }
}

/* ═══ FASE 4 · LA SEMANA ═══════════════════════════════════════════════════
   Sustituye a: Scorecard, WHC, DSC, Métricas, Conductores(scoring).
   La pregunta única: ¿voy a mantener el tier, y lo que hice funcionó? */
export function semana() {
  const tier = estadoTier({ whc, semanaEnCurso })
  const ventana = estadoVentana(HOY)
  const dsc = rankingDSC().filter((c) => c.entra)
  const cerrados = historial.map((h) => ({ ...h, r: resultado(h) }))
  const foco = FOCOS[0]

  return {
    tier, ventana, dsc, cerrados, foco,
    funcionaron: cerrados.filter((h) => h.r.estado === 'funciono').length,
    midiendo: cerrados.filter((h) => h.r.estado === 'sin_datos').length,
    alertas: (tier?.enZona.length || 0) + ventana.enRiesgo.length,
  }
}

export function resumenFases() {
  return {
    arranque: arranque().alertas,
    ruta: ruta().alertas,
    cierre: cierre().alertas,
    semana: semana().alertas,
  }
}
