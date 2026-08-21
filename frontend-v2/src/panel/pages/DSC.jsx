import { useCallback, useEffect, useState } from 'react'
import { MapPinned, AlertTriangle, Hand, RefreshCw } from 'lucide-react'
import { cortexDsc } from '../api'
import { useT } from '../../i18n'

/* Dónde se deja cada paquete.
   Es la métrica que más le cuesta a un DSP: en 17 scorecards reales de OGA5,
   "Delivery Success Conditions (DSC) DPMO" salió como área de foco en 14 y fue
   la número 1 en 12. Muy por encima del WHC (5) o del DCR (1).

   Lo que se enseña es un HECHO medido, no una predicción: dónde deja los
   paquetes cada conductor. El ranking va por EXCESO sobre la media de la
   flota, nunca por porcentaje bruto, porque ordenar por tasa señalaría al de
   poco volumen — que es justo el falso positivo a evitar. */

const COLOR = {
  riesgo: 'bg-red-500', mano: 'bg-emerald-500',
  seguro: 'bg-sky-500', otro: 'bg-dark-600',
}

export default function DSC() {
  // `useT()` devuelve el contexto entero ({ lang, setLang, t }), no la funcion.
  // Sin desestructurar, `t('...')` es "t is not a function" y la pantalla se
  // cae entera en cuanto pinta la primera etiqueta.
  const { t } = useT()
  const [dias, setDias] = useState(7)
  const [d, setD] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async (n) => {
    setCargando(true); setError('')
    try {
      const { data } = await cortexDsc({ dias: n })
      setD(data)
    } catch (e) {
      setError(e?.response?.data?.detail || t('dsc.error'))
    } finally { setCargando(false) }
  }, [t])

  useEffect(() => { cargar(dias) }, [cargar, dias])

  const f = d?.flota

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-dark-50">
            <MapPinned size={20} className="text-red-400" /> {t('dsc.title')}
          </h1>
          <p className="mt-0.5 text-sm text-dark-400">{t('dsc.sub')}</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((n) => (
            <button key={n} onClick={() => setDias(n)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                dias === n ? 'bg-orange-500 text-white' : 'bg-dark-800 text-dark-300 hover:bg-dark-700'}`}>
              {n} d
            </button>
          ))}
          <button onClick={() => cargar(dias)} disabled={cargando}
            className="rounded-lg bg-dark-800 p-2 text-dark-300 hover:bg-dark-700 disabled:opacity-40">
            <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && <div className="card border-red-500/30 p-4 text-sm text-red-300">{error}</div>}

      {cargando && !d && <div className="card p-8 text-center text-dark-400">{t('dsc.loading')}</div>}

      {d && !d.total && (
        <div className="card p-8 text-center text-dark-400">{t('dsc.vacio')}</div>
      )}

      {f && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              [`${f.pct_riesgo} %`, t('dsc.kpi.riesgo'), f.pct_riesgo > 10 ? 'text-red-300' : 'text-amber-300', AlertTriangle],
              [`${f.pct_mano} %`, t('dsc.kpi.mano'), 'text-emerald-300', Hand],
              [d.total.toLocaleString('es-ES'), t('dsc.kpi.total'), 'text-dark-100', null],
              [f.contradicciones, t('dsc.kpi.contra'), f.contradicciones ? 'text-amber-300' : 'text-dark-300', null],
            ].map(([v, l, c, Icon]) => (
              <div key={l} className="card p-4">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-dark-500">
                  {Icon && <Icon size={12} />} {l}
                </div>
                <div className={`mt-1 text-2xl font-bold tabular-nums ${c}`}>{v}</div>
              </div>
            ))}
          </div>

          {/* Reparto real. Una barra apilada dice más que una tabla de 16 filas. */}
          <div className="card p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">
              {t('dsc.reparto')}
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-dark-800">
              {d.reparto.map((r) => (
                <div key={r.ctx} className={COLOR[r.grupo]} style={{ width: `${r.pct}%` }}
                  title={`${r.etiqueta}: ${r.n} (${r.pct} %)`} />
              ))}
            </div>
            <div className="mt-3 grid gap-x-5 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {d.reparto.filter((r) => r.pct >= 0.05).map((r) => (
                <div key={r.ctx} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${COLOR[r.grupo]}`} />
                  <span className="flex-1 truncate text-dark-300">{r.etiqueta}</span>
                  <span className="tabular-nums text-dark-500">{r.n.toLocaleString('es-ES')}</span>
                  <span className={`w-14 text-right tabular-nums font-semibold ${
                    r.grupo === 'riesgo' ? 'text-red-300' : 'text-dark-400'}`}>{r.pct} %</span>
                </div>
              ))}
            </div>
          </div>

          {/* El ranking. Ordenado por exceso, no por porcentaje. */}
          <div className="card overflow-hidden">
            <div className="border-b border-dark-800 p-4">
              <div className="text-sm font-semibold text-dark-100">{t('dsc.ranking')}</div>
              <p className="mt-0.5 text-xs text-dark-500">
                {t('dsc.ranking.expl').replace('{p}', f.pct_riesgo).replace('{m}', d.minimo_entregas)}
              </p>
            </div>
            {!d.conductores.length ? (
              <div className="p-6 text-center text-sm text-dark-400">{t('dsc.ranking.nadie')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-dark-900/60 text-[11px] uppercase tracking-wide text-dark-500">
                    <tr>
                      <th className="p-3 text-left font-semibold">{t('dsc.th.cond')}</th>
                      <th className="p-3 text-right font-semibold">{t('dsc.th.entregas')}</th>
                      <th className="p-3 text-right font-semibold">{t('dsc.th.pct')}</th>
                      <th className="p-3 text-right font-semibold">{t('dsc.th.exceso')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800">
                    {d.conductores.map((c) => (
                      <tr key={c.driver_id} className="hover:bg-dark-900/40">
                        <td className="p-3">
                          <div className="font-medium text-dark-100">{c.nombre}</div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-dark-500">
                            <span>{c.pct_mano} % {t('dsc.enmano')}</span>
                            {/* Aviso honesto: con poca muestra el % baila. */}
                            {c.muestra_corta && (
                              <span className="rounded bg-dark-800 px-1.5 py-0.5 text-dark-400">
                                {t('dsc.muestracorta')}
                              </span>
                            )}
                            {c.contradicciones > 0 && (
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">
                                {c.contradicciones} {t('dsc.contra')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right tabular-nums text-dark-300">{c.entregas}</td>
                        <td className={`p-3 text-right tabular-nums font-semibold ${
                          c.pct_riesgo > f.pct_riesgo * 1.5 ? 'text-red-300' : 'text-amber-300'}`}>
                          {c.pct_riesgo} %
                        </td>
                        <td className="p-3 text-right">
                          <span className="font-bold tabular-nums text-dark-100">+{c.exceso}</span>
                          <div className="text-[11px] text-dark-500">
                            {t('dsc.esperaba').replace('{n}', c.esperado)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Los que vuelven a la estación, por causa. El motor de calidad ya
              los cuenta como "fallo"; sin la causa no se puede hacer nada con
              ellos. Cada fila trae la acción concreta cuando la hay. */}
          {d.retornos?.total > 0 && (
            <div className="card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">
                  {t('dsc.ret')}
                </div>
                <div className="text-sm text-dark-400">
                  {t('dsc.ret.total').replace('{n}', d.retornos.total)}
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {d.retornos.causas.slice(0, 8).map((c) => (
                  <div key={c.ctx} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="w-11 shrink-0 text-right tabular-nums font-semibold text-dark-200">
                      {c.pct} %
                    </span>
                    <span className="w-44 shrink-0 truncate text-dark-300">{c.etiqueta}</span>
                    <span className="tabular-nums text-dark-500">{c.n}</span>
                    {c.accion && (
                      <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-300">
                        {c.accion}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* El patrón horario del comercio cerrado: es lo que convierte
                  "199 fallos" en "mueve esas paradas de las 15h". */}
              {d.retornos.cerrado > 0 && (
                <div className="mt-5 border-t border-dark-800 pt-4">
                  <div className="text-sm text-dark-300">
                    <span className="font-semibold text-amber-300">
                      {d.retornos.cerrado_pct_siesta} %
                    </span>{' '}
                    {t('dsc.ret.siesta').replace('{n}', d.retornos.cerrado)}
                  </div>
                  <div className="mt-3 flex items-end gap-1">
                    {d.retornos.cerrado_horas.map((h) => {
                      const max = Math.max(...d.retornos.cerrado_horas.map((x) => x.n)) || 1
                      const cierre = ['14', '15', '16'].includes(h.h)
                      return (
                        <div key={h.h} className="flex flex-1 flex-col items-center gap-1">
                          <div className={`w-full rounded-t ${cierre ? 'bg-amber-500' : 'bg-dark-600'}`}
                            style={{ height: `${Math.max(4, (h.n / max) * 56)}px` }}
                            title={`${h.h}h: ${h.n}`} />
                          <span className={`text-[10px] tabular-nums ${
                            cierre ? 'font-semibold text-amber-300' : 'text-dark-500'}`}>{h.h}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="px-1 text-xs leading-relaxed text-dark-500">
            {t('dsc.nota')}
          </p>
        </>
      )}
    </div>
  )
}
