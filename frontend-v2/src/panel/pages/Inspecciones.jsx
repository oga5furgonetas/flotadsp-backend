import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, Search, X, FileText, Image as ImageIcon, ShieldQuestion, User, ChevronDown,
  ShieldCheck, FileSignature, ShieldAlert, RefreshCw,
} from 'lucide-react'
import { getInspections, getVehicles, getDrivers, getVehicleInspections, fetchAuthedBlob, getForensicStatus, signInspectionAdmin, recheckFraud } from '../api'

const SEV_LABEL = { sin_danos: 'Sin daños', sin_analisis: 'Sin análisis', leve: 'Leve', moderado: 'Moderado', grave: 'Grave', critico: 'Crítico' }
const SEV_CLS = {
  leve: 'bg-amber-500/20 text-amber-300', moderado: 'bg-orange-500/20 text-orange-300',
  grave: 'bg-red-500/20 text-red-300', critico: 'bg-red-600/30 text-red-200',
  sin_danos: 'bg-emerald-500/20 text-emerald-300', sin_analisis: 'bg-dark-700 text-dark-300',
}
const SEV_DOT = { leve: 'bg-amber-400', moderado: 'bg-orange-400', grave: 'bg-red-400', critico: 'bg-red-500', sin_danos: 'bg-emerald-400', sin_analisis: 'bg-dark-500' }
const FILTERS = ['Todas', 'grave', 'critico', 'moderado', 'leve', 'sin_danos']

const fmt = (s) => { const d = new Date(s); return isNaN(d) ? (s || '') : d.toLocaleString('es', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) }
const fmtDay = (s) => { const d = new Date(s); return isNaN(d) ? (s || '') : d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) }
const eur = (n) => (n ? `${Number(n).toLocaleString('es')} €` : '—')

export default function Inspecciones() {
  const { center } = useOutletContext()
  const [insps, setInsps] = useState(null)
  const [vmap, setVmap] = useState({})
  const [dmap, setDmap] = useState({})
  const [err, setErr] = useState('')
  const [sev, setSev] = useState('Todas')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)

  useEffect(() => {
    setErr('')
    Promise.all([getInspections({ limit: 300 }), getVehicles('Todos'), getDrivers('Todos').catch(() => ({ data: [] }))])
      .then(([ri, rv, rd]) => {
        const m = {}; (rv.data || []).forEach((v) => { m[v.id] = { plate: v.license_plate, center: v.center || '' } })
        const dm = {}; (rd.data || []).forEach((d) => { dm[d.id] = d.name })
        setVmap(m); setDmap(dm); setInsps(ri.data || [])
      })
      .catch(() => setErr('No se pudieron cargar las inspecciones.'))
  }, [])

  const list = useMemo(() => {
    if (!insps) return []
    return insps.filter((i) => {
      const v = vmap[i.vehicle_id] || {}
      if (center !== 'Todos' && !(v.center || '').toUpperCase().includes(center.toUpperCase())) return false
      const s = i.analysis?.severity || 'sin_analisis'
      if (sev !== 'Todas' && s !== sev) return false
      if (q && !(v.plate || '').toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [insps, vmap, center, sev, q])

  async function openForensicPdf(id) {
    try { const url = await fetchAuthedBlob(`/inspections/${id}/forensic-pdf`); window.open(url, '_blank') }
    catch (e) { setErr(e?.response?.data?.detail || 'No se pudo generar el peritaje (debe estar firmado).') }
  }

  if (err) return <p className="text-red-400">{err}</p>
  if (!insps) return <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> Cargando…</div>

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Inspecciones <span className="text-dark-500">· {list.length}</span></h1>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input className="input w-56 pl-9" placeholder="Buscar matrícula…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setSev(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ${sev === f ? 'bg-brand-500/20 text-brand-300' : 'bg-dark-800 text-dark-400 hover:text-dark-200'}`}>
            {f === 'Todas' ? 'Todas' : SEV_LABEL[f]}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card p-10 text-center text-dark-400">Sin inspecciones con estos filtros.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((i) => {
            const v = vmap[i.vehicle_id] || {}
            const s = i.analysis?.severity || 'sin_analisis'
            return (
              <button key={i.id} onClick={() => setSel(i)} className="card-hover overflow-hidden text-left">
                <div className="relative h-36 bg-dark-800">
                  {i.photos?.[0] ? <img src={i.photos[0]} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-dark-600"><ImageIcon size={24} /></div>}
                  <span className={`absolute left-2 top-2 rounded px-2 py-0.5 text-[11px] font-bold ${SEV_CLS[s]}`}>{SEV_LABEL[s] || s}</span>
                  {i.forensic_signed && <span className="absolute right-2 top-2 flex items-center gap-0.5 rounded bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white" title="Inspección firmada"><ShieldCheck size={10} /> Firmada</span>}
                  {typeof i.fraud_score === 'number' && i.fraud_score >= 70 && (
                    <span className={`absolute left-2 bottom-2 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${i.fraud_score >= 85 ? 'bg-red-600' : 'bg-amber-500'}`} title={`Score ${i.fraud_score}/100`}>
                      <ShieldAlert size={10} /> {i.fraud_score >= 85 ? 'Fraude' : 'Sospechoso'}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between"><span className="font-bold">{v.plate || '—'}</span><span className="text-xs text-dark-500">{fmt(i.created_at)}</span></div>
                  <div className="mt-1 flex items-center justify-between text-xs text-dark-400"><span>{i.analysis?.total_damages_count || 0} daños</span><span>{eur(i.analysis?.total_estimated_cost)}</span></div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {sel && <Detail insp={sel} plate={vmap[sel.vehicle_id]?.plate} dmap={dmap} onClose={() => setSel(null)} onPdf={openForensicPdf} />}
    </div>
  )
}

function Detail({ insp, plate, dmap, onClose, onPdf }) {
  const [pi, setPi] = useState(0)
  const [tab, setTab] = useState('danos') // 'danos' | 'quien'
  const a = insp.analysis || {}
  const damages = a.damages || []

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-dark-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* cabecera */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-dark-800 bg-dark-900/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{plate || 'Inspección'}</span>
            <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${SEV_CLS[a.severity] || SEV_CLS.sin_analisis}`}>{SEV_LABEL[a.severity] || a.severity || '—'}</span>
          </div>
          <button onClick={onClose} className="btn-ghost p-2"><X size={18} /></button>
        </div>

        <div className="p-5">
          {/* foto + cajas */}
          <div className="relative overflow-hidden rounded-lg bg-black">
            {insp.photos?.[pi] && <img src={insp.photos[pi]} alt="" className="w-full" />}
            {damages.filter((d) => Array.isArray(d.box_2d) && d.box_2d.length === 4 && (!d.photo_index || d.photo_index - 1 === pi) && d.box_2d.some((n) => n > 0)).map((d, k) => {
              const [y, x, y2, x2] = d.box_2d
              return <div key={k} className="pointer-events-none absolute rounded border-2 border-orange-400" style={{ left: `${x / 10}%`, top: `${y / 10}%`, width: `${(x2 - x) / 10}%`, height: `${(y2 - y) / 10}%` }} />
            })}
          </div>
          {insp.photos?.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {insp.photos.map((p, k) => (
                <button key={k} onClick={() => setPi(k)} className={`h-12 w-14 shrink-0 overflow-hidden rounded border-2 ${k === pi ? 'border-brand-400' : 'border-transparent opacity-70'}`}><img src={p} alt="" className="h-full w-full object-cover" /></button>
              ))}
            </div>
          )}

          {/* resumen compacto (chips, no parrafo) */}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-dark-800 px-2.5 py-1">{a.total_damages_count || 0} daños</span>
            <span className="rounded-full bg-dark-800 px-2.5 py-1 font-semibold text-dark-200">{eur(a.total_estimated_cost)}</span>
            <span className="rounded-full bg-dark-800 px-2.5 py-1">{fmt(insp.created_at)}</span>
            {insp.driver_id && dmap[insp.driver_id] && <span className="flex items-center gap-1 rounded-full bg-dark-800 px-2.5 py-1"><User size={11} /> {dmap[insp.driver_id]}</span>}
          </div>

          {/* pestañas */}
          <div className="mt-4 flex gap-1 border-b border-dark-800">
            <button onClick={() => setTab('danos')} className={`px-3 py-2 text-sm font-medium ${tab === 'danos' ? 'border-b-2 border-brand-400 text-brand-300' : 'text-dark-400'}`}>Daños</button>
            <button onClick={() => setTab('quien')} className={`flex items-center gap-1 px-3 py-2 text-sm font-medium ${tab === 'quien' ? 'border-b-2 border-brand-400 text-brand-300' : 'text-dark-400'}`}><ShieldQuestion size={14} /> ¿Quién lo golpeó?</button>
          </div>

          {tab === 'danos' ? (
            <div className="mt-3 space-y-2">
              {damages.length === 0 ? <div className="card p-4 text-center text-sm text-dark-500">Sin daños detectados.</div> :
                damages.map((d, k) => <DamageRow key={k} d={d} />)}
              {a.executive_summary && (
                <details className="mt-2 text-sm text-dark-400">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-dark-500">Resumen del peritaje</summary>
                  <p className="mt-2 leading-relaxed">{a.executive_summary}</p>
                </details>
              )}
            </div>
          ) : (
            <QuienTimeline vehicleId={insp.vehicle_id} dmap={dmap} currentId={insp.id} />
          )}

          <FraudBlock insp={insp} />
          <ForensicSignBlock inspId={insp.id} onPdf={onPdf} />
        </div>
      </div>
    </div>
  )
}

function FraudBlock({ insp }) {
  const [score, setScore] = useState(typeof insp.fraud_score === 'number' ? insp.fraud_score : null)
  const [reasons, setReasons] = useState(insp.fraud_reasons || [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function recheck() {
    setBusy(true); setErr('')
    try {
      const r = await recheckFraud(insp.id)
      setScore(r.data?.score ?? 0)
      setReasons(r.data?.reasons || [])
    } catch (e) { setErr(e?.response?.data?.detail || 'No se pudo recalcular.') }
    setBusy(false)
  }

  // Si nunca se ha calculado, mostrar botón para forzar.
  if (score === null) {
    return (
      <div className="mt-4 rounded-lg border border-dark-800 bg-dark-800/30 p-3 text-sm">
        <div className="mb-1.5 flex items-center gap-2 text-dark-300"><ShieldAlert size={14} /> Análisis de fraude no ejecutado</div>
        <button onClick={recheck} disabled={busy} className="btn-secondary flex items-center gap-1.5 text-xs disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Comprobar ahora
        </button>
        {err && <p className="mt-1 text-xs text-red-400">{err}</p>}
      </div>
    )
  }

  const level = score >= 85 ? 'high' : score >= 70 ? 'mid' : 'low'
  const cls = level === 'high' ? 'border-red-500/40 bg-red-500/10 text-red-200'
            : level === 'mid' ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
            : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200'
  const Icon = level === 'low' ? ShieldCheck : ShieldAlert
  const title = level === 'high' ? 'POSIBLE FRAUDE' : level === 'mid' ? 'Indicios sospechosos' : 'Sin indicios de fraude'

  return (
    <div className={`mt-4 rounded-lg border p-3 text-sm ${cls}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold"><Icon size={15} /> {title} <span className="text-xs opacity-70">({score}/100)</span></span>
        <button onClick={recheck} disabled={busy} className="btn-ghost p-1 text-xs disabled:opacity-50" title="Recomprobar">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </button>
      </div>
      {reasons.length > 0 ? (
        <ul className="ml-1 space-y-1 text-xs">
          {reasons.map((r, i) => (
            <li key={i}>• <b>{r.type === 'plate_mismatch' ? 'Matrícula no coincide' : r.type === 'old_photo' ? 'Foto antigua' : r.type === 'reused_photo' ? 'Foto reusada' : r.type}:</b> {r.detail}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs opacity-80">EXIF correcto · pHash único · matrícula coincide.</p>
      )}
      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
    </div>
  )
}

function ForensicSignBlock({ inspId, onPdf }) {
  const [status, setStatus] = useState(null) // null | {signed, hash, signed_at, signed_by_name, ...}
  const [signing, setSigning] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    getForensicStatus(inspId).then((r) => setStatus(r.data)).catch(() => setStatus({ signed: false }))
  }, [inspId])

  async function sign() {
    setSigning(true); setErr('')
    try {
      const r = await signInspectionAdmin(inspId, 'Firmado por administrador desde panel FlotaDSP.')
      setStatus({ signed: true, hash: r.data.hash, signed_by_name: r.data.signed_by_name, signed_at: r.data.signed_at })
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo firmar.')
    }
    setSigning(false)
  }

  if (!status) {
    return <div className="mt-5 flex items-center gap-2 text-sm text-dark-500"><Loader2 size={14} className="animate-spin" /> Comprobando firma…</div>
  }

  if (!status.signed) {
    return (
      <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
          <FileSignature size={16} /> Inspección sin firmar
        </div>
        <p className="mb-3 text-xs text-dark-400">Para generar el peritaje técnico con cadena de custodia hash, esta inspección debe estar firmada. Si el conductor no firmó, puedes firmarla tú como administrador.</p>
        {err && <p className="mb-2 text-xs text-red-400">{err}</p>}
        <button onClick={sign} disabled={signing} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {signing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          {signing ? 'Firmando…' : 'Firmar ahora'}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
        <div className="mb-1 flex items-center gap-2 font-semibold text-emerald-300">
          <ShieldCheck size={15} /> Inspección firmada
        </div>
        <div className="text-xs text-dark-400">
          Por <b className="text-dark-200">{status.signed_by_name || '—'}</b> · {fmt(status.signed_at)}
        </div>
        {status.hash && <code className="mt-1 block break-all text-[10px] text-emerald-400">{status.hash}</code>}
      </div>
      <button onClick={() => onPdf(inspId)} className="btn-primary flex w-full items-center justify-center gap-2 py-2.5">
        <FileText size={16} /> Descargar peritaje técnico (PDF)
      </button>
    </div>
  )
}

function DamageRow({ d }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-dark-800 bg-dark-800/40 p-2.5">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${SEV_DOT[d.severity] || SEV_DOT.sin_analisis}`} />
        <span className="flex-1 truncate text-sm font-medium">{d.part || 'Daño'}</span>
        <span className="text-sm text-dark-300">{eur(d.estimated_cost)}</span>
        {d.description && <button onClick={() => setOpen((o) => !o)} className="text-dark-500"><ChevronDown size={15} className={open ? 'rotate-180 transition' : 'transition'} /></button>}
      </div>
      {open && d.description && <p className="mt-2 pl-4 text-xs leading-relaxed text-dark-400">{d.description}</p>}
    </div>
  )
}

// Línea de tiempo del vehículo: quién condujo y qué daños NUEVOS aparecieron cada día.
function QuienTimeline({ vehicleId, dmap, currentId }) {
  const [insps, setInsps] = useState(null)
  useEffect(() => {
    getVehicleInspections(vehicleId).then((r) => setInsps((r.data || []).filter((i) => i.analysis))).catch(() => setInsps([]))
  }, [vehicleId])

  if (!insps) return <div className="mt-3 flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> Reconstruyendo el historial…</div>
  if (insps.length === 0) return <div className="mt-3 card p-4 text-center text-sm text-dark-500">Sin historial suficiente.</div>

  return (
    <div className="mt-3">
      <p className="mb-3 text-xs text-dark-500">Cada vez que apareció un <b className="text-dark-300">daño nuevo</b>, el responsable es el conductor que tenía la furgoneta ese día.</p>
      <div className="space-y-3">
        {insps.map((i) => {
          const nuevos = i.analysis?.new_damages || []
          const driver = dmap[i.driver_id] || 'conductor desconocido'
          const isCur = i.id === currentId
          return (
            <div key={i.id} className={`relative rounded-lg border p-3 ${nuevos.length ? 'border-red-500/40 bg-red-500/5' : 'border-dark-800 bg-dark-800/30'} ${isCur ? 'ring-1 ring-brand-500/50' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{fmtDay(i.created_at)}</span>
                <span className="flex items-center gap-1 text-xs text-dark-300"><User size={12} /> {driver}</span>
              </div>
              {nuevos.length > 0 ? (
                <div className="mt-2">
                  <div className="mb-1 text-[11px] font-bold uppercase text-red-300">⚠ {nuevos.length} daño(s) NUEVO(s) — responsable: {driver}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {nuevos.map((d, k) => <span key={k} className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-200">{d.part || 'daño'}</span>)}
                  </div>
                </div>
              ) : (
                <div className="mt-1 text-xs text-dark-500">Sin daños nuevos ese día{i.photos?.[0] ? '' : ''}.</div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-dark-600">¿Un golpe no salió como "nuevo"? Márcalo en <b>Revisión rápida → "daño que la IA no vio"</b>: queda registrado y la IA aprende para detectarlo la próxima vez.</p>
    </div>
  )
}
