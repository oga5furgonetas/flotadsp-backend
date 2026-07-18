import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT } from '../../i18n'
import {
  Loader2, CheckSquare, Sun, Moon, Pencil, Plus, Trash2, Save, X, Calendar,
} from 'lucide-react'
import { getChecklist, upsertChecklist, toggleChecklistItem, saveChecklistTemplate } from '../api'

const isoToday = () => new Date().toISOString().slice(0, 10)

export default function ChecklistOperativo() {
  const { center, centers } = useOutletContext()
  const { t } = useT()
  const [date, setDate] = useState(isoToday())
  const [shift, setShift] = useState('manana')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState([])
  const [saving, setSaving] = useState(false)
  const [tplSaving, setTplSaving] = useState(false)
  const [err, setErr] = useState('')

  async function saveAsTemplate() {
    const items = data?.[shift]?.items || []
    if (items.length === 0) return
    if (!confirm(`¿Usar estas ${items.length} tareas como plantilla recurrente de ${center} (${shift === 'manana' ? 'mañana' : 'tarde'})?\nCada día nuevo de ${center} nacerá con ellas. Los demás centros no cambian.`)) return
    setTplSaving(true)
    try {
      await saveChecklistTemplate({ center, shift, items })
      alert(`✅ Plantilla de ${center} guardada. Desde mañana, sus checklists nacen con estas tareas.`)
    } catch (e) {
      alert(e?.response?.data?.detail || 'No se pudo guardar la plantilla')
    } finally { setTplSaving(false) }
  }
  const noCenter = center === 'Todos'

  const load = useCallback(async () => {
    if (noCenter) return
    setLoading(true); setErr('')
    try {
      const r = await getChecklist(center, date)
      setData(r.data)
    } catch (e) { setErr(e?.response?.data?.detail || 'No se pudo cargar.') }
    setLoading(false)
  }, [center, date, noCenter])
  useEffect(() => { load() }, [load])

  const current = data?.[shift]
  const items = current?.items || []
  const completed = items.filter((i) => i.done).length
  const total = items.length || 1
  const pct = Math.round((completed / total) * 100)

  async function toggle(item) {
    const next = { ...data, [shift]: { ...current, items: items.map((i) => i.id === item.id ? { ...i, done: !i.done } : i) } }
    setData(next)
    try {
      await toggleChecklistItem({ center, date, shift, item_id: item.id, done: !item.done })
    } catch (e) {
      setErr('No se pudo actualizar.'); load()
    }
  }

  function startEdit() {
    setDraft(items.map((i) => ({ ...i })))
    setEditing(true)
  }
  function addRow() { setDraft((d) => [...d, { id: crypto.randomUUID(), text: '', done: false }]) }
  function rmRow(id) { setDraft((d) => d.filter((x) => x.id !== id)) }
  function setItemText(id, text) { setDraft((d) => d.map((x) => x.id === id ? { ...x, text } : x)) }

  async function saveEdit() {
    setSaving(true); setErr('')
    try {
      const clean = draft.map((d) => ({ id: d.id, text: (d.text || '').trim(), done: !!d.done, done_by: d.done_by || null, done_at: d.done_at || null })).filter((d) => d.text)
      await upsertChecklist({ center, date, shift, items: clean })
      setEditing(false)
      await load()
    } catch (e) {
      const d = e?.response?.data?.detail
      const status = e?.response?.status
      setErr(`No se pudo guardar${status ? ` (${status})` : ''}: ${typeof d === 'string' ? d : JSON.stringify(d || e?.message)}`)
    }
    setSaving(false)
  }

  const SHIFTS = [
    { k: 'manana', label: t('chk.shift.morning'), icon: Sun },
    { k: 'tarde',  label: t('chk.shift.afternoon'), icon: Moon },
  ]

  if (noCenter) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="rise mb-5 font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">{t('chk.title')}</h1>
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <CheckSquare size={28} className="text-brand-400" />
          <p className="text-dark-200">Elige un centro arriba para ver su checklist.</p>
          <p className="text-sm text-dark-500">Disponibles: {centers?.join(' · ') || '—'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="rise font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">{t('chk.title')} <span className="text-dark-600">· {center}</span></h1>
          <p className="text-sm text-dark-400">{t('chk.critical.tasks')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-dark-500" />
          <input type="date" className="input w-44 py-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {/* Tabs turno */}
      <div className="mb-4 flex gap-2">
        {SHIFTS.map((s) => (
          <button key={s.k} onClick={() => { setShift(s.k); setEditing(false) }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
              shift === s.k ? 'border-brand-500 bg-brand-500/15 text-brand-200' : 'border-dark-800 bg-dark-900 text-dark-300 hover:bg-dark-800'
            }`}>
            <s.icon size={15} /> {s.label}
          </button>
        ))}
      </div>

      {/* Progreso + acciones */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-brand-400">{pct}%</span>
          <span className="text-xs uppercase tracking-wide text-dark-500">{t('chk.completed')} ({completed}/{total})</span>
        </div>
        {!editing ? (
          <div className="flex items-center gap-2">
            <button onClick={saveAsTemplate} disabled={tplSaving}
              title={`Las tareas actuales pasan a ser la plantilla recurrente de ${center} (${shift === 'manana' ? 'mañana' : 'tarde'}): cada día nuevo nacerá con ellas. Cada centro tiene la suya.`}
              className="btn-ghost flex items-center gap-1.5 text-xs text-dark-400 hover:text-brand-300">
              {tplSaving ? <Loader2 size={13} className="animate-spin" /> : '📌'} Plantilla de {center}
            </button>
            <button onClick={startEdit} className="btn-secondary flex items-center gap-1.5 text-sm"><Pencil size={14} /> {t('ui.edit')}</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="btn-ghost flex items-center gap-1.5 text-sm"><X size={14} /> {t('ui.cancel')}</button>
            <button onClick={saveEdit} disabled={saving} className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {t('ui.save')}
            </button>
          </div>
        )}
      </div>

      <div className="mb-5 h-2 overflow-hidden rounded-full bg-dark-800">
        <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-brand-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {err && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> {t('ui.loading')}</div>
      ) : editing ? (
        <div className="card divide-y divide-dark-800">
          {draft.map((d) => (
            <div key={d.id} className="flex items-center gap-2 px-3 py-2">
              <input className="input flex-1 text-sm" value={d.text} placeholder="Tarea…" onChange={(e) => setItemText(d.id, e.target.value)} />
              <button onClick={() => rmRow(d.id)} className="btn-ghost p-1.5 text-red-400" title="Quitar"><Trash2 size={14} /></button>
            </div>
          ))}
          <div className="px-3 py-2">
            <button onClick={addRow} className="btn-ghost flex w-full items-center justify-center gap-1.5 text-sm text-dark-300 hover:text-brand-300"><Plus size={14} /> {t('chk.add.task')}</button>
          </div>
        </div>
      ) : (
        <div className="card divide-y divide-dark-800">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-dark-500">{t('chk.no.tasks')}</div>
          ) : items.map((it) => (
            <button key={it.id} onClick={() => toggle(it)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-dark-800/40">
              <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded ${it.done ? 'bg-brand-500' : 'border border-dark-600 bg-transparent'}`}>
                {it.done && <CheckSquare size={14} className="text-white" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-sm ${it.done ? 'text-dark-500 line-through' : 'text-dark-100'}`}>{it.text}</div>
                {it.done && it.done_by && (
                  <div className="mt-0.5 text-[11px] text-dark-500">
                    {t('chk.done.at').replace('{time}', (it.done_at || '').slice(11, 16)).replace('{name}', it.done_by)}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
