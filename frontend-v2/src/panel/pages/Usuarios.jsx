import { useEffect, useState } from 'react'
import { Loader2, UserPlus, Trash2, Save, ShieldCheck, X } from 'lucide-react'
import { getAdmins, createAdmin, updateAdmin, deleteAdmin } from '../api'
import { getAdmin } from '../auth'

// Catálogo de módulos asignables (la clave = último segmento de la ruta del panel)
const MODULES = [
  { g: 'Operacional', items: [
    ['dashboard', 'Dashboard'], ['scorecard', 'Scorecard'], ['conductores', 'Conductores'],
    ['turnos', 'Turnos'], ['metricas', 'Métricas'], ['actividad', 'Actividad'],
  ]},
  { g: 'Furgonetas', items: [
    ['revision', 'Revisión rápida'], ['inspecciones', 'Inspecciones'], ['vehiculos', 'Vehículos'],
    ['talleres', 'Talleres'], ['avisos-itv', 'Avisos ITV'], ['renting', 'Renting'],
    ['casas-alquiler', 'Casas de alquiler'], ['ia-peritaje', 'IA Peritaje'],
    ['importaciones', 'Importaciones'], ['configuracion', 'Configuración'],
  ]},
]
const ALL_KEYS = MODULES.flatMap((g) => g.items.map(([k]) => k))
const labelOf = (k) => MODULES.flatMap((g) => g.items).find(([kk]) => kk === k)?.[1] || k

export default function Usuarios() {
  const me = getAdmin()
  const [users, setUsers] = useState(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const allOrgCenters = me?.centers || []
  const [form, setForm] = useState({ name: '', username: '', password: '', perms: ALL_KEYS, centers: null })
  const [editing, setEditing] = useState(null) // {id, perms, centers}

  function load() {
    getAdmins().then((r) => setUsers(r.data || [])).catch(() => setErr('No se pudieron cargar los usuarios.'))
  }
  useEffect(load, [])

  function togglePerm(setFn, perms, k) {
    setFn(perms.includes(k) ? perms.filter((p) => p !== k) : [...perms, k])
  }

  async function create() {
    if (!form.name || !form.username || form.password.length < 6) {
      return setMsg({ ok: false, t: 'Nombre, usuario y contraseña (mín. 6) obligatorios.' })
    }
    setBusy(true); setMsg(null)
    try {
      await createAdmin({ name: form.name.trim(), username: form.username.trim(), password: form.password, permissions: form.perms, allowed_centers: form.centers })
      setMsg({ ok: true, t: `Usuario ${form.username} creado.` })
      setForm({ name: '', username: '', password: '', perms: ALL_KEYS, centers: null })
      load()
    } catch (e) {
      setMsg({ ok: false, t: e?.response?.data?.detail || 'No se pudo crear el usuario.' })
    } finally { setBusy(false) }
  }

  async function savePerms(id, perms, centers) {
    setBusy(true); setMsg(null)
    try { await updateAdmin(id, { permissions: perms, allowed_centers: centers }); setMsg({ ok: true, t: 'Permisos actualizados.' }); setEditing(null); load() }
    catch (e) { setMsg({ ok: false, t: e?.response?.data?.detail || 'No se pudo actualizar.' }) } finally { setBusy(false) }
  }

  async function remove(u) {
    if (!window.confirm(`¿Eliminar al usuario "${u.name || u.username}"?`)) return
    setBusy(true)
    try { await deleteAdmin(u.id); setMsg({ ok: true, t: 'Usuario eliminado.' }); load() }
    catch (e) { setMsg({ ok: false, t: e?.response?.data?.detail || 'No se pudo eliminar.' }) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold">Usuarios y permisos</h1>
      {err && <p className="text-red-400">{err}</p>}
      {msg && <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.t}</div>}

      {/* Crear usuario */}
      <div className="card mb-5 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-dark-200"><UserPlus size={16} /> Crear usuario</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">Nombre</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Usuario</label><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
          <div><label className="label">Contraseña</label><input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-dark-500">¿Qué puede ver? (Negocio y Usuarios quedan solo para ti)</div>
          {MODULES.map((g) => (
            <div key={g.g} className="mb-2">
              <div className="mb-1 text-[11px] text-dark-500">{g.g}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map(([k, lbl]) => (
                  <button key={k} type="button" onClick={() => togglePerm((p) => setForm({ ...form, perms: p }), form.perms, k)}
                    className={`rounded-full px-2.5 py-1 text-xs ${form.perms.includes(k) ? 'bg-brand-500/20 text-brand-300' : 'bg-dark-800 text-dark-400'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="mt-2 flex gap-2 text-xs">
            <button type="button" onClick={() => setForm({ ...form, perms: ALL_KEYS })} className="text-dark-400 hover:text-dark-200">Todos</button>
            <button type="button" onClick={() => setForm({ ...form, perms: [] })} className="text-dark-400 hover:text-dark-200">Ninguno</button>
          </div>
        </div>

        {/* Centros visibles */}
        {allOrgCenters.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-dark-500">¿Qué centros puede ver?</div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setForm({ ...form, centers: null })}
                className={`rounded-full px-2.5 py-1 text-xs ${form.centers === null ? 'bg-emerald-500/20 text-emerald-300' : 'bg-dark-800 text-dark-400'}`}>
                Todos los centros
              </button>
              {allOrgCenters.map((c) => {
                const active = Array.isArray(form.centers) && form.centers.includes(c)
                return (
                  <button key={c} type="button"
                    onClick={() => {
                      const curr = Array.isArray(form.centers) ? form.centers : []
                      const next = active ? curr.filter((x) => x !== c) : [...curr, c]
                      setForm({ ...form, centers: next })
                    }}
                    className={`rounded-full px-2.5 py-1 text-xs ${active ? 'bg-brand-500/20 text-brand-300' : 'bg-dark-800 text-dark-400'}`}>
                    {c}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <button onClick={create} disabled={busy} className="btn-primary mt-4 flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Crear usuario
        </button>
      </div>

      {/* Lista de usuarios */}
      {!users ? <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> Cargando…</div> : (
        <div className="space-y-2">
          {users.map((u) => {
            const isSuper = u.super_admin || u.account_type === 'owner'
            const perms = Array.isArray(u.permissions) ? u.permissions : null
            const isEd = editing?.id === u.id
            return (
              <div key={u.id} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 font-semibold">{u.name || u.username}
                      {isSuper && <span className="flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] text-brand-300"><ShieldCheck size={10} /> super-admin</span>}
                      {u.id === me?.id && <span className="rounded-full bg-dark-700 px-2 py-0.5 text-[10px] text-dark-400">tú</span>}
                    </div>
                    <div className="text-xs text-dark-500">/{u.username}</div>
                  </div>
                  {!isSuper && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(isEd ? null : { id: u.id, perms: perms || ALL_KEYS, centers: Array.isArray(u.allowed_centers) ? u.allowed_centers : null })} className="btn-ghost px-2 py-1 text-xs">{isEd ? 'Cerrar' : 'Permisos'}</button>
                      <button onClick={() => remove(u)} className="btn-ghost px-2 py-1 text-xs text-red-400"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>

                {!isSuper && !isEd && (
                  <div className="mt-2 text-xs text-dark-400">
                    {perms === null ? 'Acceso a todo (menos Negocio/Usuarios)' : perms.length === 0 ? 'Sin acceso a módulos' : `Ve: ${perms.map(labelOf).join(', ')}`}
                  </div>
                )}

                {isEd && (
                  <div className="mt-3 border-t border-dark-800 pt-3">
                    {MODULES.map((g) => (
                      <div key={g.g} className="mb-2">
                        <div className="mb-1 text-[11px] text-dark-500">{g.g}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {g.items.map(([k, lbl]) => (
                            <button key={k} type="button" onClick={() => setEditing((s) => ({ ...s, perms: s.perms.includes(k) ? s.perms.filter((p) => p !== k) : [...s.perms, k] }))}
                              className={`rounded-full px-2.5 py-1 text-xs ${editing.perms.includes(k) ? 'bg-brand-500/20 text-brand-300' : 'bg-dark-800 text-dark-400'}`}>{lbl}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {allOrgCenters.length > 0 && (
                      <div className="mb-3">
                        <div className="mb-1 text-[11px] text-dark-500">Centros visibles</div>
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" onClick={() => setEditing((s) => ({ ...s, centers: null }))}
                            className={`rounded-full px-2.5 py-1 text-xs ${editing.centers === null ? 'bg-emerald-500/20 text-emerald-300' : 'bg-dark-800 text-dark-400'}`}>Todos</button>
                          {allOrgCenters.map((c) => {
                            const active = Array.isArray(editing.centers) && editing.centers.includes(c)
                            return (
                              <button key={c} type="button"
                                onClick={() => setEditing((s) => {
                                  const curr = Array.isArray(s.centers) ? s.centers : []
                                  return { ...s, centers: active ? curr.filter((x) => x !== c) : [...curr, c] }
                                })}
                                className={`rounded-full px-2.5 py-1 text-xs ${active ? 'bg-brand-500/20 text-brand-300' : 'bg-dark-800 text-dark-400'}`}>
                                {c}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    <button onClick={() => savePerms(u.id, editing.perms, editing.centers)} disabled={busy} className="btn-primary mt-2 flex items-center gap-2 text-sm disabled:opacity-50">
                      <Save size={14} /> Guardar permisos
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
