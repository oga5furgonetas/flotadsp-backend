import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT, LANG_LOCALE } from '../../i18n'
import { Loader2, Send, MessageSquare, CheckSquare, Bell, BellOff, Trash2 } from 'lucide-react'
import { getChat, postChat, chatToChecklist, deleteChatMessage } from '../api'
import { getAdmin, isSuperAdmin } from '../auth'
import { pushSupported, isPushEnabled, enablePush, disablePush } from '../../lib/push'

const POLL_MS = 7000

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
  const [notif, setNotif] = useState(false)          // ¿este dispositivo tiene push activo?
  const [notifBusy, setNotifBusy] = useState(false)
  const canPush = pushSupported()
  const lastIdRef = useRef(null)
  const bottomRef = useRef(null)
  const noCenter = center === 'Todos'

  // Refleja el estado real de la suscripción push al abrir el chat
  useEffect(() => { isPushEnabled().then(setNotif).catch(() => {}) }, [])

  function fmtTime(s) {
    if (!s) return ''
    const d = new Date(s)
    if (isNaN(d)) return ''
    return d.toLocaleTimeString(LANG_LOCALE[lang], { hour: '2-digit', minute: '2-digit' })
  }

  const load = useCallback(async () => {
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
  }, [center, noCenter])

  useEffect(() => { setMsgs([]); lastIdRef.current = null; setLoading(true); load() }, [center, load])
  useEffect(() => {
    if (noCenter) return
    const iv = setInterval(load, POLL_MS)
    return () => clearInterval(iv)
  }, [load, noCenter])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  async function send(e) {
    e?.preventDefault()
    if (!text.trim() || sending) return
    setSending(true); setErr('')
    try {
      const r = await postChat(center, text.trim())
      setMsgs((m) => [...m, r.data.message])
      lastIdRef.current = r.data.message.id
      setText('')
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo enviar.')
    }
    setSending(false)
  }

  async function toggleNotif() {
    if (notifBusy) return
    setNotifBusy(true); setErr('')
    try {
      if (notif) {
        await disablePush()
        setNotif(false)
      } else {
        const r = await enablePush()
        if (r === 'ok') setNotif(true)
        else if (r === 'denied') setErr(t('push.denied'))
        else if (r === 'unsupported') setErr(t('push.unsupported'))
        else if (r === 'server-disabled') setErr(t('push.error'))
        else setErr(t('push.error'))
      }
    } finally { setNotifBusy(false) }
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

  if (noCenter) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="rise mb-5 font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">{t('chat.title')}</h1>
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <MessageSquare size={28} className="text-brand-400" />
          <p className="text-dark-200">{t('chat.center.hint')}</p>
          <p className="text-sm text-dark-500">Disponibles: {centers?.join(' · ') || '—'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-3xl flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="rise font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">{t('chat.title')} <span className="text-dark-600">· {center}</span></h1>
          <p className="text-xs text-dark-500">{t('chat.visibility').replace('{center}', center)}</p>
        </div>
        {canPush && (
          <button onClick={toggleNotif} disabled={notifBusy}
            title={t('push.hint')}
            className={`btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-50 ${notif ? 'text-emerald-400' : 'text-dark-400'}`}>
            {notifBusy ? <Loader2 size={14} className="animate-spin" /> : notif ? <Bell size={14} /> : <BellOff size={14} />}
            {notif ? t('chat.notif.on') : t('chat.notif.off')}
          </button>
        )}
      </div>

      {err && <div className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>}

      <div className="flex-1 overflow-y-auto rounded-lg border border-dark-800 bg-dark-900 p-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-dark-500"><Loader2 className="animate-spin" size={14} /> {t('ui.loading')}</div>
        ) : msgs.length === 0 ? (
          <div className="py-12 text-center text-sm text-dark-500">{t('chat.empty')}</div>
        ) : (
          <div className="space-y-2">
            {msgs.map((m) => {
              const mine = m.author_id === me?.id
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`group max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'bg-brand-500/20 text-brand-100' : 'bg-dark-800 text-dark-100'}`}>
                    <div className={`mb-0.5 text-[11px] font-semibold ${mine ? 'text-brand-200' : 'text-brand-300'}`}>{m.author_name}{mine ? ` ${t('chat.you')}` : ''}</div>
                    <div className="whitespace-pre-wrap break-words">{m.text}</div>
                    <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-dark-400">
                      {m.pinned_to_checklist && <span className="flex items-center gap-0.5 text-emerald-400"><CheckSquare size={10} /> {t('chat.in.checklist')}</span>}
                      <span>{fmtTime(m.created_at)}</span>
                      {sa && !m.pinned_to_checklist && (
                        <button onClick={() => pinToChecklist(m)} className="opacity-0 transition group-hover:opacity-100 hover:text-emerald-300" title="Convertir a tarea de checklist">
                          <CheckSquare size={11} />
                        </button>
                      )}
                      {(mine || sa) && (
                        <button onClick={() => removeMessage(m)} className="opacity-0 transition group-hover:opacity-100 hover:text-red-300" title="Borrar mensaje">
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('chat.placeholder')}
          className="input flex-1" maxLength={2000} />
        <button disabled={!text.trim() || sending} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {t('chat.send')}
        </button>
      </form>
    </div>
  )
}
