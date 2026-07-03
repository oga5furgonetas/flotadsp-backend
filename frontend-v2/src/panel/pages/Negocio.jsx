import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../i18n'
import {
  Loader2, Building2, CheckCircle2, Clock, Euro, Sparkles, Gift, PauseCircle,
  LogIn, Trash2, Database, BrainCircuit, ExternalLink, RefreshCw, Megaphone,
  Play, Pause, Plus, Star, Eye, MousePointerClick,
} from 'lucide-react'
import {
  getAdminOverview, getAdminOrgs, getLeads, updateOrg, impersonateOrg, deleteOrg,
  backupNow, adminGetDriverOffers, adminCreateDriverOffer, adminToggleDriverOffer,
  adminDeleteDriverOffer, adminGetFounderReservations,
} from '../api'
import { API_BASE } from '../../services/api'

// ST labels are now translated inside the component via t()

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
  const { t } = useT()
  const ST = {
    active:    { label: t('neg.status.active'),    cls: 'bg-emerald-500/15 text-emerald-400' },
    trial:     { label: t('neg.status.trial'),     cls: 'bg-sky-500/15 text-sky-400' },
    suspended: { label: t('neg.status.suspended'), cls: 'bg-red-500/15 text-red-400' },
    canceled:  { label: t('neg.status.canceled'),  cls: 'bg-dark-700 text-dark-300' },
  }
  const [ov, setOv] = useState(null)
  const [orgs, setOrgs] = useState(null)
  const [leads, setLeads] = useState(null)
  const [offers, setOffers] = useState(null)
  const [founders, setFounders] = useState(null)
  const [offerForm, setOfferForm] = useState(null)   // null = cerrado
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  function load() {
    getAdminOverview().then((r) => setOv(r.data)).catch(() => {})
    getAdminOrgs().then((r) => setOrgs(r.data?.orgs || [])).catch(() => setOrgs([]))
    getLeads().then((r) => setLeads(r.data?.leads || [])).catch(() => setLeads([]))
    adminGetDriverOffers().then((r) => setOffers(r.data?.offers || [])).catch(() => setOffers([]))
    adminGetFounderReservations().then((r) => setFounders(r.data?.reservations || [])).catch(() => setFounders([]))
  }
  useEffect(load, [])

  async function saveOffer(e) {
    e.preventDefault()
    setBusy('offer'); setMsg('')
    try {
      await adminCreateDriverOffer(offerForm)
      setOfferForm(null); setMsg('Oferta creada ✓'); load()
    } catch (e2) { setMsg(e2?.response?.data?.detail || 'No se pudo crear la oferta') }
    finally { setBusy('') }
  }

  async function toggleOffer(o) {
    setBusy(o.id)
    try { await adminToggleDriverOffer(o.id, !o.active); load() }
    catch { setMsg('No se pudo cambiar el estado') } finally { setBusy('') }
  }

  async function removeOffer(o) {
    if (!window.confirm(`¿Eliminar la oferta «${o.title}»? Se perderán sus métricas.`)) return
    setBusy(o.id)
    try { await adminDeleteDriverOffer(o.id); load() }
    catch { setMsg('No se pudo eliminar') } finally { setBusy('') }
  }

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
    } catch { setMsg(t('neg.impersonate.err')) } finally { setBusy('') }
  }

  async function removeOrg(o) {
    if (!window.confirm(t('neg.delete.confirm').replace('{n}', o.name))) return
    setBusy(o.id)
    try { await deleteOrg(o.id); setMsg(t('neg.deleted')); load() }
    catch { setMsg(t('neg.delete.err')) } finally { setBusy('') }
  }

  async function doBackup() {
    setBusy('backup'); setMsg('')
    try { const r = await backupNow(); setMsg(`Backup hecho: ${r.data?.documents} docs, ${r.data?.size_mb}MB`) }
    catch { setMsg('Backup falló') } finally { setBusy('') }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('neg.title')}</h1>
        <button onClick={load} className="btn-secondary flex items-center gap-1.5 text-sm"><RefreshCw size={14} /> {t('neg.refresh')}</button>
      </div>

      {msg && <div className="mb-3 rounded-lg bg-brand-500/10 px-3 py-2 text-sm text-brand-300">{msg}</div>}

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi icon={Building2} label={t('neg.kpi.clients')} value={ov?.dsps_total ?? '—'} accent="#0ea5e9" />
        <Kpi icon={CheckCircle2} label={t('neg.kpi.active')} value={ov?.activos ?? '—'} accent="#34d399" />
        <Kpi icon={Clock} label={t('neg.kpi.trial')} value={ov?.en_prueba ?? '—'} accent="#fbbf24" />
        <Kpi icon={Euro} label={t('neg.kpi.mrr')} value={ov ? `${ov.mrr_estimado} €` : '—'} accent="#a78bfa" />
        <Kpi icon={Sparkles} label={t('neg.kpi.leads')} value={ov?.interesados ?? '—'} accent="#fb923c" />
      </div>

      {/* Facturación (honesto: facturas reales en Lemon Squeezy) */}
      <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-sm font-semibold">{t('neg.billing')}</h2>
          <p className="text-sm text-dark-400">{t('neg.billing.desc')} <b className="text-dark-100">{ov?.mrr_estimado ?? '—'} €/mes</b>. {t('neg.billing.lemon')}</p>
        </div>
        <a href="https://app.lemonsqueezy.com" target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-1.5 text-sm">{t('neg.billing.panel')} <ExternalLink size={14} /></a>
      </div>

      {/* Clientes / DSPs */}
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-dark-500">{t('neg.clients')}</h2>
      {!orgs ? (
        <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> {t('neg.loading')}</div>
      ) : orgs.length === 0 ? (
        <div className="card p-8 text-center text-dark-400">{t('neg.no.clients')}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-dark-800 text-left text-xs uppercase tracking-wide text-dark-500">
              <th className="px-3 py-2.5">{t('neg.col.company')}</th><th className="px-3 py-2.5">{t('neg.col.status')}</th><th className="px-3 py-2.5">{t('neg.col.plan')}</th>
              <th className="px-3 py-2.5">{t('neg.col.centers')}</th><th className="px-3 py-2.5">{t('neg.col.trial')}</th><th className="px-3 py-2.5 text-right">{t('neg.col.actions')}</th>
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
                          <button disabled={isBusy} onClick={() => act(o.id, { status: 'active' }, t('neg.activate'))} className="btn-ghost flex items-center gap-1 px-2 py-1 text-xs text-emerald-400" title={t('neg.activate')}><Gift size={14} /> {t('neg.activate')}</button>
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
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-dark-500">{t('neg.leads')}</h2>
      {!leads ? null : leads.length === 0 ? (
        <div className="card p-6 text-center text-dark-400">{t('neg.no.leads')}</div>
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

      {/* Reservas fundador — llamar y cerrar la venta */}
      <h2 className="mb-2 mt-6 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-dark-500">
        <Star size={13} className="text-amber-400" /> Reservas fundador
      </h2>
      {!founders ? null : founders.length === 0 ? (
        <div className="card p-6 text-center text-sm text-dark-400">
          Aún no hay reservas. La oferta está viva en <a href="https://flotadsp.com/planes" target="_blank" rel="noreferrer" className="text-brand-400 hover:underline">flotadsp.com/planes</a> — compártela con DSPs que conozcas.
        </div>
      ) : (
        <div className="card divide-y divide-dark-800">
          {founders.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="font-semibold">{f.name}</span>
              <a href={`mailto:${f.email}`} className="text-sky-400 hover:underline">{f.email}</a>
              {f.phone ? <a href={`tel:${f.phone}`} className="font-semibold text-emerald-400 hover:underline">{f.phone}</a> : <span className="text-dark-600">sin teléfono</span>}
              <span className="text-dark-400">{f.fleet_size ? `${f.fleet_size} furgos` : '—'}</span>
              <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${f.status === 'pending' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                {f.status === 'pending' ? 'Por llamar' : f.status}
              </span>
              <span className="text-xs text-dark-500">{(f.created_at || '').slice(0, 10)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Ofertas del portal conductor — el espacio patrocinado */}
      <div className="mb-2 mt-6 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-dark-500">
          <Megaphone size={13} className="text-brand-400" /> Ofertas del portal conductor
        </h2>
        {!offerForm && (
          <button
            onClick={() => setOfferForm({ emoji: '🎁', title: '', description: '', cta: '', url: 'https://', active: true })}
            className="btn-secondary flex items-center gap-1.5 py-1.5 text-xs"
          >
            <Plus size={13} /> Nueva oferta
          </button>
        )}
      </div>

      {offerForm && (
        <form onSubmit={saveOffer} className="card mb-3 grid gap-2.5 p-4 sm:grid-cols-2">
          <div className="flex gap-2">
            <div className="w-16">
              <label className="label">Emoji</label>
              <input className="input text-center text-lg" value={offerForm.emoji} onChange={e => setOfferForm(f => ({ ...f, emoji: e.target.value }))} />
            </div>
            <div className="flex-1">
              <label className="label">Título *</label>
              <input className="input" required maxLength={120} placeholder="Neumáticos -20% para conductores DSP" value={offerForm.title} onChange={e => setOfferForm(f => ({ ...f, title: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Texto del botón</label>
            <input className="input" maxLength={60} placeholder="Reservar cita" value={offerForm.cta} onChange={e => setOfferForm(f => ({ ...f, cta: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Descripción</label>
            <input className="input" maxLength={240} placeholder="Descuento exclusivo presentando el código FLOTA en cualquier taller de la cadena." value={offerForm.description} onChange={e => setOfferForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">URL de destino * (https://)</label>
            <input className="input" required type="url" pattern="https://.*" value={offerForm.url} onChange={e => setOfferForm(f => ({ ...f, url: e.target.value }))} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={busy === 'offer'} className="btn-primary flex items-center gap-1.5 text-sm">
              {busy === 'offer' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Publicar oferta
            </button>
            <button type="button" onClick={() => setOfferForm(null)} className="btn-secondary text-sm">Cancelar</button>
          </div>
        </form>
      )}

      {!offers ? null : offers.length === 0 ? (
        <div className="card p-6 text-center text-sm text-dark-400">
          Sin ofertas propias: el portal muestra la auto-promo de referidos. Crea la primera cuando cierres un patrocinador.
        </div>
      ) : (
        <div className="card divide-y divide-dark-800">
          {offers.map((o) => {
            const ctr = o.views ? Math.round(((o.clicks || 0) / o.views) * 100) : 0
            const isBusy = busy === o.id
            return (
              <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="text-xl">{o.emoji || '🎁'}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{o.title}</div>
                  <div className="truncate text-xs text-dark-500">{o.url}</div>
                </div>
                <span className="flex items-center gap-1 text-xs text-dark-300" title="Veces mostrada">
                  <Eye size={13} className="text-dark-500" /> {o.views ?? 0}
                </span>
                <span className="flex items-center gap-1 text-xs text-dark-300" title="Clics">
                  <MousePointerClick size={13} className="text-dark-500" /> {o.clicks ?? 0}
                </span>
                <span className="text-xs text-dark-500" title="Ratio de clics">{ctr}% CTR</span>
                <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${o.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-dark-700 text-dark-400'}`}>
                  {o.active ? 'Activa' : 'Pausada'}
                </span>
                <button disabled={isBusy} onClick={() => toggleOffer(o)} className="btn-ghost p-1.5" title={o.active ? 'Pausar' : 'Activar'}>
                  {o.active ? <Pause size={14} className="text-amber-400" /> : <Play size={14} className="text-emerald-400" />}
                </button>
                <button disabled={isBusy} onClick={() => removeOffer(o)} className="btn-ghost p-1.5 text-red-400" title="Eliminar">
                  <Trash2 size={14} />
                </button>
                {isBusy && <Loader2 size={13} className="animate-spin text-dark-400" />}
              </div>
            )
          })}
        </div>
      )}

      {/* Herramientas */}
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-dark-500">{t('neg.tools')}</h2>
      <div className="flex flex-wrap gap-3">
        <button onClick={doBackup} disabled={busy === 'backup'} className="btn-secondary flex items-center gap-2 text-sm">
          {busy === 'backup' ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />} {t('neg.backup')}
        </button>
        <a href={`${API_BASE}/ai/export-dataset`} target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-2 text-sm">
          <BrainCircuit size={15} /> {t('neg.export.ai')}
        </a>
      </div>
    </div>
  )
}
