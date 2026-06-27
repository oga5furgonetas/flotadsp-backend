import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, Loader2, AlertCircle, X, CheckCircle2, Download, RotateCcw } from 'lucide-react'
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
  const [cortex, setCortex] = useState(null)
  const [plat,   setPlat]   = useState(null)
  const [step,   setStep]   = useState('upload') // upload | preview | done
  const [loading, setLoading] = useState(false)
  const [err,    setErr]    = useState('')
  const [data,   setData]   = useState(null)   // { week, date, rows }
  const [redSet, setRedSet] = useState(new Set())
  const refCortex = useRef()
  const refPlat   = useRef()

  function pickFile(e, setter) {
    const f = e.target.files?.[0]
    if (!f) return
    setter({ file: f, preview: URL.createObjectURL(f) })
    setErr('')
  }

  function dropFile(e, setter) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    setter({ file: f, preview: URL.createObjectURL(f) })
    setErr('')
  }

  function reset() {
    setCortex(null); setPlat(null)
    setStep('upload'); setData(null)
    setRedSet(new Set()); setErr('')
  }

  async function extraer() {
    if (!cortex || !plat) return
    setLoading(true); setErr('')
    try {
      const fd = new FormData()
      fd.append('cortex', cortex.file)
      fd.append('plataforma', plat.file)
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
    setRedSet((prev) => {
      const next = new Set(prev)
      if (next.has(ruta)) next.delete(ruta)
      else next.add(ruta)
      return next
    })
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <FileSpreadsheet size={20} className="text-brand-400" />
            Generador de Plantilla de Turno
          </h1>
          <p className="mt-1 text-sm text-dark-400">
            Sube las 2 capturas → revisa y marca rutas en rojo → descarga el Excel.
          </p>
        </div>
        {step !== 'upload' && (
          <button onClick={reset} className="btn-ghost flex items-center gap-1.5 text-xs text-dark-400">
            <RotateCcw size={13} /> Volver a empezar
          </button>
        )}
      </div>

      {/* PASO 1: subir imágenes */}
      {step === 'upload' && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DropZone
              label="1 · Cortex — rutas + hora de salida"
              hint="Captura con la lista de DAs, rutas y horas"
              value={cortex}
              onFile={(e) => pickFile(e, setCortex)}
              onDrop={(e) => dropFile(e, setCortex)}
              onClear={() => setCortex(null)}
              inputRef={refCortex}
            />
            <DropZone
              label="2 · Plataforma — furgonetas"
              hint="Captura con la asignación DA → matrícula"
              value={plat}
              onFile={(e) => pickFile(e, setPlat)}
              onDrop={(e) => dropFile(e, setPlat)}
              onClear={() => setPlat(null)}
              inputRef={refPlat}
            />
          </div>

          {err && <ErrBanner msg={err} />}

          <div className="mt-6 flex justify-end">
            <button
              onClick={extraer}
              disabled={!cortex || !plat || loading}
              className="btn-primary flex items-center gap-2 disabled:opacity-40"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Analizando imágenes…</>
                : <><FileSpreadsheet size={16} /> Extraer datos</>}
            </button>
          </div>

          <div className="mt-6 rounded-lg border border-dark-700 bg-dark-800/60 p-4 text-xs text-dark-400 space-y-1">
            <p className="font-semibold text-dark-300">¿Cómo funciona?</p>
            <p>1. Gemini Vision lee las 2 capturas y extrae rutas, conductores, matrículas y horas.</p>
            <p>2. El sistema calcula: <b className="text-dark-200">Bajada al yard = hora Cortex − 10 min</b> · <b className="text-dark-200">Llegada a nave = hora Cortex − 30 min</b>.</p>
            <p>3. Revisas la tabla, marcas las rutas en rojo que necesites y descargas el Excel.</p>
            <p className="text-amber-400/80">Solo extrae datos claramente visibles. Nada inventado.</p>
          </div>
        </>
      )}

      {/* PASO 2: preview + selección rojos */}
      {step === 'preview' && data && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <span className="rounded-md bg-brand-500/20 px-2 py-1 text-xs font-semibold text-brand-300">
                WEEK {data.week} · {data.date}
              </span>
              <span className="ml-3 text-xs text-dark-400">{data.rows.length} conductores extraídos</span>
            </div>
            <p className="text-xs text-dark-500">Haz clic en una fila para marcarla en <span className="text-red-400">rojo</span></p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-dark-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-dark-800 text-dark-300">
                  {['RUTA','CONDUCTOR','MOVIL','FURGO','H. LLEGADA NAVE','H. BAJADA YARD','OBS'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                  ))}
                  <th className="px-3 py-2 text-center font-semibold">ROJO</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => {
                  const isRed = redSet.has(row.ruta)
                  return (
                    <tr
                      key={i}
                      onClick={() => toggleRed(row.ruta)}
                      className={`cursor-pointer border-t border-dark-700 transition-colors
                        ${isRed ? 'bg-red-500/15 hover:bg-red-500/20' : i % 2 === 0 ? 'bg-dark-900 hover:bg-dark-800' : 'bg-dark-850 hover:bg-dark-800'}`}
                    >
                      <td className="px-3 py-1.5 font-bold text-brand-300">{row.ruta || <Nil />}</td>
                      <td className="px-3 py-1.5">{row.conductor || <Nil />}</td>
                      <td className="px-3 py-1.5 text-dark-400">{row.movil || '—'}</td>
                      <td className="px-3 py-1.5 font-mono">{row.furgo || <Nil />}</td>
                      <td className="px-3 py-1.5 text-center font-mono text-cyan-300">{row.h_llegada || '—'}</td>
                      <td className="px-3 py-1.5 text-center font-mono text-cyan-300">{row.h_bajada  || '—'}</td>
                      <td className="px-3 py-1.5 text-dark-500">{row.observaciones || ''}</td>
                      <td className="px-3 py-1.5 text-center">
                        {isRed && <span className="inline-block h-3 w-3 rounded-full bg-red-400" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {err && <ErrBanner msg={err} />}

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-dark-500">
              {redSet.size > 0
                ? <><span className="text-red-400 font-semibold">{redSet.size} rutas en rojo</span>: {[...redSet].join(', ')}</>
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

function Nil() {
  return <span className="text-red-400/70 italic">sin dato</span>
}

function ErrBanner({ msg }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">
      <AlertCircle size={15} className="mt-0.5 shrink-0" />
      {msg}
    </div>
  )
}

function DropZone({ label, hint, value, onFile, onDrop, onClear, inputRef }) {
  const [over, setOver] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-dark-200">{label}</p>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { setOver(false); onDrop(e) }}
        onClick={() => !value && inputRef.current?.click()}
        className={`relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition
          ${over ? 'border-brand-400 bg-brand-500/10' : value ? 'border-dark-600 bg-dark-800' : 'border-dark-600 bg-dark-900 hover:border-brand-500/50'}`}
      >
        {value ? (
          <>
            <img src={value.preview} alt="preview" className="h-full max-h-[160px] w-full rounded-lg object-contain p-1" />
            <button
              onClick={(e) => { e.stopPropagation(); onClear() }}
              className="absolute right-2 top-2 rounded-full bg-dark-700 p-1 text-dark-300 hover:text-white"
            >
              <X size={13} />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-dark-500">
            <Upload size={28} />
            <span className="text-sm">Arrastra o haz clic</span>
            <span className="text-xs text-center px-4">{hint}</span>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>
    </div>
  )
}
