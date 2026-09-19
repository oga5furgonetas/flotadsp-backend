import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { getMensajesGente } from '../api'
import { isAuthed } from '../auth'

/* ── QUIÉN ESTÁ CONECTADO, EN LA CABECERA ────────────────────────────────────
   El chat con presencia llevaba dos días desplegado y «no se veía»: la entrada
   del menú estaba comentada y la pantalla solo se llegaba por ⌘K. Una función
   que hay que ir a buscar no existe para quien la necesita.

   Aquí va donde se mira siempre: un botón con los conectados y, al pulsarlo, la
   lista de la empresa con su foto. Pulsar a alguien abre la conversación privada
   con esa persona (donde también se le pueden mandar documentos).

   La presencia sale de la última vez que el panel de cada uno habló con el
   servidor, y este mismo sondeo cuenta: quien tiene el panel abierto pregunta
   cada 45 s, así que «conectado» quiere decir «tiene la pestaña abierta ahora». */
const TONOS = ['bg-brand-500/25 text-brand-200', 'bg-emerald-500/20 text-emerald-200',
               'bg-amber-500/20 text-amber-200', 'bg-sky-500/20 text-sky-200',
               'bg-fuchsia-500/20 text-fuchsia-200', 'bg-rose-500/20 text-rose-200']
const tonoDe = (nombre) => {
  let n = 0
  for (const c of String(nombre || '')) n = (n + c.charCodeAt(0)) % TONOS.length
  return TONOS[n]
}
const iniciales = (nombre) => {
  const p = String(nombre || '?').trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'
}

export function Cara({ nombre, foto, size = 26, punto = null }) {
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

export default function EquipoEnLinea({ onSinLeer }) {
  const nav = useNavigate()
  const [gente, setGente] = useState(null)   // null = aún no se sabe
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)

  const cargar = useCallback(async () => {
    if (!isAuthed() || document.hidden) return
    try {
      const r = await getMensajesGente()
      const g = r.data?.gente || []
      setGente(g)
      onSinLeer?.(g.reduce((a, x) => a + (x.sin_leer || 0), 0))
    } catch { /* si falla se deja lo último: un cero falso haría dejar de mirar */ }
  }, [onSinLeer])

  useEffect(() => {
    cargar()
    const id = setInterval(cargar, 45000)
    document.addEventListener('visibilitychange', cargar)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', cargar) }
  }, [cargar])

  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false) }
    const esc = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])

  // Sin empresa o sin nadie más dado de alta no hay nada que enseñar.
  if (!gente || gente.length === 0) return null
  const enLinea = gente.filter((g) => g.en_linea)
  const sinLeer = gente.reduce((a, x) => a + (x.sin_leer || 0), 0)

  return (
    <div ref={caja} className="relative flex-none">
      <button onClick={() => setAbierto((v) => !v)}
        title="Quién de tu empresa está conectado"
        className="flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-800/70 px-2 py-1.5 text-xs text-dark-300 transition-colors hover:border-dark-600 hover:text-dark-100">
        <span className="flex -space-x-1.5">
          {enLinea.slice(0, 3).map((p) => (
            <span key={p.id} className="rounded-full ring-2 ring-dark-900"><Cara nombre={p.nombre} foto={p.foto} size={20} /></span>
          ))}
          {enLinea.length === 0 && <Users size={14} className="text-dark-500" />}
        </span>
        <span className="hidden font-medium sm:inline">
          {enLinea.length > 0 ? `${enLinea.length} conectado${enLinea.length === 1 ? '' : 's'}` : 'Equipo'}
        </span>
        {sinLeer > 0 && (
          <span className="min-w-[18px] rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
            {sinLeer}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-dark-700 bg-dark-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-dark-800 px-3 py-2">
            <span className="text-xs font-semibold text-dark-200">Tu equipo</span>
            <span className="text-[11px] text-dark-500">
              {enLinea.length > 0 ? `${enLinea.length} conectado${enLinea.length === 1 ? '' : 's'}` : 'nadie ahora'}
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {gente.map((p) => (
              <button key={p.id}
                onClick={() => { setAbierto(false); nav(`/panel/chat?con=${encodeURIComponent(p.id)}`) }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-dark-800/60">
                <Cara nombre={p.nombre} foto={p.foto} punto={p.en_linea} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-dark-100">{p.nombre}</span>
                  <span className="block text-[10px] text-dark-500">
                    {p.en_linea ? 'conectado ahora'
                      : p.hace_min == null ? 'sin entrar todavía'
                      : p.hace_min < 60 ? `hace ${p.hace_min} min`
                      : p.hace_min < 1440 ? `hace ${Math.floor(p.hace_min / 60)} h`
                      : `hace ${Math.floor(p.hace_min / 1440)} d`}
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
          <button onClick={() => { setAbierto(false); nav('/panel/chat') }}
            className="w-full border-t border-dark-800 px-3 py-2 text-center text-[11.5px] font-semibold text-brand-300 hover:bg-dark-800/60">
            Abrir el chat
          </button>
        </div>
      )}
    </div>
  )
}
