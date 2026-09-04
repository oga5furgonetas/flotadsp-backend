import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { Briefcase, Loader2, AlertTriangle, CheckCircle2, MapPin, Clock } from 'lucide-react'
import { API_BASE } from '../lib/apiBase'

/* LA PÁGINA DONDE SE APUNTA LA GENTE — sin login y desde el móvil.
   ══════════════════════════════════════════════════════════════════════════
   Aquí llega quien pulsa el anuncio de Indeed o el enlace de un grupo de
   WhatsApp. Se rellena de pie, con una mano y con prisa, así que:
   campos grandes, los mínimos posibles, y el cuestionario que haya puesto la
   oficina debajo. Cada campo de más es gente que no termina.

   El `?de=` dice de dónde viene (indeed, whatsapp...) y viaja con la
   candidatura: es la única forma de saber qué anuncio trae gente y cuál se
   está pagando en balde.

   Lo que descarta NO se enseña: el backend no lo manda. Si el candidato
   supiera qué respuesta le deja fuera, el cuestionario no mediría nada. */

const http = axios.create({ baseURL: API_BASE, timeout: 20000 })

export default function Empleo() {
  const { slug, oferta: ofertaSlug } = useParams()
  const [params] = useSearchParams()
  const [oferta, setOferta] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState(false)
  const [f, setF] = useState({
    nombre: '', telefono: '', email: '', ciudad: '', carnet_desde: '',
    experiencia: '', disponibilidad: '', consiento: false, web: '',
  })
  const [resp, setResp] = useState({})

  useEffect(() => {
    let vivo = true
    http.get(`/empleo/publica/${encodeURIComponent(slug)}/${encodeURIComponent(ofertaSlug)}`)
      .then(({ data }) => { if (vivo) { setOferta(data); setError('') } })
      .catch((e) => { if (vivo) setError(e?.response?.data?.detail || 'No hemos podido cargar esta oferta.') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [slug, ofertaSlug])

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  const marcarVarias = (pid, opcion) => setResp((r) => {
    const ya = Array.isArray(r[pid]) ? r[pid] : []
    return { ...r, [pid]: ya.includes(opcion) ? ya.filter((x) => x !== opcion) : [...ya, opcion] }
  })

  const enviar = async (e) => {
    e.preventDefault()
    setEnviando(true)
    try {
      await http.post(
        `/empleo/publica/${encodeURIComponent(slug)}/${encodeURIComponent(ofertaSlug)}`,
        { ...f, respuestas: resp, origen: params.get('de') || 'directo' })
      setHecho(true)
      setError('')
    } catch (err) {
      setError(err?.response?.data?.detail || 'No hemos podido enviar tu candidatura. Inténtalo otra vez.')
    } finally { setEnviando(false) }
  }

  if (cargando) {
    return <div className="flex min-h-screen items-center justify-center bg-dark-950"><Loader2 className="animate-spin text-dark-500" /></div>
  }

  if (!oferta) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-950 p-6">
        <div className="max-w-sm text-center">
          <AlertTriangle className="mx-auto mb-3 text-amber-400" />
          <p className="text-sm text-dark-300">{error || 'Esta oferta ya no está disponible.'}</p>
        </div>
      </div>
    )
  }

  if (hecho) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-950 p-6">
        <div className="max-w-sm text-center">
          <CheckCircle2 className="mx-auto mb-3 text-emerald-400" size={36} />
          <h1 className="text-lg font-bold text-dark-50">Candidatura enviada</h1>
          <p className="mt-2 text-sm text-dark-400">
            Gracias{f.nombre ? `, ${f.nombre.split(' ')[0]}` : ''}. Te llamamos nosotros:
            no hace falta que hagas nada más.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark-950 px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand-400">
            <Briefcase size={14} /> Oferta de trabajo
          </div>
          <h1 className="mt-1 text-2xl font-bold text-dark-50">{oferta.titulo}</h1>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-dark-400">
            {oferta.ciudad && <span className="flex items-center gap-1"><MapPin size={14} /> {oferta.ciudad}</span>}
            {oferta.jornada && <span className="flex items-center gap-1"><Clock size={14} /> {oferta.jornada}</span>}
            {oferta.salario && <span>{oferta.salario}</span>}
          </div>
          {oferta.descripcion && <p className="mt-3 whitespace-pre-line text-sm text-dark-300">{oferta.descripcion}</p>}
          {oferta.requisitos && (
            <p className="mt-3 whitespace-pre-line rounded-lg border border-dark-800 bg-dark-900/60 p-3 text-sm text-dark-300">
              {oferta.requisitos}
            </p>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span className="min-w-0">{error}</span>
          </div>
        )}

        <form onSubmit={enviar} className="space-y-4 rounded-2xl border border-dark-800 bg-dark-900/60 p-4">
          <Campo label="Nombre y apellidos" value={f.nombre} onChange={(v) => set('nombre', v)} required autoComplete="name" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Teléfono" value={f.telefono} onChange={(v) => set('telefono', v)} required type="tel" autoComplete="tel" />
            <Campo label="Ciudad" value={f.ciudad} onChange={(v) => set('ciudad', v)} autoComplete="address-level2" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Correo (opcional)" value={f.email} onChange={(v) => set('email', v)} type="email" autoComplete="email" />
            <Campo label="Carnet B desde" value={f.carnet_desde} onChange={(v) => set('carnet_desde', v)} placeholder="2019" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Experiencia repartiendo" value={f.experiencia} onChange={(v) => set('experiencia', v)} placeholder="2 años" />
            <Campo label="Cuándo puedes empezar" value={f.disponibilidad} onChange={(v) => set('disponibilidad', v)} placeholder="Ya mismo" />
          </div>

          {(oferta.preguntas || []).map((p) => (
            <div key={p.id}>
              <label className="mb-1.5 block text-sm text-dark-200">
                {p.texto} {p.obligatoria && <span className="text-red-400">*</span>}
              </label>
              {(p.tipo === 'si_no' || p.tipo === 'opcion') && (
                <div className="flex flex-wrap gap-2">
                  {(p.opciones || []).map((o) => (
                    <button key={o} type="button" onClick={() => setResp((r) => ({ ...r, [p.id]: o }))}
                      className={`rounded-lg px-3 py-2 text-sm ring-1 ${resp[p.id] === o ? 'bg-brand-500/20 text-brand-200 ring-brand-500/40' : 'text-dark-300 ring-dark-700'}`}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
              {p.tipo === 'varias' && (
                <div className="flex flex-wrap gap-2">
                  {(p.opciones || []).map((o) => (
                    <button key={o} type="button" onClick={() => marcarVarias(p.id, o)}
                      className={`rounded-lg px-3 py-2 text-sm ring-1 ${(resp[p.id] || []).includes(o) ? 'bg-brand-500/20 text-brand-200 ring-brand-500/40' : 'text-dark-300 ring-dark-700'}`}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
              {(p.tipo === 'texto' || p.tipo === 'numero') && (
                <input value={resp[p.id] || ''} onChange={(e) => setResp((r) => ({ ...r, [p.id]: e.target.value }))}
                  inputMode={p.tipo === 'numero' ? 'numeric' : 'text'}
                  className="w-full rounded-lg border border-dark-700 bg-dark-950 px-3 py-2.5 text-base text-dark-100" />
              )}
            </div>
          ))}

          {/* CAMPO TRAMPA: los bots rellenan todos los inputs que encuentran y
              una persona no ve este. El backend descarta lo que venga con él
              lleno, y responde OK para que el bot no aprenda a dejarlo vacío. */}
          <input value={f.web} onChange={(e) => set('web', e.target.value)} tabIndex={-1} autoComplete="off"
            aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }} />

          <label className="flex items-start gap-2 text-xs text-dark-400">
            <input type="checkbox" checked={f.consiento} onChange={(e) => set('consiento', e.target.checked)} className="mt-0.5" />
            <span>
              Acepto que guardéis mis datos durante 12 meses para este proceso de selección.
              Puedo pedir que los borréis cuando quiera.
            </span>
          </label>

          <button type="submit" disabled={enviando}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-base font-semibold text-dark-950 disabled:opacity-60">
            {enviando && <Loader2 size={16} className="animate-spin" />} Apuntarme
          </button>
        </form>
      </div>
    </div>
  )
}

function Campo({ label, value, onChange, required, type = 'text', placeholder, autoComplete }) {
  return (
    <div>
      <label className="mb-1 block text-sm text-dark-300">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {/* 16 px como mínimo: por debajo, Safari en iPhone hace zoom al enfocar
          el campo y descoloca la página entera. */}
      <input value={value} onChange={(e) => onChange(e.target.value)} type={type}
        required={required} placeholder={placeholder} autoComplete={autoComplete}
        className="w-full rounded-lg border border-dark-700 bg-dark-950 px-3 py-2.5 text-base text-dark-100 placeholder-dark-600" />
    </div>
  )
}
