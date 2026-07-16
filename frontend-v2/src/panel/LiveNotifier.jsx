import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { MessageSquare, CheckSquare, X, BellRing } from 'lucide-react'
import { getChat, getChecklist } from './api'
import { getAdmin } from './auth'

/* ── Avisos EN VIVO dentro del panel (PC) ─────────────────────────────────────
   Con la app abierta en cualquier página: si alguien escribe en el chat de tu
   centro o añade una tarea al checklist, salta un aviso GRANDE + campanilla.
   Diseñado para que quien está trabajando se entere SIEMPRE:
   · El aviso NO se cierra solo: hay que tocarlo (abre la página) o cerrarlo.
   · La campanilla se repite cada 25s mientras haya avisos sin atender.
   · El título de la pestaña parpadea con el número de avisos.
   · Los avisos sobreviven a un F5 (se guardan en localStorage).
   Complementa al push del móvil (que cubre la app cerrada). */

const POLL_MS = 25000
const MAX_CENTERS = 4
const PENDING_KEY = 'ln_pending'
const PENDING_TTL_MS = 12 * 3600 * 1000 // un aviso de hace >12h ya no es "en vivo"

/* Campanilla clara: arpegio ascendente con 2 osciladores por nota (más cuerpo
   que el "ding" anterior). times=2 al llegar el aviso, times=1 en recordatorios. */
function playChime(times = 2) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const notes = [659.25, 880, 1108.73] // E5 → A5 → C#6
    for (let r = 0; r < times; r++) {
      const base = ctx.currentTime + r * 0.75
      notes.forEach((f, i) => {
        const o = ctx.createOscillator()
        const o2 = ctx.createOscillator()
        const g = ctx.createGain()
        o.type = 'sine'; o.frequency.value = f
        o2.type = 'triangle'; o2.frequency.value = f * 2 // armónico: más presencia
        o.connect(g); o2.connect(g); g.connect(ctx.destination)
        const t = base + i * 0.16
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(0.4, t + 0.025)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
        o.start(t); o2.start(t)
        o.stop(t + 0.6); o2.stop(t + 0.6)
      })
    }
    setTimeout(() => ctx.close().catch(() => {}), times * 800 + 1200)
  } catch { /* sin audio no pasa nada */ }
}

function loadPending() {
  try {
    const arr = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')
    const now = Date.now()
    return Array.isArray(arr) ? arr.filter((n) => n?.key && now - (n.ts || 0) < PENDING_TTL_MS) : []
  } catch { return [] }
}

export default function LiveNotifier({ center, centers }) {
  const nav = useNavigate()
  const loc = useLocation()
  const me = getAdmin()
  // {key, icon, title, body, to, ts} — sobreviven a recargas de página
  const [notes, setNotes] = useState(loadPending)
  const pathRef = useRef(loc.pathname)
  pathRef.current = loc.pathname

  // Persistir pendientes: un F5 no borra un aviso que nadie ha atendido
  useEffect(() => {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(notes)) } catch { /* lleno */ }
  }, [notes])

  function addNote(n) {
    setNotes((arr) => [...arr.filter((x) => x.key !== n.key), { ...n, ts: Date.now() }].slice(-6))
    playChime(2)
    // Sin auto-cierre: el aviso queda en pantalla hasta que se toque o se cierre.
  }

  function dismiss(key) {
    setNotes((a) => a.filter((x) => x.key !== key))
  }

  // Entrar en la página del aviso = visto: se cierra solo (y deja de sonar).
  useEffect(() => {
    setNotes((a) => a.filter((n) => !loc.pathname.startsWith(n.to)))
  }, [loc.pathname])

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
                title: `${last.author_name} · ${c}`,
                body: (last.text || '').slice(0, 140),
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
              title: `Nueva tarea · ${c}`,
              body: firstNewText.slice(0, 140),
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

  const hasNotes = notes.length > 0

  // Recordatorio sonoro cada 25s mientras haya avisos sin atender — pero con
  // límite: 3 recordatorios y silencio. El aviso visual y el parpadeo del
  // título siguen ahí; la campanilla no puede ser un castigo eterno.
  useEffect(() => {
    if (!hasNotes) return
    let count = 0
    const iv = setInterval(() => {
      count += 1
      if (count > 3) { clearInterval(iv); return }
      playChime(1)
    }, 25000)
    return () => clearInterval(iv)
  }, [hasNotes])

  // Parpadeo del título de la pestaña con el número de avisos sin atender
  useEffect(() => {
    if (!hasNotes) return
    const base = 'FlotaDSP'
    let on = false
    const iv = setInterval(() => {
      document.title = on ? `🔔 (${notes.length}) Aviso — ${base}` : base
      on = !on
    }, 1200)
    return () => { clearInterval(iv); document.title = base }
  }, [hasNotes, notes.length])

  if (!hasNotes) return null

  return (
    <div className="fixed bottom-20 right-4 z-[90] flex w-[26rem] max-w-[calc(100vw-2rem)] flex-col gap-2.5 md:bottom-4">
      {notes.length > 1 && (
        <button
          onClick={() => setNotes([])}
          className="self-end rounded-lg border border-dark-700 bg-dark-900/95 px-3 py-1.5 text-xs font-semibold text-dark-300 hover:border-dark-500 hover:text-white"
        >
          Cerrar todos ({notes.length})
        </button>
      )}
      {notes.map((n) => (
        <div key={n.key}
          className="animate-fade-in cursor-pointer rounded-2xl border-2 border-brand-500/70 bg-gradient-to-br from-dark-900 to-dark-950 p-4 shadow-[0_8px_40px_rgba(0,0,0,.7),0_0_24px_rgba(249,115,22,.28)] transition-transform hover:scale-[1.02] hover:border-brand-400"
          onClick={() => { dismiss(n.key); nav(n.to) }}>
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/20 text-brand-300">
              {n.icon === 'chat' ? <MessageSquare size={20} /> : <CheckSquare size={20} />}
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-brand-500" />
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <BellRing size={13} className="shrink-0 animate-pulse text-brand-400" />
                <span className="truncate text-[15px] font-extrabold text-white">{n.title}</span>
              </div>
              <div className="mt-1 line-clamp-3 text-[13px] leading-snug text-dark-200">{n.body}</div>
              <div className="mt-1.5 text-[11px] font-medium text-dark-500">
                Toca para abrir · ✕ para marcar visto
              </div>
            </div>
            <button
              className="shrink-0 rounded-lg border border-dark-700 p-1.5 text-dark-400 hover:border-dark-500 hover:text-white"
              aria-label="Cerrar aviso"
              onClick={(e) => { e.stopPropagation(); dismiss(n.key) }}>
              <X size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
