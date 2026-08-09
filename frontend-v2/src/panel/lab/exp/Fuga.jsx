/* ─────────────────────────────────────────────────────────────────────────────
   PRODUCTO 3 · LA FUGA — dónde se escapa el dinero
   ---------------------------------------------------------------------------
   QUIÉN LO USA   El dueño. Es la pantalla de la reunión del viernes.

   QUÉ PROBLEMA RESUELVE
   FlotaDSP detecta daños muy bien y después los suelta. Un daño detectado que
   nadie asigna a un taller, nadie presupuesta y nadie reclama acaba pagándolo
   el DSP por defecto. Hoy no existe ninguna pantalla que diga cuántos hay ni
   cuánto llevan ahí.

   LAS TRES IDEAS QUE LA HACEN DISTINTA DE UN "PANEL DE COSTES"

   1. ANTIGÜEDAD, no importe. Un daño de 90 días sin tocar no es un número: es
      una reclamación que ya no vas a poder hacer. Se ordena por lo que lleva
      abandonado.
   2. TARIFA ≠ FACTURA, siempre separadas. El estimado sale de un baremo por
      panel y severidad, no de una adivinanza del modelo, pero tampoco es un
      presupuesto. Mezclarlos es cómo se construye un dashboard que miente.
   3. CALIBRACIÓN. Donde existen los dos números se puede medir cuánto se
      desvía la tarifa de la factura real. Eso convierte el baremo en algo
      auditable en vez de en un adorno — y es la única forma honesta de saber
      si los euros estimados sirven para algo.

   QUÉ DECISIÓN PERMITE  a qué daño asignar taller hoy, y qué reclamar antes de
   que caduque.

   DATOS REALES: inspections.analysis.damages (repair_status, workshop_id,
   estimated_cost, actual_cost) y vehicles.
   INFERENCIA: ninguna en los importes. La única decisión de producto es el
   orden por antigüedad.
   LO QUE FALTA: fecha de la factura y quién la pagó (seguro / renting / DSP).
   Sin eso no se puede cerrar el círculo de la reclamación.

   Datos de esta pantalla: LAB/SIMULATED.
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react'
import { TrendingDown, Wrench, Clock3, ChevronRight, X } from 'lucide-react'
import { danos, talleres, HOY, vehPorId } from '../app2/datosPlus'

const eur = (n) => `${Math.round(n || 0).toLocaleString('es-ES')} €`
const edad = (s) => Math.abs(Math.round((Date.parse(String(s).slice(0, 10) + 'T12:00:00Z') - Date.parse(HOY + 'T12:00:00Z')) / 86400000))
const SEV = { leve: 'text-yellow-300', moderado: 'text-orange-300', grave: 'text-red-400' }

export default function Fuga({ center }) {
  const [ver, setVer] = useState('sin')
  const [sel, setSel] = useState(null)

  const D = useMemo(() => {
    const enCentro = (d) => {
      const v = vehPorId(d.vehicle_id)
      return !center || center === 'Todos' || v?.center === center
    }
    const todos = danos.filter(enCentro).map((d) => ({ ...d, dias: edad(d.first_seen), veh: vehPorId(d.vehicle_id) }))
    const sin = todos.filter((d) => d.repair_status === 'pending').sort((a, b) => b.dias - a.dias)
    const en = todos.filter((d) => d.repair_status === 'assigned').sort((a, b) => b.dias - a.dias)
    const hechos = todos.filter((d) => d.repair_status === 'done')

    /* Calibración: sólo donde existen tarifa Y factura. Es la única comparación
       legítima; con el resto no se puede decir nada. */
    const conAmbos = hechos.filter((d) => d.actual_cost > 0 && d.estimated_cost > 0)
    const sumaT = conAmbos.reduce((a, d) => a + d.estimated_cost, 0)
    const sumaF = conAmbos.reduce((a, d) => a + d.actual_cost, 0)
    const desvio = sumaT ? Math.round(((sumaF - sumaT) / sumaT) * 100) : null
    const porSev = ['leve', 'moderado', 'grave'].map((s) => {
      const xs = conAmbos.filter((d) => d.severity === s)
      const t = xs.reduce((a, d) => a + d.estimated_cost, 0)
      const f = xs.reduce((a, d) => a + d.actual_cost, 0)
      return { sev: s, n: xs.length, desvio: t ? Math.round(((f - t) / t) * 100) : null }
    }).filter((x) => x.n > 0)

    /* Por vehículo: dónde se concentra la fuga */
    const porVeh = {}
    for (const d of [...sin, ...en]) {
      const e = (porVeh[d.vehicle_id] ||= { veh: d.veh, n: 0, eur: 0, viejo: 0 })
      e.n += 1; e.eur += d.estimated_cost; e.viejo = Math.max(e.viejo, d.dias)
    }
    const ranking = Object.values(porVeh).sort((a, b) => b.eur - a.eur).slice(0, 6)

    return {
      sin, en, hechos, conAmbos, sumaT, sumaF, desvio, porSev, ranking,
      eurSin: sin.reduce((a, d) => a + d.estimated_cost, 0),
      eurEn: en.reduce((a, d) => a + d.estimated_cost, 0),
      eurPagado: hechos.reduce((a, d) => a + (d.actual_cost || 0), 0),
      masViejo: sin[0],
    }
  }, [center])

  const listas = { sin: D.sin, en: D.en, hechos: D.hechos }
  const lista = listas[ver]

  return (
    <div className="animate-fade-in">
      <header className="rise pb-6">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-dark-500">
          La fuga{center && center !== 'Todos' ? ` · ${center}` : ''}
        </p>
        <h1 className="mt-2 font-display text-[clamp(24px,3.4vw,34px)] font-semibold leading-[1.1] tracking-[-0.03em] text-dark-50">
          {D.sin.length} daños que no gestiona nadie,<br />
          {D.masViejo && <>el más viejo lleva <span className="text-amber-300">{D.masViejo.dias} días</span></>}
        </h1>
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-dark-400">
          Ni taller, ni presupuesto, ni importe. Mientras siga así no se ha decidido si lo paga el seguro, el renting
          o tú — y <b className="font-semibold text-dark-200">por defecto lo pagas tú</b>. Ordenado por lo que llevan
          abandonados, no por importe: lo viejo es lo que ya no se puede reclamar.
        </p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Caja titulo="Sin gestionar" n={D.sin.length} sub={`${eur(D.eurSin)} por tarifa`} tono="text-amber-300" icono={Clock3} />
        <Caja titulo="En taller" n={D.en.length} sub={`${eur(D.eurEn)} comprometido`} tono="text-dark-200" icono={Wrench} />
        <Caja titulo="Ya pagado" n={D.hechos.length} sub={`${eur(D.eurPagado)} en facturas`} tono="text-emerald-400" icono={TrendingDown} />
      </div>

      {/* ── La calibración: lo que hace auditable el baremo ── */}
      {D.desvio !== null && (
        <div className="mb-7 card p-5">
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-dark-500">
            ¿Se parece la tarifa a la factura?
          </h3>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <span className="font-display text-[30px] font-semibold tracking-[-0.03em] text-dark-50">
                {D.desvio > 0 ? '+' : ''}{D.desvio} %
              </span>
              <span className="ml-2 text-[12.5px] text-dark-500">de desviación media</span>
            </div>
            <div className="text-[12.5px] text-dark-500">
              {eur(D.sumaT)} de tarifa → <b className="text-dark-200">{eur(D.sumaF)}</b> de factura real
              {' '}· {D.conAmbos.length} casos con los dos datos
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5">
            {D.porSev.map((x) => (
              <span key={x.sev} className="text-[12.5px] text-dark-500">
                <span className={SEV[x.sev]}>{x.sev}</span>{' '}
                <b className="text-dark-200">{x.desvio > 0 ? '+' : ''}{x.desvio} %</b>
                <span className="text-dark-700"> ({x.n})</span>
              </span>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-dark-600">
            Sólo entran los daños que tienen <b className="text-dark-400">tarifa y factura a la vez</b>: con el resto
            no hay nada que comparar. Esto es lo que convierte el baremo en algo auditable — si la desviación fuera
            enorme, los euros estimados de todo el producto no servirían para priorizar.
          </p>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {[['sin', 'Sin gestionar', D.sin.length], ['en', 'En taller', D.en.length], ['hechos', 'Reparados', D.hechos.length]].map(([id, txt, n]) => (
          <button key={id} onClick={() => setVer(id)}
            className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
              ver === id ? 'bg-white/[0.1] text-dark-50' : 'text-dark-500 hover:bg-white/[0.04] hover:text-dark-300'}`}>
            {txt} <span className="tabular-nums opacity-50">{n}</span>
          </button>
        ))}
      </div>

      <div className="divide-y divide-white/[0.05]">
        {lista.map((d) => {
          const w = talleres.find((x) => x.id === d.workshop_id)
          const critico = ver === 'sin' && d.dias > 60
          return (
            <button key={d.id} onClick={() => setSel(d)}
              className="float-row group -mx-3 flex w-[calc(100%+1.5rem)] flex-wrap items-center gap-3 rounded-xl px-3 py-3 text-left">
              <div className="min-w-0 flex-[1.4]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-dark-50">{d.veh?.license_plate}</span>
                  <span className={`text-[13px] ${SEV[d.severity]}`}>{d.part}</span>
                </div>
                <div className="mt-0.5 truncate text-[11.5px] text-dark-600">
                  {d.veh?.brand} {d.veh?.model} · {d.veh?.provider}{w ? ` · ${w.name}` : ''}
                </div>
              </div>
              <div className="w-[112px] shrink-0 text-right">
                <span className={`text-[12.5px] ${critico ? 'font-semibold text-red-400' : 'text-dark-500'}`}>
                  {d.dias} días
                </span>
              </div>
              <div className="w-[88px] shrink-0 text-right">
                <div className="text-[14px] font-semibold tabular-nums text-dark-100">
                  {eur(d.actual_cost || d.estimated_cost)}
                </div>
                <div className="text-[10px] text-dark-700">{d.actual_cost ? 'factura' : 'tarifa'}</div>
              </div>
              <ChevronRight size={14} className="shrink-0 text-dark-700 transition-transform group-hover:translate-x-0.5 group-hover:text-dark-400" />
            </button>
          )
        })}
      </div>

      {/* ── Dónde se concentra ── */}
      {D.ranking.length > 0 && (
        <section className="mt-9 border-t border-white/[0.05] pt-6">
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-dark-500">
            Dónde se concentra la fuga
          </h3>
          <div className="mt-3 divide-y divide-white/[0.05]">
            {D.ranking.map((r) => (
              <div key={r.veh.id} className="flex flex-wrap items-baseline gap-3 py-2.5">
                <span className="min-w-[80px] text-[13.5px] font-semibold text-dark-100">{r.veh.license_plate}</span>
                <span className="flex-1 text-[12px] text-dark-600">{r.veh.brand} {r.veh.model}</span>
                <span className="text-[12px] text-dark-500">{r.n} daños</span>
                <span className="text-[12px] text-amber-300/80">el más viejo, {r.viejo} d</span>
                <span className="min-w-[76px] text-right text-[13.5px] font-semibold tabular-nums text-dark-100">{eur(r.eur)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {sel && <Detalle d={sel} onCerrar={() => setSel(null)} />}
    </div>
  )
}

function Caja({ titulo, n, sub, tono, icono: I }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <I size={14} className="text-dark-600" />
        <span className="text-[12px] font-medium text-dark-400">{titulo}</span>
      </div>
      <div className={`mt-2 font-display text-[27px] font-semibold tracking-[-0.03em] ${tono}`}>{n}</div>
      <div className="mt-0.5 text-[11.5px] text-dark-600">{sub}</div>
    </div>
  )
}

function Detalle({ d, onCerrar }) {
  const w = talleres.find((x) => x.id === d.workshop_id)
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onCerrar} />
      <aside className="animate-pop relative h-full w-full max-w-[430px] overflow-y-auto border-l border-white/[0.08] bg-dark-950 p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-dark-600">Daño</p>
            <h2 className="mt-1 font-display text-[21px] font-semibold tracking-[-0.02em] text-dark-50">{d.part}</h2>
            <p className="mt-0.5 text-[12.5px] text-dark-500">
              {d.veh?.license_plate} · {d.veh?.brand} {d.veh?.model}
            </p>
          </div>
          <button onClick={onCerrar} className="btn-ghost shrink-0 p-1.5"><X size={17} /></button>
        </div>

        <div className="mt-6 space-y-2.5">
          <L k="Severidad" v={d.severity} tono={SEV[d.severity]} />
          <L k="Detectado" v={`hace ${d.dias} días`} tono={d.dias > 60 ? 'text-amber-300' : undefined} />
          <L k="Estado" v={d.repair_status === 'done' ? 'reparado' : d.workshop_id ? 'en taller' : 'sin gestionar'}
            tono={d.repair_status === 'done' ? 'text-emerald-400' : d.workshop_id ? 'text-dark-200' : 'text-amber-300'} />
          <L k="Taller" v={w?.name || 'sin asignar'} />
          <L k="Proveedor del vehículo" v={d.veh?.provider} />
        </div>

        <div className="mt-6 card p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[12.5px] text-dark-500">Tarifa por panel y severidad</span>
            <span className="text-[15px] font-semibold tabular-nums text-dark-200">{eur(d.estimated_cost)}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[12.5px] text-dark-500">Factura real</span>
            <span className={`text-[15px] font-semibold tabular-nums ${d.actual_cost ? 'text-emerald-400' : 'text-dark-600'}`}>
              {d.actual_cost ? eur(d.actual_cost) : 'sin introducir'}
            </span>
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-dark-600">
            La tarifa sirve para <b className="text-dark-400">priorizar</b>; sólo la factura sirve para
            <b className="text-dark-400"> contabilizar</b>. Nunca se suman como si fueran lo mismo.
          </p>
        </div>

        {!d.workshop_id && d.repair_status !== 'done' && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="btn-primary text-[13px]" title="Prototipo: no escribe en ninguna base">Asignar taller</button>
            <button className="btn-secondary text-[13px]" title="Prototipo: no escribe en ninguna base">
              Reclamar a {d.veh?.provider}
            </button>
          </div>
        )}

        <p className="mt-6 text-[11.5px] leading-relaxed text-dark-600">
          <b className="text-dark-400">Lo que falta para cerrar el círculo:</b> la fecha de la factura y quién acabó
          pagando (seguro, renting o el DSP). Sin ese dato el producto sabe cuánto costó, pero no si se consiguió
          reclamar — que es lo que de verdad decide si esto ahorra dinero.
        </p>
      </aside>
    </div>
  )
}

const L = ({ k, v, tono }) => (
  <div className="flex items-baseline gap-3">
    <span className="text-[12.5px] text-dark-500">{k}</span>
    <span className={`ml-auto text-[13.5px] font-medium ${tono || 'text-dark-100'}`}>{v}</span>
  </div>
)
