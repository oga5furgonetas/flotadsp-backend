/* ─────────────────────────────────────────────────────────────────────────────
   LAB · ADAPTADOR DE DATOS REALES
   ---------------------------------------------------------------------------
   Trae del backend del LAB exactamente el mismo paquete que datos.js fabrica a
   mano, para que el motor de señales no distinga uno de otro.

   Todo lo de aquí es de SOLO LECTURA (GET). La única excepción es
   POST /whc/analizar, que a pesar del verbo no escribe nada MIENTRAS no se le
   pase `center`: la pantalla de WHC usa ese campo justo para que el backend
   GUARDE el plan, así que aquí se omite a propósito.

   Coste: entre 6 y ~30 peticiones según la flota. Se informa en pantalla, no
   se esconde: un panel que dispara 40 llamadas sin decirlo es un panel que
   alguien acabará culpando de "ir lento".
   ───────────────────────────────────────────────────────────────────────────── */
import {
  getVehicles, getDrivers, getInspections, getDailyAssignment,
  getVehicleDamageLedger, cortexRoutes, cortexOverview, getWhcPlan, getAttention,
} from '../api'
import { api } from '../../services/api'   // el axios con el token, no lo reexporta panel/api.js
import { lista } from '../../lib/lista'

const DIA = 86400000
const iso = (d) => d.toISOString().slice(0, 10)
const hoyISO = () => iso(new Date())

/* Cuántos días de asignación diaria se piden. Es lo que fija cuánto se puede
   estrechar la ventana de atribución: sin asignaciones no hay a quién acotar.
   14 días = 14 peticiones. Más allá, el coste no compensa (un daño de hace
   tres semanas ya no es accionable). */
const DIAS_ASIGNACION = 14
/* Tope de ledgers a pedir. Un ledger por vehículo con inspección reciente. */
const MAX_LEDGERS = 25

async function seguro(promesa, porDefecto) {
  try { return await promesa } catch { return porDefecto }
}

export async function cargarDatosReales(center) {
  const hoy = hoyISO()
  let peticiones = 0
  const errores = []

  /* ── 1 · Lo barato y en paralelo ────────────────────────────────────────── */
  /* getAttention = GET /stats/attention. Ya existía en el backend ("qué
     necesita mi atención HOY") y en este cliente, pero en frontend-v2 no lo
     llamaba NADIE: sólo lo usaba la app legada. Aquí se reaprovecha. */
  peticiones += 6
  const [vehRes, drvRes, inspRes, rutasRes, cxRes, attRes] = await Promise.all([
    seguro(getVehicles(center), { data: [] }),
    seguro(getDrivers(center), { data: [] }),
    seguro(getInspections({ limit: 400 }), { data: [] }),
    seguro(cortexRoutes(hoy, center), { data: null }),
    seguro(cortexOverview(hoy, center), { data: null }),
    seguro(getAttention(), { data: null }),
  ])

  const vehiculos = lista(vehRes.data)
  const conductores = lista(drvRes.data)
  if (!vehiculos.length) errores.push('No se recibió ningún vehículo')

  /* Inspecciones: aplanar analysis.* a los campos que usa el motor.
     Lo hace el adaptador, no el motor, para que el motor siga siendo el mismo
     con datos sintéticos. */
  const inspecciones = lista(inspRes.data).map((i) => {
    const a = i.analysis || {}
    return {
      id: i.id,
      vehicle_id: i.vehicle_id,
      driver_id: i.driver_id,
      created_at: i.created_at,
      analysis_status: i.analysis_status,
      severity: a.severity ?? null,
      new_damages: (a.new_damages || []).length,
      total_damages: (a.damages || []).length,
      estimated_cost: Math.round(a.total_estimated_cost || 0),
      confidence: a.confidence || 0,
    }
  }).filter((i) => i.created_at)

  /* ── 2 · WHC ─────────────────────────────────────────────────────────────
     El plan guardado trae el texto pegado; hay que analizarlo para obtener la
     proyección. Sin `center` en el cuerpo → el backend NO lo vuelve a guardar. */
  let whc = null
  const centroWHC = center && center !== 'Todos' ? center : (vehiculos[0]?.center || '')
  if (centroWHC) {
    peticiones += 1
    const plan = await seguro(getWhcPlan(centroWHC), { data: null })
    const texto = plan.data?.texto || plan.data?.plan || ''
    if (plan.data?.hay && texto.length > 40) {
      peticiones += 1
      const an = await seguro(api.post('/whc/analizar', { texto }), { data: null })
      if (an.data?.conductores) {
        whc = {
          conductores: an.data.conductores,
          limite_min: an.data.limite_min,
          semana: an.data.semana || plan.data.semana,
          pegado_el: plan.data.updated_at || plan.data.created_at || null,
        }
      }
    } else {
      errores.push(`No hay plan de WHC pegado para ${centroWHC} esta semana`)
    }
  }

  /* ── 3 · Ledger de daños, sólo de vehículos con inspección reciente ────── */
  const recientes = new Set(
    inspecciones
      .filter((i) => Date.parse(i.created_at) > Date.now() - 10 * DIA)
      .map((i) => i.vehicle_id))
  const objetivo = vehiculos.filter((v) => recientes.has(v.id)).slice(0, MAX_LEDGERS)
  peticiones += objetivo.length
  const ledgers = await Promise.all(
    objetivo.map((v) => seguro(getVehicleDamageLedger(v.id), { data: null })))
  const ledger = []
  ledgers.forEach((r, n) => {
    const id = objetivo[n].id
    for (const e of r.data?.open || []) ledger.push({ ...e, vehicle_id: id, status: 'open' })
    for (const e of r.data?.repaired || []) ledger.push({ ...e, vehicle_id: id, status: 'repaired' })
  })

  /* ── 4 · Asignación diaria de los últimos días (la clave de atribución) ── */
  const dias = []
  for (let n = 0; n < DIAS_ASIGNACION; n++) dias.push(iso(new Date(Date.now() - n * DIA)))
  peticiones += dias.length
  const asigRes = await Promise.all(
    dias.map((f) => seguro(getDailyAssignment(center, f), { data: null })))
  const asignaciones = asigRes.map((r, n) => {
    const d = r.data
    const slots = Array.isArray(d?.slots) ? d.slots : Array.isArray(d) ? d : []
    return { date: dias[n], center, slots }
  }).filter((a) => a.slots.length)
  if (!asignaciones.length) {
    errores.push('No hay asignación diaria en los últimos ' + DIAS_ASIGNACION +
                 ' días: sin ella, ningún daño se puede atribuir a un turno')
  }

  /* ── 5 · Frescura declarada ─────────────────────────────────────────────── */
  const ultimaInsp = inspecciones
    .map((i) => i.created_at).sort().slice(-1)[0] || null
  const fuentes = {
    cortex: { etiqueta: 'Cortex (extensión Chrome)', actualizado: cxRes.data?.last_capture_at || null, modo: 'automático', desfase_dias: 0 },
    whc: { etiqueta: 'WHC (plan pegado a mano)', actualizado: whc?.pegado_el || null, modo: 'manual', desfase_dias: 0 },
    // 2 días de desfase estructural: el reporte diario tarda en rellenarse.
    scorecard: { etiqueta: 'Scorecard semanal (PDF)', actualizado: null, modo: 'manual', desfase_dias: 2 },
    inspecciones: { etiqueta: 'Inspecciones', actualizado: ultimaInsp, modo: 'automático', desfase_dias: 0 },
    flota: { etiqueta: 'Ficha de vehículos', actualizado: null, modo: 'manual', desfase_dias: 0 },
  }

  return {
    hoy,
    origen: 'real',
    vehiculos, conductores, ledger, inspecciones, asignaciones,
    rutas: rutasRes.data?.routes || [],
    cortexOverview: cxRes.data || {},
    whc,
    contadores: {
      cola_revision: attRes.data?.pending_review ?? null,
      incidencias_abiertas: attRes.data?.open_incidents ?? null,
      asignadas_hoy: attRes.data?.assigned_today ?? null,
      sin_inspeccion_hoy: attRes.data?.missing_today || [],
      sin_inspeccion_hoy_total: attRes.data?.missing_today_count ?? null,
    },
    fuentes,
    meta: { peticiones, errores, centro: center || 'Todos' },
  }
}
