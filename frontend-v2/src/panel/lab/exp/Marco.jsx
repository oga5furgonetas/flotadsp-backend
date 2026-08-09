/* ─────────────────────────────────────────────────────────────────────────────
   MARCO DE LOS EXPERIMENTOS
   ---------------------------------------------------------------------------
   Aprendizaje de la sesión anterior, y me costó admitirlo: rehacer la carcasa
   de FlotaDSP la EMPEORA. La barra lateral agrupada, el selector de centro, el
   buscador, los seis idiomas y el tema oscuro ya están bien resueltos, y mi
   versión "2.0" los perdía todos a cambio de una tipografía más grande.

   Así que estos tres productos son radicales en lo que HACEN y nativos en
   cómo se ven: usan las clases del sistema de diseño real (card, float-row,
   rise, btn-primary, dark-*, brand-*) y reciben el centro del panel.

   DOS MONTAJES, mismo componente:
     /panel/lab/*   dentro del panel real — barra lateral, centro y sesión.
     /lab           suelto, con una réplica mínima de la cabecera, para poder
                    verlo sin backend ni credenciales.

   Texto en castellano y sin claves i18n a propósito: son experimentos, y
   check-i18n sólo falla con claves usadas y no definidas. Si alguno se
   promociona, ahí se traduce.
   ───────────────────────────────────────────────────────────────────────────── */
import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { FlaskConical, Truck, SearchCheck, Banknote, Zap, ClipboardCheck } from 'lucide-react'
import Expediente from './Expediente'
import Investigacion from './Investigacion'
import Fuga from './Fuga'
import Senales from './Senales'
import Decisiones from './Decisiones'
import { centros } from '../app2/datosPlus'
import { DATOS_SINTETICOS } from '../datos'

const EXPS = [
  { id: 'expediente', nombre: 'Expediente', ic: Truck, comp: Expediente,
    pitch: 'El vehículo como objeto con memoria' },
  { id: 'investigacion', nombre: 'Investigación', ic: SearchCheck, comp: Investigacion,
    pitch: '¿Es la persona, el sitio o la hora?' },
  { id: 'fuga', nombre: 'La fuga', ic: Banknote, comp: Fuga,
    pitch: 'Dónde se escapa el dinero' },
  { id: 'senales', nombre: 'Sistema nervioso', ic: Zap, comp: Senales,
    pitch: 'Feed de señales: excepciones con evidencia y acción' },
  { id: 'decisiones', nombre: 'Decisiones', ic: ClipboardCheck, comp: Decisiones,
    pitch: 'Las señales convertidas en acciones concretas' },
]

/* Montaje dentro del panel: hereda barra lateral, centro y sesión. */
export default function Marco() {
  const ctx = useOutletContext?.() || {}
  return <Contenido center={ctx.center} />
}

/* Montaje suelto: réplica mínima de la cabecera para poder verlo sin sesión. */
export function MarcoSuelto() {
  const [center, setCenter] = useState('Todos')
  return (
    <div className="atmosphere min-h-screen">
      <div className="mx-auto max-w-5xl px-5 py-5 sm:px-8">
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-2.5">
          <FlaskConical size={15} className="shrink-0 text-amber-400" />
          <span className="text-[12.5px] font-bold uppercase tracking-wider text-amber-300">Laboratorio · datos inventados</span>
          <span className="hidden text-[12.5px] text-amber-200/70 sm:inline">
            Vista suelta, sin sesión. Dentro del panel va en /panel/lab con la barra lateral de siempre.
          </span>
          <div className="ml-auto flex gap-0.5 rounded-lg bg-black/25 p-0.5">
            {['Todos', ...centros].map((c) => (
              <button key={c} onClick={() => setCenter(c)}
                className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                  center === c ? 'bg-white/[0.12] text-dark-50' : 'text-dark-400 hover:text-dark-200'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <Contenido center={center} />
      </div>
    </div>
  )
}

function Contenido({ center }) {
  const [cual, setCual] = useState('expediente')
  const Actual = EXPS.find((e) => e.id === cual).comp

  return (
    <>
      <nav className="mb-7 flex flex-wrap gap-1.5 border-b border-white/[0.06] pb-3">
        {EXPS.map((e) => {
          const I = e.ic
          const act = cual === e.id
          return (
            <button key={e.id} onClick={() => setCual(e.id)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                act ? 'bg-white/[0.07]' : 'hover:bg-white/[0.035]'}`}>
              <I size={15} className={act ? 'text-brand-400' : 'text-dark-600'} />
              <span>
                <span className={`block text-[13.5px] font-semibold ${act ? 'text-dark-50' : 'text-dark-300'}`}>{e.nombre}</span>
                <span className="block text-[11px] text-dark-600">{e.pitch}</span>
              </span>
            </button>
          )
        })}
      </nav>

      {/* `datos` va también: Decisiones trabaja sobre el paquete sintético y sin
          él se queda en "Cargando…" para siempre. */}
      <Actual center={center} datos={DATOS_SINTETICOS} />

      <footer className="mt-12 border-t border-white/[0.05] pt-5 text-[11.5px] leading-relaxed text-dark-600">
        Tres prototipos del laboratorio sobre datos inventados (matrículas terminadas en «LAB»). La lógica está
        escrita contra los nombres de campo reales del backend. <b className="text-dark-500">Ningún botón escribe en
        ninguna base</b> y las pantallas de producción no se han tocado.
      </footer>
    </>
  )
}
