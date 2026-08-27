import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HelpCircle, X, ChevronRight, Clock, AlertTriangle, Sparkles } from 'lucide-react'
import { AYUDA, PRIMEROS_PASOS } from './ayudaFichas'

/* LA AYUDA, DONDE SE NECESITA
   ═══════════════════════════════════════════════════════════════════════
   Dos piezas y ninguna se pone en medio:

   1. UN BOTÓN "?" QUE EXPLICA LA PANTALLA EN LA QUE ESTÁS. No un manual con
      treinta capítulos que hay que buscar: la ficha de aquí, ahora. Se abre
      también con la tecla `?`, que es donde la busca quien sabe buscarla.

   2. LOS PRIMEROS PASOS, UNA VEZ. La primera vez que alguien entra ve las
      cuatro pantallas que se usan de verdad, en el orden del día. Se cierra
      y no vuelve. Un tour de doce ventanas se cierra sin leer y encima
      enfada; cuatro tarjetas se leen.

   LA REGLA QUE LO SOSTIENE: la ayuda NUNCA interrumpe. No hay ventana al
   entrar salvo la primera vez, no hay puntos parpadeando, no hay "¿sabías
   que...?". Quien tiene prisa no la ve; quien está perdido la encuentra en
   el mismo sitio siempre.                                                  */

const claveDeRuta = (p) => (p === '/panel' ? 'dashboard' : p.replace(/\/+$/, '').split('/').pop())

export function BotonAyuda({ abrir }) {
  return (
    <button
      onClick={abrir}
      title="Cómo se usa esta pantalla  ·  tecla ?"
      className="rounded-lg border border-dark-700 bg-dark-800/70 p-1.5 text-dark-400 transition-colors hover:border-dark-600 hover:text-dark-200"
    >
      <HelpCircle size={14} />
    </button>
  )
}

export function PanelAyuda({ abierto, cerrar, titulo }) {
  const loc = useLocation()
  const clave = claveDeRuta(loc.pathname)
  const ficha = AYUDA[clave]

  useEffect(() => {
    if (!abierto) return
    const h = (e) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [abierto, cerrar])

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/40" onClick={cerrar}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white text-slate-900 shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <HelpCircle size={20} className="mt-0.5 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Cómo se usa
            </p>
            {/* El titulo lo manda PanelLayout, que es quien tiene el menu y
                las traducciones. Sacarlo de document.title daba el nombre de
                la pestaña del navegador, que no siempre es el de la pantalla. */}
            <h2 className="text-[17px] font-bold leading-tight">{titulo || 'Esta pantalla'}</h2>
          </div>
          <button onClick={cerrar} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 px-5 py-4">
          {!ficha ? (
            /* No se inventa una explicación: se dice que no la hay. Una ayuda
               genérica ("aquí puedes gestionar…") es peor que ninguna, porque
               quema la confianza en el resto de las fichas. */
            <p className="text-[14px] text-slate-500">
              Esta pantalla todavía no tiene ficha de ayuda escrita.
            </p>
          ) : (
            <>
              <p className="text-[15px] leading-relaxed text-slate-800">{ficha.que}</p>

              {ficha.estado && (
                <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-500">
                  {ficha.estado}
                </p>
              )}

              {!!ficha.pasos?.length && (
                <ol className="mt-4 grid gap-2.5">
                  {ficha.pasos.map((p, i) => (
                    <li key={i} className="flex gap-2.5 text-[14px] leading-snug text-slate-700">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                        {i + 1}
                      </span>
                      {p}
                    </li>
                  ))}
                </ol>
              )}

              {ficha.ojo && (
                <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600" />
                  <p className="text-[13.5px] leading-snug text-amber-900">{ficha.ojo}</p>
                </div>
              )}
            </>
          )}
        </div>

        <p className="border-t border-slate-200 px-5 py-3 text-[12px] text-slate-400">
          Pulsa <b className="font-mono text-slate-600">?</b> en cualquier pantalla para ver su ficha.
        </p>
      </aside>
    </div>
  )
}

/* PRIMEROS PASOS — solo la primera vez, y por persona.
   La marca va en localStorage con el id del usuario dentro: en un ordenador
   compartido de oficina, sin eso, el segundo que entra no lo vería nunca. */
export function PrimerosPasos({ puedeVer, idUsuario }) {
  const nav = useNavigate()
  const marca = `ayuda_vista_${idUsuario || 'anon'}`
  const [abierto, setAbierto] = useState(() => {
    try { return !localStorage.getItem(marca) } catch { return false }
  })

  const cerrar = () => {
    try { localStorage.setItem(marca, '1') } catch { /* modo incógnito: se verá otra vez */ }
    setAbierto(false)
  }

  if (!abierto) return null
  // Solo los pasos que esta persona puede abrir de verdad.
  const pasos = PRIMEROS_PASOS.filter((p) => !puedeVer || puedeVer(p.clave))
  if (!pasos.length) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl">
        <div className="flex items-start gap-3 border-b border-slate-200 px-6 py-5">
          <Sparkles size={20} className="mt-0.5 shrink-0 text-amber-500" />
          <div>
            <h2 className="text-[19px] font-bold leading-tight">Bienvenido a FlotaDSP</h2>
            <p className="mt-1 text-[14px] text-slate-500">
              Hay muchas pantallas, pero el día se hace con estas cuatro.
            </p>
          </div>
        </div>

        <ol className="divide-y divide-slate-100">
          {pasos.map((p) => (
            <li key={p.clave}>
              <button
                onClick={() => { cerrar(); nav(p.clave === 'dashboard' ? '/panel' : `/panel/${p.clave}`) }}
                className="flex w-full items-start gap-3 px-6 py-3.5 text-left hover:bg-slate-50"
              >
                <span className="mt-0.5 flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  <Clock size={11} /> {p.cuando}
                </span>
                <span className="min-w-0 flex-1 text-[14px] text-slate-700">{p.texto}</span>
                <ChevronRight size={16} className="mt-0.5 shrink-0 text-slate-300" />
              </button>
            </li>
          ))}
        </ol>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <p className="text-[12.5px] text-slate-400">
            El botón <b className="text-slate-600">?</b> de arriba explica cada pantalla.
          </p>
          <button
            onClick={cerrar}
            className="rounded-lg bg-slate-900 px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-slate-700"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
