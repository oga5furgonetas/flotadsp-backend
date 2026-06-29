import { useEffect, useState } from 'react'
import { Clock, Sparkles, AlertTriangle } from 'lucide-react'
import { getOrgBilling, getBillingConfig } from './api'
import { getAdmin, getOrgId } from './auth'
import { useT } from '../i18n'

// Convierte claves antiguas (capitalizadas) a las nuevas (lowercase)
const PLAN_KEY_MAP = {
  Starter: 'basico',
  Forensics: 'flota',
  Max: 'flota',
  Pro: 'pro',
  Enterprise: 'enterprise',
}
const PLAN_LABELS = { basico: 'Básico', pro: 'Pro', flota: 'Flota', enterprise: 'Enterprise' }

export default function TrialBanner() {
  const { t } = useT()
  const [billing, setBilling] = useState(null)
  const [cfg, setCfg] = useState(null)

  useEffect(() => {
    getOrgBilling().then((r) => setBilling(r.data)).catch(() => setBilling(null))
    getBillingConfig().then((r) => setCfg(r.data)).catch(() => setCfg(null))
  }, [])

  if (!billing) return null
  if (billing.account_type === 'owner' || billing.status === 'owner') return null
  if (billing.status === 'active') return null

  const days = billing.days_left
  const required = billing.required
  const adminSlug = getAdmin()?.slug || ''
  const orgId = getOrgId()

  // Normalizar clave de plan (soporta formato antiguo y nuevo)
  const rawPlan = localStorage.getItem('flota_plan') || 'pro'
  const planKey = PLAN_KEY_MAP[rawPlan] || rawPlan.toLowerCase()
  const planLabel = PLAN_LABELS[planKey] || planKey
  const isEnterprise = planKey === 'enterprise'

  // Modo de facturación elegido en el registro
  const billingMode = localStorage.getItem('flota_billing') || 'monthly'

  // URL de checkout: anual primero (si existe), luego mensual, luego fallback a flota/pro
  const checkoutUrl =
    (billingMode === 'annual' ? cfg?.checkout?.[`${planKey}_annual`] : null) ||
    cfg?.checkout?.[planKey] ||
    cfg?.checkout?.flota ||
    cfg?.checkout?.pro

  const goPay = () => {
    if (isEnterprise) { window.location.href = '/contacto?asunto=Enterprise'; return }
    if (!checkoutUrl) return alert('Pasarela de pago no configurada todavía.')
    if (!orgId) return alert('No hemos podido identificar tu organización. Cierra sesión y vuelve a entrar.')
    const u = new URL(checkoutUrl)
    u.searchParams.set('checkout[custom][org_id]', orgId)
    if (adminSlug) u.searchParams.set('checkout[custom][slug]', adminSlug)
    window.location.href = u.toString()
  }

  const ctaText = isEnterprise ? `${t('trial.contact')} (${planLabel})` : `${t('trial.goto')} ${planLabel}`
  const canShowCta = isEnterprise || cfg?.ready

  if (required) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-red-500/20 px-4 py-2 text-sm text-red-200">
        <span className="flex items-center gap-1.5"><AlertTriangle size={14} /> {t('trial.ended')}</span>
        {canShowCta && <button onClick={goPay} className="rounded-md bg-red-500/30 px-3 py-1 text-xs font-bold hover:bg-red-500/40">{ctaText} · {t('trial.activate')}</button>}
      </div>
    )
  }
  if (billing.status === 'trial') {
    const urgent = days != null && days <= 3
    return (
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm ${urgent ? 'bg-amber-500/20 text-amber-200' : 'bg-sky-500/15 text-sky-200'}`}>
        <span className="flex items-center gap-1.5">
          {urgent ? <AlertTriangle size={14} /> : <Clock size={14} />}
          {days != null
            ? <>{t('trial.free')} <b>{planLabel}</b>: {t('trial.days.left')} <b>{days} {days === 1 ? t('trial.day') : t('trial.days')}</b>.</>
            : t('trial.on')}
        </span>
        {canShowCta && <button onClick={goPay} className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-bold ${urgent ? 'bg-amber-500/30 hover:bg-amber-500/40' : 'bg-sky-500/30 hover:bg-sky-500/40'}`}><Sparkles size={12} /> {ctaText}</button>}
      </div>
    )
  }
  if (billing.status === 'suspended') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-red-500/20 px-4 py-2 text-sm text-red-200">
        <span className="flex items-center gap-1.5"><AlertTriangle size={14} /> {t('trial.suspended')}</span>
        {canShowCta && <button onClick={goPay} className="rounded-md bg-red-500/30 px-3 py-1 text-xs font-bold hover:bg-red-500/40">{t('trial.reactivate')}</button>}
      </div>
    )
  }
  return null
}
