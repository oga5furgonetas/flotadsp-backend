import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, MapPin, Check, X, Pencil, ShieldAlert, Car, Calendar, Search, Maximize2 } from 'lucide-react'
import { parkingState, parkingResolve, parkingAssign, getVehicles } from '../api'

/* El color comunica estado, no decora:
   gris = libre · ámbar = asignada (mandada) · azul = reportada por el conductor
   verde = confirmada · rojo = denegada o discrepancia asignada/reportada. */
const SPOT_UI = {
  libre:      { fill: 'bg-white/[0.04] border-white/[0.09]', text: 'text-dark-500', dot: 'bg-dark-600', label: 'Libre' },
  asignada:   { fill: 'bg-amber-500/20 border-amber-500/50', text: 'text-amber-200', dot: 'bg-amber-400', label: 'Asignada' },
  reportada:  { fill: 'bg-sky-500/20 border-sky-500/50',     text: 'text-sky-200',   dot: 'bg-sky-400',   label: 'Reportada' },
  confirmada: { fill: 'bg-emerald-500/20 border-emerald-500/55', text: 'text-emerald-200', dot: 'bg-emerald-400', label: 'Confirmada' },
  denegada:   { fill: 'bg-red-500/20 border-red-500/55',     text: 'text-red-200',   dot: 'bg-red-400',   label: 'A revisar' },
}
const ZONE_TINT = {
  violet: 'border-violet-400/30 bg-violet-500/[0.04]',
  sky: 'border-sky-400/30 bg-sky-500/[0.04]',
  emerald: 'border-emerald-400/30 bg-emerald-500/[0.04]',
  amber: 'border-amber-400/30 bg-amber-500/[0.04]',
}
const ZONE_LABEL = { violet: 'text-violet-300', sky: 'text-sky-300', emerald: 'text-emerald-300', amber: 'text-amber-300' }
const todayISO = () => new Date().toISOString().slice(0, 10)

export default function Aparcamiento() {
  const { center } = useOutletContext()
  const [data, setData] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [day, setDay] = useState(todayISO())
  const [sel, setSel] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [editing, setEditing] = useState(false)
  const [q, setQ] = useState('')
  const [zoom, setZoom] = useState(false)
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
  useEffect(() => {
    if (noCenter) return
    getVehicles(center).then((r) => setVehicles(r.data || [])).catch(() => setVehicles([]))
  }, [center, noCenter])
  useEffect(() => { setSel(null); setEditing(false); setQ('') }, [center, day])

  const { byAssigned, byReported } = useMemo(() => {
    const a = {}, rp = {}
    for (const x of (data?.assignments || [])) {
      if (x.spot) a[x.spot] = x
      if (x.reported_spot) rp[x.reported_spot] = x
    }
    return { byAssigned: a, byReported: rp }
  }, [data])

  const spotState = useCallback((code) => {
    const rep = byReported[code], asg = byAssigned[code]
    const row = rep || asg
    if (!row) return { status: 'libre', row: null }
    if (row.status === 'denegada' || row.mismatch) return { status: 'denegada', row }
    if (row.status === 'confirmada') return { status: 'confirmada', row }
    if (rep) return { status: 'reportada', row }
    return { status: 'asignada', row }
  }, [byAssigned, byReported])

  const zones = data?.layout?.zones || []
  const stats = useMemo(() => {
    const all = zones.flatMap((z) => z.spots || [])
    const s = { total: all.length, libre: 0, asignada: 0, reportada: 0, confirmada: 0, denegada: 0 }
    for (const sp of all) s[spotState(sp.code).status]++
    return s
  }, [zones, spotState])

  // Vehículos del centro que aún no tienen plaza hoy: "quién falta por ubicar"
  const assignedIds = useMemo(
    () => new Set((data?.assignments || []).map((a) => a.vehicle_id)), [data])
  const pending = useMemo(
    () => vehicles.filter((v) => !assignedIds.has(v.id) && v.status !== 'baja'), [vehicles, assignedIds])

  const selRow = sel ? spotState(sel).row : null
  const selStatus = sel ? spotState(sel).status : null

  async function doAssign(vehicleId) {
    setBusy(true)
    try {
      await parkingAssign({ center, day, spot: sel, vehicle_id: vehicleId })
      flash(true, `Vehículo asignado a la plaza ${sel}`)
      setQ(''); await load()
    } catch (e) { flash(false, e?.response?.data?.detail || 'No se pudo asignar') }
    setBusy(false)
  }
  async function resolve(action, spot) {
    if (!selRow?.vehicle_id) return
    setBusy(true)
    try {
      await parkingResolve({ center, day, vehicle_id: selRow.vehicle_id, action, spot })
      flash(true, action === 'deny' ? 'Ubicación denegada' : 'Ubicación confirmada')
      setEditing(false); await load()
    } catch (e) { flash(false, e?.response?.data?.detail || 'No se pudo guardar') }
    setBusy(false)
  }
  async function moveTo(spot) {
    if (!selRow?.vehicle_id) return
    setBusy(true)
    try {
      await parkingAssign({ center, day, vehicle_id: selRow.vehicle_id, spot })
      flash(true, `Movido a la plaza ${spot}`); setEditing(false); setSel(spot); await load()
    } catch (e) { flash(false, e?.response?.data?.detail || 'No se pudo mover') }
    setBusy(false)
  }

  if (noCenter) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="rise font-display text-[clamp(26px,3vw,38px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">Aparcamiento</h1>
        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-10 text-center text-[14px] text-dark-400">
          <MapPin size={26} className="mx-auto mb-3 opacity-30" />
          Elige un centro arriba para ver su plano.
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Cabecera compacta: título, contadores y fecha en una sola línea */}
      <header className="rise mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[clamp(24px,2.6vw,32px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">Aparcamiento</h1>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-brand-400/80">{center}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {[
            { n: stats.libre, l: 'libres', c: 'text-dark-300' },
            { n: stats.asignada, l: 'asignadas', c: 'text-amber-300' },
            { n: stats.reportada, l: 'reportadas', c: 'text-sky-300' },
            { n: stats.confirmada, l: 'confirmadas', c: 'text-emerald-300' },
            { n: stats.denegada, l: 'a revisar', c: 'text-red-300' },
          ].map(({ n, l, c }) => (
            <div key={l} className="flex items-baseline gap-1.5">
              <span className={`text-[16px] font-semibold tabular-nums ${n > 0 ? c : 'text-dark-600'}`}>{n}</span>
              <span className="text-[11.5px] text-dark-500">{l}</span>
            </div>
          ))}
          <div className="relative">
            <Calendar size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
              className="rounded-lg border border-white/[0.07] bg-white/[0.02] py-1.5 pl-8 pr-2 text-[12.5px] text-dark-50 focus:border-brand-500/50 focus:outline-none" />
          </div>
        </div>
      </header>

      {err && <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-2.5 text-[13px] text-red-300"><ShieldAlert size={14} /> {err}</div>}
      {toast && <div className={`mb-3 rounded-xl border px-4 py-2.5 text-[13px] ${toast.ok ? 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-300' : 'border-red-500/25 bg-red-500/[0.07] text-red-300'}`}>{toast.msg}</div>}

      {!data ? (
        <div className="flex items-center gap-2 py-16 text-dark-500"><Loader2 size={16} className="animate-spin" /> Cargando plano…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* ── PLANO ÚNICO: las 3 zonas juntas y centradas ── */}
          <div className="rise min-w-0" style={{ animationDelay: '60ms' }}>
            <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  {Object.entries(SPOT_UI).map(([k, v]) => (
                    <span key={k} className="flex items-center gap-1.5 text-[10.5px] text-dark-500">
                      <span className={`h-2 w-2 rounded-full ${v.dot}`} /> {v.label}
                    </span>
                  ))}
                </div>
                <button onClick={() => setZoom((z) => !z)} title="Ampliar plano"
                  className="rounded-lg border border-white/[0.08] p-1.5 text-dark-400 transition hover:text-dark-200">
                  <Maximize2 size={13} />
                </button>
              </div>

              <div className={`flex items-stretch justify-center gap-3 overflow-x-auto ${zoom ? 'h-[640px]' : 'h-[400px]'} transition-[height] duration-300`}>
                {zones.map((z) => (
                  <div key={z.id} className="flex h-full shrink-0 flex-col">
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
                      <span className={`truncate text-[11.5px] font-semibold ${ZONE_LABEL[z.color] || 'text-dark-300'}`}>{z.name}</span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-dark-600">{(z.spots || []).length}</span>
                    </div>
                    <div className={`relative min-h-0 flex-1 overflow-hidden rounded-xl border ${ZONE_TINT[z.color] || 'border-white/[0.07]'}`}
                      style={{ aspectRatio: String(z.ratio || 1) }}>
                      {z.aisle === 'vertical'
                        ? <div className="pointer-events-none absolute inset-y-2 left-1/2 w-[8%] -translate-x-1/2 rounded-full bg-white/[0.04]" />
                        : <div className="pointer-events-none absolute inset-x-2 top-1/2 h-[6%] -translate-y-1/2 rounded-full bg-white/[0.04]" />}
                      {(z.spots || []).map((sp) => {
                        const { status, row } = spotState(sp.code)
                        const ui = SPOT_UI[status]
                        const active = sel === sp.code
                        return (
                          <button key={sp.code} onClick={() => { setSel(active ? null : sp.code); setEditing(false) }}
                            title={row?.vehicle?.license_plate ? `Plaza ${sp.code} · ${row.vehicle.license_plate} · ${ui.label}` : `Plaza ${sp.code} · libre`}
                            className={`group absolute rounded-[3px] border transition-[filter,transform] duration-200 ${ui.fill} ${active ? 'z-20' : 'hover:brightness-125'}`}
                            style={{
                              left: `${sp.x}%`, top: `${sp.y}%`, width: `${sp.w}%`, height: `${sp.h}%`,
                              transform: `rotate(${sp.rot || 0}deg)${active ? ' scale(1.12)' : ''}`,
                              boxShadow: active ? '0 0 0 2px rgb(251 146 60), 0 0 20px rgba(251,146,60,.5)' : undefined,
                            }}>
                            {row && (
                              <span className="pointer-events-none absolute inset-[14%] rounded-[2px] bg-white/[0.18]">
                                <span className="absolute inset-x-[15%] top-[10%] h-[26%] rounded-[1px] bg-white/[0.24]" />
                              </span>
                            )}
                            <span className={`pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[8.5px] font-bold leading-none ${ui.text}`}
                              style={{ transform: `rotate(${-(sp.rot || 0)}deg)` }}>{sp.code}</span>
                            {row?.mismatch && <span className="pointer-events-none absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-400 ring-2 ring-dark-950" />}
                          </button>
                        )
                      })}
                      {(z.spots || []).length === 0 && (
                        <p className="absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] text-dark-600">Sin plazas configuradas</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pendientes de ubicar: el trabajo que queda, siempre a la vista */}
            {pending.length > 0 && (
              <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <p className="mb-2 text-[12px] text-dark-400">
                  <b className="text-amber-300">{pending.length}</b> sin plaza hoy — pulsa una plaza libre del plano para asignarla.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {pending.slice(0, 14).map((v) => (
                    <span key={v.id} className="rounded-md bg-white/[0.05] px-2 py-1 font-mono text-[11px] text-dark-300">{v.license_plate}</span>
                  ))}
                  {pending.length > 14 && <span className="px-1 py-1 text-[11px] text-dark-600">+{pending.length - 14}</span>}
                </div>
              </div>
            )}
          </div>

          {/* ── PANEL ── */}
          <div className="rise" style={{ animationDelay: '110ms' }}>
            <div className="sticky top-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              {!sel ? (
                <div className="py-10 text-center text-[12.5px] text-dark-500">
                  <Car size={22} className="mx-auto mb-3 opacity-30" />
                  Pulsa una plaza del plano.<br />Si está libre podrás asignarle un vehículo.
                </div>
              ) : (
                <>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] text-dark-500">Plaza</p>
                      <p className="font-display text-[30px] font-semibold leading-none tracking-tight text-dark-50">{sel}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${SPOT_UI[selStatus].fill} ${SPOT_UI[selStatus].text}`}>
                      {SPOT_UI[selStatus].label}
                    </span>
                  </div>

                  {!selRow ? (
                    /* PLAZA LIBRE → asignar vehículo */
                    <div className="mt-4 border-t border-white/[0.06] pt-3">
                      <p className="mb-2 text-[12px] font-semibold text-dark-200">Asignar vehículo</p>
                      <div className="relative mb-2">
                        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar matrícula…"
                          className="w-full rounded-lg border border-white/[0.07] bg-white/[0.02] py-2 pl-8 pr-2 text-[12.5px] text-dark-50 placeholder:text-dark-600 focus:border-brand-500/50 focus:outline-none" />
                      </div>
                      <div className="max-h-[280px] space-y-1 overflow-y-auto">
                        {pending
                          .filter((v) => !q || (v.license_plate || '').toLowerCase().includes(q.toLowerCase()))
                          .slice(0, 40)
                          .map((v) => (
                            <button key={v.id} onClick={() => doAssign(v.id)} disabled={busy}
                              className="float-row flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left disabled:opacity-50">
                              <span className="font-mono text-[12.5px] font-semibold text-dark-100">{v.license_plate}</span>
                              <span className="truncate text-[11px] text-dark-500">{[v.brand, v.model].filter(Boolean).join(' ')}</span>
                            </button>
                          ))}
                        {pending.length === 0 && <p className="py-4 text-center text-[12px] text-dark-600">Todos los vehículos ya tienen plaza hoy.</p>}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-3 text-[12.5px]">
                        <Row k="Vehículo" v={selRow.vehicle?.license_plate || '—'} mono />
                        <Row k="Conductor" v={selRow.driver?.name || '—'} />
                        <Row k="Asignada" v={selRow.spot || '—'} mono />
                        <Row k="Reportada" v={selRow.reported_spot || '—'} mono />
                        {selRow.reported_by && <Row k="Reportó" v={selRow.reported_by} />}
                      </div>
                      {selRow.mismatch && (
                        <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3 py-2 text-[11.5px] leading-relaxed text-red-300">
                          Le asignamos la <b>{selRow.spot}</b> pero reporta la <b>{selRow.reported_spot}</b>. Confirma o corrige.
                        </p>
                      )}
                      {editing ? (
                        <div className="mt-3">
                          <p className="mb-2 text-[11.5px] text-dark-400">Nº de la plaza correcta:</p>
                          <CorrectSpot onSubmit={moveTo} busy={busy} />
                          <button onClick={() => setEditing(false)} className="mt-2 w-full text-center text-[11.5px] text-dark-500 hover:text-dark-300">Cancelar</button>
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => resolve('confirm')} disabled={busy}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/12 py-2 text-[12px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50">
                            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Confirmar
                          </button>
                          <button onClick={() => resolve('deny')} disabled={busy}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-[12px] font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50">
                            <X size={12} /> Denegar
                          </button>
                          <button onClick={() => setEditing(true)} disabled={busy}
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/[0.1] py-2 text-[12px] font-semibold text-dark-300 transition hover:border-white/[0.18] disabled:opacity-50">
                            <Pencil size={12} /> Mover de plaza
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
      )}

      {/* ── DIRECTORIO compacto ── */}
      {data && (data.assignments || []).length > 0 && (
        <section className="rise mt-6 border-t border-white/[0.05] pt-5" style={{ animationDelay: '150ms' }}>
          <h2 className="mb-3 text-[13.5px] font-semibold text-dark-100">
            Ubicadas hoy <span className="text-dark-600">· {(data.assignments || []).length}</span>
          </h2>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {(data.assignments || []).map((r) => {
              const st = r.mismatch ? 'denegada' : (r.status || 'asignada')
              const ui = SPOT_UI[st] || SPOT_UI.asignada
              const shown = r.reported_spot || r.spot
              return (
                <button key={r.vehicle_id} onClick={() => { setSel(shown); setEditing(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                  className="float-row flex items-center gap-2.5 rounded-xl px-3 py-2 text-left">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-[11px] font-bold ${ui.fill} ${ui.text}`}>{shown || '—'}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-semibold text-dark-100">{r.vehicle?.license_plate || '—'}</span>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${ui.dot}`} />
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function Row({ k, v, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[11px] text-dark-500">{k}</span>
      <span className={`min-w-0 truncate text-right text-dark-200 ${mono ? 'font-mono font-semibold' : ''}`}>{v}</span>
    </div>
  )
}

function CorrectSpot({ onSubmit, busy }) {
  const [v, setV] = useState('')
  return (
    <div className="flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && v.trim() && onSubmit(v.trim())}
        placeholder="Nº"
        className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 font-mono text-[12.5px] text-dark-50 focus:border-brand-500/50 focus:outline-none" />
      <button onClick={() => v.trim() && onSubmit(v.trim())} disabled={busy || !v.trim()}
        className="rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 px-3 text-[12px] font-semibold text-white disabled:opacity-40">
        {busy ? <Loader2 size={12} className="animate-spin" /> : 'Mover'}
      </button>
    </div>
  )
}
