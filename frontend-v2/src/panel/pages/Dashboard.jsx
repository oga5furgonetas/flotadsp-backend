import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOutletContext } from 'react-router-dom'
import {
  Truck, Wrench, Users, ClipboardList, BellRing, AlertTriangle,
  Loader2, TrendingUp, Camera, ShieldAlert, CheckCircle2,
  ChevronRight, Clock, ArrowRight,
} from 'lucide-react'
import { getDashboardStats, getItvAlerts, getVehicles, getDrivers, getDamageCosts, cortexOverview, cortexRoutes, getReviewQueue, cortexDireccionesHoy } from '../api'
import { useT, LANG_LOCALE } from '../../i18n'
import { lista } from '../../lib/lista'
import { PageSkeleton } from '../components/Skeleton'
import Activacion from '../components/Activacion'

/* ── helpers ── */
function greeting(t) {
  const h = new Date().getHours()
  if (h < 13) return t('greet.morning')
  if (h < 20) return t('greet.afternoon')
  return t('greet.evening')
}
function fmtDate(locale) {
  return new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
}
function fmtTime(iso, locale) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}
function fmtRelative(iso, t) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return t('time.now')
  if (m < 60) return t('time.mago').replace('{n}', m)
  const h = Math.floor(m / 60)
  if (h < 24) return t('time.hago').replace('{n}', h)
  return t('time.dago').replace('{n}', Math.floor(h / 24))
}

/* Contador natural: los números no aparecen, cuentan (easing cúbico, ~700 ms).
   Con prefers-reduced-motion el valor es instantáneo. */
function useCountUp(value, ms = 700) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const target = Number(value) || 0
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(target); return }
    let raf
    const t0 = performance.now()
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // Garantía de aterrizaje: si el navegador throttlea rAF (pestaña en segundo
    // plano, ahorro de batería), el valor final se fija igualmente.
    const land = setTimeout(() => setN(target), ms + 80)
    return () => { cancelAnimationFrame(raf); clearTimeout(land) }
  }, [value, ms])
  return n
}
function Count({ v }) { return <>{useCountUp(v)}</> }

/* Cifra suelta de la franja de hoy. En rojo SOLO cuando hay algo que hacer:
   un cero en rojo entrena a ignorar el color, y entonces el día que hay un
   missing de verdad tampoco se mira. */
function Mini({ n, label, alerta }) {
  if (n == null) return null
  return (
    <div>
      <div className={`font-display text-[22px] font-semibold leading-none tracking-[-0.02em] ${
        alerta ? 'text-red-300' : 'text-dark-100'}`}>
        <Count v={n} />
      </div>
      <div className="mt-1 text-[11.5px] text-dark-500">{label}</div>
    </div>
  )
}

/* ── ANILLO ───────────────────────────────────────────────────────────────────
   Donut en SVG puro: sin librería de gráficos, sin peso extra en el bundle y
   sin dependencias que mantener. Un `stroke-dasharray` sobre un círculo hace
   exactamente lo mismo que una librería para este caso. */
function Anillo({ segmentos, centro, sub, size = 132 }) {
  const R = (size - 14) / 2
  const C = 2 * Math.PI * R
  const total = segmentos.reduce((a, s) => a + s.n, 0) || 1
  let acc = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="11" />
        {segmentos.map((s) => {
          const frac = s.n / total
          const el = (
            <circle key={s.k} cx={size / 2} cy={size / 2} r={R} fill="none"
              stroke={s.color} strokeWidth="11" strokeLinecap="butt"
              strokeDasharray={`${frac * C} ${C}`}
              strokeDashoffset={-acc * C}
              style={{ transition: 'stroke-dasharray .7s ease' }} />
          )
          acc += frac
          return s.n > 0 ? el : null
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-dark-50">{centro}</span>
        {sub && <span className="mt-1 text-[10.5px] text-dark-500">{sub}</span>}
      </div>
    </div>
  )
}

/* Barras de los últimos 7 días. También SVG-libre: divs con altura relativa.
   El día de hoy va marcado porque es el único sobre el que aún se puede
   actuar. */
function Barras({ dias, locale }) {
  const max = Math.max(1, ...dias.map((d) => d.n))
  return (
    <div className="flex h-[110px] items-end gap-1.5">
      {dias.map((d, i) => (
        <div key={d.key} className="group flex flex-1 flex-col items-center gap-1.5">
          <div className="relative flex w-full flex-1 items-end">
            <div className={`w-full rounded-t transition-all duration-700 ${
              i === dias.length - 1 ? 'bg-brand-400/80' : 'bg-brand-500/30 group-hover:bg-brand-500/50'}`}
              style={{ height: `${Math.max(3, (d.n / max) * 100)}%` }} />
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-semibold tabular-nums text-dark-400 opacity-0 transition-opacity group-hover:opacity-100">
              {d.n}
            </span>
          </div>
          <span className="text-[9.5px] uppercase tracking-wide text-dark-600">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ── MURO DE RUTAS ────────────────────────────────────────────────────────────
   Una tarjeta por ruta con su conductor y su avance. No es decoración: es la
   pantalla que un DSP enseña cuando le preguntan "¿cómo va el día?".

   Lo que la hace útil y no un adorno es `min_sin_entregar`, que ya calculaba el
   backend y nadie estaba usando: los minutos que lleva una ruta sin entregar
   nada teniendo paquetes pendientes. Un conductor parado no aparece en ningún
   porcentaje —su ruta puede ir al 97%— y aquí salta a la vista.

   Se pincha y lleva a Paquetes IA. Una tarjeta que no lleva a ningún sitio
   obliga a buscar a mano lo que acabas de ver. */
function RutaCard({ r, onIr, t }) {
  const pct = r.total ? Math.round((r.delivered / r.total) * 100) : 0
  /* La alarma sólo tiene sentido si la ruta sigue EN LA CALLE. Una terminada
     acumula minutos desde su última entrega para siempre, y a la 1 AM todas
     parecían paradas. */
  const parada = r.en_reparto && r.min_sin_entregar != null && r.min_sin_entregar >= 40
  const fin = !r.en_reparto
  const tono = fin ? 'emerald' : parada ? 'red' : r.critical > 0 ? 'amber' : 'brand'
  const C = {
    emerald: { b: 'border-emerald-500/25', bar: 'bg-emerald-400/80', t: 'text-emerald-300' },
    red:     { b: 'border-red-500/40',     bar: 'bg-red-400/80',     t: 'text-red-300' },
    amber:   { b: 'border-amber-500/30',   bar: 'bg-amber-400/80',   t: 'text-amber-300' },
    brand:   { b: 'border-dark-800',       bar: 'bg-brand-400/70',   t: 'text-dark-400' },
  }[tono]

  return (
    <button onClick={onIr}
      className={`group overflow-hidden rounded-xl border ${C.b} bg-dark-900/50 p-3 text-left transition-all hover:border-dark-600 hover:bg-dark-900`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] font-bold tracking-wide text-dark-200">{r.route_code}</span>
        <span className={`text-[11px] font-semibold tabular-nums ${C.t}`}>{pct}%</span>
      </div>
      <div className="mt-0.5 truncate text-[11px] text-dark-500">
        {r.driver_name || t('dh.sinConductor')}
      </div>

      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full ${C.bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[10px] text-dark-600">
        <span className="tabular-nums">{r.delivered}/{r.total}</span>
        {/* Una ruta terminada lo dice, en vez de dejar al gestor deduciéndolo
            de un porcentaje que no llega al 100 por los fallos del día. */}
        {fin && <span className="text-emerald-400/80">{t('ops.route.done')}</span>}
        {parada && (
          <span className="font-semibold text-red-300">{t('ops.stalled').replace('{n}', r.min_sin_entregar)}</span>
        )}
        {r.missing > 0 && <span className="font-semibold text-red-300">{r.missing} missing</span>}
        {r.critical > 0 && !parada && <span className="text-amber-300/90">{r.critical} {t('ops.crit')}</span>}
      </div>
    </button>
  )
}

const SEV_KEYS = {
  sin_danos: { key: 'sev.sin_danos', color: '#34d399', bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
  leve:      { key: 'sev.leve',      color: '#fbbf24', bg: 'bg-yellow-500/15',  text: 'text-yellow-300' },
  moderado:  { key: 'sev.moderado',  color: '#fb923c', bg: 'bg-orange-500/15',  text: 'text-orange-300' },
  grave:     { key: 'sev.grave',     color: '#f87171', bg: 'bg-red-500/15',     text: 'text-red-300' },
  critico:   { key: 'sev.critico',   color: '#ef4444', bg: 'bg-red-600/20',     text: 'text-red-400' },
}
const SEV_ORDER = ['sin_danos', 'leve', 'moderado', 'grave', 'critico']

/* ── KPI Card ── */
function KpiCard({ icon: Icon, label, value, sub, accent, to, alert }) {
  const nav = useNavigate()
  return (
    <div
      onClick={to ? () => nav(to) : undefined}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-dark-700/60 bg-dark-800/60 p-5 transition-all ${to ? 'cursor-pointer hover:border-dark-600 hover:bg-dark-800' : ''}`}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-10 blur-2xl" style={{ background: accent }} />
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: accent + '20' }}>
          <Icon size={16} style={{ color: accent }} />
        </div>
        {alert > 0 && (
          <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
            {alert}
          </span>
        )}
        {to && <ChevronRight size={14} className="text-dark-700 transition group-hover:text-dark-400" />}
      </div>
      <div className="mt-4">
        <div className="text-3xl font-extrabold tracking-tight text-dark-50">{value ?? '—'}</div>
        <div className="mt-0.5 text-sm font-medium text-dark-400">{label}</div>
        {sub && <div className="mt-1 text-[11px] text-dark-600">{sub}</div>}
      </div>
    </div>
  )
}

/* ── Fleet health bar ── */
function FleetHealth({ breakdown }) {
  const { t } = useT()
  const total = SEV_ORDER.reduce((a, k) => a + (breakdown?.[k] || 0), 0) || 1
  const critical = (breakdown?.grave || 0) + (breakdown?.critico || 0)
  const ok = breakdown?.sin_danos || 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-dark-900">
        {SEV_ORDER.map(k => {
          const n = breakdown?.[k] || 0
          const pct = (n / total) * 100
          return pct > 0 ? (
            <div key={k} style={{ width: `${pct}%`, background: SEV_KEYS[k].color }} title={`${t(SEV_KEYS[k].key)}: ${n}`} />
          ) : null
        })}
      </div>

      <div className="space-y-2">
        {SEV_ORDER.map(k => {
          const n = breakdown?.[k] || 0
          const pct = total > 1 ? Math.round((n / total) * 100) : 0
          return (
            <div key={k} className="flex items-center gap-2">
              <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: SEV_KEYS[k].color }} />
              <span className="flex-1 text-sm text-dark-400">{t(SEV_KEYS[k].key)}</span>
              <div className="flex items-center gap-2">
                <div className="h-1 w-16 overflow-hidden rounded-full bg-dark-900">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SEV_KEYS[k].color }} />
                </div>
                <span className="w-6 text-right text-xs font-semibold text-dark-300">{n}</span>
                <span className="w-8 text-right text-[11px] text-dark-700">{pct}%</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-2 pt-1">
        <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
          ✓ {ok} {t('fleet.ok')}
        </span>
        {critical > 0 && (
          <span className="rounded-lg bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 ring-1 ring-red-500/20">
            ⚠ {critical} {t('fleet.critical')}
          </span>
        )}
      </div>
    </div>
  )
}

/* ── Weekly chart ── */
function WeeklyChart({ data }) {
  const { t, lang } = useT()
  const locale = LANG_LOCALE[lang] || 'es-ES'
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const label = i === 0 ? t('chart.today') : d.toLocaleDateString(locale, { weekday: 'short' })
    days.push({ key, label, ...(data[key] || { inspecciones: 0, danos: 0 }) })
  }
  const max = Math.max(1, ...days.map(d => d.inspecciones))
  const totalWeek = days.reduce((a, d) => a + d.inspecciones, 0)
  const totalDamage = days.reduce((a, d) => a + d.danos, 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-1.5" style={{ height: 120 }}>
        {days.map(d => {
          const h = max > 0 ? Math.max(4, Math.round((d.inspecciones / max) * 100)) : 4
          const dPct = d.inspecciones > 0 ? (d.danos / d.inspecciones) * 100 : 0
          const isToday = d.key === new Date().toISOString().slice(0, 10)
          return (
            <div key={d.key} className="group relative flex flex-1 flex-col items-center gap-1">
              {d.inspecciones > 0 && (
                <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-dark-700 px-2 py-1 text-[10px] opacity-0 shadow group-hover:opacity-100 transition-opacity">
                  {d.inspecciones} {t('chart.insp.tt')}{d.danos > 0 ? ` · ${d.danos} ${t('chart.dmg.tt')}` : ''}
                </div>
              )}
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`relative w-full rounded-t-lg transition-all ${isToday ? 'bg-brand-500/50' : 'bg-dark-700'}`}
                  style={{ height: `${h}%` }}
                >
                  {dPct > 0 && (
                    <div className="absolute bottom-0 w-full rounded-t-lg bg-red-500/60" style={{ height: `${dPct}%` }} />
                  )}
                </div>
              </div>
              <span className={`text-[10px] ${isToday ? 'font-bold text-brand-400' : 'text-dark-600'}`}>{d.label}</span>
              <span className="text-[10px] font-semibold text-dark-400">{d.inspecciones || ''}</span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 border-t border-dark-800 pt-2 text-[11px] text-dark-600">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-dark-600" />{t('chart.insp')}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500/60" />{t('chart.damage')}</span>
        <span className="ml-auto text-dark-500">{totalWeek} {t('chart.total')} · {totalDamage} {t('chart.withdmg')}</span>
      </div>
    </div>
  )
}

/* ── Severity chip ── */
function SevChip({ sev }) {
  const { t } = useT()
  const m = SEV_KEYS[sev] || SEV_KEYS.sin_danos
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${m.bg} ${m.text}`} style={{ '--tw-ring-color': m.color + '30' }}>
      {t(m.key)}
    </span>
  )
}

/* ── Recent inspections ── */
function RecentInspections({ items }) {
  const nav = useNavigate()
  const { t } = useT()
  if (!items?.length) return (
    <div className="flex flex-col items-center gap-2 py-8 text-dark-600">
      <Camera size={24} />
      <span className="text-sm">{t('dash.no.recent')}</span>
    </div>
  )
  return (
    <div className="space-y-1">
      {items.slice(0, 7).map((ins, i) => {
        const plate = ins.vehicle?.license_plate || ins.vehicle_plate || '—'
        const sev = ins.analysis?.severity || 'sin_danos'
        return (
          <div
            key={ins.id || i}
            onClick={() => nav(`/panel/inspecciones`)}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-dark-700/40"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-dark-800 text-[10px] font-bold tracking-wider text-dark-300">
              {plate.slice(-4)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-dark-100">{plate}</span>
                <SevChip sev={sev} />
              </div>
              <div className="mt-0.5 text-[11px] text-dark-600 truncate">
                {ins.driver_name || ins.vehicle?.driver || t('ui.no.driver')}
              </div>
            </div>
            <span className="shrink-0 text-[11px] text-dark-600">{fmtRelative(ins.created_at, t)}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ── ITV Alerts ── */
function ItvAlerts({ items }) {
  const nav = useNavigate()
  const { t, lang } = useT()
  const locale = LANG_LOCALE[lang] || 'es-ES'
  if (!items?.length) return (
    <div className="flex flex-col items-center gap-2 py-8 text-dark-600">
      <CheckCircle2 size={24} />
      <span className="text-sm">{t('dash.no.itv')}</span>
    </div>
  )
  return (
    <div className="space-y-1">
      {items.slice(0, 6).map((a, i) => {
        const daysLeft = a.days_until_expiry ?? a.days_left
        const urgent = daysLeft != null && daysLeft <= 7
        const plate = a.license_plate || a.vehicle_plate || '—'
        return (
          <div
            key={a.id || i}
            onClick={() => nav('/panel/avisos-itv')}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-dark-700/40"
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${urgent ? 'bg-red-500/15' : 'bg-amber-500/10'}`}>
              <ShieldAlert size={14} className={urgent ? 'text-red-400' : 'text-amber-400'} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-dark-100">{plate}</div>
              <div className="mt-0.5 text-[11px] text-dark-600 truncate">
                {a.itv_expiry || a.expiry_date
                  ? `${t('itv.expires')} ${new Date(a.itv_expiry || a.expiry_date).toLocaleDateString(locale)}`
                  : t('itv.pending')}
              </div>
            </div>
            {daysLeft != null && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${urgent ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                {daysLeft <= 0 ? t('itv.vencida') : `${daysLeft}d`}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Main ── */
export default function Dashboard() {
  const { center, admin } = useOutletContext?.() || {}
  const { t, lang } = useT()
  const locale = LANG_LOCALE[lang] || 'es-ES'
  const [data,   setData]   = useState(null)
  const [itv,    setItv]    = useState([])
  const [costs,  setCosts]  = useState(null)
  const [err,    setErr]    = useState('')

  // € de daños nuevos (mes actual vs anterior) — carga independiente, no bloquea
  useEffect(() => {
    setCosts(null)
    getDamageCosts(center).then(r => setCosts(r.data)).catch(() => {})
  }, [center])

  // "Ahora mismo": lo urgente en vivo (Cortex + cola de revisión), refresco 60 s.
  const [nowLive, setNowLive] = useState(null)
  const navTop = useNavigate()
  useEffect(() => {
    let stop = false
    const load = () => {
      const day = new Date().toISOString().slice(0, 10)
      Promise.all([
        cortexOverview(day, center).catch(() => ({ data: null })),
        cortexRoutes(day, center).catch(() => ({ data: null })),
        getReviewQueue(center).catch(() => ({ data: [] })),
        cortexDireccionesHoy({ center: center && center !== 'Todos' ? center : '' })
          .catch(() => ({ data: null })),
      ]).then(([o, r, q, dir]) => {
        if (stop) return
        const queue = Array.isArray(q.data) ? q.data : (q.data?.items || [])
        /* El AVANCE DE ENTREGA sale de sumar las rutas, no de un endpoint
           nuevo: cada ruta ya trae `total` y `delivered`. Es el número que
           mide Amazon y el único que contesta "¿cómo va el día?" — y no
           estaba en ninguna parte del panel. */
        const rutas = lista(r.data?.routes)
        const total = rutas.reduce((a, x) => a + (x.total || 0), 0)
        const entregados = rutas.reduce((a, x) => a + (x.delivered || 0), 0)
        /* "En curso" = rutas con paquetes AÚN EN LA FURGONETA (`en_reparto`),
           no rutas con paquetes sin entregar. Los intentados y devueltos no se
           van a entregar hoy: el conductor ya volvió. Con el criterio viejo,
           a la 1 de la madrugada seguían saliendo 27 rutas "en la calle". */
        const enCurso = rutas.filter((x) => x.en_reparto).length
        setNowLive({
          missing: o.data?.missing_now ?? null,
          routes: rutas.length || null,
          /* El muro de rutas. Se ordena por lo que hay que MIRAR, no por
             nombre: primero las paradas (minutos desde la última entrega),
             luego las que van más retrasadas. Por código alfabético, lo
             urgente queda en cualquier sitio de la lista. */
          lista: [...rutas].sort((a, b) => {
            const pa = a.min_sin_entregar ?? -1
            const pb = b.min_sin_entregar ?? -1
            if (pb !== pa) return pb - pa
            const ra = a.total ? a.delivered / a.total : 1
            const rb = b.total ? b.delivered / b.total : 1
            return ra - rb
          }),
          enCurso,
          total,
          entregados,
          review: queue.length,
          // Direcciones que un conductor no encontró hoy y que aún no se han
          // podido resolver: es trabajo pendiente de HOY, no histórico.
          sinDireccion: dir.data
            ? lista(dir.data.paquetes).filter((p) => !p.real).length
            : null,
        })
      })
    }
    load()
    const iv = setInterval(load, 60000)
    return () => { stop = true; clearInterval(iv) }
  }, [center])

  useEffect(() => {
    setData(null)
    setErr('')
    const isCentered = center && center !== 'Todos'
    Promise.all([
      getDashboardStats(center),
      /* Ya NO se pide /vehicles/last-inspections. Ese endpoint devuelve un MAPA
         {vehicle_id: fecha} para el semáforo de la lista de vehículos, no una
         lista de inspecciones: el dashboard lo interpretaba como lista y el
         resultado era SIEMPRE vacío, así que el panel "Actividad reciente"
         nunca pudo enseñar nada — con 41 inspecciones ese mismo día. Se ha
         quitado el panel y con él la petición, que además se hacía en cada
         carga para nada. */
      getItvAlerts(center).catch(() => ({ data: [] })),
      isCentered ? getVehicles(center).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      isCentered ? getDrivers(center).catch(() => ({ data: [] }))  : Promise.resolve({ data: [] }),
    ]).then(([stats, alerts, vehs, drvs]) => {
      const ra   = alerts.data
      let itvList    = Array.isArray(ra)  ? ra  : (ra?.items  || ra?.alerts       || [])

      if (isCentered) {
        const centerVehicles = lista(vehs.data)
        const centerDrivers  = lista(drvs.data)

        // Construir set de IDs y matrículas del centro (fuente de verdad fiable)
        const idSet    = new Set(centerVehicles.map(v => v.id))
        const plateSet = new Set(
          centerVehicles.map(v => (v.license_plate || '').replace(/\s/g, '').toLowerCase()).filter(Boolean)
        )
        const normPlate = (p) => (p || '').replace(/\s/g, '').toLowerCase()

        // KPIs calculados desde la lista real del centro
        const inWorkshop = centerVehicles.filter(v => v.status === 'workshop' || v.in_workshop).length
        setData({
          ...stats.data,
          total_vehicles:       centerVehicles.length,
          vehicles_in_workshop: inWorkshop,
          total_drivers:        centerDrivers.length,
        })

        // Filtrar alertas ITV por matrícula del centro
        itvList = itvList.filter(a =>
          idSet.has(a.vehicle_id) ||
          plateSet.has(normPlate(a.license_plate || a.vehicle_plate || a.vehicle?.license_plate))
        )
      } else {
        setData(stats.data)
      }

      setItv(itvList)
    }).catch(() => setErr(t('dash.error')))
  }, [center])

  if (err) return <p className="text-red-400 p-4">{err}</p>
  if (!data) return <PageSkeleton kpis={4} rows={6} />

  const fleet = data.total_vehicles || 0
  const inShop = data.vehicles_in_workshop || 0
  const active = fleet - inShop
  const breakdown = data.severity_breakdown || {}
  const critCount = (breakdown.grave || 0) + (breakdown.critico || 0)
  const todayKey = new Date().toISOString().slice(0, 10)
  const todayInsp = data.weekly_activity?.[todayKey]?.inspecciones || 0

  const fleetSub = `${fleet} ${t('chart.total')} · ${inShop} ${t('dash.workshop').toLowerCase()}`
  const workshopSub = fleet > 0 ? `${Math.round((inShop/fleet)*100)}${t('dash.workshop.sub')}` : undefined
  const inspSub = `${data.total_inspections} ${t('dash.insptoday.sub')}`
  const itvSub = data.open_incidents
    ? `${data.open_incidents} ${t('dash.incidents.open')}`
    : t('dash.incidents.none')

  /* ── LO QUE PIDE UNA DECISIÓN, ORDENADO POR LO QUE CUESTA NO HACERLO ──────
     Antes esto era una lista plana donde "31 incidencias abiertas" —un backlog
     de semanas— pesaba lo mismo que "5 ITV vencidas", que es no poder circular
     legalmente. Y encima se repetía entera abajo como "tu trabajo de hoy", con
     los mismos números.

     Ahora cada línea lleva por qué importa, y van en este orden:
       1. ITV vencida  → la furgoneta no puede salir. Es lo único que para la
          operación de mañana.
       2. Missing      → hay un paquete perdido AHORA y se recupera llamando al
          conductor antes de que cierre la nave.
       3. Direcciones sin resolver hoy → el conductor sigue en la calle.
       4. Inspecciones por validar → daños sin peritar es dinero sin reclamar.
       5. Incidencias / taller → importan, pero aguantan a mañana. */
  const decisiones = [
    { n: itv.length, label: t('ops.itv.due'), why: t('ops.why.itv'),
      to: '/panel/vencimientos', tono: 'red' },
    { n: nowLive?.missing || 0, label: t('ops.missing'), why: t('ops.why.missing'),
      to: '/panel/paquetes', tono: 'red' },
    { n: nowLive?.sinDireccion || 0, label: t('ops.nodir'), why: t('ops.why.nodir'),
      to: '/panel/paquetes', tono: 'amber' },
    { n: nowLive?.review || 0, label: t('ops.validate'), why: t('ops.why.validate'),
      to: '/panel/revision', tono: 'amber' },
    { n: data.open_incidents || 0, label: t('ops.incidents'), why: t('ops.why.incidents'),
      to: '/panel/incidencias', tono: 'dark' },
    { n: inShop, label: t('ops.workshop'), why: t('ops.why.workshop'),
      to: '/panel/talleres', tono: 'dark' },
  ].filter((u) => u.n > 0)
  // Sólo cuenta como "urgente" lo que no aguanta a mañana. Meter el backlog en
  // ese número lo volvía enorme siempre y, por tanto, inútil.
  const urgentTotal = decisiones.filter((d) => d.tono !== 'dark')
    .reduce((a, u) => a + u.n, 0)

  /* El porcentaje EXACTO, con dos decimales. Redondeado a entero, 2.929 de
     3.019 y 2.938 de 3.019 son "97%" los dos, y en una operación de 3.000
     paquetes cada décima son tres paquetes. Delante de Amazon eso se nota. */
  const pctEntrega = nowLive?.total ? (nowLive.entregados / nowLive.total) * 100 : null
  const pctEnt = pctEntrega != null ? pctEntrega.toFixed(2) : null

  /* Los 7 últimos días de inspecciones, del backend (`weekly_activity`). El día
     de hoy va el último y es el único marcado: es sobre el que aún se actúa. */
  const semana = (() => {
    const out = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      out.push({
        key,
        label: i === 0 ? t('chart.today') : d.toLocaleDateString(locale, { weekday: 'short' }).slice(0, 3),
        n: data.weekly_activity?.[key]?.inspecciones || 0,
      })
    }
    return out
  })()

  const firstName = (admin?.name || '').trim().split(/\s+/)[0] || ''
  const availPct = fleet > 0 ? Math.round((active / fleet) * 100) : null
  const totalSev = SEV_ORDER.reduce((a, k) => a + (breakdown?.[k] || 0), 0)
  const okPct = totalSev ? Math.round(((breakdown?.sin_danos || 0) / totalSev) * 100) : 100

  return (
    <div className="mx-auto max-w-5xl">
      {/* ── Héroe editorial: la tipografía ES la interfaz ── */}
      <header className="rise pb-8 pt-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-dark-500">
          {fmtDate(locale)}{center && center !== 'Todos' ? ` · ${center}` : ''}
        </p>
        <h1 className="mt-2 font-display text-[clamp(30px,4.2vw,48px)] font-semibold leading-[1.05] tracking-[-0.03em] text-dark-50">
          {greeting(t)}{firstName ? `, ${firstName}` : ''}.
        </h1>
        {/* La frase de arriba tiene que contestar "¿cómo va el día?" en una
            línea. Antes decía "37 asuntos piden tu atención", donde 31 eran un
            backlog de incidencias: un número grande que no cambiaba nunca y que
            por eso no significaba nada. Ahora manda la entrega del día, que es
            lo que se mueve y lo que mide Amazon. */}
        <p className="mt-3 max-w-2xl text-[16.5px] leading-relaxed text-dark-400">
          {pctEntrega != null ? (
            <><b className="font-semibold text-dark-50">{pctEnt}%</b> {t('ops.brief.delivered')}
              {nowLive.enCurso > 0 && (
                <> · <b className="font-semibold text-dark-50"><Count v={nowLive.enCurso} /></b> {t('ops.brief.routes')}</>
              )}.
            </>
          ) : urgentTotal > 0
            ? (<><b className="font-semibold text-dark-50"><Count v={urgentTotal} /></b> {t('ops.brief.items')}.</>)
            : t('ops.brief.calm')}
          {availPct != null && (
            <> <b className="font-semibold text-dark-50"><Count v={availPct} />%</b> {t('ops.avail')}.</>
          )}
        </p>
      </header>

      {/* Guía de activación: se pinta sola mientras falte algún paso y
          desaparece cuando la flota ya está en marcha. Sustituye al estado
          vacío de antes, que solo sabía decir "importa vehículos". */}
      <Activacion />

      {fleet === 0 ? null : (
      <div>
      {/* ── 1 · LA OPERACIÓN DE HOY ─────────────────────────────────────────
          Lo primero, porque es lo único que se mueve mientras miras la
          pantalla. Antes esta franja la ocupaba un 26% de "inspecciones
          limpias" calculado sobre 3.045 inspecciones de toda la vida: un
          número que no cambiaba nunca y que no se podía accionar. */}
      {nowLive?.total > 0 && (
        <section className="rise border-t border-white/[0.05] py-7" style={{ animationDelay: '40ms' }}>
          <h2 className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            {t('ops.hoy')}
          </h2>

          <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-[46px] font-semibold leading-none tracking-[-0.03em] text-dark-50">
                  {/* Entero animado + decimales fijos: el contador sube y la
                      precisión no se pierde. */}
                  <Count v={Math.floor(pctEntrega)} />
                  <span className="text-[26px] text-dark-300">,{pctEnt.split('.')[1]}</span>
                </span>
                <span className="text-lg font-medium text-dark-500">%</span>
              </div>
              <p className="mt-1 text-[13px] text-dark-500">
                <span className="tabular-nums text-dark-300">{nowLive.entregados.toLocaleString(locale)}</span>
                {' '}{t('ops.of')}{' '}
                <span className="tabular-nums text-dark-300">{nowLive.total.toLocaleString(locale)}</span>
                {' '}{t('ops.delivered.sub')}
              </p>
            </div>

            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Mini n={nowLive.enCurso} label={t('ops.routes.live')} />
              <Mini n={nowLive.missing} label={t('ops.missing')} alerta={nowLive.missing > 0} />
              <Mini n={nowLive.sinDireccion} label={t('ops.nodir')} alerta={nowLive.sinDireccion > 0} />
            </div>
          </div>

          <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
            style={{ boxShadow: '0 0 24px rgba(52,211,153,0.12)' }}>
            <div className="h-full rounded-full bg-emerald-400/80 transition-all duration-700"
              style={{ width: `${pctEntrega}%` }} />
          </div>
        </section>
      )}

      {/* ── 1-bis · EL MURO DE RUTAS ─────────────────────────────────────────
          Las rutas del día a la vez, ordenadas por lo que hay que mirar: las
          paradas primero. Cada tarjeta lleva a su ruta. */}
      {nowLive?.lista?.length > 0 && (
        <section className="rise border-t border-white/[0.05] py-7" style={{ animationDelay: '70ms' }}>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-dark-100">
              {t('ops.wall')}
              <span className="ml-2 text-[13px] font-normal tabular-nums text-dark-500">{nowLive.lista.length}</span>
            </h2>
            <button onClick={() => navTop('/panel/paquetes')}
              className="text-[12px] text-dark-600 transition-colors hover:text-dark-300">
              {t('dash.see.all')} →
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {nowLive.lista.slice(0, 12).map((r) => (
              <RutaCard key={r.route_code} r={r} t={t} onIr={() => navTop('/panel/paquetes')} />
            ))}
          </div>
          {nowLive.lista.length > 12 && (
            <p className="mt-2.5 text-[11.5px] text-dark-600">
              {t('ops.wall.more').replace('{n}', nowLive.lista.length - 12)}
            </p>
          )}
        </section>
      )}

      {/* ── 2 · DECISIONES ───────────────────────────────────────────────────
          Una sola lista, ordenada por lo que cuesta NO hacerlo, y cada línea
          dice por qué importa. Antes eran dos secciones con los mismos
          números repetidos y sin explicar ninguna. */}
      {decisiones.length > 0 && (
        <section className="rise border-t border-white/[0.05] py-7" style={{ animationDelay: '100ms' }}>
          <h2 className="flex items-baseline gap-2 text-[15px] font-semibold text-dark-100">
            {t('ops.decisions')}
            {urgentTotal > 0 && (
              <span className="text-[13px] font-normal tabular-nums text-red-400/90">
                (<Count v={urgentTotal} /> {t('ops.cannot.wait')})
              </span>
            )}
          </h2>
          <div className="mt-2">
            {decisiones.map((u) => (
              <button key={u.label} onClick={() => navTop(u.to)}
                className="float-row group -mx-4 flex w-[calc(100%+2rem)] items-start gap-3 rounded-xl px-4 py-3 text-left">
                <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
                  u.tono === 'red' ? 'bg-red-400' : u.tono === 'amber' ? 'bg-amber-400' : 'bg-dark-600'}`} />
                <span className="min-w-0">
                  <span className="block text-[14.5px] text-dark-200">
                    <b className="font-semibold tabular-nums text-dark-50"><Count v={u.n} /></b> {u.label}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-dark-600">{u.why}</span>
                </span>
                <ChevronRight size={15} className="ml-auto mt-1 shrink-0 text-dark-600 transition-transform group-hover:translate-x-0.5 group-hover:text-dark-300" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── 2-bis · LA FLOTA, EN IMÁGENES ────────────────────────────────────
          Tres piezas y las tres con datos REALES. En el mockup de referencia
          había tarjetas con "↑5%" y curvas de tendencia: eso aquí no se puede
          calcular para casi ningún dato (no hay serie histórica de score ni de
          daños por semana), y una flecha verde inventada en una pantalla que
          se le enseña a Amazon es lo peor que podríamos poner. Va lo que hay. */}
      <section className="rise border-t border-white/[0.05] py-7" style={{ animationDelay: '140ms' }}>
        <h2 className="mb-4 text-[15px] font-semibold text-dark-100">{t('ops.fleet.state')}</h2>
        <div className="grid gap-5 lg:grid-cols-3">

          {/* Disponibilidad: cuántas furgonetas pueden salir mañana. */}
          <div className="rounded-2xl border border-dark-800 bg-dark-900/40 p-5">
            <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-dark-500">{t('ops.availability')}</p>
            <div className="flex items-center gap-5">
              <Anillo size={124}
                centro={`${availPct ?? 0}%`} sub={t('ops.ready')}
                segmentos={[
                  { k: 'ok', n: active, color: '#34d399' },
                  { k: 'shop', n: inShop, color: '#fbbf24' },
                ]} />
              <div className="space-y-2 text-[12.5px]">
                <p className="flex items-center gap-2 text-dark-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {t('ops.ready')} <b className="ml-auto tabular-nums text-dark-100">{active}</b>
                </p>
                <p className="flex items-center gap-2 text-dark-300">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  {t('dash.workshop')} <b className="ml-auto tabular-nums text-dark-100">{inShop}</b>
                </p>
                <p className="flex items-center gap-2 text-dark-500">
                  <span className="h-2 w-2 rounded-full bg-dark-600" />
                  {t('nav.drivers')} <b className="ml-auto tabular-nums text-dark-300">{data.total_drivers}</b>
                </p>
              </div>
            </div>
          </div>

          {/* Severidad de los daños. Se dice CLARAMENTE que es el acumulado de
              todas las inspecciones, no de esta semana: es lo que hay, y
              etiquetarlo como semanal sería mentir. */}
          <div className="rounded-2xl border border-dark-800 bg-dark-900/40 p-5">
            <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-dark-500">{t('ops.damage.split')}</p>
            <div className="flex items-center gap-5">
              <Anillo size={124}
                centro={data.total_inspections?.toLocaleString(locale) ?? '—'}
                sub={t('ops.inspections')}
                segmentos={SEV_ORDER.map((k) => ({ k, n: breakdown?.[k] || 0, color: SEV_KEYS[k].color }))} />
              <div className="space-y-1.5 text-[12px]">
                {SEV_ORDER.map((k) => (
                  <p key={k} className="flex items-center gap-2 text-dark-400">
                    <span className="h-2 w-2 rounded-full" style={{ background: SEV_KEYS[k].color }} />
                    {t(SEV_KEYS[k].key)}
                    <b className="ml-auto tabular-nums text-dark-200">{breakdown?.[k] || 0}</b>
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* Actividad real de los últimos 7 días. */}
          <div className="rounded-2xl border border-dark-800 bg-dark-900/40 p-5">
            <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-dark-500">{t('ops.week')}</p>
            <p className="mb-4 text-[12.5px] text-dark-500">
              <b className="text-dark-100">{semana.reduce((a, d) => a + d.n, 0)}</b> {t('ops.inspections')}
            </p>
            <Barras dias={semana} locale={locale} />
          </div>
        </div>
      </section>

      {/* ── 3 · LA FLOTA, EN UNA LÍNEA ───────────────────────────────────── */}
      <section className="rise border-t border-white/[0.05] py-7" style={{ animationDelay: '160ms' }}>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-dark-100">
          <span className="text-emerald-400">●</span> {t('ops.control')}
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed text-dark-400">
          <b className="font-semibold text-dark-100"><Count v={active} /></b> {t('ops.active.veh')}
          <span className="mx-2 text-dark-700">·</span>
          <b className="font-semibold text-dark-100"><Count v={data.total_drivers} /></b> {t('nav.drivers').toLowerCase()}
          <span className="mx-2 text-dark-700">·</span>
          <b className="font-semibold text-dark-100"><Count v={todayInsp} /></b> {t('ops.insp.today')}
          {costs && costs.month_eur > 0 && (
            <><span className="mx-2 text-dark-700">·</span>
            <b className={`font-semibold ${costs.prev_month_eur && costs.month_eur < costs.prev_month_eur ? 'text-emerald-400' : 'text-amber-300'}`}>{Math.round(costs.month_eur).toLocaleString('es-ES')} €</b> {t('ops.damage.month')}</>
          )}
        </p>
        {costs && (costs.month_real_eur > 0 || costs.en_taller > 0 || costs.sin_gestionar > 0) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
            {costs.month_real_eur > 0 && (
              <span className="text-dark-400">
                <b className="font-semibold text-emerald-300">{Math.round(costs.month_real_eur).toLocaleString('es-ES')} €</b> {t('eur.real')}
              </span>
            )}
            {costs.sin_gestionar > 0 && (
              <span className="text-amber-300/90">{t('eur.unmanaged').replace('{n}', costs.sin_gestionar)}</span>
            )}
          </div>
        )}
      </section>

      {/* ── Próximos vencimientos (ancho completo) ── */}
      {itv.length > 0 && (
        <section className="rise border-t border-white/[0.05] py-7" style={{ animationDelay: '260ms' }}>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold text-dark-100">{t('ops.upcoming')}</h2>
            <button onClick={() => navTop('/panel/vencimientos')} className="text-[12px] text-dark-600 transition-colors hover:text-dark-300">
              {t('dash.see.all')} →
            </button>
          </div>
          <ItvAlerts items={itv} />
        </section>
      )}
      </div>
      )}
    </div>
  )
}
