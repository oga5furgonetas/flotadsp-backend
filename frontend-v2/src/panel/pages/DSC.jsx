import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { MapPinned, AlertTriangle, Hand, RefreshCw, Loader2, ChevronRight, StickyNote } from 'lucide-react'
import { cortexDsc, getDireccionesProblema, guardarNotaDireccion, consolidarDirecciones } from '../api'
import { useT } from '../../i18n'
import { useOrden } from '../../lib/orden'
import ThOrden from '../components/ThOrden'

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

/* ── DIRECCIONES QUE DAN PROBLEMAS ─────────────────────────────────────────
   El fallo se ve paquete a paquete, y paquete a paquete no se repite: se
   repite la DIRECCIÓN. Medido sobre 90 días, 47 direcciones acumulan 165
   paquetes, y una sola —reparalotodo.net— falla 9 veces y las 9 por el mismo
   motivo. Nadie lo había mirado nunca porque no había dónde mirarlo.

   Arreglar una dirección UNA vez se lleva por delante todos sus fallos
   futuros. Por eso lo importante de esta pantalla no es la lista: es la NOTA.
   Ver las direcciones que fallan sin poder dejar escrito el porqué no arregla
   nada, porque quien lo averigua hoy no es quien reparte mañana. */

const MOTIVO_TXT = {
  BUSINESS_CLOSED: 'Negocio cerrado',
  ADDRESS_NOT_FOUND: 'No se encuentra',
  INACCESSIBLE_DELIVERY_LOCATION: 'No se puede acceder',
  CUSTOMER_UNAVAILABLE: 'Cliente ausente',
  NO_SECURE_LOCATION: 'Sin sitio seguro',
  LOCKER_ISSUE: 'Problema con el locker',
  RESCHEDULED_BY_CUSTOMER: 'Aplazado por el cliente',
  TR_CANCELLED: 'Cancelado por Amazon',
  OBJECT_MISSING: 'Paquete perdido',
  NO_ITEMS_DELIVERED: 'No se entregó nada',
  DAMAGED: 'Dañado',
  BAD_WEATHER: 'Meteorología',
  SIN_MOTIVO: 'Sin motivo',
  NONE: 'Sin motivo',
}

function FilaDireccion({ d, onGuardar }) {
  const [abierto, setAbierto] = useState(false)
  const [txt, setTxt] = useState(d.nota || '')
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true)
    try { await onGuardar(d, txt) } finally { setGuardando(false) }
  }

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setAbierto(!abierto)}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-dark-800/40">
        <span className="cifra w-9 flex-none text-right font-semibold text-orange-300">{d.fallos}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-dark-200">{d.direccion}</span>
          <span className="mt-0.5 block text-[11.5px] text-dark-500">
            {MOTIVO_TXT[d.motivo_principal] || d.motivo_principal}
            {d.motivo_n > 1 && <> <span className="cifra">×{d.motivo_n}</span></>}
            {' · '}<span className="cifra">{d.dias_distintos}</span> {d.dias_distintos === 1 ? 'día' : 'días'} distintos
            {d.rutas?.length > 0 && <> · {d.rutas.slice(0, 3).join(' ')}</>}
          </span>
        </span>
        {d.accionable && (
          <span className="hidden rounded-full bg-lime-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-lime-300 ring-1 ring-inset ring-lime-500/30 sm:inline">
            se puede arreglar
          </span>
        )}
        {d.nota && <StickyNote size={13} className="flex-none text-lime-400" title="Tiene nota" />}
        <ChevronRight size={14} className={`flex-none text-dark-600 transition-transform ${abierto ? 'rotate-90' : ''}`} />
      </button>

      {abierto && (
        <div className="space-y-2.5 border-t border-dark-800 px-3.5 py-3">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(d.motivos).map(([m, n]) => (
              <span key={m} className="rounded bg-dark-800 px-2 py-0.5 text-[11.5px] text-dark-400">
                {MOTIVO_TXT[m] || m} <span className="cifra text-dark-300">{n}</span>
              </span>
            ))}
          </div>

          {/* La sugerencia sale del patron, no de una plantilla: el motivo que
              manda y, cuando importa, la hora media. Solo aparece si hay
              patron — una para cada direccion seria ruido justo donde alguien
              va a decidir algo. */}
          {d.sugerencia && (
            <div className="rounded-lg border border-brand-500/25 bg-brand-500/[0.07] px-3 py-2">
              <p className="text-[12.5px] leading-relaxed text-dark-200">{d.sugerencia}</p>
              {txt !== d.sugerencia && (
                <button onClick={() => setTxt(d.sugerencia)}
                  className="mt-1.5 text-[11.5px] font-medium text-brand-300 hover:text-brand-200">
                  Usar como nota y editarla
                </button>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11.5px] font-semibold text-dark-400">
              Qué hay que saber de esta dirección
            </label>
            <textarea rows={2} value={txt} onChange={(e) => setTxt(e.target.value)}
              placeholder="El acceso es por la parte de atrás · Cierran a las 14:00 · Llamar al 6XX antes de subir"
              className="input text-[13px]" />
            <div className="mt-1.5 flex items-center gap-2">
              <button onClick={guardar} disabled={guardando || txt === (d.nota || '')}
                className="btn-primary px-3 py-1 text-[12.5px] disabled:opacity-40">
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
              {d.nota_por && (
                <span className="text-[11px] text-dark-600">
                  Última nota de {d.nota_por}{d.nota_en && ` el ${d.nota_en.slice(0, 10)}`}
                </span>
              )}
              {d.lat && (
                <a href={`https://www.google.com/maps?q=${d.lat},${d.lng}`}
                  target="_blank" rel="noreferrer"
                  className="ml-auto text-[12px] text-brand-300 hover:text-brand-200">
                  Ver en el mapa
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DireccionesProblema({ center }) {
  const [d, setD] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [soloAcc, setSoloAcc] = useState(false)

  const cargar = useCallback(() => {
    setCargando(true)
    getDireccionesProblema(90, center)
      .then((r) => setD(r.data))
      .catch(() => setD({ direcciones: [] }))
      .finally(() => setCargando(false))
  }, [center])
  useEffect(cargar, [cargar])

  const guardar = async (dir, nota) => {
    await guardarNotaDireccion({ clave: dir.clave, direccion: dir.direccion, nota })
    cargar()
  }

  const lista = (d?.direcciones || []).filter((x) => !soloAcc || x.accionable)

  if (cargando) {
    return (
      <div className="card flex items-center justify-center gap-2 p-12 text-dark-400">
        <Loader2 size={16} className="animate-spin" /> Agrupando los fallos por dirección…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setSoloAcc(!soloAcc)}
          className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            soloAcc ? 'bg-dark-700 text-dark-100' : 'bg-dark-800/60 text-dark-400 hover:text-dark-200'}`}>
          {soloAcc ? 'Solo las que se pueden arreglar' : 'Todas'}
        </button>
        <span className="text-[12.5px] text-dark-500">
          <span className="cifra text-dark-300">{d?.total || 0}</span> direcciones ·{' '}
          <span className="cifra text-orange-300">{d?.paquetes_en_juego || 0}</span> paquetes ·{' '}
          <span className="cifra text-lime-400">{d?.con_nota || 0}</span> con nota
        </span>
      </div>

      <p className="max-w-[74ch] text-[12.5px] leading-relaxed text-dark-500">
        Los paquetes de Cortex caducan a los dos meses, así que cada tarde se guarda el
        recuento por dirección antes de que desaparezcan:{' '}
        <button onClick={async () => { await consolidarDirecciones(); cargar() }}
          className="text-brand-300 underline decoration-dotted hover:text-brand-200">
          guardar ahora
        </button>. Sin eso, esta lista empezaría de cero cada dos meses en vez de mejorar.
      </p>
      <p className="max-w-[74ch] text-[12.5px] leading-relaxed text-dark-500">
        El fallo se ve paquete a paquete y así no se repite nunca: lo que se repite es la
        dirección. Arreglar una <span className="text-dark-300">una sola vez</span> —una nota
        de acceso, un horario, un teléfono— se lleva por delante todos sus fallos futuros.
        «Cliente ausente» cuenta menos en el orden porque no se arregla con nada.
      </p>

      {!lista.length ? (
        <div className="card p-10 text-center text-[13px] text-dark-400">
          Ninguna dirección repite fallos en los últimos 90 días.
        </div>
      ) : (
        <div className="space-y-1.5">
          {lista.map((x) => <FilaDireccion key={x.clave} d={x} onGuardar={guardar} />)}
        </div>
      )}
    </div>
  )
}


export default function DSC() {
  /* Ordenar pulsando la cabecera: quien mas entregas, quien mas riesgo. */
  const { orden, pulsar, ordenar } = useOrden()
  // `useT()` devuelve el contexto entero ({ lang, setLang, t }), no la funcion.
  // Sin desestructurar, `t('...')` es "t is not a function" y la pantalla se
  // cae entera en cuanto pinta la primera etiqueta.
  const { t } = useT()
  const { center } = useOutletContext()
  const [vista, setVista] = useState('donde')
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
        <div className={`flex items-center gap-2 ${vista === 'donde' ? '' : 'hidden'}`}>
          {[7, 14, 30].map((n) => (
            <button key={n} onClick={() => setDias(n)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                dias === n ? 'bg-orange-700 text-white' : 'bg-dark-800 text-dark-300 hover:bg-dark-700'}`}>
              {n} d
            </button>
          ))}
          <button onClick={() => cargar(dias)} disabled={cargando}
            className="rounded-lg bg-dark-800 p-2 text-dark-300 hover:bg-dark-700 disabled:opacity-40">
            <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Dos preguntas distintas sobre lo mismo: DONDE deja el paquete el
          conductor, y QUE direcciones fallan siempre. La segunda no existia. */}
      <div className="flex w-fit gap-1 rounded-lg bg-dark-900 p-1 ring-1 ring-dark-700">
        {[['donde', 'Dónde se deja'], ['dirs', 'Direcciones que fallan']].map(([k, txt]) => (
          <button key={k} onClick={() => setVista(k)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              vista === k ? 'bg-brand-500/20 text-brand-300' : 'text-dark-400 hover:text-dark-200'}`}>
            {txt}
          </button>
        ))}
      </div>

      {vista === 'dirs' && <DireccionesProblema center={center} />}

      {error && <div className="card border-red-500/30 p-4 text-sm text-red-300">{error}</div>}

      {vista === 'donde' && cargando && !d && <div className="card p-8 text-center text-dark-400">{t('dsc.loading')}</div>}

      {vista === 'donde' && d && !d.total && (
        <div className="card p-8 text-center text-dark-400">{t('dsc.vacio')}</div>
      )}

      {vista === 'donde' && f && (
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
                      <ThOrden campo="nombre" orden={orden} pulsar={pulsar} className="p-3 text-left">{t('dsc.th.cond')}</ThOrden>
                      <ThOrden campo="entregas" orden={orden} pulsar={pulsar} className="p-3 text-right">{t('dsc.th.entregas')}</ThOrden>
                      <ThOrden campo="pct_riesgo" orden={orden} pulsar={pulsar} className="p-3 text-right">{t('dsc.th.pct')}</ThOrden>
                      <ThOrden campo="exceso" orden={orden} pulsar={pulsar} className="p-3 text-right">{t('dsc.th.exceso')}</ThOrden>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800">
                    {ordenar(d.conductores).map((c) => (
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
