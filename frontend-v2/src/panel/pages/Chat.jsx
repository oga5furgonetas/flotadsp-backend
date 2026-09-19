import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT, LANG_LOCALE } from '../../i18n'
import { Loader2, Send, MessageSquare, CheckSquare, Trash2, Users } from 'lucide-react'
import { getChat, postChat, chatToChecklist, deleteChatMessage,
         getMensajesGente, getMensajesCon, postMensaje } from '../api'
import { getAdmin, isSuperAdmin } from '../auth'

const POLL_MS = 7000
const POLL_GENTE_MS = 20000

/* La foto de quien escribe, y si no tiene, sus iniciales. El color sale del
   nombre, asi que cada persona tiene SIEMPRE el mismo y se reconoce de un
   vistazo sin leer. */
const TONOS = ['bg-brand-500/25 text-brand-200', 'bg-emerald-500/20 text-emerald-200',
               'bg-amber-500/20 text-amber-200', 'bg-sky-500/20 text-sky-200',
               'bg-fuchsia-500/20 text-fuchsia-200', 'bg-rose-500/20 text-rose-200']

function iniciales(nombre) {
  const p = String(nombre || '?').trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'
}

function tonoDe(nombre) {
  let n = 0
  for (const c of String(nombre || '')) n = (n + c.charCodeAt(0)) % TONOS.length
  return TONOS[n]
}

function Avatar({ nombre, foto, size = 28, punto = null }) {
  const s = { width: size, height: size }
  return (
    <span className="relative inline-block shrink-0" style={s}>
      {foto ? (
        <img src={foto} alt="" style={s} className="rounded-full object-cover" />
      ) : (
        <span style={s}
          className={`flex items-center justify-center rounded-full text-[10px] font-semibold ${tonoDe(nombre)}`}>
          {iniciales(nombre)}
        </span>
      )}
      {punto !== null && (
        <span title={punto ? 'Conectado ahora' : 'No está delante'}
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-dark-900 ${
            punto ? 'bg-emerald-400' : 'bg-dark-600'}`} />
      )}
    </span>
  )
}

export default function Chat() {
  const { center, centers } = useOutletContext()
  const { t, lang } = useT()
  const me = getAdmin()
  const sa = isSuperAdmin()
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [gente, setGente] = useState([])
  // null = la sala del centro; con id = conversacion privada con esa persona.
  const [conId, setConId] = useState(null)
  const [con, setCon] = useState(null)
  const lastIdRef = useRef(null)
  const bottomRef = useRef(null)
  const noCenter = center === 'Todos'

  function fmtTime(s) {
    if (!s) return ''
    const d = new Date(s)
    if (isNaN(d)) return ''
    return d.toLocaleTimeString(LANG_LOCALE[lang], { hour: '2-digit', minute: '2-digit' })
  }

  const cargarGente = useCallback(async () => {
    try {
      const r = await getMensajesGente()
      setGente(r.data?.gente || [])
    } catch { /* la lista de gente no puede tumbar el chat */ }
  }, [])

  useEffect(() => { cargarGente() }, [cargarGente])
  useEffect(() => {
    const iv = setInterval(cargarGente, POLL_GENTE_MS)
    return () => clearInterval(iv)
  }, [cargarGente])

  const load = useCallback(async () => {
    if (conId) {
      try {
        const r = await getMensajesCon(conId)
        setMsgs((r.data?.mensajes || []).map((m) => ({
          id: m.id, text: m.texto, author_id: m.de, author_name: m.de_nombre,
          created_at: m.creado_en, privado: true,
        })))
        setCon(r.data?.con || null)
        setErr('')
      } catch (e) {
        setErr(e?.response?.data?.detail || 'Sin conexión')
      }
      setLoading(false)
      return
    }
    if (noCenter) return
    try {
      const r = await getChat(center)
      const arr = r.data?.messages || []
      setMsgs(arr)
      if (arr.length > 0) lastIdRef.current = arr[arr.length - 1].id
      setErr('')
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Sin conexión')
    }
    setLoading(false)
  }, [center, noCenter, conId])

  useEffect(() => { setMsgs([]); lastIdRef.current = null; setLoading(true); load() }, [center, conId, load])
  useEffect(() => {
    if (noCenter && !conId) return
    const iv = setInterval(load, POLL_MS)
    return () => clearInterval(iv)
  }, [load, noCenter, conId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  async function send(e) {
    e?.preventDefault()
    if (!text.trim() || sending) return
    setSending(true); setErr('')
    try {
      if (conId) {
        const r = await postMensaje(conId, text.trim())
        const m = r.data.mensaje
        setMsgs((arr) => [...arr, { id: m.id, text: m.texto, author_id: m.de,
                                    author_name: m.de_nombre, created_at: m.creado_en, privado: true }])
      } else {
        const r = await postChat(center, text.trim())
        setMsgs((m) => [...m, r.data.message])
        lastIdRef.current = r.data.message.id
      }
      setText('')
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo enviar.')
    }
    setSending(false)
  }

  async function pinToChecklist(m) {
    try {
      await chatToChecklist(center, m.id)
      setMsgs((arr) => arr.map((x) => x.id === m.id ? { ...x, pinned_to_checklist: true } : x))
    } catch (e) {
      alert(e?.response?.data?.detail || 'No se pudo pinear a checklist')
    }
  }

  async function removeMessage(m) {
    if (!confirm('¿Borrar este mensaje para todos?')) return
    try {
      await deleteChatMessage(center, m.id)
      setMsgs((arr) => arr.filter((x) => x.id !== m.id))
    } catch (e) {
      alert(e?.response?.data?.detail || 'No se pudo borrar el mensaje')
    }
  }

  function abrirPrivado(p) {
    setConId(p.id)
    setCon({ id: p.id, nombre: p.nombre, foto: p.foto })
    setGente((g) => g.map((x) => x.id === p.id ? { ...x, sin_leer: 0 } : x))
  }

  const enLinea = gente.filter((g) => g.en_linea).length
  const salaBloqueada = noCenter && !conId

  const listaGente = (
    <aside className="card flex w-full shrink-0 flex-col p-0 md:w-60">
      <div className="flex items-center gap-2 border-b border-dark-800 px-3 py-2.5">
        <Users size={14} className="text-brand-400" />
        <span className="text-xs font-semibold text-dark-200">Tu equipo</span>
        <span className="ml-auto text-[11px] text-dark-500">
          {enLinea > 0 ? `${enLinea} conectad${enLinea === 1 ? 'o' : 'os'}` : 'nadie ahora'}
        </span>
      </div>
      <button onClick={() => { setConId(null); setCon(null) }}
        className={`flex items-center gap-2 border-b border-dark-800 px-3 py-2.5 text-left text-sm transition ${
          !conId ? 'bg-brand-500/10 text-brand-200' : 'text-dark-200 hover:bg-dark-800/60'}`}>
        <MessageSquare size={15} />
        <span className="truncate">Sala de {noCenter ? '—' : center}</span>
      </button>
      <div className="max-h-56 overflow-y-auto md:max-h-none md:flex-1">
        {gente.length === 0 ? (
          <p className="px-3 py-4 text-[11px] leading-relaxed text-dark-500">
            Aquí sale el resto de tu empresa. Todavía no hay nadie más dado de alta.
          </p>
        ) : gente.map((p) => (
          <button key={p.id} onClick={() => abrirPrivado(p)}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${
              conId === p.id ? 'bg-brand-500/10' : 'hover:bg-dark-800/60'}`}>
            <Avatar nombre={p.nombre} foto={p.foto} punto={p.en_linea} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-dark-100">{p.nombre}</span>
              <span className="block text-[10px] text-dark-500">
                {p.en_linea ? 'conectado ahora'
                  : p.hace_min == null ? 'sin entrar todavía'
                  : p.hace_min < 60 ? `hace ${p.hace_min} min`
                  : `hace ${Math.floor(p.hace_min / 60)} h`}
              </span>
            </span>
            {p.sin_leer > 0 && (
              <span className="min-w-[20px] rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white">
                {p.sin_leer}
              </span>
            )}
          </button>
        ))}
      </div>
    </aside>
  )

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-5xl flex-col gap-3 md:flex-row">
      {listaGente}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex items-center gap-2">
          {con && <Avatar nombre={con.nombre} foto={con.foto} size={32} />}
          <div className="min-w-0">
            <h1 className="rise truncate font-display text-[clamp(20px,2.4vw,30px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">
              {con ? con.nombre : t('chat.title')}
              {!con && !noCenter && <span className="text-dark-600"> · {center}</span>}
            </h1>
            <p className="text-xs text-dark-500">
              {con ? 'Conversación privada: solo la veis vosotros dos.'
                : noCenter ? t('chat.center.hint')
                : t('chat.visibility').replace('{center}', center)}
            </p>
          </div>
        </div>

        {err && <div className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>}

        <div className="flex-1 overflow-y-auto rounded-lg border border-dark-800 bg-dark-900 p-3">
          {salaBloqueada ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <MessageSquare size={26} className="text-brand-400" />
              <p className="text-sm text-dark-200">{t('chat.center.hint')}</p>
              <p className="text-xs text-dark-500">Disponibles: {centers?.join(' · ') || '—'}</p>
              <p className="text-xs text-dark-500">Los mensajes privados sí funcionan sin elegir centro.</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-dark-500">
              <Loader2 className="animate-spin" size={14} /> {t('ui.loading')}
            </div>
          ) : msgs.length === 0 ? (
            <div className="py-12 text-center text-sm text-dark-500">
              {con ? `Todavía no os habéis escrito. Escríbele algo a ${con.nombre}.` : t('chat.empty')}
            </div>
          ) : (
            <div className="space-y-2">
              {msgs.map((m) => {
                const mine = m.author_id === me?.id
                const foto = mine ? (me?.photo_url || '') : (m.author_photo || con?.foto || '')
                return (
                  <div key={m.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                    {!mine && <Avatar nombre={m.author_name} foto={foto} size={26} />}
                    <div className={`group max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                      mine ? 'bg-brand-500/20 text-brand-100' : 'bg-dark-800 text-dark-100'}`}>
                      {!mine && (
                        <div className="mb-0.5 text-[11px] font-semibold text-brand-300">{m.author_name}</div>
                      )}
                      <div className="whitespace-pre-wrap break-words">{m.text}</div>
                      <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-dark-400">
                        {m.pinned_to_checklist && (
                          <span className="flex items-center gap-0.5 text-emerald-400">
                            <CheckSquare size={10} /> {t('chat.in.checklist')}
                          </span>
                        )}
                        <span>{fmtTime(m.created_at)}</span>
                        {!m.privado && sa && !m.pinned_to_checklist && (
                          <button onClick={() => pinToChecklist(m)}
                            className="opacity-0 transition group-hover:opacity-100 hover:text-emerald-300"
                            title="Convertir a tarea de checklist">
                            <CheckSquare size={11} />
                          </button>
                        )}
                        {!m.privado && (mine || sa) && (
                          <button onClick={() => removeMessage(m)}
                            className="opacity-0 transition group-hover:opacity-100 hover:text-red-300"
                            title="Borrar mensaje">
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                    {mine && <Avatar nombre={m.author_name} foto={foto} size={26} />}
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <form onSubmit={send} className="mt-3 flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)}
            placeholder={con ? `Escribe a ${con.nombre}…` : t('chat.placeholder')}
            className="input flex-1" maxLength={2000} disabled={salaBloqueada} />
          <button disabled={!text.trim() || sending || salaBloqueada}
            className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {t('chat.send')}
          </button>
        </form>
      </div>
    </div>
  )
}
