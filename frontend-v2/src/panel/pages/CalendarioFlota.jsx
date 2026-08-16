import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Loader2, AlertTriangle, CalendarDays,
  X, Plus, Check, Trash2, Pin, ArrowRight, Wrench,
} from 'lucide-react'
import { useT, LANG_LOCALE } from '../../i18n'
import { fleetCalendar, crearCitaFlota, editarCitaFlota, borrarCitaFlota, getVehicles } from '../api'
import { lista } from '../../lib/lista'

/* ────────────────────────────────────────────────────────────────────────────
   CALENDARIO DE FLOTA — qué vence este mes, sin entrar furgoneta por furgoneta
   ---------------------------------------------------------------------------
   Con 84 furgonetas nadie abre 84 fichas, y por eso los cambios se hacen tarde.
   Aquí se ve el mes entero de un vistazo.

   ── TRES COSAS QUE NO SON LO MISMO, Y SE PINTAN DISTINTO ────────────────────
     · FECHA REAL (ITV, fin de renting): borde sólido. Es un compromiso.
     · PREVISIÓN (aceite, ruedas, pastillas): borde discontinuo. Sale de dividir
       los km que faltan entre los km/día que hace esa furgoneta, y se recalcula
       sola en cada carga — si un día se rueda menos, la fecha se corre.
     · CITA puesta a mano: borde sólido + chincheta. Alguien ha decidido ese día.

   Enseñarlas iguales llevaría a tratarlas igual, y una previsión no es una cita.

   ── LO QUE SE PUEDE HACER, NO SOLO MIRAR ───────────────────────────────────
   Un calendario que solo se mira obliga a llevar las fechas en otro sitio. Aquí
   se puede apartar un día (clic en el día), adelantar un cambio previsto (clic
   en su chip) y cerrarlo cuando se hace. Una cita SUSTITUYE a la previsión de
   ese tipo: si no, saldrían las dos y el calendario diría dos cosas distintas
   del mismo cambio.

   El filtro por centro lo hace el SERVIDOR (`_filtro_centro`), el mismo que usa
   la lista de vehículos: las de DGA1 no pueden aparecer en OGA5 ni al revés.
   ──────────────────────────────────────────────────────────────────────────── */

const TIPOS = {
  itv:       { k: 'cal.t.itv',       color: '#F87171' },
  renting:   { k: 'cal.t.renting',   color: '#60A5FA' },
  oil:       { k: 'cal.t.oil',       color: '#FBBF24' },
  ruedas:    { k: 'cal.t.ruedas',    color: '#38BDF8' },
  pastillas: { k: 'cal.t.pastillas', color: '#C084FC' },
  taller:    { k: 'cal.t.taller',    color: '#34D399' },
  otro:      { k: 'cal.t.otro',      color: '#94A3B8' },
}
const ORDEN = ['itv', 'renting', 'oil', 'ruedas', 'pastillas', 'taller', 'otro']

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const cfgDe = (tipo) => TIPOS[tipo] || TIPOS.otro

/* Chip de un evento dentro de una celda del mes. */
function Chip({ ev, t, onClick }) {
  const cfg = cfgDe(ev.tipo)
  return (
    <button
      onClick={onClick}
      title={`${ev.matricula} · ${t(cfg.k)}${ev.exacto ? '' : ' · ' + t('cal.estimado')}`}
      className="group/chip flex w-full items-center gap-1 rounded-[5px] px-1 py-[3px] text-left transition-all hover:brightness-125"
      style={{
        borderLeft: `2px ${ev.exacto ? 'solid' : 'dashed'} ${cfg.color}`,
        background: `linear-gradient(90deg, ${cfg.color}22, ${cfg.color}09)`,
      }}
    >
      {ev.cita && <Pin size={8} style={{ color: cfg.color }} className="shrink-0" />}
      <span className="truncate font-mono text-[9.5px] leading-tight text-dark-100">{ev.matricula}</span>
      <span className="ml-auto shrink-0 text-[8.5px] font-semibold uppercase tracking-wide" style={{ color: cfg.color }}>
        {t(cfg.k).slice(0, 3)}
      </span>
    </button>
  )
}

/* Panel lateral. Todo lo que se hace en el calendario pasa por aquí. */
function Panel({ titulo, sub, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-[420px] flex-col border-l border-dark-700 bg-dark-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-dark-800 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[16px] font-semibold capitalize tracking-[-0.01em] text-dark-50">{titulo}</h3>
            {sub && <p className="mt-0.5 text-[11.5px] text-dark-500">{sub}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-dark-500 transition-colors hover:bg-dark-800 hover:text-dark-100">
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-dark-700 bg-dark-900 px-2.5 py-2 text-[12.5px] text-dark-100 outline-none transition-colors placeholder:text-dark-600 focus:border-brand-500/60'
const labelCls = 'mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-dark-500'

/* Formulario de cita. Sirve igual para crear una nueva y para adelantar una
   previsión: cambia lo que viene prerrellenado, no lo que hace. */
function FormCita({ t, vehiculos, inicial, onGuardado }) {
  const [q, setQ] = useState('')
  const [vid, setVid] = useState(inicial.vehicle_id || '')
  const [tipo, setTipo] = useState(inicial.tipo || 'taller')
  const [fecha, setFecha] = useState(inicial.fecha || '')
  const [taller, setTaller] = useState(inicial.taller || '')
  const [nota, setNota] = useState(inicial.nota || '')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')

  const elegida = vehiculos.find((v) => v.id === vid)
  const sugerencias = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return vehiculos
      .filter((v) => String(v.license_plate || '').toLowerCase().replace(/\s/g, '').includes(s.replace(/\s/g, '')))
      .slice(0, 6)
  }, [q, vehiculos])

  const guardar = async () => {
    if (!vid || !fecha) return
    setGuardando(true); setErr('')
    try {
      if (inicial.cita_id) await editarCitaFlota(inicial.cita_id, { fecha, nota, taller })
      else await crearCitaFlota({ vehicle_id: vid, tipo, fecha, nota, taller })
      onGuardado()
    } catch {
      setErr(t('lib.error')); setGuardando(false)
    }
  }

  return (
    <div className="space-y-3.5">
      {/* La furgoneta sólo se elige cuando no viene dada (cita nueva desde un día). */}
      {inicial.vehicle_id ? (
        <div className="rounded-lg border border-dark-800 bg-dark-900/50 px-3 py-2">
          <p className="font-mono text-[14px] text-dark-50">{inicial.matricula}</p>
          {inicial.modelo && <p className="text-[11px] text-dark-500">{inicial.modelo}</p>}
        </div>
      ) : (
        <div>
          <label className={labelCls}>{t('cal.f.veh')}</label>
          {elegida ? (
            <button
              onClick={() => { setVid(''); setQ('') }}
              className="flex w-full items-center gap-2 rounded-lg border border-brand-500/40 bg-brand-500/10 px-2.5 py-2 text-left"
            >
              <span className="font-mono text-[13px] text-dark-50">{elegida.license_plate}</span>
              <X size={12} className="ml-auto text-dark-500" />
            </button>
          ) : (
            <>
              <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cal.f.veh.ph')} />
              {sugerencias.length > 0 && (
                <div className="mt-1 overflow-hidden rounded-lg border border-dark-700">
                  {sugerencias.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => { setVid(v.id); setQ('') }}
                      className="flex w-full items-center gap-2 border-b border-dark-800 px-2.5 py-1.5 text-left last:border-0 hover:bg-dark-800"
                    >
                      <span className="font-mono text-[12px] text-dark-100">{v.license_plate}</span>
                      <span className="truncate text-[10.5px] text-dark-600">{[v.brand, v.model].filter(Boolean).join(' ')}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Al adelantar una previsión el tipo ya está decidido: es ESE cambio. */}
      {!inicial.cita_id && !inicial.tipoFijo && (
        <div>
          <label className={labelCls}>{t('cal.f.tipo')}</label>
          <div className="flex flex-wrap gap-1.5">
            {ORDEN.map((k) => (
              <button
                key={k}
                onClick={() => setTipo(k)}
                className="rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors"
                style={
                  tipo === k
                    ? { borderColor: TIPOS[k].color, color: TIPOS[k].color, background: `${TIPOS[k].color}18` }
                    : { borderColor: 'rgb(38 38 42)', color: 'rgb(115 115 125)' }
                }
              >
                {t(TIPOS[k].k)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className={labelCls}>{t('cal.f.fecha')}</label>
        <input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>{t('cal.f.taller')}</label>
        <input className={inputCls} value={taller} onChange={(e) => setTaller(e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>{t('cal.f.nota')}</label>
        <textarea rows={2} className={`${inputCls} resize-none`} value={nota}
          onChange={(e) => setNota(e.target.value)} placeholder={t('cal.f.nota.ph')} />
      </div>

      {err && <p className="text-[12px] text-red-300">{err}</p>}
      <button
        onClick={guardar}
        disabled={!vid || !fecha || guardando}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        {t('cal.guardar')}
      </button>
    </div>
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
  const [ocultos, setOcultos] = useState(() => new Set())
  const [vehiculos, setVehiculos] = useState([])
  const [panel, setPanel] = useState(null)   // { modo:'dia'|'evento'|'nueva', ... }

  const mes = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`
  const centro = center && center !== 'Todos' ? center : ''

  const cargar = useCallback(() => {
    setErr('')
    fleetCalendar({ mes, center: centro })
      .then((r) => setDatos(r.data))
      .catch(() => setErr(t('lib.error')))
  }, [mes, centro, t])
  useEffect(() => { setDatos(null); cargar() }, [cargar])

  // Las matrículas para el buscador del formulario. Se piden una vez por centro.
  useEffect(() => {
    getVehicles(centro || 'Todos')
      .then((r) => setVehiculos(lista(r.data).map((v) => ({ id: v.id, license_plate: v.license_plate, brand: v.brand, model: v.model }))))
      .catch(() => setVehiculos([]))
  }, [centro])

  const recargar = () => { cargar(); setPanel(null) }

  /* Rejilla del mes empezando en lunes, con los huecos de los extremos para que
     las columnas cuadren con los días de la semana. */
  const semanas = useMemo(() => {
    const dias = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate()
    const hueco = (new Date(ref.getFullYear(), ref.getMonth(), 1).getDay() + 6) % 7   // lunes = 0
    const celdas = Array(hueco).fill(null)
    for (let d = 1; d <= dias; d++) celdas.push(new Date(ref.getFullYear(), ref.getMonth(), d))
    while (celdas.length % 7) celdas.push(null)
    const out = []
    for (let i = 0; i < celdas.length; i += 7) out.push(celdas.slice(i, i + 7))
    return out
  }, [ref])

  const visible = useCallback((e) => !ocultos.has(e.tipo), [ocultos])
  const eventos = useMemo(() => lista(datos?.eventos).filter(visible), [datos, visible])
  const vencidos = useMemo(() => lista(datos?.vencidos).filter(visible), [datos, visible])

  const porDia = useMemo(() => {
    const m = {}
    for (const e of eventos) (m[e.fecha] ||= []).push(e)
    return m
  }, [eventos])

  // Cuántos hay de cada tipo este mes: el número va en el propio filtro, así el
  // filtro además informa en vez de ser solo un interruptor.
  const conteo = useMemo(() => {
    const c = {}
    for (const e of lista(datos?.eventos)) c[e.tipo] = (c[e.tipo] || 0) + 1
    return c
  }, [datos])

  const hoyIso = iso(new Date())
  const nombreMes = ref.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  const diasSem = ['cal.lun', 'cal.mar', 'cal.mie', 'cal.jue', 'cal.vie', 'cal.sab', 'cal.dom']
  const mover = (n) => setRef((d) => new Date(d.getFullYear(), d.getMonth() + n, 1))
  const alternar = (k) => setOcultos((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  const fechaLarga = (s) => {
    if (!s) return ''
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  }

  if (err) return <p className="text-sm text-red-300">{err}</p>

  return (
    <div>
      {/* ── Cabecera: mes, navegación y filtros ───────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-3">
        <div className="flex items-center gap-1">
          <button onClick={() => mover(-1)} aria-label={t('cal.prev')}
            className="rounded-lg border border-dark-700 p-1.5 text-dark-400 transition-colors hover:border-dark-600 hover:text-dark-200">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => mover(1)} aria-label={t('cal.next')}
            className="rounded-lg border border-dark-700 p-1.5 text-dark-400 transition-colors hover:border-dark-600 hover:text-dark-200">
            <ChevronRight size={15} />
          </button>
          <button onClick={() => { const d = new Date(); d.setDate(1); setRef(d) }}
            className="ml-1 rounded-lg border border-dark-700 px-2 py-1 text-[11px] font-semibold text-dark-400 transition-colors hover:border-dark-600 hover:text-dark-200">
            {t('cal.hoybtn')}
          </button>
        </div>
        <h2 className="font-display text-[19px] font-semibold capitalize tracking-[-0.02em] text-dark-50">{nombreMes}</h2>
        {datos && (
          <span className="text-[12px] text-dark-500">
            {t('cal.resumen').replace('{n}', datos.eventos.length).replace('{v}', datos.vehiculos)}
          </span>
        )}

        <button
          onClick={() => setPanel({ modo: 'nueva', inicial: { fecha: hoyIso } })}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-brand-500/40 bg-brand-500/10 px-2.5 py-1.5 text-[12px] font-semibold text-brand-300 transition-colors hover:bg-brand-500/20"
        >
          <Plus size={13} /> {t('cal.nuevacita')}
        </button>
      </div>

      {/* Los tipos son a la vez leyenda, contador y filtro. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5" title={t('cal.filtra')}>
        {ORDEN.map((k) => {
          const off = ocultos.has(k)
          const n = conteo[k] || 0
          return (
            <button key={k} onClick={() => alternar(k)}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-all ${off ? 'opacity-35' : ''}`}
              style={{ borderColor: off ? 'rgb(38 38 42)' : `${TIPOS[k].color}55`, background: off ? 'transparent' : `${TIPOS[k].color}0F` }}>
              <span className="h-2.5 w-[3px] rounded-sm" style={{ background: TIPOS[k].color }} />
              <span className="text-dark-300">{t(TIPOS[k].k)}</span>
              {n > 0 && <span className="font-mono text-[10px] tabular-nums" style={{ color: TIPOS[k].color }}>{n}</span>}
            </button>
          )
        })}
      </div>

      <p className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-dark-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-[3px] rounded-sm border-l-2 border-dashed border-dark-400" />
          {t('cal.leyenda')}
        </span>
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
          {vencidos.length > 0 && (
            <div className="mb-5 rounded-xl border border-red-500/25 bg-gradient-to-b from-red-500/[0.07] to-transparent p-4">
              <p className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-red-200">
                <AlertTriangle size={14} />
                {t('cal.vencidos').replace('{n}', vencidos.length)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {vencidos.map((e, i) => (
                  <button key={i} onClick={() => setPanel({ modo: 'evento', ev: e })}
                    className="flex items-center gap-1.5 rounded-lg border border-dark-700 bg-dark-900/60 px-2 py-1 text-[11px] transition-colors hover:border-red-400/50">
                    {e.cita && <Pin size={9} className="text-dark-500" />}
                    <span className="font-mono text-dark-100">{e.matricula}</span>
                    <span style={{ color: cfgDe(e.tipo).color }}>{t(cfgDe(e.tipo).k)}</span>
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
                  <div key={d} className="px-1 font-mono text-[10px] uppercase tracking-wider text-dark-600">{t(d)}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {semanas.flat().map((d, i) => {
                  if (!d) return <div key={i} className="min-h-[96px] rounded-lg border border-transparent" />
                  const k = iso(d)
                  const evs = porDia[k] || []
                  const esHoy = k === hoyIso
                  const finde = d.getDay() === 0 || d.getDay() === 6
                  return (
                    <div key={i}
                      onClick={() => setPanel({ modo: 'dia', fecha: k })}
                      className={`group relative min-h-[96px] cursor-pointer rounded-lg border p-1.5 transition-colors ${
                        esHoy ? 'border-brand-500/50 bg-brand-500/[0.07]'
                          : evs.length ? 'border-dark-700 bg-dark-900/50 hover:border-dark-600'
                            : `border-dark-800/60 ${finde ? 'bg-dark-950/40' : 'bg-dark-900/20'} hover:border-dark-700`}`}>
                      {/* Barrita de colores: de un vistazo se ve QUÉ hay ese día
                          sin leer un solo chip. */}
                      {evs.length > 0 && (
                        <div className="absolute inset-x-1.5 top-0 flex h-[2px] overflow-hidden rounded-b-sm">
                          {evs.map((e, j) => (
                            <span key={j} className="flex-1" style={{ background: cfgDe(e.tipo).color }} />
                          ))}
                        </div>
                      )}
                      <div className="mb-1 flex items-center px-0.5">
                        <span className={`text-[11px] font-semibold tabular-nums ${esHoy ? 'text-brand-300' : 'text-dark-500'}`}>
                          {d.getDate()}
                        </span>
                        <Plus size={11} className="ml-auto text-dark-700 opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                      <div className="flex flex-col gap-[3px]">
                        {evs.slice(0, 4).map((e, j) => (
                          <Chip key={j} ev={e} t={t}
                            onClick={(me) => { me.stopPropagation(); setPanel({ modo: 'evento', ev: e }) }} />
                        ))}
                        {evs.length > 4 && (
                          <span className="px-1 text-[9.5px] text-dark-500">+{evs.length - 4}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {eventos.length === 0 && vencidos.length === 0 && (
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
                  <button key={i} onClick={() => nav(`/panel/vehiculos?v=${e.vehicle_id}`)}
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

      {/* ── Panel de un DÍA: lo que hay y el botón de apartar ──────────────── */}
      {panel?.modo === 'dia' && (
        <Panel titulo={fechaLarga(panel.fecha)} onClose={() => setPanel(null)}>
          <div className="space-y-1.5">
            {(porDia[panel.fecha] || []).map((e, i) => (
              <button key={i} onClick={() => setPanel({ modo: 'evento', ev: e })}
                className="flex w-full items-center gap-2 rounded-lg border border-dark-800 bg-dark-900/50 px-3 py-2 text-left transition-colors hover:border-dark-600">
                <span className="h-6 w-[3px] shrink-0 rounded-sm" style={{ background: cfgDe(e.tipo).color }} />
                <span className="min-w-0">
                  <span className="block font-mono text-[13px] text-dark-50">{e.matricula}</span>
                  <span className="block truncate text-[11px] text-dark-500">
                    {t(cfgDe(e.tipo).k)}{e.exacto ? '' : ` · ${t('cal.estimado')}`}{e.nota ? ` · ${e.nota}` : ''}
                  </span>
                </span>
                <ArrowRight size={13} className="ml-auto shrink-0 text-dark-600" />
              </button>
            ))}
            {(porDia[panel.fecha] || []).length === 0 && (
              <p className="py-2 text-[12.5px] text-dark-600">{t('cal.dia.nada')}</p>
            )}
          </div>
          <div className="mt-5 border-t border-dark-800 pt-5">
            <p className="mb-3 flex items-center gap-2 text-[12.5px] font-semibold text-dark-200">
              <Wrench size={13} className="text-dark-500" /> {t('cal.nuevacita')}
            </p>
            <FormCita t={t} vehiculos={vehiculos} inicial={{ fecha: panel.fecha }} onGuardado={recargar} />
          </div>
        </Panel>
      )}

      {/* ── Panel de cita NUEVA sin día previo ─────────────────────────────── */}
      {panel?.modo === 'nueva' && (
        <Panel titulo={t('cal.nuevacita')} sub={t('cal.adelantar.exp')} onClose={() => setPanel(null)}>
          <FormCita t={t} vehiculos={vehiculos} inicial={panel.inicial} onGuardado={recargar} />
        </Panel>
      )}

      {/* ── Panel de UN evento: adelantarlo, cerrarlo o quitarlo ───────────── */}
      {panel?.modo === 'evento' && (
        <PanelEvento ev={panel.ev} t={t} locale={locale} nav={nav} vehiculos={vehiculos}
          fechaLarga={fechaLarga} onClose={() => setPanel(null)} onCambio={recargar} />
      )}
    </div>
  )
}

/* Detalle de un evento. Un evento puede ser tres cosas y cada una admite cosas
   distintas: una previsión se puede fijar, una cita se puede cerrar o quitar,
   y una fecha oficial (ITV) se puede apartar para llevarla antes. */
function PanelEvento({ ev, t, locale, nav, vehiculos, fechaLarga, onClose, onCambio }) {
  const [ocupado, setOcupado] = useState(false)
  const cfg = cfgDe(ev.tipo)

  const cerrar = async () => {
    setOcupado(true)
    try { await editarCitaFlota(ev.cita_id, { estado: 'hecho' }); onCambio() } finally { setOcupado(false) }
  }
  const quitar = async () => {
    setOcupado(true)
    try { await borrarCitaFlota(ev.cita_id); onCambio() } finally { setOcupado(false) }
  }

  return (
    <Panel titulo={ev.matricula} sub={ev.modelo} onClose={onClose}>
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="rounded-md px-2 py-1 text-[11.5px] font-semibold"
            style={{ background: `${cfg.color}18`, color: cfg.color }}>{t(cfg.k)}</span>
          {ev.cita
            ? <span className="flex items-center gap-1 text-[11px] text-dark-500"><Pin size={10} /> {t('cal.cita')}</span>
            : !ev.exacto && <span className="text-[11px] text-dark-500">{t('cal.estimado')}</span>}
        </div>
        {ev.fecha && (
          <p className="text-[13px] capitalize text-dark-200">
            {fechaLarga(ev.fecha)}
            {ev.dias > 0 && <span className="ml-1.5 text-[11.5px] normal-case text-dark-500">{t('cal.endias').replace('{n}', ev.dias)}</span>}
          </p>
        )}
        {ev.dias != null && ev.dias < 0 && (
          <p className="text-[11.5px] text-red-300">{t('cal.pasada')}</p>
        )}
        {ev.km_restantes != null && (
          <p className="text-[11.5px] text-dark-500">{t('cal.kmfaltan').replace('{n}', Math.abs(ev.km_restantes).toLocaleString(locale))}</p>
        )}
        {ev.taller && <p className="text-[11.5px] text-dark-400">{ev.taller}</p>}
        {ev.nota && <p className="rounded-lg border border-dark-800 bg-dark-900/50 px-3 py-2 text-[12px] text-dark-300">{ev.nota}</p>}
      </div>

      {ev.cita && (
        <div className="mb-4 flex gap-2">
          <button onClick={cerrar} disabled={ocupado}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[12px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-40">
            <Check size={13} /> {t('cal.hecho')}
          </button>
          <button onClick={quitar} disabled={ocupado} title={t('cal.quitar.exp')}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-dark-700 px-3 py-2 text-[12px] text-dark-400 transition-colors hover:border-red-400/50 hover:text-red-300 disabled:opacity-40">
            <Trash2 size={13} /> {t('cal.quitar')}
          </button>
        </div>
      )}

      <div className="border-t border-dark-800 pt-4">
        <p className="mb-1 text-[12.5px] font-semibold text-dark-200">
          {ev.cita ? t('cal.adelantar') : t('cal.programar')}
        </p>
        <p className="mb-3 text-[11.5px] leading-relaxed text-dark-600">{t('cal.adelantar.exp')}</p>
        <FormCita
          t={t} vehiculos={vehiculos}
          inicial={{
            vehicle_id: ev.vehicle_id, matricula: ev.matricula, modelo: ev.modelo,
            tipo: ev.tipo, tipoFijo: true, fecha: ev.fecha || '',
            nota: ev.nota || '', taller: ev.taller || '', cita_id: ev.cita_id,
          }}
          onGuardado={onCambio}
        />
      </div>

      <button onClick={() => nav(`/panel/vehiculos?v=${ev.vehicle_id}`)}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dark-700 px-3 py-2 text-[12px] text-dark-400 transition-colors hover:border-dark-500 hover:text-dark-200">
        {t('cal.verficha')} <ArrowRight size={12} />
      </button>
    </Panel>
  )
}
