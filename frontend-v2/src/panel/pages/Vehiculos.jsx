import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Search, Truck } from 'lucide-react'
import { getVehicles } from '../api'

const STATUS = {
  active: { label: 'Activa', cls: 'bg-emerald-500/15 text-emerald-400' },
  taller: { label: 'En taller', cls: 'bg-orange-500/15 text-orange-400' },
  baja: { label: 'Baja', cls: 'bg-dark-700 text-dark-300' },
}

function itvBadge(itv) {
  if (!itv) return null
  const days = Math.ceil((new Date(itv) - new Date()) / 86400000)
  if (days < 0) return <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] text-red-400">ITV vencida</span>
  if (days <= 30) return <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-400">ITV en {days}d</span>
  return <span className="text-[11px] text-dark-500">ITV {itv}</span>
}

export default function Vehiculos() {
  const { center } = useOutletContext()
  const [vehicles, setVehicles] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    setVehicles(null)
    setErr('')
    getVehicles(center)
      .then((r) => setVehicles(r.data || []))
      .catch(() => setErr('No se pudieron cargar los vehículos.'))
  }, [center])

  if (err) return <p className="text-red-400">{err}</p>

  const list = (vehicles || []).filter((v) => {
    if (!q) return true
    const s = q.toLowerCase()
    return (
      (v.license_plate || '').toLowerCase().includes(s) ||
      (v.brand || '').toLowerCase().includes(s) ||
      (v.model || '').toLowerCase().includes(s) ||
      (v.center || '').toLowerCase().includes(s)
    )
  })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Vehículos {vehicles && <span className="text-dark-500">· {list.length}</span>}</h1>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input className="input w-64 pl-9" placeholder="Buscar matrícula, marca…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {!vehicles ? (
        <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> Cargando…</div>
      ) : list.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center text-dark-400">
          <Truck size={28} /> Sin vehículos {center !== 'Todos' && `en ${center}`}.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-800 text-left text-xs uppercase tracking-wide text-dark-500">
                  <th className="px-4 py-2.5">Matrícula</th>
                  <th className="px-4 py-2.5">Vehículo</th>
                  <th className="px-4 py-2.5">Centro</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5">Km</th>
                  <th className="px-4 py-2.5">ITV</th>
                </tr>
              </thead>
              <tbody>
                {list.map((v) => {
                  const st = STATUS[v.status] || { label: v.status || '—', cls: 'bg-dark-700 text-dark-300' }
                  return (
                    <tr key={v.id} className="border-b border-dark-800/60 hover:bg-dark-800/40">
                      <td className="px-4 py-2.5 font-semibold">{v.license_plate}</td>
                      <td className="px-4 py-2.5 text-dark-300">{[v.brand, v.model].filter(Boolean).join(' ') || '—'}</td>
                      <td className="px-4 py-2.5 text-dark-400">{v.center || '—'}</td>
                      <td className="px-4 py-2.5"><span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span></td>
                      <td className="px-4 py-2.5 text-dark-400">{v.mileage != null ? `${v.mileage.toLocaleString('es')} km` : '—'}</td>
                      <td className="px-4 py-2.5">{itvBadge(v.itv_date)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
