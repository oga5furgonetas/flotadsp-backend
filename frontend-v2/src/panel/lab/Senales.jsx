/* LAB · VERSIÓN A — Feed de señales
   ---------------------------------------------------------------------------
   Hipótesis: el gestor no quiere métricas, quiere excepciones. Una lista de
   cosas que se salen de lo normal, cada una con su clase de afirmación, su
   evidencia y sus acciones. Todo lo que va bien no aparece.

   Lo que esta versión prueba: si la clasificación epistémica (HECHO /
   ARITMÉTICA / ESTIMACIÓN) se entiende de un vistazo o si estorba. */
import { useMemo, useState } from 'react'
import { generarSenales } from './motor'
import { DATOS_SINTETICOS } from './datos'
import { BandaSintetica, Cabecera, Clase, PorQue, Acciones, Frescura } from './ui'

const AREAS = ['Todo', 'Horas', 'Reparto', 'Flota', 'Daños', 'Sistema', 'Equipo']

/* `datos` se recibe por prop: con fixtures desde /lab y con datos reales del
   backend del LAB desde /panel/lab. El componente no sabe cuál es cuál. */
export default function Senales({ datos = DATOS_SINTETICOS, cabecera = true }) {
  const fuentes = datos.fuentes || {}
  const senales = useMemo(() => generarSenales(datos), [datos])
  const [area, setArea] = useState('Todo')
  const [soloDuro, setSoloDuro] = useState(false)

  const vistas = senales.filter((s) =>
    (area === 'Todo' || s.area === area) &&
    (!soloDuro || s.clase === 'hecho' || s.clase === 'aritmetica'))

  const nHechos = senales.filter((s) => s.clase === 'hecho').length
  const nArit = senales.filter((s) => s.clase === 'aritmetica').length
  const nEst = senales.filter((s) => s.clase === 'estimacion').length

  return (
    <div className="mx-auto max-w-3xl">
      {cabecera && (
        <>
          <Cabecera
            titulo="Señales"
            bajada="Sólo lo que se sale de lo normal. Cada señal dice qué clase de afirmación es antes de que la leas: un hecho medido no se presenta igual que una estimación de un modelo."
          />
          <BandaSintetica />
        </>
      )}

      {/* Resumen honesto de la composición: cuánto de lo que ves es medido */}
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-white/[0.06] py-3">
        <span className="text-[13px] text-dark-400">
          <b className="font-semibold text-dark-50">{senales.length}</b> señales
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-dark-500"><Clase id="hecho" mini /> {nHechos}</span>
        <span className="flex items-center gap-1.5 text-[12px] text-dark-500"><Clase id="aritmetica" mini /> {nArit}</span>
        <span className="flex items-center gap-1.5 text-[12px] text-dark-500"><Clase id="estimacion" mini /> {nEst}</span>
        <button
          onClick={() => setSoloDuro(!soloDuro)}
          className={`ml-auto rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors ${
            soloDuro ? 'bg-emerald-500/15 text-emerald-300' : 'text-dark-500 hover:bg-white/[0.05] hover:text-dark-300'}`}
        >
          {soloDuro ? '✓ ' : ''}Sólo lo medible
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {AREAS.map((a) => {
          const n = a === 'Todo' ? senales.length : senales.filter((s) => s.area === a).length
          if (!n) return null
          return (
            <button
              key={a}
              onClick={() => setArea(a)}
              className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
                area === a ? 'bg-white/[0.1] text-dark-50' : 'text-dark-500 hover:bg-white/[0.04] hover:text-dark-300'}`}
            >
              {a} <span className="tabular-nums opacity-50">{n}</span>
            </button>
          )
        })}
      </div>

      <div className="space-y-2.5">
        {vistas.map((s, i) => (
          <article
            key={s.id}
            className="rise rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5"
            style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Clase id={s.clase} />
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-dark-600">{s.area}</span>
              <span className="ml-auto"><Frescura fuente={s.fuente} fuentes={fuentes} /></span>
            </div>

            <h3 className="text-[16px] font-semibold leading-snug tracking-[-0.01em] text-dark-50">{s.titulo}</h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-dark-400">{s.resumen}</p>

            {/* La ventana de atribución merece su propia representación: es la
                diferencia entre "fue Fulano" y "estuvo entre estos tres". */}
            {s.atribucion && <Ventana a={s.atribucion} />}

            <Acciones acciones={s.acciones} />
            <PorQue senal={s} fuentes={fuentes} />
          </article>
        ))}

        {vistas.length === 0 && (
          <p className="py-14 text-center text-[14px] text-dark-500">
            Nada que mirar con ese filtro. Que no haya señales es el estado bueno.
          </p>
        )}
      </div>
    </div>
  )
}

/* Ventana de atribución.
   Tres estados, y el tercero es el que salva la idea de convertirse en ruido:

     CERRADA    un solo turno → el daño tiene dueño.
     ABIERTA    2-4 turnos    → se enseñan todos, sin elegir sospechoso.
     SIN ACOTAR sin inspección anterior, o demasiados turnos → NO se dibuja
                nada. Pintar 57 fichas de conductor da apariencia de prueba a
                algo que no señala a nadie, y eso es peor que no enseñarlo. */
function Ventana({ a }) {
  const inutil = !a.acotada || a.ancha

  if (inutil) {
    return (
      <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
        <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-dark-500">
          Ventana sin acotar · no atribuible
        </span>
        <p className="mt-2 text-[12.5px] leading-relaxed text-dark-400">
          {!a.acotada
            ? 'No hay ninguna inspección anterior de este vehículo, así que la ventana no tiene principio: el daño pudo aparecer en cualquier momento.'
            : `Entre la última inspección limpia y ésta pasaron ${a.turnos.length} turnos con ${a.nombres.length} conductores distintos.`}
          {' '}<b className="font-semibold text-dark-200">Esto no señala a nadie</b>, y el sistema no va a fingir lo contrario.
        </p>
        <p className="mt-1.5 text-[12px] text-dark-600">
          Para estrechar la ventana hace falta inspeccionar más a menudo. Es una decisión de operación, no de software.
        </p>
      </div>
    )
  }

  return (
    <div className={`mt-3 rounded-xl border p-3.5 ${a.cerrada ? 'border-emerald-500/20 bg-emerald-500/[0.05]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className={`font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] ${a.cerrada ? 'text-emerald-400' : 'text-dark-500'}`}>
          {a.cerrada ? 'Ventana cerrada · 1 turno' : `Ventana abierta · ${a.turnos.length} turnos`}
        </span>
      </div>

      <div className="flex flex-wrap items-stretch gap-1">
        {a.turnos.map((t) => (
          <div key={t.date} className={`flex-1 rounded-lg px-2.5 py-2 ${a.cerrada ? 'bg-emerald-500/10' : 'bg-white/[0.04]'}`} style={{ minWidth: 96 }}>
            <div className="text-[10.5px] tabular-nums text-dark-500">
              {new Date(t.date + 'T12:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </div>
            <div className="mt-0.5 truncate text-[12.5px] font-semibold text-dark-100">{t.slot.driver_name}</div>
          </div>
        ))}
      </div>

      <p className="mt-2.5 text-[12px] leading-relaxed text-dark-500">
        {a.cerrada
          ? 'Sólo una persona llevó la furgoneta entre la inspección limpia y la que encontró el daño. Es la ventana más estrecha posible con estos datos.'
          : `El daño apareció en algún momento de estos ${a.turnos.length} turnos. Con una inspección por turno la ventana se cerraría a una sola persona; hoy no se puede estrechar más.`}
      </p>
    </div>
  )
}
