import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT } from '../../i18n'
import {
  Loader2, CheckCircle2, Check, X, ChevronLeft, ChevronRight, User, Clock,
  AlertTriangle, BrainCircuit, Pencil, Plus,
} from 'lucide-react'
import { getReviewQueue, getInspection, getAiDatasetStats, damageFeedback, markReviewed, missedDamage, submitAiFeedback } from '../api'
import PolygonEditor from '../components/PolygonEditor'
import BboxEditor from '../components/BboxEditor'

const GOAL = 3000

const SEV_CLS = {
  leve: 'bg-amber-500/20 text-amber-300', moderado: 'bg-orange-500/20 text-orange-300',
  grave: 'bg-red-500/20 text-red-300', critico: 'bg-red-600/30 text-red-200',
  sin_danos: 'bg-emerald-500/20 text-emerald-300', sin_analisis: 'bg-dark-700 text-dark-300',
}

function fmtDate(s) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d)) return s
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function RevisionRapida() {
  const { center } = useOutletContext()
  const { t } = useT()
  const sevLabel = (k) => t('sev.' + k) || k
  const [queue, setQueue] = useState(null)
  const [idx, setIdx] = useState(0)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [stats, setStats] = useState(null)
  const [verdicts, setVerdicts] = useState({}) // `${inspId}:${dmgIdx}` -> 'correct'|'wrong'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Dibujo de caja: drawMode = null | {type:'missed'} | {type:'corrected', dmgIndex}
  const [drawMode, setDrawMode] = useState(null)
  const [box, setBox] = useState(null)      // {left,top,w,h} en % de la imagen
  const [drag, setDrag] = useState(null)    // punto inicial mientras se arrastra
  const [showAnnotated, setShowAnnotated] = useState(true)  // toggle: foto IA vs original
  const [partName, setPartName] = useState('')
  const [filterIA, setFilterIA] = useState(false)
  // Modal editor de polígono/bbox
  const [polyEdit, setPolyEdit] = useState(null) // { dmgIndex, damage, photoUrl, editorMode }
  const [polyEditorMode, setPolyEditorMode] = useState('polygon') // 'bbox' | 'polygon'
  const [fullInsp, setFullInsp] = useState(null) // inspección completa con daños

  const loadStats = useCallback(() => {
    getAiDatasetStats().then((r) => setStats(r.data)).catch(() => {})
  }, [])

  // Calcular item actual antes de cualquier return para poder usar hooks
  const displayQueue = queue ? (filterIA ? queue.filter(i => (i.annotated_photos || []).some(Boolean)) : queue) : []
  const item = displayQueue[idx] ?? null
  const total = stats?.total ?? 0

  useEffect(() => {
    setQueue(null); setIdx(0); setPhotoIdx(0); setErr(''); setFullInsp(null)
    getReviewQueue(center)
      .then((r) => setQueue(Array.isArray(r.data) ? r.data : r.data?.queue || []))
      .catch(() => setErr(t('rev.load.error')))
    loadStats()
  }, [center, loadStats])

  // Carga la inspección completa cuando cambia el item (el queue solo trae el conteo, no el array de daños)
  useEffect(() => {
    if (!item?.id) { setFullInsp(null); return }
    setFullInsp(null)
    getInspection(item.id)
      .then((r) => setFullInsp(r.data))
      .catch(() => setFullInsp({}))
  }, [item?.id])

  // Daños: inspección completa primero, luego fallbacks del item de queue
  // damageScope determina qué array usa el backend al validar
  const damageScope = fullInsp?.analysis?.new_damages?.length > 0 ? 'new'
    : fullInsp?.analysis?.damages?.length > 0 ? 'all'
    : item?.new_damages?.length > 0 ? 'new'
    : 'new'
  const damages = fullInsp?.analysis?.new_damages?.length > 0
    ? fullInsp.analysis.new_damages
    : fullInsp?.analysis?.damages?.length > 0
      ? fullInsp.analysis.damages
      : item?.new_damages?.length > 0
        ? item.new_damages
        : item?.analysis?.new_damages || []

  if (err) return <p className="text-red-400">{err}</p>
  if (!queue) return <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> {t('ui.loading')}</div>

  function go(delta) {
    setPhotoIdx(0)
    setShowAnnotated(true)
    setIdx((i) => Math.min(Math.max(0, i + delta), displayQueue.length - 1))
    cancelDraw()
  }

  async function sendFeedback(dmgIndex, verdict) {
    if (!item || busy) return
    setBusy(true)
    try {
      await damageFeedback(item.id, { verdict, damage_index: dmgIndex, scope: damageScope })
      setVerdicts((v) => ({ ...v, [`${item.id}:${dmgIndex}`]: verdict }))
      loadStats()
    } catch {
      setErr(t('rev.save.verdict.error'))
    } finally {
      setBusy(false)
    }
  }

  async function reviewDone() {
    if (!item || busy) return
    setBusy(true)
    try {
      await markReviewed(item.id)
      const next = queue.filter((q) => q.id !== item.id)
      setQueue(next)
      setIdx((i) => Math.min(i, Math.max(0, next.filter(q => filterIA ? (q.annotated_photos||[]).some(Boolean) : true).length - 1)))
      setPhotoIdx(0)
      cancelDraw()
    } catch {
      setErr(t('rev.mark.error'))
    } finally {
      setBusy(false)
    }
  }

  // ── Dibujo de caja sobre la foto ──
  function cancelDraw() { setDrawMode(null); setBox(null); setDrag(null); setPartName('') }
  function pct(e, el) {
    const r = el.getBoundingClientRect()
    return { x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)), y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)) }
  }
  function onDown(e) { if (!drawMode) return; const p = pct(e, e.currentTarget); setDrag(p); setBox({ left: p.x, top: p.y, w: 0, h: 0 }) }
  function onMove(e) { if (!drawMode || !drag) return; const p = pct(e, e.currentTarget); setBox({ left: Math.min(drag.x, p.x), top: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) }) }
  function onUp() { setDrag(null) }
  function boxTo2d(b) {
    const c = (v) => Math.round(Math.min(1000, Math.max(0, v * 10)))
    return [c(b.top), c(b.left), c(b.top + b.h), c(b.left + b.w)] // [ymin,xmin,ymax,xmax]
  }
  async function saveDraw() {
    if (!box || box.w < 1 || box.h < 1) return setErr(t('rev.draw.no.box'))
    setBusy(true); setErr('')
    try {
      const box_2d = boxTo2d(box)
      if (drawMode.type === 'missed') {
        if (!partName.trim()) { setBusy(false); return setErr(t('rev.draw.no.part')) }
        await missedDamage(item.id, { part: partName.trim(), box_2d, photo_index: photoIdx + 1 })
      } else {
        await damageFeedback(item.id, { verdict: 'corrected', damage_index: drawMode.dmgIndex, scope: damageScope, corrected_box: box_2d })
        setVerdicts((v) => ({ ...v, [`${item.id}:${drawMode.dmgIndex}`]: 'corrected' }))
      }
      loadStats()
      cancelDraw()
    } catch {
      setErr(t('rev.save.error'))
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Cabecera */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="text-emerald-400" size={22} />
          <h1 className="text-xl font-bold">{t('rev.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setFilterIA(f => !f); setIdx(0) }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${filterIA ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40' : 'bg-dark-800 text-dark-400 border border-dark-700 hover:text-dark-200'}`}>
            ⬡ Solo IA {filterIA && `(${displayQueue.length})`}
          </button>
          <span className="text-sm text-dark-400">{displayQueue.length} {t('rev.pending')}</span>
        </div>
      </div>

      {/* Entrenando tu IA */}
      <div className="card mb-4 border-violet-500/30 bg-violet-500/5 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-violet-300">
            <BrainCircuit size={16} /> {t('rev.ai.training')}
          </span>
          <span className="text-sm font-bold">{total} / {GOAL.toLocaleString('es-ES')} {t('rev.ai.examples')}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-dark-800">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${Math.min(100, (total / GOAL) * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-dark-400">{t('rev.ai.training.hint').replace('{goal}', GOAL.toLocaleString('es-ES'))}</p>
      </div>

      {queue.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-12 text-center text-dark-300">
          <CheckCircle2 size={32} className="text-emerald-400" /> {t('rev.no.pending')} {center !== 'Todos' && `${t('rev.in.center')} ${center}`}.
        </div>
      ) : filterIA && displayQueue.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-12 text-center text-dark-300">
          <span className="text-3xl">⬡</span>
          <p className="text-sm">{t('rev.no.ai.photos')}</p>
          <p className="text-xs text-dark-500">{t('rev.go.ia.hint')}</p>
          <button onClick={() => setFilterIA(false)} className="btn-ghost text-xs px-3 py-1.5">{t('rev.show.all')}</button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* barra superior de la tarjeta */}
          <div className="flex items-center justify-between gap-2 border-b border-dark-800 px-4 py-2.5">
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${SEV_CLS[item.severity] || SEV_CLS.sin_analisis}`}>
              {sevLabel(item.severity || 'sin_analisis').toUpperCase()} · {item.new_damages_count || item.total_damages_count || 0} {t('rev.damages')}
            </span>
            <div className="flex items-center gap-2 text-sm text-dark-400">
              <button className="btn-ghost p-1.5 disabled:opacity-30" disabled={idx === 0} onClick={() => go(-1)}><ChevronLeft size={18} /></button>
              <span>{idx + 1} {t('rev.of')} {queue.length}</span>
              <button className="btn-ghost p-1.5 disabled:opacity-30" disabled={idx === queue.length - 1} onClick={() => go(1)}><ChevronRight size={18} /></button>
            </div>
          </div>

          {/* Imagen + anotaciones IA */}
          <div className="relative bg-black">
            {item.photos?.[photoIdx] ? (
              <>
                {/* Toggle original / IA — solo si hay foto anotada para este índice */}
                {item.annotated_photos?.[photoIdx] && (
                  <div className="absolute right-2 top-2 z-10 flex overflow-hidden rounded-lg border border-dark-600 text-xs font-semibold shadow-lg">
                    <button
                      onClick={() => setShowAnnotated(false)}
                      className={`px-2.5 py-1.5 transition ${!showAnnotated ? 'bg-dark-700 text-white' : 'bg-dark-900/80 text-dark-400 hover:text-dark-200'}`}
                    >{t('rev.original')}</button>
                    <button
                      onClick={() => setShowAnnotated(true)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 transition ${showAnnotated ? 'bg-brand-600 text-white' : 'bg-dark-900/80 text-dark-400 hover:text-dark-200'}`}
                    >
                      <BrainCircuit size={11} />
                      {t('rev.ai.analysis')}
                    </button>
                  </div>
                )}

                <div className={`relative mx-auto ${drawMode ? 'cursor-crosshair select-none' : ''}`} style={{ maxWidth: 520 }}
                  onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>

                  {/* Foto: anotada (profesional) u original */}
                  {showAnnotated && item.annotated_photos?.[photoIdx]
                    ? <img src={item.annotated_photos[photoIdx]} alt="Análisis IA" className="block w-full" draggable={false} />
                    : <img src={item.photos[photoIdx]} alt="" className="block w-full" draggable={false} />
                  }

                  {/* Cajas CSS solo en modo original (la foto anotada ya las lleva quemadas) */}
                  {(!showAnnotated || !item.annotated_photos?.[photoIdx]) && damages.map((d, i) => {
                    if (!Array.isArray(d.box_2d) || d.box_2d.length !== 4) return null
                    if (d.photo_index && d.photo_index - 1 !== photoIdx) return null
                    const [ymin, xmin, ymax, xmax] = d.box_2d
                    if (ymin + xmin + ymax + xmax === 0) return null
                    const isConfirmed = d.confirmed !== false
                    return (
                      <div key={i}
                        className={`pointer-events-none absolute rounded border-2 ${isConfirmed ? 'border-orange-400' : 'border-dashed border-yellow-400/70'}`}
                        style={{ left: `${xmin / 10}%`, top: `${ymin / 10}%`, width: `${(xmax - xmin) / 10}%`, height: `${(ymax - ymin) / 10}%` }}>
                        <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-orange-400 px-1.5 text-[10px] font-bold text-black">
                          {d.part || 'daño'}{!isConfirmed ? ' ?' : ''}
                        </span>
                      </div>
                    )
                  })}

                  {/* Caja en dibujo */}
                  {box && (
                    <div className="pointer-events-none absolute rounded border-2 border-dashed border-emerald-400 bg-emerald-400/10"
                      style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.w}%`, height: `${box.h}%` }} />
                  )}
                  {drawMode && (
                    <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[11px] text-emerald-300">
                      {drawMode.type === 'missed' ? t('rev.drag.mark') : t('rev.drag.fix')}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-64 items-center justify-center text-dark-500">{t('rev.no.photo')}</div>
            )}
          </div>

          {/* Barra de dibujo */}
          {drawMode && (
            <div className="flex flex-wrap items-center gap-2 border-b border-dark-800 bg-dark-800/60 px-4 py-2.5">
              {drawMode.type === 'missed' && (
                <input autoFocus className="input h-9 w-48" placeholder="Pieza (ej. tulipa trasera)" value={partName} onChange={(e) => setPartName(e.target.value)} />
              )}
              <button onClick={saveDraw} disabled={busy || !box || box.w < 1} className="btn-primary flex items-center gap-1.5 py-1.5 text-sm disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar {drawMode.type === 'missed' ? 'daño' : 'caja'}
              </button>
              <button onClick={cancelDraw} className="btn-ghost px-3 py-1.5 text-sm">Cancelar</button>
            </div>
          )}

          {/* Miniaturas */}
          {item.photos?.length > 1 && (
            <div className="flex gap-2 overflow-x-auto border-b border-dark-800 p-2">
              {item.photos.map((p, i) => {
                const hasAnnotated = !!item.annotated_photos?.[i]
                return (
                  <button key={i} onClick={() => { setPhotoIdx(i); setShowAnnotated(true) }}
                    className={`relative h-14 w-16 shrink-0 overflow-hidden rounded border-2 ${i === photoIdx ? 'border-brand-400' : 'border-transparent opacity-70'}`}>
                    <img src={p} alt="" className="h-full w-full object-cover" />
                    {hasAnnotated && (
                      <span className="absolute bottom-0.5 right-0.5 rounded bg-brand-600/90 px-0.5 text-[8px] font-bold text-white">IA</span>
                    )}
                  </button>
                )
              })}
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
            {!fullInsp && item && (
              <div className="mt-4 flex items-center gap-2 text-xs text-dark-500">
                <Loader2 size={13} className="animate-spin" /> {t('ui.loading')}
              </div>
            )}
            {damages.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-dark-500">{t('rev.damages.validate')}</div>
                {damages.map((d, i) => {
                  const v = verdicts[`${item.id}:${i}`]
                  return (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-dark-800 bg-dark-800/40 p-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{d.part || t('rev.damage')}</span>
                          {d.severity && <span className={`rounded px-1.5 py-0.5 text-[10px] ${SEV_CLS[d.severity] || SEV_CLS.sin_analisis}`}>{sevLabel(d.severity)}</span>}
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
                        <button disabled={busy} onClick={() => {
                            const photos = item.photos || []
                            const pi = d.photo_index
                            const photoUrl = (typeof pi === 'number' && pi >= 1 && pi <= photos.length)
                              ? photos[pi - 1] : photos[photoIdx] || photos[0] || ''
                            setPolyEditorMode('polygon')
                            setPolyEdit({ dmgIndex: i, damage: d, photoUrl })
                          }}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg border ${v === 'corrected' ? 'border-amber-500 bg-amber-500/20 text-amber-300' : 'border-dark-700 text-dark-300 hover:bg-amber-500/10 hover:text-amber-300'} disabled:opacity-50`} title="Corregir zona">
                          <Pencil size={15} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Daño que la IA no vio */}
            <button onClick={() => { setDrawMode({ type: 'missed' }); setBox(null); setPartName('') }} disabled={busy || !!drawMode}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-dark-600 py-2 text-sm text-dark-300 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-40">
              <Plus size={15} /> Marcar un daño que la IA no vio
            </button>

            <button onClick={reviewDone} disabled={busy}
              className="btn-primary mt-3 flex w-full items-center justify-center gap-2 py-2.5 disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Marcar revisada y siguiente
            </button>
          </div>
        </div>
      )}

      {/* Modal editor polígono/bbox */}
      {polyEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
          <div style={{ background: '#111827', borderRadius: 12, padding: 20, width: '100%', maxWidth: 860, marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ color: 'white', margin: 0, fontSize: 15, fontWeight: 600 }}>
                Corregir zona — {polyEdit.damage.part}
              </h3>
              <button onClick={() => setPolyEdit(null)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[['polygon', '🔶 Polígono preciso'], ['bbox', '⬜ Rectángulo rápido']].map(([mode, label]) => (
                <button key={mode} onClick={() => setPolyEditorMode(mode)} style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                  border: `1px solid ${polyEditorMode === mode ? '#f59e0b' : '#374151'}`,
                  background: polyEditorMode === mode ? 'rgba(245,158,11,0.1)' : 'transparent',
                  color: polyEditorMode === mode ? '#fbbf24' : '#9ca3af',
                }}>{label}</button>
              ))}
            </div>
            {polyEditorMode === 'polygon' ? (
              <PolygonEditor
                photoUrl={polyEdit.photoUrl}
                currentPolygon={polyEdit.damage.polygon_points}
                currentBox={polyEdit.damage.box_2d}
                onConfirm={async (correctedPolygon) => {
                  setBusy(true)
                  try {
                    const ys = correctedPolygon.map(p => p[0])
                    const xs = correctedPolygon.map(p => p[1])
                    const correctedBox = [Math.min(...ys), Math.min(...xs), Math.max(...ys), Math.max(...xs)]
                    await submitAiFeedback({
                      inspection_id: item.id,
                      damage_index: polyEdit.dmgIndex,
                      verdict: 'corrected',
                      corrected_box: correctedBox,
                      corrected_polygon_points: correctedPolygon,
                    })
                    setVerdicts(v => ({ ...v, [`${item.id}:${polyEdit.dmgIndex}`]: 'corrected' }))
                    loadStats()
                  } catch { setErr('No se pudo guardar.') }
                  finally { setBusy(false); setPolyEdit(null) }
                }}
                onCancel={() => setPolyEdit(null)}
              />
            ) : (
              <BboxEditor
                photoUrl={polyEdit.photoUrl}
                currentBox={polyEdit.damage.box_2d}
                onConfirm={async (correctedBox) => {
                  setBusy(true)
                  try {
                    await damageFeedback(item.id, {
                      verdict: 'corrected', damage_index: polyEdit.dmgIndex,
                      scope: damageScope, corrected_box: correctedBox,
                    })
                    setVerdicts(v => ({ ...v, [`${item.id}:${polyEdit.dmgIndex}`]: 'corrected' }))
                    loadStats()
                  } catch { setErr('No se pudo guardar.') }
                  finally { setBusy(false); setPolyEdit(null) }
                }}
                onCancel={() => setPolyEdit(null)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
