import { useEffect, useState } from 'react'
import {
  Truck, Wrench, Users, ClipboardList, BellRing, AlertTriangle, Loader2,
} from 'lucide-react'
import { getDashboardStats } from '../api'

const SEV = [
  { key: 'sin_danos', label: 'Sin daños', color: '#34d399' },
  { key: 'leve', label: 'Leve', color: '#fbbf24' },
  { key: 'moderado', label: 'Moderado', color: '#fb923c' },
  { key: 'grave', label: 'Grave', color: '#f87171' },
  { key: 'critico', label: 'Crítico', color: '#ef4444' },
]

function Kpi({ icon: Icon, label, value, accent }) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon size={18} style={{ color: accent }} />
        <span className="text-2xl font-extrabold">{value}</span>
      </div>
      <div className="text-sm text-dark-400">{label}</div>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    getDashboardStats()
      .then((r) => setData(r.data))
      .catch(() => setErr('No se pudieron cargar las métricas.'))
  }, [])

  if (err) return <p className="text-red-400">{err}</p>
  if (!data) return <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> Cargando…</div>

  const sevTotal = SEV.reduce((a, s) => a + (data.severity_breakdown?.[s.key] || 0), 0) || 1

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi icon={Truck} label="Furgonetas" value={data.total_vehicles} accent="#0ea5e9" />
        <Kpi icon={Wrench} label="En taller" value={data.vehicles_in_workshop} accent="#fb923c" />
        <Kpi icon={Users} label="Conductores" value={data.total_drivers} accent="#a78bfa" />
        <Kpi icon={ClipboardList} label="Inspecciones" value={data.total_inspections} accent="#34d399" />
        <Kpi icon={BellRing} label="Avisos" value={data.unread_alerts} accent="#fbbf24" />
        <Kpi icon={AlertTriangle} label="Incidencias" value={data.open_incidents} accent="#f87171" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* Severidad */}
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-dark-200">Estado de la flota (severidad)</h2>
          <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-dark-800">
            {SEV.map((s) => {
              const n = data.severity_breakdown?.[s.key] || 0
              const pct = (n / sevTotal) * 100
              return pct > 0 ? <div key={s.key} style={{ width: `${pct}%`, background: s.color }} /> : null
            })}
          </div>
          <div className="space-y-1.5">
            {SEV.map((s) => (
              <div key={s.key} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-dark-300">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-semibold">{data.severity_breakdown?.[s.key] || 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actividad semanal */}
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-dark-200">Actividad (últimos 7 días)</h2>
          <WeeklyChart data={data.weekly_activity || {}} />
        </div>
      </div>
    </div>
  )
}

function WeeklyChart({ data }) {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ key, label: d.toLocaleDateString('es', { weekday: 'short' }), ...(data[key] || { inspecciones: 0, danos: 0 }) })
  }
  const max = Math.max(1, ...days.map((d) => d.inspecciones))
  return (
    <div className="flex h-40 items-end justify-between gap-2">
      {days.map((d) => (
        <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full flex-1 items-end">
            <div className="relative w-full rounded-t bg-brand-500/30" style={{ height: `${(d.inspecciones / max) * 100}%`, minHeight: d.inspecciones ? 4 : 0 }}>
              {d.danos > 0 && (
                <div className="absolute bottom-0 w-full rounded-t bg-red-500/70" style={{ height: `${(d.danos / Math.max(1, d.inspecciones)) * 100}%` }} />
              )}
            </div>
          </div>
          <span className="text-[10px] text-dark-500">{d.label}</span>
          <span className="text-[11px] font-semibold text-dark-300">{d.inspecciones}</span>
        </div>
      ))}
    </div>
  )
}
