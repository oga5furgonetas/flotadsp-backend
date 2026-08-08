/* LAB · VERSIÓN C — Memoria del vehículo
   ---------------------------------------------------------------------------
   Ésta es la única de las cuatro que no reordena información existente: usa un
   dato que YA se guarda y que hoy no tiene pantalla.

   `vehicle_damage_ledger` lleva desde el principio el registro panel a panel de
   cada furgoneta, con `first_seen`, `first_seen_inspection`, `status` y
   `repaired_at`. Pero se construyó para una cosa distinta: evitar que la IA
   volviera a cantar como nuevo un daño ya conocido. Es decir, existe como
   MECANISMO INTERNO DE SUPRESIÓN, no como memoria consultable.

   Cruzarlo con `daily_assignments` (que dice quién llevaba cada furgoneta cada
   día) da la ventana de atribución: entre la inspección que vio el daño y la
   anterior que no lo vio, sólo hubo N turnos y se sabe de quién.

   Lo que este prototipo NO hace, a propósito: señalar culpables. Enseña la
   ventana. Si tiene tres turnos, tiene tres. La tentación de "el más probable"
   es exactamente la que fabrica falsos positivos caros con las personas. */
import { useState } from 'react'
import { DATOS_SINTETICOS } from './datos'
import { lineaVehiculo, fecha } from './motor'
import { BandaSintetica, Cabecera, Clase } from './ui'

const SEV = { leve: '#fbbf24', moderado: '#fb923c', grave: '#f87171', critico: '#ef4444', sin_danos: '#34d399' }

export default function Vehiculo({ datos = DATOS_SINTETICOS, cabecera = true }) {
  const { vehiculos = [], ledger = [], inspecciones = [] } = datos
  const [sel, setSel] = useState(vehiculos[0]?.id || null)
  const v = vehiculos.find((x) => x.id === sel)
  const linea = v ? lineaVehiculo(datos, sel) : []
  const abiertos = ledger.filter((l) => l.vehicle_id === sel && l.status === 'open')
  const reparados = ledger.filter((l) => l.vehicle_id === sel && l.status === 'repaired')
  const insp = inspecciones.filter((i) => i.vehicle_id === sel)

  if (!v) {
    return (
      <div className="mx-auto max-w-4xl">
        {cabecera && <Cabecera titulo="Memoria del vehículo" bajada="" />}
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-[14px] text-amber-200">
          No hay vehículos en esta fuente de datos. Sin flota no hay nada que recordar.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      {cabecera && (
        <>
          <Cabecera
            titulo="Memoria del vehículo"
            bajada="Todo lo que le ha pasado a una furgoneta sobre un mismo eje de tiempo. Hoy esta información existe, pero repartida entre cuatro pantallas distintas y sin orden cronológico."
          />
          <BandaSintetica />
        </>
      )}

      <div className="mb-7 flex flex-wrap gap-1.5">
        {vehiculos.map((x) => (
          <button
            key={x.id}
            onClick={() => setSel(x.id)}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold tabular-nums transition-colors ${
              sel === x.id ? 'bg-white/[0.1] text-dark-50' : 'text-dark-500 hover:bg-white/[0.04] hover:text-dark-300'}`}
          >
            {x.license_plate}
            {x.status === 'taller' && <span className="ml-1.5 text-[10px] text-amber-400">taller</span>}
          </button>
        ))}
      </div>

      <div className="grid gap-x-12 lg:grid-cols-12">
        {/* ── Estado actual: el cuerpo de la furgoneta panel a panel ── */}
        <div className="lg:col-span-5">
          <section className="rise">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">Estado del cuerpo</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-dark-400">
              {v.brand} {v.model}
              {v.mileage ? ` · ${v.mileage.toLocaleString('es-ES')} km` : ''}
              {v.provider ? ` · ${v.provider}` : ''}
            </p>

            <div className="mt-4 space-y-1.5">
              {abiertos.map((l) => (
                <div key={l.panel} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3.5 py-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SEV[l.severity] }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-dark-100">{l.part}</div>
                    <div className="text-[11.5px] text-dark-500">
                      {l.severity} · abierto desde el {fecha(l.first_seen)}
                    </div>
                  </div>
                  <Clase id="estimacion" mini />
                </div>
              ))}
              {abiertos.length === 0 && (
                <p className="rounded-xl bg-emerald-500/[0.07] px-3.5 py-2.5 text-[13.5px] text-emerald-300">
                  Sin daños abiertos en el registro.
                </p>
              )}
            </div>

            {reparados.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-dark-600">Ya reparados</h3>
                {reparados.map((l) => (
                  <div key={l.panel} className="flex items-baseline gap-2 py-1 text-[12.5px]">
                    <span className="text-dark-400 line-through">{l.part}</span>
                    <span className="text-dark-600">{l.repaired_at ? fecha(l.repaired_at) : ''}</span>
                  </div>
                ))}
                <p className="mt-2 text-[11.5px] leading-relaxed text-dark-600">
                  Un panel reparado vuelve a cero: un golpe posterior ahí cuenta otra vez como nuevo.
                  Es lo que hace justo el recuento de daños por conductor.
                </p>
              </div>
            )}
          </section>

          {/* Cadencia de inspección: determina lo estrecha que puede ser la
              ventana de atribución. Es el dato que decide si el sistema puede
              atribuir daños o no, así que se enseña sin adornos. */}
          <section className="rise mt-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <h3 className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-dark-600">
              Cadencia de inspección
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-dark-400">
              {insp.length} inspecciones registradas de esta furgoneta.
              {' '}<b className="font-semibold text-dark-100">Cuanto más seguidas, más estrecha la ventana</b> en la
              que puede haber aparecido un daño. Con una inspección por turno, la ventana es una persona;
              con una por semana, son siete y no atribuye nada.
            </p>
          </section>
        </div>

        {/* ── La línea de tiempo ── */}
        <div className="mt-10 lg:col-span-7 lg:mt-0">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">Línea de tiempo</h2>
          <div className="relative mt-4 pl-5">
            <div className="absolute bottom-2 left-[3px] top-2 w-px bg-white/[0.08]" />
            {linea.map((e, i) => (
              <div key={i} className="rise relative pb-6" style={{ animationDelay: `${Math.min(i * 35, 250)}ms` }}>
                <span
                  className="absolute -left-5 top-[6px] h-[7px] w-[7px] rounded-full ring-4 ring-dark-950"
                  style={{ background: e.futuro ? '#4b4b53' : e.grave ? '#f87171' : e.tipo === 'reparacion' ? '#34d399' : '#8f8f98' }}
                />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-[11px] tabular-nums text-dark-600">{fecha(e.fecha)}</span>
                  {e.futuro && <span className="text-[10px] font-semibold uppercase tracking-wider text-dark-600">futuro</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <h4 className={`text-[14px] font-semibold ${e.grave ? 'text-red-300' : 'text-dark-100'}`}>{e.titulo}</h4>
                  <Clase id={e.clase} mini />
                </div>
                {e.detalle && <p className="mt-0.5 text-[12.5px] text-dark-500">{e.detalle}</p>}
              </div>
            ))}
          </div>

          <p className="mt-2 border-t border-white/[0.06] pt-4 text-[12px] leading-relaxed text-dark-600">
            Las inspecciones y los daños llevan etiqueta de <b>estimación</b> porque la severidad y la
            existencia del daño las decide un modelo. Las reparaciones y las fechas de ITV son
            <b> hechos</b>: los escribió una persona en un campo.
          </p>
        </div>
      </div>
    </div>
  )
}
