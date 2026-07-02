import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOutletContext } from 'react-router-dom'
import {
  Truck, Wrench, Users, ClipboardList, BellRing, AlertTriangle,
  Loader2, TrendingUp, Camera, ShieldAlert, CheckCircle2,
  ChevronRight, Clock, ArrowRight,
} from 'lucide-react'
import { getDashboardStats, getLastInspections, getItvAlerts, getVehicles, getDrivers } from '../api'
import { useT, LANG_LOCALE } from '../../i18n'
import { PageSkeleton } from '../components/Skeleton'

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
  const { center } = useOutletContext?.() || {}
  const { t, lang } = useT()
  const locale = LANG_LOCALE[lang] || 'es-ES'
  const [data,   setData]   = useState(null)
  const [recent, setRecent] = useState([])
  const [itv,    setItv]    = useState([])
  const [err,    setErr]    = useState('')

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

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-dark-50">{greeting(t)}</h1>
          <p className="mt-0.5 text-sm capitalize text-dark-500">
            {fmtDate(locale)}{center && center !== 'Todos' ? ` · ${t('dash.center')} ${center}` : ''}
          </p>
        </div>
        {critCount > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
            <AlertTriangle size={14} /> {critCount} {t('dash.attention').replace('{s}', critCount !== 1 ? 's' : '')}
          </div>
        )}
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard icon={Truck}    label={t('dash.flota.active')} value={active}               sub={fleetSub}                   accent="#0ea5e9" to="/panel/vehiculos" />
        <KpiCard icon={Wrench}   label={t('dash.workshop')}     value={inShop}               sub={workshopSub}                accent="#fb923c" to="/panel/talleres" />
        <KpiCard icon={Users}    label={t('nav.drivers')}        value={data.total_drivers}  sub={t('dash.drivers.sub')}      accent="#a78bfa" to="/panel/conductores" />
        <KpiCard icon={Camera}   label={t('dash.insptoday')}     value={todayInsp}           sub={inspSub}                    accent="#34d399" to="/panel/inspecciones" />
        <KpiCard icon={BellRing} label={t('dash.itvalerts')}     value={data.unread_alerts}  sub={itvSub}                     accent="#fbbf24" to="/panel/avisos-itv" alert={critCount > 0 ? critCount : 0} />
      </div>

      {/* ── Middle row ── */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2 rounded-2xl border border-dark-700/60 bg-dark-800/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-dark-200">{t('dash.fleet.state')}</h2>
            <span className="text-xs text-dark-600">{data.total_inspections} {t('dash.fleet.total')}</span>
          </div>
          <FleetHealth breakdown={breakdown} />
        </div>

        <div className="lg:col-span-3 rounded-2xl border border-dark-700/60 bg-dark-800/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-dark-200">{t('dash.activity')}</h2>
            <div className="flex items-center gap-1.5 text-xs text-dark-600">
              <TrendingUp size={12} />
              {Object.values(data.weekly_activity || {}).reduce((a, d) => a + (d.inspecciones || 0), 0)} {t('dash.thisweek')}
            </div>
          </div>
          <WeeklyChart data={data.weekly_activity || {}} />
        </div>
      </div>

      {/* ── Bottom row ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-dark-700/60 bg-dark-800/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-dark-200">
              <Camera size={14} className="text-dark-500" /> {t('dash.recentinsp')}
            </h2>
            <button
              onClick={() => window.location.assign('/panel/inspecciones')}
              className="flex items-center gap-1 text-xs text-dark-600 hover:text-dark-300 transition"
            >
              {t('dash.see.all')} <ArrowRight size={11} />
            </button>
          </div>
          <RecentInspections items={recent} />
        </div>

        <div className="rounded-2xl border border-dark-700/60 bg-dark-800/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-dark-200">
              <ShieldAlert size={14} className="text-dark-500" /> {t('dash.itv.upcoming')}
            </h2>
            <button
              onClick={() => window.location.assign('/panel/avisos-itv')}
              className="flex items-center gap-1 text-xs text-dark-600 hover:text-dark-300 transition"
            >
              {t('dash.see.all')} <ArrowRight size={11} />
            </button>
          </div>
          <ItvAlerts items={itv} />
        </div>
      </div>
    </div>
  )
}
