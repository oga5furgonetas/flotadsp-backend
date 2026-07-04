import { useEffect, useState } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { Sun, Camera, AlertTriangle, ClipboardCheck, BellRing, CheckCircle2, ChevronRight } from 'lucide-react'
import { getDailyAssignment, getInspections, getIncidents, getItvAlerts } from '../api'
import { PageSkeleton } from '../components/Skeleton'

/* ── Torre de control "Mi día" ────────────────────────────────────────────────
   La pantalla de las 8:00 del jefe de turno: todo lo urgente de HOY en un solo
   sitio, ordenado por prioridad. Compone endpoints existentes (cero backend). */
export default function MiDia() {
  const { center } = useOutletContext()
  const { t } = useT()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const noCenter = center === 'Todos'

  useEffect(() => {
    if (noCenter) return
    setData(null); setErr('')
    Promise.all([
      getDailyAssignment(center, today).catch(() => ({ data: null })),
      getInspections({ center, date_from: today, date_to: today, limit: 500 }).catch(() => ({ data: [] })),
      getIncidents({ status: 'open' }).catch(() => ({ data: [] })),
      getItvAlerts(center).catch(() => ({ data: [] })),
    ]).then(([da, insp, inc, itv]) => {
      const doc = Array.isArray(da.data) ? da.data[0] : da.data
      setData({
        slots: Array.isArray(doc?.slots) ? doc.slots : [],
        insps: Array.isArray(insp.data) ? insp.data : [],
        incidents: Array.isArray(inc.data) ? inc.data : [],
        itv: Array.isArray(itv.data) ? itv.data : [],
      })
    }).catch(() => setErr(t('dash.error')))
  }, [center]) // eslint-disable-line

  if (noCenter) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-3 flex items-center gap-2 text-xl font-bold"><Sun size={20} className="text-amber-400" /> {t('midia.title')}</h1>
        <div className="card p-10 text-center text-dark-300">{t('midia.pick.center')}</div>
      </div>
    )
  }
  if (err) return <p className="text-red-400">{err}</p>
  if (!data) return <PageSkeleton kpis={3} rows={6} />

  // Cruce: conductores con furgo asignada hoy que aún NO han subido inspección
  const doneDrivers = new Set(data.insps.map((i) => i.driver_id).filter(Boolean))
  const pending = data.slots.filter((s) => s.driver_id && s.vehicle_id && !doneDrivers.has(s.driver_id))
  const withDamage = data.insps.filter((i) => (i.analysis?.new_damages || []).length > 0)
  const unassigned = data.slots.filter((s) => s.vehicle_id && !s.driver_id)
  const itvSoon = data.itv.filter((a) => (a.days_left ?? 99) <= 15)
  const allClear = pending.length === 0 && withDamage.length === 0 && itvSoon.length === 0

  const Section = ({ icon: Icon, tone, title, count, to, children }) => (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <Link to={to} className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-bold"><Icon size={15} /> {title}
          <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs">{count}</span>
        </span>
        <ChevronRight size={14} className="opacity-60" />
      </Link>
      {children}
    </div>
  )

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Sun size={20} className="text-amber-400" /> {t('midia.title')} · {center}</h1>
        <p className="mt-0.5 text-sm text-dark-500">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      {allClear && (
        <div className="card flex items-center gap-3 border-emerald-500/20 bg-emerald-500/5 p-5 text-emerald-300">
          <CheckCircle2 size={22} /> <span className="font-semibold">{t('midia.all.clear')}</span>
        </div>
      )}

      {pending.length > 0 && (
        <Section icon={Camera} count={pending.length} to="/panel/asignacion"
          tone="border-amber-500/25 bg-amber-500/5 text-amber-200"
          title={t('midia.pending.insp')}>
          <div className="space-y-1">
            {pending.slice(0, 10).map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-1.5 text-sm">
                <span className="font-medium">{s.driver_name || '—'}</span>
                <span className="font-mono text-xs text-amber-300/80">{s.vehicle_plate || s.vehicle_id}</span>
              </div>
            ))}
            {pending.length > 10 && <p className="px-1 text-xs opacity-70">+{pending.length - 10} más…</p>}
          </div>
        </Section>
      )}

      {withDamage.length > 0 && (
        <Section icon={AlertTriangle} count={withDamage.length} to="/panel/revision"
          tone="border-red-500/25 bg-red-500/5 text-red-200"
          title={t('midia.new.damage')}>
          <div className="space-y-1">
            {withDamage.slice(0, 6).map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-1.5 text-sm">
                <span>{(i.analysis?.new_damages || []).map((d) => d.part).filter(Boolean).slice(0, 2).join(', ') || t('midia.damage')}</span>
                <span className="text-xs opacity-70">{(i.created_at || '').slice(11, 16)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {itvSoon.length > 0 && (
        <Section icon={BellRing} count={itvSoon.length} to="/panel/avisos-itv"
          tone="border-orange-500/25 bg-orange-500/5 text-orange-200"
          title={t('midia.itv.soon')}>
          <div className="flex flex-wrap gap-2">
            {itvSoon.slice(0, 8).map((a, i) => (
              <span key={i} className="rounded-full bg-black/25 px-2.5 py-1 text-xs font-mono">
                {a.license_plate || a.vehicle_plate} · {a.days_left}d
              </span>
            ))}
          </div>
        </Section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Section icon={ClipboardCheck} count={unassigned.length} to="/panel/asignacion"
          tone="border-dark-700 bg-dark-900 text-dark-200" title={t('midia.unassigned')}>
          <p className="text-xs text-dark-500">{unassigned.length === 0 ? t('midia.all.assigned') : t('midia.go.assign')}</p>
        </Section>
        <Section icon={AlertTriangle} count={data.incidents.length} to="/panel/incidencias"
          tone="border-dark-700 bg-dark-900 text-dark-200" title={t('midia.open.inc')}>
          <p className="text-xs text-dark-500">{data.incidents.length === 0 ? t('midia.no.inc') : t('midia.review.inc')}</p>
        </Section>
      </div>
    </div>
  )
}
