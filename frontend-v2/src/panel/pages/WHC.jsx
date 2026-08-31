import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT } from '../../i18n'
import {
  Loader2, Clock, AlertTriangle, CircleCheck, Info, ChevronDown, ChevronUp,
  Trash2, RefreshCw, Lock,
} from 'lucide-react'
import { whcAnalizar, getWhcPlan, deleteWhcPlan } from '../api'
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
  /* EL LÍMITE NO SE ELIGE. Son 54 h 30 min semanales, que es lo que fija
     Amazon en el Work Hours Compliance, y no una preferencia de cada nave: si
     cada empresa pone el suyo, dos DSP con la misma plantilla salen con
     resultados distintos y el dato deja de valer para comparar — que es
     justamente para lo que existe. Antes era un campo editable con 55 por
     defecto; el medio punto de diferencia es una hora larga a la semana por
     conductor. */
  const LIMITE_H = 54.5
  const limite = LIMITE_H
  const [excepciones, setExcepciones] = useState(0)
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [err, setErr] = useState('')
  const [abierto, setAbierto] = useState(null)

  const [guardado, setGuardado] = useState(null)
  const [editando, setEditando] = useState(false)

  const analizar = useCallback(async (txt, lim, exc) => {
    const cuerpo = txt ?? texto
    setCargando(true); setErr(''); setDatos(null)
    try {
      // `center` hace que el backend GUARDE el plan de esta semana.
      const r = await whcAnalizar({
        texto: cuerpo, limite_horas: lim ?? limite,
        excepciones: exc ?? excepciones, center,
      })
      setDatos(r.data)
      setEditando(false)
    } catch (e) {
      setErr(e?.response?.data?.detail || t('whc.error'))
    } finally { setCargando(false) }
  }, [texto, limite, excepciones, center, t])

  // Al entrar, se recupera el plan de ESTA semana y se analiza solo. Nada de
  // volver a pegarlo cada vez. Si cambia la semana, el backend no devuelve el
  // de la anterior: seria ver horas viejas creyendo que son las de ahora.
  useEffect(() => {
    let vivo = true
    setDatos(null); setGuardado(null); setTexto(''); setEditando(false)
    if (!center || center === 'Todos') return
    getWhcPlan(center).then(({ data }) => {
      if (!vivo || !data?.hay || !data.texto) return
      setGuardado(data)
      setTexto(data.texto)
      // El límite guardado se ignora a propósito: puede venir de un plan
      // analizado con el campo editable de antes, y ya no es una opción.
      if (data.excepciones != null) setExcepciones(data.excepciones)
      analizar(data.texto, data.limite_horas, data.excepciones)
    }).catch(() => {})
    return () => { vivo = false }
  }, [center]) // eslint-disable-line react-hooks/exhaustive-deps

  const borrar = async () => {
    if (!center || center === 'Todos') return
    try { await deleteWhcPlan(center) } catch {}
    setGuardado(null); setTexto(''); setDatos(null); setEditando(true)
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
          {/* Se enseña, no se edita: quien lo mira tiene que saber contra qué
              se está midiendo, y a la vez que no es una opción suya. */}
          <span className="flex items-center gap-1.5 rounded-lg bg-dark-800 px-2.5 py-1 text-xs text-dark-300">
            <Lock size={12} className="text-dark-500" />
            {t('whc.limite')} <span className="cifra font-semibold text-dark-100">54 h 30 min</span>
          </span>
          <label className="flex items-center gap-2 text-xs text-dark-400">
            {t('whc.excep')}
            <input type="number" value={excepciones} min={0} max={200}
              onChange={(e) => setExcepciones(Number(e.target.value))}
              className="w-16 rounded-lg border border-dark-700 bg-dark-900 px-2 py-1 text-sm text-dark-100" />
          </label>
          <button onClick={() => analizar()} disabled={cargando || texto.trim().length < 40}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-40">
            {cargando ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
            {t('whc.analizar')}
          </button>
          {/* El plan queda guardado por semana: aqui solo se decide si se
              reemplaza (pegar de nuevo) o se tira. */}
          {guardado && !editando && (
            <>
              <button onClick={() => { setEditando(true); setTexto('') }}
                className="flex items-center gap-1.5 rounded-lg border border-dark-700 px-3 py-2 text-xs text-dark-300 hover:bg-dark-800">
                <RefreshCw size={13} /> Actualizar (pegar de nuevo)
              </button>
              <button onClick={borrar}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10">
                <Trash2 size={13} /> Borrar
              </button>
              <span className="text-[11px] text-dark-500">
                guardado {String(guardado.updated_at || '').slice(0, 16).replace('T', ' ')}
              </span>
            </>
          )}
          {err && <span className="text-xs text-red-300">{err}</span>}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-dark-600">{t('whc.ayuda')}</p>
      </div>

      {datos && (
        <>
          {/* EL numero. Calculado con la misma formula que Amazon, que el
              propio scorecard define: "% of drivers complying with working hour
              limits". Validado al decimal contra 3 semanas reales de OGA5. */}
          {/* RITMO. Lo util a mitad de semana: el total todavia es bajo y no
              dice nada, lo que avisa es ir por encima de lo que toca a estas
              alturas. 6 bloques de ~9 h por semana -> el miercoles (dia 4) el
              tope razonable son 4 bloques, 36 h. */}
          {datos.ritmo && datos.ritmo.dia_semana < 7 && (
            <div className="card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">
                  Ritmo de la semana · día {datos.ritmo.dia_semana} de 7
                </div>
                <div className="text-[11px] text-dark-500">
                  a estas alturas, como mucho {datos.ritmo.bloques_ref} bloques ={' '}
                  <span className="font-semibold text-dark-300">{hm(datos.ritmo.horas_ref_min)}</span>
                  {!datos.ritmo.dia_leido_del_plan && ' · día deducido de hoy, no del plan'}
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {[['pasados', datos.ritmo.pasados, 'bg-red-500/15 text-red-300'],
                  ['en peligro', datos.ritmo.peligro, 'bg-orange-500/15 text-orange-300'],
                  ['justos', datos.ritmo.justos, 'bg-amber-500/15 text-amber-200'],
                  ['en ruta ahora', datos.ritmo.en_ruta_ahora, 'bg-sky-500/15 text-sky-300']]
                  .map(([lab, n, cls]) => (
                    <span key={lab} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${cls}`}>
                      {n} {lab}
                    </span>
                  ))}
              </div>
              {!!datos.ritmo.avisos?.length && (
                <ul className="mt-3 space-y-1.5">
                  {datos.ritmo.avisos.map((a, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-t border-dark-800 pt-1.5 text-xs first:border-0 first:pt-0">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-dark-200">{a.nombre}</span>
                        {a.trabajando_ahora && (
                          <span className="shrink-0 rounded bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-sky-200"
                                title="Tiene un bloque en curso: está en ruta ahora mismo. Todavía se le puede cortar el día.">
                            en ruta ahora
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-dark-400">
                        {hm(a.trabajado)} · {a.bloques} bloques
                        {a.exceso > 0 && <span className="ml-2 text-orange-300">+{hm(a.exceso)} de más</span>}
                        {a.bloques_restantes > 0 && (
                          <span className={`ml-2 ${a.proyeccion_pasa ? 'text-red-300' : 'text-dark-500'}`}>
                            acabaría en {hm(a.proyeccion)}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 border-t border-dark-800 pt-2 text-[11px] text-dark-500">
                «Acabaría en» supone que sigue trabajando los días que le quedan hasta
                6 bloques, a {hm(9 * 60)} cada uno. Es una proyección, no un dato.
              </p>
            </div>
          )}

          {/* El numero grande es EL TUYO: % de conductores que cumplen tus
              normas (semana y jornada). El de Amazon va debajo, porque no se
              sabe hasta que llega la scorecard con sus excepciones. */}
          {datos.whc_propio && (
              <div className="card p-5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">
                  {t('whc.propio.titulo')}
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-3">
                  <span className={`text-4xl font-bold tabular-nums ${
                    datos.whc_propio.incumplen === 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {datos.whc_propio.porcentaje} %
                  </span>
                  {datos.whc_propio.incumplen > 0 && (
                    <span className="rounded-lg bg-red-500/15 px-2 py-1 text-xs font-semibold text-red-300">
                      {datos.whc_propio.incumplen} incumplen
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-dark-400">
                  {t('whc.propio.formula')
                    .replace('{ok}', datos.whc_propio.conductores - datos.whc_propio.incumplen)
                    .replace('{n}', datos.whc_propio.conductores)
                    .replace('{h}', Math.round(datos.whc_propio.limite_semanal_min / 60))
                    .replace('{b}', Math.round(datos.whc_propio.limite_bloque_min / 60))}
                </p>
                {datos.whc_propio.incumplen > 0 && (
                  <p className="mt-1 text-xs text-red-300/90">
                    {t('whc.propio.desglose')
                      .replace('{s}', datos.whc_propio.por_semanal)
                      .replace('{b}', datos.whc_propio.por_bloque)
                      .replace('{h}', Math.round(datos.whc_propio.limite_bloque_min / 60))}
                  </p>
                )}
                {!!datos.whc_propio.quien?.length && (
                  <ul className="mt-2.5 space-y-1">
                    {datos.whc_propio.quien.slice(0, 12).map((q, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-dark-200">{q.nombre}</span>
                          {/* Bloque "en curso" en el plan: esta en ruta AHORA.
                              Es lo urgente de alguien que ya se ha pasado. */}
                          {q.trabajando_ahora && (
                            <span className="shrink-0 rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-red-200"
                                  title="Tiene un bloque en curso: está trabajando ahora mismo">
                              en ruta ahora
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-dark-400">
                          {Math.floor(q.trabajado / 60)}h {String(q.trabajado % 60).padStart(2, '0')}m
                          {q.supera_semanal && <span className="ml-2 text-red-300">semana</span>}
                          {q.bloques_pasados > 0 && (
                            <span className="ml-2 text-orange-300">
                              {q.bloques_pasados} bloque{q.bloques_pasados > 1 ? 's' : ''} de +
                              {Math.floor((q.peor_bloque || 0) / 60)}h
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 border-t border-dark-800 pt-2 text-[11px] text-dark-500">
                  {t('whc.propio.vsamazon')}
                </p>
              </div>
            )}

          {datos.whc && (
            <div className="card p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">
                    {t('whc.pct.titulo')}
                  </div>
                  {/* Con 0 excepciones esto NO es una medición: es lo que saldría
                      si Amazon no marca ninguna. Pintarlo en verde como un hecho
                      mientras la tabla enseña conductores pasados es un falso
                      positivo, aunque cada número por separado sea correcto. */}
                  <div className="mt-1 flex flex-wrap items-center gap-2.5">
                    <span className={`text-4xl font-bold tabular-nums ${
                      datos.whc.excepciones === 0 ? 'text-dark-200'
                        : datos.whc.porcentaje >= 100 ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {datos.whc.excepciones === 0 && <span className="opacity-60">~</span>}
                      {datos.whc.porcentaje} %
                    </span>
                    {/* El tier solo se pinta cuando hay scorecards reales que lo
                        respaldan. Si el backend manda null, se dice que no se
                        sabe en vez de adivinar un tier que no consta. */}
                    <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                      datos.whc.excepciones === 0 ? 'border border-dashed border-dark-600 text-dark-300'
                        : datos.whc.tier === 'Fantastic' ? 'bg-emerald-500/15 text-emerald-300'
                        : datos.whc.tier === 'Great' ? 'bg-sky-500/15 text-sky-300'
                        : datos.whc.tier ? 'bg-red-500/15 text-red-300'
                        : 'bg-dark-800 text-dark-400'}`}>
                      {datos.whc.tier || t('whc.pct.tierdesconocido')}
                    </span>
                    {datos.whc.excepciones === 0 && (
                      <span className="text-xs text-amber-300/90">{t('whc.pct.condicional')}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-dark-400">
                    {t('whc.pct.formula')
                      .replace('{ok}', datos.whc.conductores_con_actividad - datos.whc.excepciones)
                      .replace('{n}', datos.whc.conductores_con_actividad)}
                  </p>
                  {datos.whc.excepciones === 0 && (
                    <>
                      <p className="mt-1.5 text-xs text-amber-200/90">
                        {t('whc.pct.nosabemos')}
                      </p>
                      {datos.resumen?.superan > 0 && (
                        <p className="mt-1 text-xs text-dark-400">
                          {t('whc.pct.riesgo').replace('{n}', datos.resumen.superan)}
                        </p>
                      )}
                    </>
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
                        {/* Si el pegado no traia la linea de horas, el total se
                            reconstruye desde los bloques. Se marca para no
                            presentarlo como dato del portal. */}
                        <td className="px-3 py-2.5 text-right tabular-nums text-dark-300">
                          {hm(c.trabajado)}
                          {c.trabajado_origen === 'bloques' && (
                            <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium text-amber-300"
                                  title="El pegado no traía la línea de horas de este conductor; el total está sumado desde sus bloques.">
                              de bloques
                            </span>
                          )}
                        </td>
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
