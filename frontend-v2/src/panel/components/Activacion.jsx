import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ArrowRight, Upload, Users, Camera, X } from 'lucide-react'
import { getOnboarding } from '../api'
import { useT } from '../../i18n'

/* ── Guía de activación ────────────────────────────────────────────────────
   Reemplaza al típico asistente modal: ese bloquea, se cierra sin leer y
   esconde el producto. Esto vive DENTRO del panel, se puede ignorar y
   desaparece solo cuando los tres pasos están hechos.

   Regla clave: el estado sale de datos REALES del servidor (cuántas
   furgonetas, conductores y auditorías hay), nunca de una marca guardada.
   Un flag "ya lo hizo" mentiría en cuanto el DSP borrara su flota. */

function Paso({ icon: Icon, n, titulo, hint, hecho, resumen, cta, to, cta2, to2, bloqueado, bloqueadoMsg }) {
  return (
    <li className={`relative flex gap-3.5 rounded-xl border p-3.5 transition ${
      hecho ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
            : bloqueado ? 'border-white/[0.05] bg-white/[0.01] opacity-60'
                        : 'border-white/[0.07] bg-white/[0.02]'}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
        hecho ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.05] text-dark-400'}`}>
        {hecho ? <Check size={15} /> : <Icon size={15} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[13.5px] font-semibold ${hecho ? 'text-emerald-200' : 'text-dark-100'}`}>
          <span className="mr-1.5 font-mono text-[11px] text-dark-500">{n}</span>{titulo}
        </p>
        {hecho ? (
          <p className="mt-0.5 text-[12px] text-emerald-300/80">{resumen}</p>
        ) : (
          <>
            <p className="mt-0.5 text-[12px] leading-relaxed text-dark-400">{hint}</p>
            {bloqueado ? (
              <p className="mt-2 text-[11.5px] font-medium text-dark-500">{bloqueadoMsg}</p>
            ) : (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Link to={to}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110">
                  {cta} <ArrowRight size={12} />
                </Link>
                {cta2 && (
                  <Link to={to2} className="text-[12px] font-medium text-dark-400 transition hover:text-dark-200">
                    {cta2}
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </li>
  )
}

export default function Activacion() {
  const { t } = useT()
  const [data, setData] = useState(null)
  // Se puede esconder, pero NO se marca nada como hecho: si mañana faltan
  // datos de verdad, la guía vuelve al reabrir sesión en otro equipo.
  const [oculto, setOculto] = useState(() => sessionStorage.getItem('ob_oculto') === '1')

  useEffect(() => {
    let vivo = true
    getOnboarding().then((r) => { if (vivo) setData(r.data) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  // Silencio absoluto si aún no sabemos, si ya está todo hecho o si lo ocultó.
  if (!data || data.completo || oculto) return null

  const paso = (id) => data.pasos.find((x) => x.id === id) || { hecho: false, n: 0 }
  const v = paso('vehiculos'), c = paso('conductores'), i = paso('inspeccion')
  const pct = Math.round((data.hechos / data.total) * 100)
  // "1 furgoneta", no "1 furgonetas": el singular importa en los 6 idiomas.
  const cuenta = (n, clave) => `${n} ${t(n === 1 ? `${clave}1` : clave)}`

  return (
    <section className="rise mb-6 rounded-2xl border border-brand-500/20 bg-brand-500/[0.03] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em] text-dark-50">{t('ob.titulo')}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-dark-400">{t('ob.sub')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-display text-[15px] font-semibold tabular-nums text-brand-300">{data.hechos}/{data.total}</p>
            <p className="text-[10.5px] text-dark-500">{t('ob.progreso')}</p>
          </div>
          <button onClick={() => { sessionStorage.setItem('ob_oculto', '1'); setOculto(true) }}
            title={t('ob.ocultar')} aria-label={t('ob.ocultar')}
            className="rounded-lg p-1.5 text-dark-600 transition hover:bg-white/[0.05] hover:text-dark-300">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="mb-4 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-500 transition-[width] duration-700"
          style={{ width: `${pct}%` }} />
      </div>

      <ol className="grid gap-2 lg:grid-cols-3">
        <Paso icon={Upload} n="1" hecho={v.hecho}
          titulo={t('ob.v.tit')} hint={t('ob.v.hint')}
          resumen={cuenta(v.n, 'ob.v.ok')}
          cta={t('ob.v.cta')} to="/panel/importaciones"
          cta2={t('ob.v.cta2')} to2="/panel/vehiculos" />
        <Paso icon={Users} n="2" hecho={c.hecho}
          titulo={t('ob.c.tit')} hint={t('ob.c.hint')}
          resumen={cuenta(c.n, 'ob.c.ok')}
          cta={t('ob.c.cta')} to="/panel/conductores" />
        <Paso icon={Camera} n="3" hecho={i.hecho}
          titulo={t('ob.i.tit')} hint={t('ob.i.hint')}
          resumen={cuenta(i.n, 'ob.i.ok')}
          cta={t('ob.i.cta')} to="/panel/inspecciones"
          // Sin furgonetas ni conductores no se puede auditar: en vez de
          // dejar que lo intente y choque, se explica el porqué.
          bloqueado={!v.hecho || !c.hecho} bloqueadoMsg={t('ob.bloqueado')} />
      </ol>
    </section>
  )
}
