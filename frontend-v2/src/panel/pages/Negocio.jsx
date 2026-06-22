import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, Building2, CheckCircle2, Clock, Euro, Sparkles, Gift, PauseCircle,
  LogIn, Trash2, Database, BrainCircuit, ExternalLink, RefreshCw,
} from 'lucide-react'
import {
  getAdminOverview, getAdminOrgs, getLeads, updateOrg, impersonateOrg, deleteOrg,
  backupNow,
} from '../api'
import { API_BASE } from '../../services/api'

const ST = {
  active: { label: 'Activo', cls: 'bg-emerald-500/15 text-emerald-400' },
  trial: { label: 'Prueba', cls: 'bg-sky-500/15 text-sky-400' },
  suspended: { label: 'Suspendido', cls: 'bg-red-500/15 text-red-400' },
  canceled: { label: 'Cancelado', cls: 'bg-dark-700 text-dark-300' },
}

function Kpi({ icon: Icon, label, value, accent }) {
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center gap-2"><Icon size={17} style={{ color: accent }} /><span className="text-2xl font-extrabold">{value}</span></div>
      <div className="text-sm text-dark-400">{label}</div>
    </div>
  )
}

export default function Negocio() {
  const nav = useNavigate()
  const [ov, setOv] = useState(null)
  const [orgs, setOrgs] = useState(null)
  const [leads, setLeads] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  function load() {
    getAdminOverview().then((r) => setOv(r.data)).catch(() => {})
    getAdminOrgs().then((r) => setOrgs(r.data?.orgs || [])).catch(() => setOrgs([]))
    getLeads().then((r) => setLeads(r.data?.leads || [])).catch(() => setLeads([]))
  }
  useEffect(load, [])

  async function act(id, body, label) {
    setBusy(id); setMsg('')
    try { await updateOrg({ id, ...body }); setMsg(`${label} ✓`); load() }
    catch (e) { setMsg(e?.response?.data?.detail || 'Error') }
    finally { setBusy('') }
  }

  async function impersonate(o) {
    setBusy(o.id)
    try {
      const r = await impersonateOrg(o.id)
      if (r.data?.token) {
        localStorage.setItem('flotadsp_token_super', localStorage.getItem('flotadsp_token'))
        localStorage.setItem('flotadsp_token', r.data.token)
        localStorage.setItem('flotadsp_admin', JSON.stringify({ name: o.name, role: 'admin', account_type: 'dsp', slug: r.data.slug, centers: o.centers || [], impersonating: true }))
        nav('/panel'); window.location.reload()
      }
    } catch { setMsg('No se pudo entrar como el cliente') } finally { setBusy('') }
  }

  async function removeOrg(o) {
    if (!window.confirm(`¿Eliminar definitivamente el DSP "${o.name}" y todos sus datos? Esto NO se puede deshacer.`)) return
    setBusy(o.id)
    try { await deleteOrg(o.id); setMsg('DSP eliminado'); load() }
    catch { setMsg('No se pudo eliminar') } finally { setBusy('') }
  }

  async function doBackup() {
    setBusy('backup'); setMsg('')
    try { const r = await backupNow(); setMsg(`Backup hecho: ${r.data?.documents} docs, ${r.data?.size_mb}MB`) }
    catch { setMsg('Backup falló') } finally { setBusy('') }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Negocio</h1>
        <button onClick={load} className="btn-secondary flex items-center gap-1.5 text-sm"><RefreshCw size={14} /> Actualizar</button>
      </div>

      {msg && <div className="mb-3 rounded-lg bg-brand-500/10 px-3 py-2 text-sm text-brand-300">{msg}</div>}

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi icon={Building2} label="Clientes (DSP)" value={ov?.dsps_total ?? '—'} accent="#0ea5e9" />
        <Kpi icon={CheckCircle2} label="Activos" value={ov?.activos ?? '—'} accent="#34d399" />
        <Kpi icon={Clock} label="En prueba" value={ov?.en_prueba ?? '—'} accent="#fbbf24" />
        <Kpi icon={Euro} label="MRR estimado" value={ov ? `${ov.mrr_estimado} €` : '—'} accent="#a78bfa" />
        <Kpi icon={Sparkles} label="Interesados" value={ov?.interesados ?? '—'} accent="#fb923c" />
      </div>

      {/* Facturación (honesto: facturas reales en Lemon Squeezy) */}
      <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-sm font-semibold">Facturación</h2>
          <p className="text-sm text-dark-400">Ingresos recurrentes estimados: <b className="text-dark-100">{ov?.mrr_estimado ?? '—'} €/mes</b>. Las facturas oficiales (IVA, recibos) las emite Lemon Squeezy como Merchant of Record.</p>
        </div>
        <a href="https://app.lemonsqueezy.com" target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-1.5 text-sm">Panel de facturas <ExternalLink size={14} /></a>
      </div>

      {/* Clientes / DSPs */}
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-dark-500">Clientes</h2>
      {!orgs ? (
        <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> Cargando…</div>
      ) : orgs.length === 0 ? (
        <div className="card p-8 text-center text-dark-400">Aún no hay clientes DSP registrados.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-dark-800 text-left text-xs uppercase tracking-wide text-dark-500">
              <th className="px-3 py-2.5">Empresa</th><th className="px-3 py-2.5">Estado</th><th className="px-3 py-2.5">Plan</th>
              <th className="px-3 py-2.5">Centros</th><th className="px-3 py-2.5">Prueba</th><th className="px-3 py-2.5 text-right">Acciones</th>
            </tr></thead>
            <tbody>
              {orgs.map((o) => {
                const st = ST[o.status] || ST.canceled
                const isBusy = busy === o.id
                return (
                  <tr key={o.id} className="border-b border-dark-800/60 align-middle hover:bg-dark-800/30">
                    <td className="px-3 py-2.5"><div className="font-semibold">{o.name}</div><div className="text-[11px] text-dark-500">/{o.slug}</div></td>
                    <td className="px-3 py-2.5"><span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span></td>
                    <td className="px-3 py-2.5 text-dark-300">{o.plan || '—'}</td>
                    <td className="px-3 py-2.5 text-dark-400">{(o.centers || []).join(', ') || '—'}</td>
                    <td className="px-3 py-2.5 text-dark-400">{o.dias_prueba != null ? `${o.dias_prueba}d` : '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {o.status !== 'active' && (
                          <button disabled={isBusy} onClick={() => act(o.id, { status: 'active' }, 'Regalado/activado')} className="btn-ghost flex items-center gap-1 px-2 py-1 text-xs text-emerald-400" title="Regalar / activar suscripción"><Gift size={14} /> Activar</button>
                        )}
                        <button disabled={isBusy} onClick={() => act(o.id, { extend_trial_days: 14 }, 'Prueba +14d')} className="btn-ghost px-2 py-1 text-xs" title="Ampliar prueba 14 días"><Clock size={14} /></button>
                        {o.status !== 'suspended' && (
                          <button disabled={isBusy} onClick={() => act(o.id, { status: 'suspended' }, 'Suspendido')} className="btn-ghost px-2 py-1 text-xs text-amber-400" title="Suspender"><PauseCircle size={14} /></button>
                        )}
                        <button disabled={isBusy} onClick={() => impersonate(o)} className="btn-ghost px-2 py-1 text-xs text-sky-400" title="Entrar como este cliente"><LogIn size={14} /></button>
                        <button disabled={isBusy} onClick={() => removeOrg(o)} className="btn-ghost px-2 py-1 text-xs text-red-400" title="Eliminar"><Trash2 size={14} /></button>
                        {isBusy && <Loader2 size={14} className="animate-spin text-dark-400" />}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Leads */}
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-dark-500">Interesados (leads)</h2>
      {!leads ? null : leads.length === 0 ? (
        <div className="card p-6 text-center text-dark-400">Sin interesados todavía.</div>
      ) : (
        <div className="card divide-y divide-dark-800">
          {leads.slice(0, 30).map((l, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="font-medium">{l.name || l.email || '—'}</span>
              <span className="text-dark-400">{l.email}</span>
              <span className="text-dark-400">{l.phone || ''}</span>
              <span className="text-xs text-dark-500">{(l.created_at || '').slice(0, 10)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Herramientas */}
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-dark-500">Herramientas</h2>
      <div className="flex flex-wrap gap-3">
        <button onClick={doBackup} disabled={busy === 'backup'} className="btn-secondary flex items-center gap-2 text-sm">
          {busy === 'backup' ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />} Backup de la BD ahora
        </button>
        <a href={`${API_BASE}/ai/export-dataset`} target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-2 text-sm">
          <BrainCircuit size={15} /> Exportar dataset IA
        </a>
      </div>
    </div>
  )
}
