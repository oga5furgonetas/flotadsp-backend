/* LAB · VERSIÓN B — Parte de la jornada
   ---------------------------------------------------------------------------
   Misma materia prima que la Versión A, forma opuesta: en vez de una lista de
   tarjetas iguales, un texto corto que se lee entero en 30 segundos y termina
   diciendo qué NO sabemos hoy.

   Hipótesis: el gestor abre el panel entre dos llamadas. Un feed obliga a
   escanear; un párrafo se lee. Y la jerarquía la pone la prosa, no el color.

   Riesgo conocido de esta versión (a evaluar): la prosa esconde el detalle y
   no escala — con 40 señales esto es ilegible. Está pensada para 3-6. */
import { useMemo, useState } from 'react'
import { generarSenales, NO_DEMOSTRABLE } from './motor'
import { DATOS_SINTETICOS } from './datos'
import { BandaSintetica, Cabecera, Clase, PorQue, Acciones, Frescura } from './ui'

export default function Parte({ datos = DATOS_SINTETICOS }) {
  const { fuentes = {}, whc, cortexOverview = {}, rutas = [] } = datos
  const senales = useMemo(() => generarSenales(datos), [datos])
  const criticas = senales.filter((s) => s.prioridad >= 84)
  const resto = senales.filter((s) => s.prioridad < 84 && s.clase !== 'nodem')
  const [abierta, setAbierta] = useState(criticas[0]?.id || null)

  const entregados = rutas.reduce((a, r) => a + r.delivered, 0)
  const totalPk = rutas.reduce((a, r) => a + r.total, 0)

  return (
    <div className="mx-auto max-w-2xl">
      <Cabecera
        titulo="El parte"
        bajada="Lo que hay que saber hoy, en el orden en que importa, escrito para leerse entero."
      />
      <BandaSintetica />

      {/* ── El párrafo. Lo primero que se lee, sin un solo widget. ── */}
      <section className="rise border-y border-white/[0.06] py-7">
        <p className="text-[19px] font-light leading-[1.6] tracking-[-0.01em] text-dark-200">
          {criticas.length > 0 ? (
            <>
              Hay <b className="font-semibold text-dark-50">{criticas.length} cosas</b> que no pueden esperar a mañana.{' '}
              {/* Sin toLowerCase: se comía las siglas y las matrículas
                  («1002 LAB» pasaba a «1002 lab», «ITV» a «itv»). */}
              {criticas.slice(0, 2).map((s, i) => (
                <span key={s.id}>
                  {i > 0 && ' y '}
                  <button
                    onClick={() => setAbierta(abierta === s.id ? null : s.id)}
                    className="border-b border-dashed border-dark-600 text-left text-dark-50 transition-colors hover:border-brand-400 hover:text-brand-300"
                  >
                    {s.titulo}
                  </button>
                </span>
              ))}
              .
            </>
          ) : (
            <>Hoy no hay nada urgente. Es un buen día.</>
          )}{' '}
          <span className="text-dark-400">
            El reparto va por <b className="font-medium text-dark-200">{entregados}</b> de {totalPk} paquetes
            en {rutas.length} rutas, con {cortexOverview.missing_now} paquetes en paradero desconocido.
          </span>
        </p>

        <p className="mt-4 text-[13px] text-dark-500">
          <Frescura fuente="cortex" fuentes={fuentes} />
        </p>
      </section>

      {/* ── Las críticas, desplegables desde el párrafo ── */}
      <section className="py-7">
        <h2 className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">
          No puede esperar
        </h2>
        <div className="divide-y divide-white/[0.05]">
          {criticas.map((s) => (
            <div key={s.id} className="py-4">
              <button onClick={() => setAbierta(abierta === s.id ? null : s.id)} className="w-full text-left">
                <div className="flex items-start gap-3">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-semibold leading-snug text-dark-50">{s.titulo}</h3>
                      <Clase id={s.clase} mini />
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-dark-400">{s.resumen}</p>
                  </div>
                </div>
              </button>
              {abierta === s.id && (
                <div className="animate-fade-in ml-[18px] mt-2">
                  <Acciones acciones={s.acciones} />
                  <PorQue senal={s} fuentes={fuentes} />
                </div>
              )}
            </div>
          ))}
          {criticas.length === 0 && <p className="py-3 text-[14px] text-emerald-400/90">Nada crítico.</p>}
        </div>
      </section>

      {/* ── El resto, en una línea cada uno ── */}
      {resto.length > 0 && (
        <section className="border-t border-white/[0.06] py-7">
          <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">
            Puede esperar, pero está ahí
          </h2>
          <ul className="space-y-2">
            {resto.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
                <span className="text-dark-300">{s.titulo}</span>
                <Clase id={s.clase} mini />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── El cierre: lo que hoy NO se puede afirmar ────────────────────────
          Esto es lo que más distingue al parte de un dashboard. Un panel normal
          termina cuando se acaban los datos; aquí termina diciendo dónde está
          el límite de lo que sabe, para que nadie rellene el hueco a ojo. */}
      <section className="border-t border-white/[0.06] py-7">
        <h2 className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">
          Lo que hoy no se puede afirmar
        </h2>
        <p className="mb-4 text-[13px] text-dark-500">
          No por falta de ganas: se probó y no salió. Cada punto tiene su prueba.
        </p>
        <div className="space-y-3">
          {NO_DEMOSTRABLE.slice(0, 2).map((n) => (
            <div key={n.pregunta} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[14px] font-semibold text-dark-100">{n.pregunta}</h3>
                <Clase id="nodem" mini />
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-dark-400">{n.veredicto}</p>
              <p className="mt-2 text-[12px] leading-relaxed text-dark-500">{n.prueba}</p>
              <p className="mt-2 text-[12px] leading-relaxed text-emerald-400/80">En su lugar: {n.encambio}</p>
            </div>
          ))}
        </div>
      </section>

      {whc?.pegado_el && (
        <p className="pb-10 text-[12px] text-dark-600">
          Plan de horas pegado el {new Date(whc.pegado_el).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
          {whc.semana ? ` · semana ${whc.semana}` : ''}
        </p>
      )}
      {!whc && (
        <p className="pb-10 text-[12px] text-amber-400/80">
          No hay plan de horas pegado esta semana: el bloque de WHC está vacío por falta de datos, no porque todo vaya bien.
        </p>
      )}
    </div>
  )
}
