/* ─────────────────────────────────────────────────────────────────────────────
   PRODUCTO 1 · EL EXPEDIENTE DEL VEHÍCULO
   ---------------------------------------------------------------------------
   QUIÉN LO USA   El gestor cuando una furgoneta le da problemas, y el dueño
                  cuando tiene que discutir con el renting o con el seguro.

   QUÉ PROBLEMA RESUELVE
   Hoy, para responder "¿qué le ha pasado a esta furgoneta en seis meses?" hay
   que abrir Vehículos, Inspecciones, Incidencias, Talleres, Vencimientos y
   Aparcamiento, y armar la historia en la cabeza. Nadie lo hace. Y como nadie
   lo hace, los daños repetidos no se detectan y no se reclaman a nadie.

   QUÉ DECISIÓN PERMITE
   · abrir un parte con el renting con el historial delante;
   · decidir si una furgoneta sale de la flota;
   · saber si un daño es la primera vez o la cuarta.

   LA IDEA QUE NO EXISTÍA: el vehículo deja de ser una FICHA y pasa a ser un
   OBJETO CON MEMORIA. Un expediente longitudinal con todo en un eje, y encima
   una capa de reincidencia que dice "este panel ya se ha roto 3 veces".

   DATOS REALES QUE LO ALIMENTAN (nombres del backend):
     vehicles · inspections · vehicle_damage_ledger · incidents ·
     daily_assignments (para saber quién la llevaba cada día)
   INFERENCIA: ninguna. Todo son hechos ordenados por fecha.
   LO QUE FALTA: coste real de reparación en la mayoría de daños, y un registro
   de eventos para las transiciones de estado (entrada a taller, cambio de
   conductor) que hoy se sobrescriben sin dejar rastro.

   Datos de esta pantalla: LAB/SIMULATED.
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react'
import {
  Truck, Search, AlertTriangle, Wrench, Camera, FileWarning, ShieldAlert,
  ChevronRight, RotateCcw, X,
} from 'lucide-react'
import {
  vehiculos, inspecciones, danos, incidencias, talleres,
  asignaciones, HOY, condPorId,
} from '../app2/datosPlus'
import Vida from './Vida'

const eur = (n) => `${Math.round(n || 0).toLocaleString('es-ES')} €`
const km = (n) => `${(n || 0).toLocaleString('es-ES')} km`
const dias = (s) => Math.round((Date.parse(String(s).slice(0, 10) + 'T12:00:00Z') - Date.parse(HOY + 'T12:00:00Z')) / 86400000)
const fFecha = (s) => {
  if (!s) return '—'
  const d = new Date(String(s).slice(0, 10) + 'T12:00:00Z')
  const mismoAno = d.getUTCFullYear() === new Date(HOY + 'T12:00:00Z').getUTCFullYear()
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(mismoAno ? {} : { year: 'numeric' }) })
}
const SEV = { leve: 'text-yellow-300', moderado: 'text-orange-300', grave: 'text-red-400', critico: 'text-red-400' }

/* Reincidencia por panel: HECHO contable, no un patrón demostrado.
   Con 3 casos no se puede afirmar que esta furgoneta se desvíe del resto de la
   flota; sí se puede afirmar que ese panel se ha roto 3 veces. La diferencia
   importa y la pantalla la dice. */
function expediente(vehicleId) {
  const v = vehiculos.find((x) => x.id === vehicleId)
  const dañosV = danos.filter((d) => d.vehicle_id === vehicleId)
  const inspV = inspecciones.filter((i) => i.vehicle_id === vehicleId)
  const incsV = incidencias.filter((i) => i.vehicle_id === vehicleId)

  /* Quién la llevaba cada día: es lo que permite acotar cuándo apareció algo */
  const conductorEn = (fecha) => {
    const a = asignaciones.find((x) => x.date === fecha)
    return a?.slots.find((s) => s.vehicle_id === vehicleId)?.driver_name || null
  }

  const porPanel = {}
  for (const d of dañosV) (porPanel[d.panel] ||= []).push(d)
  const reincidentes = Object.entries(porPanel)
    .filter(([, xs]) => xs.length >= 2)
    .map(([panel, xs]) => ({
      panel, n: xs.length,
      part: xs[0].part,
      coste: xs.reduce((a, d) => a + (d.actual_cost || d.estimated_cost), 0),
      real: xs.some((d) => d.actual_cost),
      fechas: xs.map((d) => d.first_seen).sort(),
    }))
    .sort((a, b) => b.n - a.n)

  /* Eje temporal: todo lo que le ha pasado, ordenado */
  const linea = []
  for (const d of dañosV) {
    linea.push({
      at: d.first_seen, tipo: 'dano', icono: FileWarning,
      titulo: `Daño ${d.severity} · ${d.part}`,
      quien: conductorEn(d.first_seen),
      detalle: d.repair_status === 'done'
        ? `Reparado · ${eur(d.actual_cost)} (factura)`
        : d.workshop_id ? `En ${talleres.find((w) => w.id === d.workshop_id)?.name || 'taller'} · ${eur(d.estimated_cost)} por tarifa`
        : `Sin gestionar · ${eur(d.estimated_cost)} por tarifa`,
      tono: d.severity === 'grave' ? 'text-red-400' : 'text-orange-300',
    })
  }
  for (const i of incsV) {
    linea.push({
      at: i.created_at.slice(0, 10), tipo: 'incidencia', icono: AlertTriangle,
      titulo: `Incidencia · ${i.type}`,
      quien: condPorId(i.driver_id)?.name,
      detalle: `${i.description}${i.status === 'resolved' ? ' · resuelta' : ' · abierta'}`,
      tono: i.status === 'resolved' ? 'text-dark-400' : 'text-amber-300',
    })
  }
  for (const i of inspV.filter((x) => x.new_damages > 0 || x.analysis_status !== 'ok').slice(0, 30)) {
    linea.push({
      at: i.created_at.slice(0, 10), tipo: 'inspeccion', icono: Camera,
      titulo: i.analysis_status !== 'ok' ? 'Inspección sin analizar' : `Inspección · ${i.severity}`,
      quien: condPorId(i.driver_id)?.name,
      detalle: i.new_damages ? `${i.new_damages} daño nuevo detectado` : 'El análisis de IA falló',
      tono: i.analysis_status !== 'ok' ? 'text-red-400' : 'text-dark-300',
    })
  }
  linea.sort((a, b) => b.at.localeCompare(a.at))

  const gastado = dañosV.filter((d) => d.actual_cost).reduce((a, d) => a + d.actual_cost, 0)
  const pendiente = dañosV.filter((d) => !d.actual_cost && d.repair_status !== 'done')
    .reduce((a, d) => a + d.estimated_cost, 0)
  const sinGestionar = dañosV.filter((d) => d.repair_status === 'pending')

  return { v, linea, reincidentes, gastado, pendiente, sinGestionar, dañosV, inspV, incsV }
}

export default function Expediente({ center }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)

  const lista = useMemo(() => vehiculos
    .filter((v) => !center || center === 'Todos' || v.center === center)
    .map((v) => {
      const e = expediente(v.id)
      return {
        ...v,
        reinc: e.reincidentes.length,
        peorReinc: e.reincidentes[0],
        gastado: e.gastado,
        pendiente: e.pendiente,
        sinGestionar: e.sinGestionar.length,
        eventos: e.linea.length,
      }
    })
    .filter((v) => !q.trim() || `${v.license_plate} ${v.brand} ${v.model}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (b.reinc - a.reinc) || (b.gastado + b.pendiente) - (a.gastado + a.pendiente)),
  [center, q])

  const conReinc = lista.filter((v) => v.reinc > 0)

  return (
    <div className="animate-fade-in">
      <header className="rise pb-6">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-dark-500">
          Expediente de flota{center && center !== 'Todos' ? ` · ${center}` : ''}
        </p>
        <h1 className="mt-2 font-display text-[clamp(24px,3.4vw,34px)] font-semibold leading-[1.1] tracking-[-0.03em] text-dark-50">
          {conReinc.length} furgonetas rompen<br />el mismo panel más de una vez
        </h1>
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-dark-400">
          Cada furgoneta como un <b className="font-semibold text-dark-200">expediente</b>: daños, incidencias,
          inspecciones y quién la llevaba, en un solo eje. Hoy esto son seis pantallas y nadie las cruza — por eso los
          golpes que se repiten no se detectan ni se reclaman.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dark-600" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Matrícula o modelo…" className="input pl-9" />
        </div>
        <span className="text-[12.5px] text-dark-500">{lista.length} vehículos</span>
      </div>

      <div className="divide-y divide-white/[0.05]">
        {lista.map((v) => (
          <button key={v.id} onClick={() => setSel(v.id)}
            className="float-row group -mx-3 flex w-[calc(100%+1.5rem)] flex-wrap items-center gap-3 rounded-xl px-3 py-3.5 text-left">
            <div className="min-w-0 flex-[1.4]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14.5px] font-semibold text-dark-50">{v.license_plate}</span>
                {v.status === 'taller' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    <Wrench size={9} /> taller
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11.5px] text-dark-600">{v.brand} {v.model} · {v.provider}</div>
            </div>

            <div className="min-w-0 flex-1">
              {v.reinc > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-red-300">
                  <RotateCcw size={12} /> {v.peorReinc.n}× {v.peorReinc.part}
                </span>
              ) : <span className="text-[12px] text-dark-600">sin reincidencia</span>}
            </div>

            <div className="hidden w-[104px] shrink-0 text-right sm:block">
              {v.sinGestionar > 0 && (
                <span className="text-[12px] text-amber-300">{v.sinGestionar} sin gestionar</span>
              )}
            </div>

            <div className="w-[96px] shrink-0 text-right">
              <div className="text-[14px] font-semibold tabular-nums text-dark-100">{eur(v.gastado + v.pendiente)}</div>
              <div className="text-[10.5px] text-dark-600">{v.eventos} eventos</div>
            </div>
            <ChevronRight size={15} className="shrink-0 text-dark-700 transition-transform group-hover:translate-x-0.5 group-hover:text-dark-400" />
          </button>
        ))}
      </div>

      <p className="mt-5 text-[12px] leading-relaxed text-dark-600">
        El importe suma facturas reales y tarifa por panel donde aún no hay factura. <b className="text-dark-500">No es
        contabilidad</b>: sirve para ordenar la lista por lo que más ha costado.
      </p>

      {sel && <Ficha id={sel} onCerrar={() => setSel(null)} />}
    </div>
  )
}

function Ficha({ id, onCerrar }) {
  const e = useMemo(() => expediente(id), [id])
  const v = e.v
  const dITV = dias(v.itv_date)
  const [verTodo, setVerTodo] = useState(false)
  const [selDano, setSelDano] = useState(null)
  const linea = verTodo ? e.linea : e.linea.slice(0, 14)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onCerrar} />
      <aside className="animate-pop relative flex h-full w-full max-w-[520px] flex-col overflow-y-auto border-l border-white/[0.08] bg-dark-950">
        <header className="glass sticky top-0 z-10 border-b px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15">
              <Truck size={18} className="text-brand-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-dark-50">{v.license_plate}</h2>
              <p className="mt-0.5 text-[12px] text-dark-500">
                {v.brand} {v.model} · {v.provider} · {km(v.mileage)} · {v.center}
              </p>
            </div>
            <button onClick={onCerrar} className="btn-ghost shrink-0 p-1.5"><X size={17} /></button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <Cifra k="Pagado" v={eur(e.gastado)} sub="facturas reales" />
            <Cifra k="Pendiente" v={eur(e.pendiente)} sub="tarifa, no factura" tono="text-amber-300" />
            <Cifra k="Sin gestionar" v={String(e.sinGestionar.length)} sub="ni taller ni importe" tono={e.sinGestionar.length ? 'text-red-400' : 'text-emerald-400'} />
          </div>
        </header>

        <div className="px-6 pb-16">
          {/* ── Lo que hace único a este expediente ── */}
          {e.reincidentes.length > 0 && (
            <section className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-4">
              <h3 className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-red-300">
                <RotateCcw size={12} /> Se rompe siempre por el mismo sitio
              </h3>
              {e.reincidentes.map((r) => (
                <div key={r.panel} className="mt-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[14.5px] font-semibold text-dark-50">{r.n}× {r.part}</span>
                    <span className="ml-auto text-[14px] font-semibold tabular-nums text-dark-100">{eur(r.coste)}</span>
                  </div>
                  <div className="mt-1 text-[11.5px] text-dark-500">{r.fechas.map(fFecha).join(' · ')}</div>
                </div>
              ))}
              <p className="mt-3 text-[11.5px] leading-relaxed text-dark-500">
                Es un <b className="text-dark-300">recuento</b>, no un patrón demostrado: que un panel se haya roto
                {' '}{e.reincidentes[0].n} veces es un hecho; concluir que esta furgoneta es peor que el resto de la
                flota necesitaría comparar contra las demás con la misma exposición, y eso no se puede con estos datos.
                Sirve para <b className="text-dark-300">abrir un parte con el renting</b>, no para juzgarla.
              </p>
            </section>
          )}

          <Seccion titulo="Estado ahora">
            <Dato k="Situación" v={v.status === 'taller' ? `En taller · ${v.workshop_reason || ''}` : 'En servicio'}
              tono={v.status === 'taller' ? 'text-amber-300' : 'text-emerald-400'} />
            <Dato k="ITV" v={`${fFecha(v.itv_date)} · ${dITV <= 0 ? 'caducada' : `${dITV} días`}`}
              tono={dITV <= 15 ? 'text-red-400' : undefined} />
            <Dato k="Fin de renting" v={`${fFecha(v.renting_end_date)} · ${dias(v.renting_end_date)} días`} />
            <Dato k="Aceite" v={(() => {
              const r = v.oil_interval_km - (v.mileage - v.oil_last_change_km)
              return r <= 0 ? `pasado en ${km(Math.abs(r))}` : `quedan ${km(r)}`
            })()} />
          </Seccion>

          {e.sinGestionar.length > 0 && (
            <Seccion titulo={`Dinero que nadie está gestionando · ${eur(e.sinGestionar.reduce((a, d) => a + d.estimated_cost, 0))}`}>
              {e.sinGestionar.map((d) => (
                <div key={d.id} className="flex flex-wrap items-baseline gap-2 py-1.5">
                  <span className={`text-[13.5px] ${SEV[d.severity]}`}>{d.part}</span>
                  <span className="text-[11.5px] text-dark-600">desde {fFecha(d.first_seen)}</span>
                  <span className="ml-auto text-[13.5px] font-semibold tabular-nums text-dark-200">{eur(d.estimated_cost)}</span>
                </div>
              ))}
              <p className="mt-2 text-[11.5px] leading-relaxed text-dark-600">
                Ni taller, ni presupuesto, ni importe. Mientras siga así no se ha decidido si lo paga el seguro, el
                renting o tú. <b className="text-dark-400">Por defecto, lo pagas tú.</b>
              </p>
            </Seccion>
          )}

          {/* ── Línea de vida: cuánto tiempo estuvo así, no cuándo pasó ── */}
          <Seccion titulo="Línea de vida · cuánto tiempo estuvo cada daño abierto">
            <Vida danos={e.dañosV} hoy={HOY} sel={selDano} onSel={setSelDano} />
          </Seccion>

          {/* ── El eje temporal: la memoria del vehículo ── */}
          <Seccion titulo={`Todo lo que le ha pasado · ${e.linea.length} eventos`}>
            <div className="relative mt-1 pl-5">
              <div className="absolute bottom-2 left-[3px] top-2 w-px bg-white/[0.08]" />
              {linea.map((x, i) => {
                const I = x.icono
                return (
                  <div key={i} className="relative pb-4">
                    <span className="absolute -left-5 top-[5px] flex h-[7px] w-[7px] items-center justify-center rounded-full bg-dark-600 ring-4 ring-dark-950" />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-mono text-[10.5px] tabular-nums text-dark-600">{fFecha(x.at)}</span>
                      <I size={11} className="text-dark-600" />
                      <span className={`text-[13.5px] font-medium ${x.tono}`}>{x.titulo}</span>
                    </div>
                    <div className="mt-0.5 text-[11.5px] leading-relaxed text-dark-500">
                      {x.quien && <span className="text-dark-400">{x.quien}</span>}
                      {x.quien && ' · '}{x.detalle}
                    </div>
                  </div>
                )
              })}
            </div>
            {e.linea.length > 14 && !verTodo && (
              <button onClick={() => setVerTodo(true)} className="mt-1 text-[12.5px] font-medium text-brand-400 hover:text-brand-300">
                Ver los {e.linea.length - 14} eventos restantes →
              </button>
            )}
            <p className="mt-3 text-[11.5px] leading-relaxed text-dark-600">
              El conductor de cada evento sale del cuadrante de ese día. <b className="text-dark-400">Estar asignado no
              es ser responsable</b>: el expediente enumera, no atribuye.
            </p>
          </Seccion>

          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn-secondary flex items-center gap-1.5 text-[13px]" title="Prototipo: no ejecuta nada">
              <ShieldAlert size={13} /> Abrir parte con {v.provider}
            </button>
            <button className="btn-ghost px-3 py-2 text-[13px]" title="Prototipo: no ejecuta nada">Exportar expediente</button>
          </div>
        </div>
      </aside>
    </div>
  )
}

const Cifra = ({ k, v, sub, tono }) => (
  <div>
    <div className={`text-[17px] font-semibold tabular-nums tracking-[-0.02em] ${tono || 'text-dark-50'}`}>{v}</div>
    <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-dark-600">{k}</div>
    <div className="text-[10px] text-dark-700">{sub}</div>
  </div>
)

const Seccion = ({ titulo, children }) => (
  <section className="mt-6 border-t border-white/[0.05] pt-5">
    <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-dark-500">{titulo}</h3>
    <div className="mt-3">{children}</div>
  </section>
)

const Dato = ({ k, v, tono }) => (
  <div className="flex items-baseline gap-3 py-1">
    <span className="text-[12.5px] text-dark-500">{k}</span>
    <span className={`ml-auto text-[13.5px] font-medium ${tono || 'text-dark-100'}`}>{v}</span>
  </div>
)
