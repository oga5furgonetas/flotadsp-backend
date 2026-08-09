/* ─────────────────────────────────────────────────────────────────────────────
   PRODUCTO 2 · INVESTIGACIÓN — ¿es la persona, es el sitio o es la hora?
   ---------------------------------------------------------------------------
   QUIÉN LO USA   El gestor el lunes, antes de decidir con quién habla.

   QUÉ PROBLEMA RESUELVE
   Cuando un paquete vuelve, el sistema hoy dice "ha vuelto". El gestor asume
   que es el conductor, porque es lo único que tiene delante. A veces lo es. La
   mayoría de las veces es la dirección (un portal imposible) o la hora (un
   comercio cerrado al mediodía). Regañar a alguien por un portal es el error
   más caro que se puede cometer con un equipo, y no deja rastro de que se
   cometió.

   LA IDEA QUE NO EXISTE EN NINGÚN SOFTWARE DE FLOTAS
   Cruzar `stop_id` × `driver_id` × resultado y separar tres explicaciones:

     SITIO    varios conductores distintos fallan en la misma dirección
     FRANJA   los fallos se concentran en una ventana horaria POR ENCIMA de lo
              que ya se reparte a esa hora (si no, es un espejismo)
     PERSONA  falla donde otros entregan bien
     NO SE DISTINGUE  no hay cruces suficientes → no se afirma nada

   El cuarto veredicto es el que hace que esto sea vendible: un sistema que se
   niega a señalar a alguien cuando no puede demostrarlo es un sistema en el
   que se confía cuando sí señala.

   QUÉ DECISIÓN PERMITE  con quién hablar el lunes — o con nadie, y en su lugar
   meter un portal en la libreta o resecuenciar una parada.

   DATOS REALES: cortex_packages (stop_id, stop_address, timeline con hora y
   resultado, driver_id). Todo hechos. La única inferencia es el VEREDICTO, y
   lleva sus umbrales a la vista.
   LO QUE FALTA: nada para esto. Es de lo poco que se puede construir hoy.

   Datos de esta pantalla: LAB/SIMULATED.
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react'
import { MapPin, Clock, User, HelpCircle, ChevronDown, BookMarked, Route, MessageSquare } from 'lucide-react'
import { conductores } from '../app2/datosPlus'
import { detectarCasos, UMBRALES } from '../v3/deteccion'

const VER = {
  sitio: {
    txt: 'Es el sitio', ic: MapPin, color: 'text-sky-300', bg: 'bg-sky-500/12', ring: 'ring-sky-500/25',
    accion: 'Añadir a la libreta de portales', destino: 'Libreta', icAccion: BookMarked,
    lema: 'No es formación. Es la dirección.',
  },
  franja: {
    txt: 'Es la hora', ic: Clock, color: 'text-amber-300', bg: 'bg-amber-500/12', ring: 'ring-amber-500/25',
    accion: 'Sacar la parada de esa franja', destino: 'Secuencia de ruta', icAccion: Route,
    lema: 'No es la gente. Es cuándo se pasa.',
  },
  persona: {
    txt: 'Es la persona', ic: User, color: 'text-red-400', bg: 'bg-red-500/12', ring: 'ring-red-500/25',
    accion: 'Preparar conversación con evidencia', destino: 'Conductor', icAccion: MessageSquare,
    lema: 'La dirección no lo explica.',
  },
  sin_distinguir: {
    txt: 'No se distingue', ic: HelpCircle, color: 'text-dark-400', bg: 'bg-white/[0.05]', ring: 'ring-white/10',
    accion: null, destino: null, icAccion: null,
    lema: 'No hay con qué comparar. No se señala a nadie.',
  },
}

export default function Investigacion() {
  const nombreDe = (id) => conductores.find((c) => c.id === id)?.name || id
  const casos = useMemo(() => detectarCasos(nombreDe), [])
  const [abierto, setAbierto] = useState(null)
  const [hecho, setHecho] = useState({})
  const [filtro, setFiltro] = useState('todo')

  const cuenta = {
    todo: casos.length,
    sitio: casos.filter((c) => c.veredicto === 'sitio').length,
    franja: casos.filter((c) => c.veredicto === 'franja').length,
    persona: casos.filter((c) => c.veredicto === 'persona').length,
    sin_distinguir: casos.filter((c) => c.veredicto === 'sin_distinguir').length,
  }
  const vistos = casos.filter((c) => filtro === 'todo' || c.veredicto === filtro)
  const señalables = cuenta.persona

  return (
    <div className="animate-fade-in">
      <header className="rise pb-6">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-dark-500">Investigación</p>
        <h1 className="mt-2 font-display text-[clamp(24px,3.4vw,34px)] font-semibold leading-[1.1] tracking-[-0.03em] text-dark-50">
          {casos.length} fallos que se repiten,<br />
          y sólo <span className="text-red-400">{señalables}</span> {señalables === 1 ? 'apunta' : 'apuntan'} a una persona
        </h1>
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-dark-400">
          Antes de decidir con quién hablas, el sistema separa si el fallo lo explica
          <b className="font-semibold text-dark-200"> la dirección, la hora o la persona</b>. Se calcula cruzando quién
          intentó cada parada y cómo le fue. Cambia con quién hablas el lunes — y a cuánta gente no molestas.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {[['todo', 'Todo'], ['sitio', 'Es el sitio'], ['franja', 'Es la hora'], ['persona', 'Es la persona'], ['sin_distinguir', 'No se distingue']].map(([id, txt]) => (
          cuenta[id] > 0 && (
            <button key={id} onClick={() => setFiltro(id)}
              className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
                filtro === id ? 'bg-white/[0.1] text-dark-50' : 'text-dark-500 hover:bg-white/[0.04] hover:text-dark-300'}`}>
              {txt} <span className="tabular-nums opacity-50">{cuenta[id]}</span>
            </button>
          )
        ))}
      </div>

      <div className="space-y-2.5">
        {vistos.map((c, i) => {
          const v = VER[c.veredicto]
          const Ic = v.ic
          const IcA = v.icAccion
          const ok = hecho[c.id]
          return (
            <article key={c.id} className="rise card p-5" style={{ animationDelay: `${Math.min(i * 45, 220)}ms` }}>
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset ${v.bg} ${v.color} ${v.ring}`}>
                  <Ic size={11.5} /> {v.txt}
                </span>
                <span className="text-[11.5px] text-dark-600">{c.fallos} fallos</span>
                <span className={`ml-auto text-[11.5px] ${v.color} opacity-80`}>{v.lema}</span>
              </div>

              <h3 className="text-[16.5px] font-semibold leading-snug tracking-[-0.01em] text-dark-50">{c.titulo}</h3>
              <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-dark-400">{c.porque}</p>

              {v.accion ? (
                <div className="mt-3.5 flex flex-wrap items-center gap-2">
                  <button onClick={() => setHecho({ ...hecho, [c.id]: !ok })}
                    className={ok ? 'btn-secondary flex items-center gap-1.5 text-[13px]' : 'btn-primary flex items-center gap-1.5 text-[13px]'}
                    title="Prototipo: no escribe en ninguna base">
                    <IcA size={13} /> {ok ? 'En marcha · se medirá sola' : v.accion}
                  </button>
                  {!ok && <span className="text-[11.5px] text-dark-600">→ {v.destino}</span>}
                </div>
              ) : (
                <p className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2 text-[12.5px] leading-relaxed text-dark-500">
                  Sin acción a propósito. Señalar a alguien sin poder separarlo de la dirección es el falso positivo
                  más caro de este producto: <b className="text-dark-300">se paga con una persona del equipo</b>.
                </p>
              )}

              <button onClick={() => setAbierto(abierto === c.id ? null : c.id)}
                className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-dark-500 transition-colors hover:text-dark-200">
                <ChevronDown size={13} className={`transition-transform duration-200 ${abierto === c.id ? '' : '-rotate-90'}`} />
                Los {c.evidencia.length} intentos que lo sostienen
              </button>

              {abierto === c.id && (
                <div className="animate-fade-in mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  {c.evidencia.map((e, k) => (
                    <div key={k} className="flex flex-wrap gap-x-3 gap-y-0.5 py-1 text-[12.5px]">
                      <span className="min-w-[76px] tabular-nums text-dark-600">{e.fecha}</span>
                      <span className="min-w-[32px] text-dark-600">{e.hora}h</span>
                      <span className="flex-1 text-dark-200">{e.quien}</span>
                      <span className="text-dark-500">{e.causa}</span>
                    </div>
                  ))}
                  <p className="mt-3 border-t border-white/[0.06] pt-3 font-mono text-[11px] leading-relaxed text-dark-600">
                    Umbrales · sitio: ≥{UMBRALES.sitio_fallos} fallos con ≥{UMBRALES.sitio_conductores} conductores ·
                    hora: ≥{UMBRALES.franja_pct}% en una ventana de 3 h y ≥{UMBRALES.franja_exceso_pp} puntos por encima
                    de lo que ya se reparte a esa hora · persona: ≥{UMBRALES.persona_fallos} fallos suyos con
                    ≥{UMBRALES.persona_exitos_otros} entregas de otros en las mismas paradas.
                  </p>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-dark-500">Por qué importa el umbral de la hora</h3>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-dark-400">
          La primera versión de este motor llamaba «es la hora» a cualquier concentración de fallos en horario
          laboral. Es un espejismo: si el 63 % de los intentos se hacen entre las 10 y las 13, que los fallos también
          estén ahí no dice nada. Ahora se exige que la concentración de fallos supere en
          {' '}{UMBRALES.franja_exceso_pp} puntos a la de intentos. Con ese arreglo, un caso pasó de «es la hora»
          (incorrecto) a «es el sitio» (correcto).
        </p>
      </div>
    </div>
  )
}
