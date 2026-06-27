import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, Loader2, AlertCircle, X, CheckCircle2 } from 'lucide-react'
import { getToken } from '../auth'

const API = import.meta.env.VITE_API_URL || 'https://flotadsp-backend.fly.dev/api'

export default function PlantillaGenerador() {
  const [cortex, setCortex] = useState(null)     // { file, preview }
  const [plat, setPlat]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const refCortex = useRef()
  const refPlat   = useRef()

  function pickFile(e, setter) {
    const f = e.target.files?.[0]
    if (!f) return
    setter({ file: f, preview: URL.createObjectURL(f) })
    setDone(false)
    setErr('')
  }

  function dropFile(e, setter) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    setter({ file: f, preview: URL.createObjectURL(f) })
    setDone(false)
    setErr('')
  }

  async function generar() {
    if (!cortex || !plat) return
    setLoading(true); setErr(''); setDone(false)
    try {
      const fd = new FormData()
      fd.append('cortex', cortex.file)
      fd.append('plataforma', plat.file)

      const resp = await fetch(`${API}/tools/plantilla-generar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      })

      if (!resp.ok) {
        let msg = `Error ${resp.status}`
        try { const j = await resp.json(); msg = j.detail || msg } catch {}
        throw new Error(msg)
      }

      const blob = await resp.blob()
      const cd = resp.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] || 'plantilla_turno.xlsx'

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
      setDone(true)
    } catch (e) {
      setErr(e?.message || 'Error desconocido')
    }
    setLoading(false)
  }

  const ready = cortex && plat && !loading

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <FileSpreadsheet size={20} className="text-brand-400" />
          Generador de Plantilla de Turno
        </h1>
        <p className="mt-1 text-sm text-dark-400">
          Sube 2 capturas de pantalla y la IA extrae los datos para generar el Excel del turno.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DropZone
          label="1 · Cortex (rutas / conductores)"
          hint="Captura de la lista de DAs con sus rutas"
          value={cortex}
          onFile={(e) => pickFile(e, setCortex)}
          onDrop={(e) => dropFile(e, setCortex)}
          onClear={() => setCortex(null)}
          inputRef={refCortex}
        />
        <DropZone
          label="2 · Plataforma (furgonetas)"
          hint="Captura de la asignación de furgonetas"
          value={plat}
          onFile={(e) => pickFile(e, setPlat)}
          onDrop={(e) => dropFile(e, setPlat)}
          onClear={() => setPlat(null)}
          inputRef={refPlat}
        />
      </div>

      {err && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {err}
        </div>
      )}

      {done && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 size={15} />
          Plantilla generada y descargada correctamente.
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={generar}
          disabled={!ready}
          className="btn-primary flex items-center gap-2 disabled:opacity-40"
        >
          {loading ? (
            <><Loader2 size={16} className="animate-spin" /> Analizando imágenes…</>
          ) : (
            <><FileSpreadsheet size={16} /> Generar plantilla Excel</>
          )}
        </button>
      </div>

      <div className="mt-8 rounded-lg border border-dark-700 bg-dark-800/60 p-4 text-xs text-dark-400 space-y-1">
        <p className="font-semibold text-dark-300">¿Cómo funciona?</p>
        <p>1. Gemini Vision lee ambas capturas de pantalla y extrae rutas, conductores y matrículas.</p>
        <p>2. Cruza los datos por nombre de conductor para asociar ruta + furgoneta.</p>
        <p>3. Genera el Excel con el formato estándar: WEEK · columnas color · filas alternadas.</p>
        <p className="text-amber-400/80">Solo extrae lo que está visible en las imágenes. No inventa datos.</p>
      </div>
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
          ${over ? 'border-brand-400 bg-brand-500/10' : value ? 'border-dark-600 bg-dark-800' : 'border-dark-600 bg-dark-900 hover:border-brand-500/50'}
        `}
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
            <span className="text-sm">Arrastra o haz clic para subir</span>
            <span className="text-xs">{hint}</span>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>
    </div>
  )
}
