import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT } from '../../i18n'
import {
  Loader2, Upload, Trophy, ChevronLeft, ChevronRight, Pencil, Check, X,
  TrendingUp, TrendingDown, Minus, RefreshCw, FileText, Trash2, Info,
  ChevronDown, ChevronUp, RotateCcw, ExternalLink, BookOpen, AlertCircle,
} from 'lucide-react'
import {
  getScorecardFull, setScorecardValue, getScorecardEnVivo, revisarDiaScorecard,
  getScorecardPredict, getScorecardDailyTrend,
  getScorecardSources, uploadScorecard, getScorecardUmbrales,
  getScorecardStandings,
  setScorecardThreshold, toggleScorecardEstimacion,
  resetScorecardWeek, deleteScorecardSource,
  calibrateScorecardThresholds,
  resetScorecardThresholds,
} from '../api'
import { diasAtras } from '../../lib/fecha'
import CalidadViva from '../components/CalidadViva'

// ── Helpers ──────────────────────────────────────────────────────────────────
/* La escala va LIMA → amarillo → ámbar → rojo, sin verde azulado. El esmeralda
   de antes se parecía demasiado al cian de marca y el ojo los mezclaba: "va
   bien" y "púlsame" no se pueden confundir. Y es una ESCALA, no cinco
   categorías sueltas: el mismo color significa lo mismo en toda la app. */
const TIER_CFG = {
  'Fantastic Plus': { bg: 'bg-lime-500/20',    text: 'text-lime-300',    ring: 'ring-lime-500/40',    dot: 'bg-lime-400' },
  'Fantastic':      { bg: 'bg-lime-500/15',    text: 'text-lime-400',    ring: 'ring-lime-500/30',    dot: 'bg-lime-500' },
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
  // Sin fecha valida, toISOString() LANZA "Invalid time value" y tumbaba la
  // pantalla entera: le pasaba a cualquier DSP que aun no tuviera semanas de
  // scorecard cargadas y pulsara las flechas de semana.
  const d = new Date(`${dateStr}T12:00:00Z`)
  if (isNaN(d.getTime())) return dateStr || ''
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
// `cierto=false` NO se pinta igual que un tier confirmado: lleva borde
// discontinuo, una virgulilla delante y el motivo a mano. Un tier estimado que
// se vea como uno seguro es justo el falso positivo que no queremos.
function TierBadge({ tier, cierto = true, motivo }) {
  const cfg = tierCfg(tier)
  if (!tier) return <span className="text-xs text-dark-600">Sin datos</span>
  if (cierto) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${cfg.bg} ${cfg.text} ${cfg.ring}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
        {tier}
      </span>
    )
  }
  return (
    <span
      title={motivo ? `Estimado — ${motivo}` : 'Estimado'}
      className={`inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs font-semibold ${cfg.text} border-current/50 opacity-90`}
    >
      <span className="opacity-70">~</span>
      {tier}
      <span className="text-[10px] font-normal opacity-70">estimado</span>
    </span>
  )
}

// ── Aviso de umbrales ─────────────────────────────────────────────────────────
// Cada nave tiene SUS propios baremos: entre 10 naves medidas hay 17 targets
// distintos de DSC y 7 de DCR. Sin una scorecard de la nave, cualquier tier que
// pintemos es orientativo, y hay que decirlo antes de que el DSP decida algo.
function AvisoUmbrales({ info, onSubir }) {
  if (!info || info.tiene_umbrales_propios) return null
  return (
    <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-200">
            Los tiers que ves son orientativos
          </p>
          <p className="mt-1 text-sm text-amber-100/80">
            Amazon pone un baremo distinto a cada nave. Todavía no tenemos ninguna
            scorecard de <span className="font-semibold">{info.center}</span>, así
            que estamos usando umbrales genéricos que <span className="font-semibold">no
            son los tuyos</span>. Sube una scorecard reciente y los tiers pasan a ser exactos.
          </p>
          <p className="mt-1 text-xs text-amber-100/60">
            Con una basta: los umbrales sólo cambian cuando Amazon cambia de temporada.
          </p>
          {onSubir && (
            <button
              onClick={onSubir}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-200 ring-1 ring-amber-500/40 hover:bg-amber-500/30"
            >
              <Upload className="h-4 w-4" />
              Subir mi scorecard
            </button>
          )}
        </div>
      </div>
    </div>
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
/* ── TABLA DE MÉTRICAS ──────────────────────────────────────────────────────
   Antes eran tres tarjetas apiladas con las métricas dentro como filas-caja.
   Cabían cuatro sin bajar la página de dieciséis que hay, y todas ocupaban lo
   mismo tuvieran el peso que tuvieran.

   Aquí caben las doce de un vistazo y, sobre todo, se pueden ORDENAR POR LO
   QUE CUESTAN. DSC pesa 15,6 puntos y CC pesa 3,6: la misma distancia al
   objetivo vale cuatro veces más en una que en otra, y eso decidía dónde
   meter horas la semana siguiente. Con las tarjetas no se veía.

   La edición a mano del valor se queda: es como se rellenan las métricas que
   solo salen en el PDF. */
function TablaMetricas({ metricas, weekSun, center, onSaved }) {
  const { t } = useT()
  const [orden, setOrden] = useState('cuesta')

  const filas = useMemo(() => {
    const ms = [...metricas]
    if (orden === 'grupo') {
      const peso = { safety: 0, quality: 1, capacity: 2 }
      return ms.sort((a, b) => (peso[a.group] ?? 9) - (peso[b.group] ?? 9)
        || (b.peso || 0) - (a.peso || 0))
    }
    // "Lo que cuesta": primero lo que NO está en Fantastic, por peso. Una
    // métrica sin dato no cuesta puntos todavía, así que va al final: lo que
    // no se sabe no se puede arreglar esta semana.
    const bien = (m) => m.tier === 'Fantastic' || m.tier === 'Fantastic Plus'
    const rango = (m) => (m.value == null ? 2 : bien(m) ? 1 : 0)
    return ms.sort((a, b) => rango(a) - rango(b) || (b.peso || 0) - (a.peso || 0))
  }, [metricas, orden])

  const enJuego = filas
    .filter((m) => m.value != null && m.tier !== 'Fantastic' && m.tier !== 'Fantastic Plus')
    .reduce((s, m) => s + (m.peso || 0), 0)

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-dark-800 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-dark-300">Métricas</span>
        {enJuego > 0 && (
          <span className="cifra text-[11px] text-orange-300">
            {enJuego.toFixed(1)} puntos en juego
          </span>
        )}
        <div className="ml-auto flex gap-1 rounded-md bg-dark-800/60 p-0.5">
          {[['cuesta', 'Lo que cuesta'], ['grupo', 'Por pilar']].map(([k, txt]) => (
            <button key={k} onClick={() => setOrden(k)}
              className={`rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                orden === k ? 'bg-dark-700 text-dark-100' : 'text-dark-400 hover:text-dark-200'}`}>
              {txt}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-[13px]">
          <thead>
            <tr className="border-b border-dark-800">
              <th className="w-7 px-2 py-2"></th>
              <th className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-dark-500">Métrica</th>
              <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-dark-500">Valor</th>
              <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-dark-500">Objetivo</th>
              <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-dark-500">Falta</th>
              <th className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-dark-500">Nivel</th>
              <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-dark-500">Peso</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((m) => (
              <FilaMetrica key={m.key} m={m} weekSun={weekSun} center={center} onSaved={onSaved} t={t} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FilaMetrica({ m, weekSun, center, onSaved, t }) {
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
  // El objetivo que se enseña es el de FANTASTIC, no el del siguiente escalón:
  // es el que persigue todo el mundo y el que sale en el PDF de Amazon.
  const objetivo = m.thr?.fantastic
  const gcolor = GROUP_CFG[m.group]?.color || 'text-dark-500'

  return (
    <tr className="float-row border-b border-dark-800/50 last:border-0">
      <td className="px-2 py-1.5 align-middle">
        <MetricSourceTooltip metricKey={m.key} />
      </td>
      <td className="px-2 py-1.5">
        <span className="text-dark-200">{m.label}</span>
        <span className={`ml-1.5 text-[9.5px] uppercase tracking-wider ${gcolor}`}>
          {m.group === 'safety' ? 'seg' : m.group === 'quality' ? 'cal' : 'cap'}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right">
        {editing ? (
          <span className="inline-flex items-center gap-1">
            <input ref={inputRef} type="number" step="0.01" value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
              className="cifra w-20 rounded border border-dark-600 bg-dark-800 px-1.5 py-0.5 text-right text-[12.5px] focus:border-brand-500 focus:outline-none" />
            <button onClick={save} disabled={busy} className="text-lime-400 hover:text-lime-300">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            </button>
            <button onClick={() => setEditing(false)} className="text-dark-500 hover:text-dark-300"><X size={12} /></button>
          </span>
        ) : (
          <button onClick={startEdit} title="Editar valor a mano"
            className={`cifra group rounded px-1.5 py-0.5 font-semibold hover:bg-dark-800 ${
              m.value != null ? cfg.text : 'text-dark-600'}`}>
            {fmtVal(m.value, m.unit)}
            <Pencil size={9} className="ml-1 inline opacity-0 group-hover:opacity-60" />
          </button>
        )}
      </td>
      <td className="cifra px-2 py-1.5 text-right text-dark-500">
        {objetivo != null ? fmtVal(objetivo, m.unit) : '—'}
      </td>
      <td className="cifra px-2 py-1.5 text-right">
        {m.next ? (
          <span className="text-orange-300">{fmtVal(Math.abs(m.next.gap), m.unit)}</span>
        ) : <span className="text-dark-600">—</span>}
      </td>
      <td className="px-2 py-1.5">
        <TierBadge tier={m.tier} cierto={m.cierto !== false} motivo={m.motivo} />
      </td>
      <td className="cifra px-2 py-1.5 text-right text-dark-400">
        {m.peso != null ? Number(m.peso).toFixed(1) : '—'}
        {src && <span className={`ml-1.5 hidden rounded px-1 py-0.5 text-[9.5px] xl:inline ${src.cls}`}>{t(src.labelKey)}</span>}
      </td>
    </tr>
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
      {/* Sin Resumen diario subido, el backend cuenta los dias desde Cortex y
          lo dice: DCR real, DNR y POD en blanco. Que se sepa de donde sale. */}
      {trend.nota && <p className="mb-1 text-[11px] text-dark-500">{trend.nota}</p>}
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
    /* Los dos ficheros de baremos. No traen resultados: traen las REGLAS con
       las que Amazon puntúa. Sin ellos la app calcula con los baremos de la
       semana 22, que es cuando se sembraron — y el día que Amazon los cambie,
       el número que enseñamos deja de ser el suyo sin que nada avise.
       Las rutas para subirlos existían desde hacía tiempo pero no tenían
       botón, así que en la práctica no los subía nadie. */
    {
      id: 'pesos',
      color: 'rose',
      icon: '⚖️',
      titulo: 'Pesos de las métricas (Excel/CSV de Amazon)',
      desc: 'Cuánto vale cada métrica en la nota final. Sin esto se calcula con los pesos de la semana 22.',
      pasos: [
        'Es el fichero con columnas que acaban en "_wt_final" (dcr_wt_final, pod_wt_final…)',
        'Te lo pasa Amazon cuando cambian la ponderación',
        'Súbelo aquí tal cual: se reconoce por sus columnas, da igual cómo se llame',
        'Comprueba que la suma que te diga sea 100: si no, el fichero está incompleto',
      ],
      metricas: 'Ponderación de las 12 métricas del Scorecard 3.0',
    },
    {
      id: 'umbrales',
      color: 'sky',
      icon: '🎯',
      titulo: 'Umbrales por tier (Excel de Amazon)',
      desc: 'Los baremos t0/t1/t2/t3 de tu estación. El PDF ya trae los suyos; este cubre varias semanas de golpe.',
      pasos: [
        'Es el fichero con columnas que acaban en "_t0", "_t1", "_t2", "_t3"',
        'Súbelo aquí: se guarda el de la semana más reciente de cada estación',
        'Si solo tienes el PDF de la semana, no hace falta: los umbrales salen de él',
      ],
      metricas: 'Fantastic+, Fantastic, Great y Fair de cada métrica',
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
/* ── CÓMO VA LA SEMANA, HOY ────────────────────────────────────────────────
   La scorecard oficial de Amazon llega con semanas de retraso: la última
   cargada es la 29 y estamos en la 35. Cuando ves que el DCR se hundió, esa
   semana lleva un mes cerrada.

   Esto NO predice: cuenta lo que YA ha pasado, con los paquetes de Cortex, y
   lo compara contra los umbrales oficiales que la app ya tiene. Un acumulado
   real no se equivoca; una predicción con cinco semanas de histórico sí. */
function ComoVaLaSemana({ center }) {
  const [d, setD] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [revisando, setRevisando] = useState(false)

  const revisar = async () => {
    setRevisando(true)
    try { await revisarDiaScorecard() } catch { /* el aviso sale por Telegram */ }
    finally { setRevisando(false) }
  }

  useEffect(() => {
    setCargando(true)
    getScorecardEnVivo(center, 6)
      .then((r) => setD(r.data))
      .catch(() => setD(null))
      .finally(() => setCargando(false))
  }, [center])

  if (cargando) {
    return (
      <div className="card flex items-center gap-2 p-5 text-[13px] text-dark-400">
        <Loader2 size={14} className="animate-spin" /> Contando los paquetes de esta semana…
      </div>
    )
  }
  if (!d?.semanas?.length) return null

  // LA SEMANA QUE ACABA DE EMPEZAR NO SE ENSEÑA. La semana de Amazon arranca
  // el domingo, y ese dia no hay ni un paquete cerrado: el DCR sale a null y
  // la cabecera ponia "None%" con "0 entregados". El backend dice cual hay que
  // enseñar y si tuvo que retroceder; aqui solo se respeta.
  const actual = d.semanas.find((s) => s.domingo === d.ensenar)
    || d.semanas.find((s) => s.suficiente) || d.semanas[0]
  const enCurso = d.semanas.find((s) => s.es_la_actual)
  const arrancando = enCurso && !enCurso.suficiente
  const dias = d.dias || []
  const cerrados = dias.filter((x) => x.cerrado && x.dcr != null)
  // La referencia es la MEDIANA de los días cerrados, no la media: un solo día
  // malo arrastra la media y entonces el día malo deja de parecer malo.
  const orden = [...cerrados].map((x) => x.dcr).sort((a, b) => a - b)
  const mediana = orden.length ? orden[Math.floor(orden.length / 2)] : null
  const ultimos = cerrados.slice(-3)
  // Cuantos de los que se enseñan salen del recuento de hoy en vez de una foto
  // suya. Se cuenta sobre los MISMOS diez que pinta la tabla, no sobre todos:
  // una nota que habla de días que no se ven no la entiende nadie (gotcha 21).
  const sinFoto = dias.slice(-10).filter(
    (x) => !x.congelado && x.cerrado && diasAtras(x.fecha) > 1).length
  // Un día por debajo de la mediana menos punto y medio no es ruido: con 5.000
  // paquetes al día, eso son 75 entregas que no salieron.
  const malos = mediana != null ? ultimos.filter((x) => x.dcr < mediana - 1.5) : []

  const tierCls = (t) => t === 'Fantastic Plus' || t === 'Fantastic' ? 'text-lime-300'
    : t === 'Great' ? 'text-yellow-300' : t === 'Fair' ? 'text-orange-300'
      : t === 'Poor' ? 'text-red-300' : 'text-dark-500'

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-dark-800 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-dark-300">
          {arrancando ? 'Última semana con datos' : 'Cómo va la semana'} {actual.semana}
        </span>
        <span className="cifra text-[22px] font-semibold leading-none text-dark-50">
          {actual.dcr != null ? `${actual.dcr}%` : '—'}
        </span>
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${tierCls(actual.tier)}`}>
          {actual.tier || '—'}
        </span>
        {arrancando && (
          <span className="text-[11.5px] text-dark-500">
            · la {enCurso.semana} acaba de empezar
            {enCurso.entregados > 0 && <> (<span className="cifra">{enCurso.entregados.toLocaleString('es')}</span> entregados)</>}
          </span>
        )}
        <button onClick={revisar} disabled={revisando}
          className="ml-auto rounded-md border border-dark-700 px-2 py-0.5 text-[11px] text-dark-400 hover:text-dark-200 disabled:opacity-50"
          title="Comprueba el último día cerrado y avisa por Telegram si se sale de lo normal">
          {revisando ? 'Revisando…' : 'Revisar el día'}
        </button>
        <span className="text-[11.5px] text-dark-500">
          <span className="cifra">{actual.entregados.toLocaleString('es')}</span> entregados ·{' '}
          <span className="cifra text-orange-300">{actual.fallos}</span> fallos
          {actual.en_vuelo > 0 && <> · <span className="cifra">{actual.en_vuelo}</span> aún en la calle</>}
        </span>
      </div>

      {/* El aviso solo sale cuando hay algo que decir. Un panel que siempre
          enseña una alerta deja de leerse a la semana. */}
      {malos.length > 0 && (
        <div className="border-b border-dark-800 bg-orange-500/[0.07] px-4 py-2.5">
          <p className="text-[12.5px] text-orange-200">
            {malos.length === 1 ? 'El ' : 'Los días '}
            {malos.map((x, i) => (
              <span key={x.fecha}>
                {i > 0 && ', '}
                <span className="cifra font-semibold">{x.fecha.slice(8)}/{x.fecha.slice(5, 7)}</span>
                {' '}(<span className="cifra">{x.dcr}%</span>)
              </span>
            ))}
            {' '}por debajo de lo normal, que ronda el <span className="cifra">{mediana}%</span>.
            {' '}Son <span className="cifra font-semibold">{malos.reduce((s, x) => s + x.fallos, 0)}</span> paquetes
            que no salieron.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr className="border-b border-dark-800">
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-dark-500">Día</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-dark-500">Entregados</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-dark-500">Fallos</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-dark-500">DCR</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {dias.slice(-10).reverse().map((x) => {
              const malo = mediana != null && x.cerrado && x.dcr != null && x.dcr < mediana - 1.5
              const aprox = !x.congelado && x.cerrado && diasAtras(x.fecha) > 1
              return (
                <tr key={x.fecha} className="border-b border-dark-800/50 last:border-0">
                  <td className="cifra px-3 py-1.5 text-dark-300">{x.fecha}</td>
                  <td className="cifra px-3 py-1.5 text-right text-dark-300">{x.entregados.toLocaleString('es')}</td>
                  <td className={`cifra px-3 py-1.5 text-right ${x.fallos > 40 ? 'text-orange-300' : 'text-dark-500'}`}>
                    {x.fallos || '—'}
                  </td>
                  <td className={`cifra px-3 py-1.5 text-right font-semibold ${malo ? 'text-orange-300' : 'text-dark-200'}`}>
                    {/* Un dia sin foto propia esta MEDIDO HOY, y hoy sus
                        devoluciones ya se re-repartieron: el DCR sale mejor de
                        lo que fue. El simbolo avisa de que ese numero es un
                        suelo, no una medida. */}
                    {x.dcr != null ? `${aprox ? '≥' : ''}${x.dcr}%` : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-[11px] text-dark-600">
                    {!x.cerrado ? `${x.en_vuelo} en la calle`
                      : x.congelado ? <span className="text-lime-400/70">foto del día</span>
                        : aprox ? <span title="Sin foto de ese día: los paquetes devueltos que ya se re-repartieron no se ven, así que el DCR real fue peor">sin foto</span>
                          : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-dark-800 px-3 py-2 text-[11.5px] leading-relaxed text-dark-500">
        Contado sobre los paquetes de Cortex, no es una predicción. Los días con paquetes
        aún en la furgoneta no cuentan para el acumulado: todavía pueden entregarse.
        {d.umbral_dcr?.fantastic && <> El umbral de Fantastic de tu nave es{' '}
          <span className="cifra">{d.umbral_dcr.fantastic}%</span>.</>}
        {sinFoto > 0 && (
          <> <span className="text-dark-400">Los {sinFoto} días marcados «sin foto» son
            anteriores a que se guardara el cierre de cada día: sus paquetes devueltos ya se
            re-repartieron y no se ven, así que ahí el DCR real fue algo peor que el que
            sale.</span></>
        )}
      </p>
    </div>
  )
}


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
  const [plantilla, setPlantilla] = useState(null)   // reparto por tier de la plantilla
  const [loadingFull, setLoadingFull] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [showBaremos, setShowBaremos] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [umbrales, setUmbrales] = useState(null)

  const loadFull = useCallback(async (c, w) => {
    if (!c || c === 'Todos') return
    setLoadingFull(true)
    try {
      const [rf, rp, rt, rs, ru, rd] = await Promise.allSettled([
        getScorecardFull(c, w || undefined),
        getScorecardPredict(c, w || undefined),
        getScorecardDailyTrend(c, w || undefined),
        getScorecardSources(c, w || undefined),
        getScorecardUmbrales(c),
        getScorecardStandings(c),
      ])
      if (rf.status === 'fulfilled') {
        setFull(rf.value.data)
        if (!w) setWeekSun(rf.value.data.week)
      }
      if (rp.status === 'fulfilled') setPredict(rp.value.data)
      if (rt.status === 'fulfilled') setTrend(rt.value.data)
      if (rs.status === 'fulfilled') setSources(rs.value.data?.items || [])
      if (ru.status === 'fulfilled') setUmbrales(ru.value.data)
      if (rd.status === 'fulfilled') setPlantilla(rd.value.data)
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

  /* Con "Todos" el scorecard oficial no se puede montar (es por centro), pero
     la calidad en vivo sí: se agrega sobre toda la operación. Antes esta rama
     era una pantalla vacía pidiendo elegir centro. */
  if (noCenter) return (
    <div>
      <h1 className="rise mb-6 font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">Scorecard</h1>
      <CalidadViva center="" />
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

      {/* Lo vivo va ARRIBA a propósito: es lo único que está actualizado hoy.
          Lo de abajo depende de que alguien suba el PDF de Amazon del viernes,
          y en producción eso no lo hace nadie — esta pantalla llevaba meses
          vacía por eso mismo. */}
      <CalidadViva center={center} />

      {loadingFull && !full && (
        <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> {t('ui.loading')}</div>
      )}

      {/* Cada nave tiene sus propios baremos: si no tenemos scorecard de ésta,
          se dice ANTES de enseñar ningún tier. */}
      <AvisoUmbrales info={umbrales} onSubir={() => fileRef.current?.click()} />

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
              {/* CUÁNTO HACE QUE NO LLEGA UNA OFICIAL. Un dato viejo sin fecha
                  al lado es un dato que engaña: se puede estar mirando la
                  semana 29 en septiembre y tomar decisiones con ella creyendo
                  que es de ahora. Solo salta a partir de dos semanas, porque
                  una de retraso es lo normal. */}
              {full.oficial_semanas_retraso >= 2 && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-amber-300"
                  title={`La última scorecard oficial cargada es la semana ${full.oficial_ultima_semana}. Va la ${full.oficial_semana_actual}.`}>
                  <AlertCircle size={11} />
                  {full.oficial_semanas_retraso} semanas sin cargar la oficial
                  {' '}(última: la {full.oficial_ultima_semana})
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
              {/* Los tres pilares en una tira, y debajo TODAS las metricas en
                  una tabla. Antes cada pilar era una tarjeta con sus metricas
                  dentro: cabian cuatro de dieciseis sin bajar la pagina. */}
              {/* Tres columnas SOLO desde `sm`. Con «Seguridad y Cumplimiento»
                  dentro, tres columnas fijas median 621 px y en un movil de
                  375 la pagina entera se arrastraba de lado (medido el
                  02-09-2026). Apiladas se leen mejor y no mueven nada. */}
              <div className="card grid grid-cols-1 divide-y divide-dark-800 overflow-hidden sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {['safety', 'quality', 'capacity'].map(g => {
                  const gc = GROUP_CFG[g]
                  return (
                    <div key={g} className="flex items-center justify-between gap-2 px-3 py-2.5 sm:block">
                      <p className={`text-[10px] font-medium uppercase tracking-wider ${gc.color}`}>
                        {t(gc.labelKey)} <span className="text-dark-600">{gc.weight}</span>
                      </p>
                      <div className="sm:mt-1"><TierBadge tier={full[`${g}_tier`]} /></div>
                    </div>
                  )
                })}
              </div>

              {/* Lo primero: como va la semana EN CURSO. La tabla de abajo
                  es la ultima oficial, que puede tener un mes. */}
              <ComoVaLaSemana center={center} />

              <TablaMetricas metricas={full.metrics || []} weekSun={full.week}
                center={center} onSaved={reload} />

              {!byGroup('safety').some(m => m.value != null) && (
                <div className="rounded-lg border border-blue-500/15 bg-blue-500/5 px-3 py-2">
                  <p className="text-[11px] text-blue-400">
                    Safety (40% del score) requiere el PDF oficial de Amazon.{' '}
                    <span className="text-blue-300">DSP Portal → Performance → Scorecard → Descargar PDF</span>
                  </p>
                </div>
              )}
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
                          <TierBadge tier={m.tier} cierto={m.cierto !== false} motivo={m.motivo} />
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

        {/* ── CUÁNTOS DE TU PLANTILLA LLEGAN ──────────────────────────────
            El tier del DSP no sale de la media: Amazon mira qué PORCENTAJE de
            los repartidores llega a objetivo. Con la media, tres cracks tapan
            a diez que van justos — el número sale bonito y el tier baja.

            Este bloque solo aparece cuando hay datos por conductor, que llegan
            al subir la scorecard. Antes se guardaban solo si se llamaba a una
            ruta sin botón, así que la tabla llevaba vacía desde siempre.

            NO se pinta ningún aprobado: el listón que se publica por ahí
            (86 %, 88 %) cambia y no lo hemos visto en un documento de Amazon.
            Se da el reparto real, que es un hecho de sus datos. */}
        {plantilla?.con_tier > 0 && (
          <div className="mt-4 rounded-lg border border-dark-800 bg-dark-900/50 p-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs font-semibold text-dark-200">Tu plantilla esa semana</span>
              <span className="text-xs text-dark-500">
                {plantilla.ultima_semana} · {plantilla.con_tier} conductores con tier
              </span>
              <span className="cifra ml-auto text-sm font-bold text-brand-300">
                {plantilla.pct_fantastic_o_mejor}% en Fantastic o mejor
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(plantilla.reparto_tiers || {})
                .sort((a, b) => b[1] - a[1])
                .map(([tier, n]) => (
                  <span key={tier}
                    className="rounded-md bg-dark-800 px-2 py-0.5 text-[11px] text-dark-300">
                    {tier}: <span className="cifra font-semibold text-dark-100">{n}</span>
                  </span>
                ))}
            </div>
            {plantilla.cruzados < plantilla.con_tier && (
              <p className="mt-2 text-[11px] text-dark-500">
                {plantilla.con_tier - plantilla.cruzados} no se han podido cruzar con una ficha:
                revisa que su Transporter ID esté puesto en Conductores.
              </p>
            )}
          </div>
        )}

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
