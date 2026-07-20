import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, MapPin, Check, X, Pencil, ShieldAlert, Car, Calendar } from 'lucide-react'
import { parkingState, parkingResolve, parkingAssign } from '../api'

/* Estados de una plaza. El color comunica, no decora:
   gris = libre · ámbar = asignada (mandada, sin confirmar) · azul = reportada
   por el conductor · verde = confirmada por el coordinador · rojo = denegada
   o discrepancia entre lo asignado y lo reportado. */
const SPOT_UI = {
  libre:      { fill: 'bg-white/[0.03] border-white/[0.07]', text: 'text-dark-500', label: 'Libre' },
  asignada:   { fill: 'bg-amber-500/15 border-amber-500/40', text: 'text-amber-300', label: 'Asignada' },
  reportada:  { fill: 'bg-sky-500/15 border-sky-500/40',     text: 'text-sky-300',   label: 'Reportada' },
  confirmada: { fill: 'bg-emerald-500/15 border-emerald-500/45', text: 'text-emerald-300', label: 'Confirmada' },
  denegada:   { fill: 'bg-red-500/15 border-red-500/45',     text: 'text-red-300',   label: 'Denegada' },
}
const ZONE_RING = {
  violet: 'border-violet-400/35', sky: 'border-sky-400/35',
  emerald: 'border-emerald-400/35', amber: 'border-amber-400/35',
}
const todayISO = () => new Date().toISOString().slice(0, 10)

export default function Aparcamiento() {
  const { center } = useOutletContext()
  const [data, setData] = useState(null)
  const [day, setDay] = useState(todayISO())
  const [sel, setSel] = useState(null)          // código de plaza seleccionada
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [editing, setEditing] = useState(false)  // corrigiendo plaza
  const flash = (ok, msg) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 4000) }

  const noCenter = !center || center === 'Todos'

  const load = useCallback(async () => {
    if (noCenter) { setData(null); return }
    try {
      const r = await parkingState(center, day)
      setData(r.data); setErr('')
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo cargar el plano de aparcamiento.')
    }
  }, [center, day, noCenter])

  useEffect(() => { load() }, [load])
  useEffect(() => { setSel(null); setEditing(false) }, [center, day])

  // Índice plaza → asignación. Una plaza puede estar asignada a un vehículo y
  // que OTRO haya reportado estar en ella: ambas cosas se ven.
  const { byAssigned, byReported } = useMemo(() => {
    const a = {}, rp = {}
    for (const x of (data?.assignments || [])) {
      if (x.spot) a[x.spot] = x
      if (x.reported_spot) rp[x.reported_spot] = x
    }
    return { byAssigned: a, byReported: rp }
  }, [data])

  const spotState = (code) => {
    const rep = byReported[code], asg = byAssigned[code]
    const row = rep || asg
    if (!row) return { status: 'libre', row: null }
    if (row.status === 'denegada') return { status: 'denegada', row }
    if (row.mismatch) return { status: 'denegada', row }   // discrepancia: nunca la ocultamos
    if (row.status === 'confirmada') return { status: 'confirmada', row }
    if (rep) return { status: 'reportada', row }
    return { status: 'asignada', row }
  }

  const stats = useMemo(() => {
    const all = (data?.layout?.zones || []).flatMap((z) => z.spots || [])
    const s = { total: all.length, libre: 0, asignada: 0, reportada: 0, confirmada: 0, problema: 0 }
    for (const sp of all) {
      const st = spotState(sp.code).status
      if (st === 'denegada') s.problema++
      else s[st] = (s[st] || 0) + 1
    }
    return s
  }, [data]) // eslint-disable-line

  const selRow = sel ? spotState(sel).row : null
  const selStatus = sel ? spotState(sel).status : null

  async function resolve(action, spot) {
    if (!selRow?.vehicle_id) return
    setBusy(true)
    try {
      await parkingResolve({ center, day, vehicle_id: selRow.vehicle_id, action, spot })
      flash(true, action === 'deny' ? 'Ubicación denegada' : 'Ubicación confirmada')
      setEditing(false); await load()
    } catch (e) {
      flash(false, e?.response?.data?.detail || 'No se pudo guardar')
    }
    setBusy(false)
  }

  async function moveTo(spot) {
    if (!selRow?.vehicle_id) return
    setBusy(true)
    try {
      await parkingAssign({ center, day, vehicle_id: selRow.vehicle_id, spot, driver_id: selRow.driver_id })
      flash(true, `Vehículo movido a la plaza ${spot}`)
      setEditing(false); setSel(spot); await load()
    } catch (e) {
      flash(false, e?.response?.data?.detail || 'No se pudo mover')
    }
    setBusy(false)
  }

  if (noCenter) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="rise font-display text-[clamp(28px,3.4vw,42px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">Aparcamiento</h1>
        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-10 text-center text-[14px] text-dark-400">
          <MapPin size={26} className="mx-auto mb-3 opacity-30" />
          Elige un centro arriba para ver su plano de aparcamiento.
        </div>
      </div>
    )
  }

  return (
    <div>
      <header className="rise mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-brand-400/80">{center}</p>
          <h1 className="mt-2 font-display text-[clamp(28px,3.4vw,42px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">
            Aparcamiento
          </h1>
        </div>
        <div className="relative">
          <Calendar size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            type="date" value={day} onChange={(e) => setDay(e.target.value)}
            className="rounded-xl border border-white/[0.07] bg-white/[0.02] py-2.5 pl-9 pr-3 text-[13.5px] text-dark-50 transition-all hover:border-white/[0.12] focus:border-brand-500/50 focus:outline-none focus:ring-[3px] focus:ring-brand-500/15"
          />
        </div>
      </header>

      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-2.5 text-[13px] text-red-300">
          <ShieldAlert size={14} className="shrink-0" /> {err}
        </div>
      )}
      {toast && (
        <div className={`mb-4 rounded-xl border px-4 py-2.5 text-[13px] ${toast.ok ? 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-300' : 'border-red-500/25 bg-red-500/[0.07] text-red-300'}`}>
          {toast.msg}
        </div>
      )}

      {!data ? (
        <div className="flex items-center gap-2 py-16 text-dark-500"><Loader2 size={16} className="animate-spin" /> Cargando plano…</div>
      ) : (
        <>
          {/* Tira de estado: sin cajas, los ceros se atenúan */}
          <div className="rise mb-6 flex flex-wrap items-baseline gap-x-7 gap-y-2 border-y border-white/[0.05] py-3.5" style={{ animationDelay: '60ms' }}>
            {[
              { n: stats.total, l: 'plazas', c: 'text-dark-50' },
              { n: stats.libre, l: 'libres', c: 'text-dark-300' },
              { n: stats.asignada, l: 'asignadas', c: 'text-amber-300' },
              { n: stats.reportada, l: 'reportadas', c: 'text-sky-300' },
              { n: stats.confirmada, l: 'confirmadas', c: 'text-emerald-300' },
              { n: stats.problema, l: 'a revisar', c: 'text-red-300' },
            ].map(({ n, l, c }, i) => (
              <div key={l} className="flex items-baseline gap-2">
                <span className={`text-[19px] font-semibold tabular-nums ${(n > 0 || i === 0) ? c : 'text-dark-600'}`}>{n}</span>
                <span className="text-[12.5px] text-dark-500">{l}</span>
              </div>
            ))}
          </div>

          {data.layout?.seeded && (
            <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-2.5 text-[12.5px] text-amber-300">
              Plano inicial generado automáticamente con la forma real de {center}. Ajusta el número de
              plazas de cada zona cuando lo tengas medido — hasta entonces trátalo como un borrador.
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            {/* ── PLANO ── */}
            <div className="rise space-y-4" style={{ animationDelay: '120ms' }}>
              {(data.layout?.zones || []).map((z) => (
                <div key={z.id} className={`rounded-2xl border bg-white/[0.015] p-4 ${ZONE_RING[z.color] || 'border-white/[0.07]'}`}>
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <div>
                      <h2 className="text-[14px] font-semibold text-dark-100">{z.name}</h2>
                      {z.note && <p className="mt-0.5 text-[11.5px] text-dark-500">{z.note}</p>}
                    </div>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-dark-500">{(z.spots || []).length} plazas</span>
                  </div>
                  {(z.spots || []).length === 0 ? (
                    <p className="py-4 text-[12.5px] text-dark-600">Esta zona aún no tiene plazas configuradas.</p>
                  ) : (
                    <ZoneMap zone={z} spotState={spotState} sel={sel}
                      onPick={(code) => { setSel(sel === code ? null : code); setEditing(false) }} />
                  )}
                </div>
              ))}
            </div>

            {/* ── PANEL DE DETALLE ── */}
            <div className="rise" style={{ animationDelay: '160ms' }}>
              <div className="sticky top-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                {!sel ? (
                  <div className="py-8 text-center text-[13px] text-dark-500">
                    <Car size={24} className="mx-auto mb-3 opacity-30" />
                    Pulsa una plaza del plano para ver quién está y confirmar su ubicación.
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between">
                      <div>
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-dark-500">Plaza</p>
                        <p className="font-display text-[34px] font-semibold leading-none tracking-tight text-dark-50">{sel}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${SPOT_UI[selStatus].fill} ${SPOT_UI[selStatus].text}`}>
                        {SPOT_UI[selStatus].label}
                      </span>
                    </div>

                    {!selRow ? (
                      <p className="mt-5 text-[13px] leading-relaxed text-dark-500">
                        Plaza libre. Selecciona un vehículo desde la plantilla del día para asignársela.
                      </p>
                    ) : (
                      <>
                        <div className="mt-5 space-y-2.5 border-t border-white/[0.06] pt-4 text-[13px]">
                          <Row k="Vehículo" v={selRow.vehicle?.license_plate || '—'} mono />
                          <Row k="Modelo" v={[selRow.vehicle?.brand, selRow.vehicle?.model].filter(Boolean).join(' ') || '—'} />
                          <Row k="Conductor" v={selRow.driver?.name || '—'} />
                          <Row k="Asignada" v={selRow.spot || '—'} mono />
                          <Row k="Reportada" v={selRow.reported_spot || '—'} mono />
                          {selRow.reported_by && <Row k="Reportó" v={selRow.reported_by} />}
                          {selRow.resolved_by && <Row k="Resolvió" v={selRow.resolved_by} />}
                        </div>

                        {selRow.mismatch && (
                          <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3 py-2 text-[12px] leading-relaxed text-red-300">
                            Discrepancia: le asignamos la <b>{selRow.spot}</b> pero reporta estar en la <b>{selRow.reported_spot}</b>.
                            Confirma la reportada o corrígela — no damos ninguna por buena solos.
                          </p>
                        )}

                        {editing ? (
                          <div className="mt-4">
                            <p className="mb-2 text-[12px] text-dark-400">Pulsa en el plano la plaza correcta, o escríbela:</p>
                            <CorrectSpot onSubmit={(s) => moveTo(s)} busy={busy} />
                            <button onClick={() => setEditing(false)} className="mt-2 w-full text-center text-[12px] text-dark-500 hover:text-dark-300">Cancelar</button>
                          </div>
                        ) : (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              onClick={() => resolve('confirm')} disabled={busy}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/12 py-2.5 text-[12.5px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                            >
                              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Confirmar
                            </button>
                            <button
                              onClick={() => resolve('deny')} disabled={busy}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-[12.5px] font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                            >
                              <X size={13} /> Denegar
                            </button>
                            <button
                              onClick={() => setEditing(true)} disabled={busy}
                              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/[0.1] py-2.5 text-[12.5px] font-semibold text-dark-300 transition hover:border-white/[0.18] disabled:opacity-50"
                            >
                              <Pencil size={13} /> Corregir plaza
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── DIRECTORIO ── */}
          <section className="rise mt-8 border-t border-white/[0.05] pt-6" style={{ animationDelay: '200ms' }}>
            <h2 className="mb-4 text-[15px] font-semibold text-dark-100">
              Directorio del día <span className="text-dark-600">· {(data.assignments || []).length}</span>
            </h2>
            {(data.assignments || []).length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/[0.08] px-4 py-8 text-center text-[13px] text-dark-500">
                Aún no hay furgonetas ubicadas este día. Aparecerán cuando se asignen plazas o los conductores reporten dónde aparcaron.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {(data.assignments || []).map((r) => {
                  const st = r.mismatch ? 'denegada' : (r.status || 'asignada')
                  const ui = SPOT_UI[st] || SPOT_UI.asignada
                  const shown = r.reported_spot || r.spot
                  return (
                    <button
                      key={r.vehicle_id}
                      onClick={() => { setSel(shown); setEditing(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                      className="float-row flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left"
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-mono text-[13px] font-bold ${ui.fill} ${ui.text}`}>{shown || '—'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[14px] font-semibold text-dark-50">{r.vehicle?.license_plate || '—'}</div>
                        <div className="mt-0.5 truncate text-[11.5px] text-dark-500">
                          {r.driver?.name || 'Sin conductor'}
                          {r.mismatch && <span className="ml-2 text-red-300">· asignada {r.spot} / reporta {r.reported_spot}</span>}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${ui.fill} ${ui.text}`}>{ui.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/* Plano de una zona: las plazas se dibujan EN SU SITIO (x/y/w/h en % del
   lienzo y rotación en grados), no en una rejilla. Así la nave sale con los
   coches en horizontal contra las paredes y el exterior en diagonal hacia el
   carril — igual que sobre el terreno. */
function ZoneMap({ zone, spotState, sel, onPick }) {
  const ratio = zone.ratio || 1
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-white/[0.05] bg-black/25"
      style={{ aspectRatio: String(ratio) }}
    >
      {/* Carril de circulación: da lectura de plano, no es decoración */}
      {zone.aisle === 'vertical' ? (
        <div className="pointer-events-none absolute inset-y-3 left-1/2 w-[9%] -translate-x-1/2 rounded-full bg-white/[0.035]" />
      ) : (
        <div className="pointer-events-none absolute inset-x-3 top-1/2 h-[7%] -translate-y-1/2 rounded-full bg-white/[0.035]" />
      )}

      {(zone.spots || []).map((sp) => {
        const { status, row } = spotState(sp.code)
        const ui = SPOT_UI[status]
        const active = sel === sp.code
        const occupied = !!row
        return (
          <button
            key={sp.code}
            onClick={() => onPick(sp.code)}
            title={row?.vehicle?.license_plate ? `Plaza ${sp.code} · ${row.vehicle.license_plate} · ${ui.label}` : `Plaza ${sp.code} · ${ui.label}`}
            className={`group absolute rounded-[3px] border transition-[filter,transform] duration-200 ${ui.fill} ${active ? 'z-20 brightness-150' : 'hover:brightness-125'}`}
            style={{
              left: `${sp.x}%`, top: `${sp.y}%`, width: `${sp.w}%`, height: `${sp.h}%`,
              transform: `rotate(${sp.rot || 0}deg)${active ? ' scale(1.08)' : ''}`,
              boxShadow: active ? '0 0 0 2px rgb(251 146 60), 0 0 22px rgba(251,146,60,.45)' : undefined,
            }}
          >
            {/* Silueta de furgoneta cuando la plaza está ocupada */}
            {occupied && (
              <span className="pointer-events-none absolute inset-[13%] rounded-[2px] bg-white/[0.16]">
                <span className="absolute inset-x-[14%] top-[12%] h-[26%] rounded-[1px] bg-white/[0.22]" />
              </span>
            )}
            <span className={`pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[9px] font-bold leading-none ${ui.text}`}
              style={{ transform: `rotate(${-(sp.rot || 0)}deg)` }}>
              {sp.code}
            </span>
            {row?.mismatch && (
              <span className="pointer-events-none absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-400 ring-2 ring-dark-950" />
            )}
          </button>
        )
      })}
    </div>
  )
}

function Row({ k, v, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[11.5px] text-dark-500">{k}</span>
      <span className={`min-w-0 truncate text-right text-dark-200 ${mono ? 'font-mono font-semibold' : ''}`}>{v}</span>
    </div>
  )
}

function CorrectSpot({ onSubmit, busy }) {
  const [v, setV] = useState('')
  return (
    <div className="flex gap-2">
      <input
        value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && v.trim() && onSubmit(v.trim())}
        placeholder="Nº de plaza"
        className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 font-mono text-[13px] text-dark-50 focus:border-brand-500/50 focus:outline-none"
      />
      <button
        onClick={() => v.trim() && onSubmit(v.trim())} disabled={busy || !v.trim()}
        className="rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 px-4 text-[12.5px] font-semibold text-white disabled:opacity-40"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : 'Mover'}
      </button>
    </div>
  )
}
