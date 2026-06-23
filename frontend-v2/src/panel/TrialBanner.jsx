import { useEffect, useState } from 'react'
import { Clock, Sparkles, AlertTriangle } from 'lucide-react'
import { getOrgBilling, getBillingConfig } from './api'
import { getAdmin } from './auth'

// Banner global: enseña los días de prueba que quedan y un botón para pagar (Lemon Squeezy).
export default function TrialBanner() {
  const [billing, setBilling] = useState(null)
  const [cfg, setCfg] = useState(null)

  useEffect(() => {
    getOrgBilling().then((r) => setBilling(r.data)).catch(() => setBilling(null))
    getBillingConfig().then((r) => setCfg(r.data)).catch(() => setCfg(null))
  }, [])

  if (!billing) return null
  // Owner (tu propio DSP, super-admin del SaaS) no ve banner: no paga.
  if (billing.account_type === 'owner' || billing.status === 'owner') return null
  if (billing.status === 'active') return null

  const days = billing.days_left
  const required = billing.required
  const adminSlug = getAdmin()?.slug || ''
  const planRecord = localStorage.getItem('flota_plan') || 'Pro'
  const checkoutPro = cfg?.checkout?.[planRecord] || cfg?.checkout?.Pro
  // El backend webhook activa la org cuando paga: pasamos org_id en custom_data
  // y el slug para que LS la recuerde y el usuario vea su empresa.
  const goPay = () => {
    if (!checkoutPro) return
    const u = new URL(checkoutPro)
    u.searchParams.set('checkout[custom][org_id]', getAdmin()?.id ? '' : '') // org_id va en la sesión backend
    // Lemon Squeezy admite checkout_data[custom][key]
    u.searchParams.set('checkout[custom][slug]', adminSlug)
    window.location.href = u.toString()
  }

  if (required) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-red-500/20 px-4 py-2 text-sm text-red-200">
        <span className="flex items-center gap-1.5"><AlertTriangle size={14} /> Tu prueba ha terminado. Activa una suscripción para seguir usando FlotaDSP.</span>
        {cfg?.ready && <button onClick={goPay} className="rounded-md bg-red-500/30 px-3 py-1 text-xs font-bold hover:bg-red-500/40">Pasar a Pro · activar →</button>}
      </div>
    )
  }
  if (billing.status === 'trial') {
    const urgent = days != null && days <= 3
    return (
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm ${urgent ? 'bg-amber-500/20 text-amber-200' : 'bg-sky-500/15 text-sky-200'}`}>
        <span className="flex items-center gap-1.5">
          {urgent ? <AlertTriangle size={14} /> : <Clock size={14} />}
          {days != null ? <>Prueba gratis: te quedan <b>{days} día{days === 1 ? '' : 's'}</b>.</> : 'En periodo de prueba.'}
        </span>
        {cfg?.ready && <button onClick={goPay} className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-bold ${urgent ? 'bg-amber-500/30 hover:bg-amber-500/40' : 'bg-sky-500/30 hover:bg-sky-500/40'}`}><Sparkles size={12} /> Pasar a {planRecord}</button>}
      </div>
    )
  }
  if (billing.status === 'suspended') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-red-500/20 px-4 py-2 text-sm text-red-200">
        <span className="flex items-center gap-1.5"><AlertTriangle size={14} /> Suscripción suspendida.</span>
        {cfg?.ready && <button onClick={goPay} className="rounded-md bg-red-500/30 px-3 py-1 text-xs font-bold hover:bg-red-500/40">Reactivar →</button>}
      </div>
    )
  }
  return null
}
