import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOutletContext } from 'react-router-dom'
import {
  Truck, Wrench, Users, ClipboardList, BellRing, AlertTriangle,
  Loader2, TrendingUp, Camera, ShieldAlert, CheckCircle2,
  ChevronRight, Clock, ArrowRight,
} from 'lucide-react'
import { getDashboardStats, getLastInspections, getItvAlerts, getVehicles, getDrivers, getDamageCosts, cortexOverview, cortexRoutes, getReviewQueue } from '../api'
import { useT, LANG_LOCALE } from '../../i18n'
import { PageSkeleton } from '../components/Skeleton'
import GuidedEmpty from '../components/GuidedEmpty'

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
  const [recent, setRecent] = useState([])
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
      ]).then(([o, r, q]) => {
        if (stop) return
        const queue = Array.isArray(q.data) ? q.data : (q.data?.items || [])
        setNowLive({
          missing: o.data?.missing_now ?? null,
          routes: r.data ? (r.data.routes || []).length : null,
          review: queue.length,
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
      getLastInspections(center).catch(() => ({ data: [] })),
      getItvAlerts(center).catch(() => ({ data: [] })),
      isCentered ? getVehicles(center).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      isCentered ? getDrivers(center).catch(() => ({ data: [] }))  : Promise.resolve({ data: [] }),
    ]).then(([stats, last, alerts, vehs, drvs]) => {
      const raw  = last.data
      const ra   = alerts.data
      let recentList = Array.isArray(raw) ? raw : (raw?.items || raw?.inspections || [])
      let itvList    = Array.isArray(ra)  ? ra  : (ra?.items  || ra?.alerts       || [])

      if (isCentered) {
        const centerVehicles = vehs.data || []
        const centerDrivers  = drvs.data || []

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

        // Filtrar inspecciones recientes por ID o matrícula del centro
        recentList = recentList.filter(i =>
          idSet.has(i.vehicle_id) ||
          plateSet.has(normPlate(i.vehicle?.license_plate || i.vehicle_plate))
        )

        // Filtrar alertas ITV por matrícula del centro
        itvList = itvList.filter(a =>
          idSet.has(a.vehicle_id) ||
          plateSet.has(normPlate(a.license_plate || a.vehicle_plate || a.vehicle?.license_plate))
        )
      } else {
        setData(stats.data)
      }

      setRecent(recentList)
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

  // ── Centro de Operaciones: la home guía el trabajo, no muestra widgets ──
  const urgent = [
    { n: itv.length, label: t('ops.itv.due'), to: '/panel/vencimientos', color: 'bg-red-400' },
    { n: nowLive?.missing || 0, label: t('ops.missing'), to: '/panel/paquetes', color: 'bg-red-400' },
    { n: data.open_incidents || 0, label: t('ops.incidents'), to: '/panel/incidencias', color: 'bg-amber-400' },
    { n: inShop, label: t('ops.workshop'), to: '/panel/talleres', color: 'bg-amber-400' },
  ].filter((u) => u.n > 0)
  const urgentTotal = urgent.reduce((a, u) => a + u.n, 0)
  const todos = [
    { n: nowLive?.review || 0, label: t('ops.validate'), to: '/panel/revision' },
    { n: nowLive?.missing || 0, label: t('ops.investigate'), to: '/panel/paquetes' },
    { n: itv.length, label: t('ops.review.exp'), to: '/panel/vencimientos' },
  ].filter((x) => x.n > 0)

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
        <p className="mt-3 max-w-xl text-[16.5px] leading-relaxed text-dark-400">
          {urgentTotal > 0
            ? (<><b className="font-semibold text-dark-50"><Count v={urgentTotal} /></b> {t('ops.brief.items')}.</>)
            : t('ops.brief.calm')}
          {availPct != null && (
            <> <b className="font-semibold text-dark-50"><Count v={availPct} />%</b> {t('ops.avail')}.</>
          )}
        </p>
      </header>

      {fleet === 0 ? (
        <div className="mt-8">
          <GuidedEmpty
            emoji="👋"
            title={t('empty.dash.title')}
            hint={t('empty.dash.hint')}
            actionLabel={t('empty.veh.import')}
            to="/panel/importaciones"
            secondary={{ to: '/panel/vehiculos', label: t('empty.veh.add') }}
          />
        </div>
      ) : (
      <div>
      {/* ── Composición asimétrica 7/5: trabajo a la izquierda, pulso a la derecha ── */}
      <div className="grid gap-x-14 lg:grid-cols-12">

        <div className="divide-y divide-white/[0.05] lg:col-span-7">
          {/* ── 1 · Requieren atención inmediata ── */}
          {urgent.length > 0 && (
            <section className="rise py-7" style={{ animationDelay: '60ms' }}>
              <h2 className="flex items-baseline gap-2 text-[15px] font-semibold text-dark-100">
                <span className="text-red-400">●</span> {t('ops.attention')}
                <span className="text-[13px] font-normal tabular-nums text-dark-500">(<Count v={urgentTotal} />)</span>
              </h2>
              <div className="mt-2">
                {urgent.map((u) => (
                  <button key={u.label} onClick={() => navTop(u.to)}
                    className="float-row group -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 rounded-xl px-4 py-3.5 text-left">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${u.color}`} />
                    <span className="text-[14.5px] text-dark-200">
                      <b className="font-semibold tabular-nums text-dark-50"><Count v={u.n} /></b> {u.label}
                    </span>
                    <ChevronRight size={15} className="ml-auto shrink-0 text-dark-600 transition-transform group-hover:translate-x-0.5 group-hover:text-dark-300" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── 2 · Tu trabajo de hoy ── */}
          <section className="rise py-7" style={{ animationDelay: '120ms' }}>
            <h2 className="text-[15px] font-semibold text-dark-100">{t('ops.today')}</h2>
            <div className="mt-2">
              {todos.length === 0 ? (
                <p className="flex items-center gap-2 py-2 text-[14px] text-emerald-400/90">
                  <CheckCircle2 size={15} /> {t('ops.clear')}
                </p>
              ) : todos.map((x) => (
                <button key={x.label} onClick={() => navTop(x.to)}
                  className="float-row group -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 rounded-xl px-4 py-3.5 text-left">
                  <span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border border-dark-600 text-transparent transition-colors group-hover:border-dark-300" />
                  <span className="text-[14.5px] text-dark-200">{x.label}</span>
                  <span className="ml-auto text-[13px] font-medium tabular-nums text-dark-500"><Count v={x.n} /></span>
                </button>
              ))}
            </div>
          </section>

          {/* ── 3 · Todo lo demás bajo control ── */}
          <section className="rise py-7" style={{ animationDelay: '180ms' }}>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-dark-100">
              <span className="text-emerald-400">●</span> {t('ops.control')}
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-dark-400">
              <b className="font-semibold text-dark-100"><Count v={active} /></b> {t('ops.active.veh')}
              <span className="mx-2 text-dark-700">·</span>
              <b className="font-semibold text-dark-100"><Count v={data.total_drivers} /></b> {t('nav.drivers').toLowerCase()}
              {nowLive?.routes > 0 && (<><span className="mx-2 text-dark-700">·</span><b className="font-semibold text-dark-100"><Count v={nowLive.routes} /></b> {t('ops.routes.live')}</>)}
              <span className="mx-2 text-dark-700">·</span>
              <b className="font-semibold text-dark-100"><Count v={todayInsp} /></b> {t('ops.insp.today')}
              {costs && costs.month_eur > 0 && (
                <><span className="mx-2 text-dark-700">·</span>
                <b className={`font-semibold ${costs.prev_month_eur && costs.month_eur < costs.prev_month_eur ? 'text-emerald-400' : 'text-amber-300'}`}>{Math.round(costs.month_eur).toLocaleString('es-ES')} €</b> {t('ops.damage.month')}</>
              )}
            </p>
          </section>
        </div>

        {/* ── Columna derecha: el instrumento ── */}
        <div className="divide-y divide-white/[0.05] lg:col-span-5 lg:border-l lg:border-white/[0.05] lg:pl-12">

          {/* ── Fleet Pulse: un número que respira, una línea de luz ── */}
          <section className="rise py-7" style={{ animationDelay: '160ms' }}>
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">{t('ops.pulse')}</h2>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-[52px] font-semibold leading-none tracking-[-0.03em] text-dark-50"><Count v={okPct} /></span>
              <span className="text-xl font-medium text-dark-500">%</span>
            </div>
            <p className="mt-1 text-[13px] text-dark-500">{t('ops.pulse.clean')} · <span className="tabular-nums">{data.total_inspections}</span> {t('dash.fleet.total')}</p>
            <div className="mt-4 flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
              style={{ boxShadow: '0 0 24px rgba(52,211,153,0.12)' }}>
              {SEV_ORDER.map((k) => {
                const n = breakdown?.[k] || 0
                const pct = totalSev ? (n / totalSev) * 100 : 0
                return pct > 0 ? <div key={k} style={{ width: `${pct}%`, background: SEV_KEYS[k].color, opacity: 0.85 }} /> : null
              })}
            </div>
            {((breakdown?.grave || 0) + (breakdown?.critico || 0)) > 0 && (
              <p className="mt-3 text-[12.5px] text-red-300/90">⚠ {(breakdown?.grave || 0) + (breakdown?.critico || 0)} {t('fleet.critical')}</p>
            )}
          </section>

          {/* ── Actividad en vivo ── */}
          <section className="rise py-7" style={{ animationDelay: '220ms' }}>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                {t('ops.recent')}
              </h2>
              <button onClick={() => navTop('/panel/inspecciones')} className="text-[12px] text-dark-600 transition-colors hover:text-dark-300">
                {t('dash.see.all')} →
              </button>
            </div>
            <RecentInspections items={recent} />
          </section>
        </div>
      </div>

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
