import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT } from '../../i18n'
import {
  Loader2, Upload, Trophy, ChevronLeft, ChevronRight, Pencil, Check, X,
  TrendingUp, TrendingDown, Minus, RefreshCw, FileText, Trash2, Info,
  ChevronDown, ChevronUp, RotateCcw, ExternalLink, BookOpen, AlertCircle,
} from 'lucide-react'
import {
  getScorecardFull, setScorecardValue,
  getScorecardPredict, getScorecardDailyTrend,
  getScorecardSources, uploadScorecard,
  setScorecardThreshold, toggleScorecardEstimacion,
  resetScorecardWeek, deleteScorecardSource,
  calibrateScorecardThresholds,
  resetScorecardThresholds,
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
  oficial:  { cls: 'bg-emerald-500/15 text-emerald-400', labelKey: 'sc.src.oficial' },
  resumen:  { cls: 'bg-purple-500/15 text-purple-400',   labelKey: 'sc.src.resumen' },
  ratios:   { cls: 'bg-cyan-500/15 text-cyan-400',       labelKey: 'sc.src.ratios' },
  manual:   { cls: 'bg-brand-500/15 text-brand-400',     labelKey: 'sc.src.manual' },
  estimado: { cls: 'bg-amber-500/15 text-amber-400',     labelKey: 'sc.src.estimado' },
}

const GROUP_CFG = {
  safety:   { labelKey: 'sc.group.safety',   weight: '40%', color: 'text-blue-300' },
  quality:  { labelKey: 'sc.group.quality',  weight: '30%', color: 'text-brand-300' },
  capacity: { labelKey: 'sc.group.capacity', weight: '30%', color: 'text-purple-300' },
}

// Dónde encontrar cada métrica en el portal de Amazon DSP
// Cada entrada: { tipo, archivo, pasos, url? }
// tipo: pdf | cortex | mentor | compliance
const FUENTE_METRICA = {
  // Safety & Compliance
  fico:     { tipo: 'mentor',     archivo: 'Station Performance Report',      pasos: ['Amazon Mentor', 'Station Reports', 'Selecciona tu estación', 'Export → Excel/CSV'] },
  speeding: { tipo: 'mentor',     archivo: 'Station Performance Report',      pasos: ['Amazon Mentor', 'Station Reports', 'Selecciona tu estación', 'Export → Excel/CSV'] },
  mentor:   { tipo: 'mentor',     archivo: 'Station Performance Report',      pasos: ['Amazon Mentor', 'Station Reports', 'Selecciona tu estación', 'Export → Excel/CSV'] },
  vsa:      { tipo: 'pdf',        archivo: 'Scorecard PDF oficial semanal',   pasos: ['DSP Portal', 'Performance', 'Scorecard', 'Descargar PDF de la semana'] },
  whc:      { tipo: 'compliance', archivo: 'Scorecard PDF o Compliance',      pasos: ['DSP Portal', 'Compliance', 'Working Hours Compliance'] },
  cas:      { tipo: 'pdf',        archivo: 'Scorecard PDF oficial semanal',   pasos: ['DSP Portal', 'Performance', 'Scorecard', 'Descargar PDF de la semana'] },
  boc:      { tipo: 'pdf',        archivo: 'Scorecard PDF oficial semanal',   pasos: ['DSP Portal', 'Performance', 'Scorecard', 'Solo disponible en el PDF'] },
  // Quality
  dcr:      { tipo: 'cortex',     archivo: 'Resumen de entregas o Descripción general', pasos: ['DSP Portal', 'Cortex', 'Delivery overview / Descripción general', 'Export → Excel o CSV'] },
  dnr_dpmo: { tipo: 'cortex',     archivo: 'Resumen de entregas o Descripción general', pasos: ['DSP Portal', 'Cortex', 'Delivery overview / Resumen de entregas', 'Export → Excel o CSV'] },
  lor_dpmo: { tipo: 'cortex',     archivo: 'Descripción general (Cortex)',    pasos: ['DSP Portal', 'Cortex', 'Delivery overview', 'Export → Excel/CSV (columna "Lost on Road")'] },
  dsc_dpmo: { tipo: 'cortex',     archivo: 'Descripción general (Cortex)',    pasos: ['DSP Portal', 'Cortex', 'Delivery overview', 'Export → Excel/CSV (columna "DSC")'] },
  cec_dpmo: { tipo: 'pdf',        archivo: 'Scorecard PDF o sección Escalaciones', pasos: ['DSP Portal', 'Performance', 'Scorecard PDF', 'O: Customer Contact Escalations → Export'] },
  cdf:      { tipo: 'pdf',        archivo: 'Scorecard PDF oficial semanal',   pasos: ['DSP Portal', 'Performance', 'Scorecard PDF', 'Valor visible en el PDF de la semana'] },
  pod:      { tipo: 'cortex',     archivo: 'Resumen de entregas o Descripción general', pasos: ['DSP Portal', 'Cortex', 'Delivery overview', 'Export → Excel/CSV (columna "POD")'] },
  cc:       { tipo: 'pdf',        archivo: 'Scorecard PDF oficial semanal',   pasos: ['DSP Portal', 'Performance', 'Scorecard PDF', 'Solo disponible en el PDF'] },
  // Capacity
  ndcr:     { tipo: 'pdf',        archivo: 'Scorecard PDF o Capacity Planning', pasos: ['DSP Portal', 'Performance', 'Scorecard PDF', 'O: Capacity → Same-day standing'] },
}

const TIPO_CFG = {
  pdf:        { dot: 'bg-emerald-400', label: 'PDF Scorecard', cls: 'text-emerald-400' },
  cortex:     { dot: 'bg-cyan-400',    label: 'Cortex Excel',  cls: 'text-cyan-400' },
  mentor:     { dot: 'bg-purple-400',  label: 'Mentor',        cls: 'text-purple-400' },
  compliance: { dot: 'bg-orange-400',  label: 'Compliance',    cls: 'text-orange-400' },
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
function TierBadge({ tier }) {
  const cfg = tierCfg(tier)
  if (!tier) return <span className="text-xs text-dark-600">Sin datos</span>
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${cfg.bg} ${cfg.text} ${cfg.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {tier}
    </span>
  )
}

// ── MetricSourceTooltip ────────────────────────────────────────────────────────
function MetricSourceTooltip({ metricKey }) {
  const [show, setShow] = useState(false)
  const guide = FUENTE_METRICA[metricKey]
  if (!guide) return null
  const tc = TIPO_CFG[guide.tipo] || TIPO_CFG.pdf
  return (
    <div className="relative">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(s => !s)}
        className="flex items-center gap-0.5 opacity-40 hover:opacity-100 transition-opacity"
        title="Dónde encontrar este dato"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${tc.dot}`} />
        <Info size={9} className={tc.cls} />
      </button>
      {show && (
        <div className="absolute left-0 top-5 z-50 w-64 rounded-lg border border-dark-600 bg-dark-850 p-3 shadow-xl">
          <div className={`mb-1 text-[10px] font-bold ${tc.cls}`}>{tc.label}</div>
          <div className="mb-2 text-[10px] text-dark-300">{guide.archivo}</div>
          <div className="space-y-0.5">
            {guide.pasos.map((p, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px] text-dark-400">
                <span className="text-dark-600">{i + 1}.</span> {p}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── MetricRow ─────────────────────────────────────────────────────────────────
function MetricRow({ m, weekSun, center, onSaved }) {
  const { t } = useT()
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
      <MetricSourceTooltip metricKey={m.key} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-dark-200">{m.label}</div>
        {next && (
          <div className="mt-0.5 text-[10px] text-dark-500">
            Falta <span className="text-orange-400">{next.gap} {m.unit}</span> para {next.to_tier?.fantastic || next.to_tier?.great || next.to_tier?.fair}
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
      {src && <span className={`hidden rounded px-1.5 py-0.5 text-[10px] sm:inline ${src.cls}`}>{t(src.labelKey)}</span>}
    </div>
  )
}

// ── CategoryCard ──────────────────────────────────────────────────────────────
function CategoryCard({ groupKey, tier, metrics }) {
  const { t } = useT()
  const cfg = GROUP_CFG[groupKey]
  const tc = tierCfg(tier)
  const filled = metrics.filter(m => m.value != null).length
  return (
    <div className={`rounded-xl border p-4 ${tc.ring ? `ring-1 ${tc.ring}` : ''} border-dark-800 bg-dark-900`}>
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>{t(cfg.labelKey)}</span>
        <span className="text-[10px] text-dark-500">{cfg.weight}</span>
      </div>
      <TierBadge tier={tier} />
      <div className="mt-2 text-[10px] text-dark-600">{t('sc.filled').replace('{n}', filled)}/{metrics.length}</div>
    </div>
  )
}

// ── DailyTrendTable ───────────────────────────────────────────────────────────
function DailyTrendTable({ trend }) {
  const { t } = useT()
  if (!trend?.dias?.length) return (
    <div className="text-xs text-dark-500 space-y-1">
      <p>{t('sc.no.daily')}</p>
      <p className="text-dark-600">{t('sc.cortex.hint')}</p>
    </div>
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-dark-400">
            <th className="pb-1 text-left">{t('sc.trend.col.day')}</th>
            <th className="pb-1 text-right">{t('sc.trend.dcr.day')}</th>
            <th className="pb-1 text-right">{t('sc.trend.dcr.acc')}</th>
            <th className="pb-1 text-right">{t('sc.trend.dnr')}</th>
            <th className="pb-1 text-right">{t('sc.trend.pod.day')}</th>
            <th className="pb-1 text-right">{t('sc.trend.pod.acc')}</th>
            <th className="pb-1 text-right">{t('sc.trend.del')}</th>
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
              <td className="pt-1 text-dark-300">{t('sc.trend.accum')}</td>
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

// ── ImportGuide ───────────────────────────────────────────────────────────────
function ImportGuide({ center, fileRef, uploadBusy, onUpload }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const FILES = [
    {
      id: 'pdf',
      color: 'emerald',
      icon: '📄',
      titulo: 'Scorecard PDF oficial semanal',
      desc: 'El más importante. Contiene todas las métricas de Safety, CAS, BOC, CC, Capacity y más.',
      pasos: [
        'Entra en el portal Amazon DSP (logistics.amazon.es)',
        'Ve a Performance → Scorecard',
        'Haz clic en la semana que quieras (semana pasada)',
        'Descarga el PDF del informe semanal',
        'Súbelo aquí → el sistema extrae todos los valores automáticamente',
      ],
      metricas: 'FICO, SES, Mentor Adoption, VSA, WHC, CAS, BOC, CEC, CDF, CC, Capacity',
    },
    {
      id: 'cortex',
      color: 'cyan',
      icon: '📊',
      titulo: 'Descripción general / Resumen de entregas (Cortex)',
      desc: 'Export de Cortex. Cubre DCR, DNR DPMO, POD y ratios diarios de calidad.',
      pasos: [
        'Entra en el portal Amazon DSP (logistics.amazon.es)',
        'Ve a Cortex → "Descripción general" (o "Delivery overview")',
        'Ajusta el rango de fechas a la semana actual (lunes a domingo)',
        'Haz clic en Export → descarga el Excel o CSV',
        'Súbelo aquí → el sistema detecta el tipo automáticamente',
      ],
      metricas: 'DCR, DNR DPMO, POD, Pérdido en ruta (LOF), DSC DPMO',
    },
    {
      id: 'mentor',
      color: 'purple',
      icon: '🏍',
      titulo: 'Amazon Mentor — Station Performance Report',
      desc: 'Métricas de conducción: FICO score, eventos de velocidad y adopción del mentor.',
      pasos: [
        'Entra en mentor.amazon.com',
        'Ve a Station Reports → selecciona tu estación (' + center + ')',
        'Elige la semana actual',
        'Export → descarga el Excel o CSV',
        'Súbelo aquí',
      ],
      metricas: 'FICO (conducción segura), Eventos velocidad/100, Adopción Mentor',
    },
    {
      id: 'html',
      color: 'amber',
      icon: '🌐',
      titulo: 'Reporte diario HTML (Cortex)',
      desc: 'El reporte diario de la estación en formato HTML. Se puede subir cada día para tener ratios diarios.',
      pasos: [
        'Entra en el portal Amazon DSP',
        'Ve a Cortex → selecciona el día de hoy',
        'Ctrl+S (o Archivo → Guardar página) → guarda como archivo .html',
        'Súbelo aquí',
      ],
      metricas: 'DCR diario, DNR diario, POD diario',
    },
  ]

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(s => !s)} className="flex w-full items-center justify-between p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-dark-200">
          <BookOpen size={15} className="text-brand-400" />
          {t('sc.guide.title')}
        </div>
        {open ? <ChevronUp size={15} className="text-dark-500" /> : <ChevronDown size={15} className="text-dark-500" />}
      </button>

      {open && (
        <div className="border-t border-dark-800 p-5 space-y-4">
          {FILES.map(f => (
            <div key={f.id} className={`rounded-xl border border-${f.color}-500/20 bg-${f.color}-500/5 p-4`}>
              <div className="flex items-start gap-3">
                <span className="text-xl">{f.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold text-${f.color}-300`}>{f.titulo}</div>
                  <div className="mt-0.5 text-xs text-dark-400">{f.desc}</div>
                  <div className={`mt-2 text-[10px] text-${f.color}-400/70`}>Cubre: {f.metricas}</div>
                  <div className="mt-3 space-y-1">
                    {f.pasos.map((p, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px] text-dark-400">
                        <span className={`shrink-0 rounded-full h-4 w-4 flex items-center justify-center text-[9px] font-bold bg-${f.color}-500/20 text-${f.color}-400`}>{i + 1}</span>
                        {p}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-brand-300">{t('sc.upload.title').replace('{center}', center)}</div>
                <div className="mt-0.5 text-[11px] text-dark-400">{t('sc.upload.hint')}</div>
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.html,.htm,.xlsx,.xls,.xlsm,.csv" onChange={onUpload} className="hidden" id="sc-upload-guide" />
              <label htmlFor="sc-upload-guide" className="btn-primary shrink-0 inline-flex cursor-pointer items-center gap-2">
                {uploadBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploadBusy ? t('sc.uploading') : t('sc.choose.file')}
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── BaremosEditor ─────────────────────────────────────────────────────────────
function BaremosEditor({ full, center, onSaved }) {
  const { t } = useT()
  const [vals, setVals] = useState({})
  const [busy, setBusy] = useState(null)
  const [calibBusy, setCalibBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function calibrate() {
    setCalibBusy(true); setMsg(null)
    try {
      const r = await calibrateScorecardThresholds(center)
      setMsg({ ok: true, t: `Baremos calibrados desde ${r.data.desde_scorecards} scorecard(s): ${r.data.calibradas.join(', ')}` })
      onSaved()
    } catch (e) {
      setMsg({ ok: false, t: e?.response?.data?.detail || 'Error al calibrar. Asegúrate de haber subido el PDF oficial primero.' })
    } finally { setCalibBusy(false) }
  }

  async function resetToAmazon() {
    if (!confirm(`¿Resetear los baremos de ${center} a los valores oficiales del PDF de Amazon? Se borrarán todos los ajustes manuales.`)) return
    setResetBusy(true); setMsg(null)
    try {
      await resetScorecardThresholds(center)
      setMsg({ ok: true, t: `Baremos de ${center} reiniciados a los valores Amazon por defecto.` })
      onSaved()
    } catch (e) {
      setMsg({ ok: false, t: e?.response?.data?.detail || 'Error al resetear baremos.' })
    } finally { setResetBusy(false) }
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

      <div className="mb-4 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-300">{t('sc.calib.from').replace('{center}', center)}</p>
            <p className="mt-1 text-xs text-dark-400">{t('sc.calib.desc').replace('{center}', center)}</p>
            <p className="mt-2 text-[11px] text-dark-500">{t('sc.calib.tip')}</p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button onClick={calibrate} disabled={calibBusy}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50">
              {calibBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {t('sc.calib.btn')}
            </button>
            <button onClick={resetToAmazon} disabled={resetBusy}
              className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50">
              {resetBusy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              {t('sc.reset.amazon')}
            </button>
          </div>
        </div>
      </div>

      <p className="mb-4 text-xs text-dark-500">
        {t('sc.thresholds.desc').split('{center}')[0]}
        <span className="font-semibold text-dark-300">{center}</span>
        {t('sc.thresholds.desc').split('{center}')[1]}
      </p>
      {groups.map(g => {
        const gm = full.metrics.filter(m => m.group === g)
        if (!gm.length) return null
        return (
          <div key={g} className="mb-5">
            <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${GROUP_CFG[g].color}`}>{t(GROUP_CFG[g].labelKey)}</div>
            <div className="space-y-1">
              {gm.map(m => {
                const v = vals[m.key] || { fantastic: '', great: '', fair: '' }
                const isBusy = busy === m.key
                return (
                  <div key={m.key} className="flex flex-wrap items-center gap-2 rounded border border-dark-800 bg-dark-900 px-3 py-1.5">
                    <span className="w-44 shrink-0 text-xs text-dark-300">{m.label}</span>
                    <span className="text-[10px] text-dark-600 w-10">{m.unit}</span>
                    {['fantastic', 'great', 'fair'].map(band => (
                      <div key={band} className="flex items-center gap-1">
                        <span className={`text-[10px] capitalize ${band === 'fantastic' ? 'text-green-500' : band === 'great' ? 'text-yellow-500' : 'text-orange-500'}`}>
                          {band === 'fantastic' ? 'F+/F' : band === 'great' ? 'Great' : 'Fair'}
                        </span>
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
                      {isBusy ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} {t('ui.save')}
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
  const { t } = useT()
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

  // Auto-activar proyección si no hay oficial y hay scorecard anterior
  useEffect(() => {
    if (!full || full.has_official || full.estimacion_on) return
    if (full.estimada_desde) {
      toggleScorecardEstimacion({ center, week: full.week, on: true })
        .then(() => loadFull(center, full.week))
        .catch(() => {})
    }
  }, [full?.has_official, full?.estimacion_on, full?.estimada_desde]) // eslint-disable-line

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
      <h1 className="rise mb-6 font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">Scorecard</h1>
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <Trophy size={30} className="text-brand-400" />
        <p className="text-dark-200">{t('sc.pick.center')}</p>
      </div>
    </div>
  )

  const overallCfg = tierCfg(full?.overall)
  const metrics = full?.metrics || []
  const byGroup = (g) => metrics.filter(m => m.group === g)
  const hasScore = full?.overall != null || predict?.predicted_score != null

  return (
    <div className="mx-auto max-w-5xl space-y-5">

      {/* Header + Week nav */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="rise font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">Scorecard <span className="text-dark-600">· {center}</span></h1>
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
        <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> {t('ui.loading')}</div>
      )}

      {full && (
        <>
          {/* Overall banner */}
          <div className={`rounded-xl border p-5 ${hasScore && overallCfg.ring ? `ring-1 ${overallCfg.ring}` : ''} border-dark-800`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-dark-500">{t('sc.overall')}</div>
                {full.overall ? (
                  <div className="flex items-baseline gap-3">
                    <span className={`text-3xl font-bold ${overallCfg.text}`}>{full.overall}</span>
                    {full.overall_score != null && (
                      <span className={`text-xl font-mono font-semibold ${overallCfg.text}`}>{Number(full.overall_score).toFixed(2)}</span>
                    )}
                  </div>
                ) : predict?.predicted_score != null ? (
                  <div>
                    <div className="flex items-baseline gap-3">
                      <span className={`text-3xl font-bold tabular-nums ${tierCfg(predict.predicted_tier).text}`}>
                        {Number(predict.predicted_score).toFixed(2)}
                      </span>
                      <TierBadge tier={predict.predicted_tier} />
                    </div>
                    <div className="mt-1 text-[11px] text-amber-400">
                      {predict.gap_to_next != null
                        ? `Te faltan ${Number(predict.gap_to_next).toFixed(2)} puntos para ${predict.next_tier}`
                        : predict.predicted_tier === 'Fantastic Plus' ? '¡Ya estás en Fantastic Plus!' : ''}
                    </div>
                    <div className="mt-0.5 text-[10px] text-dark-500">Predicción · {predict.confidence}% datos reales · {predict.cobertura_peso}% peso cubierto</div>
                  </div>
                ) : (
                  <div>
                    <span className="text-2xl font-bold text-dark-500">{t('sc.no.data.simple')}</span>
                    <p className="mt-1 text-[11px] text-dark-500">{t('sc.no.data.long')}</p>
                  </div>
                )}
                {full.overall_method && <p className="mt-1 text-[10px] text-dark-600">{full.overall_method}</p>}
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
                {t('sc.project.label')}
              </label>
              {!full.has_official && !full.estimacion_on && (
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <AlertCircle size={11} /> {t('sc.no.official')}
                </span>
              )}
              {full.has_official && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
                  {t('sc.official.loaded')}
                </span>
              )}
              {confirmReset ? (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-red-300">{t('sc.reset.week')}</span>
                  <button onClick={doReset} disabled={resetBusy} className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300 hover:bg-red-500/30">
                    {resetBusy ? <Loader2 size={11} className="animate-spin" /> : t('sc.reset.confirm')}
                  </button>
                  <button onClick={() => setConfirmReset(false)} className="text-xs text-dark-400 hover:text-dark-200">{t('ui.cancel')}</button>
                </div>
              ) : (
                <button onClick={() => setConfirmReset(true)} className="ml-auto flex items-center gap-1 text-xs text-dark-500 hover:text-red-400">
                  <RotateCcw size={11} /> {t('sc.reset.btn')}
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
                      <span className={`text-xs font-semibold uppercase tracking-wide ${gc.color}`}>{t(gc.labelKey)}</span>
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
                    {g === 'safety' && !byGroup('safety').some(m => m.value != null) && (
                      <div className="mt-3 rounded-lg border border-blue-500/15 bg-blue-500/5 px-3 py-2">
                        <p className="text-[11px] text-blue-400">
                          Safety (40% del score) requiere el PDF oficial de Amazon.{' '}
                          <span className="text-blue-300">DSP Portal → Performance → Scorecard → Descargar PDF</span>
                        </p>
                      </div>
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
                    <span className="text-sm font-semibold">{t('sc.predict.panel')}</span>
                  </div>
                  {predict.predicted_tier || predict.predicted_score != null ? (
                    <>
                      {/* Score exacto */}
                      <div className="mb-3 rounded-lg border border-dark-700 bg-dark-950 px-4 py-3 text-center">
                        <div className={`text-4xl font-bold tabular-nums ${tierCfg(predict.predicted_tier).text}`}>
                          {Number(predict.predicted_score).toFixed(2)}
                        </div>
                        <div className="mt-1"><TierBadge tier={predict.predicted_tier} /></div>
                        {predict.gap_to_next != null && predict.next_tier && (
                          <div className="mt-2 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
                            Te faltan <span className="font-bold">{Number(predict.gap_to_next).toFixed(2)} pts</span> para <span className="font-semibold">{predict.next_tier}</span>
                          </div>
                        )}
                        {predict.predicted_tier === 'Fantastic Plus' && (
                          <div className="mt-2 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400 font-semibold">
                            {t('sc.fantastic.plus')}
                          </div>
                        )}
                      </div>

                      {/* Cobertura */}
                      <div className="mb-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-dark-800">
                          <div className="h-1.5 rounded-full bg-brand-500 transition-all" style={{ width: `${predict.confidence}%` }} />
                        </div>
                        <span className="text-[10px] text-dark-400">{predict.confidence}%</span>
                      </div>
                      <p className="text-[10px] text-dark-500 mb-3">
                        {predict.cobertura_peso}% del peso cubierto ·{' '}
                        {predict.fuentes?.join(', ') || '—'}
                        {predict.estimado_desde && ` · Safety estimado de W${predict.estimado_desde}`}
                      </p>

                      {predict.empeoran?.length > 0 && (
                        <div className="mb-3">
                          <div className="mb-1.5 text-[10px] font-semibold text-red-400 uppercase tracking-wide">{t('sc.dragging.down')}</div>
                          {predict.empeoran.map((e, i) => (
                            <div key={i} className="flex items-center justify-between gap-1 py-0.5 text-xs">
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
                        <div className="rounded-lg bg-dark-900 px-3 py-2">
                          <div className="mb-1 text-[10px] font-semibold text-dark-500">{t('sc.missing.data').replace('{n}', predict.faltan_datos.length)}</div>
                          {predict.faltan_datos.slice(0, 5).map((f, i) => (
                            <div key={i} className="text-[10px] text-dark-600">· {f}</div>
                          ))}
                          {predict.faltan_datos.length > 5 && <div className="text-[10px] text-dark-600">y {predict.faltan_datos.length - 5} más…</div>}
                        </div>
                      )}

                      {predict.delta_anterior && (
                        <div className="mt-3 border-t border-dark-800 pt-2 flex items-center gap-2 text-[10px] text-dark-500">
                          Sem. anterior W{predict.delta_anterior.week}:
                          <TierBadge tier={predict.delta_anterior.tier} />
                          {predict.delta_anterior.score != null && <span className="font-mono">{Number(predict.delta_anterior.score).toFixed(2)}</span>}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-dark-400">Aún no hay datos suficientes para calcular el score de esta semana.</p>
                      <div className="rounded-lg border border-dark-700 bg-dark-900 p-3 text-[11px] text-dark-400 space-y-1.5">
                        <div className="font-semibold text-dark-300 mb-2">Para ver la predicción, sube alguno de estos:</div>
                        <div>📄 <span className="text-emerald-400">PDF oficial</span> → todas las métricas</div>
                        <div>📊 <span className="text-cyan-400">Resumen de entregas</span> → DCR, DNR, POD</div>
                        <div>🏍 <span className="text-purple-400">Mentor export</span> → FICO, velocidad</div>
                        <div className="text-dark-600 pt-1">O activa "Proyectar con última scorecard" arriba para estimar Safety/Capacity.</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* "To improve" list */}
              {full.to_improve?.length > 0 && (
                <div className="card p-4">
                  <div className="mb-2 text-xs font-semibold text-dark-200">{t('sc.improve.first')}</div>
                  <div className="space-y-1.5">
                    {full.to_improve.slice(0, 6).map((m, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-dark-400">{m.label}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          <TierBadge tier={m.tier} />
                          {m.next && <span className="text-orange-400 text-[10px]">+{m.next.gap}</span>}
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
              <span className="text-sm font-semibold">{t('sc.daily.quality')}</span>
              <span className="text-xs text-dark-500">{t('sc.daily.accum')}</span>
            </div>
            <DailyTrendTable trend={trend} />
          </div>
        </>
      )}

      {/* Upload + guide */}
      <div className="card p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-dark-200"><Upload size={15} /> {t('sc.upload.title').replace('{center}', center)}</div>
        <p className="mb-3 text-xs text-dark-400">{t('sc.upload.hint')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".pdf,.html,.htm,.xlsx,.xls,.xlsm,.csv" onChange={onUpload} className="hidden" id="sc-upload" />
          <label htmlFor="sc-upload" className="btn-primary inline-flex cursor-pointer items-center gap-2">
            {uploadBusy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {uploadBusy ? t('sc.uploading') : t('sc.choose.file')}
          </label>

          {/* Legend */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(TIPO_CFG).map(([k, v]) => (
              <span key={k} className={`flex items-center gap-1 text-[10px] ${v.cls}`}>
                <span className={`h-2 w-2 rounded-full ${v.dot}`} /> {v.label}
              </span>
            ))}
          </div>
        </div>

        {/* Sources list */}
        {sources.length > 0 && (
          <div className="mt-4">
            <button onClick={() => setShowSources(s => !s)}
              className="flex items-center gap-1 text-xs text-dark-400 hover:text-dark-200">
              {showSources ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {t('sc.sources.count').replace('{n}', sources.length)}
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

      {/* Guía de importación */}
      <ImportGuide center={center} fileRef={fileRef} uploadBusy={uploadBusy} onUpload={onUpload} />

      {/* Baremos */}
      <div className="card p-5">
        <button onClick={() => setShowBaremos(s => !s)} className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-dark-200">
            <Trophy size={15} /> {t('sc.baremos.title').replace('{center}', center)}
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
