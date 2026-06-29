import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { Loader2, Plus, Building, Send, CreditCard, Check, Copy, ExternalLink } from 'lucide-react'
import { getOrgCenters, addOrgCenter, getTelegramConfig, getOrgBilling } from '../api'
import { getAdmin } from '../auth'

const PORTAL_BASE = 'https://flotadsp.com'

function CopyRow({ label, url }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  return (
    <div>
      {label && <div className="mb-1 text-xs font-medium text-dark-400">{label}</div>}
      <div className="flex gap-2">
        <input readOnly value={url} className="input flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
          className="btn-secondary flex items-center gap-1.5 whitespace-nowrap text-sm">
          {copied ? <><Check size={14} /> {t('portal.copied')}</> : <><Copy size={14} /> {t('portal.copy')}</>}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="btn-ghost px-2" title="Abrir"><ExternalLink size={15} /></a>
      </div>
    </div>
  )
}

export default function Configuracion() {
  const { t } = useT()
  const [centers, setCenters] = useState(null)
  const [tg, setTg] = useState(null)
  const [billing, setBilling] = useState(null)
  const [nuevo, setNuevo] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  function load() {
    getOrgCenters().then((r) => setCenters(r.data?.centers || [])).catch(() => setCenters([]))
    getTelegramConfig().then((r) => setTg(r.data)).catch(() => setTg({}))
    getOrgBilling().then((r) => setBilling(r.data)).catch(() => setBilling(null))
  }
  useEffect(load, [])

  async function add() {
    const name = nuevo.trim().toUpperCase()
    if (!name) return
    setBusy(true); setMsg(null)
    try {
      const r = await addOrgCenter(name)
      setCenters(r.data?.centers || [])
      const a = getAdmin(); if (a) { a.centers = r.data?.centers || []; localStorage.setItem('flotadsp_admin', JSON.stringify(a)) }
      setNuevo(''); setMsg({ ok: true, t: `Centro ${name} añadido.` })
    } catch (e) {
      setMsg({ ok: false, t: e?.response?.data?.detail || 'No se pudo añadir el centro.' })
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-xl font-bold">{t('cfg.title')}</h1>
      {msg && <div className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.t}</div>}

      <p className="text-sm text-dark-400">Los enlaces para conductores están en la página <b>Portal Conductor</b> del menú lateral.</p>

      {/* Centros */}
      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-dark-200"><Building size={16} /> {t('cfg.centers')}</div>
        {!centers ? <Loader2 className="animate-spin text-dark-400" size={16} /> : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {centers.length === 0 ? <span className="text-sm text-dark-500">{t('cfg.no.centers')}</span> :
                centers.map((c) => <span key={c} className="rounded-lg bg-dark-800 px-3 py-1.5 text-sm font-medium">{c}</span>)}
            </div>
            <div className="flex gap-2">
              <input className="input flex-1" placeholder={t('cfg.new.center')} value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
              <button onClick={add} disabled={busy || !nuevo.trim()} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} {t('cfg.add')}
              </button>
            </div>
            <p className="mt-2 text-xs text-dark-500">Cada centro tiene sus conductores, vehículos y baremos de scorecard propios.</p>
          </>
        )}
      </div>

      {/* Telegram */}
      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-dark-200"><Send size={16} /> {t('cfg.telegram')}</div>
        {!tg ? <Loader2 className="animate-spin text-dark-400" size={16} /> : (
          <div className="flex items-center gap-3 text-sm">
            <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tg.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-dark-700 text-dark-400'}`}>
              {tg.enabled ? <><Check size={12} /> {t('cfg.tg.enabled')}</> : t('cfg.tg.disabled')}
            </span>
            <span className="text-dark-400">{(tg.chat_ids || []).filter(Boolean).length} {t('cfg.tg.chats')}</span>
          </div>
        )}
        <p className="mt-2 text-xs text-dark-500">Recibe alertas de daños graves, ITV y coberturas directamente en Telegram.</p>
      </div>

      {/* Plan */}
      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-dark-200"><CreditCard size={16} /> {t('cfg.plan')}</div>
        {billing ? (
          <div className="text-sm text-dark-300">
            Estado: <b>{billing.status || billing.estado || '—'}</b>{billing.plan ? ` · Plan ${billing.plan}` : ''}
          </div>
        ) : <span className="text-sm text-dark-500">Información de plan no disponible.</span>}
        <a href="/planes" className="btn-secondary mt-3 inline-flex text-sm">{t('cfg.see.plans')}</a>
      </div>
    </div>
  )
}
