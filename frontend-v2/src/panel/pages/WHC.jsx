import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT } from '../../i18n'
import {
  Loader2, Clock, AlertTriangle, CircleCheck, Info, ChevronDown, ChevronUp,
} from 'lucide-react'
import { whcAnalizar } from '../api'
import { lista } from '../../lib/lista'

/* ────────────────────────────────────────────────────────────────────────────
   WHC — Working Hours Compliance.

   Amazon te dice quién se pasó de horas en el informe de excepciones, cuando la
   semana ya cerró. Aquí lo ves con la semana abierta, pegando el plan del
   portal, y sabes cuánto margen le queda a cada uno ANTES de que se pase.

   QUÉ AFIRMA Y QUÉ NO — esto es lo importante de esta pantalla:

   · Lo SEMANAL es un hecho. El total trabajado lo da el propio portal y el
     parser lo reconcilia con la suma de sus bloques (validado con 61
     conductores de una semana real: cuadran 60, y el que falla se desvía 6
     minutos por redondeo del portal).

   · Lo DIARIO es solo un AVISO DE RIESGO, nunca un incumplimiento. Se probaron
     todos los umbrales de duración de bloque contra una semana con excepciones
     reales conocidas: ninguno las reproduce. El plan da la hora PLANIFICADA;
     Amazon calcula la excepción diaria sobre lo FICHADO, que no está en esta
     vista. Decir "este incumplió" con este dato sería mentir.
   ──────────────────────────────────────────────────────────────────────────── */

const hm = (m) => (m === null || m === undefined ? '—'
  : `${Math.abs(m) < 0 ? '' : ''}${Math.floor(Math.abs(m) / 60)}h ${String(Math.abs(m) % 60).padStart(2, '0')}m`)
const signo = (m) => (m < 0 ? `−${hm(m)}` : hm(m))

export default function WHC() {
  const { center } = useOutletContext()
  const { t } = useT()
  const [texto, setTexto] = useState('')
  const [limite, setLimite] = useState(55)
  const [excepciones, setExcepciones] = useState(0)
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [err, setErr] = useState('')
  const [abierto, setAbierto] = useState(null)

  const analizar = async () => {
    setCargando(true); setErr(''); setDatos(null)
    try {
      const r = await whcAnalizar({ texto, limite_horas: limite, excepciones })
      setDatos(r.data)
    } catch (e) {
      setErr(e?.response?.data?.detail || t('whc.error'))
    } finally { setCargando(false) }
  }

  const filas = lista(datos?.conductores)
  const r = datos?.resumen

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="rise font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">
          WHC <span className="text-dark-600">· {center}</span>
        </h1>
        <p className="mt-1 text-xs text-dark-500">{t('whc.sub')}</p>
      </div>

      <div className="card p-4">
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-dark-500">
          {t('whc.pega')}
        </label>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={7}
          placeholder={t('whc.placeholder')}
          className="w-full rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 font-mono text-xs text-dark-100 placeholder:text-dark-600" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-dark-400">
            {t('whc.limite')}
            <input type="number" value={limite} min={1} max={100} step={0.5}
              onChange={(e) => setLimite(Number(e.target.value))}
              className="w-20 rounded-lg border border-dark-700 bg-dark-900 px-2 py-1 text-sm text-dark-100" />
            <span className="text-dark-600">h</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-dark-400">
            {t('whc.excep')}
            <input type="number" value={excepciones} min={0} max={200}
              onChange={(e) => setExcepciones(Number(e.target.value))}
              className="w-16 rounded-lg border border-dark-700 bg-dark-900 px-2 py-1 text-sm text-dark-100" />
          </label>
          <button onClick={analizar} disabled={cargando || texto.trim().length < 40}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-40">
            {cargando ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
            {t('whc.analizar')}
          </button>
          {err && <span className="text-xs text-red-300">{err}</span>}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-dark-600">{t('whc.ayuda')}</p>
      </div>

      {datos && (
        <>
          {/* EL numero. Calculado con la misma formula que Amazon, que el
              propio scorecard define: "% of drivers complying with working hour
              limits". Validado al decimal contra 3 semanas reales de OGA5. */}
          {datos.whc && (
            <div className="card p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">
                    {t('whc.pct.titulo')}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2.5">
                    <span className={`text-4xl font-bold tabular-nums ${
                      datos.whc.porcentaje >= 100 ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {datos.whc.porcentaje} %
                    </span>
                    {/* El tier solo se pinta cuando hay scorecards reales que lo
                        respaldan. Si el backend manda null, se dice que no se
                        sabe en vez de adivinar un tier que no consta. */}
                    <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                      datos.whc.tier === 'Fantastic' ? 'bg-emerald-500/15 text-emerald-300'
                        : datos.whc.tier === 'Great' ? 'bg-sky-500/15 text-sky-300'
                        : datos.whc.tier ? 'bg-red-500/15 text-red-300'
                        : 'bg-dark-800 text-dark-400'}`}>
                      {datos.whc.tier || t('whc.pct.tierdesconocido')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-dark-400">
                    {t('whc.pct.formula')
                      .replace('{ok}', datos.whc.conductores_con_actividad - datos.whc.excepciones)
                      .replace('{n}', datos.whc.conductores_con_actividad)}
                  </p>
                  {/* Lo que de verdad decide la semana: en 17 scorecards no hay
                      ni uno con Fantastic y alguna excepcion. */}
                  {datos.whc.excepciones === 0 && (
                    <p className="mt-1.5 text-xs font-medium text-emerald-300/90">
                      {t('whc.pct.aviso1')}
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">
                    {t('whc.pct.coste')}
                  </div>
                  <div className="mt-0.5 text-2xl font-bold tabular-nums text-dark-100">
                    &minus;{datos.whc.coste_por_excepcion}
                  </div>
                  <p className="text-[11px] leading-relaxed text-dark-500">
                    {t('whc.pct.siuna').replace('{p}', datos.whc.porcentaje_si_una_mas)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-4">
            {[
              [r.superan, t('whc.kpi.superan'), r.superan ? 'text-red-300' : 'text-emerald-300'],
              [r.al_limite, t('whc.kpi.allimite'), r.al_limite ? 'text-amber-300' : 'text-dark-300'],
              [r.con_riesgo_diario, t('whc.kpi.riesgo'), 'text-dark-300'],
              [r.total, t('whc.kpi.total'), 'text-dark-300'],
            ].map(([v, l, c]) => (
              <div key={l} className="card p-3 text-center">
                <div className={`text-2xl font-bold tabular-nums ${c}`}>{v}</div>
                <div className="text-[10px] uppercase tracking-wide text-dark-600">{l}</div>
              </div>
            ))}
          </div>

          {r.no_cuadran > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-3 text-xs text-amber-200">
              <AlertTriangle size={14} className="mt-px shrink-0" />
              {t('whc.nocuadran').replace('{n}', r.no_cuadran)}
            </div>
          )}

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-800 text-[11px] uppercase tracking-wide text-dark-500">
                  <th className="px-4 py-2.5 text-left font-semibold">{t('whc.col.conductor')}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t('whc.col.trabajado')}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t('whc.col.margen')}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{t('whc.col.bloques')}</th>
                  <th className="px-4 py-2.5 text-left font-semibold">{t('whc.col.estado')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {filas.map((c, i) => {
                  const abierta = abierto === i
                  return (
                    <>
                      <tr key={c.nombre} onClick={() => setAbierto(abierta ? null : i)}
                        className="cursor-pointer hover:bg-dark-800/40">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5 font-medium text-dark-100">
                            {c.riesgo_diario.length > 0
                              ? (abierta ? <ChevronUp size={12} className="text-dark-600" />
                                : <ChevronDown size={12} className="text-dark-600" />)
                              : <span className="w-3" />}
                            {c.nombre}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-dark-300">{hm(c.trabajado)}</td>
                        <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                          c.supera_semanal ? 'text-red-300' : c.al_limite ? 'text-amber-300' : 'text-emerald-300'}`}>
                          {signo(c.margen_semanal)}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-dark-500">{c.dias_trabajados}</td>
                        <td className="px-4 py-2.5">
                          {c.supera_semanal ? (
                            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                              {t('whc.est.supera')}
                            </span>
                          ) : c.al_limite ? (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                              {t('whc.est.limite')}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-400/70">
                              <CircleCheck size={11} /> {t('whc.est.ok')}
                            </span>
                          )}
                          {c.riesgo_diario.length > 0 && (
                            <span className="ml-2 text-[10px] text-dark-600">
                              {t('whc.riesgo.n').replace('{n}', c.riesgo_diario.length)}
                            </span>
                          )}
                        </td>
                      </tr>
                      {abierta && c.riesgo_diario.length > 0 && (
                        <tr key={`${c.nombre}-d`} className="bg-dark-900/50">
                          <td colSpan={5} className="px-4 py-3">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-dark-500">
                              {t('whc.bloques.largos')}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {c.riesgo_diario.map((b, j) => (
                                <span key={j} className="rounded-lg bg-dark-800 px-2.5 py-1 text-[11px] text-dark-200">
                                  {b.inicio}{b.fin ? ` – ${b.fin}` : ''} · <b>{hm(b.minutos)}</b>
                                  {b.estimado && <span className="ml-1 text-dark-600">({t('whc.estimado')})</span>}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Esto no es letra pequeña por cubrirse: es la diferencia entre una
              herramienta en la que se confía y otra que se deja de abrir. */}
          <div className="flex items-start gap-2 rounded-xl border border-dark-800 bg-dark-900/50 p-3.5">
            <Info size={14} className="mt-0.5 shrink-0 text-dark-500" />
            <p className="text-[11px] leading-relaxed text-dark-500">{datos.aviso_diario}</p>
          </div>
        </>
      )}
    </div>
  )
}
