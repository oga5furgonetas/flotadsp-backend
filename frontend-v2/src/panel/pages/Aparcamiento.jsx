import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, MapPin, Check, X, Pencil, ShieldAlert, Car, Calendar, Search, Maximize2 } from 'lucide-react'
import { parkingState, parkingResolve, parkingAssign, getVehicles } from '../api'

/* El color comunica estado, no decora:
   gris = libre · ámbar = asignada (mandada) · azul = reportada por el conductor
   verde = confirmada · rojo = denegada o discrepancia asignada/reportada. */
const SPOT_UI = {
  libre:      { fill: 'bg-white/[0.03] border-white/[0.1] border-dashed', text: 'text-dark-500', dot: 'bg-dark-600', van: '#8f8f98', label: 'Libre' },
  asignada:   { fill: 'bg-amber-500/[0.07] border-amber-500/45', text: 'text-amber-200', dot: 'bg-amber-400', van: '#f59e0b', label: 'Asignada' },
  reportada:  { fill: 'bg-sky-500/[0.07] border-sky-500/45',     text: 'text-sky-200',   dot: 'bg-sky-400',   van: '#38bdf8', label: 'Reportada' },
  confirmada: { fill: 'bg-emerald-500/[0.07] border-emerald-500/50', text: 'text-emerald-200', dot: 'bg-emerald-400', van: '#34d399', label: 'Confirmada' },
  denegada:   { fill: 'bg-red-500/[0.07] border-red-500/50',     text: 'text-red-200',   dot: 'bg-red-400',   van: '#f87171', label: 'A revisar' },
}
const ZONE_TINT = {
  violet: 'border-violet-400/45', sky: 'border-sky-400/45',
  emerald: 'border-emerald-400/45', amber: 'border-amber-400/45',
}
const ZONE_LABEL = { violet: 'text-violet-300', sky: 'text-sky-300', emerald: 'text-emerald-300', amber: 'text-amber-300' }
const ZONE_CHIP = {
  violet: 'bg-violet-500/20 text-violet-200 ring-violet-400/40',
  sky: 'bg-sky-500/20 text-sky-200 ring-sky-400/40',
  emerald: 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40',
  amber: 'bg-amber-500/20 text-amber-200 ring-amber-400/40',
}
/* Suelo real de cada zona: hormigón dentro de la nave, asfalto fuera y tierra
   en la parcela. Da lectura de plano de un vistazo, sin necesidad de leer. */
const ZONE_GROUND = {
  nave: 'repeating-linear-gradient(90deg,#1b1b20 0 38px,#191a1e 38px 40px), linear-gradient(#1b1b20,#17171b)',
  exterior: 'repeating-linear-gradient(0deg,#141416 0 26px,#131315 26px 28px), linear-gradient(#151517,#111113)',
  tierra: 'radial-gradient(circle at 30% 25%,rgba(120,95,60,.16),transparent 55%), radial-gradient(circle at 70% 75%,rgba(120,95,60,.12),transparent 50%), linear-gradient(#1a1611,#15120e)',
  general: 'linear-gradient(#151517,#111113)',
}

/* Furgoneta vista desde arriba. Se estira a la plaza y orienta su morro según
   la forma de la bahía: si es ancha, el coche va en horizontal. */
function Van({ horiz, tone }) {
  return (
    <span className="pointer-events-none absolute inset-[9%] rounded-[3px] shadow-[0_1px_3px_rgba(0,0,0,.6)]"
      style={{ background: `linear-gradient(${horiz ? '180deg' : '90deg'}, ${tone}f2, ${tone}c8 55%, ${tone}9e)` }}>
      {/* Parabrisas en el morro */}
      <span className={`absolute rounded-[1.5px] bg-black/45 ${horiz ? 'inset-y-[20%] right-[7%] w-[20%]' : 'inset-x-[20%] top-[7%] h-[20%]'}`} />
      {/* Techo */}
      <span className={`absolute rounded-[1.5px] bg-black/[0.18] ${horiz ? 'inset-y-[16%] left-[12%] w-[52%]' : 'inset-x-[16%] bottom-[12%] h-[52%]'}`} />
    </span>
  )
}
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

              {(() => { const H = zoom ? 640 : 400; const canvasH = H - 30; return (
              <div className="flex items-stretch justify-center gap-3 overflow-x-auto transition-[height] duration-300" style={{ height: H }}>
                {zones.map((z, zi) => (
                  <div key={z.id} className="flex h-full shrink-0 flex-col"
                    style={{ width: Math.round(canvasH * (z.ratio || 1)) }}>
                    {/* Cabecera de zona tipo chip: se lee de un golpe */}
                    <div className="mb-2 flex items-center justify-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ring-1 ${ZONE_CHIP[z.color] || 'bg-white/10 text-dark-300 ring-white/20'}`}>
                        Zona {zi + 1}
                      </span>
                      <span className={`truncate text-[11.5px] font-semibold ${ZONE_LABEL[z.color] || 'text-dark-300'}`}>{z.name}</span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-dark-600">{(z.spots || []).length}</span>
                    </div>
                    <div className={`relative min-h-0 w-full flex-1 overflow-hidden rounded-xl border-2 shadow-[inset_0_0_40px_rgba(0,0,0,.5)] ${ZONE_TINT[z.color] || 'border-white/[0.1]'}`}
                      style={{ background: ZONE_GROUND[z.id] || ZONE_GROUND.general }}>
                      {/* Carril de circulación con sus flechas de sentido */}
                      {z.aisle === 'vertical' ? (
                        <div className="pointer-events-none absolute inset-y-3 left-1/2 flex w-[9%] -translate-x-1/2 flex-col items-center justify-around rounded-sm bg-white/[0.045]">
                          {[0, 1, 2].map((i) => <span key={i} className="text-[9px] leading-none text-white/25">▲</span>)}
                        </div>
                      ) : (
                        <div className="pointer-events-none absolute inset-x-3 top-1/2 flex h-[7%] -translate-y-1/2 items-center justify-around rounded-sm bg-white/[0.045]">
                          {[0, 1, 2].map((i) => <span key={i} className="text-[9px] leading-none text-white/25">▶</span>)}
                        </div>
                      )}
                      {(z.spots || []).map((sp) => {
                        const { status, row } = spotState(sp.code)
                        const ui = SPOT_UI[status]
                        const active = sel === sp.code
                        const horiz = (sp.w || 1) >= (sp.h || 1)
                        return (
                          <button key={sp.code} onClick={() => { setSel(active ? null : sp.code); setEditing(false) }}
                            title={row?.vehicle?.license_plate ? `Plaza ${sp.code} · ${row.vehicle.license_plate} · ${ui.label}` : `Plaza ${sp.code} · libre`}
                            className={`group absolute rounded-[3px] border transition-[filter,transform] duration-200 ${ui.fill} ${active ? 'z-20' : 'hover:brightness-125'}`}
                            style={{
                              left: `${sp.x}%`, top: `${sp.y}%`, width: `${sp.w}%`, height: `${sp.h}%`,
                              transform: `rotate(${sp.rot || 0}deg)${active ? ' scale(1.12)' : ''}`,
                              boxShadow: active ? '0 0 0 2px rgb(251 146 60), 0 0 22px rgba(251,146,60,.55)' : undefined,
                            }}>
                            {row && <Van horiz={horiz} tone={ui.van} />}
                            {/* El número siempre horizontal, aunque la plaza esté en diagonal */}
                            <span className={`pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[8.5px] font-bold leading-none ${row ? 'text-white/85 [text-shadow:0_1px_2px_rgba(0,0,0,.9)]' : ui.text}`}
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
              ) })()}
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
