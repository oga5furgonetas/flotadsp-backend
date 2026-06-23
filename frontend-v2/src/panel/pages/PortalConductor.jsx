import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Shield, Copy, Check, ExternalLink, Info, Link2, QrCode } from 'lucide-react'
import { getAdmin } from '../auth'

const PORTAL_BASE = 'https://flotadsp.com'

function Link({ label, url, big }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className={big ? 'rounded-xl border border-brand-500/40 bg-brand-500/5 p-4' : ''}>
      {label && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-dark-400">{label}</div>}
      <div className="flex gap-2">
        <input readOnly value={url} className="input flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
          className="btn-secondary flex items-center gap-1.5 whitespace-nowrap text-sm">
          {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="btn-ghost px-2" title="Abrir"><ExternalLink size={15} /></a>
      </div>
    </div>
  )
}

export default function PortalConductor() {
  const { centers: ctxCenters } = useOutletContext?.() || {}
  const admin = getAdmin()
  const slug = admin?.slug || ''
  const centers = useMemo(() => (Array.isArray(ctxCenters) && ctxCenters.length ? ctxCenters : (admin?.centers || [])), [ctxCenters, admin])

  const empresa = `${PORTAL_BASE}/conductor/#${slug}`
  // QR del enlace de la empresa (servicio público gratuito)
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(empresa)}`

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-2">
        <Shield size={22} className="text-brand-400" />
        <h1 className="text-xl font-bold">Portal Conductor</h1>
      </div>

      <p className="mb-5 text-sm text-dark-300">
        Estos son <b>tus enlaces</b>. Compártelos con tus conductores: entran, ponen su email y suben las fotos.
        Cada empresa tiene su propio enlace y los datos <b>no se mezclan</b> entre estaciones ni con otras empresas.
      </p>

      {/* Enlace principal de la empresa + QR */}
      <div className="card mb-4 p-5">
        <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
          <Link big label="Enlace de tu empresa (todos los centros)" url={empresa} />
          <div className="flex flex-col items-center gap-1">
            <div className="rounded-lg bg-white p-2"><img src={qr} alt="QR del portal conductor" width="160" height="160" /></div>
            <div className="flex items-center gap-1 text-[11px] text-dark-500"><QrCode size={11} /> Escanéalo desde el móvil</div>
          </div>
        </div>
      </div>

      {/* Un enlace por estación */}
      {centers.length > 0 && (
        <div className="card mb-4 p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-dark-200"><Link2 size={16} /> Un enlace por estación (recomendado)</div>
          <p className="mb-3 text-sm text-dark-400">Deja el centro ya elegido. El conductor solo pone su email: más rápido y a prueba de errores.</p>
          <div className="space-y-3">
            {centers.map((c) => (
              <Link key={c} label={c} url={`${PORTAL_BASE}/conductor/?c=${encodeURIComponent(c)}#${slug}`} />
            ))}
          </div>
        </div>
      )}

      {/* Cómo funciona */}
      <div className="card p-5 text-sm text-dark-300">
        <div className="mb-2 flex items-center gap-2 font-semibold text-dark-200"><Info size={15} /> ¿Cómo funciona?</div>
        <ol className="ml-4 list-decimal space-y-1.5 text-dark-400">
          <li>El conductor abre <b>tu enlace</b> en el móvil.</li>
          <li>Elige su nombre/email (los que tú has dado de alta en <b>Conductores</b>).</li>
          <li>Sube las fotos de la furgo. La IA analiza y guarda el peritaje.</li>
          <li>Tú lo ves todo en <b>Inspecciones</b> y <b>Revisión rápida</b>.</li>
        </ol>
        <p className="mt-3 text-xs text-dark-500">
          Seguridad: el enlace está atado a tu empresa por un identificador único (slug); aunque otra empresa entrase a tu URL,
          solo vería tu nombre y conductores — no podría leer ni escribir nada de otra DSP.
        </p>
      </div>
    </div>
  )
}
