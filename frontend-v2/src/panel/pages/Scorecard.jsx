import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, Upload, Trophy, ChevronLeft, ChevronRight, Pencil, Check, X,
  TrendingUp, TrendingDown, Minus, RefreshCw, FileText, Trash2, Info,
  ChevronDown, ChevronUp, RotateCcw,
} from 'lucide-react'
import {
  getScorecardFull, setScorecardValue,
  getScorecardPredict, getScorecardDailyTrend,
  getScorecardSources, uploadScorecard,
  setScorecardThreshold, toggleScorecardEstimacion,
  resetScorecardWeek, deleteScorecardSource,
  calibrateScorecardThresholds,
} from '../api'

// ── Helpers ──────────────────────────────────────────────────────────────────
const TIER_CFG = {
  'Fantastic Plus': { bg: 'bg-emerald-500/20', text: 'text-emerald-300', ring: 'ring-emerald-500/40', dot: 'bg-emerald-400' },
  'Fantastic':      { bg: 'bg-green-500/20',   text: 'text-green-300',   ring: 'ring-green-500/40',   dot: 'bg-green-400' },
  'Great':          { bg: 'bg-yellow-500/20',  text: 'text-yellow-300',  ring: 'ring-yellow-500/30',  dot: 'bg-yellow-400' },
  'Fair':           { bg: 'bg-orange-500/20',  text: 'text-orange-300',  ring: 'ring-orange-500/30',  dot: 'bg-orange-400' },
  'Poor':           { bg: 'bg-red-500/20',     text: 'text-red-300',     ring: 'ring-red-500/30',     dot: 'bg-red-400' },
  'At Risk':        { bg: 'bg-red-500/20',     text: 'text-red-300',     ring: 'ring-red-500/30',     dot: 'bg-red-400' },
}
const tierCfg = (t) => TIER_CFG[t] || { bg: 'bg-dark-800', text: 'text-dark-500', ring: 'ring-dark-700', dot: 'bg-dark-600' }

const SRC_CFG = {
  oficial:  { cls: 'bg-emerald-500/15 text-emerald-400', label: 'Oficial Amazon' },
  resumen:  { cls: 'bg-purple-500/15 text-purple-400',   label: 'Resumen semanal' },
  ratios:   { cls: 'bg-cyan-500/15 text-cyan-400',       label: 'Ratios diarios' },
  manual:   { cls: 'bg-brand-500/15 text-brand-400',     label: 'Manual' },
  estimado: { cls: 'bg-amber-500/15 text-amber-400',     label: 'Estimado' },
}

const GROUP_CFG = {
  safety:   { label: 'Seguridad y Cumplimiento', weight: '40%', color: 'text-blue-300' },
  quality:  { label: 'Calidad',                  weight: '30%', color: 'text-brand-300' },
  capacity: { label: 'Capacidad',                weight: '30%', color: 'text-purple-300' },
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function fmtVal(v, unit) {
  if (v == null) return '—'
  if (unit === '%') return `${Number(v).toFixed(2)}%`
  if (unit === 'DPMO') return Number(v).toLocaleString('es-ES')
  if (unit === 'ratio') return Number(v).toFixed(2)
  return String(v)
}

// ── TierBadge ─────────────────────────────────────────────────────────────────
function TierBadge({ tier, size = 'sm' }) {
  const cfg = tierCfg(tier)
  if (!tier) return <span className="text-xs text-dark-600">Sin datos</span>
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${cfg.bg} ${cfg.text} ${cfg.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {tier}
    </span>
  )
}

// ── MetricRow ─────────────────────────────────────────────────────────────────
function MetricRow({ m, weekSun, center, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef()

  function startEdit() {
    setVal(m.value != null ? String(m.value) : '')
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function save() {
    setBusy(true)
    try {
      await setScorecardValue({ center, week: weekSun, key: m.key, value: val === '' ? null : Number(val) })
      setEditing(false)
      onSaved()
    } catch { /* silent */ }
    finally { setBusy(false) }
  }

  const cfg = tierCfg(m.tier)
  const src = SRC_CFG[m.source]
  const next = m.next

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dark-800 bg-dark-900 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-dark-200">{m.label}</div>
        {next && (
          <div className="mt-0.5 text-[10px] text-dark-500">
            Falta <span className="text-orange-400">{next.gap} {m.unit}</span> para {next.to_tier.fantastic || next.to_tier.great || next.to_tier.fair}
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            className="w-20 rounded border border-dark-600 bg-dark-800 px-1.5 py-0.5 text-center text-xs focus:outline-none focus:border-brand-500"
          />
          <button onClick={save} disabled={busy} className="text-emerald-400 hover:text-emerald-300">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          </button>
          <button onClick={() => setEditing(false)} className="text-dark-500 hover:text-dark-300"><X size={12} /></button>
        </div>
      ) : (
        <button
          onClick={startEdit}
          title="Editar valor a mano"
          className={`group flex items-center gap-1 rounded px-2 py-0.5 text-xs font-mono font-semibold transition hover:bg-dark-800 ${m.value != null ? cfg.text : 'text-dark-600'}`}
        >
          {fmtVal(m.value, m.unit)}
          <Pencil size={10} className="opacity-0 group-hover:opacity-60" />
        </button>
      )}

      <TierBadge tier={m.tier} />
      {src && <span className={`hidden rounded px-1.5 py-0.5 text-[10px] sm:inline ${src.cls}`}>{src.label}</span>}
    </div>
  )
}

// ── CategoryCard ──────────────────────────────────────────────────────────────
function CategoryCard({ groupKey, tier, metrics }) {
  const cfg = GROUP_CFG[groupKey]
  const tc = tierCfg(tier)
  const filled = metrics.filter(m => m.value != null).length
  return (
    <div className={`rounded-xl border p-4 ${tc.ring ? `ring-1 ${tc.ring}` : ''} border-dark-800 bg-dark-900`}>
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</span>
        <span className="text-[10px] text-dark-500">{cfg.weight} peso</span>
      </div>
      <TierBadge tier={tier} />
      <div className="mt-2 text-[10px] text-dark-600">{filled}/{metrics.length} métricas con dato</div>
    </div>
  )
}

// ── DailyTrendTable ───────────────────────────────────────────────────────────
function DailyTrendTable({ trend }) {
  if (!trend?.dias?.length) return (
    <p className="text-xs text-dark-500">Sin datos diarios esta semana. Sube el Excel de Cortex para verlo aquí.</p>
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-dark-400">
            <th className="pb-1 text-left">Día</th>
            <th className="pb-1 text-right">DCR día</th>
            <th className="pb-1 text-right">DCR acum.</th>
            <th className="pb-1 text-right">DNR DPMO</th>
            <th className="pb-1 text-right">POD día</th>
            <th className="pb-1 text-right">POD acum.</th>
            <th className="pb-1 text-right">Entreg.</th>
          </tr>
        </thead>
        <tbody>
          {trend.dias.map((d, i) => (
            <tr key={i} className="border-t border-dark-800">
              <td className="py-1 text-dark-300">{fmtDate(d.fecha)}</td>
              <td className={`py-1 text-right font-mono ${d.dia.dcr != null ? (d.dia.dcr >= 98 ? 'text-green-400' : d.dia.dcr >= 96 ? 'text-yellow-400' : 'text-red-400') : 'text-dark-600'}`}>
                {d.dia.dcr != null ? `${d.dia.dcr.toFixed(2)}%` : '—'}
              </td>
              <td className={`py-1 text-right font-mono font-semibold ${d.acum.dcr != null ? (d.acum.dcr >= 98 ? 'text-green-300' : d.acum.dcr >= 96 ? 'text-yellow-300' : 'text-red-300') : 'text-dark-600'}`}>
                {d.acum.dcr != null ? `${d.acum.dcr.toFixed(2)}%` : '—'}
              </td>
              <td className={`py-1 text-right font-mono ${d.acum.dnr_dpmo != null ? (d.acum.dnr_dpmo <= 1500 ? 'text-green-400' : d.acum.dnr_dpmo <= 2500 ? 'text-yellow-400' : 'text-red-400') : 'text-dark-600'}`}>
                {d.acum.dnr_dpmo != null ? d.acum.dnr_dpmo.toLocaleString('es-ES') : '—'}
              </td>
              <td className={`py-1 text-right font-mono ${d.dia.pod != null ? (d.dia.pod >= 97 ? 'text-green-400' : d.dia.pod >= 94 ? 'text-yellow-400' : 'text-red-400') : 'text-dark-600'}`}>
                {d.dia.pod != null ? `${d.dia.pod.toFixed(2)}%` : '—'}
              </td>
              <td className={`py-1 text-right font-mono font-semibold ${d.acum.pod != null ? (d.acum.pod >= 97 ? 'text-green-300' : d.acum.pod >= 94 ? 'text-yellow-300' : 'text-red-300') : 'text-dark-600'}`}>
                {d.acum.pod != null ? `${d.acum.pod.toFixed(2)}%` : '—'}
              </td>
              <td className="py-1 text-right text-dark-400">{d.dia.entregados?.toLocaleString('es-ES') || '—'}</td>
            </tr>
          ))}
        </tbody>
        {trend.acumulado && (
          <tfoot>
            <tr className="border-t-2 border-dark-700 font-semibold">
              <td className="pt-1 text-dark-300">Acumulado</td>
              <td />
              <td className={`pt-1 text-right font-mono ${(trend.acumulado.dcr || 0) >= 98 ? 'text-green-300' : 'text-yellow-300'}`}>
                {trend.acumulado.dcr != null ? `${trend.acumulado.dcr.toFixed(2)}%` : '—'}
              </td>
              <td className={`pt-1 text-right font-mono ${(trend.acumulado.dnr_dpmo || 9999) <= 1500 ? 'text-green-300' : 'text-yellow-300'}`}>
                {trend.acumulado.dnr_dpmo != null ? trend.acumulado.dnr_dpmo.toLocaleString('es-ES') : '—'}
              </td>
              <td />
              <td className={`pt-1 text-right font-mono ${(trend.acumulado.pod || 0) >= 97 ? 'text-green-300' : 'text-yellow-300'}`}>
                {trend.acumulado.pod != null ? `${trend.acumulado.pod.toFixed(2)}%` : '—'}
              </td>
              <td className="pt-1 text-right text-dark-400">{trend.acumulado.entregados?.toLocaleString('es-ES') || '—'}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ── BaremosEditor ─────────────────────────────────────────────────────────────
function BaremosEditor({ full, center, onSaved }) {
  const [vals, setVals] = useState({})
  const [busy, setBusy] = useState(null)
  const [calibBusy, setCalibBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function calibrate() {
    setCalibBusy(true); setMsg(null)
    try {
      const r = await calibrateScorecardThresholds(center)
      setMsg({ ok: true, t: `Baremos calibrados desde ${r.data.desde_scorecards} scorecard(s): ${r.data.calibradas.join(', ')}` })
      onSaved()
    } catch (e) {
      setMsg({ ok: false, t: e?.response?.data?.detail || 'Error al calibrar.' })
    } finally { setCalibBusy(false) }
  }

  useEffect(() => {
    if (!full?.metrics) return
    const init = {}
    for (const m of full.metrics) {
      if (m.thr) init[m.key] = { fantastic: m.thr.fantastic ?? '', great: m.thr.great ?? '', fair: m.thr.fair ?? '' }
    }
    setVals(init)
  }, [full])

  async function save(key) {
    setBusy(key); setMsg(null)
    const v = vals[key] || {}
    try {
      await setScorecardThreshold({ center, key, fantastic: Number(v.fantastic), great: Number(v.great), fair: Number(v.fair) })
      setMsg({ ok: true, t: `Baremos de ${key} guardados.` })
      onSaved()
    } catch (e) {
      setMsg({ ok: false, t: e?.response?.data?.detail || 'Error guardando baremos.' })
    } finally { setBusy(null) }
  }

  if (!full?.metrics) return null
  const groups = ['safety', 'quality', 'capacity']
  return (
    <div>
      {msg && <div className={`mb-3 rounded-lg px-3 py-2 text-xs ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.t}</div>}

      {/* Calibración automática */}
      <div className="mb-4 flex items-start justify-between gap-4 rounded-lg border border-brand-500/20 bg-brand-500/5 px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-brand-300">Calibrar automáticamente desde tus scorecards</p>
          <p className="mt-0.5 text-[11px] text-dark-500">
            Sube primero el PDF de la scorecard oficial de Amazon (semana pasada). El sistema lee los valores reales y los tiers que Amazon te asignó, y ajusta los umbrales de {center} para que coincidan exactamente.
          </p>
        </div>
        <button onClick={calibrate} disabled={calibBusy}
          className="shrink-0 flex items-center gap-1.5 rounded-lg bg-brand-500/20 px-3 py-1.5 text-xs font-semibold text-brand-300 hover:bg-brand-500/30 disabled:opacity-50">
          {calibBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Calibrar
        </button>
      </div>

      <p className="mb-4 text-xs text-dark-500">
        O ajusta manualmente fila por fila. Los umbrales se guardan solo para {center}.
      </p>
      {groups.map(g => {
        const gm = full.metrics.filter(m => m.group === g)
        if (!gm.length) return null
        return (
          <div key={g} className="mb-5">
            <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${GROUP_CFG[g].color}`}>{GROUP_CFG[g].label}</div>
            <div className="space-y-1">
              {gm.map(m => {
                const v = vals[m.key] || { fantastic: '', great: '', fair: '' }
                const isBusy = busy === m.key
                return (
                  <div key={m.key} className="flex flex-wrap items-center gap-2 rounded border border-dark-800 bg-dark-900 px-3 py-1.5">
                    <span className="w-48 shrink-0 text-xs text-dark-300">{m.label}</span>
                    <span className="text-[10px] text-dark-600">{m.unit}</span>
                    {['fantastic', 'great', 'fair'].map(band => (
                      <div key={band} className="flex items-center gap-1">
                        <span className="text-[10px] text-dark-500 capitalize">{band === 'fantastic' ? 'Fantastic' : band === 'great' ? 'Great' : 'Fair'}</span>
                        <input
                          type="number"
                          step="0.01"
                          value={v[band]}
                          onChange={e => setVals(s => ({ ...s, [m.key]: { ...v, [band]: e.target.value } }))}
                          className="w-20 rounded border border-dark-700 bg-dark-800 px-1.5 py-0.5 text-center text-xs focus:outline-none focus:border-brand-500"
                        />
                      </div>
                    ))}
                    <button onClick={() => save(m.key)} disabled={isBusy}
                      className="ml-auto flex items-center gap-1 rounded bg-brand-500/20 px-2 py-0.5 text-xs text-brand-300 hover:bg-brand-500/30 disabled:opacity-50">
                      {isBusy ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Guardar
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Scorecard() {
  const { center } = useOutletContext()
  const fileRef = useRef()
  const noCenter = center === 'Todos'

  const [weekSun, setWeekSun] = useState(null)
  const [full, setFull] = useState(null)
  const [predict, setPredict] = useState(null)
  const [trend, setTrend] = useState(null)
  const [sources, setSources] = useState([])
  const [loadingFull, setLoadingFull] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [showBaremos, setShowBaremos] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)

  const loadFull = useCallback(async (c, w) => {
    if (!c || c === 'Todos') return
    setLoadingFull(true)
    try {
      const [rf, rp, rt, rs] = await Promise.allSettled([
        getScorecardFull(c, w || undefined),
        getScorecardPredict(c, w || undefined),
        getScorecardDailyTrend(c, w || undefined),
        getScorecardSources(c, w || undefined),
      ])
      if (rf.status === 'fulfilled') {
        setFull(rf.value.data)
        if (!w) setWeekSun(rf.value.data.week)
      }
      if (rp.status === 'fulfilled') setPredict(rp.value.data)
      if (rt.status === 'fulfilled') setTrend(rt.value.data)
      if (rs.status === 'fulfilled') setSources(rs.value.data?.items || [])
    } catch {}
    finally { setLoadingFull(false) }
  }, [])

  useEffect(() => {
    setFull(null); setPredict(null); setTrend(null); setSources([])
    setWeekSun(null); setMsg(null)
    loadFull(center, null)
  }, [center, loadFull])

  function reload() { loadFull(center, weekSun) }

  function navWeek(dir) {
    const next = addDays(weekSun, dir * 7)
    setWeekSun(next)
    loadFull(center, next)
  }

  async function onUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadBusy(true); setMsg(null)
    try {
      const r = await uploadScorecard(file, center)
      setMsg({ ok: true, t: r.data?.mensaje || `${r.data?.tipo || 'archivo'} subido correctamente.` })
      reload()
    } catch (err) {
      setMsg({ ok: false, t: err?.response?.data?.detail || 'No se pudo subir el archivo.' })
    } finally { setUploadBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function doReset() {
    setResetBusy(true); setMsg(null)
    try {
      await resetScorecardWeek({ center, week: weekSun })
      setMsg({ ok: true, t: `Semana ${weekSun} reiniciada.` })
      setConfirmReset(false)
      reload()
    } catch { setMsg({ ok: false, t: 'Error al reiniciar la semana.' }) }
    finally { setResetBusy(false) }
  }

  async function toggleEstimacion(on) {
    try {
      await toggleScorecardEstimacion({ center, week: weekSun, on })
      reload()
    } catch {}
  }

  async function deleteSource(kind, ref) {
    try {
      await deleteScorecardSource(center, kind, ref, weekSun)
      reload()
    } catch {}
  }

  if (noCenter) return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Scorecard</h1>
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <Trophy size={30} className="text-brand-400" />
        <p className="text-dark-200">Elige un centro arriba para ver su scorecard.</p>
      </div>
    </div>
  )

  const overallCfg = tierCfg(full?.overall)
  const metrics = full?.metrics || []
  const byGroup = (g) => metrics.filter(m => m.group === g)

  return (
    <div className="mx-auto max-w-5xl space-y-5">

      {/* Header + Week nav */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Scorecard · {center}</h1>
          {full && <p className="text-xs text-dark-500">{fmtDate(full.desde)} – {fmtDate(full.hasta)} · W{full.week_num}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navWeek(-1)} className="btn-ghost p-1.5"><ChevronLeft size={16} /></button>
          <span className="text-sm text-dark-300">{weekSun ? `W${full?.week_num || '?'}` : '—'}</span>
          <button onClick={() => navWeek(1)} className="btn-ghost p-1.5"><ChevronRight size={16} /></button>
          <button onClick={reload} disabled={loadingFull} className="btn-ghost p-1.5" title="Recargar">
            {loadingFull ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
        </div>
      </div>

      {msg && <div className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.t}</div>}

      {loadingFull && !full && (
        <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> Cargando scorecard…</div>
      )}

      {full && (
        <>
          {/* Overall tier banner */}
          <div className={`rounded-xl border p-5 ${overallCfg.ring ? `ring-1 ${overallCfg.ring}` : ''} border-dark-800`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-dark-500">Resultado global</div>
                <div className="flex items-center gap-3">
                  <span className={`text-3xl font-bold ${overallCfg.text}`}>{full.overall || 'Sin datos'}</span>
                  {full.overall_score != null && (
                    <span className={`text-xl font-semibold ${overallCfg.text}`}>{Number(full.overall_score).toFixed(2)}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-dark-500 max-w-md">{full.overall_method}</p>
              </div>
              <div className="flex gap-3">
                {['safety', 'quality', 'capacity'].map(g => (
                  <CategoryCard key={g} groupKey={g} tier={full[`${g}_tier`]} metrics={byGroup(g)} />
                ))}
              </div>
            </div>
            {/* Options bar */}
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-dark-800 pt-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-dark-400">
                <input type="checkbox"
                  checked={!!full.estimacion_on}
                  onChange={e => toggleEstimacion(e.target.checked)}
                  className="accent-brand-500"
                />
                Proyectar con última scorecard conocida (rellena Safety/Capacity)
              </label>
              {!full.has_official && (
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <Info size={11} /> Sin scorecard oficial esta semana
                </span>
              )}
              {full.has_official && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
                  Scorecard oficial cargada
                </span>
              )}
              {confirmReset ? (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-red-300">¿Borrar todos los datos de la semana?</span>
                  <button onClick={doReset} disabled={resetBusy} className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300 hover:bg-red-500/30">
                    {resetBusy ? <Loader2 size={11} className="animate-spin" /> : 'Sí, reiniciar'}
                  </button>
                  <button onClick={() => setConfirmReset(false)} className="text-xs text-dark-400 hover:text-dark-200">Cancelar</button>
                </div>
              ) : (
                <button onClick={() => setConfirmReset(true)} className="ml-auto flex items-center gap-1 text-xs text-dark-500 hover:text-red-400">
                  <RotateCcw size={11} /> Reiniciar semana
                </button>
              )}
            </div>
          </div>

          {/* Metrics + Prediction side by side */}
          <div className="grid gap-5 lg:grid-cols-3">
            {/* Metrics (2/3) */}
            <div className="space-y-4 lg:col-span-2">
              {['safety', 'quality', 'capacity'].map(g => {
                const gm = byGroup(g)
                if (!gm.length) return null
                const gc = GROUP_CFG[g]
                return (
                  <div key={g} className="card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${gc.color}`}>{gc.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-dark-500">{gc.weight} del score total</span>
                        <TierBadge tier={full[`${g}_tier`]} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {gm.map(m => (
                        <MetricRow key={m.key} m={m} weekSun={full.week} center={center} onSaved={reload} />
                      ))}
                    </div>
                    {g === 'safety' && (
                      <p className="mt-2 text-[10px] text-dark-600">
                        Seguridad se actualiza con la scorecard PDF semanal. Edita a mano si tienes los valores de Amazon.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Prediction panel (1/3) */}
            <div className="space-y-4">
              {predict && (
                <div className="card p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <TrendingUp size={14} className="text-brand-400" />
                    <span className="text-sm font-semibold">Predicción semanal</span>
                  </div>
                  {predict.predicted_tier || predict.predicted_score != null ? (
                    <>
                      {/* Score exacto + tier */}
                      <div className="mb-3 rounded-lg border border-dark-700 bg-dark-950 px-4 py-3 text-center">
                        {predict.predicted_score != null && (
                          <div className={`text-3xl font-bold tabular-nums ${tierCfg(predict.predicted_tier).text}`}>
                            {Number(predict.predicted_score).toFixed(2)}
                          </div>
                        )}
                        <div className="mt-1">
                          <TierBadge tier={predict.predicted_tier} />
                        </div>
                        {predict.gap_to_next != null && predict.next_tier && (
                          <div className="mt-2 text-xs text-amber-400">
                            Te faltan <span className="font-bold">{Number(predict.gap_to_next).toFixed(2)} puntos</span> para <span className="font-semibold">{predict.next_tier}</span>
                          </div>
                        )}
                        {predict.predicted_tier === 'Fantastic Plus' && (
                          <div className="mt-2 text-xs text-emerald-400 font-semibold">¡Ya estás en Fantastic Plus!</div>
                        )}
                      </div>

                      {/* Cobertura y fuentes */}
                      <div className="mb-3 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-dark-800">
                          <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${predict.confidence}%` }} />
                        </div>
                        <span className="text-[10px] text-dark-400">{predict.confidence}% datos reales</span>
                      </div>
                      <p className="text-[10px] text-dark-500">
                        {predict.cobertura_peso}% del peso cubierto ·{' '}
                        {predict.fuentes?.join(', ') || 'sin datos'}
                        {predict.estimado_desde && ` · Safety/Capacity estimados de W${predict.estimado_desde}`}
                      </p>

                      {predict.empeoran?.length > 0 && (
                        <div className="mt-3">
                          <div className="mb-1 text-[10px] font-semibold text-red-400">Arrastrando hacia abajo</div>
                          {predict.empeoran.map((e, i) => (
                            <div key={i} className="flex items-center justify-between gap-1 text-xs">
                              <span className="truncate text-dark-400">{e.label}</span>
                              <div className="flex shrink-0 items-center gap-1">
                                <TierBadge tier={e.tier} />
                                {e.value != null && <span className="text-[10px] text-dark-500 font-mono">{fmtVal(e.value, e.unit)}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {predict.faltan_datos?.length > 0 && (
                        <div className="mt-2">
                          <div className="mb-1 text-[10px] font-semibold text-dark-500">Sin datos ({predict.faltan_datos.length})</div>
                          {predict.faltan_datos.slice(0, 4).map((f, i) => (
                            <div key={i} className="text-[10px] text-dark-600">· {f}</div>
                          ))}
                          {predict.faltan_datos.length > 4 && <div className="text-[10px] text-dark-600">y {predict.faltan_datos.length - 4} más…</div>}
                        </div>
                      )}

                      {predict.delta_anterior && (
                        <div className="mt-3 border-t border-dark-800 pt-2 flex items-center gap-2 text-[10px] text-dark-500">
                          Semana anterior W{predict.delta_anterior.week}:
                          <TierBadge tier={predict.delta_anterior.tier} />
                          {predict.delta_anterior.score != null && <span className="font-mono">{Number(predict.delta_anterior.score).toFixed(2)}</span>}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-dark-500 space-y-1">
                      <p>Sin datos suficientes para calcular el score.</p>
                      <p className="text-dark-600">Sube el PDF de la scorecard oficial, el resumen semanal o el Excel de ratios diarios de Cortex.</p>
                    </div>
                  )}
                </div>
              )}

              {/* "To improve" list */}
              {full.to_improve?.length > 0 && (
                <div className="card p-4">
                  <div className="mb-2 text-xs font-semibold text-dark-200">Qué mejorar primero</div>
                  <div className="space-y-1.5">
                    {full.to_improve.slice(0, 6).map((m, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-dark-400">{m.label}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          <TierBadge tier={m.tier} />
                          {m.next && <span className="text-orange-400 text-[10px]">+{m.next.gap}{' '}{m.next.to_tier?.fantastic ? 'F' : 'G'}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Daily trend */}
          <div className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Minus size={14} className="text-brand-400" />
              <span className="text-sm font-semibold">Evolución diaria (Calidad)</span>
              <span className="text-xs text-dark-500">· acumulado de lunes a hoy</span>
            </div>
            <DailyTrendTable trend={trend} />
          </div>
        </>
      )}

      {/* Upload section */}
      <div className="card p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-dark-200"><Upload size={15} /> Subir datos de {center}</div>
        <p className="mb-3 text-xs text-dark-400">
          Acepta 4 tipos de archivo del portal Amazon:
          <span className="ml-1 text-dark-300">PDF (scorecard oficial semanal)</span>,{' '}
          <span className="text-dark-300">Excel/CSV (Descripción general = ratios diarios, o Resumen de entregas)</span>,{' '}
          <span className="text-dark-300">HTML (reporte diario de la estación)</span>.
          El sistema detecta el tipo solo.
        </p>
        <input ref={fileRef} type="file" accept=".pdf,.html,.htm,.xlsx,.xls,.xlsm,.csv" onChange={onUpload} className="hidden" id="sc-upload" />
        <label htmlFor="sc-upload" className="btn-primary inline-flex cursor-pointer items-center gap-2 disabled:opacity-50">
          {uploadBusy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          {uploadBusy ? 'Subiendo…' : 'Elegir archivo'}
        </label>

        {/* Sources list */}
        {sources.length > 0 && (
          <div className="mt-4">
            <button onClick={() => setShowSources(s => !s)}
              className="flex items-center gap-1 text-xs text-dark-400 hover:text-dark-200">
              {showSources ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {sources.length} archivos cargados esta semana
            </button>
            {showSources && (
              <div className="mt-2 space-y-1">
                {sources.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-dark-400">
                    <FileText size={12} className="text-dark-600 shrink-0" />
                    <span className="flex-1 truncate">{s.label}</span>
                    <span className="text-dark-600 shrink-0">{s.detalle}</span>
                    <button onClick={() => deleteSource(s.kind, s.ref)} className="text-dark-700 hover:text-red-400 shrink-0">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Baremos (thresholds) */}
      <div className="card p-5">
        <button
          onClick={() => setShowBaremos(s => !s)}
          className="flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-dark-200">
            <Trophy size={15} /> Baremos (umbrales) de {center}
          </div>
          {showBaremos ? <ChevronUp size={15} className="text-dark-500" /> : <ChevronDown size={15} className="text-dark-500" />}
        </button>
        {showBaremos && (
          <div className="mt-4 border-t border-dark-800 pt-4">
            <BaremosEditor full={full} center={center} onSaved={reload} />
          </div>
        )}
      </div>
    </div>
  )
}
