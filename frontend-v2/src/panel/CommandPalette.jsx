import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Truck, User, CornerDownLeft, Sparkles, Loader2 } from 'lucide-react'
import { getVehicles, getDrivers, askAssistant } from './api'
import { useT } from '../i18n'

/* ── Paleta de comandos (Ctrl/Cmd+K) ──────────────────────────────────────
   Salta a cualquier módulo, furgoneta (por matrícula/marca/modelo) o conductor
   tecleando. Datos cacheados 60s para que reabrir sea instantáneo. */

let _cache = { at: 0, vehicles: [], drivers: [] }

async function loadData() {
  if (Date.now() - _cache.at < 60_000) return _cache
  const [vs, ds] = await Promise.all([
    getVehicles('Todos').catch(() => ({ data: [] })),
    getDrivers('Todos').catch(() => ({ data: [] })),
  ])
  _cache = { at: Date.now(), vehicles: vs.data || [], drivers: ds.data || [] }
  return _cache
}

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function CommandPalette({ open, onClose, pages }) {
  const nav = useNavigate()
  const { t } = useT()
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const [q, setQ] = useState('')
  const [selIdx, setSelIdx] = useState(0)
  const [data, setData] = useState(_cache)
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState(null) // { q, text } | { q, error }

  useEffect(() => {
    if (!open) return
    setQ(''); setSelIdx(0); setAnswer(null); setAsking(false)
    // focus tras el paint del modal
    requestAnimationFrame(() => inputRef.current?.focus())
    loadData().then(setData).catch(() => {})
  }, [open])

  async function ask() {
    const question = q.trim()
    if (question.length < 8 || asking) return
    setAsking(true); setAnswer(null)
    try {
      const r = await askAssistant(question)
      setAnswer({ q: question, text: r.data?.answer || '' })
    } catch (e) {
      setAnswer({ q: question, error: e?.response?.data?.detail || t('cmdk.ask.error') })
    } finally { setAsking(false) }
  }

  const results = useMemo(() => {
    const nq = norm(q).replace(/\s+/g, '')
    const out = []
    // Módulos del panel (con query vacía se muestran como accesos rápidos)
    for (const p of pages) {
      if (!nq || norm(p.label).replace(/\s+/g, '').includes(nq)) {
        out.push({ type: 'page', label: p.label, icon: p.icon, to: p.to })
        if (out.length >= 5 && !nq) break
      }
    }
    if (nq) {
      for (const v of data.vehicles) {
        const hay = norm(`${v.license_plate}${v.brand}${v.model}${v.vin || ''}`).replace(/\s+/g, '')
        if (hay.includes(nq)) {
          out.push({
            type: 'vehicle', label: v.license_plate, icon: Truck,
            sub: [v.brand, v.model, v.center].filter(Boolean).join(' · '),
            to: `/panel/vehiculos?open=${v.id}`,
          })
          if (out.length > 14) break
        }
      }
      for (const d of data.drivers) {
        if (norm(d.name).replace(/\s+/g, '').includes(nq)) {
          out.push({
            type: 'driver', label: d.name, icon: User,
            sub: d.center || '', to: `/panel/conductores?open=${d.id}`,
          })
          if (out.length > 18) break
        }
      }
    }
    return out.slice(0, 12)
  }, [q, data, pages])

  useEffect(() => { setSelIdx(0) }, [q])

  useEffect(() => {
    // Mantener el elemento seleccionado visible al navegar con flechas
    listRef.current?.children[selIdx]?.scrollIntoView({ block: 'nearest' })
  }, [selIdx])

  if (!open) return null

  const canAsk = q.trim().length >= 8

  function goTo(r) {
    if (r.type === 'ask') { ask(); return }
    onClose()
    nav(r.to)
  }

  // Fila virtual "preguntar a la IA" al final de los resultados
  const allRows = canAsk
    ? [...results, { type: 'ask', label: `${t('cmdk.ask')} "${q.trim()}"`, icon: Sparkles, to: '#ask' }]
    : results

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx((i) => Math.min(i + 1, allRows.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && allRows[selIdx]) { e.preventDefault(); goTo(allRows[selIdx]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  const TYPE_LABEL = { page: t('cmdk.section.pages'), vehicle: t('cmdk.section.vehicles'), driver: t('cmdk.section.drivers') }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 p-4 pt-[16vh] backdrop-blur-md" onClick={onClose}>
      <div
        className="animate-pop w-full max-w-lg overflow-hidden rounded-2xl border border-dark-700 bg-gradient-to-b from-dark-900 to-dark-950 shadow-2xl shadow-black/60 ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/5 px-4">
          <Search size={16} className="shrink-0 text-dark-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('cmdk.placeholder')}
            className="w-full bg-transparent py-3.5 text-sm text-dark-50 placeholder:text-dark-500 focus:outline-none"
          />
          <kbd className="kbd shrink-0">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5">
          {allRows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-dark-500">{t('cmdk.empty')}</p>
          ) : (
            allRows.map((r, i) => (
              <button
                key={`${r.type}-${r.to}`}
                onClick={() => goTo(r)}
                onMouseMove={() => setSelIdx(i)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  i === selIdx ? 'bg-brand-500/15 text-brand-200' : 'text-dark-200'
                } ${r.type === 'ask' ? 'border-t border-white/5 mt-1 pt-3' : ''}`}
              >
                <r.icon size={15} className={r.type === 'ask' ? 'text-purple-400' : i === selIdx ? 'text-brand-300' : 'text-dark-500'} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.label}</span>
                {r.sub && <span className="max-w-[40%] truncate text-xs text-dark-500">{r.sub}</span>}
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-dark-600">{TYPE_LABEL[r.type]}</span>
              </button>
            ))
          )}

          {/* Respuesta del asistente IA */}
          {(asking || answer) && (
            <div className="animate-fade-in mx-1.5 mb-1.5 mt-2 rounded-xl border border-purple-500/20 bg-purple-500/5 p-3.5">
              {asking ? (
                <div className="flex items-center gap-2 text-sm text-purple-300">
                  <Loader2 size={14} className="animate-spin" /> {t('cmdk.ask.loading')}
                </div>
              ) : answer?.error ? (
                <p className="text-sm text-red-400">{answer.error}</p>
              ) : (
                <>
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-purple-400">
                    <Sparkles size={10} /> {t('cmdk.ask.answer')}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-dark-100">{answer.text}</p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-white/5 px-4 py-2 text-[11px] text-dark-500">
          <span className="flex items-center gap-1"><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> {t('cmdk.nav')}</span>
          <span className="flex items-center gap-1"><kbd className="kbd"><CornerDownLeft size={9} /></kbd> {t('cmdk.open')}</span>
        </div>
      </div>
    </div>
  )
}
