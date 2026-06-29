import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import {
  Loader2, Plus, Search, Phone, Mail, MapPin, Edit2,
  Trash2, X, User, Briefcase, StickyNote, Check,
} from 'lucide-react'

import { api } from '../../services/api'
const getContacts    = ()         => api.get('/contacts')
const createContact  = (body)     => api.post('/contacts', body)
const updateContact  = (id, body) => api.patch(`/contacts/${id}`, body)
const deleteContact  = (id)       => api.delete(`/contacts/${id}`)

function Avatar({ name, size = 'md' }) {
  const initials = (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const colors = [
    'bg-blue-500/20 text-blue-300',
    'bg-violet-500/20 text-violet-300',
    'bg-emerald-500/20 text-emerald-300',
    'bg-amber-500/20 text-amber-300',
    'bg-rose-500/20 text-rose-300',
    'bg-cyan-500/20 text-cyan-300',
  ]
  const color = colors[(name || '').charCodeAt(0) % colors.length]
  const sz = size === 'lg' ? 'h-14 w-14 text-lg' : 'h-10 w-10 text-sm'
  return (
    <div className={`shrink-0 flex items-center justify-center rounded-2xl font-bold ring-1 ring-white/10 ${sz} ${color}`}>
      {initials}
    </div>
  )
}

function ContactModal({ contact, onSave, onClose }) {
  const { t } = useT()
  const isNew = !contact?.id
  const [form, setForm] = useState({
    name:   contact?.name   || '',
    role:   contact?.role   || '',
    phone:  contact?.phone  || '',
    email:  contact?.email  || '',
    center: contact?.center || '',
    notes:  contact?.notes  || '',
  })
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const valid = form.name.trim().length >= 2

  async function submit() {
    if (!valid) return
    setBusy(true); setErr('')
    try {
      if (isNew) await createContact(form)
      else await updateContact(contact.id, form)
      onSave()
    } catch { setErr(t('ct.save.error')) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    const fn = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-dark-700 bg-dark-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-dark-500 hover:bg-dark-800 hover:text-white transition">
          <X size={15} />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <Avatar name={form.name || '?'} size="lg" />
          <div>
            <h2 className="text-base font-bold text-dark-50">{isNew ? t('ct.new') : t('ct.edit')}</h2>
            {form.role && <p className="text-xs text-dark-500">{form.role}</p>}
          </div>
        </div>

        <div className="space-y-3">
          <Field label={t('ct.full.name')} icon={<User size={12} />}>
            <input className="input w-full text-sm" placeholder={t('ct.full.name')} value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
          </Field>
          <Field label={t('ct.role')} icon={<Briefcase size={12} />}>
            <input className="input w-full text-sm" placeholder="Conductor, jefe de turno…" value={form.role} onChange={e => set('role', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('ct.phone')} icon={<Phone size={12} />}>
              <input className="input w-full text-sm" placeholder="+34 600…" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </Field>
            <Field label="Email" icon={<Mail size={12} />}>
              <input className="input w-full text-sm" placeholder="correo@…" value={form.email} onChange={e => set('email', e.target.value)} />
            </Field>
          </div>
          <Field label={t('ct.center')} icon={<MapPin size={12} />}>
            <input className="input w-full text-sm" placeholder="OGA5, DGA1…" value={form.center} onChange={e => set('center', e.target.value)} />
          </Field>
          <Field label={t('ct.notes')} icon={<StickyNote size={12} />}>
            <textarea className="input w-full resize-none text-sm" rows={2} placeholder="Cualquier nota relevante…" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </Field>
        </div>

        {err && <p className="mt-3 text-xs text-red-400">{err}</p>}

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-dark-700 py-2.5 text-sm text-dark-400 hover:border-dark-600 transition">{t('ui.cancel')}</button>
          <button
            onClick={submit}
            disabled={!valid || busy}
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500 disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="mx-auto animate-spin" /> : isNew ? t('ct.add') : t('ui.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, icon, children }) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-dark-600">
        {icon} {label}
      </label>
      {children}
    </div>
  )
}

function ContactCard({ contact, onEdit, onDelete }) {
  const [delConfirm, setDelConfirm] = useState(false)

  return (
    <div className="group relative flex gap-3 rounded-2xl border border-dark-700/60 bg-dark-800/50 p-4 transition hover:border-dark-600">
      <Avatar name={contact.name} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-sm text-dark-100 leading-snug">{contact.name}</div>
            {contact.role && <div className="text-[11px] text-dark-500">{contact.role}</div>}
          </div>
          {contact.center && (
            <span className="shrink-0 rounded-full bg-dark-700 px-2 py-0.5 text-[10px] font-semibold text-dark-400">
              {contact.center}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-3">
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-[11px] text-dark-400 hover:text-blue-400 transition">
              <Phone size={10} /> {contact.phone}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-[11px] text-dark-400 hover:text-blue-400 transition">
              <Mail size={10} /> {contact.email}
            </a>
          )}
        </div>

        {contact.notes && (
          <p className="mt-1.5 text-[11px] italic text-dark-600 line-clamp-2">{contact.notes}</p>
        )}
      </div>

      <div className="flex shrink-0 items-start gap-1 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={() => onEdit(contact)}
          className="rounded-lg p-1.5 text-dark-600 hover:bg-dark-700 hover:text-dark-200 transition"
          title="Editar"
        >
          <Edit2 size={12} />
        </button>
        {delConfirm ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setDelConfirm(false); onDelete(contact.id) }}
              className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/15 transition"
              title="Confirmar eliminar"
            >
              <Check size={12} />
            </button>
            <button onClick={() => setDelConfirm(false)} className="rounded-lg p-1.5 text-dark-600 hover:text-dark-300 transition">
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setDelConfirm(true)}
            className="rounded-lg p-1.5 text-dark-600 hover:bg-red-500/15 hover:text-red-400 transition"
            title="Eliminar"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function Contactos() {
  const { t } = useT()
  const [contacts, setContacts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [q,        setQ]        = useState('')
  const [modal,    setModal]    = useState(null)

  const [tick, setTick] = useState(0)
  const reload = () => setTick(t => t + 1)

  useEffect(() => {
    let active = true
    setLoading(true)
    getContacts()
      .then(r => { if (active) setContacts(Array.isArray(r.data) ? r.data : []) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [tick])

  const filtered = contacts.filter(c => {
    if (!q) return true
    const s = q.toLowerCase()
    return [c.name, c.role, c.phone, c.email, c.center, c.notes].some(x => (x || '').toLowerCase().includes(s))
  })

  async function handleDelete(id) {
    await deleteContact(id).catch(() => {})
    reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('ct.title')}</h1>
          <p className="mt-0.5 text-xs text-dark-500">
            {contacts.length} {contacts.length === 1 ? t('ct.count.one') : t('ct.count.many')}
          </p>
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
        >
          <Plus size={14} /> {t('ct.add')}
        </button>
      </div>

      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-600" />
        <input
          className="input w-full pl-8 text-sm"
          placeholder={t('ct.search.ph')}
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-dark-400">
          <Loader2 size={18} className="animate-spin" /> {t('ct.loading')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dark-800 bg-dark-900/40 py-16 text-center">
          <User size={32} className="text-dark-700" />
          <p className="text-sm text-dark-500">{q ? t('ct.no.results') : t('ct.empty')}</p>
          {!q && (
            <button onClick={() => setModal('new')} className="mt-1 rounded-xl bg-blue-600/20 px-4 py-2 text-sm font-semibold text-blue-400 hover:bg-blue-600/30 transition">
              <Plus size={12} className="mr-1 inline" /> {t('ct.add')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map(c => (
            <ContactCard
              key={c.id}
              contact={c}
              onEdit={c => setModal(c)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {modal && (
        <ContactModal
          contact={modal === 'new' ? null : modal}
          onSave={() => { setModal(null); reload() }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
