import { useEffect, useMemo, useState } from 'react'
import { Loader2, MapPin, Check } from 'lucide-react'
import { parkingState, parkingReport } from '../api'

/* ═══════════════════════════════════════════════════════════════════════
   LADO DEL CONDUCTOR — "¿Dónde has aparcado?"
   ═══════════════════════════════════════════════════════════════════════
   Se muestra al terminar la auditoría. Dos trabajos, en este orden:

   1. DECIRLE dónde debe aparcar: si el coordinador ya le asignó plaza, sale
      enorme y con su zona ("Plaza 22 · Exterior junto a la nave"), y la plaza
      PARPADEA en el plano. Eso es lo "para tontos".
   2. RECOGER dónde aparcó de verdad: toca su plaza en el plano y se envía.
      Nunca damos por hecho que aparcó donde le dijimos — por eso el backend
      guarda "reported_spot" aparte y el coordinador confirma.

   NO está enganchado todavía a ninguna ruta: es el componente listo para
   activar en el flujo de auditoría cuando Dani dé el visto bueno.
   ═══════════════════════════════════════════════════════════════════════ */

const UI = {
  libre:      { fill: 'bg-white/[0.04] border-white/[0.12] border-dashed', text: 'text-dark-400', van: null },
  ocupada:    { fill: 'bg-white/[0.05] border-white/[0.14]', text: 'text-dark-300', van: '#8f8f98' },
  asignada:   { fill: 'bg-brand-500/20 border-brand-400', text: 'text-brand-200', van: '#fb923c' },
  elegida:    { fill: 'bg-emerald-500/25 border-emerald-400', text: 'text-emerald-100', van: '#34d399' },
}
const GROUND = {
  nave: 'repeating-linear-gradient(90deg,#1b1b20 0 38px,#191a1e 38px 40px), linear-gradient(#1b1b20,#17171b)',
  exterior: 'repeating-linear-gradient(0deg,#141416 0 26px,#131315 26px 28px), linear-gradient(#151517,#111113)',
  tierra: 'radial-gradient(circle at 30% 25%,rgba(120,95,60,.16),transparent 55%), linear-gradient(#1a1611,#15120e)',
  general: 'linear-gradient(#151517,#111113)',
}

export default function ParkingPicker({ center, vehicleId, driverId, inspectionId, day, onDone }) {
  const [data, setData] = useState(null)
  const [pick, setPick] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const theDay = day || new Date().toISOString().slice(0, 10)

  useEffect(() => {
    let alive = true
    parkingState(center, theDay)
      .then((r) => { if (alive) setData(r.data) })
      .catch(() => { if (alive) setErr('No se pudo cargar el plano. Puedes continuar sin indicar plaza.') })
    return () => { alive = false }
  }, [center, theDay])

  // La plaza que le hemos asignado (si la hay): es la que debe buscar
  const mine = useMemo(
    () => (data?.assignments || []).find((a) => a.vehicle_id === vehicleId), [data, vehicleId])
  const assigned = mine?.spot || null
  const zones = data?.layout?.zones || []
  const zoneOf = (code) => zones.find((z) => (z.spots || []).some((s) => s.code === code))
  // Plazas ocupadas por OTROS vehículos: no debe poder elegirlas sin darse cuenta
  const takenByOthers = useMemo(() => {
    const s = new Set()
    for (const a of (data?.assignments || [])) {
      if (a.vehicle_id === vehicleId) continue
      if (a.reported_spot) s.add(a.reported_spot)
      else if (a.spot) s.add(a.spot)
    }
    return s
  }, [data, vehicleId])

  async function send() {
    if (!pick) return
    setBusy(true); setErr('')
    try {
      await parkingReport({ center, day: theDay, spot: pick, vehicle_id: vehicleId,
                            driver_id: driverId, inspection_id: inspectionId })
      setSent(true)
      setTimeout(() => onDone?.(pick), 1200)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo enviar. Inténtalo otra vez.')
    }
    setBusy(false)
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
          <Check size={26} className="text-emerald-400" />
        </div>
        <p className="text-[15px] font-semibold text-dark-50">Plaza registrada</p>
        <p className="font-display text-[40px] font-semibold leading-none text-emerald-400">{pick}</p>
        <p className="text-[12.5px] text-dark-500">{zoneOf(pick)?.name}</p>
      </div>
    )
  }

  return (
    <div>
      {/* 1 · DÓNDE DEBE APARCAR — lo primero y bien grande */}
      {assigned && (
        <div className="mb-4 rounded-2xl border-2 border-brand-500/50 bg-brand-500/[0.08] p-4 text-center">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-brand-400/90">Aparca en</p>
          <p className="mt-1 font-display text-[46px] font-semibold leading-none tracking-tight text-brand-300">{assigned}</p>
          <p className="mt-1 text-[13px] text-dark-300">{zoneOf(assigned)?.name}</p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-dark-500">
            Búscala parpadeando en el plano. Si al final aparcas en otra, indícala abajo.
          </p>
        </div>
      )}

      <p className="mb-2 text-[13px] font-semibold text-dark-100">¿Dónde has aparcado?</p>
      {err && <p className="mb-2 rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3 py-2 text-[12px] text-red-300">{err}</p>}

      {!data ? (
        <div className="flex items-center gap-2 py-10 text-dark-500"><Loader2 size={15} className="animate-spin" /> Cargando plano…</div>
      ) : (
        <>
          {/* 2 · EL PLANO — toca tu plaza */}
          <div className="flex items-stretch justify-center gap-2 overflow-x-auto" style={{ height: 260 }}>
            {zones.map((z) => (
              <div key={z.id} className="flex h-full shrink-0 flex-col">
                <span className="mb-1 truncate text-center text-[10px] font-semibold text-dark-400">{z.name}</span>
                <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-white/[0.1]"
                  style={{ aspectRatio: String(z.ratio || 1), background: GROUND[z.id] || GROUND.general }}>
                  {(z.spots || []).map((sp) => {
                    const isAssigned = sp.code === assigned
                    const isPick = sp.code === pick
                    const taken = takenByOthers.has(sp.code)
                    const ui = isPick ? UI.elegida : isAssigned ? UI.asignada : taken ? UI.ocupada : UI.libre
                    const horiz = (sp.w || 1) >= (sp.h || 1)
                    return (
                      <button
                        key={sp.code}
                        onClick={() => !taken && setPick(isPick ? null : sp.code)}
                        disabled={taken}
                        title={taken ? `Plaza ${sp.code} · ocupada` : `Plaza ${sp.code}`}
                        className={`absolute rounded-[3px] border transition-transform duration-200 ${ui.fill} ${taken ? 'cursor-not-allowed opacity-70' : 'active:scale-95'} ${isAssigned && !isPick ? 'animate-pulse' : ''}`}
                        style={{
                          left: `${sp.x}%`, top: `${sp.y}%`, width: `${sp.w}%`, height: `${sp.h}%`,
                          transform: `rotate(${sp.rot || 0}deg)${isPick ? ' scale(1.15)' : ''}`,
                          boxShadow: isPick ? '0 0 0 2px #34d399, 0 0 22px rgba(52,211,153,.6)'
                            : isAssigned ? '0 0 0 2px #fb923c, 0 0 20px rgba(251,146,60,.55)' : undefined,
                          zIndex: isPick || isAssigned ? 20 : undefined,
                        }}>
                        {ui.van && (
                          <span className="pointer-events-none absolute inset-[9%] rounded-[3px]"
                            style={{ background: `linear-gradient(${horiz ? '180deg' : '90deg'}, ${ui.van}f2, ${ui.van}a8)` }} />
                        )}
                        <span className={`pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[9px] font-bold ${ui.text}`}
                          style={{ transform: `rotate(${-(sp.rot || 0)}deg)` }}>{sp.code}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* 3 · CONFIRMAR */}
          <div className="mt-4">
            {pick ? (
              <p className="mb-2 text-center text-[13px] text-dark-300">
                Has elegido la <b className="font-mono text-emerald-300">{pick}</b> · {zoneOf(pick)?.name}
              </p>
            ) : (
              <p className="mb-2 text-center text-[12.5px] text-dark-500">Toca en el plano la plaza donde has dejado la furgoneta.</p>
            )}
            <button
              onClick={send} disabled={!pick || busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 py-3.5 text-[14.5px] font-semibold text-white shadow-lg shadow-brand-500/25 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
              Confirmar plaza
            </button>
          </div>
        </>
      )}
    </div>
  )
}
