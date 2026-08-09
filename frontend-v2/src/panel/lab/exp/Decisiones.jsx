/* ─────────────────────────────────────────────────────────────────────────────
   PRODUCTO 4b · DECISIONES — las señales como acciones
   ─────────────────────────────────────────────────────────────────────────────
   QUÉ ES  Una capa sobre el feed de señales que convierte las excepciones
            en decisiones concretas. No es un botón que diga "ver detalles".
            Es un botón que dice "reasignar 9h de X a Y" o "llamar al
            conductor de CX-103".

   POR QUÉ  El manager no paga por saber que tiene 12 señales. Paga por
            saber QUÉ DECIDIR y QUÉ PASA SI NO DECIDE.

   CÓMO FUNCIONA
            1. Carga el mismo paquete de datos que Senales.jsx
            2. Genera las señales con el motor
            3. Transforma las señales más accionables en decisiones
            4. Cada decisión muestra: acción, consecuencia, atajo
   ───────────────────────────────────────────────────────────────────────────── */

import { useMemo } from 'react'
import { Clock, Wrench, Phone, Calendar, ClipboardCheck, AlertTriangle } from 'lucide-react'
import { generarSenales } from '../motor'

const hm = (min) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`

export default function Decisiones({ datos }) {
  if (!datos) return <p className="text-[13px] text-dark-500">Cargando…</p>

  const senales = generarSenales(datos)
  const decisiones = useMemo(() => transformar(senales, datos), [senales, datos])

  if (decisiones.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-dark-600">
        <ClipboardCheck size={24} />
        <span className="text-sm">No hay decisiones pendientes hoy.</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {decisiones.map((d, i) => {
        const Ic = d.icono
        return (
          <div key={d.id}
            className="rise card overflow-hidden"
            style={{ animationDelay: `${Math.min(i * 40, 300)}ms` }}>
            <div className="p-5">
              <div className="flex items-start gap-3">
                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${d.bg}`}>
                  <Ic size={16} className={d.texto} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-dark-500">{d.area}</p>
                  <h3 className="mt-1 text-[15px] font-semibold leading-snug text-dark-50">{d.titulo}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-dark-400">{d.porque}</p>

                  {d.accion && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button className="btn-primary text-[12.5px]">{d.accion.txt}</button>
                      <span className="text-[11.5px] text-dark-600">→ {d.accion.destino}</span>
                    </div>
                  )}

                  {d.consecuencia && (
                    <div className="mt-3 rounded-lg bg-white/[0.03] p-3">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark-600">Si no lo haces</p>
                      <p className="mt-1 text-[12.5px] text-dark-400">{d.consecuencia}</p>
                    </div>
                  )}

                  {d.evidencia && d.evidencia.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[12px] text-dark-500 transition-colors hover:text-dark-300">
                        Ver evidencia ({d.evidencia.length} campos)
                      </summary>
                      <div className="mt-2 space-y-1">
                        {d.evidencia.map((e, k) => (
                          <div key={k} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
                            <span className="min-w-[100px] text-dark-500">{e.k}</span>
                            <span className={`font-medium ${e.color || 'text-dark-200'}`}>{e.v}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Transformador de señales → decisiones ── */

function transformar(senales, datos) {
  const out = []

  for (const s of senales) {
    if (s.clase === 'nodem') continue

    /* WHC: conductor que pasa el límite si completa lo planificado */
    if (s.area === 'Horas' && s.titulo.includes('pasa tu límite semanal')) {
      const nombre = s.titulo.match(/^(.+?) pasa/)?.[1] || 'Conductor'
      const horasExtra = s.calculo?.match(/\+ (\d+h \d+m) del bloque/)?.[1]
      out.push({
        id: s.id, area: s.area, ...s,
        titulo: `¿Reasignas el último bloque de ${nombre}?`,
        porque: `Si completa lo planificado, trabaja ${horasExtra || 'más'} y supera el límite semanal.`,
        icono: Clock, bg: 'bg-amber-500/10', texto: 'text-amber-300',
        accion: { txt: 'Reasignar bloque', destino: 'WHC' },
        consecuencia: `${nombre} supera tu límite de horas. Puede generar excepción en Amazon y afectar el WHC de la semana.`,
        evidencia: s.evidencia,
      })
      continue
    }

    /* Daño sin gestionar antiguo */
    if (s.area === 'Daños' && s.titulo.includes('Daño') && s.titulo.includes('nuevo')) {
      const vehiculo = s.evidencia?.find(e => e.k === 'Vehículo')?.v || '—'
      const panel = s.evidencia?.find(e => e.k === 'Panel')?.v || '—'
      const antig = s.calculo?.match(/desde el (\d+)/)?.[1] || '?'
      out.push({
        id: s.id, area: s.area, ...s,
        titulo: `¿Asignas taller al daño de ${vehiculo}?`,
        porque: `Lleva ${antig} días sin gestionar. Mientras siga así, no se ha decidido quién lo paga.`,
        icono: Wrench, bg: 'bg-amber-500/10', texto: 'text-amber-300',
        accion: { txt: 'Asignar taller', destino: 'Talleres' },
        consecuencia: `El daño sigue sin dueño. Por defecto, lo pagas tú.`,
        evidencia: s.evidencia,
      })
      continue
    }

    /* Parón en ruta */
    if (s.area === 'Reparto' && s.titulo.includes('sin entregar')) {
      const ruta = s.titulo.match(/^(.+?) lleva/)?.[1] || 'Ruta'
      const minutos = s.titulo.match(/(\d+h \d+m) sin/)?.[1] || '?'
      const pendientes = s.evidencia?.find(e => e.k === 'Pendientes')?.v || '?'
      out.push({
        id: s.id, area: s.area, ...s,
        titulo: `¿Llamas al conductor de ${ruta}?`,
        porque: `Lleva ${minutos} sin entregar paquetes. Tiene ${pendientes} pendientes.`,
        icono: Phone, bg: 'bg-red-500/10', texto: 'text-red-300',
        accion: { txt: 'Llamar', destino: 'Chat' },
        consecuencia: `Si la parada se alarga, la ruta puede acabar tarde. El parón caza el 70 % de las rutas que acaban mal.`,
        evidencia: s.evidencia,
      })
      continue
    }

    /* Falta de inspección hoy */
    if (s.id === 'sin-inspeccion-hoy') {
      const faltan = s.resumen?.match(/(\d+) furgoneta/)?.[1] || '?'
      out.push({
        id: s.id, area: s.area, ...s,
        titulo: `¿Avisas a los conductores de las ${faltan} furgonetas?`,
        porque: 'Están asignadas hoy pero no tienen inspección. Sin inspección no hay parte de daños, y sin parte no se pueden reclamar al renting.',
        icono: ClipboardCheck, bg: 'bg-sky-500/10', texto: 'text-sky-300',
        accion: { txt: 'Avisar', destino: 'Chat' },
        consecuencia: 'Si no se inspeccionan, los daños de hoy no tendrán ventana de atribución mañana.',
        evidencia: s.evidencia,
      })
      continue
    }

    /* ITV próxima a caducar */
    if (s.area === 'Flota' && s.titulo.includes('ITV')) {
      const matricula = s.evidencia?.find(e => e.k === 'Matrícula')?.v || '—'
      const dias = s.titulo.match(/a (\d+) días/)?.[1] || s.titulo.includes('caducada') ? '0' : '?'
      out.push({
        id: s.id, area: s.area, ...s,
        titulo: dias === '0'
          ? `¿Sacas de circulación ${matricula}?`
          : `¿Reservas cita ITV para ${matricula}?`,
        porque: dias === '0'
          ? 'La ITV está caducada. El vehículo no debería circular.'
          : `Quedan ${días} días. Si se pasa, el vehículo no puede circular y la flota se reduce.`,
        icono: Calendar, bg: 'bg-red-500/10', texto: 'text-red-300',
        accion: { txt: dias === '0' ? 'Sacar de circulación' : 'Reservar cita', destino: 'Talleres' },
        consecuencia: dias === '0'
          ? 'Vehículo circulando sin ITV: multa y posible inmovilización.'
          : `Si no se renueva en ${días} días, el vehículo queda fuera de servicio.`,
        evidencia: s.evidencia,
      })
      continue
    }

    /* Señal genérica: se queda como está */
    out.push({
      id: s.id, area: s.area, ...s,
      titulo: s.titulo,
      porque: s.resumen,
      icono: AlertTriangle, bg: 'bg-white/[0.05]', texto: 'text-dark-300',
      accion: s.acciones?.[0] ? { txt: s.acciones[0].txt, destino: s.area } : null,
      consecuencia: null,
      evidencia: s.evidencia,
    })
  }

  return out.sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0))
}
