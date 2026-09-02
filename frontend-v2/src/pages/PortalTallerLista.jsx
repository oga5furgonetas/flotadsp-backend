import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import { Wrench, ChevronRight, AlertTriangle, Loader2, Euro, CalendarClock } from 'lucide-react'
import { API_BASE } from '../lib/apiBase'

/* LA PUERTA DE UN TALLER — un solo enlace, para siempre.
   ═══════════════════════════════════════════════════════════════════════
   Cada orden tenía su enlace y el taller acababa con seis mensajes de
   WhatsApp con seis enlaces: abría el que tenía más a mano, no el de la
   furgoneta que tenía delante. Esto es lo que tienen nuestro AHORA MISMO,
   y cada furgoneta abre su paso a paso de siempre. En claro y con botones
   grandes, como el portal por orden: se mira de pie, con el móvil, al lado de
   la furgoneta. Cliente HTTP propio, sin sesión que meter ni que borrar. */
const apiTaller = axios.create({ baseURL: API_BASE, timeout: 60000 })

const CHIP = {
  abierta: 'bg-slate-100 text-slate-700 ring-slate-200',
  recibido: 'bg-sky-50 text-sky-700 ring-sky-200',
  diagnostico: 'bg-violet-50 text-violet-700 ring-violet-200',
  esperando_piezas: 'bg-orange-50 text-orange-700 ring-orange-200',
  reparando: 'bg-blue-50 text-blue-700 ring-blue-200',
  listo: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

const fecha = (s) => {
  if (!s) return null
  const d = new Date(String(s).slice(0, 10) + 'T00:00:00')
  return isNaN(d) ? String(s).slice(0, 10) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

export default function PortalTallerLista() {
  const { token } = useParams()
  const [datos, setDatos] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let vivo = true
    apiTaller.get(`/taller/t/${token}`)
      .then((r) => { if (vivo) setDatos(r.data) })
      .catch((e) => { if (vivo) setErr(e?.response?.data?.detail || 'No se pudo abrir este enlace.') })
    return () => { vivo = false }
  }, [token])

  if (err) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-6 text-slate-900">
        <div className="max-w-sm rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
          <AlertTriangle className="mx-auto mb-2 text-red-500" size={26} />
          <p className="text-[15px] font-semibold text-red-700">{err}</p>
        </div>
      </div>
    )
  }
  if (!datos) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-slate-500">
        <Loader2 className="animate-spin" size={26} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 pb-5 pt-6">
        <div className="mx-auto max-w-lg">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-blue-600">FlotaDSP · vuestro enlace</p>
          <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight">{datos.taller || 'Taller'}</h1>
          <p className="mt-1 text-[14px] text-slate-500">
            {datos.total === 0 ? 'Ahora mismo no tenéis ninguna furgoneta nuestra.'
              : datos.total === 1 ? 'Tenéis una furgoneta nuestra. Tocadla para ponerle el estado.'
              : `Tenéis ${datos.total} furgonetas nuestras. Tocad una para ponerle el estado.`}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-3 px-4 pt-4">
        {datos.ordenes.map((o) => (
          <Link key={o.token} to={`/taller/${o.token}`}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50">
            <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Wrench size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[20px] font-extrabold leading-none tracking-tight">{o.matricula}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${CHIP[o.estado] || CHIP.abierta}`}>
                  {o.estado_txt}
                </span>
              </div>
              <p className="mt-1 truncate text-[13.5px] text-slate-600">{o.problema || o.modelo}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-slate-500">
                <span>{o.numero}</span>
                {o.fecha_entrada && <span>entró el {fecha(o.fecha_entrada)}</span>}
                {o.fecha_entrega_estimada && (
                  <span className="flex items-center gap-1"><CalendarClock size={12} /> {fecha(o.fecha_entrega_estimada)}</span>
                )}
                {o.presupuesto === 'pendiente' && <span className="flex items-center gap-1 text-orange-600"><Euro size={12} /> presupuesto enviado</span>}
                {o.presupuesto === 'aprobado' && <span className="flex items-center gap-1 text-emerald-600"><Euro size={12} /> presupuesto aprobado</span>}
                {o.presupuesto === 'sin_presupuesto' && <span className="flex items-center gap-1 text-slate-400"><Euro size={12} /> sin presupuesto</span>}
              </div>
            </div>
            <ChevronRight size={20} className="flex-none text-slate-400" />
          </Link>
        ))}
        {datos.total === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-[14px] text-slate-500">
            Cuando os llevemos una, aparecerá aquí. Este enlace no cambia: guardadlo.
          </p>
        )}
      </main>
    </div>
  )
}
