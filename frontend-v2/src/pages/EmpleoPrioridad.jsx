import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { Loader2, Bell, CheckCircle2, AlertTriangle, Briefcase, MapPin } from 'lucide-react'
import { API_BASE } from '../lib/apiBase'
import { normalizarDetalle } from '../services/api'

/* AVISOS PRIORITARIOS DE EMPLEO — pagina publica, sin sesion.
   2,99 EUR/mes por enterarse en el momento de una oferta nueva. Mismo
   estilo claro que /empleo: lo mira alguien desde el movil, treinta
   segundos, decidiendo si se fia.

   Enseña las ofertas ABIERTAS DE VERDAD ahora mismo (mismo endpoint que
   /empleo) para que el valor no sea una promesa abstracta: "tenemos estas
   3 hoy, y te avisamos de las que saquemos despues". Pedido asi el
   18-09-2026: pensar esto como un negocio, no solo montar el cobro. */

const http = axios.create({ baseURL: API_BASE, timeout: 30000 })
http.interceptors.response.use((r) => r, (e) => {
  if (e?.response?.data) e.response.data = normalizarDetalle(e.response.data)
  return Promise.reject(e)
})

export default function EmpleoPrioridad() {
  const [params] = useSearchParams()
  const slug = params.get('slug') || ''
  const ok = params.get('ok')
  const [ofertas, setOfertas] = useState(null)
  const [email, setEmail] = useState('')
  const [perfil, setPerfil] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    http.get('/empleo/publicas', { params: slug ? { empresa: slug } : {} })
      .then((r) => setOfertas(r.data?.ofertas || []))
      .catch(() => setOfertas([]))
  }, [slug])

  async function suscribirse(e) {
    e.preventDefault()
    if (!email.trim()) return
    setEnviando(true); setErr('')
    try {
      const { data } = await http.post('/empleo/suscripcion/checkout', {
        email: email.trim(), slug, perfil: perfil.trim(),
      })
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
            En cuanto publiquemos un puesto nuevo, te escribimos al momento —
            sin que tengas que estar mirando la web cada día.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 text-center">
          <Bell size={32} className="mx-auto mb-3 text-sky-500" />
          <h1 className="text-xl font-bold text-slate-900">Sé Prioritario</h1>
          <p className="mt-2 text-sm text-slate-600">
            Por 2,99 €/mes te avisamos en el momento en que sacamos un puesto
            nuevo. El primero en enterarse suele ser el primero en conseguirlo.
          </p>
        </div>

        {ofertas === null ? (
          <div className="mb-5 flex flex-col items-center gap-2 text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            <p className="text-xs">Buscando las ofertas abiertas en tu zona…</p>
          </div>
        ) : ofertas.length > 0 && (
          <div className="mb-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Ahora mismo tenemos {ofertas.length} oferta{ofertas.length === 1 ? '' : 's'} abierta{ofertas.length === 1 ? '' : 's'}
            </p>
            <div className="space-y-1.5">
              {ofertas.slice(0, 5).map((o) => (
                <div key={o.slug} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <Briefcase size={14} className="shrink-0 text-slate-400" />
                  <span className="truncate font-medium text-slate-800">{o.titulo}</span>
                  {o.ciudad && (
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-slate-400">
                      <MapPin size={11} /> {o.ciudad}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">En breve subimos más ofertas de todos los sectores.</p>
          </div>
        )}

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
          <input
            value={perfil} onChange={(e) => setPerfil(e.target.value)} maxLength={300}
            placeholder="¿Qué tipo de trabajo buscas? (opcional)"
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
