/* LAB · puerta de entrada.
   No toca la navegación principal a propósito: se llega escribiendo /panel/lab.
   Si algún experimento se gana un sitio en el menú, se decide entonces. */
import { Link } from 'react-router-dom'
import { FlaskConical, ArrowRight } from 'lucide-react'
import { generarSenales, NO_DEMOSTRABLE } from './motor'
import { DATOS_SINTETICOS } from './datos'

const EXPERIMENTOS = [
  {
    to: 'ficha', nombre: 'E06 · Ficha 360',
    idea: 'La lista de siempre, pero cada fila se abre en un panel lateral que reúne ruta de hoy, horas, scorecard, memoria, inspecciones y señales.',
    prueba: '¿La inteligencia debe ser una capa sobre la lista en vez de una pantalla aparte?',
    veredicto: 'La más prometedora de las siete. Colapsa 7 pantallas en 1 y no inventa ni un dato.',
    tono: 'bien',
  },
  {
    to: 'cambios', nombre: 'E07 · Qué ha cambiado',
    idea: 'Lo que ha pasado desde ayer en una sola lista. Y la mitad honesta: lo que NO se puede diferenciar y por qué.',
    prueba: '¿Se puede reconstruir la jornada sin historial de estados?',
    veredicto: 'A medias, y el hallazgo vale más que la pantalla: falta un registro de eventos.',
    tono: 'duda',
  },
  {
    to: 'simulador', nombre: 'E08 · ¿Y si…?',
    idea: 'Mover horas planificadas entre conductores y ver el efecto en el límite semanal. Con los supuestos a la vista.',
    prueba: '¿Hay algún what-if que se sostenga sin inventar un modelo?',
    veredicto: 'Sí, exactamente uno. El resto los enumero como no simulables.',
    tono: 'bien',
  },
  {
    to: 'senales', nombre: 'A · Señales',
    idea: 'Una lista de excepciones. Cada una declara si es un hecho medido, una suma de hechos o la opinión de un modelo, y enseña la evidencia.',
    prueba: '¿Se entiende la clasificación de un vistazo o estorba?',
    veredicto: 'La conservaría. Es la que escala.',
    tono: 'bien',
  },
  {
    to: 'parte', nombre: 'B · El parte',
    idea: 'La misma materia prima escrita como texto corto que se lee entero, y que termina diciendo qué NO sabemos hoy.',
    prueba: '¿Se lee más rápido que una lista de tarjetas?',
    veredicto: 'Mi favorita para abrir por la mañana. Pero no escala más allá de 6 señales.',
    tono: 'bien',
  },
  {
    to: 'vehiculo', nombre: 'C · Memoria del vehículo',
    idea: 'El registro de daños que ya se guarda, pero visible: qué le ha pasado a esta furgoneta y en qué ventana de turnos apareció cada golpe.',
    prueba: '¿La ventana de atribución se entiende sin señalar culpables?',
    veredicto: 'La más valiosa de las cuatro: usa un dato que hoy no tiene pantalla.',
    tono: 'bien',
  },
  {
    to: 'confianza', nombre: 'D · Confianza',
    idea: 'De cuándo es cada número y qué pasa si nadie lo actualiza. Más la lista de lo que el producto no puede afirmar, con su prueba.',
    prueba: '¿Merece pantalla propia o debería ser una tira en el resto?',
    veredicto: 'La idea es necesaria; la pantalla propia probablemente no. Sospecho que debe disolverse en las demás.',
    tono: 'duda',
  },
]

export default function LabHub() {
  const senales = generarSenales(DATOS_SINTETICOS)

  return (
    <div className="mx-auto max-w-3xl">
      <header className="rise pb-7 pt-3">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/[0.08] px-3 py-1">
          <FlaskConical size={13} className="text-amber-400" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Experimental · datos sintéticos</span>
        </div>
        <h1 className="font-display text-[clamp(30px,4.2vw,44px)] font-semibold leading-[1.05] tracking-[-0.03em] text-dark-50">
          Intelligence Lab
        </h1>
        <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-dark-400">
          Cuatro formas distintas de responder a la misma pregunta: qué está pasando, qué importa y qué se
          puede hacer. Ninguna está enchufada a datos reales y ninguna toca producción.
        </p>
      </header>

      {/* La tesis. Va aquí arriba porque es el resultado, no el adorno. */}
      <section className="rise rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">La tesis</h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-dark-300">
          El problema de FlotaDSP no es que le falte inteligencia: es que la que ya tiene está repartida en
          35 pantallas y la portada sólo enseña <b className="font-semibold text-dark-50">recuentos</b>.
          La proyección semanal de horas, los minutos sin entregar de una ruta o el registro de daños panel a
          panel ya están calculados en el backend. Lo que falta no es un modelo:
          es <b className="font-semibold text-dark-50">una capa que exprese lo ya calculado como excepciones
          con evidencia</b>, y la disciplina de no disfrazar de hecho lo que es una estimación.
        </p>
      </section>

      {/* GEN 2. Lo único del laboratorio que no se limita a informar. */}
      <Link
        to="casos"
        className="rise float-row mt-8 block rounded-2xl border border-sky-500/30 bg-sky-500/[0.07] p-5"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-dark-50">Casos</h3>
              <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-sky-300">
                Gen 2 · cierra el círculo
              </span>
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-dark-300">
              Todo lo demás del laboratorio se lee. Esto <b className="font-semibold text-dark-50">se trabaja</b>: cada
              caso se acepta, se asigna y <b className="font-semibold text-dark-50">se mide semanas después</b>.
            </p>
            <p className="mt-2 text-[12.5px] text-dark-500">
              Y responde a la pregunta que nadie había hecho: ¿es la persona, es el sitio o es la hora? Con un cuarto
              veredicto —«no se distingue»— para no señalar a nadie sin poder demostrarlo.
            </p>
          </div>
          <ArrowRight size={17} className="mt-1 shrink-0 text-sky-400/70" />
        </div>
      </Link>

      {/* El foco de la semana: mejor informe del lab, pero sigue siendo informe. */}
      <Link
        to="foco"
        className="rise float-row mt-3 block rounded-2xl border border-brand-500/30 bg-brand-500/[0.07] p-5"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-dark-50">El foco de la semana</h3>
              <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-brand-300">
                E09+E10 · informe
              </span>
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-dark-300">
              En qué métrica de Amazon te estás dejando puntos, <b className="font-semibold text-dark-50">por qué</b> y
              quién puede moverla. Con el peso medido sobre 17 scorecards reales: DSC pesa 40, el WHC pesa 10.
            </p>
            <p className="mt-2 text-[12.5px] text-dark-500">
              Incluye el guardián de la ventana DSC: días de reporte que caducan y se pierden para siempre. Nadie
              lo pediría, y protege justo la métrica que más penaliza.
            </p>
          </div>
          <ArrowRight size={17} className="mt-1 shrink-0 text-brand-400/70" />
        </div>
      </Link>

      {/* V2: apunta al WHC. Se mantiene para poder comparar el encuadre. */}
      <Link
        to="semana"
        className="rise float-row mt-3 block rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-5"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-dark-50">La semana</h3>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-emerald-300">
                V2 · apunta al WHC
              </span>
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-dark-300">
              Una sola página, sin menú, organizada por las tres preguntas del <b className="font-semibold text-dark-50">dueño</b>:
              ¿sigo siendo Fantastic?, ¿qué me está costando?, ¿cubro mañana?
            </p>
            <p className="mt-2 text-[12.5px] text-dark-500">
              Superficie clara, un solo acento. Criba el riesgo de tier con el suelo medido de 56h 30m en vez de con
              tu límite de 55 h — por eso la lista sale corta.
            </p>
          </div>
          <ArrowRight size={17} className="mt-1 shrink-0 text-emerald-400/70" />
        </div>
      </Link>

      {/* El cockpit va después: reorganiza pantallas, no cambia el encuadre. */}
      <Link
        to="app"
        className="rise float-row mt-3 block rounded-2xl border border-brand-500/25 bg-brand-500/[0.06] p-5"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-dark-50">Cockpit</h3>
              <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-brand-300">
                La app entera
              </span>
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-dark-300">
              FlotaDSP reorganizada desde cero: <b className="font-semibold text-dark-50">4 superficies en vez de 35 pantallas</b>.
              Navegación plana, la profundidad se abre en un panel lateral, y un buscador que trae la
              furgoneta o la persona en vez de llevarte a una pantalla.
            </p>
            <p className="mt-2 text-[12.5px] text-dark-500">
              Hoy · Flota · Cambios · ¿Y si…? — pruébala entera, se navega de verdad.
            </p>
          </div>
          <ArrowRight size={17} className="mt-1 shrink-0 text-brand-400/70" />
        </div>
      </Link>

      <h2 className="mt-9 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">
        Experimentos sueltos
      </h2>
      <div className="mt-3 space-y-2.5">
        {EXPERIMENTOS.map((e, i) => (
          <Link
            key={e.to} to={e.to}
            className="rise float-row group block rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5"
            style={{ animationDelay: `${60 + i * 50}ms` }}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-[16.5px] font-semibold tracking-[-0.01em] text-dark-50">{e.nombre}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-dark-400">{e.idea}</p>
                <p className="mt-2.5 text-[12.5px] text-dark-500">
                  <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-dark-600">Qué prueba </span>
                  {e.prueba}
                </p>
                <p className={`mt-1.5 text-[12.5px] font-medium ${e.tono === 'bien' ? 'text-emerald-400/85' : 'text-amber-400/85'}`}>
                  {e.veredicto}
                </p>
              </div>
              <ArrowRight size={16} className="mt-1 shrink-0 text-dark-600 transition-transform group-hover:translate-x-0.5 group-hover:text-dark-300" />
            </div>
          </Link>
        ))}
      </div>

      <section className="mt-9 border-t border-white/[0.06] pt-7">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">Estado del motor</h2>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-dark-400">
          Ocho reglas activas sobre los datos sintéticos, que producen <b className="font-semibold text-dark-50">{senales.length} señales</b>.
          Las reglas están escritas contra los nombres de campo <b className="font-semibold text-dark-50">reales</b> del
          backend, así que el motor se puede enchufar a la API sin reescribirlo — lo que cambiaría es de dónde
          vienen los datos, no la lógica.
        </p>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-dark-400">
          Y {NO_DEMOSTRABLE.length} preguntas que el producto <b className="font-semibold text-dark-50">no puede
          responder</b> y que están en la interfaz como tales, con la prueba de por qué.
        </p>
      </section>
    </div>
  )
}
