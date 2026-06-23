import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Save, ClipboardList, Truck, User, Plus, Trash2, Check, Calendar } from 'lucide-react'
import { getDailyAssignment, putDailyAssignment, getVehicles, getDrivers } from '../api'

function isoToday() { return new Date().toISOString().slice(0, 10) }

export default function Asignacion() {
  const { center, centers } = useOutletContext()
  const [date, setDate] = useState(isoToday())
  const [slots, setSlots] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const noCenter = center === 'Todos'

  const load = useCallback(async () => {
    if (noCenter) return
    setLoading(true); setMsg(null)
    try {
      const [da, vs, ds] = await Promise.all([
        getDailyAssignment(center, date),
        getVehicles(center),
        getDrivers(center),
      ])
      setVehicles(vs.data || [])
      setDrivers(ds.data || [])
      // El backend devuelve array; cogemos el doc del centro/día (puede no existir)
      const doc = Array.isArray(da.data) ? da.data[0] : da.data
      setSlots(Array.isArray(doc?.slots) ? doc.slots : [])
    } catch { setMsg({ ok: false, t: 'No se pudo cargar.' }) } finally { setLoading(false) }
  }, [center, date, noCenter])
  useEffect(() => { load() }, [load])

  const usedV = useMemo(() => new Set(slots.map((s) => s.vehicle_id).filter(Boolean)), [slots])
  const usedD = useMemo(() => new Set(slots.map((s) => s.driver_id).filter(Boolean)), [slots])
  const vehFree = vehicles.filter((v) => v.status !== 'baja')
  const driverFree = drivers

  function setSlot(i, patch) { setSlots((arr) => arr.map((s, k) => (k === i ? { ...s, ...patch } : s))) }
  function addRow() { setSlots((s) => [...s, { vehicle_id: '', vehicle_plate: '', driver_id: '', driver_name: '' }]) }
  function delRow(i) { setSlots((s) => s.filter((_, k) => k !== i)) }
  function pickVehicle(i, id) { const v = vehicles.find((x) => x.id === id); setSlot(i, { vehicle_id: id, vehicle_plate: v?.license_plate || '' }) }
  function pickDriver(i, id) { const d = drivers.find((x) => x.id === id); setSlot(i, { driver_id: id, driver_name: d?.name || '' }) }

  async function save() {
    // saneado: descarta filas vacías
    const clean = slots.filter((s) => s.vehicle_id || s.driver_id)
    setBusy(true); setMsg(null)
    try {
      await putDailyAssignment({ center, date, slots: clean })
      setSlots(clean)
      setMsg({ ok: true, t: 'Cuadrante guardado. Los conductores solo podrán subir fotos de su vehículo asignado hoy.' })
    } catch { setMsg({ ok: false, t: 'No se pudo guardar.' }) } finally { setBusy(false) }
  }

  function autoFill() {
    // empareja vehículos sin asignar con conductores libres del mismo centro
    const next = [...slots]
    const freeV = vehFree.filter((v) => !next.some((s) => s.vehicle_id === v.id))
    const freeD = driverFree.filter((d) => !next.some((s) => s.driver_id === d.id))
    const n = Math.min(freeV.length, freeD.length)
    for (let i = 0; i < n; i++) {
      next.push({ vehicle_id: freeV[i].id, vehicle_plate: freeV[i].license_plate, driver_id: freeD[i].id, driver_name: freeD[i].name })
    }
    setSlots(next)
  }

  if (noCenter) {
    return (
      <div>
        <h1 className="mb-4 text-xl font-bold">Asignación diaria</h1>
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <ClipboardList size={30} className="text-brand-400" />
          <p className="text-dark-200">Elige un centro arriba para gestionar su cuadrante del día.</p>
          <p className="text-sm text-dark-500">Disponibles: {centers?.join(' · ') || '—'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Asignación diaria · {center}</h1>
          <p className="text-sm text-dark-400">Quién lleva qué furgoneta hoy. Solo podrán subir fotos de su vehículo asignado.</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-dark-500" />
          <input type="date" className="input w-44 py-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {msg && <div className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.t}</div>}

      {loading ? <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> Cargando…</div> : (
        <>
          <div className="card overflow-hidden">
            <div className="grid grid-cols-12 gap-2 border-b border-dark-800 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-dark-500">
              <div className="col-span-5 flex items-center gap-1"><Truck size={11} /> Vehículo</div>
              <div className="col-span-6 flex items-center gap-1"><User size={11} /> Conductor</div>
              <div className="col-span-1" />
            </div>
            {slots.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-dark-500">Sin asignaciones para hoy. Pulsa <b>+ Añadir</b> o <b>Autocompletar</b>.</div>
            ) : slots.map((s, i) => {
              const dupV = s.vehicle_id && slots.filter((x) => x.vehicle_id === s.vehicle_id).length > 1
              const dupD = s.driver_id && slots.filter((x) => x.driver_id === s.driver_id).length > 1
              return (
                <div key={i} className="grid grid-cols-12 items-center gap-2 border-b border-dark-800/60 px-3 py-2">
                  <div className="col-span-5">
                    <select className={`select w-full ${dupV ? 'border-red-500' : ''}`} value={s.vehicle_id} onChange={(e) => pickVehicle(i, e.target.value)}>
                      <option value="">— vehículo —</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id} disabled={usedV.has(v.id) && v.id !== s.vehicle_id}>{v.license_plate} · {[v.brand, v.model].filter(Boolean).join(' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-6">
                    <select className={`select w-full ${dupD ? 'border-red-500' : ''}`} value={s.driver_id} onChange={(e) => pickDriver(i, e.target.value)}>
                      <option value="">— conductor —</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id} disabled={usedD.has(d.id) && d.id !== s.driver_id}>{d.name}{d.email ? ` · ${d.email}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button onClick={() => delRow(i)} className="btn-ghost p-1.5 text-red-400" title="Quitar"><Trash2 size={14} /></button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={addRow} className="btn-secondary flex items-center gap-1.5 text-sm"><Plus size={14} /> Añadir fila</button>
            <button onClick={autoFill} className="btn-secondary flex items-center gap-1.5 text-sm"><Check size={14} /> Autocompletar libres</button>
            <button onClick={save} disabled={busy} className="btn-primary ml-auto flex items-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar cuadrante
            </button>
          </div>

          <p className="mt-3 text-[11px] text-dark-500">El conductor abre el Portal Conductor con su email; solo verá <b>su</b> furgoneta del día y podrá subirle fotos.</p>
        </>
      )}
    </div>
  )
}
