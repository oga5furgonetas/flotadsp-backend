import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Send, Sparkles, Check, X, Car, UserPlus } from 'lucide-react'
import { getAiHistorial, enviarMensajeIA, ejecutarAccionIA } from '../api'

/* FLOTADSP AI — el asistente de cada centro.
   ══════════════════════════════════════════════════════════════════════
   Contesta "cómo se hace X" y "cómo va mi WHC/DNR/Empleo" con datos en
   vivo del centro elegido, y puede PROPONER crear un vehículo o un
   conductor — nunca lo hace sola. La propuesta sale como una tarjeta con
   Confirmar/Cancelar; solo al confirmar se llama a /ai/asistente/ejecutar,
   que pasa por las mismas comprobaciones que el formulario normal
   (matrícula duplicada, correo duplicado...). Sin eso, la IA podría meter
   una ficha mala sin que nadie la mirara antes. */

const ETIQUETA_ACCION = {
  crear_vehiculo: { icon: Car, titulo: 'Crear vehículo' },
  crear_conductor: { icon: UserPlus, titulo: 'Crear conductor' },
}

const CAMPO_LABEL = {
  license_plate: 'Matrícula', brand: 'Marca', model: 'Modelo', color: 'Color', vin: 'VIN',
  name: 'Nombre', phone: 'Teléfono', email: 'Correo', dni: 'DNI',
}

export default function AsistenteIA() {
  const { center, centers } = useOutletContext()
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [texto, setTexto] = useState('')
  const [err, setErr] = useState('')
  const [ejecutando, setEjecutando] = useState(null)
  const bottomRef = useRef(null)
  const sinCentro = center === 'Todos'

  useEffect(() => {
    if (sinCentro) { setLoading(false); return }
    setLoading(true)
    getAiHistorial(center)
      .then((r) => setMsgs((r.data?.mensajes || []).map((m) => ({
        rol: m.rol, texto: m.texto, accion_propuesta: m.accion_propuesta, hecha: m.rol === 'asistente' && !m.accion_propuesta,
      }))))
      .catch(() => setMsgs([]))
      .finally(() => setLoading(false))
  }, [center, sinCentro])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, enviando])

  async function enviar(e) {
    e?.preventDefault()
    const mensaje = texto.trim()
    if (!mensaje || enviando) return
    setTexto(''); setErr(''); setEnviando(true)
    setMsgs((m) => [...m, { rol: 'usuario', texto: mensaje }])
    try {
      const { data } = await enviarMensajeIA(mensaje, center)
      setMsgs((m) => [...m, { rol: 'asistente', texto: data.respuesta, accion_propuesta: data.accion_propuesta }])
    } catch (e) {
      setErr(e?.response?.data?.detail || 'El asistente no ha podido responder.')
    } finally { setEnviando(false) }
  }

  async function confirmar(idx, accion) {
    setEjecutando(idx)
    try {
      const { data } = await ejecutarAccionIA(accion.tipo, accion.campos, center)
      setMsgs((m) => m.map((x, i) => i === idx ? { ...x, accion_propuesta: null, hecha: true, resultado: data.creado } : x))
    } catch (e) {
      setMsgs((m) => m.map((x, i) => i === idx
        ? { ...x, error_accion: e?.response?.data?.detail || 'No se pudo completar.' } : x))
    } finally { setEjecutando(null) }
  }

  function cancelar(idx) {
    setMsgs((m) => m.map((x, i) => i === idx ? { ...x, accion_propuesta: null, cancelada: true } : x))
  }

  if (sinCentro) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="rise mb-5 font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">FlotaDSP AI</h1>
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <Sparkles size={28} className="text-brand-400" />
          <p className="text-dark-200">Elige un centro arriba para hablar con el asistente de esa nave.</p>
          <p className="text-sm text-dark-500">Disponibles: {centers?.join(' · ') || '—'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-3xl flex-col">
      <div className="mb-3">
        <h1 className="rise flex items-center gap-2 font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">
          <Sparkles size={22} className="text-brand-400" /> FlotaDSP AI <span className="text-dark-600">· {center}</span>
        </h1>
        <p className="text-xs text-dark-500">Pregúntale cómo se hace algo, cómo va tu WHC o tus DNR, o pídele que cree un vehículo o un conductor.</p>
      </div>

      {err && <div className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>}

      <div className="flex-1 overflow-y-auto rounded-lg border border-dark-800 bg-dark-900 p-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-dark-500"><Loader2 className="animate-spin" size={14} /> Cargando…</div>
        ) : msgs.length === 0 ? (
          <div className="py-12 text-center text-sm text-dark-500">
            Pregunta algo como «¿cómo va mi WHC?» o «créame el vehículo 4402LLL, blanca».
          </div>
        ) : (
          <div className="space-y-2">
            {msgs.map((m, i) => {
              const mia = m.rol === 'usuario'
              const acc = m.accion_propuesta ? ETIQUETA_ACCION[m.accion_propuesta.tipo] : null
              return (
                <div key={i} className={`flex ${mia ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${mia ? 'bg-brand-500/20 text-brand-100' : 'bg-dark-800 text-dark-100'}`}>
                    <div className="whitespace-pre-wrap break-words">{m.texto}</div>
                    {acc && (
                      <div className="mt-2.5 rounded-xl border border-dark-700 bg-dark-900/70 p-2.5">
                        <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-dark-200">
                          <acc.icon size={13} className="text-brand-400" /> {acc.titulo}
                        </div>
                        <div className="mb-2 space-y-0.5 text-[12px] text-dark-400">
                          {Object.entries(m.accion_propuesta.campos)
                            .filter(([, v]) => v)
                            .map(([k, v]) => (
                              <div key={k}>{CAMPO_LABEL[k] || k}: <span className="text-dark-200">{v}</span></div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => confirmar(i, m.accion_propuesta)} disabled={ejecutando === i}
                            className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[12px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50">
                            {ejecutando === i ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Confirmar
                          </button>
                          <button onClick={() => cancelar(i)} disabled={ejecutando === i}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] text-dark-400 ring-1 ring-dark-700 hover:text-dark-200 disabled:opacity-50">
                            <X size={12} /> Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                    {m.hecha && m.resultado && (
                      <div className="mt-2 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[12px] text-emerald-300">
                        ✅ Creado{m.resultado.license_plate ? `: ${m.resultado.license_plate}` : m.resultado.name ? `: ${m.resultado.name}` : ''}
                      </div>
                    )}
                    {m.error_accion && (
                      <div className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[12px] text-red-300">{m.error_accion}</div>
                    )}
                    {m.cancelada && (
                      <div className="mt-2 text-[11px] text-dark-500">Descartado.</div>
                    )}
                  </div>
                </div>
              )
            })}
            {enviando && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-dark-800 px-3.5 py-2 text-sm text-dark-400">
                  <Loader2 size={13} className="inline animate-spin" /> Pensando…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form onSubmit={enviar} className="mt-3 flex gap-2">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe tu pregunta…"
          className="input flex-1" maxLength={2000} />
        <button disabled={!texto.trim() || enviando} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Enviar
        </button>
      </form>
    </div>
  )
}
