/* ─────────────────────────────────────────────────────────────────────────────
   COCKPIT · superficie 2 — FLOTA
   ---------------------------------------------------------------------------
   Sustituye conceptualmente a: Vehiculos, Conductores, Inspecciones,
   Incidencias, Talleres, Scorecard, WHC y Turnos. Ocho pantallas que hablan de
   dos únicas cosas: furgonetas y personas.

   Decisión de diseño: UNA tabla, no ocho. La profundidad no se consigue con
   más pantallas sino abriendo la fila. Cada columna existe porque cambia una
   decisión; si no cambia ninguna, no está.

   Lo que NO se hace: una columna "riesgo" con un número. Con estos datos sería
   azar disfrazado de puntuación.
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import { generarSenales, memoriaVehiculo, hm } from '../motor'

const TIER = { Fantastic: '#34d399', Great: '#38bdf8', Fair: '#fbbf24', Poor: '#f87171' }
const SEV = { leve: '#fbbf24', moderado: '#fb923c', grave: '#f87171', critico: '#ef4444' }

export default function Flota({ D, onAbrirEntidad }) {
  const [tipo, setTipo] = useState('vehiculo')
  const [q, setQ] = useState('')
  const senales = useMemo(() => generarSenales(D), [D])

  const nSenales = (pred) => senales.filter(pred).length

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (tipo === 'vehiculo') {
      return D.vehiculos
        .filter((v) => !t || `${v.license_plate} ${v.brand} ${v.model}`.toLowerCase().includes(t))
        .map((v) => {
          const abiertos = (D.ledger || []).filter((l) => l.vehicle_id === v.id && l.status === 'open')
          const peor = abiertos.sort((a, b) => (b.rank || 0) - (a.rank || 0))[0]
          const mem = memoriaVehiculo(D, v.id)
          return {
            id: v.id, tipo: 'vehiculo', principal: v.license_plate,
            secundario: `${v.brand} ${v.model}`,
            estado: v.status === 'taller' ? { txt: 'En taller', color: '#fbbf24' } : null,
            marca: peor ? { txt: `${abiertos.length} daño${abiertos.length > 1 ? 's' : ''} abierto${abiertos.length > 1 ? 's' : ''}`, color: SEV[peor.severity] } : null,
            memoria: mem.repeticiones.length > 0 ? `${mem.repeticiones[0].n} × ${mem.repeticiones[0].tipo}` : null,
            n: nSenales((s) => s.titulo.includes(v.license_plate)),
          }
        })
    }
    return D.conductores
      .filter((c) => !t || c.name.toLowerCase().includes(t))
      .map((c) => {
        const sc = (D.scorecardConductores || []).find((s) => s.driver_id === c.id)
        const w = (D.whc?.conductores || []).find((x) => x.driver_id === c.id)
        const ruta = (D.rutas || []).find((r) => r.driver_id === c.id)
        const pasa = w && D.whc && w.proyeccion > D.whc.limite_min
        return {
          id: c.id, tipo: 'conductor', principal: c.name,
          secundario: `${c.nivel || '—'} · ${c.contrato || '—'}`,
          estado: sc ? { txt: sc.tier, color: TIER[sc.tier] } : null,
          marca: pasa ? { txt: `proyecta ${hm(w.proyeccion)}`, color: '#f87171' } : (w ? { txt: hm(w.trabajado), color: '#8f8f98' } : null),
          memoria: ruta ? `${ruta.delivered}/${ruta.total}` : null,
          n: nSenales((s) => s.titulo.includes(c.name) || s.resumen?.includes(c.name)),
        }
      })
  }, [D, tipo, q, senales])   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 sm:px-8">
      <header className="rise">
        <h1 className="font-display text-[clamp(26px,3.4vw,36px)] font-semibold leading-[1.08] tracking-[-0.03em] text-dark-50">
          Flota
        </h1>
        <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-dark-400">
          Furgonetas y personas en una sola lista. Pulsa una fila para abrir su ficha completa: hoy eso son
          siete pantallas distintas.
        </p>
      </header>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <div className="flex gap-0.5 rounded-lg bg-white/[0.05] p-0.5">
          {[['vehiculo', `Furgonetas ${D.vehiculos.length}`], ['conductor', `Equipo ${D.conductores.length}`]].map(([id, txt]) => (
            <button
              key={id}
              onClick={() => setTipo(id)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                tipo === id ? 'bg-white/[0.1] text-dark-50' : 'text-dark-500 hover:text-dark-200'}`}
            >
              {txt}
            </button>
          ))}
        </div>
        <div className="relative min-w-[180px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dark-600" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tipo === 'vehiculo' ? 'Matrícula o modelo…' : 'Nombre…'}
            className="input pl-9"
          />
        </div>
      </div>

      <div className="mt-6 divide-y divide-white/[0.05]">
        {filas.map((f, i) => (
          <button
            key={f.id}
            onClick={() => onAbrirEntidad({ tipo: f.tipo, id: f.id })}
            className="float-row group -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-3 rounded-xl px-3 py-3.5 text-left"
            style={{ animationDelay: `${Math.min(i * 25, 200)}ms` }}
          >
            <div className="min-w-0 flex-[2]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14.5px] font-semibold tracking-[-0.01em] text-dark-50">{f.principal}</span>
                {f.estado && (
                  <span className="rounded-full px-1.5 py-0 text-[9.5px] font-bold uppercase tracking-wider"
                    style={{ color: f.estado.color, background: f.estado.color + '18' }}>{f.estado.txt}</span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11.5px] text-dark-600">{f.secundario}</div>
            </div>

            <div className="hidden min-w-0 flex-1 sm:block">
              {f.marca && (
                <span className="text-[12.5px]" style={{ color: f.marca.color }}>{f.marca.txt}</span>
              )}
            </div>

            <div className="hidden w-[110px] shrink-0 md:block">
              {f.memoria && (
                <span className="flex items-center gap-1.5 text-[12px] text-dark-500">
                  {f.tipo === 'vehiculo' && <AlertTriangle size={11.5} className="text-amber-400/80" />}
                  {f.memoria}
                </span>
              )}
            </div>

            <div className="w-[74px] shrink-0 text-right">
              {f.n > 0 && (
                <span className="text-[11.5px] tabular-nums text-dark-400">
                  {f.n} señal{f.n > 1 ? 'es' : ''}
                </span>
              )}
            </div>
          </button>
        ))}

        {filas.length === 0 && (
          <p className="py-14 text-center text-[14px] text-dark-500">Nada coincide con «{q}».</p>
        )}
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-dark-600">
        No hay columna de «riesgo» a propósito: con estos datos, una puntuación por conductor o por vehículo
        sería azar con aspecto de métrica.
      </p>
    </div>
  )
}
