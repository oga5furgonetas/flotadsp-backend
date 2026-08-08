/* ─────────────────────────────────────────────────────────────────────────────
   LAB · E07 — QUÉ HA CAMBIADO
   ---------------------------------------------------------------------------
   PROBLEMA: ninguna pantalla de FlotaDSP responde "¿qué ha cambiado desde que
   me fui?". El gestor entra por la mañana y tiene que reconstruirlo mirando
   listas ordenadas por fecha en cuatro sitios distintos.

   HALLAZGO AL CONSTRUIRLO — y es el resultado más útil de este experimento:
   un diferencial completo NO se puede hacer, y no por falta de interfaz sino
   por el MODELO DE DATOS. FlotaDSP guarda cuándo se CREÓ cada cosa, pero
   apenas guarda transiciones de estado: cuándo entró una furgoneta en taller,
   cuándo cambió de conductor o cuándo se editó una ITV se sobrescribe sin
   dejar rastro.

   Así que la pantalla hace dos cosas, y la segunda importa tanto como la
   primera: enseña lo que sí se puede diferenciar, y enseña lo que no.
   ───────────────────────────────────────────────────────────────────────────── */
import { useState } from 'react'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { DATOS_SINTETICOS } from './datos'
import { cambiosDesde, NO_DIFERENCIABLE } from './motor'
import { BandaSintetica, Cabecera, Clase } from './ui'

const VENTANAS = [[24, 'Desde ayer'], [72, '3 días'], [168, 'Una semana']]

export default function Cambios({ datos = DATOS_SINTETICOS }) {
  const [horas, setHoras] = useState(24)
  const ev = cambiosDesde(datos, horas)
  const malos = ev.filter((e) => e.malo).length
  const buenos = ev.length - malos

  return (
    <div className="mx-auto max-w-3xl">
      <Cabecera
        titulo="Qué ha cambiado"
        bajada="Lo que ha pasado desde la última vez que miraste, en una sola lista y en orden. Hoy esto no existe en ninguna pantalla."
      />
      <BandaSintetica />

      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-white/[0.06] py-3">
        <div className="flex gap-1">
          {VENTANAS.map(([h, txt]) => (
            <button
              key={h}
              onClick={() => setHoras(h)}
              className={`rounded-lg px-2.5 py-1 text-[12.5px] font-semibold transition-colors ${
                horas === h ? 'bg-white/[0.1] text-dark-50' : 'text-dark-500 hover:bg-white/[0.04] hover:text-dark-300'}`}
            >
              {txt}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-dark-400">
          <b className="font-semibold text-dark-50">{ev.length}</b> cambios
        </span>
        {malos > 0 && <span className="flex items-center gap-1 text-[12.5px] text-red-300"><ArrowUpRight size={13} />{malos} a peor</span>}
        {buenos > 0 && <span className="flex items-center gap-1 text-[12.5px] text-emerald-400"><ArrowDownRight size={13} />{buenos} a mejor o neutro</span>}
      </div>

      {ev.length === 0 ? (
        <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-[14px] leading-relaxed text-dark-400">
          Sin cambios en esa ventana. Con los datos sintéticos esto es normal en ventanas cortas; con datos reales
          significaría que nadie inspeccionó ni abrió nada.
        </p>
      ) : (
        <div className="relative space-y-0 pl-5">
          <div className="absolute bottom-3 left-[3px] top-3 w-px bg-white/[0.08]" />
          {ev.map((e, i) => (
            <div key={i} className="rise relative py-3.5" style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}>
              <span className="absolute -left-5 top-[19px] h-[7px] w-[7px] rounded-full ring-4 ring-dark-950"
                style={{ background: e.malo ? '#f87171' : '#34d399' }} />
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-[11px] tabular-nums text-dark-600">
                  {new Date(e.cuando).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <Clase id={e.clase} mini />
              </div>
              <h3 className={`mt-0.5 text-[14.5px] font-semibold ${e.malo ? 'text-red-300' : 'text-dark-100'}`}>{e.titulo}</h3>
              {e.detalle && <p className="mt-0.5 text-[12.5px] leading-relaxed text-dark-500">{e.detalle}</p>}
            </div>
          ))}
        </div>
      )}

      {/* La mitad honesta de la pantalla */}
      <section className="mt-9 border-t border-white/[0.06] pt-7">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">
          Lo que NO se puede diferenciar
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-dark-400">
          No es un límite de esta pantalla, es del modelo de datos: estas cosas se sobrescriben sin guardar el
          valor anterior, así que no hay "antes" con el que comparar.
        </p>
        <ul className="mt-4 space-y-2">
          {NO_DIFERENCIABLE.map((x, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-dark-400">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-red-400/60" />{x}
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-[13px] leading-relaxed text-dark-400">
          <b className="font-semibold text-dark-200">Qué haría falta:</b> un registro de eventos (quién cambió qué y
          cuándo). La auditoría ya lo pedía para trazabilidad y hay una ruta <code className="text-[12px]">/admin/audit-log</code> creada
          y sin pantalla. Con eso, este diferencial pasaría de la mitad a completo — y de paso resolvería el
          requisito de cumplimiento.
        </p>
      </section>
    </div>
  )
}
