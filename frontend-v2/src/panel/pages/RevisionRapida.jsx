import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, CheckCircle2, Check, X, ChevronLeft, ChevronRight, User, Clock,
  AlertTriangle, BrainCircuit,
} from 'lucide-react'
import { getReviewQueue, getAiDatasetStats, damageFeedback, markReviewed } from '../api'

const GOAL = 3000

const SEV_LABEL = {
  sin_danos: 'Sin daños', sin_analisis: 'Sin análisis', leve: 'Leve',
  moderado: 'Moderado', grave: 'Grave', critico: 'Crítico',
}
const SEV_CLS = {
  leve: 'bg-amber-500/20 text-amber-300', moderado: 'bg-orange-500/20 text-orange-300',
  grave: 'bg-red-500/20 text-red-300', critico: 'bg-red-600/30 text-red-200',
  sin_danos: 'bg-emerald-500/20 text-emerald-300', sin_analisis: 'bg-dark-700 text-dark-300',
}

function fmtDate(s) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d)) return s
  return d.toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function RevisionRapida() {
  const { center } = useOutletContext()
  const [queue, setQueue] = useState(null)
  const [idx, setIdx] = useState(0)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [stats, setStats] = useState(null)
  const [verdicts, setVerdicts] = useState({}) // `${inspId}:${dmgIdx}` -> 'correct'|'wrong'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const loadStats = useCallback(() => {
    getAiDatasetStats().then((r) => setStats(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    setQueue(null); setIdx(0); setPhotoIdx(0); setErr('')
    getReviewQueue(center)
      .then((r) => setQueue(Array.isArray(r.data) ? r.data : r.data?.queue || []))
      .catch(() => setErr('No se pudo cargar la cola de revisión.'))
    loadStats()
  }, [center, loadStats])

  if (err) return <p className="text-red-400">{err}</p>
  if (!queue) return <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> Cargando…</div>

  const item = queue[idx]
  const total = stats?.total ?? 0

  function go(delta) {
    setPhotoIdx(0)
    setIdx((i) => Math.min(Math.max(0, i + delta), queue.length - 1))
  }

  async function sendFeedback(dmgIndex, verdict) {
    if (!item || busy) return
    setBusy(true)
    try {
      await damageFeedback(item.id, { verdict, damage_index: dmgIndex, scope: 'new' })
      setVerdicts((v) => ({ ...v, [`${item.id}:${dmgIndex}`]: verdict }))
      loadStats()
    } catch {
      setErr('No se pudo guardar el veredicto.')
    } finally {
      setBusy(false)
    }
  }

  async function reviewDone() {
    if (!item || busy) return
    setBusy(true)
    try {
      await markReviewed(item.id)
      const next = queue.filter((_, i) => i !== idx)
      setQueue(next)
      setIdx((i) => Math.min(i, Math.max(0, next.length - 1)))
      setPhotoIdx(0)
    } catch {
      setErr('No se pudo marcar como revisada.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Cabecera */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="text-emerald-400" size={22} />
          <h1 className="text-xl font-bold">Revisión rápida</h1>
        </div>
        <span className="text-sm text-dark-400">{queue.length} pendientes</span>
      </div>

      {/* Entrenando tu IA */}
      <div className="card mb-4 border-violet-500/30 bg-violet-500/5 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-violet-300">
            <BrainCircuit size={16} /> Entrenando tu IA propia
          </span>
          <span className="text-sm font-bold">{total} / {GOAL.toLocaleString('es')} ejemplos</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-dark-800">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${Math.min(100, (total / GOAL) * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-dark-400">Cada ✓ / ✗ que marcas suma un ejemplo. Al llegar a {GOAL.toLocaleString('es')} podrás entrenar tu propia IA.</p>
      </div>

      {queue.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-12 text-center text-dark-300">
          <CheckCircle2 size={32} className="text-emerald-400" /> No hay inspecciones pendientes de revisar {center !== 'Todos' && `en ${center}`}.
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* barra superior de la tarjeta */}
          <div className="flex items-center justify-between gap-2 border-b border-dark-800 px-4 py-2.5">
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${SEV_CLS[item.severity] || SEV_CLS.sin_analisis}`}>
              {(SEV_LABEL[item.severity] || item.severity || '—').toUpperCase()} · {item.new_damages_count || item.total_damages_count || 0} daños
            </span>
            <div className="flex items-center gap-2 text-sm text-dark-400">
              <button className="btn-ghost p-1.5 disabled:opacity-30" disabled={idx === 0} onClick={() => go(-1)}><ChevronLeft size={18} /></button>
              <span>{idx + 1} de {queue.length}</span>
              <button className="btn-ghost p-1.5 disabled:opacity-30" disabled={idx === queue.length - 1} onClick={() => go(1)}><ChevronRight size={18} /></button>
            </div>
          </div>

          {/* Imagen + recuadros reales */}
          <div className="relative bg-black">
            {item.photos?.[photoIdx] ? (
              <div className="relative mx-auto" style={{ maxWidth: 520 }}>
                <img src={item.photos[photoIdx]} alt="" className="block w-full" />
                {(item.new_damages || []).map((d, i) => {
                  if (!Array.isArray(d.box_2d) || d.box_2d.length !== 4) return null
                  if (d.photo_index && d.photo_index - 1 !== photoIdx) return null
                  const [ymin, xmin, ymax, xmax] = d.box_2d
                  if (ymin + xmin + ymax + xmax === 0) return null
                  return (
                    <div key={i} className="pointer-events-none absolute rounded border-2 border-orange-400"
                      style={{ left: `${xmin / 10}%`, top: `${ymin / 10}%`, width: `${(xmax - xmin) / 10}%`, height: `${(ymax - ymin) / 10}%` }}>
                      <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-orange-400 px-1.5 text-[10px] font-bold text-black">{d.part || 'daño'}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-dark-500">Sin foto</div>
            )}
          </div>

          {/* Miniaturas */}
          {item.photos?.length > 1 && (
            <div className="flex gap-2 overflow-x-auto border-b border-dark-800 p-2">
              {item.photos.map((p, i) => (
                <button key={i} onClick={() => setPhotoIdx(i)}
                  className={`h-14 w-16 shrink-0 overflow-hidden rounded border-2 ${i === photoIdx ? 'border-brand-400' : 'border-transparent opacity-70'}`}>
                  <img src={p} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Info vehículo */}
          <div className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold">{item.license_plate}</span>
              {item.center && <span className="badge-orange">{item.center}</span>}
              {item.plate_mismatch && <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] text-red-400">matrícula no coincide</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dark-400">
              <span className="flex items-center gap-1"><User size={13} /> {item.driver_name}</span>
              <span className="flex items-center gap-1"><Clock size={13} /> {fmtDate(item.created_at)}</span>
              {item.vehicle_label && <span>· {item.vehicle_label}</span>}
            </div>

            {item.image_quality_warnings?.length > 0 && (
              <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div>{item.image_quality_warnings.join(' · ')}</div>
              </div>
            )}

            {item.executive_summary && (
              <p className="mt-3 border-l-2 border-brand-500/50 pl-3 text-sm leading-relaxed text-dark-300">{item.executive_summary}</p>
            )}

            {/* Daños nuevos con ✓ / ✗ */}
            {(item.new_damages || []).length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-dark-500">Daños detectados — valida cada uno</div>
                {item.new_damages.map((d, i) => {
                  const v = verdicts[`${item.id}:${i}`]
                  return (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-dark-800 bg-dark-800/40 p-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{d.part || 'Daño'}</span>
                          {d.severity && <span className={`rounded px-1.5 py-0.5 text-[10px] ${SEV_CLS[d.severity] || SEV_CLS.sin_analisis}`}>{SEV_LABEL[d.severity] || d.severity}</span>}
                        </div>
                        {d.description && <div className="truncate text-xs text-dark-400">{d.description}</div>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button disabled={busy || v} onClick={() => sendFeedback(i, 'correct')}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg border ${v === 'correct' ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : 'border-dark-700 text-dark-300 hover:bg-emerald-500/10 hover:text-emerald-300'} disabled:opacity-50`} title="Correcto">
                          <Check size={16} />
                        </button>
                        <button disabled={busy || v} onClick={() => sendFeedback(i, 'wrong')}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg border ${v === 'wrong' ? 'border-red-500 bg-red-500/20 text-red-300' : 'border-dark-700 text-dark-300 hover:bg-red-500/10 hover:text-red-300'} disabled:opacity-50`} title="Falso positivo">
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <button onClick={reviewDone} disabled={busy}
              className="btn-primary mt-4 flex w-full items-center justify-center gap-2 py-2.5 disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Marcar revisada y siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
