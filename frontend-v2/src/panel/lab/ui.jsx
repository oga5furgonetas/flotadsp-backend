/* LAB · piezas compartidas de los prototipos.
   Texto en castellano a propósito y SIN claves i18n: son experimentos, no
   producto. (check-i18n sólo falla con claves usadas y no definidas, así que
   esto no rompe CI. Si un experimento se promueve, ahí se traduce.) */
import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { ChevronDown, FlaskConical, ArrowLeft } from 'lucide-react'
import { CLASES } from './motor'

/* Envoltura de la zona experimental. Vive fuera de PanelLayout, así que se
   trae su propio fondo y su propio ancho. */
export function LabShell() {
  return (
    <div className="atmosphere min-h-screen px-5 py-6 sm:px-8">
      <Outlet />
    </div>
  )
}

/* Banda permanente. Si en algún momento alguien confunde esto con la
   aplicación, es que esta banda no era suficientemente fea. */
export function BandaSintetica() {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-2.5">
      <FlaskConical size={15} className="shrink-0 text-amber-400" />
      <span className="text-[12.5px] font-bold uppercase tracking-wider text-amber-300">Laboratorio · datos sintéticos</span>
      <span className="text-[12.5px] text-amber-200/70">
        Nada de esta pantalla sale de una base de datos real. Las matrículas acaban en «LAB» y los nombres son inventados.
      </span>
    </div>
  )
}

export function Cabecera({ titulo, bajada, volver = true }) {
  return (
    <header className="rise pb-6 pt-3">
      {volver && (
        <Link to="/lab" className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-dark-500 transition-colors hover:text-dark-300">
          <ArrowLeft size={13} /> Intelligence Lab
        </Link>
      )}
      <h1 className="font-display text-[clamp(26px,3.4vw,38px)] font-semibold leading-[1.08] tracking-[-0.03em] text-dark-50">{titulo}</h1>
      {bajada && <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-dark-400">{bajada}</p>}
    </header>
  )
}

/* El badge de clase es el corazón del sistema de confianza: dice de qué tipo
   es la afirmación ANTES de que la leas. */
export function Clase({ id, mini = false }) {
  const c = CLASES[id] || CLASES.hecho
  return (
    <span
      title={c.ayuda}
      className={`inline-flex shrink-0 items-center rounded-full font-bold uppercase tracking-wider ring-1 ring-inset ${mini ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-[9.5px]'}`}
      style={{ color: c.color, background: c.color + '18', '--tw-ring-color': c.color + '35' }}
    >
      {c.etiqueta}
    </span>
  )
}

export function Frescura({ fuente, fuentes }) {
  const f = (fuentes || {})[fuente]
  if (!f) return null
  const min = f.actualizado ? Math.round((Date.now() - Date.parse(f.actualizado)) / 60000) : null
  const txt = min === null ? 'sin fecha conocida'
    : min < 60 ? `hace ${min} min`
    : min < 60 * 36 ? `hace ${Math.round(min / 60)} h`
    : `hace ${Math.round(min / 1440)} días`
  const viejo = min === null || min > 60 * 24 || f.desfase_dias > 0
  return (
    <span className={`text-[11.5px] ${viejo ? 'text-amber-400/85' : 'text-dark-600'}`}>
      {f.etiqueta} · {txt}
      {f.modo === 'manual' && ' · se mete a mano'}
      {f.desfase_dias > 0 && ` · la fuente llega con ${f.desfase_dias} días de retraso`}
    </span>
  )
}

/* «¿Por qué aparece esto?» — cerrado por defecto, pero siempre presente.
   Una señal sin esto es magia, y la magia se deja de creer a la tercera vez
   que falla. */
export function PorQue({ senal, fuentes }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="mt-3">
      <button
        onClick={() => setAbierto(!abierto)}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-dark-500 transition-colors hover:text-dark-200"
      >
        <ChevronDown size={13} className={`transition-transform duration-200 ${abierto ? '' : '-rotate-90'}`} />
        ¿Por qué aparece esto?
      </button>

      {abierto && (
        <div className="animate-fade-in mt-3 space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <Bloque titulo="El cálculo">
            <p className="font-mono text-[12px] leading-relaxed text-dark-300">{senal.calculo}</p>
          </Bloque>

          <Bloque titulo="La evidencia">
            <dl className="space-y-1.5">
              {senal.evidencia.map((e, i) => (
                <div key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <dt className="text-[12.5px] text-dark-500">{e.k}</dt>
                  <dd className="text-[12.5px] font-semibold text-dark-100">{e.v}</dd>
                  <Clase id={e.clase} mini />
                </div>
              ))}
            </dl>
          </Bloque>

          <Bloque titulo="Qué haría que esto fuese incorrecto">
            <ul className="space-y-1.5">
              {senal.invalidadores.map((x, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-dark-400">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-dark-600" />{x}
                </li>
              ))}
            </ul>
          </Bloque>

          <Bloque titulo="De dónde sale">
            <Frescura fuente={senal.fuente} fuentes={fuentes} />
          </Bloque>
        </div>
      )}
    </div>
  )
}

function Bloque({ titulo, children }) {
  return (
    <div>
      <h4 className="mb-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-dark-600">{titulo}</h4>
      {children}
    </div>
  )
}

export function Acciones({ acciones }) {
  if (!acciones?.length) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {acciones.map((a, i) => (
        <button
          key={i}
          title="Prototipo: los botones no ejecutan nada"
          className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
            i === 0
              ? 'bg-white/[0.09] text-dark-100 hover:bg-white/[0.14]'
              : 'text-dark-500 hover:bg-white/[0.05] hover:text-dark-300'
          }`}
        >
          {a.txt}
        </button>
      ))}
    </div>
  )
}
