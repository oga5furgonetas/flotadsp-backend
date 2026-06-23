import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, Search, Truck, X, Wrench, User, Camera, Save, CheckCircle2, CalendarClock,
} from 'lucide-react'
import {
  getVehicles, getLastInspections, getVehicleDriver, getVehicleInspections, updateVehicle,
} from '../api'

const STATUS = {
  active: { label: 'Activa', cls: 'bg-emerald-500/15 text-emerald-400' },
  taller: { label: 'En taller', cls: 'bg-orange-500/15 text-orange-400' },
  baja: { label: 'Baja', cls: 'bg-dark-700 text-dark-300' },
}
const daysTo = (d) => (d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null)

function itvBadge(itv) {
  const d = daysTo(itv)
  if (d == null) return <span className="text-[11px] text-dark-600">—</span>
  if (d < 0) return <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] text-red-400">ITV vencida</span>
  if (d <= 30) return <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-400">ITV {d}d</span>
  return <span className="text-[11px] text-dark-500">ITV {itv}</span>
}
// semáforo última inspección
function lastInspDot(date) {
  if (!date) return { cls: 'bg-dark-600', txt: 'nunca' }
  const d = Math.floor((new Date() - new Date(date)) / 86400000)
  if (d <= 7) return { cls: 'bg-emerald-400', txt: `hace ${d}d` }
  if (d <= 30) return { cls: 'bg-amber-400', txt: `hace ${d}d` }
  return { cls: 'bg-red-400', txt: `hace ${d}d` }
}

export default function Vehiculos() {
  const { center } = useOutletContext()
  const [vehicles, setVehicles] = useState(null)
  const [lastInsp, setLastInsp] = useState({})
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)

  function load() {
    setVehicles(null); setErr('')
    getVehicles(center).then((r) => setVehicles(r.data || [])).catch(() => setErr('No se pudieron cargar los vehículos.'))
    getLastInspections().then((r) => setLastInsp(r.data || {})).catch(() => {})
  }
  useEffect(load, [center])

  const list = useMemo(() => (vehicles || []).filter((v) => {
    if (!q) return true
    const s = q.toLowerCase()
    return [v.license_plate, v.brand, v.model, v.center].some((x) => (x || '').toLowerCase().includes(s))
  }), [vehicles, q])

  const kpis = useMemo(() => {
    const vs = vehicles || []
    return {
      total: vs.length,
      taller: vs.filter((v) => v.status === 'taller').length,
      itv: vs.filter((v) => { const d = daysTo(v.itv_date); return d != null && d <= 30 }).length,
      sinInsp: vs.filter((v) => !lastInsp[v.id]).length,
    }
  }, [vehicles, lastInsp])

  if (err) return <p className="text-red-400">{err}</p>

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Vehículos {vehicles && <span className="text-dark-500">· {list.length}</span>}</h1>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input className="input w-64 pl-9" placeholder="Buscar matrícula, marca…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {/* KPIs */}
      {vehicles && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card p-3"><div className="text-2xl font-extrabold">{kpis.total}</div><div className="text-xs text-dark-400">En flota{center !== 'Todos' && ` · ${center}`}</div></div>
          <div className="card p-3"><div className="text-2xl font-extrabold text-orange-400">{kpis.taller}</div><div className="text-xs text-dark-400">En taller</div></div>
          <div className="card p-3"><div className="text-2xl font-extrabold text-amber-400">{kpis.itv}</div><div className="text-xs text-dark-400">ITV ≤ 30 días</div></div>
          <div className="card p-3"><div className="text-2xl font-extrabold text-red-400">{kpis.sinInsp}</div><div className="text-xs text-dark-400">Sin inspección</div></div>
        </div>
      )}

      {!vehicles ? (
        <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> Cargando…</div>
      ) : list.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center text-dark-400"><Truck size={28} /> Sin vehículos {center !== 'Todos' && `en ${center}`}.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-800 text-left text-xs uppercase tracking-wide text-dark-500">
                  <th className="px-4 py-2.5">Matrícula</th><th className="px-4 py-2.5">Vehículo</th><th className="px-4 py-2.5">Centro</th>
                  <th className="px-4 py-2.5">Estado</th><th className="px-4 py-2.5">Km</th><th className="px-4 py-2.5">Última insp.</th><th className="px-4 py-2.5">ITV</th>
                </tr>
              </thead>
              <tbody>
                {list.map((v) => {
                  const st = STATUS[v.status] || { label: v.status || '—', cls: 'bg-dark-700 text-dark-300' }
                  const dot = lastInspDot(lastInsp[v.id])
                  return (
                    <tr key={v.id} onClick={() => setSel(v)} className="cursor-pointer border-b border-dark-800/60 hover:bg-dark-800/40">
                      <td className="px-4 py-2.5 font-semibold">{v.license_plate}</td>
                      <td className="px-4 py-2.5 text-dark-300">{[v.brand, v.model].filter(Boolean).join(' ') || '—'}</td>
                      <td className="px-4 py-2.5 text-dark-400">{v.center || '—'}</td>
                      <td className="px-4 py-2.5"><span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span></td>
                      <td className="px-4 py-2.5 text-dark-400">{v.mileage != null ? `${v.mileage.toLocaleString('es')} km` : '—'}</td>
                      <td className="px-4 py-2.5"><span className="flex items-center gap-1.5 text-xs text-dark-400"><span className={`h-2 w-2 rounded-full ${dot.cls}`} /> {dot.txt}</span></td>
                      <td className="px-4 py-2.5">{itvBadge(v.itv_date)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sel && <VehicleDetail vehicle={sel} onClose={() => setSel(null)} onSaved={load} />}
    </div>
  )
}

function VehicleDetail({ vehicle, onClose, onSaved }) {
  const [driver, setDriver] = useState(undefined)
  const [insps, setInsps] = useState(null)
  const [edit, setEdit] = useState({ status: vehicle.status || 'active', itv_date: vehicle.itv_date || '', mileage: vehicle.mileage ?? '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    getVehicleDriver(vehicle.id).then((r) => setDriver(r.data?.driver || null)).catch(() => setDriver(null))
    getVehicleInspections(vehicle.id).then((r) => setInsps(r.data || [])).catch(() => setInsps([]))
  }, [vehicle.id])

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const body = { status: edit.status }
      if (edit.itv_date) body.itv_date = edit.itv_date
      if (edit.mileage !== '' && edit.mileage != null) body.mileage = Number(edit.mileage)
      await updateVehicle(vehicle.id, body)
      setMsg({ ok: true, t: 'Guardado.' }); onSaved?.()
    } catch { setMsg({ ok: false, t: 'No se pudo guardar.' }) } finally { setBusy(false) }
  }

  const Field = ({ k, val }) => (
    <div><div className="text-[11px] text-dark-500">{k}</div><div className="font-medium">{val || '—'}</div></div>
  )

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-dark-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div><h2 className="text-lg font-bold">{vehicle.license_plate}</h2><div className="text-sm text-dark-400">{[vehicle.brand, vehicle.model].filter(Boolean).join(' ')}</div></div>
          <button onClick={onClose} className="btn-ghost p-2"><X size={18} /></button>
        </div>

        {/* Ficha */}
        <div className="card grid grid-cols-2 gap-3 p-4 text-sm">
          <Field k="Centro" val={vehicle.center} />
          <Field k="VIN" val={vehicle.vin} />
          <Field k="Color" val={vehicle.color} />
          <Field k="Año" val={vehicle.year} />
          <Field k="Proveedor" val={vehicle.provider} />
          <Field k="Tipo" val={vehicle.vehicle_type} />
          <Field k="Bolsas" val={vehicle.bags_remaining} />
          <Field k="Fin renting" val={vehicle.renting_end_date} />
        </div>

        {/* Conductor asignado */}
        <div className="card mt-3 flex items-center gap-2 p-4 text-sm">
          <User size={16} className="text-dark-500" />
          {driver === undefined ? <Loader2 size={14} className="animate-spin text-dark-400" /> :
            driver ? <span><b>{driver.name}</b>{driver.center ? ` · ${driver.center}` : ''}</span> : <span className="text-dark-500">Sin conductor asignado</span>}
        </div>

        {/* Editar */}
        <div className="card mt-3 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-dark-200"><Wrench size={15} /> Editar</div>
          {msg && <div className={`mb-2 text-sm ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.t}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Estado</label><select className="select" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Activa</option><option value="taller">En taller</option><option value="baja">Baja</option></select></div>
            <div><label className="label">Km</label><input type="number" className="input" value={edit.mileage} onChange={(e) => setEdit({ ...edit, mileage: e.target.value })} /></div>
            <div className="col-span-2"><label className="label">Caducidad ITV</label><input type="date" className="input" value={edit.itv_date} onChange={(e) => setEdit({ ...edit, itv_date: e.target.value })} /></div>
          </div>
          <button onClick={save} disabled={busy} className="btn-primary mt-3 flex items-center gap-2 disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar</button>
        </div>

        {/* Inspecciones recientes */}
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-dark-200"><Camera size={15} /> Inspecciones {insps && `· ${insps.length}`}</div>
          {!insps ? <Loader2 size={14} className="animate-spin text-dark-400" /> :
            insps.length === 0 ? <div className="card p-4 text-center text-sm text-dark-500">Sin inspecciones.</div> : (
              <div className="card divide-y divide-dark-800">
                {insps.slice(0, 10).map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="text-dark-400">{(i.created_at || '').slice(0, 16).replace('T', ' ')}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${i.analysis?.severity === 'grave' || i.analysis?.severity === 'critico' ? 'bg-red-500/15 text-red-300' : i.analysis?.severity === 'moderado' ? 'bg-orange-500/15 text-orange-300' : i.analysis?.severity === 'leve' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{i.analysis?.severity || i.analysis_status || '—'}</span>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
