/* ─────────────────────────────────────────────────────────────────────────────
   VIDA — PREVISUALIZACIÓN DEL COMPONENTE YA INTEGRADO
   ---------------------------------------------------------------------------
   Esto NO es una copia del gráfico: importa el componente REAL que se ha metido
   en la ficha del vehículo (`panel/components/VidaVehiculo`), y lo alimenta con
   un ledger con la MISMA FORMA que devuelve el backend:

       GET /api/vehicles/{id}/damage-ledger  →  { open: [...], repaired: [...] }

   Sirve para dos cosas:
   · Verlo sin credenciales ni backend, que en producción vive dentro de la
     pestaña Historial de una furgoneta y hay que estar dentro para llegar.
   · Que lo que se aprueba aquí sea exactamente lo que se ve allí. Si esta vista
     se separase del componente de producción dejaría de servir para nada.

   Datos: LAB/SIMULATED (datosPlus).
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react'
import VidaVehiculo from '../../components/VidaVehiculo'
import { vehiculos, danos } from '../app2/datosPlus'

export default function VidaPreview({ center }) {
  const flota = useMemo(
    () => vehiculos.filter((v) => center === 'Todos' || !center || v.center === center),
    [center],
  )

  /* Un ledger por vehículo, con la forma exacta del backend */
  const porVehiculo = useMemo(() => {
    const m = {}
    for (const d of danos) {
      const l = (m[d.vehicle_id] ||= { open: [], repaired: [] })
      const e = {
        vehicle_id: d.vehicle_id, panel: d.panel, part: d.part,
        severity: d.severity, first_seen: d.first_seen,
      }
      if (d.repair_status === 'done') l.repaired.push({ ...e, status: 'repaired', repaired_at: d.repaired_at })
      else l.open.push({ ...e, status: 'open' })
    }
    return m
  }, [])

  /* Se abre por el que más historia tiene: un gráfico vacío no se puede juzgar */
  const conDanos = flota
    .map((v) => ({ v, n: (porVehiculo[v.id]?.open.length || 0) + (porVehiculo[v.id]?.repaired.length || 0) }))
    .sort((a, b) => b.n - a.n)
  const [sel, setSel] = useState(conDanos[0]?.v.id || null)
  const activo = flota.find((v) => v.id === sel) || conDanos[0]?.v

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-xl font-bold text-dark-50">Vida del vehículo</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-dark-400">
          Ya integrado en la app real: ficha de la furgoneta → pestaña <b className="font-semibold text-dark-200">Historial</b>,
          encima de la línea de eventos. La lista de abajo dice qué pasó y cuándo; esto dice cuánto duró.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {conDanos.slice(0, 14).map(({ v, n }) => (
          <button
            key={v.id}
            onClick={() => setSel(v.id)}
            className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium tabular-nums transition ${
              activo?.id === v.id
                ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/40'
                : 'bg-dark-800/60 text-dark-400 hover:text-dark-200'
            }`}
          >
            {v.license_plate} <span className="opacity-50">· {n}</span>
          </button>
        ))}
      </div>

      {activo ? (
        <VidaVehiculo ledger={porVehiculo[activo.id] || { open: [], repaired: [] }} />
      ) : (
        <p className="text-[13px] text-dark-500">No hay furgonetas en este centro.</p>
      )}
    </div>
  )
}
