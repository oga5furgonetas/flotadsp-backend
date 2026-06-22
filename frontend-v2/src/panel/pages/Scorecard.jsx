import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Upload, Save, Trophy, FileText, Info } from 'lucide-react'
import { getScorecardTargets, setScorecardTargets, getScorecardStandings, getScorecardSources, uploadScorecard } from '../api'

// Las 6 métricas oficiales del scorecard (Amazon DSP)
const METRICS = [
  { key: 'dcr', label: 'DCR · Entregas completadas', unit: '%', better: 'alto' },
  { key: 'pod', label: 'POD · Foto en entrega', unit: '%', better: 'alto' },
  { key: 'cc', label: 'CC · Contact Compliance', unit: '%', better: 'alto' },
  { key: 'fdds', label: 'FDDS · Entrega a tiempo', unit: '%', better: 'alto' },
  { key: 'dnr_dpmo', label: 'DNR · No recibidos', unit: 'DPMO', better: 'bajo' },
  { key: 'rts_pct', label: 'RTS · Devueltos a estación', unit: '%', better: 'bajo' },
]

export default function Scorecard() {
  const { center, centers } = useOutletContext()
  const fileRef = useRef(null)
  const [targets, setTargets] = useState(null)
  const [defaults, setDefaults] = useState({})
  const [edited, setEdited] = useState({})
  const [standings, setStandings] = useState(null)
  const [sources, setSources] = useState([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)

  const noCenter = center === 'Todos'

  const load = useCallback(() => {
    if (noCenter) return
    getScorecardTargets(center).then((r) => { setTargets(r.data.targets); setDefaults(r.data.default || {}); setEdited(r.data.targets) }).catch(() => setMsg({ ok: false, t: 'No se pudieron cargar los baremos.' }))
    getScorecardStandings(center).then((r) => setStandings(r.data)).catch(() => {})
    getScorecardSources(center).then((r) => setSources(r.data?.items || r.data || [])).catch(() => setSources([]))
  }, [center, noCenter])

  useEffect(() => { setTargets(null); setStandings(null); setSources([]); setMsg(null); load() }, [load])

  async function onUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy('upload'); setMsg(null)
    try {
      const r = await uploadScorecard(file, center)
      setMsg({ ok: true, t: `Subido (${r.data?.tipo || 'scorecard'}) para ${center}. ${r.data?.detalle || ''}` })
      load()
    } catch (err) {
      setMsg({ ok: false, t: err?.response?.data?.detail || 'No se pudo subir el archivo.' })
    } finally { setBusy(''); if (fileRef.current) fileRef.current.value = '' }
  }

  async function saveTargets() {
    setBusy('targets'); setMsg(null)
    try {
      await setScorecardTargets({ center, ...edited })
      setMsg({ ok: true, t: `Baremos de ${center} guardados.` })
      setTargets(edited)
    } catch { setMsg({ ok: false, t: 'No se pudieron guardar los baremos.' }) } finally { setBusy('') }
  }

  if (noCenter) {
    return (
      <div>
        <h1 className="mb-4 text-xl font-bold">Scorecard</h1>
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <Trophy size={30} className="text-brand-400" />
          <p className="text-dark-200">Elige un centro arriba para ver y subir su scorecard.</p>
          <p className="text-sm text-dark-500">Cada centro tiene sus <b>propios baremos</b>. Disponibles: {centers?.join(' · ') || '—'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Scorecard · {center}</h1>
      </div>

      {msg && <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.t}</div>}

      {/* Subir scorecard del centro */}
      <div className="card mb-5 p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-dark-200"><Upload size={16} /> Subir scorecard de {center}</div>
        <p className="mb-3 text-sm text-dark-400">PDF de la scorecard oficial, reporte diario (HTML) o ratios (Excel/CSV). Se guarda <b>solo para {center}</b>.</p>
        <input ref={fileRef} type="file" accept=".pdf,.html,.htm,.xlsx,.xls,.xlsm,.csv" onChange={onUpload} className="hidden" id="sc-file" />
        <label htmlFor="sc-file" className="btn-primary inline-flex cursor-pointer items-center gap-2">
          {busy === 'upload' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Elegir archivo
        </label>

        {sources?.length > 0 && (
          <div className="mt-4 space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-dark-500">Cargado esta semana</div>
            {sources.slice(0, 8).map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-dark-300"><FileText size={13} className="text-dark-500" /> {s.label} <span className="text-dark-500">· {s.detalle}</span></div>
            ))}
          </div>
        )}
        {standings?.total != null && (
          <div className="mt-3 text-xs text-dark-500">Total registros importados de {center}: {standings.total} · semanas: {Object.keys(standings.semanas || {}).length}</div>
        )}
      </div>

      {/* Baremos del centro */}
      <div className="card p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-dark-200"><Trophy size={16} /> Baremos de {center}</div>
        <p className="mb-4 flex items-center gap-1.5 text-sm text-dark-400"><Info size={13} /> Objetivos propios de este centro. El scoring usa estos umbrales.</p>
        {!targets ? (
          <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> Cargando baremos…</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {METRICS.map((m) => (
                <div key={m.key}>
                  <label className="label">{m.label}</label>
                  <div className="flex items-center gap-2">
                    <input type="number" step="0.1" className="input"
                      value={edited[m.key] ?? ''}
                      onChange={(e) => setEdited((s) => ({ ...s, [m.key]: e.target.value === '' ? null : Number(e.target.value) }))} />
                    <span className="text-xs text-dark-500">{m.unit}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-dark-600">{m.better === 'alto' ? 'mayor = mejor' : 'menor = mejor'} · def. {defaults[m.key]}</div>
                </div>
              ))}
            </div>
            <button onClick={saveTargets} disabled={busy === 'targets'} className="btn-primary mt-4 flex items-center gap-2">
              {busy === 'targets' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar baremos de {center}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
