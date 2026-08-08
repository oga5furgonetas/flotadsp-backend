/* ─────────────────────────────────────────────────────────────────────────────
   COCKPIT · superficie 1 — HOY
   ---------------------------------------------------------------------------
   Sustituye conceptualmente a: Dashboard, MiDia, AvisosITV, Vencimientos,
   Renting, ExpiryAlerts y Actividad. Siete pantallas que hoy responden a la
   misma pregunta desde ángulos distintos.

   Principio: la pantalla empieza por lo que NO va bien. Lo que va bien ocupa
   una línea al final, no ocho tarjetas. Si no hay nada, se dice y se acaba.
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo } from 'react'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import { generarSenales } from '../motor'
import { Clase, PorQue, Acciones, Frescura } from '../ui'

export default function Hoy({ D, onAbrirEntidad }) {
  const senales = useMemo(() => generarSenales(D), [D])
  const criticas = senales.filter((s) => s.prioridad >= 84)
  const resto = senales.filter((s) => s.prioridad < 84 && s.clase !== 'nodem')
  const insuficientes = senales.filter((s) => s.clase === 'nodem')

  const hora = new Date().getHours()
  const saludo = hora < 13 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'
  const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  /* Enlaza una señal con la entidad de la que habla, para poder abrir su ficha
     desde la propia señal. Sin esto, "1003 LAB tiene un daño grave" obliga a ir
     a buscarla — que es exactamente el salto de pantalla que queremos matar. */
  const entidadDe = (s) => {
    const v = D.vehiculos.find((x) => s.titulo.includes(x.license_plate))
    if (v) return { tipo: 'vehiculo', id: v.id, etiqueta: v.license_plate }
    const c = D.conductores.find((x) => s.titulo.includes(x.name) || s.resumen?.includes(x.name))
    if (c) return { tipo: 'conductor', id: c.id, etiqueta: c.name }
    return null
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 sm:px-8">
      <header className="rise">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-dark-600">{fecha}</p>
        <h1 className="mt-2.5 font-display text-[clamp(28px,4vw,44px)] font-semibold leading-[1.05] tracking-[-0.035em] text-dark-50">
          {saludo}.
        </h1>
        <p className="mt-3 max-w-lg text-[17px] font-light leading-relaxed text-dark-300">
          {criticas.length > 0
            ? <>Hay <b className="font-semibold text-dark-50">{criticas.length} cosas</b> que no pueden esperar.</>
            : <>Nada urgente ahora mismo.</>}
          {resto.length > 0 && <span className="text-dark-500"> Otras {resto.length} pueden esperar.</span>}
        </p>
      </header>

      {criticas.length === 0 && resto.length === 0 ? (
        <div className="rise mt-12 flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] py-14 text-center">
          <CheckCircle2 size={26} className="text-emerald-400" />
          <p className="text-[15px] text-emerald-200">Sin excepciones abiertas.</p>
          <p className="max-w-xs text-[12.5px] leading-relaxed text-dark-500">
            Eso significa que ninguna regla ha saltado, no que todo esté perfecto. Mira la frescura de las
            fuentes abajo antes de fiarte del silencio.
          </p>
        </div>
      ) : (
        <>
          {criticas.length > 0 && (
            <section className="mt-10">
              <Titulo punto="#f87171">No puede esperar</Titulo>
              <div className="mt-4 space-y-2.5">
                {criticas.map((s, i) => (
                  <Tarjeta key={s.id} s={s} D={D} i={i} entidad={entidadDe(s)} onAbrirEntidad={onAbrirEntidad} />
                ))}
              </div>
            </section>
          )}

          {resto.length > 0 && (
            <section className="mt-10">
              <Titulo punto="#8f8f98">Puede esperar</Titulo>
              <div className="mt-3 divide-y divide-white/[0.05]">
                {resto.map((s) => {
                  const e = entidadDe(s)
                  return (
                    <button
                      key={s.id}
                      onClick={() => e && onAbrirEntidad(e)}
                      disabled={!e}
                      className="float-row group -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-3 rounded-xl px-3 py-3 text-left disabled:cursor-default"
                    >
                      <span className="flex-1 text-[14px] leading-snug text-dark-200">{s.titulo}</span>
                      <Clase id={s.clase} mini />
                      {e && <ChevronRight size={14} className="shrink-0 text-dark-700 transition-transform group-hover:translate-x-0.5 group-hover:text-dark-400" />}
                    </button>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}

      {/* Datos insuficientes: su propio sitio, ni escondidos ni mezclados con
          las señales. Es información, no ruido: dice dónde NO mirar todavía. */}
      {insuficientes.length > 0 && (
        <section className="mt-10">
          <Titulo punto="#4b4b53">Sin datos suficientes</Titulo>
          <div className="mt-3 space-y-1.5">
            {insuficientes.map((s) => (
              <p key={s.id} className="text-[13px] leading-relaxed text-dark-500">
                {s.titulo} <span className="text-dark-600">· {s.resumen}</span>
              </p>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-12 border-t border-white/[0.05] pt-6">
        <h2 className="font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] text-dark-600">De cuándo son estos datos</h2>
        <div className="mt-3 space-y-1.5">
          {Object.keys(D.fuentes || {}).map((k) => (
            <div key={k}><Frescura fuente={k} fuentes={D.fuentes} /></div>
          ))}
        </div>
      </footer>
    </div>
  )
}

function Titulo({ punto, children }) {
  return (
    <h2 className="flex items-center gap-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: punto }} />
      {children}
    </h2>
  )
}

function Tarjeta({ s, D, i, entidad, onAbrirEntidad }) {
  return (
    <article
      className="rise rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-colors hover:border-white/[0.1]"
      style={{ animationDelay: `${Math.min(i * 45, 240)}ms` }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Clase id={s.clase} />
        {entidad && (
          <button
            onClick={() => onAbrirEntidad(entidad)}
            className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-semibold text-dark-300 transition-colors hover:bg-white/[0.12] hover:text-dark-50"
          >
            {entidad.etiqueta} →
          </button>
        )}
        <span className="ml-auto"><Frescura fuente={s.fuente} fuentes={D.fuentes} /></span>
      </div>
      <h3 className="text-[16px] font-semibold leading-snug tracking-[-0.01em] text-dark-50">{s.titulo}</h3>
      <p className="mt-1 text-[13.5px] leading-relaxed text-dark-400">{s.resumen}</p>
      <Acciones acciones={s.acciones} />
      <PorQue senal={s} fuentes={D.fuentes} />
    </article>
  )
}
