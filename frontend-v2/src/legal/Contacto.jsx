import { useState } from 'react'
import { Loader2, Send, CheckCircle2, Mail } from 'lucide-react'
import LegalLayout from './LegalLayout'
import { COMPANY } from './config'
import { API_BASE } from '../services/api'

export default function Contacto() {
  const [form, setForm] = useState({ name: '', company: '', email: '', subject: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e?.preventDefault()
    setErr('')
    if (!form.email || !form.email.includes('@')) return setErr('Pon un email válido')
    setBusy(true)
    try {
      // El backend admite name/company/email/plan (lo usamos como "asunto - resumen del mensaje")
      const summary = [form.subject, form.message].filter(Boolean).join(' — ').slice(0, 500)
      const r = await fetch(`${API_BASE}/auth/lead`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), company: form.company.trim(), email: form.email.trim(), plan: summary }),
      })
      if (!r.ok) throw new Error('lead failed')
      setDone(true)
    } catch { setErr('No se pudo enviar el mensaje. Inténtalo de nuevo o escríbenos directamente al email.') } finally { setBusy(false) }
  }

  return (
    <LegalLayout title="Contacto">
      {done ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
          <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-400" />
          <p className="font-semibold text-emerald-200">¡Mensaje enviado!</p>
          <p className="mt-1 text-sm text-dark-300">Te responderemos a {form.email} en menos de 24 horas hábiles.</p>
        </div>
      ) : (
        <>
          <p>¿Tienes dudas, quieres una demo o necesitas ayuda? Escríbenos y te contestamos en menos de 24 horas hábiles.</p>
          <div className="mb-6 mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-dark-800 bg-dark-900 p-3"><div className="mb-1 flex items-center gap-1 text-xs text-dark-500"><Mail size={12} /> Soporte</div><a href={`mailto:${COMPANY.contactEmail}`} className="text-sm">{COMPANY.contactEmail}</a></div>
            <div className="rounded-lg border border-dark-800 bg-dark-900 p-3"><div className="mb-1 flex items-center gap-1 text-xs text-dark-500"><Mail size={12} /> Privacidad</div><a href={`mailto:${COMPANY.privacyEmail}`} className="text-sm">{COMPANY.privacyEmail}</a></div>
            <div className="rounded-lg border border-dark-800 bg-dark-900 p-3"><div className="mb-1 flex items-center gap-1 text-xs text-dark-500">Empresa</div><div className="text-sm">{COMPANY.legalName}</div></div>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Nombre</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="label">Empresa</label><input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            </div>
            <div><label className="label">Email *</label><input type="email" required className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="label">Asunto</label><input className="input" placeholder="Demo / Soporte / Comercial…" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
            <div><label className="label">Mensaje</label><textarea rows={5} className="input" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
            {err && <p className="text-sm text-red-400">{err}</p>}
            <button disabled={busy} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />} Enviar mensaje
            </button>
            <p className="text-xs text-dark-500">Al enviar este formulario aceptas el tratamiento de tus datos conforme a la <a href="/privacidad" className="text-sky-400">Política de Privacidad</a>.</p>
          </form>
        </>
      )}
    </LegalLayout>
  )
}
