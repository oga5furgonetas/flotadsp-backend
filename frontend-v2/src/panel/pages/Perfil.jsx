import { useState } from 'react'
import { useT } from '../../i18n'
import { Loader2, KeyRound, User, Mail, Receipt, ExternalLink, ShieldCheck } from 'lucide-react'
import { getAdmin, isSuperAdmin } from '../auth'
import { changeMyPassword } from '../api'

export default function Perfil() {
  const { t } = useT()
  const admin = getAdmin()
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [nw2, setNw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // {ok, text}

  async function savePassword() {
    setMsg(null)
    if (nw.length < 6) return setMsg({ ok: false, text: t('prof.pw.min') })
    if (nw !== nw2) return setMsg({ ok: false, text: t('prof.pw.mismatch') })
    setBusy(true)
    try {
      await changeMyPassword(cur, nw)
      setMsg({ ok: true, text: t('prof.pw.updated') })
      setCur(''); setNw(''); setNw2('')
    } catch (e) {
      setMsg({ ok: false, text: e?.response?.data?.detail || t('prof.pw.error') })
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-xl font-bold">{t('prof.title')}</h1>

      {/* Cuenta */}
      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-dark-200"><User size={16} /> {t('prof.account')}</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-dark-500">{t('prof.name')}</div><div className="font-medium">{admin?.name || '—'}</div></div>
          <div><div className="text-dark-500">{t('prof.role')}</div><div className="flex items-center gap-1 font-medium">{isSuperAdmin() ? <><ShieldCheck size={14} className="text-brand-400" /> {t('prof.superadmin')}</> : t('prof.admin')}</div></div>
          <div><div className="text-dark-500">{t('prof.slug')}</div><div className="font-medium">/{admin?.slug || '—'}</div></div>
        </div>
      </div>

      {/* Cambiar contraseña */}
      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-dark-200"><KeyRound size={16} /> {t('prof.password')}</div>
        <div className="space-y-3">
          <div><label className="label">{t('prof.current.pw')}</label><input type="password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">{t('prof.new.pw')}</label><input type="password" className="input" value={nw} onChange={(e) => setNw(e.target.value)} /></div>
            <div><label className="label">{t('prof.repeat.pw')}</label><input type="password" className="input" value={nw2} onChange={(e) => setNw2(e.target.value)} /></div>
          </div>
          {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
          <button onClick={savePassword} disabled={busy || !cur || !nw} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {busy && <Loader2 size={15} className="animate-spin" />} {t('prof.save.pw')}
          </button>
        </div>
      </div>

      {/* Email profesional (pendiente de backend — honesto) */}
      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-dark-200"><Mail size={16} /> {t('prof.email')}</div>
        <p className="text-sm text-dark-400">Conectar un email propio (ej. <i>hola@flotadsp.com</i>) para enviar avisos y recibos a tus clientes desde tu marca.</p>
        <div className="mt-3 flex items-center gap-2">
          <input className="input flex-1" placeholder="hola@tudominio.com" disabled />
          <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-400">Requiere activar backend de email</span>
        </div>
      </div>

      {/* Facturación */}
      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-dark-200"><Receipt size={16} /> {t('prof.billing')}</div>
        <p className="text-sm text-dark-400">Tus cobros y facturas (con IVA) los gestiona Lemon Squeezy como Merchant of Record. Desde su panel descargas facturas y ves los pagos.</p>
        <a href="https://app.lemonsqueezy.com" target="_blank" rel="noreferrer" className="btn-secondary mt-3 inline-flex items-center gap-1.5 text-sm">{t('prof.go.billing')} <ExternalLink size={14} /></a>
      </div>
    </div>
  )
}
