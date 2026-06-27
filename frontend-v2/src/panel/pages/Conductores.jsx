import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, Search, Mail, Phone, X, Plus, Pencil, Check, Trash2,
  UserCheck, MapPin, FileText, IdCard, Car,
} from 'lucide-react'
import { getDrivers, createDriver, updateDriver, deleteDriver } from '../api'

const EMPTY = { name: '', dni: '', phone: '', email: '', driver_id: '', license_number: '', contrato: '', nivel: '', center: '' }

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  'from-violet-500 to-indigo-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-sky-500 to-blue-600',
]
function avatarColor(name) {
  let h = 0
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfffffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

const NIVEL_CFG = {
  pleno: { label: 'Pleno', cls: 'bg-emerald-500/15 text-emerald-300' },
  L1: { label: 'L1', cls: 'bg-sky-500/15 text-sky-300' },
  L2: { label: 'L2', cls: 'bg-amber-500/15 text-amber-300' },
  L3: { label: 'L3', cls: 'bg-red-500/15 text-red-300' },
}
const CONTRATO_CFG = {
  empresa: { label: 'Empresa', cls: 'bg-brand-500/15 text-brand-300' },
  ett: { label: 'ETT', cls: 'bg-purple-500/15 text-purple-300' },
}

export default function Conductores() {
  const { center, centers } = useOutletContext()
  const [drivers, setDrivers] = useState(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [selected, setSelected] = useState(null)   // driver abierto en panel
  const [creating, setCreating] = useState(false)

  async function load() {
    setErr('')
    try {
      const r = await getDrivers(center)
      setDrivers(r.data || [])
    } catch { setErr('No se pudieron cargar los conductores.') }
  }

  useEffect(() => { setDrivers(null); setSelected(null); load() }, [center]) // eslint-disable-line

  const list = useMemo(() => {
    const l = (drivers || []).filter(d =>
      !q ||
      (d.name || '').toLowerCase().includes(q.toLowerCase()) ||
      (d.email || '').toLowerCase().includes(q.toLowerCase()) ||
      (d.center || '').toLowerCase().includes(q.toLowerCase())
    )
    return l.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [drivers, q])

  async function handleSave(id, data) {
    if (id) await updateDriver(id, data)
    else await createDriver(data)
    setSelected(null); setCreating(false)
    setDrivers(null); load()
  }

  async function handleDelete(d) {
    if (!confirm(`¿Eliminar a ${d.name}? Esta acción no se puede deshacer.`)) return
    await deleteDriver(d.id)
    setSelected(null); setDrivers(null); load()
  }

  if (err) return <p className="text-red-400">{err}</p>

  return (
    <div className="flex h-full gap-5">
      {/* ── Lista ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Conductores</h1>
            <p className="text-xs text-dark-500 mt-0.5">{list.length} conductor{list.length !== 1 ? 'es' : ''}{center !== 'Todos' ? ` · ${center}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input className="input w-52 pl-9 text-sm" placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <button
              onClick={() => { setSelected(null); setCreating(true) }}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 hover:bg-brand-600 transition-colors"
            >
              <Plus size={15} /> Nuevo conductor
            </button>
          </div>
        </div>

        {/* Content */}
        {!drivers
          ? <div className="flex items-center gap-2 text-dark-400 py-10"><Loader2 className="animate-spin" size={18} /> Cargando…</div>
          : list.length === 0
            ? <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-dark-700 py-20 text-center">
                <UserCheck size={44} className="mb-3 text-dark-700" />
                <p className="text-dark-400 font-medium">Sin conductores{center !== 'Todos' ? ` en ${center}` : ''}</p>
                <p className="text-dark-600 text-sm mt-1">Empieza añadiendo el primer conductor</p>
                <button onClick={() => setCreating(true)} className="mt-5 flex items-center gap-1.5 rounded-lg bg-brand-500/20 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-500/30">
                  <Plus size={14} /> Añadir conductor
                </button>
              </div>
            : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {list.map(d => {
                  const isActive = selected?.id === d.id
                  const nc = NIVEL_CFG[d.nivel]
                  const cc = CONTRATO_CFG[d.contrato]
                  return (
                    <button
                      key={d.id}
                      onClick={() => { setCreating(false); setSelected(isActive ? null : d) }}
                      className={`group relative flex items-start gap-3.5 rounded-xl border p-4 text-left transition-all ${
                        isActive
                          ? 'border-brand-500/50 bg-brand-500/8 shadow-lg shadow-brand-500/10'
                          : 'border-dark-800 bg-dark-900 hover:border-dark-700 hover:bg-dark-800/60'
                      }`}
                    >
                      {/* Avatar */}
                      <div className={`relative shrink-0`}>
                        {d.photo_url
                          ? <img src={d.photo_url} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-dark-700" />
                          : (
                            <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${avatarColor(d.name)} text-sm font-bold text-white shadow-md`}>
                              {initials(d.name)}
                            </div>
                          )}
                        {isActive && (
                          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-500 ring-2 ring-dark-900">
                            <Check size={8} className="text-white" strokeWidth={3} />
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-dark-50 truncate">{d.name}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          {d.center && (
                            <span className="flex items-center gap-0.5 text-[11px] text-dark-500">
                              <MapPin size={9} />{d.center}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {cc && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cc.cls}`}>{cc.label}</span>}
                          {nc && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${nc.cls}`}>{nc.label}</span>}
                          {!cc && !nc && <span className="text-[11px] text-dark-600">Sin clasificar</span>}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
      </div>

      {/* ── Panel lateral ── */}
      {(selected || creating) && (
        <DriverPanel
          driver={creating ? null : selected}
          centers={centers}
          onSave={handleSave}
          onDelete={creating ? null : handleDelete}
          onClose={() => { setSelected(null); setCreating(false) }}
        />
      )}
    </div>
  )
}

// ── Panel lateral detalle/edición ─────────────────────────────────────────
function DriverPanel({ driver, centers, onSave, onDelete, onClose }) {
  const isNew = !driver
  const [editing, setEditing] = useState(isNew)
  const [form, setForm] = useState(driver ? { ...driver } : { ...EMPTY })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setForm(driver ? { ...driver } : { ...EMPTY })
    setEditing(isNew)
    setErr('')
  }, [driver, isNew])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.name?.trim()) { setErr('El nombre es obligatorio.'); return }
    setBusy(true); setErr('')
    try { await onSave(driver?.id || null, form) }
    catch (ex) { setErr(ex?.response?.data?.detail || 'Error al guardar.'); setBusy(false) }
  }

  const nc = NIVEL_CFG[driver?.nivel]
  const cc = CONTRATO_CFG[driver?.contrato]

  return (
    <div className="hidden w-80 shrink-0 xl:flex flex-col rounded-xl border border-dark-800 bg-dark-900 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-dark-800 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-dark-500">
          {isNew ? 'Nuevo conductor' : editing ? 'Editando' : 'Perfil'}
        </span>
        <button onClick={onClose} className="rounded-md p-1 text-dark-500 hover:bg-dark-800 hover:text-dark-200">
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Vista detalle */}
        {!editing && driver && (
          <div className="p-5">
            {/* Avatar grande */}
            <div className="flex flex-col items-center text-center mb-6">
              {driver.photo_url
                ? <img src={driver.photo_url} alt="" className="h-20 w-20 rounded-full object-cover ring-4 ring-dark-700 mb-3" />
                : (
                  <div className={`flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${avatarColor(driver.name)} text-2xl font-bold text-white shadow-xl mb-3`}>
                    {initials(driver.name)}
                  </div>
                )}
              <h2 className="text-lg font-bold text-dark-50">{driver.name}</h2>
              {driver.center && (
                <span className="mt-1 flex items-center gap-1 text-xs text-dark-500">
                  <MapPin size={11} />{driver.center}
                </span>
              )}
              <div className="mt-2 flex gap-1.5 justify-center flex-wrap">
                {cc && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${cc.cls}`}>{cc.label}</span>}
                {nc && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${nc.cls}`}>{nc.label}</span>}
              </div>
            </div>

            {/* Datos */}
            <div className="space-y-3">
              <InfoRow icon={IdCard} label="DNI / NIE" value={driver.dni} />
              <InfoRow icon={Phone} label="Teléfono" value={driver.phone} />
              <InfoRow icon={Mail} label="Email" value={driver.email} />
              <InfoRow icon={Car} label="Nº carnet" value={driver.license_number} />
              <InfoRow icon={FileText} label="ID Amazon" value={driver.driver_id} mono />
            </div>
          </div>
        )}

        {/* Formulario edición / creación */}
        {editing && (
          <form id="driver-form" onSubmit={submit} className="p-5 space-y-3">
            {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{err}</p>}

            <Field label="Nombre completo *">
              <input className="input w-full text-sm" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre Apellido" autoFocus />
            </Field>

            <Field label="Centro">
              <select className="select w-full text-sm" value={form.center || ''} onChange={e => set('center', e.target.value)}>
                <option value="">— Sin asignar —</option>
                {centers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Contrato">
                <select className="select w-full text-sm" value={form.contrato || ''} onChange={e => set('contrato', e.target.value)}>
                  <option value="">—</option>
                  <option value="empresa">Empresa</option>
                  <option value="ett">ETT</option>
                </select>
              </Field>
              <Field label="Nivel">
                <select className="select w-full text-sm" value={form.nivel || ''} onChange={e => set('nivel', e.target.value)}>
                  <option value="">—</option>
                  <option value="pleno">Pleno</option>
                  <option value="L1">L1</option>
                  <option value="L2">L2</option>
                  <option value="L3">L3</option>
                </select>
              </Field>
            </div>

            <Field label="DNI / NIE">
              <input className="input w-full text-sm" value={form.dni || ''} onChange={e => set('dni', e.target.value)} placeholder="12345678A" />
            </Field>

            <Field label="Teléfono">
              <input className="input w-full text-sm" value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+34 600 000 000" />
            </Field>

            <Field label="Email">
              <input className="input w-full text-sm" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="nombre@email.com" />
            </Field>

            <Field label="Nº carnet conducir">
              <input className="input w-full text-sm" value={form.license_number || ''} onChange={e => set('license_number', e.target.value)} />
            </Field>

            <Field label="ID Amazon">
              <input className="input w-full font-mono text-sm" value={form.driver_id || ''} onChange={e => set('driver_id', e.target.value)} placeholder="AMZN-XXXX" />
            </Field>
          </form>
        )}
      </div>

      {/* Footer acciones */}
      <div className="border-t border-dark-800 p-4">
        {!editing && driver && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-dark-800 py-2.5 text-sm font-semibold text-dark-100 hover:bg-dark-700 transition-colors"
            >
              <Pencil size={14} /> Editar
            </button>
            <button
              onClick={() => onDelete(driver)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
        {editing && (
          <div className="flex gap-2">
            {!isNew && (
              <button
                type="button"
                onClick={() => { setEditing(false); setForm({ ...driver }); setErr('') }}
                className="rounded-lg bg-dark-800 px-3 py-2.5 text-sm font-semibold text-dark-300 hover:bg-dark-700 transition-colors"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              form="driver-form"
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {isNew ? 'Crear conductor' : 'Guardar cambios'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value, mono }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-dark-800">
        <Icon size={13} className="text-dark-400" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-dark-600">{label}</div>
        <div className={`text-sm text-dark-100 truncate ${mono ? 'font-mono text-xs' : 'font-medium'}`}>{value}</div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wide text-dark-500">{label}</label>
      {children}
    </div>
  )
}
