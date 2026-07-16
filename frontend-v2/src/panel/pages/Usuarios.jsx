import { useEffect, useState } from 'react'
import { Loader2, UserPlus, Trash2, Save, ShieldCheck, Mail, KeyRound, ChevronDown, Users as UsersIcon, X, Check } from 'lucide-react'
import { getAdmins, createAdmin, updateAdmin, deleteAdmin } from '../api'
import { getAdmin, isSuperAdmin } from '../auth'
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

/* ── Piezas de UI ── */

function Avatar({ name }) {
  const initials = (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/30 to-brand-600/10 font-bold text-[13px] text-brand-200 ring-1 ring-brand-500/30">
      {initials}
    </div>
  )
}

function RoleBadge({ u, t }) {
  if (u.super_admin || u.account_type === 'owner')
    return <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-300"><ShieldCheck size={10} /> Super-admin</span>
  if (u.admin_role === 'center_manager')
    return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">{t('usr.role.center')}</span>
  if (u.admin_role === 'dispatcher')
    return <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300">Dispatcher</span>
  return <span className="rounded-full bg-dark-700 px-2 py-0.5 text-[10px] font-semibold text-dark-300">Admin</span>
}

/* Selector de módulos: por grupos, con "todos" por grupo. */
function ModulePicker({ perms, onChange }) {
  const set = new Set(perms)
  const toggle = (k) => onChange(set.has(k) ? perms.filter(p => p !== k) : [...perms, k])
  const toggleGroup = (g) => {
    const keys = g.items.map(([k]) => k)
    const allOn = keys.every(k => set.has(k))
    onChange(allOn ? perms.filter(p => !keys.includes(p)) : [...new Set([...perms, ...keys])])
  }
  return (
    <div className="space-y-2.5">
      {MODULES.map((g) => {
        const keys = g.items.map(([k]) => k)
        const onCount = keys.filter(k => set.has(k)).length
        return (
          <div key={g.g}>
            <button type="button" onClick={() => toggleGroup(g)}
              className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-dark-400 hover:text-dark-200">
              <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${onCount === keys.length ? 'border-brand-500 bg-brand-500 text-white' : 'border-dark-600'}`}>
                {onCount === keys.length && <Check size={10} />}
              </span>
              {g.g} <span className="font-normal text-dark-600">{onCount}/{keys.length}</span>
            </button>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map(([k, lbl]) => (
                <button key={k} type="button" onClick={() => toggle(k)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${set.has(k) ? 'bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40' : 'bg-dark-800 text-dark-500 hover:text-dark-300'}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        )
      })}
      <div className="flex gap-3 pt-0.5 text-[11px]">
        <button type="button" onClick={() => onChange(ALL_KEYS)} className="font-semibold text-dark-400 hover:text-dark-200">Marcar todo</button>
        <button type="button" onClick={() => onChange([])} className="font-semibold text-dark-400 hover:text-dark-200">Quitar todo</button>
      </div>
    </div>
  )
}

/* Selector de centros. null = todos. */
function CenterPicker({ centers, value, onChange, t }) {
  if (!centers.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" onClick={() => onChange(null)}
        className={`rounded-lg px-2.5 py-1 text-xs font-medium ${value === null ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40' : 'bg-dark-800 text-dark-500 hover:text-dark-300'}`}>
        {t('usr.all.centers')}
      </button>
      {centers.map((c) => {
        const active = Array.isArray(value) && value.includes(c)
        return (
          <button key={c} type="button"
            onClick={() => {
              const curr = Array.isArray(value) ? value : []
              onChange(active ? curr.filter((x) => x !== c) : [...curr, c])
            }}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium ${active ? 'bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40' : 'bg-dark-800 text-dark-500 hover:text-dark-300'}`}>
            {c}
          </button>
        )
      })}
    </div>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-dark-500">
        {Icon && <Icon size={12} />} {title}
      </div>
      {children}
    </div>
  )
}

/* ── Página ── */

export default function Usuarios() {
  const { t } = useT()
  const me = getAdmin()
  const sa = isSuperAdmin()
  const ROLE_LABELS = { center_manager: t('usr.role.center'), dispatcher: 'Dispatcher', null: 'Admin completo' }
  const ROLE_DESCS = {
    center_manager: t('usr.role.center.desc'),
    dispatcher: t('usr.role.dispatcher.desc'),
    null: t('usr.role.admin.desc'),
  }
  const [users, setUsers] = useState(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const allOrgCenters = sa ? (me?.centers || []) : (me?.allowed_centers || [])
  const emptyForm = { name: '', username: '', password: '', perms: ALL_KEYS, centers: null, admin_role: null }
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null) // {id, perms, centers, admin_role, email, newPassword}

  function load() {
    getAdmins().then((r) => setUsers(r.data || [])).catch(() => setErr(t('usr.load.error')))
  }
  useEffect(load, [])

  const roleOptions = sa ? [null, 'center_manager', 'dispatcher'] : ['dispatcher']

  async function create() {
    if (!form.name || !form.username || form.password.length < 6) {
      return setMsg({ ok: false, t: t('usr.form.req') })
    }
    setBusy(true); setMsg(null)
    try {
      await createAdmin({ name: form.name.trim(), username: form.username.trim(), password: form.password, permissions: form.perms, allowed_centers: form.centers, admin_role: form.admin_role })
      setMsg({ ok: true, t: t('usr.created.ok').replace('{u}', form.username) })
      setForm(emptyForm); setShowCreate(false)
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

  const permsSummary = (perms) => {
    if (perms === null) return t('usr.access.all')
    if (perms.length === 0) return t('usr.no.modules')
    if (perms.length === ALL_KEYS.length) return t('usr.access.all')
    return `${perms.length} módulos`
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Cabecera */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><UsersIcon size={20} className="text-brand-400" /> {t('usr.title')}</h1>
          <p className="mt-0.5 text-sm text-dark-400">Cada usuario ve solo los módulos y centros que le asignes.</p>
        </div>
        <button onClick={() => setShowCreate(s => !s)}
          className={showCreate ? 'btn-secondary flex items-center gap-2' : 'btn-primary flex items-center gap-2'}>
          {showCreate ? <X size={15} /> : <UserPlus size={15} />} {showCreate ? t('ui.close') : t('usr.create')}
        </button>
      </div>

      {err && <p className="mb-3 text-red-400">{err}</p>}
      {msg && <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.t}</div>}

      {/* Crear usuario (plegado por defecto) */}
      {showCreate && (
        <div className="card mb-6 space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label">{t('usr.name')}</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">{t('usr.username')}</label><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
            <div><label className="label">{t('usr.password')}</label><input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          </div>

          <Section title={t('usr.role')}>
            <div className="flex flex-wrap gap-2">
              {roleOptions.map((r) => (
                <button key={String(r)} type="button" onClick={() => setForm({ ...form, admin_role: r })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${form.admin_role === r ? 'bg-brand-500/25 text-brand-200 ring-1 ring-brand-500/50' : 'bg-dark-800 text-dark-400 hover:text-dark-200'}`}>
                  {ROLE_LABELS[String(r)] ?? ROLE_LABELS[r] ?? 'Admin completo'}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-dark-500">{ROLE_DESCS[form.admin_role] ?? ROLE_DESCS[null]}</p>
          </Section>

          <Section title={t('usr.perms')}>
            <ModulePicker perms={form.perms} onChange={(perms) => setForm({ ...form, perms })} />
          </Section>

          {allOrgCenters.length > 0 && (
            <Section title={t('usr.centers')}>
              <CenterPicker centers={allOrgCenters} value={form.centers} onChange={(centers) => setForm({ ...form, centers })} t={t} />
            </Section>
          )}

          <button onClick={create} disabled={busy} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} {t('usr.create')}
          </button>
        </div>
      )}

      {/* Lista de usuarios */}
      {!users ? <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> {t('ui.loading')}</div> : (
        <div className="overflow-hidden rounded-2xl border border-dark-800">
          {users.map((u, i) => {
            const isSuper = u.super_admin || u.account_type === 'owner'
            const perms = Array.isArray(u.permissions) ? u.permissions : null
            const isEd = editing?.id === u.id
            return (
              <div key={u.id} className={`${i > 0 ? 'border-t border-dark-800' : ''} bg-dark-900/40`}>
                {/* Fila */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={u.name || u.username} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-dark-50">{u.name || u.username}</span>
                      <RoleBadge u={u} t={t} />
                      {u.id === me?.id && <span className="rounded-full bg-dark-700 px-2 py-0.5 text-[10px] text-dark-400">{t('usr.you')}</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-dark-500">
                      <span className="font-mono">/{u.username}</span>
                      {!isSuper && <span>{u.allowed_centers?.length ? u.allowed_centers.join(' · ') : t('usr.all.centers')}</span>}
                      {!isSuper && <span className="text-dark-400">{permsSummary(perms)}</span>}
                    </div>
                  </div>
                  {!isSuper && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setEditing(isEd ? null : { id: u.id, perms: perms || ALL_KEYS, centers: Array.isArray(u.allowed_centers) ? u.allowed_centers : null, admin_role: u.admin_role ?? null, email: u.email || '', newPassword: '' })}
                        className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${isEd ? 'border-brand-500/50 bg-brand-500/10 text-brand-300' : 'border-dark-700 text-dark-300 hover:border-dark-500'}`}>
                        {t('ui.edit')} <ChevronDown size={12} className={`transition-transform ${isEd ? 'rotate-180' : ''}`} />
                      </button>
                      <button onClick={() => remove(u)} title={t('ui.delete')}
                        className="rounded-lg border border-dark-700 p-1.5 text-dark-500 hover:border-red-500/40 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Panel de edición */}
                {isEd && (
                  <div className="space-y-5 border-t border-dark-800 bg-dark-950/40 px-4 py-4">
                    <Section title={t('usr.role')}>
                      <div className="flex flex-wrap gap-2">
                        {roleOptions.map((r) => (
                          <button key={String(r)} type="button" onClick={() => setEditing((s) => ({ ...s, admin_role: r }))}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${editing.admin_role === r ? 'bg-brand-500/25 text-brand-200 ring-1 ring-brand-500/50' : 'bg-dark-800 text-dark-400 hover:text-dark-200'}`}>
                            {ROLE_LABELS[String(r)] ?? 'Admin completo'}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[11px] text-dark-500">{ROLE_DESCS[editing.admin_role] ?? ROLE_DESCS[null]}</p>
                    </Section>

                    <Section title={t('usr.perms')}>
                      <ModulePicker perms={editing.perms} onChange={(perms) => setEditing((s) => ({ ...s, perms }))} />
                    </Section>

                    {allOrgCenters.length > 0 && (
                      <Section title={t('usr.centers.visible')}>
                        <CenterPicker centers={allOrgCenters} value={editing.centers} onChange={(centers) => setEditing((s) => ({ ...s, centers }))} t={t} />
                      </Section>
                    )}

                    <button onClick={() => savePerms(u.id, editing.perms, editing.centers, editing.admin_role)} disabled={busy}
                      className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
                      <Save size={14} /> {t('usr.save.perms')}
                    </button>

                    <div className="grid gap-4 border-t border-dark-800 pt-4 sm:grid-cols-2">
                      <Section title="Email de recuperación" icon={Mail}>
                        <div className="flex gap-2">
                          <input type="email" className="input flex-1" placeholder="correo@ejemplo.com"
                            value={editing.email}
                            onChange={(e) => setEditing((s) => ({ ...s, email: e.target.value }))} />
                          <button onClick={() => saveAccount(u.id, editing.email, '')} disabled={busy}
                            className="btn-secondary text-sm disabled:opacity-50">Guardar</button>
                        </div>
                      </Section>
                      <Section title="Restablecer contraseña" icon={KeyRound}>
                        <div className="flex gap-2">
                          <input type="text" className="input flex-1" placeholder="Nueva contraseña (mín. 6)"
                            value={editing.newPassword}
                            onChange={(e) => setEditing((s) => ({ ...s, newPassword: e.target.value }))} />
                          <button onClick={() => saveAccount(u.id, undefined, editing.newPassword)} disabled={busy || !editing.newPassword}
                            className="btn-secondary text-sm disabled:opacity-50">Cambiar</button>
                        </div>
                      </Section>
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
