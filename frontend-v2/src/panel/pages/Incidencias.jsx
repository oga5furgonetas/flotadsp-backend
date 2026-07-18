import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT } from '../../i18n'
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronUp,
  Clock, Edit2, Loader2, Plus, RefreshCw, Trash2, Truck, X,
} from 'lucide-react'
import { getIncidents, createIncident, updateIncident, deleteIncident, resolveIncident, reopenIncident, getVehicles } from '../api'

const SEV_CLS = {
  leve:     'bg-yellow-500/15 text-yellow-300 ring-yellow-500/25',
  moderado: 'bg-amber-500/15  text-amber-300  ring-amber-500/25',
  grave:    'bg-orange-500/15 text-orange-300 ring-orange-500/25',
  critico:  'bg-red-500/15    text-red-300    ring-red-500/25',
  media:    'bg-amber-500/15  text-amber-300  ring-amber-500/25',
}
const SEV_OPTS = ['leve', 'moderado', 'grave', 'critico']
const STATUS_CLS = {
  open:     'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
  resolved: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  closed:   'bg-dark-700 text-dark-400 ring-1 ring-dark-600',
}

function IncModal({ inc, vehicles, onSave, onClose }) {
  const { t } = useT()
  const isNew = !inc?.id
  const [form, setForm] = useState({
    vehicle_id: inc?.vehicle_id || '',
    title: inc?.title || '',
    description: inc?.description || '',
    severity: inc?.severity || 'leve',
    notes: inc?.notes || '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const valid = form.vehicle_id && form.description.trim().length >= 3

  async function submit() {
    if (!valid) return
    setBusy(true); setErr('')
    try {
      if (isNew) await createIncident(form)
      else await updateIncident(inc.id, { title: form.title, description: form.description, severity: form.severity, notes: form.notes })
      onSave()
    } catch { setErr(t('inc.save.error')) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    const fn = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-4 w-full max-w-lg rounded-2xl border border-dark-700 bg-dark-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-dark-500 hover:bg-dark-800 hover:text-white transition"><X size={15} /></button>

        <h2 className="mb-5 text-base font-bold text-dark-50">{isNew ? t('inc.new') : t('inc.edit')}</h2>

        <div className="space-y-3">
          {isNew && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-600">{t('inc.vehicle')} <span className="text-red-400">*</span></label>
              <select className="select w-full text-sm" value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}>
                <option value="">{t('inc.select.vehicle')}</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.license_plate}{v.brand ? ` · ${v.brand}` : ''}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-600">{t('inc.field.title')}</label>
            <input className="input w-full text-sm" placeholder="Título breve…" value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-600">{t('inc.field.desc')} <span className="text-red-400">*</span></label>
            <textarea
              className="input w-full resize-none text-sm leading-relaxed"
              rows={4}
              placeholder="Describe la incidencia con detalle…"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              autoFocus={!isNew}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-600">{t('inc.field.sev')}</label>
            <div className="flex gap-2">
              {SEV_OPTS.map(s => (
                <button
                  key={s}
                  onClick={() => set('severity', s)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition ${form.severity === s ? `border-current ${SEV_CLS[s].split(' ').slice(1).join(' ')} bg-dark-800` : 'border-dark-700 text-dark-500 hover:border-dark-600'}`}
                >
                  {t(`sev.${s}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-600">{t('inc.field.notes')}</label>
            <input className="input w-full text-sm" placeholder="Notas adicionales…" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        {err && <p className="mt-3 text-xs text-red-400">{err}</p>}

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-dark-700 py-2.5 text-sm text-dark-400 hover:border-dark-600 transition">{t('ui.cancel')}</button>
          <button
            onClick={submit}
            disabled={!valid || busy}
            className="flex-1 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-500/25 transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="mx-auto animate-spin" /> : isNew ? t('inc.create') : t('inc.save.changes')}
          </button>
        </div>
      </div>
    </div>
  )
}

function DelModal({ onConfirm, onClose }) {
  const { t } = useT()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-dark-700 bg-dark-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15">
          <Trash2 size={20} className="text-red-400" />
        </div>
        <h2 className="mb-1 text-sm font-bold text-dark-50">{t('inc.delete.confirm')}</h2>
        <p className="mb-5 text-xs text-dark-500">{t('inc.delete.warning')}</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-dark-700 py-2.5 text-sm text-dark-400 hover:border-dark-600 transition">{t('ui.cancel')}</button>
          <button onClick={onConfirm} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white transition hover:bg-red-500">{t('inc.delete')}</button>
        </div>
      </div>
    </div>
  )
}

function IncCard({ inc, vehicleMap, onEdit, onDelete, onResolve, onReopen }) {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)
  const sevCls = SEV_CLS[inc.severity] || SEV_CLS.leve
  const stCls  = STATUS_CLS[inc.status] || STATUS_CLS.open
  const plate = vehicleMap[inc.vehicle_id] || inc.vehicle_id || '—'
  const isOpen = inc.status === 'open'

  function fmtRelative(iso) {
    if (!iso) return ''
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return t('inc.time.now')
    if (m < 60) return t('inc.time.min').replace('{n}', m)
    const h = Math.floor(m / 60)
    if (h < 24) return t('inc.time.hour').replace('{n}', h)
    return t('inc.time.day').replace('{n}', Math.floor(h / 24))
  }

  function fmtDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className={`float-row overflow-hidden rounded-2xl border ${isOpen ? 'border-white/[0.07] bg-white/[0.03]' : 'border-white/[0.04] bg-white/[0.015] opacity-80'}`}>
      <div className="flex items-start gap-3 p-4">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${sevCls}`}>
          <AlertTriangle size={15} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start gap-2">
            <span className="font-semibold text-sm text-dark-100 leading-snug">{inc.title || t('inc.no.title')}</span>
            <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${sevCls}`}>{t(`sev.${inc.severity}`) || inc.severity}</span>
            <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${stCls}`}>
              {inc.status === 'open' ? t('inc.status.open') : inc.status === 'resolved' ? t('inc.status.resolved') : t('inc.status.closed')}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-dark-500">
            <span className="flex items-center gap-1"><Truck size={9} /> {plate}</span>
            <span className="flex items-center gap-1"><Clock size={9} /> {fmtRelative(inc.created_at)}</span>
            {inc.resolved_at && <span className="text-emerald-600">{t('inc.resolved.rel')} {fmtRelative(inc.resolved_at)}</span>}
          </div>

          {!expanded && inc.description && (
            <p className="mt-1.5 text-[12px] text-dark-500 line-clamp-2">{inc.description}</p>
          )}
        </div>

        <button onClick={() => setExpanded(v => !v)} className="shrink-0 text-dark-600 hover:text-dark-300 transition">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.05] bg-black/20 px-4 py-3 space-y-3">
          {inc.description && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-dark-700">{t('inc.field.desc.label')}</div>
              <p className="text-sm text-dark-400 leading-relaxed whitespace-pre-wrap">{inc.description}</p>
            </div>
          )}
          {inc.notes && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-dark-700">{t('inc.field.notes.label')}</div>
              <p className="text-sm text-dark-500 italic">{inc.notes}</p>
            </div>
          )}
          <div className="text-[11px] text-dark-700">
            {t('inc.created')} {fmtDate(inc.created_at)}
            {inc.resolved_at && <> {t('inc.resolved.date')} {fmtDate(inc.resolved_at)}</>}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => onEdit(inc)}
              className="flex items-center gap-1.5 rounded-xl border border-dark-700 px-3 py-1.5 text-xs text-dark-400 transition hover:border-dark-600 hover:text-dark-200"
            >
              <Edit2 size={11} /> {t('inc.edit.btn')}
            </button>
            {isOpen ? (
              <button
                onClick={() => onResolve(inc.id)}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
              >
                <CheckCircle2 size={11} /> {t('inc.resolve')}
              </button>
            ) : (
              <button
                onClick={() => onReopen(inc.id)}
                className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400 transition hover:bg-amber-500/20"
              >
                <RefreshCw size={11} /> {t('inc.reopen')}
              </button>
            )}
            <button
              onClick={() => onDelete(inc.id)}
              className="ml-auto flex items-center gap-1.5 rounded-xl border border-red-500/20 px-3 py-1.5 text-xs text-red-500 transition hover:bg-red-500/10"
            >
              <Trash2 size={11} /> {t('inc.delete')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Incidencias() {
  const { center } = useOutletContext?.() || {}
  const { t } = useT()

  const [incidents, setIncidents] = useState([])
  const [vehicles,  setVehicles]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('open')
  const [q,         setQ]         = useState('')
  const [modal,     setModal]     = useState(null)
  const [delId,     setDelId]     = useState(null)

  const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v.license_plate]))

  const [tick, setTick] = useState(0)
  const load = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      getIncidents(),
      getVehicles(center).catch(() => ({ data: [] })),
    ]).then(([inc, vs]) => {
      if (!active) return
      setIncidents(Array.isArray(inc.data) ? inc.data : [])
      setVehicles(Array.isArray(vs.data) ? vs.data : [])
    }).catch(() => {}).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [center, tick])

  const filtered = incidents.filter(inc => {
    if (filter === 'open' && inc.status !== 'open') return false
    if (filter === 'resolved' && !['resolved', 'closed'].includes(inc.status)) return false
    if (q) {
      const s = q.toLowerCase()
      const plate = (vehicleMap[inc.vehicle_id] || '').toLowerCase()
      return [inc.title, inc.description, inc.notes, plate].some(x => (x || '').toLowerCase().includes(s))
    }
    return true
  })

  const openCount     = incidents.filter(i => i.status === 'open').length
  const resolvedCount = incidents.filter(i => ['resolved', 'closed'].includes(i.status)).length

  async function handleResolve(id) {
    await resolveIncident(id).catch(() => {})
    load()
  }
  async function handleReopen(id) {
    await reopenIncident(id).catch(() => {})
    load()
  }
  async function handleDelete(id) {
    await deleteIncident(id).catch(() => {})
    setDelId(null)
    load()
  }

  return (
    <div className="space-y-4">
      <header className="rise">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[clamp(28px,3.4vw,42px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">{t('inc.title')}</h1>
            <p className="mt-3 text-[13.5px] text-dark-500">
              <span className={`font-semibold tabular-nums ${openCount > 0 ? 'text-red-300' : 'text-dark-300'}`}>{openCount}</span> {t('inc.open')}
              <span className="mx-2 text-dark-700">·</span>
              <span className="font-semibold tabular-nums text-dark-300">{resolvedCount}</span> {t('inc.closed')}
            </p>
          </div>
          <button
            onClick={() => setModal('new')}
            className="group relative flex items-center gap-1.5 overflow-hidden rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-lg shadow-brand-500/25 transition-all duration-300 [text-shadow:0_1px_1px_rgba(0,0,0,0.15)] hover:-translate-y-px hover:shadow-xl hover:shadow-brand-500/30 hover:brightness-110 active:translate-y-0 active:scale-[0.98]"
          >
            <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
            <Plus size={15} /> {t('inc.add')}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {[['open', t('inc.open')],['resolved', t('inc.closed')],['all', t('ui.all')]].map(([v,l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition ${filter === v ? 'bg-brand-500/15 text-brand-300 ring-brand-500/30' : 'text-dark-500 ring-transparent hover:text-dark-300'}`}
          >
            {l}
          </button>
        ))}
        <div className="ml-auto flex-1 max-w-xs">
          <input
            className="input w-full text-sm"
            placeholder={t('inc.search.ph')}
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-dark-400">
          <Loader2 size={18} className="animate-spin" /> {t('inc.loading')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dark-800 bg-dark-900/40 py-16 text-center">
          <CheckCircle2 size={32} className="text-dark-700" />
          <p className="text-sm text-dark-500">{filter === 'open' ? t('inc.empty') : t('ui.nodata')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inc => (
            <IncCard
              key={inc.id}
              inc={inc}
              vehicleMap={vehicleMap}
              onEdit={i => setModal(i)}
              onDelete={id => setDelId(id)}
              onResolve={handleResolve}
              onReopen={handleReopen}
            />
          ))}
        </div>
      )}

      {modal && (
        <IncModal
          inc={modal === 'new' ? null : modal}
          vehicles={vehicles}
          onSave={() => { setModal(null); load() }}
          onClose={() => setModal(null)}
        />
      )}
      {delId && (
        <DelModal
          onConfirm={() => handleDelete(delId)}
          onClose={() => setDelId(null)}
        />
      )}
    </div>
  )
}
