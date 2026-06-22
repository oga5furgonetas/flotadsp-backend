import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, CalendarClock, Users } from 'lucide-react'
import { getShiftCoverage } from '../api'

function iso(d) { return d.toISOString().slice(0, 10) }

export default function Turnos() {
  const { center, centers } = useOutletContext()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const noCenter = center === 'Todos'

  const load = useCallback(() => {
    if (noCenter) return
    const start = new Date()
    const end = new Date(); end.setDate(end.getDate() + 13)
    getShiftCoverage(center, iso(start), iso(end))
      .then((r) => setData(r.data))
      .catch(() => setErr('No se pudo cargar la cobertura.'))
  }, [center, noCenter])

  useEffect(() => { setData(null); setErr(''); load() }, [load])

  if (noCenter) {
    return (
      <div>
        <h1 className="mb-4 text-xl font-bold">Turnos</h1>
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <CalendarClock size={30} className="text-brand-400" />
          <p className="text-dark-200">Elige un centro arriba para ver su cobertura de turnos.</p>
          <p className="text-sm text-dark-500">Disponibles: {centers?.join(' · ') || '—'}</p>
        </div>
      </div>
    )
  }

  if (err) return <p className="text-red-400">{err}</p>
  if (!data) return <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> Cargando…</div>

  const min = data.min || 0
  const cov = data.coverage || {}
  const days = []
  for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() + i); days.push(iso(d)) }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Turnos · {center}</h1>
        <span className="text-sm text-dark-400">Mínimo: {min} conductores/día</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((d) => {
          const n = cov[d] || 0
          const low = min > 0 && n < min
          const dt = new Date(d + 'T00:00')
          return (
            <div key={d} className={`card p-3 ${low ? 'border-red-500/40 bg-red-500/5' : ''}`}>
              <div className="text-[11px] uppercase text-dark-500">{dt.toLocaleDateString('es', { weekday: 'short' })}</div>
              <div className="text-sm text-dark-300">{dt.toLocaleDateString('es', { day: '2-digit', month: '2-digit' })}</div>
              <div className={`mt-1 flex items-center gap-1 text-lg font-bold ${low ? 'text-red-300' : 'text-dark-100'}`}>
                <Users size={15} /> {n}
              </div>
              {low && <div className="text-[10px] font-semibold text-red-400">falta cobertura</div>}
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-dark-500">Conductores disponibles (trabaja + extra) por día, según el cuadrante de turnos del centro.</p>
    </div>
  )
}
