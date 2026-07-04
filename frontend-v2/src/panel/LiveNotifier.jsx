import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { MessageSquare, CheckSquare, X } from 'lucide-react'
import { getChat, getChecklist } from './api'
import { getAdmin } from './auth'

/* ── Avisos EN VIVO dentro del panel (PC) ─────────────────────────────────────
   Con la app abierta en cualquier página: si alguien escribe en el chat de tu
   centro o añade una tarea al checklist, salta un popup + sonido sin tener que
   entrar a mirar. Complementa al push del móvil (que cubre la app cerrada). */

const POLL_MS = 25000
const MAX_CENTERS = 4

function ding() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55)
    o.start()
    o.frequency.setValueAtTime(1318, ctx.currentTime + 0.12) // "di-ding"
    o.stop(ctx.currentTime + 0.6)
    setTimeout(() => ctx.close().catch(() => {}), 900)
  } catch { /* sin audio no pasa nada */ }
}

export default function LiveNotifier({ center, centers }) {
  const nav = useNavigate()
  const loc = useLocation()
  const me = getAdmin()
  const [notes, setNotes] = useState([]) // {key, icon, title, body, to}
  const pathRef = useRef(loc.pathname)
  pathRef.current = loc.pathname

  function addNote(n) {
    setNotes((arr) => [...arr.filter((x) => x.key !== n.key), n].slice(-4))
    ding()
    setTimeout(() => setNotes((arr) => arr.filter((x) => x.key !== n.key)), 12000)
  }

  useEffect(() => {
    let stop = false
    const targets = () =>
      (center === 'Todos' ? (centers || []) : [center]).filter(Boolean).slice(0, MAX_CENTERS)

    async function tick() {
      const today = new Date().toISOString().slice(0, 10)
      for (const c of targets()) {
        // ── CHAT: ¿mensaje nuevo de otra persona? ──
        try {
          const r = await getChat(c)
          const msgs = r.data?.messages || []
          const last = msgs[msgs.length - 1]
          const k = `ln_chat_${c}`
          const stored = localStorage.getItem(k)
          if (last) {
            if (stored && last.id !== stored && last.author_id !== me?.id
                && !pathRef.current.startsWith('/panel/chat')) {
              addNote({
                key: `chat-${last.id}`, icon: 'chat',
                title: `💬 ${last.author_name} · ${c}`,
                body: (last.text || '').slice(0, 90),
                to: '/panel/chat',
              })
            }
            localStorage.setItem(k, last.id)
          }
        } catch { /* red caída: reintenta al siguiente tick */ }

        // ── CHECKLIST: ¿tarea nueva hoy? ──
        try {
          const r = await getChecklist(c, today)
          const ids = []
          let firstNewText = null
          const k = `ln_tasks_${c}_${today}`
          const stored = new Set(JSON.parse(localStorage.getItem(k) || '[]'))
          for (const shift of ['manana', 'tarde']) {
            for (const it of r.data?.[shift]?.items || []) {
              ids.push(it.id)
              if (stored.size > 0 && !stored.has(it.id) && !firstNewText) firstNewText = it.text
            }
          }
          if (firstNewText && !pathRef.current.startsWith('/panel/checklist')) {
            addNote({
              key: `task-${today}-${ids.length}`, icon: 'task',
              title: `📝 Nueva tarea · ${c}`,
              body: firstNewText.slice(0, 90),
              to: '/panel/checklist-operativo',
            })
          }
          localStorage.setItem(k, JSON.stringify(ids))
        } catch { /* siguiente tick */ }
      }
    }

    tick()
    const iv = setInterval(() => { if (!stop) tick() }, POLL_MS)
    return () => { stop = true; clearInterval(iv) }
  }, [center, centers]) // eslint-disable-line

  // Parpadeo del título de la pestaña mientras hay avisos sin atender
  useEffect(() => {
    if (notes.length === 0) return
    const base = 'FlotaDSP'
    let on = false
    const iv = setInterval(() => {
      document.title = on ? `🔔 Aviso — ${base}` : base
      on = !on
    }, 1200)
    return () => { clearInterval(iv); document.title = base }
  }, [notes.length])

  if (notes.length === 0) return null

  return (
    <div className="fixed bottom-20 right-4 z-[90] flex w-80 flex-col gap-2 md:bottom-4">
      {notes.map((n) => (
        <div key={n.key}
          className="animate-fade-in cursor-pointer rounded-xl border border-brand-500/30 bg-dark-900 p-3.5 shadow-2xl shadow-black/60 hover:border-brand-500/60"
          onClick={() => { setNotes((a) => a.filter((x) => x.key !== n.key)); nav(n.to) }}>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
              {n.icon === 'chat' ? <MessageSquare size={15} /> : <CheckSquare size={15} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-dark-50">{n.title}</div>
              <div className="mt-0.5 line-clamp-2 text-xs text-dark-400">{n.body}</div>
            </div>
            <button className="shrink-0 rounded p-1 text-dark-500 hover:text-white"
              onClick={(e) => { e.stopPropagation(); setNotes((a) => a.filter((x) => x.key !== n.key)) }}>
              <X size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
