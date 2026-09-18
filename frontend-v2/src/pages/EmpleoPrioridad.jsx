import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { Loader2, Bell, CheckCircle2, AlertTriangle } from 'lucide-react'
import { API_BASE } from '../lib/apiBase'
import { normalizarDetalle } from '../services/api'

/* AVISOS PRIORITARIOS DE EMPLEO — pagina publica, sin sesion.
   2,99 EUR/mes por enterarse antes que nadie de una oferta nueva. Mismo
   estilo claro que /empleo: lo mira alguien desde el movil, treinta
   segundos, decidiendo si se fia. */

const http = axios.create({ baseURL: API_BASE, timeout: 30000 })
http.interceptors.response.use((r) => r, (e) => {
  if (e?.response?.data) e.response.data = normalizarDetalle(e.response.data)
  return Promise.reject(e)
})

export default function EmpleoPrioridad() {
  const [params] = useSearchParams()
  const slug = params.get('slug') || ''
  const ok = params.get('ok')
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [err, setErr] = useState('')

  async function suscribirse(e) {
    e.preventDefault()
    if (!email.trim()) return
    setEnviando(true); setErr('')
    try {
      const { data } = await http.post('/empleo/suscripcion/checkout', { email: email.trim(), slug })
      if (data?.url) window.location.href = data.url
      else setErr('No se ha podido abrir el pago. Inténtalo en un minuto.')
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'No se ha podido abrir el pago. Inténtalo en un minuto.')
    } finally { setEnviando(false) }
  }

  if (ok === '1') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="max-w-sm text-center">
          <CheckCircle2 size={40} className="mx-auto mb-3 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">¡Ya estás dentro!</h1>
          <p className="mt-2 text-sm text-slate-600">
            En cuanto saquemos un puesto nuevo, te avisamos a ti antes que al resto.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Bell size={32} className="mx-auto mb-3 text-sky-500" />
          <h1 className="text-xl font-bold text-slate-900">Avisos prioritarios de empleo</h1>
          <p className="mt-2 text-sm text-slate-600">
            Por 2,99 €/mes te escribimos en cuanto saquemos una oferta nueva —
            antes de que se publique para todo el mundo.
          </p>
        </div>
        {ok === '0' && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-amber-200">
            <AlertTriangle size={15} /> El pago se canceló. Puedes intentarlo de nuevo cuando quieras.
          </div>
        )}
        <form onSubmit={suscribirse} className="space-y-3">
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px] text-slate-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
          <button type="submit" disabled={enviando}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {enviando ? <Loader2 size={16} className="animate-spin" /> : null}
            Suscribirme por 2,99 €/mes
          </button>
        </form>
        {err && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{err}</div>}
        <p className="mt-4 text-center text-xs text-slate-400">
          Cancelas cuando quieras, sin permanencia. El cobro lo gestiona Stripe.
        </p>
      </div>
    </div>
  )
}
