import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT } from '../../i18n'
import { Shield, Copy, Check, ExternalLink, Info, Link2, QrCode } from 'lucide-react'
import { getAdmin } from '../auth'

const PORTAL_BASE = 'https://flotadsp.com'

// Renderiza texto con <b>...</b> sin dangerouslySetInnerHTML
function BoldText({ str, className }) {
  const parts = str.split(/(<b>.*?<\/b>)/g)
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.startsWith('<b>') ? <b key={i}>{p.slice(3, -4)}</b> : p
      )}
    </span>
  )
}

function Link({ label, url, big }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  return (
    <div className={big ? 'rounded-xl border border-brand-500/40 bg-brand-500/5 p-4' : ''}>
      {label && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-dark-400">{label}</div>}
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

export default function PortalConductor() {
  const { centers: ctxCenters } = useOutletContext?.() || {}
  const { t } = useT()
  const admin = getAdmin()
  const slug = admin?.slug || ''
  const centers = useMemo(() => (Array.isArray(ctxCenters) && ctxCenters.length ? ctxCenters : (admin?.centers || [])), [ctxCenters, admin])

  const empresa = `${PORTAL_BASE}/conductor/#${slug}`
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(empresa)}`

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-2">
        <Shield size={22} className="text-brand-400" />
        <h1 className="text-xl font-bold">{t('portal.title')}</h1>
      </div>

      <p className="mb-5 text-sm text-dark-300"><BoldText str={t('portal.intro')} /></p>

      {/* Enlace principal de la empresa + QR */}
      <div className="card mb-4 p-5">
        <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
          <Link big label={t('portal.company.link')} url={empresa} />
          <div className="flex flex-col items-center gap-1">
            <div className="rounded-lg bg-white p-2"><img src={qr} alt="QR del portal conductor" width="160" height="160" /></div>
            <div className="flex items-center gap-1 text-[11px] text-dark-500"><QrCode size={11} /> {t('portal.scan.mobile')}</div>
          </div>
        </div>
      </div>

      {/* Un enlace por estación */}
      {centers.length > 0 && (
        <div className="card mb-4 p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-dark-200"><Link2 size={16} /> {t('portal.station.link')}</div>
          <p className="mb-3 text-sm text-dark-400">{t('portal.station.desc')}</p>
          <div className="space-y-3">
            {centers.map((c) => (
              <Link key={c} label={c} url={`${PORTAL_BASE}/conductor/?c=${encodeURIComponent(c)}#${slug}`} />
            ))}
          </div>
        </div>
      )}

      {/* Cómo funciona */}
      <div className="card p-5 text-sm text-dark-300">
        <div className="mb-2 flex items-center gap-2 font-semibold text-dark-200"><Info size={15} /> {t('portal.how')}</div>
        <ol className="ml-4 list-decimal space-y-1.5 text-dark-400">
          <li><BoldText str={t('portal.how.1')} /></li>
          <li><BoldText str={t('portal.how.2')} /></li>
          <li><BoldText str={t('portal.how.3')} /></li>
          <li><BoldText str={t('portal.how.4')} /></li>
        </ol>
        <p className="mt-3 text-xs text-dark-500">{t('portal.security')}</p>
      </div>
    </div>
  )
}
