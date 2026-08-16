import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, CalendarDays } from 'lucide-react'
import { useT, LANG_LOCALE } from '../../i18n'
import { fleetCalendar } from '../api'
import { lista } from '../../lib/lista'

/* ────────────────────────────────────────────────────────────────────────────
   CALENDARIO DE FLOTA — qué vence este mes, sin entrar furgoneta por furgoneta
   ---------------------------------------------------------------------------
   Con 84 furgonetas nadie abre 84 fichas, y por eso los cambios se hacen tarde.
   Aquí se ve el mes entero de un vistazo.

   ── LO QUE ES UNA FECHA Y LO QUE ES UNA PREVISIÓN ────────────────────────────
   Se pintan distinto a propósito, porque no son lo mismo:

     · ITV y fin de renting tienen FECHA REAL. Borde sólido.
     · Aceite, ruedas y pastillas se miden en KILÓMETROS: su día sale de dividir
       los km que faltan entre los km/día que hace esa furgoneta. Es una
       previsión, va con borde discontinuo, y se recalcula sola en cada carga —
       si un día se rueda menos, la fecha se corre sola hacia delante.

   Una ITV es un compromiso con Tráfico; un cambio de aceite previsto es una
   estimación. Enseñarlos iguales llevaría a tratarlos igual.

   El filtro por centro lo hace el SERVIDOR (`_filtro_centro`), el mismo que usa
   la lista de vehículos: las de DGA1 no pueden aparecer en OGA5 ni al revés.
   ──────────────────────────────────────────────────────────────────────────── */

const TIPOS = {
  itv:       { k: 'cal.t.itv',       color: '#F87171', exacto: true },
  renting:   { k: 'cal.t.renting',   color: '#60A5FA', exacto: true },
  oil:       { k: 'cal.t.oil',       color: '#FBBF24', exacto: false },
  ruedas:    { k: 'cal.t.ruedas',    color: '#38BDF8', exacto: false },
  pastillas: { k: 'cal.t.pastillas', color: '#C084FC', exacto: false },
}

const iso = (d) => d.toISOString().slice(0, 10)

function Chip({ ev, t, onIr }) {
  const cfg = TIPOS[ev.tipo] || { color: '#94A3B8', k: ev.tipo }
  return (
    <button onClick={onIr} title={`${t(cfg.k)} · ${ev.matricula}${ev.exacto ? '' : ' · ' + t('cal.estimado')}`}
      className="flex w-full items-center gap-1 rounded px-1 py-[3px] text-left transition-colors hover:bg-white/[0.06]"
      style={{
        borderLeft: `2px ${ev.exacto ? 'solid' : 'dashed'} ${cfg.color}`,
        background: `${cfg.color}14`,
      }}>
      <span className="truncate font-mono text-[9.5px] leading-tight text-dark-200">{ev.matricula}</span>
      <span className="ml-auto shrink-0 text-[8.5px] uppercase tracking-wide" style={{ color: cfg.color }}>
        {t(cfg.k).slice(0, 3)}
      </span>
    </button>
  )
}

export default function CalendarioFlota() {
  const { center } = useOutletContext?.() || {}
  const { t, lang } = useT()
  const locale = LANG_LOCALE[lang] || 'es-ES'
  const nav = useNavigate()

  const [ref, setRef] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [datos, setDatos] = useState(null)
  const [err, setErr] = useState('')

  const mes = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`

  const cargar = useCallback(() => {
    setDatos(null); setErr('')
    fleetCalendar({ mes, center: center && center !== 'Todos' ? center : '' })
      .then((r) => setDatos(r.data))
      .catch(() => setErr(t('lib.error')))
  }, [mes, center, t])
  useEffect(() => { cargar() }, [cargar])

  /* Rejilla del mes empezando en lunes, con los huecos del principio y del
     final para que las columnas cuadren con los días de la semana. */
  const semanas = useMemo(() => {
    const primero = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const dias = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate()
    const hueco = (primero.getDay() + 6) % 7          // lunes = 0
    const celdas = []
    for (let i = 0; i < hueco; i++) celdas.push(null)
    for (let d = 1; d <= dias; d++) celdas.push(new Date(ref.getFullYear(), ref.getMonth(), d))
    while (celdas.length % 7) celdas.push(null)
    const out = []
    for (let i = 0; i < celdas.length; i += 7) out.push(celdas.slice(i, i + 7))
    return out
  }, [ref])

  const porDia = useMemo(() => {
    const m = {}
    for (const e of lista(datos?.eventos)) (m[e.fecha] ||= []).push(e)
    return m
  }, [datos])

  const hoyIso = iso(new Date())
  const irAVehiculo = (id) => id && nav(`/panel/vehiculos?v=${id}`)
  const nombreMes = ref.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  const diasSem = ['cal.lun', 'cal.mar', 'cal.mie', 'cal.jue', 'cal.vie', 'cal.sab', 'cal.dom']

  const mover = (n) => setRef((d) => new Date(d.getFullYear(), d.getMonth() + n, 1))

  if (err) return <p className="text-sm text-red-300">{err}</p>

  return (
    <div>
      {/* ── Cabecera: mes, navegación y leyenda ───────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-1">
          <button onClick={() => mover(-1)} aria-label={t('cal.prev')}
            className="rounded-lg border border-dark-700 p-1.5 text-dark-400 transition-colors hover:border-dark-600 hover:text-dark-200">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => mover(1)} aria-label={t('cal.next')}
            className="rounded-lg border border-dark-700 p-1.5 text-dark-400 transition-colors hover:border-dark-600 hover:text-dark-200">
            <ChevronRight size={15} />
          </button>
        </div>
        <h2 className="font-display text-[19px] font-semibold capitalize tracking-[-0.02em] text-dark-50">
          {nombreMes}
        </h2>
        {datos && (
          <span className="text-[12px] text-dark-500">
            {t('cal.resumen')
              .replace('{n}', datos.eventos.length)
              .replace('{v}', datos.vehiculos)}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {Object.entries(TIPOS).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1.5 text-[11px] text-dark-400">
              <span className="h-2.5 w-[3px] rounded-sm" style={{ background: c.color }} />
              {t(c.k)}
            </span>
          ))}
        </div>
      </div>

      {/* Qué significa el borde discontinuo. Sin decirlo, una previsión se lee
          como una cita cerrada. */}
      <p className="mb-4 text-[11.5px] text-dark-600">
        <span className="mr-1 inline-block h-2.5 w-[3px] rounded-sm border-l-2 border-dashed border-dark-400 align-middle" />
        {t('cal.leyenda')}
      </p>

      {!datos ? (
        <div className="flex items-center gap-2 py-16 text-sm text-dark-400">
          <Loader2 size={15} className="animate-spin" /> {t('lib.cargando')}
        </div>
      ) : (
        <>
          {/* ── Lo ya vencido: no va en un día del calendario ──────────────
              Una ITV caducada hace tres semanas no es una cita de este mes;
              es algo que ya debería estar hecho, y va arriba del todo. */}
          {datos.vencidos.length > 0 && (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/[0.05] p-4">
              <p className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-red-200">
                <AlertTriangle size={14} />
                {t('cal.vencidos').replace('{n}', datos.vencidos.length)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {datos.vencidos.map((e, i) => (
                  <button key={i} onClick={() => irAVehiculo(e.vehicle_id)}
                    className="flex items-center gap-1.5 rounded-lg border border-dark-700 bg-dark-900/60 px-2 py-1 text-[11px] transition-colors hover:border-dark-500">
                    <span className="font-mono text-dark-100">{e.matricula}</span>
                    <span style={{ color: (TIPOS[e.tipo] || {}).color }}>{t((TIPOS[e.tipo] || {}).k || e.tipo)}</span>
                    {e.dias != null && <span className="text-dark-600">{t('cal.hace').replace('{n}', Math.abs(e.dias))}</span>}
                    {e.km_restantes != null && <span className="text-dark-600">{Math.abs(e.km_restantes).toLocaleString(locale)} km</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── La rejilla del mes ─────────────────────────────────────────── */}
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-7 gap-1.5 pb-1.5">
                {diasSem.map((d) => (
                  <div key={d} className="px-1 font-mono text-[10px] uppercase tracking-wider text-dark-600">
                    {t(d)}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {semanas.flat().map((d, i) => {
                  if (!d) return <div key={i} className="min-h-[92px] rounded-lg border border-transparent" />
                  const k = iso(d)
                  const evs = porDia[k] || []
                  const esHoy = k === hoyIso
                  return (
                    <div key={i}
                      className={`min-h-[92px] rounded-lg border p-1.5 ${
                        esHoy ? 'border-brand-500/50 bg-brand-500/[0.06]'
                          : evs.length ? 'border-dark-700 bg-dark-900/50' : 'border-dark-800/60 bg-dark-900/20'}`}>
                      <div className={`mb-1 px-0.5 text-[11px] font-semibold tabular-nums ${
                        esHoy ? 'text-brand-300' : 'text-dark-500'}`}>
                        {d.getDate()}
                      </div>
                      <div className="flex flex-col gap-[3px]">
                        {evs.slice(0, 4).map((e, j) => (
                          <Chip key={j} ev={e} t={t} onIr={() => irAVehiculo(e.vehicle_id)} />
                        ))}
                        {evs.length > 4 && (
                          <span className="px-1 text-[9.5px] text-dark-600">+{evs.length - 4}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {datos.eventos.length === 0 && datos.vencidos.length === 0 && (
            <p className="py-10 text-center text-[13px] text-dark-500">{t('cal.mesvacio')}</p>
          )}

          {/* ── De qué NO se puede prever la fecha ─────────────────────────── */}
          {datos.sin_estimacion.length > 0 && (
            <div className="mt-5 rounded-xl border border-dark-800 bg-dark-900/30 p-4">
              <p className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold text-dark-300">
                <CalendarDays size={13} className="text-dark-600" />
                {t('cal.sinfecha').replace('{n}', datos.sin_estimacion.length)}
              </p>
              <p className="mb-2.5 text-[11.5px] leading-relaxed text-dark-600">{t('cal.sinfecha.exp')}</p>
              <div className="flex flex-wrap gap-1.5">
                {datos.sin_estimacion.slice(0, 40).map((e, i) => (
                  <button key={i} onClick={() => irAVehiculo(e.vehicle_id)}
                    className="rounded border border-dark-800 px-1.5 py-0.5 font-mono text-[10.5px] text-dark-400 transition-colors hover:border-dark-600 hover:text-dark-200">
                    {e.matricula}
                  </button>
                ))}
                {datos.sin_estimacion.length > 40 && (
                  <span className="px-1 text-[10.5px] text-dark-600">+{datos.sin_estimacion.length - 40}</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
