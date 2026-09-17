import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, Loader2, X, Check, Car, UserPlus } from 'lucide-react'
import { getAiHistorial, enviarMensajeIA, ejecutarAccionIA } from './api'

/* FLOTADSP AI — burbuja de ayuda flotante, abajo a la derecha, como los
   widgets de soporte de cualquier web grande (Intercom, Drift...): se ve
   siempre, ocupa poco cerrada, y se abre un poco al tocarla. Pedido así
   explícitamente el 17-09-2026, en vez de una pantalla propia en el menú.

   Contesta "cómo se hace X" y "cómo va mi WHC/DNR/Empleo" con datos EN VIVO
   del centro elegido (nunca inventados), y puede PROPONER crear un vehículo
   o un conductor — nunca lo hace sola: hace falta un clic de confirmación,
   que pasa por las mismas comprobaciones que el formulario normal. */

const ETIQUETA_ACCION = {
  crear_vehiculo: { icon: Car, titulo: 'Crear vehículo' },
  crear_conductor: { icon: UserPlus, titulo: 'Crear conductor' },
}
const CAMPO_LABEL = {
  license_plate: 'Matrícula', brand: 'Marca', model: 'Modelo', color: 'Color', vin: 'VIN',
  name: 'Nombre', phone: 'Teléfono', email: 'Correo', dni: 'DNI',
}
const TONO_CLS = {
  ok: 'bg-emerald-500/10 text-emerald-300',
  aviso: 'bg-amber-500/10 text-amber-300',
  alerta: 'bg-red-500/10 text-red-300',
  neutro: 'bg-dark-800 text-dark-300',
}

function Tarjeta({ t }) {
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-dark-700">
      <div className="border-b border-dark-700 bg-dark-800/60 px-2.5 py-1.5 text-[11px] font-semibold text-dark-300">{t.titulo}</div>
      <div className="divide-y divide-dark-800">
        {t.filas.map((f, i) => (
          <div key={i} className="flex items-center justify-between px-2.5 py-1.5 text-[12px]">
            <span className="text-dark-400">{f.etiqueta}</span>
            <span className={`cifra rounded px-1.5 py-0.5 font-bold ${TONO_CLS[f.tono] || TONO_CLS.neutro}`}>{f.valor}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AsistenteBurbuja({ center, centers }) {
  const [abierto, setAbierto] = useState(false)
  const [msgs, setMsgs] = useState([])
  const [cargado, setCargado] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [err, setErr] = useState('')
  const [ejecutando, setEjecutando] = useState(null)
  const bottomRef = useRef(null)
  const sinCentro = !center || center === 'Todos'

  useEffect(() => {
    if (!abierto || sinCentro || cargado) return
    getAiHistorial(center)
      .then((r) => setMsgs((r.data?.mensajes || []).map((m) => ({
        rol: m.rol, texto: m.texto, accion_propuesta: m.accion_propuesta, tarjeta: m.tarjeta,
      }))))
      .catch(() => setMsgs([]))
      .finally(() => setCargado(true))
  }, [abierto, center, sinCentro, cargado])

  // Cambiar de centro reinicia la conversación mostrada: no tiene sentido
  // seguir leyendo el WHC de OGA5 con DGA1 ya seleccionado.
  useEffect(() => { setMsgs([]); setCargado(false) }, [center])

  useEffect(() => { if (abierto) bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, enviando, abierto])

  async function enviar(e) {
    e?.preventDefault()
    const mensaje = texto.trim()
    if (!mensaje || enviando) return
    setTexto(''); setErr(''); setEnviando(true)
    setMsgs((m) => [...m, { rol: 'usuario', texto: mensaje }])
    try {
      const { data } = await enviarMensajeIA(mensaje, center)
      setMsgs((m) => [...m, { rol: 'asistente', texto: data.respuesta, accion_propuesta: data.accion_propuesta, tarjeta: data.tarjeta }])
    } catch (e) {
      setErr(e?.response?.data?.detail || 'El asistente no ha podido responder.')
    } finally { setEnviando(false) }
  }

  async function confirmar(idx, accion) {
    setEjecutando(idx)
    try {
      const { data } = await ejecutarAccionIA(accion.tipo, accion.campos, center)
      setMsgs((m) => m.map((x, i) => i === idx ? { ...x, accion_propuesta: null, resultado: data.creado } : x))
    } catch (e) {
      setMsgs((m) => m.map((x, i) => i === idx
        ? { ...x, error_accion: e?.response?.data?.detail || 'No se pudo completar.' } : x))
    } finally { setEjecutando(null) }
  }

  function cancelar(idx) {
    setMsgs((m) => m.map((x, i) => i === idx ? { ...x, accion_propuesta: null, cancelada: true } : x))
  }

  return (
    <div className="fixed bottom-4 right-4 z-[95] flex flex-col items-end">
      {abierto && (
        <div className="mb-3 flex h-[32rem] w-[23rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-dark-700 bg-dark-950 shadow-2xl">
          <div className="flex items-center justify-between border-b border-dark-800 bg-dark-900/80 px-3.5 py-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-brand-400" />
              <div className="text-[13px] font-bold text-dark-100">FlotaDSP AI</div>
              {!sinCentro && <span className="cifra text-[11px] text-dark-500">· {center}</span>}
            </div>
            <button onClick={() => setAbierto(false)} className="text-dark-500 hover:text-dark-200"><X size={16} /></button>
          </div>

          {sinCentro ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <Sparkles size={22} className="text-brand-400" />
              <p className="text-[12.5px] text-dark-300">Elige un centro arriba para hablar con el asistente de esa nave.</p>
              <p className="text-[11px] text-dark-500">Disponibles: {centers?.join(' · ') || '—'}</p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-2.5">
                {msgs.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
                    <p className="text-[12.5px] text-dark-400">Pregúntame cómo se hace algo, cómo va tu WHC, o pídeme que cree un vehículo o un conductor.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {msgs.map((m, i) => {
                      const mia = m.rol === 'usuario'
                      const acc = m.accion_propuesta ? ETIQUETA_ACCION[m.accion_propuesta.tipo] : null
                      return (
                        <div key={i} className={`flex ${mia ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[88%] rounded-xl px-3 py-2 text-[12.5px] ${mia ? 'bg-brand-500/20 text-brand-100' : 'bg-dark-800 text-dark-100'}`}>
                            <div className="whitespace-pre-wrap break-words">{m.texto}</div>
                            {m.tarjeta && <Tarjeta t={m.tarjeta} />}
                            {acc && (
                              <div className="mt-2 rounded-lg border border-dark-700 bg-dark-900/70 p-2">
                                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-dark-200">
                                  <acc.icon size={12} className="text-brand-400" /> {acc.titulo}
                                </div>
                                <div className="mb-1.5 space-y-0.5 text-[11px] text-dark-400">
                                  {Object.entries(m.accion_propuesta.campos).filter(([, v]) => v).map(([k, v]) => (
                                    <div key={k}>{CAMPO_LABEL[k] || k}: <span className="text-dark-200">{v}</span></div>
                                  ))}
                                </div>
                                <div className="flex gap-1.5">
                                  <button onClick={() => confirmar(i, m.accion_propuesta)} disabled={ejecutando === i}
                                    className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50">
                                    {ejecutando === i ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Confirmar
                                  </button>
                                  <button onClick={() => cancelar(i)} disabled={ejecutando === i}
                                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-dark-400 ring-1 ring-dark-700 hover:text-dark-200 disabled:opacity-50">
                                    <X size={11} /> Cancelar
                                  </button>
                                </div>
                              </div>
                            )}
                            {m.resultado && (
                              <div className="mt-1.5 rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300">
                                ✅ Creado{m.resultado.license_plate ? `: ${m.resultado.license_plate}` : m.resultado.name ? `: ${m.resultado.name}` : ''}
                              </div>
                            )}
                            {m.error_accion && <div className="mt-1.5 rounded-lg bg-red-500/10 px-2 py-1 text-[11px] text-red-300">{m.error_accion}</div>}
                            {m.cancelada && <div className="mt-1 text-[10.5px] text-dark-500">Descartado.</div>}
                          </div>
                        </div>
                      )
                    })}
                    {enviando && (
                      <div className="flex justify-start">
                        <div className="rounded-xl bg-dark-800 px-3 py-2 text-[12px] text-dark-400">
                          <Loader2 size={12} className="inline animate-spin" /> Pensando…
                        </div>
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </div>
                )}
              </div>
              {err && <div className="mx-2.5 mb-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">{err}</div>}
              <form onSubmit={enviar} className="flex gap-1.5 border-t border-dark-800 p-2.5">
                <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe tu pregunta…"
                  className="input flex-1 text-[12.5px]" maxLength={2000} />
                <button disabled={!texto.trim() || enviando} className="btn-primary flex items-center justify-center px-2.5 disabled:opacity-50">
                  {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </form>
            </>
          )}
        </div>
      )}

      <button onClick={() => setAbierto((a) => !a)}
        title="FlotaDSP AI"
        className={`flex h-12 w-12 items-center justify-center rounded-full shadow-2xl transition ${
          abierto ? 'bg-dark-800 text-dark-200' : 'bg-brand-500 text-dark-950 hover:bg-brand-400'}`}>
        {abierto ? <X size={20} /> : <Sparkles size={20} />}
      </button>
    </div>
  )
}
