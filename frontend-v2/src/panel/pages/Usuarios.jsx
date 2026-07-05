import { useEffect, useState } from 'react'
import { Loader2, UserPlus, Trash2, Save, ShieldCheck, Mail, KeyRound } from 'lucide-react'
import { getAdmins, createAdmin, updateAdmin, deleteAdmin } from '../api'
import { getAdmin, isSuperAdmin, isCenterManager } from '../auth'
import { useT } from '../../i18n'

// Catálogo de módulos asignables (la clave = último segmento de la ruta del panel)
const MODULES = [
  { g: 'Operacional', items: [
    ['dashboard', 'Dashboard'], ['scorecard', 'Scorecard'], ['conductores', 'Conductores'],
    ['turnos', 'Turnos'], ['metricas', 'Métricas'], ['actividad', 'Actividad'],
  ]},
  { g: 'Equipo', items: [
    ['asignacion', 'Asignación diaria'], ['checklist-operativo', 'Checklist turno'],
    ['chat', 'Chat interno'], ['plantilla', 'Plantilla turno'],
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

// ROLE_LABELS is now derived from t() inside the component

export default function Usuarios() {
  const { t } = useT()
  const me = getAdmin()
  const sa = isSuperAdmin()
  const cm = isCenterManager()
  const ROLE_LABELS = { center_manager: t('usr.role.center'), dispatcher: 'Dispatcher', null: t('usr.role.admin') }
  const [users, setUsers] = useState(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  // center_manager solo puede asignar sus propios centros
  const allOrgCenters = sa ? (me?.centers || []) : (me?.allowed_centers || [])
  const [form, setForm] = useState({ name: '', username: '', password: '', perms: ALL_KEYS, centers: null, admin_role: null })
  const [editing, setEditing] = useState(null) // {id, perms, centers, admin_role}

  function load() {
    getAdmins().then((r) => setUsers(r.data || [])).catch(() => setErr(t('usr.load.error')))
  }
  useEffect(load, [])

  function togglePerm(setFn, perms, k) {
    setFn(perms.includes(k) ? perms.filter((p) => p !== k) : [...perms, k])
  }

  async function create() {
    if (!form.name || !form.username || form.password.length < 6) {
      return setMsg({ ok: false, t: t('usr.form.req') })
    }
    setBusy(true); setMsg(null)
    try {
      await createAdmin({ name: form.name.trim(), username: form.username.trim(), password: form.password, permissions: form.perms, allowed_centers: form.centers, admin_role: form.admin_role })
      setMsg({ ok: true, t: t('usr.created.ok').replace('{u}', form.username) })
      setForm({ name: '', username: '', password: '', perms: ALL_KEYS, centers: null, admin_role: null })
      load()
    } catch (e) {
      setMsg({ ok: false, t: e?.response?.data?.detail || t('usr.create.err') })
    } finally { setBusy(false) }
  }

  async function savePerms(id, perms, centers, admin_role) {
    setBusy(true); setMsg(null)
    try {
      await updateAdmin(id, { permissions: perms, allowed_centers: centers, admin_role: admin_role ?? null })
      setMsg({ ok: true, t: t('usr.perms.ok') }); setEditing(null); load()
    }
    catch (e) { setMsg({ ok: false, t: e?.response?.data?.detail || t('usr.update.err') }) } finally { setBusy(false) }
  }

  // Email de recuperación + restablecer contraseña de un usuario (por si la olvida).
  async function saveAccount(id, email, newPassword) {
    const body = {}
    if (typeof email === 'string') body.email = email.trim()
    if (newPassword) {
      if (newPassword.length < 6) return setMsg({ ok: false, t: 'La contraseña debe tener al menos 6 caracteres' })
      body.new_password = newPassword
    }
    if (Object.keys(body).length === 0) return
    setBusy(true); setMsg(null)
    try {
      await updateAdmin(id, body)
      setMsg({ ok: true, t: newPassword ? 'Contraseña restablecida' : 'Email guardado' })
      setEditing((s) => s && s.id === id ? { ...s, newPassword: '' } : s)
      load()
    } catch (e) { setMsg({ ok: false, t: e?.response?.data?.detail || t('usr.update.err') }) }
    finally { setBusy(false) }
  }

  async function remove(u) {
    if (!window.confirm(t('usr.delete.confirm').replace('{u}', u.name || u.username))) return
    setBusy(true)
    try { await deleteAdmin(u.id); setMsg({ ok: true, t: t('usr.deleted.ok') }); load() }
    catch (e) { setMsg({ ok: false, t: e?.response?.data?.detail || t('usr.delete.err') }) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold">{t('usr.title')}</h1>
      {err && <p className="text-red-400">{err}</p>}
      {msg && <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.t}</div>}

      {/* Crear usuario */}
      <div className="card mb-5 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-dark-200"><UserPlus size={16} /> {t('usr.create')}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">{t('usr.name')}</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">{t('usr.username')}</label><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
          <div><label className="label">{t('usr.password')}</label><input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
        </div>
        {/* Rol */}
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-dark-500">{t('usr.role')}</div>
          <div className="flex flex-wrap gap-2">
            {(sa ? [null, 'center_manager', 'dispatcher'] : ['dispatcher']).map((r) => (
              <button key={String(r)} type="button"
                onClick={() => setForm({ ...form, admin_role: r })}
                className={`rounded-full px-3 py-1 text-xs font-medium ${form.admin_role === r ? 'bg-brand-500/25 text-brand-200 ring-1 ring-brand-500/50' : 'bg-dark-800 text-dark-400'}`}>
                {ROLE_LABELS[r] || 'Admin completo'}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-dark-500">
            {form.admin_role === 'center_manager' ? t('usr.role.center.desc') :
             form.admin_role === 'dispatcher' ? t('usr.role.dispatcher.desc') :
             t('usr.role.admin.desc')}
          </p>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-dark-500">{t('usr.perms')}</div>
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
            <button type="button" onClick={() => setForm({ ...form, perms: ALL_KEYS })} className="text-dark-400 hover:text-dark-200">{t('usr.select.all')}</button>
            <button type="button" onClick={() => setForm({ ...form, perms: [] })} className="text-dark-400 hover:text-dark-200">{t('usr.select.none')}</button>
          </div>
        </div>

        {/* Centros visibles */}
        {allOrgCenters.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-dark-500">{t('usr.centers')}</div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setForm({ ...form, centers: null })}
                className={`rounded-full px-2.5 py-1 text-xs ${form.centers === null ? 'bg-emerald-500/20 text-emerald-300' : 'bg-dark-800 text-dark-400'}`}>
                {t('usr.all.centers')}
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

        {msg && <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.t}</div>}
        <button onClick={create} disabled={busy} className="btn-primary mt-3 flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} {t('usr.create')}
        </button>
      </div>

      {/* Lista de usuarios */}
      {!users ? <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> {t('ui.loading')}</div> : (
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
                      {!isSuper && u.admin_role === 'center_manager' && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">{t('usr.role.center')}</span>}
                      {!isSuper && u.admin_role === 'dispatcher' && <span className="rounded-full bg-dark-700 px-2 py-0.5 text-[10px] text-dark-400">Dispatcher</span>}
                      {u.id === me?.id && <span className="rounded-full bg-dark-700 px-2 py-0.5 text-[10px] text-dark-400">{t('usr.you')}</span>}
                    </div>
                    <div className="text-xs text-dark-500">/{u.username} {u.allowed_centers ? `· ${u.allowed_centers.join(', ')}` : ''}</div>
                  </div>
                  {!isSuper && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(isEd ? null : { id: u.id, perms: perms || ALL_KEYS, centers: Array.isArray(u.allowed_centers) ? u.allowed_centers : null, admin_role: u.admin_role ?? null, email: u.email || '', newPassword: '' })} className="btn-ghost px-2 py-1 text-xs">{isEd ? t('ui.close') : t('ui.edit')}</button>
                      <button onClick={() => remove(u)} className="btn-ghost px-2 py-1 text-xs text-red-400"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>

                {!isSuper && !isEd && (
                  <div className="mt-2 text-xs text-dark-400">
                    {perms === null ? t('usr.access.all') : perms.length === 0 ? t('usr.no.modules') : `${t('usr.sees')} ${perms.map(labelOf).join(', ')}`}
                  </div>
                )}

                {isEd && (
                  <div className="mt-3 border-t border-dark-800 pt-3">
                    {/* Rol */}
                    <div className="mb-3">
                      <div className="mb-1 text-[11px] text-dark-500">{t('usr.role')}</div>
                      <div className="flex flex-wrap gap-2">
                        {(sa ? [null, 'center_manager', 'dispatcher'] : ['dispatcher']).map((r) => (
                          <button key={String(r)} type="button"
                            onClick={() => setEditing((s) => ({ ...s, admin_role: r }))}
                            className={`rounded-full px-3 py-1 text-xs font-medium ${editing.admin_role === r ? 'bg-brand-500/25 text-brand-200 ring-1 ring-brand-500/50' : 'bg-dark-800 text-dark-400'}`}>
                            {ROLE_LABELS[r] || 'Admin completo'}
                          </button>
                        ))}
                      </div>
                    </div>
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
                        <div className="mb-1 text-[11px] text-dark-500">{t('usr.centers.visible')}</div>
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" onClick={() => setEditing((s) => ({ ...s, centers: null }))}
                            className={`rounded-full px-2.5 py-1 text-xs ${editing.centers === null ? 'bg-emerald-500/20 text-emerald-300' : 'bg-dark-800 text-dark-400'}`}>{t('usr.select.all')}</button>
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
                    <button onClick={() => savePerms(u.id, editing.perms, editing.centers, editing.admin_role)} disabled={busy} className="btn-primary mt-2 flex items-center gap-2 text-sm disabled:opacity-50">
                      <Save size={14} /> {t('usr.save.perms')}
                    </button>

                    {/* Email de recuperación + restablecer contraseña */}
                    <div className="mt-4 border-t border-dark-800 pt-3">
                      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-dark-500">
                        <Mail size={12} /> Email de recuperación
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input type="email" className="input flex-1" placeholder="correo@ejemplo.com"
                          value={editing.email}
                          onChange={(e) => setEditing((s) => ({ ...s, email: e.target.value }))} />
                        <button onClick={() => saveAccount(u.id, editing.email, '')} disabled={busy}
                          className="btn-secondary text-sm disabled:opacity-50">Guardar email</button>
                      </div>

                      <div className="mb-2 mt-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-dark-500">
                        <KeyRound size={12} /> Restablecer contraseña
                      </div>
                      <p className="mb-2 text-[11px] text-dark-500">Escribe una nueva contraseña (mín. 6) para {u.name || u.username} — úsalo si la ha olvidado.</p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input type="text" className="input flex-1" placeholder="Nueva contraseña"
                          value={editing.newPassword}
                          onChange={(e) => setEditing((s) => ({ ...s, newPassword: e.target.value }))} />
                        <button onClick={() => saveAccount(u.id, undefined, editing.newPassword)} disabled={busy || !editing.newPassword}
                          className="btn-secondary text-sm disabled:opacity-50">Cambiar contraseña</button>
                      </div>
                    </div>
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
