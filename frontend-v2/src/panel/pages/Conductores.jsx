import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { useT } from '../../i18n'
import { useEscape } from '../../lib/useEscape'
import {
  Loader2, Search, Plus, X, Pencil, Trash2, UserCheck,
  Phone, Mail, IdCard, Car, MapPin, FileText, Building2, Save, Camera,
  Trophy, TrendingUp, TrendingDown, Minus, Flame, BarChart2, ChevronDown, ChevronUp, AlertCircle,
  Lock, LockOpen, Eye, EyeOff, ShieldCheck,
} from 'lucide-react'
import { getDrivers, createDriver, updateDriver, deleteDriver, uploadDriverPhoto, getDriversScoring, getScoringLeaderboard, getDriverAccounts, setDriverPassword, deleteDriverAccount } from '../api'

const EMPTY = {
  name: '', dni: '', phone: '', email: '', driver_id: '',
  license_number: '', contrato: '', nivel: '', center: '', alojamiento: '', notas: '',
}

function initials(n) {
  return (n || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}
const PALETTE = [
  'from-violet-500 to-indigo-600', 'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-600', 'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-600',    'from-sky-400 to-blue-600',
]
function avatarGrad(name) {
  let h = 0; for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

const NIVEL = { pleno: ['Pleno','bg-emerald-500/15 text-emerald-300'], L1: ['L1','bg-sky-500/15 text-sky-300'], L2: ['L2','bg-amber-500/15 text-amber-300'], L3: ['L3','bg-red-500/15 text-red-300'] }
const CONTRATO = { empresa: ['Empresa','bg-brand-500/15 text-brand-300'], ett: ['ETT','bg-purple-500/15 text-purple-300'] }

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ driver, size = 10 }) {
  const sz = `h-${size} w-${size}`
  const txt = size >= 16 ? 'text-2xl' : size >= 12 ? 'text-lg' : 'text-xs'
  return driver.photo_url
    ? <img src={driver.photo_url} alt="" className={`${sz} rounded-full object-cover`} />
    : <div className={`${sz} shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br ${avatarGrad(driver.name)} ${txt} font-bold text-white shadow-md`}>{initials(driver.name)}</div>
}

// ── Helpers scoring ───────────────────────────────────────────────────────────
const NOW = new Date()
const CUR_MONTH = NOW.getMonth() + 1
const CUR_YEAR  = NOW.getFullYear()
const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// ── Score gauge SVG circular ──────────────────────────────────────────────────
function ScoreRing({ score, size = 80, stroke = 7 }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = score == null ? 0 : Math.min(100, Math.max(0, score)) / 100
  const dash = circ * pct
  const color = score == null ? '#374151'
    : score >= 85 ? '#10b981'
    : score >= 65 ? '#3b82f6'
    : score >= 40 ? '#f59e0b'
    : '#ef4444'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1f2937" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .6s cubic-bezier(.4,0,.2,1)' }} />
    </svg>
  )
}

function ScoreDisplay({ score, size = 80 }) {
  const { t } = useT()
  const label = score == null ? '—'
    : score >= 85 ? t('drv.score.excellent')
    : score >= 65 ? t('drv.score.good')
    : score >= 40 ? t('drv.score.fair')
    : t('drv.score.improve')
  const color = score == null ? 'text-dark-500'
    : score >= 85 ? 'text-emerald-400'
    : score >= 65 ? 'text-blue-400'
    : score >= 40 ? 'text-amber-400'
    : 'text-red-400'
  const numSize = size >= 100 ? 'text-2xl' : 'text-lg'
  const lblSize = size >= 100 ? 'text-[10px]' : 'text-[9px]'
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <ScoreRing score={score} size={size} stroke={size >= 100 ? 9 : 7} />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`${numSize} font-black tabular-nums leading-none ${color}`}>{score ?? '—'}</span>
        <span className={`${lblSize} font-medium text-dark-500 leading-tight mt-0.5`}>{label}</span>
      </div>
    </div>
  )
}

function TrendIcon({ trend, size = 12 }) {
  if (!trend || trend === 'sin_datos') return null
  if (trend === 'mejorando')  return <TrendingUp size={size} className="text-emerald-400" />
  if (trend === 'empeorando') return <TrendingDown size={size} className="text-red-400" />
  return <Minus size={size} className="text-dark-500" />
}

function PillarBars({ s }) {
  const bars = [
    { label: '📋', v: s.compliance,  max: 30, color: '#38bdf8' },
    { label: '⏰', v: s.punctuality, max: 15, color: '#a78bfa' },
    { label: '📸', v: s.evidence,    max: 15, color: '#22d3ee' },
    { label: '🔍', v: s.honesty,     max: 15, color: '#2dd4bf' },
    { label: '🛡️', v: s.conservation,max: 25, color: '#34d399' },
  ]
  return (
    <div className="flex gap-1 items-end h-10">
      {bars.map(b => {
        const pct = Math.round((b.v / b.max) * 100)
        return (
          <div key={b.label} className="flex flex-col items-center gap-0.5 flex-1">
            <div className="w-full rounded-sm overflow-hidden bg-dark-800" style={{ height: 28 }}>
              <div className="w-full rounded-sm transition-all duration-500"
                style={{ height: `${pct}%`, background: b.color, marginTop: `${100-pct}%` }} />
            </div>
            <span className="text-[8px] leading-none">{b.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function InspCount({ count }) {
  const { t } = useT()
  return <div className="text-[10px] text-dark-500 mt-0.5">{count} {t('drv.inspections')}</div>
}

// ── Podio top-3 ───────────────────────────────────────────────────────────────
function PodiumCard({ d, position, size = 90 }) {
  const HEIGHT = { 1: 'pt-0', 2: 'pt-8', 3: 'pt-16' }
  const GLOW   = { 1: 'shadow-amber-500/20', 2: 'shadow-slate-400/10', 3: 'shadow-orange-700/10' }
  const BORDER = { 1: 'border-amber-400/40', 2: 'border-slate-400/30', 3: 'border-orange-700/30' }
  const MEDAL  = { 1: '🥇', 2: '🥈', 3: '🥉' }
  const STREAK_COLOR = !d.clean_streak || d.clean_streak < 3 ? 'text-dark-600'
    : d.clean_streak >= 10 ? 'text-amber-400' : 'text-orange-400'
  return (
    <div className={`flex flex-col items-center ${HEIGHT[position]}`}>
      <div className={`w-full rounded-2xl border ${BORDER[position]} bg-dark-900 p-4 shadow-xl ${GLOW[position]} flex flex-col items-center gap-2`}>
        <span className="text-3xl">{MEDAL[position]}</span>
        {/* Avatar initials */}
        <div className={`h-12 w-12 shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br ${avatarGrad(d.name)} text-sm font-bold text-white shadow-md`}>
          {(d.name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0,2).toUpperCase()}
        </div>
        <ScoreDisplay score={d.total} size={size} />
        <div className="text-center">
          <div className="font-bold text-sm text-white leading-tight truncate max-w-[120px]">{d.name}</div>
          <InspCount count={d.inspections_count} />
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <TrendIcon trend={d.trend} size={11} />
          {d.clean_streak >= 3 && (
            <span className={`flex items-center gap-0.5 font-bold ${STREAK_COLOR}`}>
              <Flame size={10} />{d.clean_streak}
            </span>
          )}
        </div>
        {d.compliance != null && <PillarBars s={d} />}
      </div>
    </div>
  )
}

// ── Lista completa ────────────────────────────────────────────────────────────
function DriverRow({ s, rank, showCenter, expanded, onToggle }) {
  const { t } = useT()
  const rankColor = rank === 1 ? 'text-amber-400' : rank === 2 ? 'text-slate-400' : rank === 3 ? 'text-orange-600' : 'text-dark-600'
  const barColor  = (s.total ?? 0) >= 85 ? 'bg-emerald-500' : (s.total ?? 0) >= 65 ? 'bg-brand-500' : (s.total ?? 0) >= 40 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <>
      <tr className="border-b border-dark-800/50 hover:bg-dark-800/30 cursor-pointer transition-colors" onClick={onToggle}>
        <td className={`py-3 pl-4 w-8 font-bold text-sm tabular-nums ${rankColor}`}>{rank}</td>
        <td className="py-3 pl-2 pr-4">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-dark-100 text-sm truncate max-w-[160px]">{s.name}</span>
            {s.prize_eligible === false && (
              <span className="shrink-0 rounded-full bg-dark-800 px-1.5 py-0.5 text-[9px] font-semibold text-dark-500" title="No elegible para el premio del mes: pocos días asignados">
                no elegible
              </span>
            )}
          </div>
          {showCenter && <div className="text-[10px] text-dark-500">{s.center}</div>}
        </td>
        <td className="py-3 px-3">
          {/* Barra de puntuación + número */}
          <div className="flex items-center gap-2 min-w-[120px]">
            <div className="flex-1 h-2 rounded-full bg-dark-800 overflow-hidden">
              <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${s.total ?? 0}%` }} />
            </div>
            <span className="text-sm font-bold tabular-nums text-dark-200 w-7 text-right">{s.total ?? '—'}</span>
          </div>
        </td>
        <td className="py-3 px-2 text-center">
          <TrendIcon trend={s.trend} size={13} />
        </td>
        <td className="py-3 px-2 text-center">
          {s.clean_streak >= 3 && (
            <span className={`flex items-center justify-center gap-0.5 text-xs font-bold ${s.clean_streak >= 10 ? 'text-amber-400' : s.clean_streak >= 5 ? 'text-orange-400' : 'text-dark-500'}`}>
              <Flame size={11} />{s.clean_streak}
            </span>
          )}
        </td>
        <td className="py-3 pr-3 text-dark-600 text-right">
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-dark-800/50">
          <td colSpan={6} className="px-4 pb-4 pt-2 bg-dark-900/40">
            {/* Barras de pilares */}
            <div className="grid grid-cols-5 gap-2 mb-3">
              {[
                { l: '📋 Cumpl.', v: s.compliance,  max: 30, c: 'bg-sky-500' },
                { l: '⏰ Puntual.', v: s.punctuality,max: 15, c: 'bg-violet-500' },
                { l: '📸 Evidencia', v: s.evidence, max: 15, c: 'bg-cyan-500' },
                { l: '🔍 Honest.', v: s.honesty,    max: 15, c: 'bg-teal-500' },
                { l: '🛡️ Conserv.', v: s.conservation,max: 25, c: 'bg-emerald-500' },
              ].map(b => (
                <div key={b.l}>
                  <div className="flex justify-between text-[9px] text-dark-500 mb-0.5">
                    <span>{b.l}</span><span className="tabular-nums">{b.v}/{b.max}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-dark-800 overflow-hidden">
                    <div className={`h-full rounded-full ${b.c}`} style={{ width: `${(b.v/b.max)*100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 text-[11px] text-dark-500">
              <span>{s.inspections_count} {t('drv.insp.month')}</span>
              {s.days_assigned > 0 && <span>{s.days_assigned} {t('drv.days.assigned')}</span>}
              {s.damage_rate != null && <span>{t('drv.damage.rate')} <b className="text-dark-300">{s.damage_rate.toFixed(2)}</b>{t('drv.per.insp')}</span>}
              {s.clean_streak > 0 && <span className="text-orange-400 font-semibold flex items-center gap-0.5"><Flame size={10} />{s.clean_streak} {t('drv.clean.streak')}</span>}
            </div>
            {s.delta_events?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {s.delta_events.map((e, j) => (
                  <span key={j} className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                    e.to_sev === 'critico' ? 'bg-red-500/15 text-red-300' :
                    e.to_sev === 'grave' ? 'bg-orange-500/15 text-orange-300' :
                    'bg-amber-500/15 text-amber-300'}`}>
                    {e.to_sev} · {e.part}
                  </span>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Vista scoring unificada (ranking + lista) ─────────────────────────────────
function ScoringView({ center }) {
  const { t } = useT()
  const [data, setData]   = useState(null)
  const [lb, setLb]       = useState(null)
  const [month, setMonth] = useState(CUR_MONTH)
  const [year, setYear]   = useState(CUR_YEAR)
  const [expanded, setExpanded] = useState(null)
  const [centerTab, setCenterTab] = useState(null)   // null = primer centro disponible

  useEffect(() => {
    setData(null); setLb(null)
    Promise.all([
      getDriversScoring(month, year),
      getScoringLeaderboard(month, year),
    ]).then(([rd, rl]) => {
      setData(rd.data)
      setLb(rl.data)
    }).catch(() => { setData({ scores: [] }); setLb({ leaderboard: {}, center_stats: {} }) })
  }, [month, year])

  // Centros disponibles
  const availableCenters = useMemo(() => {
    const s = new Set()
    if (center !== 'Todos') return [center]
    ;(data?.scores || []).forEach(d => d.center && s.add(d.center))
    return [...s].sort()
  }, [data, center])

  const activeCtr = centerTab ?? availableCenters[0] ?? null

  useEffect(() => { setCenterTab(null) }, [center])

  const scores = useMemo(() => {
    const all = data?.scores || []
    const filtered = activeCtr ? all.filter(s => s.center === activeCtr) : all
    return filtered
  }, [data, activeCtr])

  const ranked   = scores.filter(s => !s.insufficient)
  const unranked = scores.filter(s => s.insufficient)
  // El PODIO solo admite elegibles para el premio (≥35% de días asignados):
  // nadie gana el mes con 3 días buenos. La lista completa muestra a todos.
  const top3     = ranked.filter(s => s.prize_eligible !== false).slice(0, 3)
  const rest     = ranked.slice(3)

  const stats = lb?.center_stats?.[activeCtr] || {}

  const monthPicker = (
    <select className="select text-xs py-1 px-2" value={`${year}-${month}`}
      onChange={e => { const [y,m] = e.target.value.split('-'); setYear(+y); setMonth(+m) }}>
      {Array.from({ length: 6 }, (_, i) => {
        const d = new Date(CUR_YEAR, CUR_MONTH - 1 - i, 1)
        const yy = d.getFullYear(); const mm = d.getMonth() + 1
        return <option key={i} value={`${yy}-${mm}`}>{MONTHS_ES[d.getMonth()]} {yy}</option>
      })}
    </select>
  )

  if (!data) return (
    <div className="flex items-center gap-2 py-16 text-dark-400 justify-center">
      <Loader2 size={18} className="animate-spin" /> {t('drv.ranking.loading')}
    </div>
  )

  return (
    <div>
      {/* Header con mes y tabs de centro */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-amber-400" />
          <span className="font-bold text-base">{t('drv.ranking.title')}</span>
          {stats.avg_score != null && (
            <span className="text-xs text-dark-500 ml-2">{t('drv.ranking.avg')} <span className="text-dark-300 font-semibold">{stats.avg_score}</span></span>
          )}
          {data?.prize_min_days != null && (
            <span className="ml-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-400"
              title="Para optar al premio: al menos el 35% de los días del mes con asignación en el cuadrante. Los daños marcados como falso positivo en Revisión Rápida no penalizan.">
              🏆 Premio: mín. {data.prize_min_days} días asignados
            </span>
          )}
        </div>
        {monthPicker}
      </div>

      {/* Tabs por centro (si hay varios) */}
      {availableCenters.length > 1 && (
        <div className="flex gap-0 border-b border-dark-800 mb-6 overflow-x-auto">
          {availableCenters.map(c => (
            <button key={c} onClick={() => { setCenterTab(c); setExpanded(null) }}
              className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                activeCtr === c ? 'border-brand-400 text-brand-300' : 'border-transparent text-dark-500 hover:text-dark-300'
              }`}>{c}</button>
          ))}
        </div>
      )}

      {ranked.length === 0 ? (
        <div className="py-16 text-center text-dark-500">
          <Trophy size={40} className="mx-auto mb-3 text-dark-700" />
          <p className="font-medium">{t('drv.ranking.no.data')} — {MONTHS_ES[month-1]} {year}</p>
          <p className="text-xs text-dark-600 mt-1">{t('drv.ranking.min.insp')}</p>
        </div>
      ) : (
        <>
          {/* ── PODIO TOP 3 ── */}
          {top3.length > 0 && (
            <div className="mb-8">
              <div className="grid gap-3"
                style={{ gridTemplateColumns: top3.length === 3 ? '1fr 1fr 1fr' : top3.length === 2 ? '1fr 1fr' : '1fr' }}>
                {/* Reordenar: plata-oro-bronce para efecto podio real */}
                {(() => {
                  const ordered = top3.length === 3
                    ? [top3[1], top3[0], top3[2]]   // plata izquierda, oro centro, bronce derecha
                    : top3
                  return ordered.map(d => d && (
                    <PodiumCard key={d.driver_id} d={d} position={d.position} size={top3.length >= 2 ? 100 : 120} />
                  ))
                })()}
              </div>
            </div>
          )}

          {/* ── LISTA COMPLETA ── */}
          <div className="rounded-xl border border-dark-800 overflow-hidden">
            <div className="bg-dark-900/60 px-4 py-2.5 border-b border-dark-800 flex items-center gap-2">
              <BarChart2 size={13} className="text-dark-500" />
              <span className="text-xs font-semibold text-dark-400 uppercase tracking-wider">{t('drv.ranking.full')}</span>
              <span className="ml-auto text-xs text-dark-600">{ranked.length} clasificados</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-800 text-[10px] text-dark-500 uppercase tracking-wider">
                  <th className="py-2 pl-4 text-left w-8">#</th>
                  <th className="py-2 pl-2 text-left">{t('drv.col.driver')}</th>
                  <th className="py-2 px-3 text-left">{t('drv.col.score')}</th>
                  <th className="py-2 px-2 text-center">{t('drv.col.trend')}</th>
                  <th className="py-2 px-2 text-center">{t('drv.col.streak')}</th>
                  <th className="py-2 pr-3 w-6" />
                </tr>
              </thead>
              <tbody>
                {ranked.map((s, i) => (
                  <DriverRow key={s.driver_id} s={s} rank={i+1} showCenter={center === 'Todos' && !activeCtr}
                    expanded={expanded === s.driver_id}
                    onToggle={() => setExpanded(expanded === s.driver_id ? null : s.driver_id)} />
                ))}
              </tbody>
            </table>
            {unranked.length > 0 && (
              <div className="border-t border-dark-800 px-4 py-2 text-[11px] text-dark-600 flex items-center gap-1.5">
                <AlertCircle size={11} /> {unranked.length} {t('drv.col.no.data')}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Conductores() {
  const { center, centers } = useOutletContext()
  const { t } = useT()
  const [drivers, setDrivers] = useState(null)
  const [accounts, setAccounts] = useState([]) // driver_ids que tienen contraseña
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null) // null | { driver: obj|null }
  const [tab, setTab] = useState('directorio') // directorio | ranking | scoring
  const [searchParams, setSearchParams] = useSearchParams()

  // Deep-link desde la paleta de comandos: /panel/conductores?open=<id>
  useEffect(() => {
    const openId = searchParams.get('open')
    if (openId && drivers) {
      const d = drivers.find((x) => x.id === openId)
      if (d) setModal({ driver: d })
      setSearchParams({}, { replace: true })
    }
  }, [drivers]) // eslint-disable-line

  async function load() {
    try {
      const [rd, ra] = await Promise.all([getDrivers(center), getDriverAccounts()])
      setDrivers(rd.data || [])
      setAccounts((ra.data || []).map(a => a.driver_id))
    } catch {
      try { const r = await getDrivers(center); setDrivers(r.data || []) } catch { setDrivers([]) }
      setAccounts([])
    }
  }
  useEffect(() => { setDrivers(null); setModal(null); load() }, [center]) // eslint-disable-line

  const list = useMemo(() => (drivers || [])
    .filter(d => !q || [d.name, d.email, d.center].some(v => (v || '').toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
  [drivers, q])

  async function handleSave(id, data) {
    if (id) await updateDriver(id, data); else await createDriver(data)
    setModal(null); setDrivers(null); load()
  }
  async function handleDelete(d) {
    if (!confirm(`¿Eliminar a ${d.name}?`)) return
    await deleteDriver(d.id); setModal(null); setDrivers(null); load()
  }

  const TABS = [
    { id: 'directorio', label: t('drv.title') },
    { id: 'ranking',    label: `🏆 ${t('sc.ranking')}` },
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('drv.title')}</h1>
          <p className="mt-0.5 text-xs text-dark-500">
            {(drivers || []).length} conductor{(drivers || []).length !== 1 ? 'es' : ''}
            {center !== 'Todos' ? ` · ${center}` : ''}
          </p>
        </div>
        {tab === 'directorio' && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input className="input w-52 pl-9 text-sm" placeholder={t('drv.search')} value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <button
              onClick={() => setModal({ driver: null })}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 hover:bg-brand-600 transition-colors"
            >
              <Plus size={15} /> {t('drv.add')}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-dark-800 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-brand-400 text-brand-300'
                : 'border-transparent text-dark-500 hover:text-dark-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Directorio */}
      {tab === 'directorio' && (
        !drivers
          ? <div className="flex items-center gap-2 py-16 text-dark-400"><Loader2 size={18} className="animate-spin" /> {t('ui.loading')}</div>
          : list.length === 0
            ? <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-dark-700 py-24 text-center">
                <UserCheck size={48} className="mb-4 text-dark-700" />
                <p className="font-medium text-dark-400">{t('drv.empty')}{center !== 'Todos' ? ` en ${center}` : ''}</p>
                <p className="mt-1 text-sm text-dark-600">{t('drv.add')}</p>
                <button onClick={() => setModal({ driver: null })} className="mt-5 flex items-center gap-1.5 rounded-lg bg-brand-500/15 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-500/25">
                  <Plus size={14} /> {t('drv.add')}
                </button>
              </div>
            : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {list.map(d => {
                  const [nl, nc] = NIVEL[d.nivel] || []
                  const [cl, cc] = CONTRATO[d.contrato] || []
                  const hasAcc = accounts.includes(d.id)
                  return (
                    <button
                      key={d.id}
                      onClick={() => setModal({ driver: d })}
                      className="group flex flex-col rounded-2xl border border-dark-800 bg-dark-900 p-5 text-left transition-all hover:border-dark-700 hover:bg-dark-800/70 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5"
                    >
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <Avatar driver={d} size={12} />
                        <div className="flex flex-wrap gap-1 justify-end">
                          {hasAcc && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 flex items-center gap-1"><Lock size={9} />PIN</span>}
                          {cc && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cc}`}>{cl}</span>}
                          {nc && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${nc}`}>{nl}</span>}
                        </div>
                      </div>
                      <div className="font-semibold text-dark-50 truncate">{d.name}</div>
                      {d.center && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-dark-500">
                          <MapPin size={10} />{d.center}
                        </div>
                      )}
                      {d.alojamiento && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-dark-500">
                          <Building2 size={10} />{d.alojamiento}
                        </div>
                      )}
                      <div className="mt-3 border-t border-dark-800 pt-3 flex flex-col gap-0.5">
                        {d.phone && <span className="flex items-center gap-1.5 text-[11px] text-dark-500"><Phone size={10} />{d.phone}</span>}
                        {d.email && <span className="flex items-center gap-1.5 text-[11px] text-dark-500 truncate"><Mail size={10} />{d.email}</span>}
                        {!d.phone && !d.email && <span className="text-[11px] text-dark-700">{t('drv.no.contact')}</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
      )}

      {/* Ranking + scoring unificado */}
      {tab === 'ranking' && <ScoringView center={center} />}

      {/* Modal */}
      {modal && (
        <DriverModal
          driver={modal.driver}
          centers={centers}
          hasAccount={accounts.includes(modal.driver?.id)}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
          onAccountChange={load}
        />
      )}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function DriverModal({ driver, centers, hasAccount, onSave, onDelete, onClose, onAccountChange }) {
  const { t } = useT()
  useEscape(onClose)
  const isNew = !driver
  const [editing, setEditing] = useState(isNew)
  const [form, setForm] = useState(driver ? { ...driver } : { ...EMPTY })
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(driver?.photo_url || null)
  const [err, setErr] = useState('')
  const photoRef = useRef()

  // Gestión de contraseña
  const [pwSection, setPwSection] = useState(false)
  const [pwValue, setPwValue] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwShow, setPwShow] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)
  const [pwErr, setPwErr] = useState('')
  const [pwOk, setPwOk] = useState('')

  async function handleSetPassword() {
    setPwErr(''); setPwOk('')
    if (pwValue.length < 6) { setPwErr('La contraseña debe tener al menos 6 caracteres.'); return }
    if (pwValue !== pwConfirm) { setPwErr('Las contraseñas no coinciden.'); return }
    setPwBusy(true)
    try {
      await setDriverPassword(driver.id, pwValue)
      setPwOk('Contraseña guardada. El conductor debe usarla en su próximo acceso.')
      setPwValue(''); setPwConfirm('')
      onAccountChange()
    } catch (ex) {
      setPwErr(ex?.response?.data?.detail || 'Error al guardar la contraseña.')
    }
    setPwBusy(false)
  }

  async function handleRemovePassword() {
    if (!confirm(`¿Quitar la contraseña de ${driver.name}? Volverá a acceder solo con su email.`)) return
    setPwBusy(true); setPwErr(''); setPwOk('')
    try {
      await deleteDriverAccount(driver.id)
      setPwOk('Contraseña eliminada. El conductor accederá solo con su email.')
      onAccountChange()
    } catch (ex) {
      setPwErr(ex?.response?.data?.detail || 'Error al eliminar la cuenta.')
    }
    setPwBusy(false)
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function cancel() { if (isNew) onClose(); else { setForm({ ...driver }); setEditing(false); setErr('') } }

  async function submit(e) {
    e.preventDefault()
    if (!form.name?.trim()) { setErr('El nombre es obligatorio.'); return }
    setBusy(true); setErr('')
    try { await onSave(driver?.id || null, form) }
    catch (ex) { setErr(ex?.response?.data?.detail || 'Error al guardar.'); setBusy(false) }
  }

  async function handlePhoto(e) {
    const file = e.target.files?.[0]
    if (!file || !driver?.id) return
    setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file) })
    setPhotoBusy(true)
    try {
      const r = await uploadDriverPhoto(driver.id, file)
      setForm(f => ({ ...f, photo_url: r.data.photo_url }))
    } catch { setErr('Error subiendo la foto.') }
    finally { setPhotoBusy(false) }
  }

  const [nl, nc] = NIVEL[driver?.nivel] || []
  const [cl, cc] = CONTRATO[driver?.contrato] || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel — mitad de pantalla */}
      <div
        className="relative z-10 flex w-full max-w-2xl flex-col rounded-2xl border border-dark-700 bg-dark-900 shadow-2xl shadow-black/50 overflow-hidden"
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-dark-800 px-6 py-4">
          <div className="flex items-center gap-3">
            {/* Avatar clickable para cambiar foto */}
            {driver && (
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                className="group relative shrink-0"
                title="Cambiar foto"
                disabled={photoBusy}
              >
                <div className="h-10 w-10 overflow-hidden rounded-full">
                  {previewUrl
                    ? <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                    : <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${avatarGrad(driver.name)} text-sm font-bold text-white`}>{initials(driver.name)}</div>}
                </div>
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  {photoBusy ? <Loader2 size={14} className="animate-spin text-white" /> : <Camera size={14} className="text-white" />}
                </div>
              </button>
            )}
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            <div>
              <h2 className="font-bold text-dark-50">
                {isNew ? t('drv.new') : driver.name}
              </h2>
              {driver?.center && !editing && (
                <p className="text-xs text-dark-500 flex items-center gap-1 mt-0.5"><MapPin size={10} />{driver.center}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isNew && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 rounded-lg bg-dark-800 px-3 py-1.5 text-xs font-semibold text-dark-200 hover:bg-dark-700 transition-colors"
              >
                <Pencil size={12} /> {t('ui.edit')}
              </button>
            )}
            {!isNew && (
              <button
                onClick={() => onDelete(driver)}
                className="rounded-lg bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 transition-colors"
                title="Eliminar conductor"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-800 hover:text-dark-200 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Vista detalle ── */}
          {!editing && driver && (
            <div className="p-6">
              {/* Tags */}
              {(cc || nc) && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {cc && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cc}`}>{cl}</span>}
                  {nc && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${nc}`}>{nl}</span>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                <Detail icon={IdCard}    label="DNI / NIE"        value={driver.dni} />
                <Detail icon={Phone}     label="Teléfono"         value={driver.phone} />
                <Detail icon={Mail}      label="Email"            value={driver.email} span={2} />
                <Detail icon={Car}       label="Nº carnet"        value={driver.license_number} />
                <Detail icon={FileText}  label="ID Amazon"        value={driver.driver_id} mono />
                <Detail icon={MapPin}    label="Centro"           value={driver.center} />
                <Detail icon={Building2} label="Alojamiento"      value={driver.alojamiento} />
                {driver.notas && (
                  <div className="col-span-2 rounded-xl bg-dark-800/60 p-4">
                    <div className="text-[10px] uppercase tracking-widest text-dark-500 mb-1">Notas</div>
                    <p className="text-sm text-dark-200 whitespace-pre-wrap">{driver.notas}</p>
                  </div>
                )}
              </div>

              {/* ── Acceso con contraseña ── */}
              {driver.email && (
                <div className="mt-6 rounded-xl border border-dark-800 overflow-hidden">
                  <button
                    onClick={() => { setPwSection(v => !v); setPwErr(''); setPwOk('') }}
                    className="flex w-full items-center justify-between px-4 py-3 hover:bg-dark-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {hasAccount
                        ? <ShieldCheck size={15} className="text-emerald-400" />
                        : <LockOpen size={15} className="text-dark-500" />}
                      <span className="text-sm font-semibold text-dark-200">Acceso con contraseña</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${hasAccount ? 'bg-emerald-500/15 text-emerald-400' : 'bg-dark-800 text-dark-500'}`}>
                        {hasAccount ? 'Activado' : 'Sin contraseña'}
                      </span>
                    </div>
                    <span className="text-xs text-dark-600">{pwSection ? '▲' : '▼'}</span>
                  </button>

                  {pwSection && (
                    <div className="border-t border-dark-800 px-4 py-4 space-y-3 bg-dark-950/40">
                      <p className="text-xs text-dark-500">
                        {hasAccount
                          ? 'El conductor debe introducir su email y contraseña para acceder al portal. Puedes cambiarla o eliminarla aquí.'
                          : 'Sin contraseña, el conductor accede solo con su email. Activa una contraseña para mayor seguridad.'}
                      </p>

                      {hasAccount && (
                        <button
                          onClick={handleRemovePassword}
                          disabled={pwBusy}
                          className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          <LockOpen size={12} /> Quitar contraseña
                        </button>
                      )}

                      <div>
                        <Label>{hasAccount ? 'Nueva contraseña' : 'Establecer contraseña'}</Label>
                        <div className="relative">
                          <input
                            type={pwShow ? 'text' : 'password'}
                            className="input w-full pr-10"
                            value={pwValue}
                            onChange={e => setPwValue(e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            autoComplete="new-password"
                          />
                          <button type="button" onClick={() => setPwShow(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300">
                            {pwShow ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <Label>Confirmar contraseña</Label>
                        <input
                          type={pwShow ? 'text' : 'password'}
                          className="input w-full"
                          value={pwConfirm}
                          onChange={e => setPwConfirm(e.target.value)}
                          placeholder="Repite la contraseña"
                          autoComplete="new-password"
                        />
                      </div>

                      {pwErr && <p className="text-xs text-red-400">{pwErr}</p>}
                      {pwOk  && <p className="text-xs text-emerald-400">{pwOk}</p>}

                      <button
                        onClick={handleSetPassword}
                        disabled={pwBusy || !pwValue || !pwConfirm}
                        className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
                      >
                        {pwBusy ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
                        {hasAccount ? 'Cambiar contraseña' : 'Guardar contraseña'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Formulario ── */}
          {editing && (
            <form id="driver-form" onSubmit={submit} className="p-6">
              {err && <p className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{err}</p>}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Nombre completo *</Label>
                  <input className="input w-full" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre Apellido" autoFocus />
                </div>

                <div>
                  <Label>Centro</Label>
                  <select className="select w-full" value={form.center || ''} onChange={e => set('center', e.target.value)}>
                    <option value="">— Sin asignar —</option>
                    {centers.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <Label>Alojamiento</Label>
                  <input className="input w-full" value={form.alojamiento || ''} onChange={e => set('alojamiento', e.target.value)} placeholder="Nombre del alojamiento" />
                </div>

                <div>
                  <Label>Tipo de contrato</Label>
                  <select className="select w-full" value={form.contrato || ''} onChange={e => set('contrato', e.target.value)}>
                    <option value="">—</option>
                    <option value="empresa">Empresa</option>
                    <option value="ett">ETT</option>
                  </select>
                </div>

                <div>
                  <Label>Nivel</Label>
                  <select className="select w-full" value={form.nivel || ''} onChange={e => set('nivel', e.target.value)}>
                    <option value="">—</option>
                    <option value="pleno">Pleno</option>
                    <option value="L1">L1</option>
                    <option value="L2">L2</option>
                    <option value="L3">L3</option>
                  </select>
                </div>

                <div>
                  <Label>DNI / NIE</Label>
                  <input className="input w-full" value={form.dni || ''} onChange={e => set('dni', e.target.value)} placeholder="12345678A" />
                </div>

                <div>
                  <Label>Teléfono</Label>
                  <input className="input w-full" value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+34 600 000 000" />
                </div>

                <div className="col-span-2">
                  <Label>Email</Label>
                  <input className="input w-full" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="conductor@email.com" />
                </div>

                <div>
                  <Label>Nº carnet conducir</Label>
                  <input className="input w-full" value={form.license_number || ''} onChange={e => set('license_number', e.target.value)} />
                </div>

                <div>
                  <Label>ID Amazon</Label>
                  <input className="input w-full font-mono" value={form.driver_id || ''} onChange={e => set('driver_id', e.target.value)} placeholder="AMZN-XXXX" />
                </div>

                <div className="col-span-2">
                  <Label>Notas internas</Label>
                  <textarea className="input w-full resize-none" rows={3} value={form.notas || ''} onChange={e => set('notas', e.target.value)} placeholder="Observaciones, preferencias, información adicional…" />
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        {editing && (
          <div className="flex items-center justify-between border-t border-dark-800 px-6 py-4">
            <button type="button" onClick={cancel} className="rounded-lg bg-dark-800 px-4 py-2 text-sm font-semibold text-dark-300 hover:bg-dark-700 transition-colors">
              {t('ui.cancel')}
            </button>
            <button
              type="submit"
              form="driver-form"
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {busy ? t('ui.saving') : t('ui.save')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Detail({ icon: Icon, label, value, span = 1, mono }) {
  if (!value) return null
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <div className="text-[10px] uppercase tracking-widest text-dark-500 mb-1">{label}</div>
      <div className={`flex items-center gap-2 ${mono ? 'font-mono text-sm text-dark-300' : 'text-sm font-medium text-dark-100'}`}>
        <Icon size={13} className="shrink-0 text-dark-600" />
        {value}
      </div>
    </div>
  )
}

function Label({ children }) {
  return <label className="mb-1.5 block text-xs font-medium text-dark-400">{children}</label>
}
