/* ─────────────────────────────────────────────────────────────────────────────
   LAB · E08 — SIMULADOR "¿Y SI…?"
   ---------------------------------------------------------------------------
   Sólo hay UN what-if que se sostiene con los datos de FlotaDSP: mover horas
   entre conductores. Los totales trabajados los da el portal y sumar o restar
   un bloque es una resta — determinista, reproducible a mano, sin modelo.

   Todo lo demás que apetecería simular ("¿qué le pasa al DCR si cambio a esta
   persona?", "¿y si esta furgoneta no está disponible?") exigiría un modelo
   causal que estos datos no permiten construir. Está listado abajo como lo que
   es, en vez de fingirlo con un gráfico bonito.

   SIMULACIÓN ≠ PREDICCIÓN. Esto no dice qué VA a pasar: dice qué números
   saldrían SI se hace ese cambio y todo lo demás sigue igual.
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { DATOS_SINTETICOS } from './datos'
import { simularTraspaso, hm } from './motor'
import { BandaSintetica, Cabecera, Clase } from './ui'

const NO_SIMULABLE = [
  {
    q: '¿Qué le pasa al DCR si cambio de conductor esta ruta?',
    r: 'No se puede calcular. Haría falta un modelo que relacione persona, zona y resultado, y no hay datos para entrenarlo ni para validarlo.',
  },
  {
    q: '¿Y si esta furgoneta no está disponible mañana?',
    r: 'Se puede decir qué rutas quedan sin vehículo (es una cuenta), pero no el impacto en la operación. Lo primero es útil; lo segundo sería inventado.',
  },
  {
    q: '¿Cuánto dinero ahorro con este cambio?',
    r: 'No hay forma de atribuir euros a una reasignación de horas. El único € fiable del sistema es el coste real de una reparación cuando alguien lo teclea.',
  },
]

export default function Simulador({ datos = DATOS_SINTETICOS }) {
  const conductores = datos.whc?.conductores || []
  const idDe = (c) => c.driver_id || c.nombre
  const [desde, setDesde] = useState(idDe(conductores[0] || {}))
  const [hacia, setHacia] = useState(idDe(conductores[1] || {}))
  const [minutos, setMinutos] = useState(120)

  const sim = useMemo(
    () => simularTraspaso(datos, desde, hacia, minutos),
    [datos, desde, hacia, minutos])

  if (!datos.whc || conductores.length < 2) {
    return (
      <div className="mx-auto max-w-3xl">
        <Cabecera titulo="Simulador" bajada="" />
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-[14px] text-amber-200">
          Sin plan de horas pegado no hay nada que simular. El simulador parte de horas medidas, no de estimaciones.
        </p>
      </div>
    )
  }

  const cambio = sim && sim.pasan - sim.pasaban

  return (
    <div className="mx-auto max-w-3xl">
      <Cabecera
        titulo="¿Y si…?"
        bajada="Mover horas planificadas entre conductores y ver qué números salen. Es aritmética sobre datos medidos, no una predicción."
      />
      <BandaSintetica />

      {/* Los mandos */}
      <section className="rise rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-end gap-4">
          <Campo label="Quitar horas a">
            <select className="select" value={desde} onChange={(e) => setDesde(e.target.value)}>
              {conductores.map((c) => <option key={idDe(c)} value={idDe(c)}>{c.nombre || c.name}</option>)}
            </select>
          </Campo>
          <ArrowRight size={16} className="mb-2.5 shrink-0 text-dark-600" />
          <Campo label="Dárselas a">
            <select className="select" value={hacia} onChange={(e) => setHacia(e.target.value)}>
              {conductores.map((c) => <option key={idDe(c)} value={idDe(c)}>{c.nombre || c.name}</option>)}
            </select>
          </Campo>
          <Campo label={`Cuánto · ${hm(minutos)}`}>
            <input type="range" min="30" max="540" step="30" value={minutos}
              onChange={(e) => setMinutos(Number(e.target.value))}
              className="w-full accent-brand-500" style={{ minWidth: 180 }} />
          </Campo>
          <button
            onClick={() => { setMinutos(120); setDesde(idDe(conductores[0])); setHacia(idDe(conductores[1])) }}
            className="btn-ghost mb-1 flex items-center gap-1.5 px-2 py-1.5 text-[12.5px]"
          >
            <RotateCcw size={13} /> Reiniciar
          </button>
        </div>
      </section>

      {desde === hacia ? (
        <p className="mt-5 text-[13.5px] text-amber-300">Elige dos conductores distintos.</p>
      ) : sim && (
        <>
          {/* El veredicto, en una frase */}
          <section className="rise mt-6 border-y border-white/[0.06] py-6">
            <div className="flex flex-wrap items-center gap-3">
              <Clase id="aritmetica" />
              <p className="text-[17px] font-light leading-snug text-dark-200">
                {cambio < 0 ? (
                  <><b className="font-semibold text-emerald-400">{Math.abs(cambio)} conductor{Math.abs(cambio) > 1 ? 'es' : ''} menos</b> por encima de tu límite.</>
                ) : cambio > 0 ? (
                  <><b className="font-semibold text-red-400">{cambio} conductor{cambio > 1 ? 'es' : ''} más</b> por encima de tu límite.</>
                ) : (
                  <>El número de conductores por encima del límite <b className="font-semibold text-dark-50">no cambia</b>.</>
                )}
              </p>
            </div>
            <p className="mt-2 text-[13px] text-dark-500">
              {sim.pasaban} → {sim.pasan} sobre un límite de {hm(sim.limite_min)}
            </p>
          </section>

          {/* Antes y después, sólo de los afectados y de quien cruza el límite */}
          <section className="mt-6">
            <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">
              Proyección por conductor
            </h2>
            <div className="divide-y divide-white/[0.05]">
              {sim.despues.map((d, i) => {
                const a = sim.antes[i]
                const movido = d.id === desde || d.id === hacia
                const cruza = a.pasa !== d.pasa
                if (!movido && !cruza) return null
                return (
                  <div key={d.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                    <span className="min-w-[130px] text-[14px] font-semibold text-dark-50">{d.nombre}</span>
                    <span className="text-[13px] tabular-nums text-dark-500">{hm(a.proyeccion)}</span>
                    <ArrowRight size={12} className="shrink-0 text-dark-700" />
                    <span className={`text-[13px] font-semibold tabular-nums ${d.pasa ? 'text-red-300' : 'text-emerald-400'}`}>
                      {hm(d.proyeccion)}
                    </span>
                    <span className="ml-auto text-[11.5px] text-dark-600">
                      {d.pasa ? `${hm(-d.margen)} por encima` : `${hm(d.margen)} de margen`}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Los supuestos. Un simulador que no los enseña es un adivino. */}
          <section className="mt-8 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">
              Sobre qué se apoya este número
            </h2>
            <ul className="mt-3 space-y-2">
              {sim.supuestos.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-dark-400">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-dark-600" />{s}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="mt-9 border-t border-white/[0.06] pt-7">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">
          Lo que este simulador no va a hacer
        </h2>
        <div className="mt-4 space-y-3">
          {NO_SIMULABLE.map((x) => (
            <div key={x.q} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Clase id="nodem" mini />
                <h3 className="text-[13.5px] font-semibold text-dark-100">{x.q}</h3>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-dark-400">{x.r}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Campo({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label mb-0">{label}</span>
      {children}
    </label>
  )
}
