import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, Loader2, AlertCircle, X, CheckCircle2, Download, RotateCcw, Plus } from 'lucide-react'
import { getToken } from '../auth'

const API = import.meta.env.VITE_API_URL || 'https://flotadsp-backend.fly.dev/api'

async function apiFetch(path, opts = {}) {
  const resp = await fetch(`${API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${getToken()}`, ...(opts.headers || {}) },
  })
  if (!resp.ok) {
    let msg = `Error ${resp.status}`
    try { const j = await resp.json(); msg = j.detail || msg } catch {}
    throw new Error(msg)
  }
  return resp
}

export default function PlantillaGenerador() {
  const [cortexList, setCortexList] = useState([])   // [{file, preview}]
  const [platList,   setPlatList]   = useState([])
  const [step,    setStep]    = useState('upload')
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState('')
  const [data,    setData]    = useState(null)        // { week, date, rows }
  const [redSet,  setRedSet]  = useState(new Set())
  const refCortex = useRef()
  const refPlat   = useRef()

  function addFiles(files, setter) {
    const items = Array.from(files).map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setter(prev => [...prev, ...items])
    setErr('')
  }

  function removeFile(idx, setter) {
    setter(prev => prev.filter((_, i) => i !== idx))
  }

  function reset() {
    setCortexList([]); setPlatList([])
    setStep('upload'); setData(null)
    setRedSet(new Set()); setErr('')
  }

  async function extraer() {
    if (!cortexList.length || !platList.length) return
    setLoading(true); setErr('')
    try {
      const fd = new FormData()
      cortexList.forEach(f => fd.append('cortex', f.file))
      platList.forEach(f => fd.append('plataforma', f.file))
      const resp = await apiFetch('/tools/plantilla-extraer', { method: 'POST', body: fd })
      const json = await resp.json()
      setData(json)
      setRedSet(new Set())
      setStep('preview')
    } catch (e) {
      setErr(e?.message || 'Error desconocido')
    }
    setLoading(false)
  }

  async function descargar() {
    setLoading(true); setErr('')
    try {
      const resp = await apiFetch('/tools/plantilla-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: data.rows,
          red_routes: [...redSet],
          week: data.week,
          date: data.date,
        }),
      })
      const blob = await resp.blob()
      const cd   = resp.headers.get('Content-Disposition') || ''
      const m    = cd.match(/filename="?([^"]+)"?/)
      const name = m?.[1] || 'plantilla_turno.xlsx'
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = name; a.click()
      URL.revokeObjectURL(url)
      setStep('done')
    } catch (e) {
      setErr(e?.message || 'Error al generar Excel')
    }
    setLoading(false)
  }

  function toggleRed(ruta) {
    setRedSet(prev => {
      const next = new Set(prev)
      next.has(ruta) ? next.delete(ruta) : next.add(ruta)
      return next
    })
  }

  function editCell(rowIdx, field, value) {
    setData(prev => ({
      ...prev,
      rows: prev.rows.map((r, i) => i === rowIdx ? { ...r, [field]: value } : r),
    }))
  }

  function editMeta(field, value) {
    setData(prev => ({ ...prev, [field]: value }))
  }

  function addRow() {
    setData(prev => ({
      ...prev,
      rows: [...prev.rows, { ruta: '', conductor: '', movil: '', furgo: '', h_salida: '', h_bajada: '', h_llegada: '', observaciones: '' }],
    }))
  }

  function removeRow(idx) {
    setData(prev => ({ ...prev, rows: prev.rows.filter((_, i) => i !== idx) }))
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <FileSpreadsheet size={20} className="text-brand-400" />
            Generador de Plantilla de Turno
          </h1>
          <p className="mt-1 text-sm text-dark-400">
            Sube las capturas → edita si necesitas → marca rojos → descarga Excel.
          </p>
        </div>
        {step !== 'upload' && (
          <button onClick={reset} className="btn-ghost flex items-center gap-1.5 text-xs text-dark-400">
            <RotateCcw size={13} /> Nueva plantilla
          </button>
        )}
      </div>

      {/* PASO 1: subir imágenes */}
      {step === 'upload' && (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <MultiDropZone
              label="Cortex — rutas + hora salida"
              hint="Puedes subir varias capturas si no caben en una"
              items={cortexList}
              onAdd={(files) => addFiles(files, setCortexList)}
              onRemove={(i) => removeFile(i, setCortexList)}
              inputRef={refCortex}
            />
            <MultiDropZone
              label="Plataforma — furgonetas"
              hint="Puedes subir varias capturas si no caben en una"
              items={platList}
              onAdd={(files) => addFiles(files, setPlatList)}
              onRemove={(i) => removeFile(i, setPlatList)}
              inputRef={refPlat}
            />
          </div>

          {err && <ErrBanner msg={err} />}

          <div className="mt-6 flex justify-end">
            <button
              onClick={extraer}
              disabled={!cortexList.length || !platList.length || loading}
              className="btn-primary flex items-center gap-2 disabled:opacity-40"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Analizando…</>
                : <><FileSpreadsheet size={16} /> Extraer datos</>}
            </button>
          </div>

          <div className="mt-6 rounded-lg border border-dark-700 bg-dark-800/60 p-4 text-xs text-dark-400 space-y-1">
            <p className="font-semibold text-dark-300">¿Cómo funciona?</p>
            <p>· Sube <b className="text-dark-200">una o varias capturas</b> de Cortex y de la plataforma de furgonetas.</p>
            <p>· El sistema extrae todos los datos, cruza por nombre y calcula horas automáticamente.</p>
            <p>· Puedes <b className="text-dark-200">editar cualquier celda</b> antes de descargar el Excel.</p>
          </div>
        </>
      )}

      {/* PASO 2: tabla editable */}
      {step === 'preview' && data && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-dark-400">WEEK</span>
              <input
                value={data.week}
                onChange={e => editMeta('week', e.target.value)}
                className="w-16 rounded border border-dark-600 bg-dark-800 px-2 py-1 text-center text-xs font-bold text-brand-300 focus:outline-none focus:border-brand-500"
              />
              <span className="text-xs text-dark-400">Fecha</span>
              <input
                value={data.date}
                onChange={e => editMeta('date', e.target.value)}
                className="w-28 rounded border border-dark-600 bg-dark-800 px-2 py-1 text-center text-xs focus:outline-none focus:border-brand-500"
              />
            </div>
            <span className="text-xs text-dark-500">{data.rows.length} conductores · haz clic en fila para marcar rojo · edita directamente cualquier celda</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-dark-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-dark-800 text-dark-300">
                  {['RUTA','CONDUCTOR','MOVIL','FURGO','H. LLEGADA NAVE','H. BAJADA YARD','OBS','',''].map((h, i) => (
                    <th key={i} className="px-2 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => {
                  const isRed = redSet.has(row.ruta)
                  const rowBg = isRed
                    ? 'bg-red-500/15'
                    : i % 2 === 0 ? 'bg-dark-900' : 'bg-dark-850'
                  return (
                    <tr key={i} className={`border-t border-dark-700 ${rowBg}`}>
                      <td className="px-1 py-0.5">
                        <EditCell value={row.ruta} onChange={v => editCell(i, 'ruta', v)} bold accent />
                      </td>
                      <td className="px-1 py-0.5">
                        <EditCell value={row.conductor} onChange={v => editCell(i, 'conductor', v)} wide />
                      </td>
                      <td className="px-1 py-0.5">
                        <EditCell value={row.movil} onChange={v => editCell(i, 'movil', v)} placeholder="—" />
                      </td>
                      <td className="px-1 py-0.5">
                        <EditCell value={row.furgo} onChange={v => editCell(i, 'furgo', v)} mono />
                      </td>
                      <td className="px-1 py-0.5">
                        <EditCell value={row.h_llegada} onChange={v => editCell(i, 'h_llegada', v)} mono cyan center />
                      </td>
                      <td className="px-1 py-0.5">
                        <EditCell value={row.h_bajada} onChange={v => editCell(i, 'h_bajada', v)} mono cyan center />
                      </td>
                      <td className="px-1 py-0.5">
                        <EditCell value={row.observaciones} onChange={v => editCell(i, 'observaciones', v)} wide placeholder="…" />
                      </td>
                      <td className="px-1 py-0.5 text-center">
                        <button
                          onClick={() => toggleRed(row.ruta)}
                          title="Marcar/desmarcar rojo"
                          className={`h-4 w-4 rounded-full border transition ${isRed ? 'bg-red-400 border-red-300' : 'border-dark-500 hover:border-red-400'}`}
                        />
                      </td>
                      <td className="px-1 py-0.5 text-center">
                        <button
                          onClick={() => removeRow(i)}
                          className="text-dark-600 hover:text-red-400 transition"
                          title="Eliminar fila"
                        >
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-2">
            <button onClick={addRow} className="btn-ghost flex items-center gap-1.5 text-xs text-dark-400 hover:text-brand-300">
              <Plus size={13} /> Añadir fila
            </button>
          </div>

          {err && <ErrBanner msg={err} />}

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-dark-500">
              {redSet.size > 0
                ? <><span className="text-red-400 font-semibold">{redSet.size} rutas en rojo:</span> {[...redSet].join(', ')}</>
                : 'Sin rutas marcadas en rojo'}
            </p>
            <button
              onClick={descargar}
              disabled={loading}
              className="btn-primary flex items-center gap-2 disabled:opacity-40"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Generando…</>
                : <><Download size={16} /> Descargar Excel</>}
            </button>
          </div>
        </>
      )}

      {/* PASO 3: descargado */}
      {step === 'done' && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-12 text-center">
          <CheckCircle2 size={36} className="text-emerald-400" />
          <p className="text-lg font-semibold text-emerald-300">Plantilla descargada</p>
          <p className="text-sm text-dark-400">El archivo Excel está en tu carpeta de descargas.</p>
          <button onClick={reset} className="btn-primary mt-2 flex items-center gap-2">
            <RotateCcw size={15} /> Generar otra plantilla
          </button>
        </div>
      )}
    </div>
  )
}

function EditCell({ value, onChange, bold, accent, mono, cyan, center, wide, placeholder }) {
  return (
    <input
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder || ''}
      className={[
        'w-full rounded bg-transparent px-1.5 py-0.5 focus:outline-none focus:bg-dark-700 focus:ring-1 focus:ring-brand-500/50 transition',
        bold   ? 'font-bold' : '',
        accent ? 'text-brand-300' : '',
        mono   ? 'font-mono' : '',
        cyan   ? 'text-cyan-300' : '',
        center ? 'text-center' : '',
        wide   ? 'min-w-[120px]' : 'min-w-[60px]',
      ].join(' ')}
    />
  )
}

function ErrBanner({ msg }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">
      <AlertCircle size={15} className="mt-0.5 shrink-0" /> {msg}
    </div>
  )
}

function MultiDropZone({ label, hint, items, onAdd, onRemove, inputRef }) {
  const [over, setOver] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-dark-200">{label}</p>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((it, i) => (
            <div key={i} className="relative h-20 w-20 flex-shrink-0">
              <img src={it.preview} alt="" className="h-20 w-20 rounded-lg object-cover border border-dark-600" />
              <button
                onClick={() => onRemove(i)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-dark-700 p-0.5 text-dark-300 hover:text-white border border-dark-600"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); onAdd(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`flex h-20 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition
          ${over ? 'border-brand-400 bg-brand-500/10' : 'border-dark-600 bg-dark-900 hover:border-brand-500/50'}`}
      >
        <div className="flex items-center gap-2 text-dark-500">
          <Upload size={18} />
          <span className="text-xs">{items.length > 0 ? 'Añadir más capturas' : 'Arrastra o haz clic'}</span>
        </div>
        {items.length === 0 && <span className="mt-1 text-[10px] text-dark-600 text-center px-4">{hint}</span>}
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => onAdd(e.target.files)} />
      </div>
    </div>
  )
}
