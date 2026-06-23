import { useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, FileUp, Truck, Info } from 'lucide-react'
import { importVehicles } from '../api'

export default function Importaciones() {
  const { center } = useOutletContext()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setMsg(null)
    try {
      const r = await importVehicles(file, center)
      const d = r.data || {}
      setMsg({ ok: true, t: `Importado: ${d.creados ?? d.created ?? d.importados ?? 0} nuevos, ${d.actualizados ?? d.updated ?? 0} actualizados${center !== 'Todos' ? ` (centro ${center})` : ''}.` })
    } catch (err) {
      setMsg({ ok: false, t: err?.response?.data?.detail || 'No se pudo importar el archivo.' })
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold"><FileUp size={20} /> Importaciones</h1>
      {msg && <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.t}</div>}

      <div className="card p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-dark-200"><Truck size={16} /> Importar vehículos (flota)</div>
        <p className="mb-3 text-sm text-dark-400">Sube un Excel/CSV con tu flota. Se crean/actualizan los vehículos {center !== 'Todos' ? <>del centro <b>{center}</b></> : '(usa el filtro de centro arriba para asignarlos)'}.</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" id="imp-file" />
        <label htmlFor="imp-file" className="btn-primary inline-flex cursor-pointer items-center gap-2">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />} Elegir archivo
        </label>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-dark-500"><Info size={13} className="mt-0.5 shrink-0" /> Columnas típicas: matrícula, marca, modelo, VIN, centro, ITV, fin de renting. Se detectan automáticamente.</p>
      </div>
    </div>
  )
}
