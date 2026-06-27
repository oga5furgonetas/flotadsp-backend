import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, Search, Mail, Phone, X, Plus, Pencil, Trash2, UserCheck,
} from 'lucide-react'
import { getDrivers, createDriver, updateDriver, deleteDriver } from '../api'

const EMPTY = { name: '', dni: '', phone: '', email: '', driver_id: '', license_number: '', contrato: '', nivel: '', center: '' }

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function Conductores() {
  const { center, centers } = useOutletContext()
  const [drivers, setDrivers] = useState(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [modal, setModal] = useState(null) // null | { mode:'create'|'edit', driver }

  async function load() {
    setErr('')
    try {
      const r = await getDrivers(center)
      setDrivers(r.data || [])
    } catch { setErr('No se pudieron cargar los conductores.') }
  }

  useEffect(() => { setDrivers(null); load() }, [center]) // eslint-disable-line

  const list = useMemo(() => {
    const l = (drivers || []).filter(d =>
      !q || (d.name || '').toLowerCase().includes(q.toLowerCase()) ||
      (d.email || '').toLowerCase().includes(q.toLowerCase()) ||
      (d.center || '').toLowerCase().includes(q.toLowerCase())
    )
    return l.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [drivers, q])

  function openCreate() { setModal({ mode: 'create', driver: { ...EMPTY, center: center !== 'Todos' ? center : '' } }) }
  function openEdit(d) { setModal({ mode: 'edit', driver: { ...EMPTY, ...d } }) }

  async function handleSave(data) {
    if (modal.mode === 'create') await createDriver(data)
    else await updateDriver(modal.driver.id, data)
    setModal(null)
    setDrivers(null)
    load()
  }

  async function handleDelete(d) {
    if (!confirm(`¿Eliminar a ${d.name}? Esta acción no se puede deshacer.`)) return
    await deleteDriver(d.id)
    setDrivers(null)
    load()
  }

  if (err) return <p className="text-red-400">{err}</p>

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">
          Conductores <span className="text-dark-500">· {list.length}</span>
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input className="input w-52 pl-9" placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-brand-500/20 px-3 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-500/30">
            <Plus size={15} /> Nuevo conductor
          </button>
        </div>
      </div>

      {/* Table */}
      {!drivers
        ? <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> Cargando…</div>
        : list.length === 0
          ? <div className="card py-16 text-center text-dark-500">
              <UserCheck size={40} className="mx-auto mb-3 opacity-30" />
              <p>No hay conductores{center !== 'Todos' ? ` en ${center}` : ''}.</p>
              <button onClick={openCreate} className="mt-4 text-sm text-brand-400 underline">Crear el primero</button>
            </div>
          : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-800 text-left text-xs uppercase tracking-wide text-dark-500">
                    <th className="px-4 py-2.5">Conductor</th>
                    <th className="px-4 py-2.5">Centro</th>
                    <th className="px-4 py-2.5">Contacto</th>
                    <th className="px-4 py-2.5">Contrato</th>
                    <th className="px-4 py-2.5">ID Amazon</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(d => (
                    <tr key={d.id} className="border-b border-dark-800/60 hover:bg-dark-800/20">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          {d.photo_url
                            ? <img src={d.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                            : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-300">{initials(d.name)}</div>}
                          <div>
                            <div className="font-medium">{d.name}</div>
                            {d.dni && <div className="text-[11px] text-dark-500">{d.dni}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {d.center
                          ? <span className="rounded-full bg-dark-700 px-2 py-0.5 text-xs text-dark-300">{d.center}</span>
                          : <span className="text-dark-600">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-dark-400">
                        <div className="flex flex-col gap-0.5 text-xs">
                          {d.email && <span className="flex items-center gap-1"><Mail size={11} />{d.email}</span>}
                          {d.phone && <span className="flex items-center gap-1"><Phone size={11} />{d.phone}</span>}
                          {!d.email && !d.phone && '—'}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {d.contrato && <span className="rounded bg-dark-700 px-1.5 py-0.5 text-[10px] uppercase text-dark-300">{d.contrato}</span>}
                          {d.nivel && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300">{d.nivel}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-dark-500 font-mono">{d.driver_id || '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(d)} className="rounded p-1.5 text-dark-400 hover:bg-dark-700 hover:text-dark-100" title="Editar">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDelete(d)} className="rounded p-1.5 text-dark-400 hover:bg-red-500/10 hover:text-red-400" title="Eliminar">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      }

      {modal && (
        <DriverModal
          mode={modal.mode}
          initial={modal.driver}
          centers={centers}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function DriverModal({ mode, initial, centers, onSave, onClose }) {
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.name?.trim()) { setErr('El nombre es obligatorio.'); return }
    setBusy(true); setErr('')
    try {
      await onSave(form)
    } catch (ex) {
      setErr(ex?.response?.data?.detail || 'Error al guardar.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-dark-900 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-dark-800 px-5 py-4">
          <h2 className="font-bold">{mode === 'create' ? 'Nuevo conductor' : 'Editar conductor'}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <form onSubmit={submit} className="p-5">
          {err && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-dark-400">Nombre completo *</label>
              <input className="input w-full" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre Apellido" required />
            </div>

            <div>
              <label className="mb-1 block text-xs text-dark-400">DNI / NIE</label>
              <input className="input w-full" value={form.dni || ''} onChange={e => set('dni', e.target.value)} placeholder="12345678A" />
            </div>

            <div>
              <label className="mb-1 block text-xs text-dark-400">Centro</label>
              <select className="select w-full" value={form.center || ''} onChange={e => set('center', e.target.value)}>
                <option value="">— Sin asignar —</option>
                {centers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-dark-400">Teléfono</label>
              <input className="input w-full" value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+34 600 000 000" />
            </div>

            <div>
              <label className="mb-1 block text-xs text-dark-400">Email</label>
              <input className="input w-full" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="conductor@email.com" />
            </div>

            <div>
              <label className="mb-1 block text-xs text-dark-400">ID Amazon</label>
              <input className="input w-full font-mono" value={form.driver_id || ''} onChange={e => set('driver_id', e.target.value)} placeholder="AMZN-XXXX" />
            </div>

            <div>
              <label className="mb-1 block text-xs text-dark-400">Nº carnet conducir</label>
              <input className="input w-full" value={form.license_number || ''} onChange={e => set('license_number', e.target.value)} />
            </div>

            <div>
              <label className="mb-1 block text-xs text-dark-400">Tipo contrato</label>
              <select className="select w-full" value={form.contrato || ''} onChange={e => set('contrato', e.target.value)}>
                <option value="">—</option>
                <option value="empresa">Empresa</option>
                <option value="ett">ETT</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-dark-400">Nivel</label>
              <select className="select w-full" value={form.nivel || ''} onChange={e => set('nivel', e.target.value)}>
                <option value="">—</option>
                <option value="pleno">Pleno</option>
                <option value="L1">L1</option>
                <option value="L2">L2</option>
                <option value="L3">L3</option>
              </select>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Cancelar</button>
            <button type="submit" disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
              {busy && <Loader2 size={14} className="animate-spin" />}
              {mode === 'create' ? 'Crear conductor' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
