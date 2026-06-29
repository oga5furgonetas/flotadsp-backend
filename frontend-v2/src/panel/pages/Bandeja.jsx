import { useEffect, useState } from 'react'
import { Loader2, Mail, Inbox, RefreshCw, Search, ExternalLink, Building2 } from 'lucide-react'
import { getInbox, getLeads } from '../api'
import { isSuperAdmin } from '../auth'
import { useT } from '../../i18n'

// Bandeja de mensajes del super-admin.
// Lee de /api/inbox (append-only: cada envío del formulario = mensaje).
// Si el endpoint no existe (backend antiguo), cae a /api/leads (CRM por email, último mensaje).
export default function Bandeja() {
  const { t } = useT()
  const [leads, setLeads] = useState(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [usingFallback, setFallback] = useState(false)

  function load() {
    getInbox()
      .then((r) => {
        // Normalizamos: cada mensaje del inbox usa 'body' (no 'plan').
        const msgs = (r.data?.messages || []).map((m) => ({ ...m, plan: m.body || m.plan || '' }))
        setLeads(msgs); setFallback(false)
      })
      .catch(() => {
        // Fallback al endpoint antiguo (1 doc por email; pierde mensajes repetidos).
        getLeads().then((r) => { setLeads(r.data?.leads || []); setFallback(true) }).catch(() => setLeads([]))
      })
  }
  useEffect(load, [])

  if (!isSuperAdmin()) return <div className="card p-10 text-center text-dark-400">{t('inbox.superonly')}</div>

  const list = (leads || []).filter((l) => {
    if (!q) return true
    const s = q.toLowerCase()
    return [l.email, l.name, l.company, l.plan].some((x) => (x || '').toLowerCase().includes(s))
  })

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold"><Inbox size={20} className="text-brand-400" /> {t('inbox.title')} {leads && <span className="text-dark-500">· {list.length}</span>}</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input className="input w-56 pl-9" placeholder={t('inbox.search.ph')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button onClick={load} className="btn-secondary flex items-center gap-1.5 text-sm"><RefreshCw size={14} /></button>
        </div>
      </div>

      <p className="mb-3 text-sm text-dark-400">{t('inbox.desc')} <a href="/contacto" target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">Contacto</a> {t('inbox.leads')}</p>
      {usingFallback && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {t('inbox.compat')}
        </div>
      )}

      {!leads ? <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> {t('ui.loading')}</div> :
        list.length === 0 ? <div className="card p-10 text-center text-dark-400">{t('inbox.no.msgs')}</div> : (
          <div className="card divide-y divide-dark-800">
            {list.map((l, i) => (
              <button key={i} onClick={() => setSel(l)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-dark-800/40">
                <Mail size={15} className="shrink-0 text-dark-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{l.name || l.email}</span>
                    {l.company && <span className="flex items-center gap-1 truncate text-xs text-dark-500"><Building2 size={11} /> {l.company}</span>}
                  </div>
                  <div className="truncate text-xs text-dark-400">{l.plan || l.email}</div>
                </div>
                <span className="shrink-0 text-[11px] text-dark-500">{(l.created_at || '').slice(0, 10)}</span>
              </button>
            ))}
          </div>
        )}

      {sel && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={() => setSel(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-dark-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">{sel.name || sel.email}</h2>
              <button onClick={() => setSel(null)} className="btn-ghost p-2">✕</button>
            </div>
            <div className="space-y-2 text-sm">
              <div><span className="text-dark-500">{t('inbox.from')}</span> <a href={`mailto:${sel.email}`} className="text-sky-400 hover:underline">{sel.email}</a></div>
              {sel.company && <div><span className="text-dark-500">{t('inbox.company')}</span> {sel.company}</div>}
              <div><span className="text-dark-500">{t('inbox.received')}</span> {(sel.created_at || '').replace('T', ' ').slice(0, 16)}</div>
              {sel.plan && <div className="rounded-lg border border-dark-800 bg-dark-800/40 p-3"><div className="mb-1 text-[11px] uppercase text-dark-500">{t('inbox.message')}</div><div className="whitespace-pre-wrap text-dark-200">{sel.plan}</div></div>}
              <a href={`mailto:${sel.email}?subject=Re:%20FlotaDSP&body=Hola%20${encodeURIComponent(sel.name || '')}%2C%0A%0A`} className="btn-primary mt-4 inline-flex items-center gap-2 text-sm">
                <ExternalLink size={14} /> {t('inbox.reply')}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
