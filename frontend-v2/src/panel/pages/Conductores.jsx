import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, Search, Plus, X, Pencil, Trash2, Check, UserCheck,
  Phone, Mail, IdCard, Car, MapPin, FileText, Building2, Save,
} from 'lucide-react'
import { getDrivers, createDriver, updateDriver, deleteDriver } from '../api'

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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Conductores() {
  const { center, centers } = useOutletContext()
  const [drivers, setDrivers] = useState(null)
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null) // null | { driver: obj|null }

  async function load() {
    try { const r = await getDrivers(center); setDrivers(r.data || []) }
    catch { setDrivers([]) }
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

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Conductores</h1>
          <p className="mt-0.5 text-xs text-dark-500">
            {(drivers || []).length} conductor{(drivers || []).length !== 1 ? 'es' : ''}
            {center !== 'Todos' ? ` · ${center}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input className="input w-52 pl-9 text-sm" placeholder="Buscar conductor…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <button
            onClick={() => setModal({ driver: null })}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 hover:bg-brand-600 transition-colors"
          >
            <Plus size={15} /> Nuevo conductor
          </button>
        </div>
      </div>

      {/* Grid */}
      {!drivers
        ? <div className="flex items-center gap-2 py-16 text-dark-400"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
        : list.length === 0
          ? <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-dark-700 py-24 text-center">
              <UserCheck size={48} className="mb-4 text-dark-700" />
              <p className="font-medium text-dark-400">Sin conductores{center !== 'Todos' ? ` en ${center}` : ''}</p>
              <p className="mt-1 text-sm text-dark-600">Añade el primero para empezar</p>
              <button onClick={() => setModal({ driver: null })} className="mt-5 flex items-center gap-1.5 rounded-lg bg-brand-500/15 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-500/25">
                <Plus size={14} /> Añadir conductor
              </button>
            </div>
          : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list.map(d => {
                const [nl, nc] = NIVEL[d.nivel] || []
                const [cl, cc] = CONTRATO[d.contrato] || []
                return (
                  <button
                    key={d.id}
                    onClick={() => setModal({ driver: d })}
                    className="group flex flex-col rounded-2xl border border-dark-800 bg-dark-900 p-5 text-left transition-all hover:border-dark-700 hover:bg-dark-800/70 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <Avatar driver={d} size={12} />
                      <div className="flex flex-wrap gap-1 justify-end">
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
                      {!d.phone && !d.email && <span className="text-[11px] text-dark-700">Sin contacto</span>}
                    </div>
                  </button>
                )
              })}
            </div>
      }

      {/* Modal */}
      {modal && (
        <DriverModal
          driver={modal.driver}
          centers={centers}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function DriverModal({ driver, centers, onSave, onDelete, onClose }) {
  const isNew = !driver
  const [editing, setEditing] = useState(isNew)
  const [form, setForm] = useState(driver ? { ...driver } : { ...EMPTY })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function cancel() { if (isNew) onClose(); else { setForm({ ...driver }); setEditing(false); setErr('') } }

  async function submit(e) {
    e.preventDefault()
    if (!form.name?.trim()) { setErr('El nombre es obligatorio.'); return }
    setBusy(true); setErr('')
    try { await onSave(driver?.id || null, form) }
    catch (ex) { setErr(ex?.response?.data?.detail || 'Error al guardar.'); setBusy(false) }
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
            {driver && <Avatar driver={driver} size={10} />}
            <div>
              <h2 className="font-bold text-dark-50">
                {isNew ? 'Nuevo conductor' : driver.name}
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
                <Pencil size={12} /> Editar
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
              Cancelar
            </button>
            <button
              type="submit"
              form="driver-form"
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isNew ? 'Crear conductor' : 'Guardar cambios'}
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
