/* LAB · VERSIÓN D — Confianza
   ---------------------------------------------------------------------------
   La pregunta que ninguna pantalla de FlotaDSP responde hoy: ¿de cuándo son
   estos números?

   Importa más de lo que parece. Las fuentes del producto tienen frescuras muy
   distintas y ninguna lo dice: Cortex captura sola cada pocos minutos, el plan
   de horas se PEGA A MANO (si nadie lo pegó el lunes, el WHC de la semana es
   de la semana pasada) y el scorecard llega con días de retraso estructural.
   Un número viejo con pinta de fresco es la peor mentira que puede contar un
   panel, y aquí ya ha pasado.

   La segunda mitad de la pantalla es la lista de lo que el producto NO puede
   afirmar, con la prueba de por qué. No es humildad decorativa: son resultados
   negativos documentados, y tenerlos a la vista es lo que impide que dentro de
   seis meses alguien vuelva a construir el predictor que ya se descartó. */
import { fuentes } from './datos'
import { NO_DEMOSTRABLE } from './motor'
import { BandaSintetica, Cabecera, Clase } from './ui'

export default function Confianza() {
  const filas = Object.entries(fuentes).map(([k, f]) => {
    const min = Math.round((Date.now() - Date.parse(f.actualizado)) / 60000)
    return { k, ...f, min }
  }).sort((a, b) => b.min - a.min)

  return (
    <div className="mx-auto max-w-3xl">
      <Cabecera
        titulo="Confianza"
        bajada="De cuándo es cada número, cómo llega y qué pasa si nadie lo actualiza. Y debajo, lo que el producto no puede afirmar aunque lo parezca."
      />
      <BandaSintetica />

      <section className="rise">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">Frescura de las fuentes</h2>
        <div className="mt-4 divide-y divide-white/[0.05]">
          {filas.map((f) => {
            const viejo = f.min > 60 * 24 || f.desfase_dias > 0
            const txt = f.min < 60 ? `hace ${f.min} min`
              : f.min < 60 * 36 ? `hace ${Math.round(f.min / 60)} h`
              : `hace ${Math.round(f.min / 1440)} días`
            return (
              <div key={f.k} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${viejo ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                <span className="text-[14px] font-semibold text-dark-100">{f.etiqueta}</span>
                <span className={`text-[13px] tabular-nums ${viejo ? 'text-amber-400' : 'text-dark-400'}`}>{txt}</span>
                <span className="ml-auto text-[11.5px] text-dark-600">
                  {f.modo === 'manual' ? 'se mete a mano' : 'automático'}
                  {f.desfase_dias > 0 && ` · +${f.desfase_dias} días de desfase de origen`}
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[13px] leading-relaxed text-dark-400">
            Las fuentes <b className="font-semibold text-dark-100">manuales</b> son las peligrosas: no fallan
            con un error, fallan quedándose quietas. El plan de horas no avisa de que nadie lo ha pegado esta
            semana — simplemente sigue enseñando el de la anterior como si fuera el de ahora.
          </p>
        </div>
      </section>

      <section className="mt-10 border-t border-white/[0.06] pt-8">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">
          Lo que este producto no puede afirmar
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-dark-400">
          Cada uno de estos se intentó, se midió contra datos reales y se descartó. Están aquí para que no
          se vuelvan a construir por accidente.
        </p>

        <div className="mt-5 space-y-3">
          {NO_DEMOSTRABLE.map((n) => (
            <article key={n.pregunta} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Clase id="nodem" />
                <h3 className="text-[15.5px] font-semibold leading-snug text-dark-50">{n.pregunta}</h3>
              </div>
              <p className="mt-2 text-[14px] font-medium text-dark-200">{n.veredicto}</p>

              <dl className="mt-3 space-y-2.5">
                <Fila k="La prueba" v={n.prueba} />
                <Fila k="Qué haría falta" v={n.quefaltaria} />
                <Fila k="Qué se hace en su lugar" v={n.encambio} bien />
              </dl>

              <p className="mt-3 font-mono text-[11px] text-dark-600">{n.fuente}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function Fila({ k, v, bien }) {
  return (
    <div>
      <dt className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-dark-600">{k}</dt>
      <dd className={`mt-0.5 text-[13px] leading-relaxed ${bien ? 'text-emerald-400/85' : 'text-dark-400'}`}>{v}</dd>
    </div>
  )
}
