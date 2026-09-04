import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import {
  Briefcase, Loader2, AlertTriangle, CheckCircle2, MapPin, Clock, Euro,
  ChevronRight, ShieldCheck, Paperclip, X,
} from 'lucide-react'
import { API_BASE } from '../lib/apiBase'

/* LA PÁGINA DONDE SE APUNTA LA GENTE — sin login y desde el móvil.
   ══════════════════════════════════════════════════════════════════════════
   Aquí llega quien pulsa el anuncio de Indeed o el enlace de un grupo de
   WhatsApp. Es la primera cosa que esa persona ve de la empresa, así que tiene
   que parecer una empresa: cabecera con el puesto, las condiciones de un
   vistazo, y el formulario debajo.

   Se rellena de pie, con una mano y con prisa, así que va EN DOS PASOS. No es
   decoración: un formulario largo de golpe se abandona, y en dos pasos el que
   ya escribió su nombre y su teléfono casi siempre termina. El paso 1 son los
   datos con los que se le puede llamar; el 2, lo que decide si encaja.

   El `?de=` dice de dónde viene (indeed, whatsapp...) y viaja con la
   candidatura: es la única forma de saber qué anuncio trae gente y cuál se
   está pagando en balde.

   Lo que descarta NO se enseña: el backend no lo manda. Si el candidato supiera
   qué respuesta le deja fuera, el cuestionario no mediría nada. */

const http = axios.create({ baseURL: API_BASE, timeout: 30000 })

const VACIO = {
  nombre: '', telefono: '', email: '', ciudad: '', dni: '', nacimiento: '',
  carnet_desde: '', experiencia: '', disponibilidad: '', consiento: false, web: '',
}

export default function Empleo() {
  const { slug, oferta: ofertaSlug } = useParams()
  const [params] = useSearchParams()
  const [oferta, setOferta] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState(false)
  const [paso, setPaso] = useState(1)
  const [f, setF] = useState(VACIO)
  const [resp, setResp] = useState({})
  const [cv, setCv] = useState(null)

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

  /* La edad se calcula del nacimiento y se enseña al momento. Pedir «edad» a
     pelo envejece: la candidatura de hoy dice 24 y dentro de ocho meses sigue
     diciendo 24. La fecha no caduca; el número se saca de ella. */
  const edad = useMemo(() => {
    if (!f.nacimiento) return null
    const n = new Date(f.nacimiento)
    if (Number.isNaN(n.getTime())) return null
    const hoy = new Date()
    let a = hoy.getFullYear() - n.getFullYear()
    const m = hoy.getMonth() - n.getMonth()
    if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) a -= 1
    return a >= 14 && a <= 90 ? a : null
  }, [f.nacimiento])

  const paso1Listo = f.nombre.trim().length >= 3 && f.telefono.replace(/\D/g, '').length >= 9

  const enviar = async (e) => {
    e.preventDefault()
    if (!f.consiento) { setError('Acepta que guardemos tus datos para poder enviar la candidatura.'); return }
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('datos', JSON.stringify({
        ...f, respuestas: resp, edad, origen: params.get('de') || 'directo',
      }))
      if (cv) fd.append('cv', cv, cv.name)
      await http.post(
        `/empleo/publica/${encodeURIComponent(slug)}/${encodeURIComponent(ofertaSlug)}`, fd)
      setHecho(true)
      setError('')
    } catch (err) {
      setError(err?.response?.data?.detail || 'No hemos podido enviar tu candidatura. Inténtalo otra vez.')
      setPaso(1)
    } finally { setEnviando(false) }
  }

  if (cargando) {
    return <div className="flex min-h-screen items-center justify-center bg-dark-950"><Loader2 className="animate-spin text-dark-500" /></div>
  }

  if (!oferta) {
    return (
      <Marco>
        <div className="py-16 text-center">
          <AlertTriangle className="mx-auto mb-3 text-amber-400" size={32} />
          <p className="text-sm text-dark-300">{error || 'Esta oferta ya no está disponible.'}</p>
        </div>
      </Marco>
    )
  }

  if (hecho) {
    return (
      <Marco>
        <div className="py-16 text-center">
          <CheckCircle2 className="mx-auto mb-4 text-emerald-400" size={44} />
          <h1 className="text-xl font-bold text-dark-50">Candidatura enviada</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-dark-400">
            Gracias{f.nombre ? `, ${f.nombre.split(' ')[0]}` : ''}. La hemos recibido y la
            revisa una persona, no un robot. Si encajas te llamamos al{' '}
            <b className="text-dark-200">{f.telefono}</b>.
          </p>
          <p className="mt-6 text-[11px] text-dark-600">
            Puedes pedirnos que borremos tus datos cuando quieras.
          </p>
        </div>
      </Marco>
    )
  }

  const preguntas = oferta.preguntas || []

  return (
    <Marco>
      {/* ── La oferta ─────────────────────────────────────────────────── */}
      <div className="border-b border-dark-800 pb-6">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-400">
          <Briefcase size={13} /> Oferta de trabajo
        </div>
        <h1 className="mt-2 text-[26px] font-bold leading-tight text-dark-50">{oferta.titulo}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {oferta.ciudad && <Etiqueta icon={MapPin}>{oferta.ciudad}</Etiqueta>}
          {oferta.jornada && <Etiqueta icon={Clock}>{oferta.jornada}</Etiqueta>}
          {oferta.salario && <Etiqueta icon={Euro}>{oferta.salario}</Etiqueta>}
        </div>
        {oferta.descripcion && (
          <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed text-dark-300">{oferta.descripcion}</p>
        )}
        {oferta.requisitos && (
          <div className="mt-4 rounded-xl border border-dark-800 bg-dark-900/50 p-4">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-dark-500">Qué pedimos</div>
            <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-dark-300">{oferta.requisitos}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span className="min-w-0">{error}</span>
        </div>
      )}

      {/* ── El formulario, en dos pasos ───────────────────────────────── */}
      <form onSubmit={enviar} className="mt-6">
        <div className="mb-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
          <span className={paso === 1 ? 'text-brand-300' : 'text-dark-600'}>1 · Tus datos</span>
          <ChevronRight size={13} className="text-dark-700" />
          <span className={paso === 2 ? 'text-brand-300' : 'text-dark-600'}>2 · Tu experiencia</span>
        </div>

        {paso === 1 ? (
          <div className="space-y-4">
            <Campo label="Nombre y apellidos" value={f.nombre} onChange={(v) => set('nombre', v)} required autoComplete="name" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Teléfono" value={f.telefono} onChange={(v) => set('telefono', v)} required type="tel" autoComplete="tel" pista="Te llamamos a este número" />
              <Campo label="Ciudad" value={f.ciudad} onChange={(v) => set('ciudad', v)} autoComplete="address-level2" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Correo" value={f.email} onChange={(v) => set('email', v)} type="email" autoComplete="email" pista="Opcional" />
              <Campo label="DNI o NIE" value={f.dni} onChange={(v) => set('dni', v.toUpperCase())} pista="Opcional, para el alta" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Fecha de nacimiento" value={f.nacimiento} onChange={(v) => set('nacimiento', v)} type="date"
                pista={edad ? `${edad} años` : 'Opcional'} />
              <Campo label="Carnet B desde" value={f.carnet_desde} onChange={(v) => set('carnet_desde', v)} placeholder="2019" pista="El año" />
            </div>
            <button type="button" disabled={!paso1Listo} onClick={() => { setError(''); setPaso(2) }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-[15px] font-semibold text-dark-950 disabled:opacity-40">
              Continuar <ChevronRight size={16} />
            </button>
            {!paso1Listo && (
              <p className="text-center text-[11.5px] text-dark-600">Con el nombre y el teléfono basta para seguir.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Experiencia repartiendo" value={f.experiencia} onChange={(v) => set('experiencia', v)} placeholder="2 años" pista="Opcional" />
              <Campo label="Cuándo puedes empezar" value={f.disponibilidad} onChange={(v) => set('disponibilidad', v)} placeholder="Ya mismo" pista="Opcional" />
            </div>

            {preguntas.map((p) => (
              <div key={p.id}>
                <label className="mb-2 block text-[14px] font-medium text-dark-200">
                  {p.texto} {p.obligatoria && <span className="text-red-400">*</span>}
                </label>
                {(p.tipo === 'si_no' || p.tipo === 'opcion') && (
                  <div className="flex flex-wrap gap-2">
                    {(p.opciones || []).map((o) => (
                      <Opcion key={o} activa={resp[p.id] === o} onClick={() => setResp((r) => ({ ...r, [p.id]: o }))}>{o}</Opcion>
                    ))}
                  </div>
                )}
                {p.tipo === 'varias' && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {(p.opciones || []).map((o) => (
                        <Opcion key={o} activa={(resp[p.id] || []).includes(o)} onClick={() => marcarVarias(p.id, o)}>{o}</Opcion>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11.5px] text-dark-600">Marca todas las que valgan.</p>
                  </>
                )}
                {(p.tipo === 'texto' || p.tipo === 'numero') && (
                  <input value={resp[p.id] || ''} onChange={(e) => setResp((r) => ({ ...r, [p.id]: e.target.value }))}
                    inputMode={p.tipo === 'numero' ? 'numeric' : 'text'}
                    className="w-full rounded-xl border border-dark-700 bg-dark-950 px-3.5 py-3 text-base text-dark-100 outline-none focus:border-brand-500/50" />
                )}
              </div>
            ))}

            {/* El CV es opcional a propósito: pedirlo como obligatorio deja
                fuera a media plantilla de reparto, que no tiene uno hecho. */}
            <div>
              <label className="mb-2 block text-[14px] font-medium text-dark-200">
                Currículum <span className="font-normal text-dark-600">· opcional</span>
              </label>
              {cv ? (
                <div className="flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3.5 py-3 text-sm text-brand-200">
                  <Paperclip size={15} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{cv.name}</span>
                  <button type="button" onClick={() => setCv(null)} aria-label="Quitar el currículum" className="shrink-0 text-brand-300/70 hover:text-brand-200">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-dark-700 px-3.5 py-4 text-sm text-dark-400 hover:border-dark-600 hover:text-dark-300">
                  <Paperclip size={15} />
                  Adjuntar PDF o foto
                  <input type="file" accept=".pdf,.doc,.docx,image/*" className="hidden"
                    onChange={(e) => {
                      const x = e.target.files?.[0]
                      if (!x) return
                      if (x.size > 8 * 1024 * 1024) { setError('El currículum no puede pasar de 8 MB.'); return }
                      setError(''); setCv(x)
                    }} />
                </label>
              )}
            </div>

            {/* CAMPO TRAMPA: los bots rellenan todos los inputs que encuentran y
                una persona no ve este. El backend descarta lo que venga con él
                lleno, y responde OK para que el bot no aprenda a dejarlo vacío. */}
            <input value={f.web} onChange={(e) => set('web', e.target.value)} tabIndex={-1} autoComplete="off"
              aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }} />

            <label className="flex items-start gap-2.5 rounded-xl border border-dark-800 bg-dark-900/50 p-3.5 text-[12.5px] leading-relaxed text-dark-400">
              <input type="checkbox" checked={f.consiento} onChange={(e) => set('consiento', e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Acepto que guardéis mis datos <b className="text-dark-300">12 meses</b> para este proceso
                de selección. Puedo pedir que los borréis cuando quiera.
              </span>
            </label>

            <div className="flex gap-2">
              <button type="button" onClick={() => setPaso(1)}
                className="rounded-xl border border-dark-700 px-4 py-3.5 text-[15px] font-medium text-dark-300">
                Atrás
              </button>
              <button type="submit" disabled={enviando}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-[15px] font-semibold text-dark-950 disabled:opacity-60">
                {enviando && <Loader2 size={16} className="animate-spin" />} Enviar candidatura
              </button>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-[11.5px] text-dark-600">
              <ShieldCheck size={12} /> Tus datos no se comparten con nadie más.
            </p>
          </div>
        )}
      </form>
    </Marco>
  )
}

function Marco({ children }) {
  return (
    <div className="min-h-screen bg-dark-950">
      <div className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
        {children}
      </div>
    </div>
  )
}

function Etiqueta({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-dark-800 bg-dark-900/60 px-2.5 py-1 text-[12.5px] text-dark-300">
      <Icon size={13} className="text-dark-500" /> {children}
    </span>
  )
}

function Opcion({ activa, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-[14px] font-medium ring-1 transition ${
        activa ? 'bg-brand-500/20 text-brand-200 ring-brand-500/50' : 'text-dark-300 ring-dark-700 hover:ring-dark-600'}`}>
      {children}
    </button>
  )
}

function Campo({ label, value, onChange, required, type = 'text', placeholder, autoComplete, pista }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-[14px] font-medium text-dark-200">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
        {pista && <span className="shrink-0 text-[11.5px] text-dark-600">{pista}</span>}
      </div>
      {/* 16 px como mínimo: por debajo, Safari en iPhone hace zoom al enfocar
          el campo y descoloca la página entera. */}
      <input value={value} onChange={(e) => onChange(e.target.value)} type={type}
        required={required} placeholder={placeholder} autoComplete={autoComplete}
        className="w-full rounded-xl border border-dark-700 bg-dark-950 px-3.5 py-3 text-base text-dark-100 placeholder-dark-600 outline-none focus:border-brand-500/50" />
    </div>
  )
}
