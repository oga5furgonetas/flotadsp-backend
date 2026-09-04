import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import {
  Loader2, AlertTriangle, CheckCircle2, MapPin, Clock, Euro, Package,
  ChevronRight, ShieldCheck, Paperclip, X, Truck, CalendarCheck, Users,
} from 'lucide-react'
import { API_BASE } from '../lib/apiBase'

/* LA PÁGINA DONDE SE APUNTA LA GENTE — sin login y desde el móvil.
   ══════════════════════════════════════════════════════════════════════════
   Aquí llega quien pulsa el anuncio de Indeed o el enlace de un grupo de
   WhatsApp, y es lo primero que esa persona ve de la empresa.

   VA EN CLARO, NO EN NEGRO. El panel es oscuro porque lo mira la oficina ocho
   horas seguidas; esto lo mira una persona treinta segundos, desde la calle,
   decidiendo si se fía. Un formulario que pide DNI sobre fondo negro parece
   cualquier cosa menos una empresa de reparto — y en la calle, con sol, casi
   no se lee. Blanco, tipografía grande y el oficio a la vista: furgoneta,
   paquetes, horario.

   EN DOS PASOS, y no es decoración: un formulario largo de golpe se abandona,
   y quien ya escribió su nombre y su teléfono casi siempre termina. Paso 1,
   con qué se le puede llamar. Paso 2, lo que decide si encaja.

   El `?de=` dice de dónde viene (indeed, whatsapp...) y viaja con la
   candidatura: es la única forma de saber qué anuncio trae gente.

   Lo que descarta NO se enseña: el backend no lo manda. Si el candidato supiera
   qué respuesta le deja fuera, el cuestionario no mediría nada. */

const http = axios.create({ baseURL: API_BASE, timeout: 30000 })

const VACIO = {
  nombre: '', telefono: '', email: '', ciudad: '', dni: '', nacimiento: '',
  carnet_desde: '', experiencia: '', disponibilidad: '', consiento: false, web: '',
}

const CUANDO = ['Ya mismo', 'Esta semana', 'En 15 días', 'En un mes']

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

  /* EL FONDO DEL BODY TAMBIEN, no solo el del marco. La app entera es oscura
     y esta pagina no: sin esto, en el movil se ve la franja negra al rebotar el
     scroll y la barra del navegador se tiñe de negro — justo lo que hace que no
     parezca una empresa. Se restaura al salir para no dejar el panel en claro. */
  useEffect(() => {
    const html = document.documentElement
    const antes = { body: document.body.style.background, html: html.style.background,
                    esquema: html.style.colorScheme }
    document.body.style.background = '#f8fafc'
    html.style.background = '#f8fafc'
    html.style.colorScheme = 'light'
    const meta = document.querySelector('meta[name="theme-color"]')
    const colorAntes = meta ? meta.getAttribute('content') : null
    if (meta) meta.setAttribute('content', '#f97316')
    return () => {
      document.body.style.background = antes.body
      html.style.background = antes.html
      html.style.colorScheme = antes.esquema
      if (meta && colorAntes !== null) meta.setAttribute('content', colorAntes)
    }
  }, [])

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

  /* El DNI/NIE es OBLIGATORIO: hace falta para el alta, y pedirlo después por
     teléfono es una llamada más y una persona menos. Se comprueba la FORMA
     —8 cifras y letra, o X/Y/Z y 7 cifras y letra— y no la letra en sí: un NIE
     mal tecleado se corrige al llamar, pero rechazar uno bueno por una regla
     nuestra es perder a alguien que sí valía. */
  const dniOk = useMemo(() => {
    const v = (f.dni || '').replace(/[\s-]/g, '').toUpperCase()
    return /^\d{8}[A-Z]$/.test(v) || /^[XYZ]\d{7}[A-Z]$/.test(v)
  }, [f.dni])

  const paso1Listo = f.nombre.trim().length >= 3
    && f.telefono.replace(/\D/g, '').length >= 9 && dniOk

  const enviar = async (e) => {
    e.preventDefault()
    if (!f.disponibilidad) { setError('Dinos cuándo puedes empezar.'); return }
    if (!f.consiento) { setError('Acepta que guardemos tus datos para poder enviar la candidatura.'); return }
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('datos', JSON.stringify({ ...f, respuestas: resp, edad, origen: params.get('de') || 'directo' }))
      if (cv) fd.append('cv', cv, cv.name)
      await http.post(`/empleo/publica/${encodeURIComponent(slug)}/${encodeURIComponent(ofertaSlug)}`, fd)
      setHecho(true); setError('')
    } catch (err) {
      setError(err?.response?.data?.detail || 'No hemos podido enviar tu candidatura. Inténtalo otra vez.')
    } finally { setEnviando(false) }
  }

  if (cargando) {
    return <div className="flex min-h-screen items-center justify-center bg-white"><Loader2 className="animate-spin text-slate-400" /></div>
  }

  if (!oferta) {
    return (
      <Marco>
        <div className="py-20 text-center">
          <AlertTriangle className="mx-auto mb-3 text-amber-500" size={32} />
          <p className="text-[15px] text-slate-600">{error || 'Esta oferta ya no está disponible.'}</p>
        </div>
      </Marco>
    )
  }

  if (hecho) {
    return (
      <Marco>
        <div className="py-16 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="text-emerald-600" size={34} />
          </div>
          <h1 className="text-[22px] font-bold text-slate-900">¡Listo! Ya la tenemos</h1>
          <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-slate-600">
            Gracias{f.nombre ? `, ${f.nombre.split(' ')[0]}` : ''}. Tu candidatura la revisa
            una persona, no un robot. Si encajas te llamamos al{' '}
            <b className="text-slate-900">{f.telefono}</b>.
          </p>
          <p className="mt-8 text-[12px] text-slate-400">
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
      <div className="pb-7">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500">
            <Package size={20} className="text-white" />
          </div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-600">
            Reparto de paquetería
          </div>
        </div>
        <h1 className="text-[28px] font-bold leading-[1.15] tracking-tight text-slate-900">{oferta.titulo}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {oferta.ciudad && <Etiqueta icon={MapPin}>{oferta.ciudad}</Etiqueta>}
          {oferta.jornada && <Etiqueta icon={Clock}>{oferta.jornada}</Etiqueta>}
          {oferta.salario && <Etiqueta icon={Euro}>{oferta.salario}</Etiqueta>}
        </div>

        {/* Lo que de verdad quiere saber quien se está pensando apuntarse. */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Ventaja icon={Truck} titulo="Furgoneta" pie="La pone la empresa" />
          <Ventaja icon={CalendarCheck} titulo="Turno fijo" pie="Sabes tu horario" />
          <Ventaja icon={Users} titulo="Con equipo" pie="No vas solo" />
        </div>

        {oferta.descripcion && (
          <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{oferta.descripcion}</p>
        )}
        {oferta.requisitos && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Qué pedimos</div>
            <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-slate-700">{oferta.requisitos}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span className="min-w-0">{error}</span>
        </div>
      )}

      {/* ── El formulario ─────────────────────────────────────────────── */}
      <form onSubmit={enviar} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-2">
          <Punto n={1} activo={paso === 1} hecho={paso > 1}>Tus datos</Punto>
          <div className="h-px flex-1 bg-slate-200" />
          <Punto n={2} activo={paso === 2}>Tu experiencia</Punto>
        </div>

        {paso === 1 ? (
          <div className="space-y-4">
            <Campo label="Nombre y apellidos" value={f.nombre} onChange={(v) => set('nombre', v)} required autoComplete="name" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Teléfono" value={f.telefono} onChange={(v) => set('telefono', v)} required type="tel" autoComplete="tel" pista="Te llamamos aquí" />
              <Campo label="DNI o NIE" value={f.dni} onChange={(v) => set('dni', v.toUpperCase())} required
                placeholder="12345678A"
                pista={f.dni && !dniOk ? 'Revísalo' : 'Para el alta'}
                mal={!!f.dni && !dniOk} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Ciudad" value={f.ciudad} onChange={(v) => set('ciudad', v)} autoComplete="address-level2" pista="Opcional" />
              <Campo label="Correo" value={f.email} onChange={(v) => set('email', v)} type="email" autoComplete="email" pista="Opcional" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Fecha de nacimiento" value={f.nacimiento} onChange={(v) => set('nacimiento', v)} type="date"
                pista={edad ? `${edad} años` : 'Opcional'} />
              <Campo label="Carnet B desde" value={f.carnet_desde} onChange={(v) => set('carnet_desde', v)} placeholder="2019" pista="El año" />
            </div>
            <button type="button" disabled={!paso1Listo} onClick={() => { setError(''); setPaso(2) }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 text-[16px] font-semibold text-white transition hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400">
              Continuar <ChevronRight size={17} />
            </button>
            {!paso1Listo && (
              <p className="text-center text-[12.5px] text-slate-500">
                Nombre, teléfono y DNI para seguir. El DNI hace falta para el alta.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-[15px] font-medium text-slate-800">
                ¿Cuándo puedes empezar? <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {CUANDO.map((o) => (
                  <Opcion key={o} activa={f.disponibilidad === o} onClick={() => set('disponibilidad', o)}>{o}</Opcion>
                ))}
              </div>
            </div>

            <Campo label="Experiencia repartiendo" value={f.experiencia} onChange={(v) => set('experiencia', v)} placeholder="2 años, o ninguna" pista="Opcional" />

            {preguntas.map((p) => (
              <div key={p.id}>
                <label className="mb-2 block text-[15px] font-medium text-slate-800">
                  {p.texto} {p.obligatoria && <span className="text-red-500">*</span>}
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
                    <p className="mt-2 text-[12.5px] text-slate-500">Marca todas las que valgan.</p>
                  </>
                )}
                {(p.tipo === 'texto' || p.tipo === 'numero') && (
                  <input value={resp[p.id] || ''} onChange={(e) => setResp((r) => ({ ...r, [p.id]: e.target.value }))}
                    inputMode={p.tipo === 'numero' ? 'numeric' : 'text'}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" />
                )}
              </div>
            ))}

            {/* El CV es opcional a propósito: pedirlo obligatorio deja fuera a
                media plantilla de reparto, que no tiene uno hecho. */}
            <div>
              <label className="mb-2 block text-[15px] font-medium text-slate-800">
                Currículum <span className="font-normal text-slate-400">· opcional</span>
              </label>
              {cv ? (
                <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-3 text-[14px] text-orange-800">
                  <Paperclip size={15} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{cv.name}</span>
                  <button type="button" onClick={() => setCv(null)} aria-label="Quitar el currículum" className="shrink-0 text-orange-500 hover:text-orange-700">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-3.5 py-4 text-[14px] text-slate-500 hover:border-orange-400 hover:text-orange-600">
                  <Paperclip size={16} /> Adjuntar PDF o foto
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

            <label className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-[13px] leading-relaxed text-slate-600">
              <input type="checkbox" checked={f.consiento} onChange={(e) => set('consiento', e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-orange-500" />
              <span>
                Acepto que guardéis mis datos <b className="text-slate-800">12 meses</b> para este
                proceso de selección. Puedo pedir que los borréis cuando quiera.
              </span>
            </label>

            <div className="flex gap-2">
              <button type="button" onClick={() => setPaso(1)}
                className="rounded-xl border border-slate-300 px-5 py-3.5 text-[16px] font-medium text-slate-600">
                Atrás
              </button>
              <button type="submit" disabled={enviando}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 text-[16px] font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60">
                {enviando && <Loader2 size={17} className="animate-spin" />} Enviar candidatura
              </button>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-slate-500">
              <ShieldCheck size={13} className="text-emerald-600" /> Tus datos no se comparten con nadie más.
            </p>
          </div>
        )}
      </form>

      <p className="mt-6 text-center text-[12px] text-slate-400">
        Gestionado con FlotaDSP
      </p>
    </Marco>
  )
}

/* Fondo claro y una franja de color arriba: el candidato mira esto treinta
   segundos en la calle, no ocho horas en una oficina. */
function Marco({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="h-1.5 w-full bg-orange-500" />
      <div className="mx-auto w-full max-w-xl px-4 py-7 sm:py-10">{children}</div>
    </div>
  )
}

function Etiqueta({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13.5px] font-medium text-slate-700">
      <Icon size={14} className="text-slate-400" /> {children}
    </span>
  )
}

function Ventaja({ icon: Icon, titulo, pie }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
      <Icon size={18} className="mx-auto text-orange-500" />
      <div className="mt-1.5 text-[13px] font-semibold text-slate-800">{titulo}</div>
      <div className="text-[11.5px] leading-tight text-slate-500">{pie}</div>
    </div>
  )
}

function Punto({ n, activo, hecho, children }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ${
        hecho ? 'bg-emerald-100 text-emerald-700' : activo ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
        {hecho ? '✓' : n}
      </span>
      <span className={`text-[12.5px] font-semibold ${activo ? 'text-slate-900' : 'text-slate-400'}`}>{children}</span>
    </span>
  )
}

function Opcion({ activa, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-[15px] font-medium transition ${
        activa
          ? 'bg-orange-500 text-white'
          : 'border border-slate-300 bg-white text-slate-700 hover:border-orange-400'}`}>
      {children}
    </button>
  )
}

function Campo({ label, value, onChange, required, type = 'text', placeholder, autoComplete, pista, mal }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-[15px] font-medium text-slate-800">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {pista && <span className={`shrink-0 text-[12px] ${mal ? 'text-red-500' : 'text-slate-400'}`}>{pista}</span>}
      </div>
      {/* 16 px como mínimo: por debajo, Safari en iPhone hace zoom al enfocar
          el campo y descoloca la página entera. */}
      <input value={value} onChange={(e) => onChange(e.target.value)} type={type}
        required={required} placeholder={placeholder} autoComplete={autoComplete}
        className={`w-full rounded-xl border bg-white px-3.5 py-3 text-base text-slate-900 placeholder-slate-400 outline-none focus:ring-2 ${
          mal ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-300 focus:border-orange-500 focus:ring-orange-100'}`} />
    </div>
  )
}
