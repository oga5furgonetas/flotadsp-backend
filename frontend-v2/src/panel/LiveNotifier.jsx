import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { MessageSquare, CheckSquare, X, AlertTriangle, UserPlus, Truck, Fuel } from 'lucide-react'
import { getChat, getChecklist, contarDnrPendientes, contarCandidatosNuevos, getAlerts } from './api'
import { getAdmin } from './auth'
import { hoyLocal } from '../lib/fecha'

const ICONOS = { chat: MessageSquare, task: CheckSquare, dnr: AlertTriangle, candidato: UserPlus, combustible: Fuel }

/* ── Avisos EN VIVO dentro del panel (PC) ─────────────────────────────────────
   Con la app abierta en cualquier página: si alguien escribe en el chat de tu
   centro, añade una tarea al checklist, entra un DNR sin contestar, un
   candidato nuevo o una furgoneta queda por debajo de medio depósito, se
   apunta como una FURGONETA abajo a la derecha, JUNTO a la burbuja de
   FlotaDSP AI, con el contador encima, como el badge de notificaciones de un
   móvil. Se toca para desplegar la lista HACIA ARRIBA, se vuelve a tocar para
   plegarla.
   Estaba arriba a la derecha y pegaba con el avatar del usuario (Dani, 18-09-2026):
   abajo y junto a la burbuja de la IA no tapa la cabecera y las dos cosas
   «que te hablan» quedan juntas.
   Sin sonido ni parpadeos: Dani lo pidió explícitamente el 17-09-2026, "no
   me gusta nada ese sonido ni que se esté repitiendo como una alarma".
   · El aviso NO se cierra solo: hay que tocarlo (abre la página) o cerrarlo.
   · Los avisos sobreviven a un F5 (se guardan en localStorage).
   Complementa al push del móvil (que cubre la app cerrada). */

const POLL_MS = 25000
const MAX_CENTERS = 4
const PENDING_KEY = 'ln_pending'
const PENDING_TTL_MS = 12 * 3600 * 1000 // un aviso de hace >12h ya no es "en vivo"

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
  const [abierto, setAbierto] = useState(false)
  const pathRef = useRef(loc.pathname)
  pathRef.current = loc.pathname

  // Persistir pendientes: un F5 no borra un aviso que nadie ha atendido
  useEffect(() => {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(notes)) } catch { /* lleno */ }
  }, [notes])

  function addNote(n) {
    setNotes((arr) => [...arr.filter((x) => x.key !== n.key), { ...n, ts: Date.now() }].slice(-6))
  }

  function dismiss(key) {
    setNotes((a) => a.filter((x) => x.key !== key))
  }

  // Entrar en la página del aviso = visto: se cierra solo.
  useEffect(() => {
    setNotes((a) => a.filter((n) => !loc.pathname.startsWith(n.to)))
  }, [loc.pathname])

  useEffect(() => {
    let stop = false
    const targets = () =>
      (center === 'Todos' ? (centers || []) : [center]).filter(Boolean).slice(0, MAX_CENTERS)

    async function tick() {
      const today = hoyLocal()
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

        // ── DNR: ¿han entrado investigaciones nuevas sin contestar? ──
        // Solo el NUMERO (endpoint aparte, ligero a proposito: la lista trae el
        // contexto de Cortex de cada una). Se avisa solo si SUBE respecto al
        // ultimo visto — bajar (se contesto una) no es una novedad que avisar.
        try {
          const r = await contarDnrPendientes(c)
          const n = r.data?.pendientes || 0
          const k = `ln_dnr_${c}`
          const antes = localStorage.getItem(k)
          const antesN = antes === null ? null : Number(antes)
          if (antesN !== null && n > antesN && !pathRef.current.startsWith('/panel/informes')) {
            const nuevas = n - antesN
            addNote({
              key: `dnr-${c}-${n}`, icon: 'dnr',
              title: `DNR sin contestar · ${c}`,
              body: `${nuevas} investigación${nuevas === 1 ? '' : 'es'} nueva${nuevas === 1 ? '' : 's'} de Amazon esperando respuesta (${n} en total).`,
              to: '/panel/informes',
            })
          }
          localStorage.setItem(k, String(n))
        } catch { /* siguiente tick */ }

        // ── CANDIDATOS: ¿ha entrado gente nueva a Empleo sin mirar? ──
        try {
          const r = await contarCandidatosNuevos(c)
          const n = r.data?.nuevos || 0
          const k = `ln_cand_${c}`
          const antes = localStorage.getItem(k)
          const antesN = antes === null ? null : Number(antes)
          if (antesN !== null && n > antesN && !pathRef.current.startsWith('/panel/empleo')) {
            const nuevos = n - antesN
            addNote({
              key: `cand-${c}-${n}`, icon: 'candidato',
              title: `Candidatos nuevos · ${c}`,
              body: `${nuevos} candidatura${nuevos === 1 ? '' : 's'} nueva${nuevos === 1 ? '' : 's'} sin mirar (${n} en total).`,
              to: '/panel/empleo',
            })
          }
          localStorage.setItem(k, String(n))
        } catch { /* siguiente tick */ }

        // ── DEPOSITO BAJO: furgoneta por debajo de la mitad al hacer la inspeccion ──
        // La alerta la crea el SERVIDOR al subir las fotos (`_combustible_registrar`,
        // `kind: "combustible"`, una por furgoneta y dia) con el texto ya escrito:
        // matricula, cuanto queda y quien la dejo asi. Aqui solo se ENSEÑA.
        // Se recuerda por dispositivo cuales se han enseñado ya, como en el resto
        // de bloques: sin eso, cada vuelta de 25 s volveria a apuntar la misma.
        // Solo cuenta lo reciente (`PENDING_TTL_MS`): una alerta de hace dias no
        // es un aviso "en vivo" y al abrir el panel un lunes inundaria la lista.
        try {
          const r = await getAlerts(c, 'combustible')
          const k = `ln_fuel_${c}`
          const vistos = new Set(JSON.parse(localStorage.getItem(k) || '[]'))
          const desde = Date.now() - PENDING_TTL_MS
          let hayNuevas = false
          for (const a of Array.isArray(r.data) ? r.data : []) {
            if (!a?.id || a.read || vistos.has(a.id)) continue
            if (!(Date.parse(a.created_at) > desde)) continue
            vistos.add(a.id)
            hayNuevas = true
            if (!pathRef.current.startsWith('/panel/vehiculos')) {
              addNote({
                key: `fuel-${a.id}`, icon: 'combustible',
                title: `${a.title || 'Depósito bajo'} · ${c}`,
                body: a.description || '',
                to: '/panel/vehiculos',
              })
            }
          }
          if (hayNuevas) localStorage.setItem(k, JSON.stringify([...vistos].slice(-60)))
        } catch { /* siguiente tick */ }
      }
    }

    tick()
    const iv = setInterval(() => { if (!stop) tick() }, POLL_MS)
    return () => { stop = true; clearInterval(iv) }
  }, [center, centers]) // eslint-disable-line

  if (notes.length === 0) return null

  return (
    // right-[4.5rem] = 1rem de margen + 3rem de la burbuja de la IA + 0,5rem de
    // aire: queda pegada a su izquierda. La lista va ANTES del boton en el DOM
    // y el contenedor esta anclado ABAJO, asi que al abrirse crece hacia
    // arriba (como AsistenteBurbuja). `z-[90]` < el `z-[95]` de la IA: con la
    // ventana de la IA abierta, esta tapa el boton hasta que se cierra.
    <div className="fixed bottom-4 right-[4.5rem] z-[90] flex flex-col items-end gap-2">
      {abierto && (
        // max-w descuenta los 5,5 rem de la derecha: con 4,5 rem de margen + 1 de
        // aire, a 375 px la lista se salia por la izquierda de la pantalla.
        <div className="flex max-h-[70vh] w-80 max-w-[calc(100vw-5.5rem)] flex-col gap-1.5 overflow-y-auto">
          {notes.length > 1 && (
            <div className="mb-0.5 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">{notes.length} avisos</span>
              <button onClick={() => setNotes([])} className="text-[11px] text-dark-500 hover:text-dark-300">Cerrar todos</button>
            </div>
          )}
          {notes.map((n) => {
            const Icono = ICONOS[n.icon] || MessageSquare
            return (
              <div key={n.key}
                className="animate-fade-in cursor-pointer rounded-xl border border-dark-700 bg-dark-900/95 p-2.5 shadow-lg backdrop-blur transition hover:border-brand-500/40"
                onClick={() => { dismiss(n.key); nav(n.to) }}>
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
                    <Icono size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold text-dark-100">{n.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-dark-400">{n.body}</div>
                  </div>
                  <button
                    className="shrink-0 text-dark-600 hover:text-dark-300"
                    aria-label="Cerrar aviso"
                    onClick={(e) => { e.stopPropagation(); dismiss(n.key) }}>
                    <X size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* La furgoneta: el icono de la propia app como burbuja de avisos, con
          el contador tipo badge de móvil. Un puntito de vida en vez de un
          repique — se ve, no se oye. Va DESPUES de la lista para quedar
          abajo, junto a la burbuja de la IA. */}
      <button onClick={() => setAbierto((a) => !a)}
        title={`${notes.length} aviso${notes.length === 1 ? '' : 's'}`}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full border shadow-lg backdrop-blur transition ${
          abierto ? 'border-brand-500/60 bg-brand-500/15 text-brand-200' : 'border-dark-700 bg-dark-900/95 text-dark-200 hover:border-brand-500/40'}`}>
        <Truck size={20} />
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10.5px] font-bold text-white ring-2 ring-dark-950">
          {notes.length > 9 ? '9+' : notes.length}
        </span>
      </button>
    </div>
  )
}
