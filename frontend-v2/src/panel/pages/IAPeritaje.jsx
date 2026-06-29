import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { Loader2, BrainCircuit, RefreshCw, CheckCircle2, AlertTriangle, Clock, Image, Sparkles, X, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown, Pencil } from 'lucide-react'
import { getHealth, getInspections, reanalyzeFailed, reanalyzeInspection, submitAiFeedback } from '../api'
import BboxEditor from '../components/BboxEditor'
import PolygonEditor from '../components/PolygonEditor'

function PhotoModal({ insp, onClose }) {
  const photos = (insp.annotated_photos || []).filter(Boolean)
  const [idx, setIdx] = useState(0)
  // Romper caché del navegador: cada vez que se abre el modal se usa timestamp fresco
  const cb = useState(() => Date.now())[0]
  if (!photos.length) return null
  const src = `${photos[idx]}${photos[idx].includes('?') ? '&' : '?'}cb=${cb}`
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="relative max-w-3xl w-full mx-4" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white/70 hover:text-white"><X size={24}/></button>
        <img src={src} alt="Anotación IA" className="w-full rounded-lg max-h-[80vh] object-contain bg-black" />
        {photos.length > 1 && (
          <div className="absolute inset-y-0 flex items-center justify-between w-full px-2 pointer-events-none">
            <button onClick={() => setIdx(i => Math.max(0, i-1))} disabled={idx===0}
              className="pointer-events-auto bg-black/50 hover:bg-black/80 text-white rounded-full p-1.5 disabled:opacity-20">
              <ChevronLeft size={20}/>
            </button>
            <button onClick={() => setIdx(i => Math.min(photos.length-1, i+1))} disabled={idx===photos.length-1}
              className="pointer-events-auto bg-black/50 hover:bg-black/80 text-white rounded-full p-1.5 disabled:opacity-20">
              <ChevronRight size={20}/>
            </button>
          </div>
        )}
        <div className="mt-2 text-center text-xs text-white/50">{idx+1} / {photos.length}</div>
      </div>
    </div>
  )
}

export default function IAPeritaje() {
  const { t } = useT()
  const [health, setHealth] = useState(null)
  const [insps, setInsps] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [tab, setTab] = useState('estado') // estado | anotaciones
  const [viewing, setViewing] = useState(null)
  const [search, setSearch] = useState('')
  const [feedbackState, setFeedbackState] = useState({}) // { "inspId-dmgIdx": "correct"|"wrong"|"corrected"|"loading" }
  const [editingDamage, setEditingDamage] = useState(null) // { inspectionId, damageIndex, damage, photoUrl }
  const [editorMode, setEditorMode] = useState('bbox') // 'bbox' | 'polygon'

  function loadInsps() {
    getInspections({ limit: 300 }).then((r) => setInsps(r.data || [])).catch(() => setInsps([]))
  }
  useEffect(() => {
    getHealth().then((r) => setHealth(r.data)).catch(() => setHealth(null))
    loadInsps()
  }, [])

  const all        = insps || []
  const ok         = all.filter((i) => i.analysis_status === 'ok').length
  const pending    = all.filter((i) => i.analysis_status === 'pending').length
  const failed     = all.filter((i) => i.analysis_status && i.analysis_status !== 'ok' && i.analysis_status !== 'pending')
  const withAnn    = all.filter((i) => (i.annotated_photos || []).some(Boolean))
  const needsAnn   = all.filter((i) => i.analysis_status === 'ok' && !(i.annotated_photos || []).some(Boolean))
  const failedList = failed.slice(0, 30)

  async function doReanalyzeFailed() {
    setBusy('all'); setMsg(null)
    try { const r = await reanalyzeFailed(); setMsg({ ok: true, t: `Reanálisis lanzado: ${r.data?.count ?? r.data?.reanalizadas ?? ''} inspecciones en cola.` }); setTimeout(loadInsps, 1500) }
    catch { setMsg({ ok: false, t: 'No se pudo lanzar el reanálisis.' }) } finally { setBusy('') }
  }

  async function doReanalyze(id) {
    setBusy(id)
    try {
      await reanalyzeInspection(id)
      setMsg({ ok: true, t: `Reanálisis lanzado — generará fotos anotadas en ~30s. Recarga la fila para ver el resultado.` })
      // Refresh lista a los 8s y de nuevo a los 35s para capturar anotaciones
      setTimeout(() => loadInsps(), 8000)
      setTimeout(() => {
        loadInsps()
        // Si el modal está abierto mostrando esta inspección, actualizarlo también
        setViewing(prev => {
          if (prev && prev.id === id) {
            // Forzar reload de la inspección actualizada desde insps
            setInsps(curr => {
              const updated = (curr || []).find(i => i.id === id)
              if (updated) setViewing(updated)
              return curr
            })
          }
          return prev
        })
      }, 35000)
    }
    catch { setMsg({ ok: false, t: 'No se pudo reanalizar.' }) }
    finally { setBusy('') }
  }

  async function doFeedback(inspId, dmgIdx, verdict) {
    const key = `${inspId}-${dmgIdx}`
    setFeedbackState(s => ({ ...s, [key]: 'loading' }))
    try {
      await submitAiFeedback({ inspection_id: inspId, damage_index: dmgIdx, verdict })
      setFeedbackState(s => ({ ...s, [key]: verdict }))
    } catch {
      setFeedbackState(s => ({ ...s, [key]: null }))
      setMsg({ ok: false, t: 'No se pudo guardar el feedback.' })
    }
  }

  // Reanaliza inspecciones OK sin anotaciones (para generar fotos anotadas en lote)
  async function doGenerateAnnotations() {
    if (!needsAnn.length) return
    const toProcess = needsAnn.slice(0, 20) // máximo 20 a la vez para no saturar
    setBusy('annotations'); setMsg(null)
    let launched = 0
    for (const insp of toProcess) {
      try { await reanalyzeInspection(insp.id); launched++ } catch { /* continue */ }
    }
    setMsg({ ok: true, t: `✓ ${launched} inspecciones enviadas a reanálisis para generar fotos anotadas. Tarda ~30-60s cada una.` })
    setBusy('')
    setTimeout(loadInsps, 8000)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold"><BrainCircuit size={22} className="text-brand-400" /> {t('ia.title')}</h1>
      {msg && (
        <div className={`mb-4 rounded-lg px-3 py-2.5 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-red-500/10 text-red-300'}`}>
          {msg.t}
        </div>
      )}

      {/* Motor IA */}
      <div className="card mb-5 p-5">
        <div className="mb-3 text-sm font-semibold text-dark-200">{t('ia.engine')}</div>
        {!health ? <Loader2 className="animate-spin text-dark-400" size={16} /> : (
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><div className="text-dark-500">{t('ia.analysis')}</div><div className="font-medium">{health.gemini_model || '—'}</div></div>
            <div><div className="text-dark-500">{t('ia.mode')}</div><div className="font-medium">{health.gemini_mode || '—'}</div></div>
            <div><div className="text-dark-500">{t('ia.detection')}</div><div className="font-medium">{health.detection_mode || '—'}</div></div>
            <div><div className="text-dark-500">{t('ia.service')}</div><div className={`font-medium ${health.ai_service_configured ? 'text-emerald-400' : 'text-amber-400'}`}>{health.ai_service_configured ? t('ia.active') : t('ia.fallback')}</div></div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-4">
          <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400" /><span className="text-2xl font-extrabold">{insps ? ok : '—'}</span></div>
          <div className="text-xs text-dark-400 mt-1">{t('ia.stat.ok')}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2"><Clock size={15} className="text-amber-400" /><span className="text-2xl font-extrabold">{insps ? pending : '—'}</span></div>
          <div className="text-xs text-dark-400 mt-1">{t('ia.stat.pending')}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2"><AlertTriangle size={15} className="text-red-400" /><span className="text-2xl font-extrabold">{insps ? failed.length : '—'}</span></div>
          <div className="text-xs text-dark-400 mt-1">{t('ia.stat.failed')}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2"><Image size={15} className="text-brand-400" /><span className="text-2xl font-extrabold">{insps ? withAnn.length : '—'}</span></div>
          <div className="text-xs text-dark-400 mt-1">{t('ia.stat.annotated')}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-dark-800 mb-5">
        {[['estado', t('ia.tab.status')],['anotaciones', t('ia.tab.annotated')],['revision', t('ia.tab.review')]].map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab===id ? 'border-brand-400 text-brand-300' : 'border-transparent text-dark-500 hover:text-dark-300'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Tab: Estado */}
      {tab === 'estado' && (
        <div>
          <button onClick={doReanalyzeFailed} disabled={busy === 'all' || (insps && failed.length === 0)} className="btn-primary mb-4 flex items-center gap-2 disabled:opacity-50">
            {busy === 'all' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} {t('ia.reanalyze.failed')} ({failed.length})
          </button>

          {!insps
            ? <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> {t('ui.loading')}</div>
            : failedList.length === 0
              ? <div className="card p-8 text-center text-dark-400">{t('ia.no.failed')}</div>
              : (
                <div className="card divide-y divide-dark-800">
                  {failedList.map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span className="text-dark-300">{(i.created_at || '').slice(0, 16).replace('T', ' ')}</span>
                      <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300">{i.analysis_status}</span>
                      <button onClick={() => doReanalyze(i.id)} disabled={busy === i.id} className="btn-ghost px-2 py-1 text-xs">
                        {busy === i.id ? <Loader2 size={12} className="animate-spin" /> : t('ia.reanalyze')}
                      </button>
                    </div>
                  ))}
                </div>
              )
          }
        </div>
      )}

      {/* Tab: Fotos anotadas */}
      {tab === 'anotaciones' && (
        <div>
          <div className="card mb-5 p-5 border-brand-500/20 bg-brand-500/5">
            <div className="flex items-start gap-3">
              <Sparkles size={18} className="text-brand-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-sm text-brand-200 mb-1">Two-Pass AI Annotation</div>
                <div className="text-xs text-dark-400 leading-relaxed">
                  Las inspecciones nuevas generan fotos anotadas automáticamente. Para las antiguas,
                  usa el botón de abajo para lanzar el reanálisis en lote (máx. 20 a la vez para no saturar la API).
                  Las fotos anotadas aparecen en <b className="text-dark-200">Revisión Rápida</b> con el toggle <b className="text-brand-300">Análisis IA</b>.
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-dark-400">
              <span className="text-dark-200 font-semibold">{withAnn.length}</span> con fotos anotadas ·{' '}
              <span className="text-amber-400 font-semibold">{needsAnn.length}</span> sin anotar
            </div>
            <button onClick={doGenerateAnnotations}
              disabled={busy === 'annotations' || !needsAnn.length}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
              {busy === 'annotations' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Generar anotaciones (máx 20)
            </button>
          </div>

          {/* Búsqueda */}
          <div className="mb-3">
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por ID o matrícula…"
              className="w-full rounded-lg bg-dark-800 border border-dark-700 px-3 py-2 text-sm text-dark-200 placeholder-dark-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Lista de inspecciones con/sin anotación */}
          {!insps
            ? <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> {t('ui.loading')}</div>
            : (
              <div className="card divide-y divide-dark-800">
                {all.filter(i => i.analysis_status === 'ok')
                    .filter(i => !search || i.id?.toLowerCase().includes(search.toLowerCase()) || i.vehicle_id?.toLowerCase().includes(search.toLowerCase()))
                    .slice(0, 50).map((i) => {
                  const hasAnn = (i.annotated_photos || []).some(Boolean)
                  return (
                    <div key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${hasAnn ? 'bg-emerald-400' : 'bg-dark-700'}`} />
                      <span className="text-dark-400 text-xs w-32 shrink-0">{(i.created_at || '').slice(0,16).replace('T',' ')}</span>
                      <span className="text-dark-300 flex-1 truncate text-xs">{i.vehicle_id || i.id}</span>
                      {hasAnn && (
                        <button onClick={() => setViewing(i)} className="text-[10px] font-semibold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full hover:bg-brand-500/25 transition-colors">⬡ Ver fotos →</button>
                      )}
                      <button onClick={() => doReanalyze(i.id)} disabled={!!busy}
                          className="text-[10px] font-semibold text-dark-500 hover:text-dark-200 transition-colors disabled:opacity-40 ml-1">
                          {busy === i.id ? <Loader2 size={11} className="animate-spin" /> : t('ia.reanalyze')}
                      </button>
                    </div>
                  )
                })}
                {all.filter(i => i.analysis_status === 'ok').length === 0 && (
                  <div className="p-8 text-center text-dark-500 text-sm">No hay inspecciones analizadas todavía.</div>
                )}
              </div>
            )
          }
        </div>
      )}
      {/* Tab: Revisión de daños */}
      {tab === 'revision' && (
        <div>
          <div className="card mb-4 p-4 border-emerald-500/20 bg-emerald-500/5 text-xs text-dark-400 leading-relaxed">
            <span className="text-emerald-300 font-semibold">Aprendizaje activo</span> — Cada corrección se inyecta como ejemplo en el siguiente análisis Gemini de la misma zona.
            <br/>✅ <b className="text-dark-300">Correcto</b> — La IA acertó · ❌ <b className="text-dark-300">Falso positivo</b> — No había daño real · ✏️ <b className="text-dark-300">Corregir</b> — La bbox es incorrecta
          </div>
          <div className="mb-3">
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por ID o matrícula…"
              className="w-full rounded-lg bg-dark-800 border border-dark-700 px-3 py-2 text-sm text-dark-200 placeholder-dark-600 focus:outline-none focus:border-brand-500"
            />
          </div>
          {!insps
            ? <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> {t('ui.loading')}</div>
            : (
              <div className="space-y-3">
                {all
                  .filter(i => i.analysis_status === 'ok')
                  .filter(i => !search || i.id?.toLowerCase().includes(search.toLowerCase()) || i.vehicle_id?.toLowerCase().includes(search.toLowerCase()))
                  .filter(i => (i.analysis?.damages || []).length > 0)
                  .slice(0, 20)
                  .map(insp => {
                    const damages = insp.analysis?.damages || []
                    return (
                      <div key={insp.id} className="card p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-xs text-dark-400">{(insp.created_at || '').slice(0,16).replace('T',' ')}</div>
                          <div className="text-xs font-semibold text-dark-200">{insp.vehicle_id || insp.id}</div>
                        </div>
                        <div className="space-y-2">
                          {damages.map((dmg, dmgIdx) => {
                            const key = `${insp.id}-${dmgIdx}`
                            const st = feedbackState[key]
                            return (
                              <div key={dmgIdx} className="flex items-start gap-3 rounded-lg bg-dark-900/60 px-3 py-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium text-dark-200 truncate">{dmg.part || '—'}</div>
                                  <div className="text-[11px] text-dark-500 truncate">{dmg.severity} · {(dmg.description || '').slice(0,80)}</div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {st === 'loading'
                                    ? <Loader2 size={14} className="animate-spin text-dark-400" />
                                    : st
                                      ? <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${st==='correct' ? 'bg-emerald-500/15 text-emerald-300' : st==='wrong' ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}>
                                          {st==='correct' ? '✅ ok' : st==='wrong' ? '❌ falso' : '✏️ corregido'}
                                        </span>
                                      : <>
                                          <button onClick={() => doFeedback(insp.id, dmgIdx, 'correct')}
                                            title="Correcto" className="p-1.5 rounded hover:bg-emerald-500/20 text-dark-500 hover:text-emerald-400 transition-colors">
                                            <ThumbsUp size={14}/>
                                          </button>
                                          <button onClick={() => doFeedback(insp.id, dmgIdx, 'wrong')}
                                            title="Falso positivo" className="p-1.5 rounded hover:bg-red-500/20 text-dark-500 hover:text-red-400 transition-colors">
                                            <ThumbsDown size={14}/>
                                          </button>
                                          <button
                                            onClick={() => {
                                              const photos = insp.photos || []
                                              const pi = dmg.photo_index
                                              const photoUrl = (typeof pi === 'number' && pi >= 1 && pi <= photos.length)
                                                ? photos[pi - 1] : photos[0] || ''
                                              setEditorMode('bbox')
                                              setEditingDamage({ inspectionId: insp.id, damageIndex: dmgIdx, damage: dmg, photoUrl })
                                            }}
                                            title="Corregir zona" className="p-1.5 rounded hover:bg-amber-500/20 text-dark-500 hover:text-amber-400 transition-colors">
                                            <Pencil size={14}/>
                                          </button>
                                        </>
                                  }
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })
                }
                {all.filter(i => i.analysis_status === 'ok' && (i.analysis?.damages || []).length > 0).length === 0 && (
                  <div className="card p-8 text-center text-dark-500 text-sm">No hay daños analizados todavía.</div>
                )}
              </div>
            )
          }
        </div>
      )}

      {viewing && <PhotoModal insp={viewing} onClose={() => setViewing(null)} />}

      {/* Modal editor de corrección */}
      {editingDamage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflowY: 'auto' }}>
          <div style={{ background: '#111827', borderRadius: 12, padding: 24, width: '100%', maxWidth: 860, marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ color: 'white', margin: 0, fontSize: 16, fontWeight: 600 }}>
                Corregir — {editingDamage.damage.part}
              </h3>
              <button onClick={() => setEditingDamage(null)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Selector de modo */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[['bbox', '⬜ Rectángulo rápido'], ['polygon', '🔶 Polígono preciso']].map(([mode, label]) => (
                <button key={mode} onClick={() => setEditorMode(mode)} style={{
                  padding: '6px 16px', borderRadius: 6,
                  border: `1px solid ${editorMode === mode ? '#ef4444' : '#374151'}`,
                  background: editorMode === mode ? 'rgba(239,68,68,0.1)' : 'transparent',
                  color: editorMode === mode ? '#ef4444' : '#9ca3af',
                  cursor: 'pointer', fontSize: 13,
                }}>
                  {label}
                </button>
              ))}
            </div>

            {editorMode === 'bbox' ? (
              <BboxEditor
                photoUrl={editingDamage.photoUrl}
                currentBox={editingDamage.damage.box_2d}
                onConfirm={async (correctedBox) => {
                  const key = `${editingDamage.inspectionId}-${editingDamage.damageIndex}`
                  setFeedbackState(s => ({ ...s, [key]: 'loading' }))
                  try {
                    await submitAiFeedback({
                      inspection_id: editingDamage.inspectionId,
                      damage_index: editingDamage.damageIndex,
                      verdict: 'corrected',
                      corrected_box: correctedBox,
                    })
                    setFeedbackState(s => ({ ...s, [key]: 'corrected' }))
                  } catch {
                    setFeedbackState(s => ({ ...s, [key]: null }))
                    setMsg({ ok: false, t: 'No se pudo guardar la corrección.' })
                  }
                  setEditingDamage(null)
                }}
                onCancel={() => setEditingDamage(null)}
              />
            ) : (
              <PolygonEditor
                photoUrl={editingDamage.photoUrl}
                currentPolygon={editingDamage.damage.polygon_points}
                currentBox={editingDamage.damage.box_2d}
                onConfirm={async (correctedPolygon) => {
                  const key = `${editingDamage.inspectionId}-${editingDamage.damageIndex}`
                  setFeedbackState(s => ({ ...s, [key]: 'loading' }))
                  try {
                    const ys = correctedPolygon.map(p => p[0])
                    const xs = correctedPolygon.map(p => p[1])
                    const correctedBox = [Math.min(...ys), Math.min(...xs), Math.max(...ys), Math.max(...xs)]
                    await submitAiFeedback({
                      inspection_id: editingDamage.inspectionId,
                      damage_index: editingDamage.damageIndex,
                      verdict: 'corrected',
                      corrected_box: correctedBox,
                      corrected_polygon_points: correctedPolygon,
                    })
                    setFeedbackState(s => ({ ...s, [key]: 'corrected' }))
                  } catch {
                    setFeedbackState(s => ({ ...s, [key]: null }))
                    setMsg({ ok: false, t: 'No se pudo guardar la corrección.' })
                  }
                  setEditingDamage(null)
                }}
                onCancel={() => setEditingDamage(null)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
