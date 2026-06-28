import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Upload, FileSpreadsheet, Loader2, AlertCircle, X, CheckCircle2,
  Download, RotateCcw, Plus, ChevronDown, ChevronUp, Trash2, FolderOpen,
} from 'lucide-react'
import { getToken } from '../auth'
import { getPlantillas, downloadPlantilla, deletePlantilla } from '../api'

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

/* ── Agrupar plantillas por mes ── */
function groupByMonth(plantillas) {
  const map = {}
  for (const p of plantillas) {
    // date: "dd/mm/yyyy" o "yyyy-mm-dd"
    let label = 'Sin fecha'
    try {
      const d = p.date?.includes('/') ? p.date : p.date?.split('-').reverse().join('/')
      const [, mm, yyyy] = (d || '').split('/')
      if (mm && yyyy) {
        const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
        label = `${names[parseInt(mm, 10) - 1] || mm} ${yyyy}`
      }
    } catch {}
    if (!map[label]) map[label] = []
    map[label].push(p)
  }
  return map
}

/* ── Historial de plantillas ── */
function Historial({ center }) {
  const [open,       setOpen]       = useState(false)
  const [plantillas, setPlantillas] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [deleting,   setDeleting]   = useState(null)
  const noCenter = !center || center === 'Todos'

  const load = useCallback(async () => {
    if (noCenter) return
    setLoading(true)
    try {
      const res = await getPlantillas(center)
      setPlantillas(Array.isArray(res.data) ? res.data : [])
    } catch { setPlantillas([]) }
    finally { setLoading(false) }
  }, [center, noCenter])

  useEffect(() => { if (open) load() }, [open, load])

  async function handleDownload(p) {
    try {
      const res = await downloadPlantilla(p.id)
      const url = URL.createObjectURL(res.data)
      const a   = document.createElement('a')
      a.href = url; a.download = p.filename || 'plantilla.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { alert(`Error al descargar: ${e.message}`) }
  }

  async function handleDelete(p) {
    if (!confirm(`¿Eliminar la plantilla del ${p.date}?`)) return
    setDeleting(p.id)
    try { await deletePlantilla(p.id); setPlantillas(ps => ps.filter(x => x.id !== p.id)) }
    catch (e) { alert(`Error: ${e.message}`) }
    finally { setDeleting(null) }
  }

  const grouped = groupByMonth(plantillas)

  return (
    <div className="mb-6 rounded-xl border border-dark-700 bg-dark-900/60">
      {/* Cabecera */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <FolderOpen size={16} className="text-brand-400" />
          <span className="text-sm font-semibold text-dark-100">Historial de plantillas</span>
          {!noCenter && (
            <span className="rounded-full bg-dark-700 px-2 py-0.5 text-[11px] text-dark-400">{center}</span>
          )}
        </div>
        {open ? <ChevronUp size={15} className="text-dark-500" /> : <ChevronDown size={15} className="text-dark-500" />}
      </button>

      {open && (
        <div className="border-t border-dark-700 px-4 pb-4 pt-3">
          {noCenter ? (
            <p className="text-sm text-dark-500">Selecciona un centro arriba para ver su historial.</p>
          ) : loading ? (
            <div className="flex items-center gap-2 py-4 text-dark-400">
              <Loader2 size={15} className="animate-spin" /> Cargando…
            </div>
          ) : plantillas.length === 0 ? (
            <p className="py-4 text-center text-sm text-dark-500">
              Aún no hay plantillas guardadas para <b>{center}</b>. Se guardarán automáticamente al descargar.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {Object.entries(grouped).map(([month, items]) => (
                <div key={month}>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-dark-400">{month}</div>
                  <div className="flex flex-col gap-1">
                    {items.map(p => (
                      <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-dark-800 bg-dark-900 px-3 py-2 hover:border-dark-700">
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-dark-100">{p.date}</span>
                          <span className="ml-2 text-xs text-dark-500">Semana {p.week}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            onClick={() => handleDownload(p)}
                            className="btn-ghost flex items-center gap-1 px-2 py-1 text-xs text-dark-300 hover:text-brand-300"
                          >
                            <Download size={13} /> Descargar
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            disabled={deleting === p.id}
                            className="btn-ghost p-1.5 text-dark-600 hover:text-red-400 disabled:opacity-40"
                          >
                            {deleting === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Componente principal ── */
export default function PlantillaGenerador() {
  const { center, centers } = useOutletContext()

  const [cortexList, setCortexList] = useState([])
  const [platList,   setPlatList]   = useState([])
  const [step,    setStep]    = useState('upload')
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState('')
  const [data,    setData]    = useState(null)
  const [redSet,     setRedSet]     = useState(new Set())
  const [yellowSet,  setYellowSet]  = useState(new Set())
  const [pinkSet,    setPinkSet]    = useState(new Set())
  const [markedSet,  setMarkedSet]  = useState(new Set()) // conductores sin batch / welcome

  // Colores de ola — pastel, uno por wave time distinta
  const WAVE_PALETTE_CSS = ['#DBEAFE', '#DCFCE7', '#FEF3C7', '#FFE4E6', '#EDE9FE', '#ECFDF5']
  const waveColorMap = useMemo(() => {
    if (!data?.rows) return {}
    const times = [...new Set(data.rows.map(r => (r.h_salida || '').trim()).filter(Boolean))].sort()
    return Object.fromEntries(times.map((t, i) => [t, WAVE_PALETTE_CSS[i % WAVE_PALETTE_CSS.length]]))
  }, [data])
  const refCortex = useRef()
  const refPlat   = useRef()

  const noCenter = !center || center === 'Todos'

  function addFiles(files, setter) {
    const items = Array.from(files).map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setter(prev => [...prev, ...items])
    setErr('')
  }
  function removeFile(idx, setter) { setter(prev => prev.filter((_, i) => i !== idx)) }

  function reset() {
    setCortexList([]); setPlatList([])
    setStep('upload'); setData(null)
    setRedSet(new Set()); setYellowSet(new Set()); setPinkSet(new Set()); setMarkedSet(new Set()); setErr('')
  }

  async function extraer() {
    if (!platList.length) return
    setLoading(true); setErr('')
    try {
      const fd = new FormData()
      platList.forEach(f => fd.append('plataforma', f.file))
      cortexList.forEach(f => fd.append('cortex', f.file))
      const resp = await apiFetch('/tools/plantilla-extraer', { method: 'POST', body: fd })
      const json = await resp.json()
      setData(json)
      setRedSet(new Set()); setYellowSet(new Set()); setPinkSet(new Set()); setMarkedSet(new Set())
      setStep('preview')
    } catch (e) { setErr(e?.message || 'Error desconocido') }
    setLoading(false)
  }

  async function descargar() {
    setLoading(true); setErr('')
    try {
      const resp = await apiFetch('/tools/plantilla-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows:          data.rows,
          red_routes:        [...redSet],
          yellow_routes:     [...yellowSet],
          pink_furgos:       [...pinkSet],
          marked_conductors: [...markedSet],
          week:          data.week,
          date:          data.date,
          // guardar en historial si hay centro seleccionado
          save:   !noCenter,
          center: noCenter ? '' : center,
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
    } catch (e) { setErr(e?.message || 'Error al generar Excel') }
    setLoading(false)
  }

  function toggle(set, setter, key) {
    setter(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  function editCell(rowIdx, field, value) {
    setData(prev => ({ ...prev, rows: prev.rows.map((r, i) => i === rowIdx ? { ...r, [field]: value } : r) }))
  }
  function editMeta(field, value) { setData(prev => ({ ...prev, [field]: value })) }
  function addRow() {
    setData(prev => ({
      ...prev,
      rows: [...prev.rows, { ruta: '', conductor: '', movil: '', furgo: '', h_salida: '', h_bajada: '', h_llegada: '', observaciones: '' }],
    }))
  }
  function removeRow(idx) { setData(prev => ({ ...prev, rows: prev.rows.filter((_, i) => i !== idx) })) }

  function isBlueRow(row) {
    const h = row.h_llegada || ''
    const [hh, mm] = h.split(':').map(Number)
    if (isNaN(hh) || isNaN(mm)) return false
    return hh > 11 || (hh === 11 && mm >= 50)
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <FileSpreadsheet size={20} className="text-brand-400" />
            Plantilla de turno
          </h1>
          <p className="mt-1 text-sm text-dark-400">
            Sube capturas → edita → marca colores → descarga Excel. Se guarda automáticamente en el historial.
          </p>
        </div>
        {step !== 'upload' && (
          <button onClick={reset} className="btn-ghost flex items-center gap-1.5 text-xs text-dark-400">
            <RotateCcw size={13} /> Nueva plantilla
          </button>
        )}
      </div>

      {/* ── Historial ── */}
      <Historial center={center} />

      {/* ── PASO 1: subir imágenes ── */}
      {step === 'upload' && (
        <>
          {/* Selector de modo */}
          <div className="mb-5 flex gap-2">
            <button
              onClick={() => { setCortexList([]); }}
              className={`flex-1 rounded-lg border px-4 py-3 text-left transition ${!cortexList.length ? 'border-brand-500 bg-brand-500/10' : 'border-dark-700 bg-dark-900/60 hover:border-dark-600'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-dark-100">Solo Plataforma</span>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">RÁPIDO</span>
              </div>
              <p className="text-xs text-dark-500">Genera la plantilla solo con furgos y conductores. Importa Cortex después manualmente.</p>
            </button>
            <button
              onClick={() => {}}
              className={`flex-1 rounded-lg border px-4 py-3 text-left transition ${cortexList.length ? 'border-brand-500 bg-brand-500/10' : 'border-dark-700 bg-dark-900/60 hover:border-dark-600'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-dark-100">Cortex + Plataforma</span>
                <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-semibold text-brand-400">COMPLETO</span>
              </div>
              <p className="text-xs text-dark-500">Cruce automático: rutas, horas de ola y conductores todo en uno.</p>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Plataforma — siempre requerida */}
            <MultiDropZone
              label="Plataforma — furgonetas"
              hint="Requerido · Puedes subir varias capturas"
              items={platList}
              onAdd={files => addFiles(files, setPlatList)}
              onRemove={i => removeFile(i, setPlatList)}
              inputRef={refPlat}
              required
            />
            {/* Cortex — opcional */}
            <MultiDropZone
              label="Cortex — rutas + hora salida"
              hint="Opcional · Añade para cruzar rutas automáticamente"
              items={cortexList}
              onAdd={files => addFiles(files, setCortexList)}
              onRemove={i => removeFile(i, setCortexList)}
              inputRef={refCortex}
              optional
            />
          </div>

          {/* Info según lo que hay subido */}
          {platList.length > 0 && !cortexList.length && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-300">
              <span className="shrink-0 mt-0.5">💡</span>
              <span>Se generará la plantilla con conductor + furgo + móvil. Las columnas <b>ruta y horas</b> quedarán vacías para rellenar manualmente o importar desde Cortex.</span>
            </div>
          )}
          {platList.length > 0 && cortexList.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-xs text-emerald-300">
              <span className="shrink-0 mt-0.5">✓</span>
              <span>Modo completo: se cruzarán rutas de Cortex con furgos de plataforma por nombre de conductor.</span>
            </div>
          )}

          {err && <ErrBanner msg={err} />}

          <div className="mt-5 flex items-center justify-between gap-4">
            {noCenter && (
              <p className="text-xs text-amber-400">⚠ Selecciona un centro arriba para guardar en el historial automáticamente.</p>
            )}
            <div className="ml-auto">
              <button
                onClick={extraer}
                disabled={!platList.length || loading}
                className="btn-primary flex items-center gap-2 disabled:opacity-40"
              >
                {loading
                  ? <><Loader2 size={16} className="animate-spin" /> Analizando…</>
                  : <><FileSpreadsheet size={16} /> {cortexList.length ? 'Extraer datos (completo)' : 'Extraer datos (plataforma)'}</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── PASO 2: tabla editable ── */}
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
            {/* Leyenda de colores */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-dark-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-flex gap-0.5">
                  {['#DBEAFE','#DCFCE7','#FEF3C7'].map((c,i) => (
                    <span key={i} className="h-3 w-3 rounded-sm border border-gray-300" style={{ background: c }} />
                  ))}
                </span>
                Horas por ola (auto)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-[#FFF2CC] border border-yellow-300" /> Amarillo fila = incidencia
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-red-500 border border-red-400" /> Rojo = no vino
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-pink-200 border border-pink-300" /> Rosa FURGO = especial
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-[#FCE4D6] border border-orange-200" /> Naranja nombre = sin batch
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-dark-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#FFD966] text-black">
                  {['RUTA','CONDUCTOR','MOVIL','FURGO','H. LLEGADA A NAVE','H. BAJADA AL YARD','H. WAVE','OBSERVACIONES','',''].map((h, i) => (
                    <th key={i} className="border border-[#BFBFBF] px-2 py-1.5 text-center font-bold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => {
                  const rowKey    = row.ruta || row.conductor || String(i)
                  const isRed     = redSet.has(rowKey)
                  const isYellow  = !isRed && yellowSet.has(rowKey)
                  const isPink    = pinkSet.has(row.furgo)
                  const isMarked  = markedSet.has(row.conductor)

                  // Color de fila base
                  const rowBg  = isRed ? 'bg-red-600' : isYellow ? 'bg-[#FFF2CC]' : 'bg-white'
                  const textCl = isRed ? 'text-white' : 'text-gray-900'

                  // Color de las celdas de hora según la ola (h_salida)
                  const waveColor = (!isRed && !isYellow && row.h_salida)
                    ? (waveColorMap[row.h_salida.trim()] || null)
                    : null

                  return (
                    <tr key={i} className={`border-t border-[#BFBFBF] ${rowBg}`}>
                      {/* RUTA */}
                      <td className="border border-[#BFBFBF] px-1 py-0.5">
                        <EditCell value={row.ruta} onChange={v => editCell(i, 'ruta', v)} extraCls={`text-center font-bold ${textCl}`} />
                      </td>

                      {/* CONDUCTOR — marcador a la izquierda */}
                      <td className={`border border-[#BFBFBF] px-1 py-0.5 ${isMarked && !isRed ? 'bg-[#FCE4D6]' : ''}`}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggle(markedSet, setMarkedSet, row.conductor)}
                            title="Marcar conductor (sin batch / necesita welcome)"
                            className={`h-3.5 w-3.5 shrink-0 rounded-sm border transition ${
                              isMarked
                                ? 'bg-orange-300 border-orange-500'
                                : 'border-gray-300 hover:border-orange-400'
                            }`}
                          />
                          <EditCell
                            value={row.conductor}
                            onChange={v => editCell(i, 'conductor', v)}
                            extraCls={`min-w-[140px] ${isMarked && !isRed ? 'text-orange-900 font-semibold' : textCl}`}
                          />
                        </div>
                      </td>

                      {/* MOVIL */}
                      <td className="border border-[#BFBFBF] px-1 py-0.5">
                        <EditCell value={row.movil} onChange={v => editCell(i, 'movil', v)} extraCls={`text-center ${textCl}`} />
                      </td>

                      {/* FURGO — clic en la celda para rosa */}
                      <td
                        className={`border border-[#BFBFBF] cursor-pointer px-1 py-0.5 ${isPink && !isRed ? 'bg-pink-200' : ''}`}
                        title="Clic para marcar furgo en rosa"
                        onClick={() => row.furgo && toggle(pinkSet, setPinkSet, row.furgo)}
                      >
                        <EditCell
                          value={row.furgo}
                          onChange={v => editCell(i, 'furgo', v)}
                          extraCls={`text-center font-mono ${isPink && !isRed ? 'text-pink-900' : textCl}`}
                          onClick={e => e.stopPropagation()}
                        />
                      </td>

                      {/* H. LLEGADA A NAVE — color de ola */}
                      <td className="border border-[#BFBFBF] px-1 py-0.5" style={waveColor ? { background: waveColor } : {}}>
                        <EditCell value={row.h_llegada} onChange={v => editCell(i, 'h_llegada', v)} extraCls={`text-center font-mono ${textCl}`} />
                      </td>

                      {/* H. BAJADA AL YARD — color de ola */}
                      <td className="border border-[#BFBFBF] px-1 py-0.5" style={waveColor ? { background: waveColor } : {}}>
                        <EditCell value={row.h_bajada} onChange={v => editCell(i, 'h_bajada', v)} extraCls={`text-center font-mono ${textCl}`} />
                      </td>

                      {/* H. WAVE — color de ola */}
                      <td className="border border-[#BFBFBF] px-1 py-0.5" style={waveColor ? { background: waveColor } : {}}>
                        <EditCell value={row.h_salida} onChange={v => editCell(i, 'h_salida', v)} extraCls={`text-center font-mono ${textCl}`} />
                      </td>

                      {/* OBSERVACIONES */}
                      <td className="border border-[#BFBFBF] px-1 py-0.5">
                        <EditCell value={row.observaciones} onChange={v => editCell(i, 'observaciones', v)} extraCls={`min-w-[100px] ${textCl}`} />
                      </td>

                      {/* Toggles amarillo + rojo */}
                      <td className="border border-[#BFBFBF] px-1 py-0.5">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => toggle(yellowSet, setYellowSet, rowKey)}
                            title="Marcar fila amarilla (incidencia)"
                            className={`h-3.5 w-3.5 rounded-sm border transition ${isYellow ? 'bg-yellow-300 border-yellow-500' : 'border-gray-300 hover:border-yellow-400'}`}
                          />
                          <button
                            onClick={() => toggle(redSet, setRedSet, rowKey)}
                            title="Marcar fila roja (no vino)"
                            className={`h-3.5 w-3.5 rounded-sm border transition ${isRed ? 'bg-red-500 border-red-300' : 'border-gray-300 hover:border-red-400'}`}
                          />
                        </div>
                      </td>

                      {/* Eliminar */}
                      <td className="border border-[#BFBFBF] px-1 py-0.5 text-center">
                        <button onClick={() => removeRow(i)} className="text-gray-400 hover:text-red-500 transition">
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

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-4 text-xs text-dark-500">
              {redSet.size > 0 && (
                <span><span className="font-semibold text-red-400">{redSet.size} en rojo:</span> {[...redSet].join(', ')}</span>
              )}
              {yellowSet.size > 0 && (
                <span><span className="font-semibold text-yellow-400">{yellowSet.size} en amarillo:</span> {[...yellowSet].join(', ')}</span>
              )}
              {pinkSet.size > 0 && (
                <span><span className="font-semibold text-pink-400">{pinkSet.size} furgo rosa:</span> {[...pinkSet].join(', ')}</span>
              )}
              {redSet.size === 0 && yellowSet.size === 0 && pinkSet.size === 0 && (
                <span>Sin marcas — {data.rows.length} conductores</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {noCenter && <span className="text-xs text-amber-400">⚠ Sin centro → no se guardará en historial</span>}
              <button
                onClick={descargar}
                disabled={loading}
                className="btn-primary flex items-center gap-2 disabled:opacity-40"
              >
                {loading
                  ? <><Loader2 size={16} className="animate-spin" /> Generando…</>
                  : <><Download size={16} /> Descargar{!noCenter ? ' y guardar' : ''}</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── PASO 3: descargado ── */}
      {step === 'done' && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-12 text-center">
          <CheckCircle2 size={36} className="text-emerald-400" />
          <p className="text-lg font-semibold text-emerald-300">Plantilla descargada{!noCenter ? ' y guardada' : ''}</p>
          {!noCenter && (
            <p className="text-sm text-dark-400">Disponible en el historial de <b className="text-dark-200">{center}</b>.</p>
          )}
          <button onClick={reset} className="btn-primary mt-2 flex items-center gap-2">
            <RotateCcw size={15} /> Generar otra plantilla
          </button>
        </div>
      )}
    </div>
  )
}

function EditCell({ value, onChange, extraCls, onClick }) {
  return (
    <input
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      onClick={onClick}
      className={[
        'w-full rounded bg-transparent px-1 py-0.5 focus:outline-none focus:bg-yellow-50 focus:ring-1 focus:ring-yellow-400/60 transition',
        extraCls || '',
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

function MultiDropZone({ label, hint, items, onAdd, onRemove, inputRef, optional, required }) {
  const [over, setOver] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-dark-200">{label}</p>
        {required && <span className="rounded-full bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-brand-400">requerido</span>}
        {optional && <span className="rounded-full bg-dark-700 px-1.5 py-0.5 text-[10px] text-dark-500">opcional</span>}
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((it, i) => (
            <div key={i} className="relative h-20 w-20 flex-shrink-0">
              <img src={it.preview} alt="" className="h-20 w-20 rounded-lg object-cover border border-dark-600" />
              <button onClick={() => onRemove(i)} className="absolute -right-1.5 -top-1.5 rounded-full bg-dark-700 p-0.5 text-dark-300 hover:text-white border border-dark-600">
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
        className={`flex h-20 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition ${over ? 'border-brand-400 bg-brand-500/10' : 'border-dark-600 bg-dark-900 hover:border-brand-500/50'}`}
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
