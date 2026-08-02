import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, MapPin, Check, X, Pencil, ShieldAlert, Car, Calendar, Search,
  Maximize2, Image as ImageIcon, Plus, Minus, Trash2, RotateCw, Move,
} from 'lucide-react'
import { parkingState, parkingResolve, parkingAssign, parkingZoneImage, parkingSaveLayout, getVehicles } from '../api'
import { hoyLocal } from '../../lib/fecha'
import { useT } from '../../i18n'
import { lista } from '../../lib/lista'

/* Estado de una plaza. El color comunica, nunca decora.
   `chip` = clases para insignias; fill/line/glow = pintura de la plaza en el plano. */
const SPOT_UI = {
  libre:      { text: 'text-white/85', dot: 'bg-dark-400', van: '#9096a3', label: 'pk.st.libre',
                chip: 'bg-white/[0.04] border-white/[0.12] text-dark-400',
                fill: 'rgba(255,255,255,.07)', line: 'rgba(255,255,255,.62)', glow: null },
  asignada:   { text: 'text-amber-100', dot: 'bg-amber-400', van: '#f59e0b', label: 'pk.st.asignada',
                chip: 'bg-amber-500/[0.12] border-amber-500/45 text-amber-200',
                fill: 'rgba(245,158,11,.16)', line: 'rgba(245,158,11,.65)', glow: 'rgba(245,158,11,.45)' },
  reportada:  { text: 'text-sky-100', dot: 'bg-sky-400', van: '#38bdf8', label: 'pk.st.reportada',
                chip: 'bg-sky-500/[0.12] border-sky-500/45 text-sky-200',
                fill: 'rgba(56,189,248,.16)', line: 'rgba(56,189,248,.65)', glow: 'rgba(56,189,248,.45)' },
  confirmada: { text: 'text-emerald-100', dot: 'bg-emerald-400', van: '#34d399', label: 'pk.st.confirmada',
                chip: 'bg-emerald-500/[0.12] border-emerald-500/50 text-emerald-200',
                fill: 'rgba(52,211,153,.18)', line: 'rgba(52,211,153,.68)', glow: 'rgba(52,211,153,.5)' },
  denegada:   { text: 'text-red-100', dot: 'bg-red-400', van: '#f87171', label: 'pk.st.revisar',
                chip: 'bg-red-500/[0.12] border-red-500/50 text-red-200',
                fill: 'rgba(248,113,113,.18)', line: 'rgba(248,113,113,.68)', glow: 'rgba(248,113,113,.5)' },
}
const ZONE_ACCENT = {
  violet: { br: 'border-violet-400/30', tx: 'text-violet-300', bar: 'bg-violet-400', ring: 'rgba(167,139,250,.30)' },
  sky:    { br: 'border-sky-400/30',    tx: 'text-sky-300',    bar: 'bg-sky-400',    ring: 'rgba(56,189,248,.28)' },
  emerald:{ br: 'border-emerald-400/30',tx: 'text-emerald-300',bar: 'bg-emerald-400',ring: 'rgba(52,211,153,.28)' },
  amber:  { br: 'border-amber-400/30',  tx: 'text-amber-300',  bar: 'bg-amber-400',  ring: 'rgba(245,158,11,.28)' },
}
/* Suelos realistas: hormigón pulido (nave), asfalto (exterior), grava (tierra). */
const GROUND = {
  nave: `radial-gradient(130% 95% at 50% -10%, rgba(180,170,255,.07), transparent 60%),
         repeating-linear-gradient(0deg, rgba(0,0,0,.20) 0 1px, transparent 1px 82px),
         repeating-linear-gradient(90deg, rgba(0,0,0,.20) 0 1px, transparent 1px 82px),
         linear-gradient(160deg, #2c2c34, #1e1e24 55%, #17171d)`,
  exterior: `radial-gradient(130% 95% at 50% -10%, rgba(120,190,255,.07), transparent 60%),
             repeating-linear-gradient(90deg, rgba(255,255,255,.028) 0 2px, transparent 2px 44px),
             linear-gradient(160deg, #23252b, #17181d 55%, #121318)`,
  tierra: `radial-gradient(55% 45% at 22% 18%, rgba(158,116,64,.28), transparent 60%),
           radial-gradient(50% 42% at 82% 84%, rgba(126,94,52,.20), transparent 60%),
           radial-gradient(40% 40% at 60% 50%, rgba(100,74,40,.12), transparent 55%),
           linear-gradient(160deg, #271f15, #1e1710 55%, #171009)`,
  general: 'linear-gradient(160deg,#222329,#15161b)',
}
const todayISO = hoyLocal

/* Furgoneta cenital: chapa con volumen, parabrisas, costillas de caja,
   retrovisores y ruedas. Se dibuja en 100×46 y se orienta según la plaza,
   siempre DENTRO del recuadro (nunca se sale → no descuadra nada). */
function Van({ horiz, tone }) {
  const id = 'vg' + tone.replace('#', '')
  return (
    <svg viewBox="0 0 100 46" preserveAspectRatio="none"
      className="pointer-events-none absolute drop-shadow-[0_2px_4px_rgba(0,0,0,.8)]"
      style={horiz
        ? { left: '7%', top: '15%', width: '86%', height: '70%' }
        : { left: '15%', top: '7%', width: '70%', height: '86%', transform: 'rotate(90deg)', transformOrigin: 'center' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity=".58" />
          <stop offset="50%" stopColor={tone} stopOpacity=".92" />
          <stop offset="100%" stopColor={tone} stopOpacity=".56" />
        </linearGradient>
      </defs>
      {/* ruedas */}
      <rect x="20" y="0.5" width="16" height="4.5" rx="1.6" fill="#0a0a0b" opacity=".82" />
      <rect x="63" y="0.5" width="14" height="4.5" rx="1.6" fill="#0a0a0b" opacity=".82" />
      <rect x="20" y="41" width="16" height="4.5" rx="1.6" fill="#0a0a0b" opacity=".82" />
      <rect x="63" y="41" width="14" height="4.5" rx="1.6" fill="#0a0a0b" opacity=".82" />
      {/* carrocería */}
      <rect x="3" y="4" width="94" height="38" rx="8" fill={`url(#${id})`} stroke={tone} strokeOpacity=".55" strokeWidth="1" />
      {/* parabrisas (morro a la derecha) */}
      <path d="M80 8 h9 a5 5 0 0 1 5 5 v20 a5 5 0 0 1 -5 5 h-9 z" fill="#0b1016" opacity=".72" />
      {/* caja de carga con costillas */}
      <rect x="11" y="9" width="61" height="28" rx="3" fill="#000" opacity=".15" />
      <line x1="26" y1="9.5" x2="26" y2="36.5" stroke="#000" strokeOpacity=".2" strokeWidth="1" />
      <line x1="40" y1="9.5" x2="40" y2="36.5" stroke="#000" strokeOpacity=".2" strokeWidth="1" />
      <line x1="54" y1="9.5" x2="54" y2="36.5" stroke="#000" strokeOpacity=".2" strokeWidth="1" />
      {/* retrovisores */}
      <rect x="78" y="2.5" width="6" height="3" rx="1.2" fill={tone} opacity=".95" />
      <rect x="78" y="40.5" width="6" height="3" rx="1.2" fill={tone} opacity=".95" />
      {/* brillo del techo */}
      <rect x="6" y="7" width="88" height="3.5" rx="1.8" fill="#fff" opacity=".17" />
    </svg>
  )
}

/* Anillo de disponibilidad */
function Ring({ pct }) {
  const r = 16, c = 2 * Math.PI * r
  const col = pct >= 85 ? '#34d399' : pct >= 60 ? '#f59e0b' : '#f87171'
  return (
    <div className="relative h-11 w-11 shrink-0">
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={col} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`} style={{ transition: 'stroke-dasharray .6s cubic-bezier(.4,0,.2,1)' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[9.5px] font-bold" style={{ color: col }}>{pct}%</span>
    </div>
  )
}

export default function Aparcamiento() {
  const { center } = useOutletContext()
  const { t } = useT()
  const [data, setData] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [day, setDay] = useState(todayISO())
  const [sel, setSel] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [moving, setMoving] = useState(false)
  const [q, setQ] = useState('')
  const [hover, setHover] = useState(null)          // { code, x, y } tooltip
  // Vista: zoom y desplazamiento del plano
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [az, setAz] = useState(0)                   // zona activa (una a la vez)
  const panRef = useRef(null)
  const viewRef = useRef(null)                      // viewport del plano (para medirlo)
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 })
  // Editor
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState(null)
  const [drag, setDrag] = useState(null)
  const [snapOn, setSnapOn] = useState(true)        // imán de alineación
  const [histN, setHistN] = useState(0)             // fuerza re-render de botones undo/redo
  const histRef = useRef({ past: [], future: [] })  // historial de deshacer
  const lastSnapRef = useRef(0)
  // Arrastrar vehículo → plaza
  const [dropTarget, setDropTarget] = useState(null)

  const toastTimer = useRef(null)
  const flash = (ok, msg) => {
    setToast({ ok, msg })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])
  const noCenter = !center || center === 'Todos'

  // La petición en curso se marca con el centro+día que la pidió. Si cambias
  // de centro rápido y la respuesta vieja llega la última, se descarta: antes
  // podías acabar viendo el plano de OTRO centro sin enterarte.
  const peticionRef = useRef(0)
  const load = useCallback(async () => {
    if (noCenter) { setData(null); return }
    const mia = ++peticionRef.current
    try {
      const r = await parkingState(center, day)
      if (mia !== peticionRef.current) return   // llegó tarde: ya no vale
      setData(r.data); setErr('')
    } catch (e) {
      if (mia !== peticionRef.current) return
      setErr(e?.response?.data?.detail || t('pk.eCarga'))
    }
  }, [center, day, noCenter, t])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (noCenter) return
    getVehicles(center).then((r) => setVehicles(lista(r.data))).catch(() => setVehicles([]))
  }, [center, noCenter])
  // Recordar la última zona vista de cada centro (vuelves donde estabas)
  useEffect(() => {
    setSel(null); setQ('')
    setAz(parseInt(localStorage.getItem('pk_zona_' + center), 10) || 0)
  }, [center, day])
  // Medir el viewport del plano + zoom con rueda. La rueda va con listener
  // NATIVO no-pasivo: React registra onWheel como pasivo y preventDefault no
  // surte efecto, con lo que la página entera hacía scroll mientras zoomeabas.
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setViewSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    const onWheel = (e) => {
      e.preventDefault()
      setZoom((z) => Math.min(3, Math.max(0.6, +(z - Math.sign(e.deltaY) * 0.15).toFixed(2))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { ro.disconnect(); el.removeEventListener('wheel', onWheel) }
  }, [data, noCenter])

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

  const zones = (edit && draft) ? draft : (data?.layout?.zones || [])

  // Métricas de cabecera y por zona
  const stats = useMemo(() => {
    const all = zones.flatMap((z) => z.spots || [])
    const s = { total: all.length, libre: 0, asignada: 0, reportada: 0, confirmada: 0, denegada: 0 }
    for (const sp of all) s[spotState(sp.code).status]++
    const ocupadas = s.total - s.libre
    return { ...s, ocupadas, disp: s.total ? Math.round((s.libre / s.total) * 100) : 100 }
  }, [zones, spotState])

  const zoneStats = useCallback((z) => {
    const sp = z.spots || []
    const occ = sp.filter((x) => spotState(x.code).status !== 'libre').length
    return { total: sp.length, occ, pct: sp.length ? Math.round((occ / sp.length) * 100) : 0 }
  }, [spotState])

  const zIdx = Math.min(az, Math.max(0, zones.length - 1))
  const zone = zones[zIdx]
  const zAc = ZONE_ACCENT[zone?.color] || ZONE_ACCENT.sky
  const zStats = zone ? zoneStats(zone) : { total: 0, occ: 0, pct: 0 }

  // Tamaño exacto de la zona dentro del viewport (contain: respeta la proporción)
  const zBox = useMemo(() => {
    const R = zone?.ratio || 1
    const availW = Math.max(0, viewSize.w - 32)
    const availH = Math.max(0, viewSize.h - 32)
    if (!availW || !availH) return { w: 0, h: 0 }
    let w = availW, h = availW / R
    if (h > availH) { h = availH; w = availH * R }
    return { w: Math.round(w), h: Math.round(h) }
  }, [zone, viewSize])

  const assignedIds = useMemo(() => new Set((data?.assignments || []).map((a) => a.vehicle_id)), [data])
  const pending = useMemo(
    () => vehicles.filter((v) => !assignedIds.has(v.id) && v.status !== 'baja'), [vehicles, assignedIds])

  const selRow = sel ? spotState(sel).row : null
  const selStatus = sel ? spotState(sel).status : null

  // ── Acciones ──
  async function doAssign(vehicleId, spot) {
    setBusy(true)
    try {
      await parkingAssign({ center, day, spot, vehicle_id: vehicleId })
      const v = vehicles.find((x) => x.id === vehicleId)
      flash(true, `${v?.license_plate || t('pk.vehiculo')} ${t('pk.tAsignado')} ${spot}`)
      setQ(''); await load()
    } catch (e) { flash(false, e?.response?.data?.detail || t('pk.eAsignar')) }
    setBusy(false)
  }
  async function resolve(action, spot) {
    if (!selRow?.vehicle_id) return
    setBusy(true)
    try {
      await parkingResolve({ center, day, vehicle_id: selRow.vehicle_id, action, spot })
      flash(true, action === 'deny' ? t('pk.tDenegada') : t('pk.tConfirmada'))
      setMoving(false); await load()
    } catch (e) { flash(false, e?.response?.data?.detail || t('pk.eGuardarAcc')) }
    setBusy(false)
  }
  async function moveTo(spot) {
    if (!selRow?.vehicle_id) return
    setBusy(true)
    try {
      await parkingAssign({ center, day, vehicle_id: selRow.vehicle_id, spot })
      flash(true, `${t('pk.tMovido')} ${spot}`); setMoving(false); setSel(spot); await load()
    } catch (e) { flash(false, e?.response?.data?.detail || t('pk.eMover')) }
    setBusy(false)
  }
  async function uploadBg(zoneId, file) {
    setBusy(true)
    try {
      const ratio = await new Promise((res) => {
        const img = new Image()
        img.onload = () => res(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null)
        img.onerror = () => res(null)
        img.src = URL.createObjectURL(file)
      })
      const fd = new FormData()
      fd.append('center', center); fd.append('zone_id', zoneId); fd.append('file', file)
      if (ratio) fd.append('ratio', String(ratio))
      await parkingZoneImage(fd)
      flash(true, t('pk.tFoto')); await load()
    } catch (e) { flash(false, e?.response?.data?.detail || t('pk.eFoto')) }
    setBusy(false)
  }

  // ── Editor ──
  function startEdit() {
    setDraft(JSON.parse(JSON.stringify(data?.layout?.zones || [])))
    histRef.current = { past: [], future: [] }; setHistN(0)
    setEdit(true); setSel(null)
  }
  function cancelEdit() { setDraft(null); setEdit(false); setDrag(null); histRef.current = { past: [], future: [] } }

  // Historial: cada mutación guarda el estado anterior. Los cambios seguidos
  // del mismo gesto (steppers, teclas, escribir el número) se agrupan.
  const snapshot = useCallback((d) => {
    const h = histRef.current
    h.past.push(JSON.stringify(d))
    if (h.past.length > 80) h.past.shift()
    h.future = []
    setHistN((n) => n + 1)
  }, [])
  function snapshotCoalesced(d) {
    const now = Date.now()
    if (now - lastSnapRef.current > 700) { snapshot(d); lastSnapRef.current = now }
  }
  function undo() {
    const h = histRef.current
    if (!h.past.length) return
    setDraft((d) => { h.future.push(JSON.stringify(d)); return JSON.parse(h.past.pop()) })
    setHistN((n) => n + 1)
  }
  function redo() {
    const h = histRef.current
    if (!h.future.length) return
    setDraft((d) => { h.past.push(JSON.stringify(d)); return JSON.parse(h.future.pop()) })
    setHistN((n) => n + 1)
  }

  function patchSpot(zi, si, patch) {
    setDraft((d) => { const n = JSON.parse(JSON.stringify(d)); n[zi].spots[si] = { ...n[zi].spots[si], ...patch }; return n })
  }
  // Igual que patchSpot pero dejando rastro en el historial (steppers, teclado)
  function patchSpotH(zi, si, patch) { snapshotCoalesced(draft); patchSpot(zi, si, patch) }
  function addSpot(zi) {
    snapshot(draft)
    setDraft((d) => {
      const n = JSON.parse(JSON.stringify(d))
      const all = n.flatMap((z) => z.spots || []).map((s) => parseInt(s.code, 10)).filter((x) => !isNaN(x))
      n[zi].spots.push({ code: String((all.length ? Math.max(...all) : 0) + 1), x: 40, y: 45, w: 30, h: 10, rot: 0 })
      return n
    })
  }
  function dupSpot(zi, si) {
    snapshot(draft)
    let nuevo = null
    setDraft((d) => {
      const n = JSON.parse(JSON.stringify(d))
      const s = n[zi].spots[si]
      const all = n.flatMap((z) => z.spots || []).map((x) => parseInt(x.code, 10)).filter((x) => !isNaN(x))
      nuevo = String((all.length ? Math.max(...all) : 0) + 1)
      // Se duplica en paralelo: mismo giro, un hueco más abajo — así una fila
      // entera se hace a base de Ctrl+D sin recolocar nada.
      n[zi].spots.push({ ...s, code: nuevo, y: Math.min(95, s.y + (s.h || 8) + 1) })
      return n
    })
    if (nuevo) setSel(nuevo)
  }
  function removeSpot(zi, si) {
    snapshot(draft)
    setDraft((d) => { const n = JSON.parse(JSON.stringify(d)); n[zi].spots.splice(si, 1); return n }); setSel(null)
  }
  async function saveLayout() {
    setBusy(true)
    try {
      await parkingSaveLayout({ center, name: data?.layout?.name || center, zones: draft })
      flash(true, t('pk.tPlano')); setEdit(false); setDraft(null); await load()
    } catch (e) { flash(false, e?.response?.data?.detail || t('pk.ePlano')) }
    setBusy(false)
  }
  function onSpotDown(e, zi, si) {
    if (!edit) return
    e.preventDefault(); e.stopPropagation()
    snapshot(draft)
    const rect = e.currentTarget.parentElement.getBoundingClientRect()
    const sp = draft[zi].spots[si]
    setSel(sp.code)
    setDrag({ zi, si, startX: e.clientX, startY: e.clientY, ox: sp.x, oy: sp.y, rect })
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function onSpotMove(e) {
    if (!drag) return
    const dx = ((e.clientX - drag.startX) / drag.rect.width) * 100
    const dy = ((e.clientY - drag.startY) / drag.rect.height) * 100
    const sp = draft[drag.zi].spots[drag.si]
    let nx = Math.max(0, Math.min(100 - (sp.w || 10), Math.round((drag.ox + dx) * 10) / 10))
    let ny = Math.max(0, Math.min(100 - (sp.h || 10), Math.round((drag.oy + dy) * 10) / 10))
    // Imán: pega la plaza a la fila/columna de las vecinas (Alt lo desactiva)
    if (snapOn && !e.altKey) {
      const TOL = 0.8
      for (const o of draft[drag.zi].spots) {
        if (o === sp || o.code === sp.code) continue
        if (Math.abs(o.x - nx) < TOL) nx = o.x
        if (Math.abs(o.y - ny) < TOL) ny = o.y
      }
    }
    patchSpot(drag.zi, drag.si, { x: nx, y: ny })
  }
  const draftIdx = useMemo(() => {
    if (!edit || !draft || !sel) return null
    for (let zi = 0; zi < draft.length; zi++) {
      const si = (draft[zi].spots || []).findIndex((s) => s.code === sel)
      if (si >= 0) return { zi, si }
    }
    return null
  }, [edit, draft, sel])
  const draftSpot = draftIdx ? draft[draftIdx.zi].spots[draftIdx.si] : null

  // Atajos del editor: flechas mueven, R gira, Supr borra, Ctrl+Z/Y deshace,
  // Ctrl+D duplica. Con un input activo solo se atienden los de Ctrl.
  useEffect(() => {
    if (!edit) return
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea'
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (typing || !draftIdx) return
      const { zi, si } = draftIdx
      const sp = draft?.[zi]?.spots?.[si]
      if (!sp) return
      const paso = e.shiftKey ? 1 : 0.25
      if (e.key === 'ArrowLeft') { e.preventDefault(); patchSpotH(zi, si, { x: Math.max(0, +(sp.x - paso).toFixed(2)) }) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); patchSpotH(zi, si, { x: Math.min(100 - (sp.w || 10), +(sp.x + paso).toFixed(2)) }) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); patchSpotH(zi, si, { y: Math.max(0, +(sp.y - paso).toFixed(2)) }) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); patchSpotH(zi, si, { y: Math.min(100 - (sp.h || 10), +(sp.y + paso).toFixed(2)) }) }
      else if (e.key.toLowerCase() === 'r') { patchSpotH(zi, si, { rot: ((sp.rot || 0) + (e.shiftKey ? -5 : 5)) }) }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSpot(zi, si) }
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); dupSpot(zi, si) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── Pan del plano (arrastrar el fondo) ──
  function onPanDown(e) {
    if (edit || e.target.closest('button')) return
    panRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  }
  function onPanMove(e) {
    if (!panRef.current) return
    setPan({ x: panRef.current.px + (e.clientX - panRef.current.x), y: panRef.current.py + (e.clientY - panRef.current.y) })
  }
  function onPanUp() { panRef.current = null }
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  if (noCenter) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="rise font-display text-[clamp(26px,3vw,38px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">{t('pk.title')}</h1>
        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-10 text-center text-[14px] text-dark-400">
          <MapPin size={26} className="mx-auto mb-3 opacity-30" />
          {t('pk.eligeCentro')}
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      {/* ══ CABECERA: identidad + métricas + acciones ══ */}
      <header className="rise mb-3 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-[19px] font-semibold tracking-[-0.02em] text-dark-50">{t('pk.title')} {center}</h1>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-500/25">{t('pk.operativo')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Metric n={stats.total} l={t('pk.m.total')} />
          <Metric n={stats.libre} l={t('pk.m.libres')} c="text-dark-200" />
          <Metric n={stats.asignada + stats.reportada} l={t('pk.m.pend')} c={(stats.asignada + stats.reportada) ? 'text-amber-300' : 'text-dark-600'} />
          <Metric n={stats.denegada} l={t('pk.st.revisar')} c={stats.denegada ? 'text-red-300' : 'text-dark-600'} />
          <div className="flex items-center gap-2">
            <Ring pct={stats.disp} />
            <span className="text-[11.5px] leading-tight text-dark-500">{t('pk.m.disp')}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Calendar size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
              className="rounded-lg border border-white/[0.07] bg-white/[0.02] py-1.5 pl-8 pr-2 text-[12.5px] text-dark-50 focus:border-brand-500/50 focus:outline-none" />
          </div>
          {!edit ? (
            <button onClick={startEdit}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-1.5 text-[12px] font-semibold text-dark-300 transition hover:border-brand-500/40 hover:text-brand-300">
              <Pencil size={12} /> {t('pk.editar')}
            </button>
          ) : (
            <>
              <button onClick={saveLayout} disabled={busy}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {t('pk.guardar')}
              </button>
              <button onClick={cancelEdit} className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-[12px] text-dark-400 hover:text-dark-200">{t('pk.cancelar')}</button>
            </>
          )}
        </div>
      </header>

      {err && <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-2.5 text-[13px] text-red-300"><ShieldAlert size={14} /> {err}</div>}
      {toast && <div className={`mb-3 rounded-xl border px-4 py-2.5 text-[13px] ${toast.ok ? 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-300' : 'border-red-500/25 bg-red-500/[0.07] text-red-300'}`}>{toast.msg}</div>}

      {!data ? (
        <div className="flex items-center gap-2 py-16 text-dark-500"><Loader2 size={16} className="animate-spin" /> {t('pk.cargando')}</div>
      ) : (
        <>
          {/* ══ SELECTOR DE ZONA (una a la vez) ══ */}
          <div className="rise mb-3 flex flex-wrap gap-1.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5" style={{ animationDelay: '50ms' }}>
            {zones.map((z, i) => {
              const zs = zoneStats(z), ac = ZONE_ACCENT[z.color] || ZONE_ACCENT.sky
              const on = i === zIdx
              return (
                <button key={z.id} onClick={() => { setAz(i); setSel(null); setMoving(false); resetView(); localStorage.setItem('pk_zona_' + center, String(i)) }}
                  className={`group relative flex flex-1 items-center gap-2.5 overflow-hidden rounded-xl px-3.5 py-2 text-left transition ${on ? 'bg-white/[0.06] ring-1 ring-inset ' + ac.br.replace('border-', 'ring-') : 'hover:bg-white/[0.03]'}`}>
                  <span className={`h-8 w-1 shrink-0 rounded-full ${on ? ac.bar : 'bg-white/10'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className={`text-[9.5px] font-bold uppercase tracking-wider ${on ? ac.tx : 'text-dark-500'}`}>{t('pk.zona')} {i + 1}</span>
                      <span className={`truncate text-[12px] ${on ? 'text-dark-100' : 'text-dark-400'}`}>{z.name}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                        <span className={`block h-full rounded-full ${ac.bar} transition-[width] duration-500`} style={{ width: `${zs.pct}%` }} />
                      </span>
                      <span className={`shrink-0 font-mono text-[10.5px] tabular-nums ${on ? ac.tx : 'text-dark-600'}`}>{zs.occ}/{zs.total}</span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
            {/* ══ PLANO ══ */}
            <div className="rise min-w-0" style={{ animationDelay: '90ms' }}>
              <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-black/30">
                {/* Barra: zona activa + leyenda + foto */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/[0.05] px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${zAc.bar}`} />
                    <span className="text-[12.5px] font-semibold text-dark-100">{zone?.name}</span>
                    <span className="font-mono text-[10.5px] tabular-nums text-dark-500">· {zStats.occ}/{zStats.total} {t('pk.ocupadas')}</span>
                  </span>
                  <span className="mx-1 hidden h-4 w-px bg-white/10 md:block" />
                  {Object.entries(SPOT_UI).map(([k, v]) => (
                    <span key={k} className="hidden items-center gap-1.5 text-[10px] text-dark-500 lg:flex">
                      <span className={`h-2 w-2 rounded-full ${v.dot}`} /> {t(v.label)}
                    </span>
                  ))}
                  <label title={t('pk.fotoTitle')}
                    className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/[0.1] px-2.5 py-1 text-[11px] font-semibold text-dark-300 transition hover:border-brand-500/40 hover:text-brand-300">
                    <ImageIcon size={12} /> {zone?.bg ? t('pk.fotoCambiar') : t('pk.fotoSubir')}
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f && zone) uploadBg(zone.id, f) }} />
                  </label>
                </div>
                {edit && (
                  <div className="border-b border-white/[0.05] bg-brand-500/[0.05] px-3 py-1.5 text-[11px] font-semibold leading-snug text-brand-300">
                    {t('pk.bannerEdit')}
                  </div>
                )}

                {/* Lienzo: UNA zona, grande, ajustada a la foto */}
                <div ref={viewRef} className="relative h-[560px] cursor-grab overflow-hidden bg-black/40 active:cursor-grabbing"
                  onPointerDown={onPanDown} onPointerMove={onPanMove} onPointerUp={onPanUp} onPointerLeave={onPanUp}>
                  <div className="grid h-full w-full place-items-center transition-transform duration-100"
                    style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center' }}>
                    {zone && zBox.w > 0 && (() => {
                      const z = zone, zi = zIdx, ac = zAc
                      return (
                        <div className="relative overflow-hidden rounded-2xl border shadow-[0_24px_70px_-20px_rgba(0,0,0,.85)]"
                          style={{ width: zBox.w, height: zBox.h,
                            borderColor: 'rgba(255,255,255,.09)',
                            ...(z.bg
                              ? { backgroundImage: `url(${z.bg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundColor: '#0d0d0f' }
                              : { background: GROUND[z.id] || GROUND.general }) }}>
                            {/* Profundidad: viñeta interior + brillo cenital */}
                            <div className="pointer-events-none absolute inset-0 z-[1]" style={{ boxShadow: `inset 0 0 75px rgba(0,0,0,.62)` }} />
                            {z.bg && <div className={`pointer-events-none absolute inset-0 z-[1] ${edit ? 'bg-black/[0.04]' : 'bg-gradient-to-b from-black/15 via-transparent to-black/45'}`} />}
                            {(z.spots || []).map((sp, si) => {
                              const { status, row } = spotState(sp.code)
                              const ui = SPOT_UI[status]
                              const active = sel === sp.code
                              const isDrop = dropTarget === sp.code
                              const horiz = (sp.w || 1) >= (sp.h || 1)
                              return (
                                <button key={sp.code}
                                  onPointerDown={(e) => onSpotDown(e, zi, si)}
                                  onPointerMove={onSpotMove}
                                  onPointerUp={() => setDrag(null)}
                                  onClick={() => { if (!edit) { setSel(active ? null : sp.code); setMoving(false) } }}
                                  onMouseEnter={(e) => !edit && row && setHover({ code: sp.code, row, x: e.clientX, y: e.clientY })}
                                  onMouseLeave={() => setHover(null)}
                                  onDragOver={(e) => { if (!edit && !row) { e.preventDefault(); setDropTarget(sp.code) } }}
                                  onDragLeave={() => setDropTarget((t) => (t === sp.code ? null : t))}
                                  onDrop={(e) => {
                                    e.preventDefault(); setDropTarget(null)
                                    const vid = e.dataTransfer.getData('text/vehicle-id')
                                    if (vid && !row) doAssign(vid, sp.code)
                                  }}
                                  title={row?.vehicle?.license_plate ? `${t('pk.plaza')} ${sp.code} · ${row.vehicle.license_plate}` : `${t('pk.plaza')} ${sp.code} · ${t('pk.st.libre')}`}
                                  className={`group absolute z-[2] transition-[box-shadow,background] duration-200 ${active || isDrop ? 'z-20' : 'hover:brightness-[1.18]'}`}
                                  style={{
                                    left: `${sp.x}%`, top: `${sp.y}%`, width: `${sp.w}%`, height: `${sp.h}%`,
                                    transform: `rotate(${sp.rot || 0}deg)`,
                                    borderRadius: 5,
                                    background: row ? ui.fill : 'rgba(255,255,255,.06)',
                                    border: `2px ${row ? 'solid' : 'dashed'} ${ui.line}`,
                                    // Glow, nunca escala: así al colocar un coche nada se descuadra
                                    boxShadow: isDrop
                                      ? '0 0 0 2px #34d399, 0 0 22px rgba(52,211,153,.75)'
                                      : active
                                        ? `0 0 0 2px ${ui.line}, 0 0 20px ${ui.glow || 'rgba(255,255,255,.3)'}`
                                        : row && ui.glow
                                          ? `0 0 15px ${ui.glow}, inset 0 0 10px rgba(0,0,0,.28)`
                                          : 'inset 0 1px 0 rgba(255,255,255,.05)',
                                    ...(edit ? { cursor: drag ? 'grabbing' : 'grab', touchAction: 'none' } : null),
                                  }}>
                                  {row && <Van horiz={horiz} tone={ui.van} />}
                                  <span className="pointer-events-none absolute left-1/2 top-1/2 rounded bg-black/60 px-1 font-mono text-[8.5px] font-bold leading-none text-white/95 [text-shadow:0_1px_2px_rgba(0,0,0,.95)]"
                                    style={{ transform: `translate(-50%,-50%) rotate(${-(sp.rot || 0)}deg)` }}>{sp.code}</span>
                                  {row?.mismatch && <span className="pointer-events-none absolute -right-1 -top-1 z-30 h-2 w-2 rounded-full bg-red-400 ring-2 ring-dark-950" />}
                                </button>
                              )
                            })}
                            {(z.spots || []).length === 0 && (
                              <p className="absolute inset-0 z-[2] flex items-center justify-center px-3 text-center text-[11px] text-dark-500">{t('pk.sinPlazas')}</p>
                            )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Controles de vista */}
                  <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-lg border border-white/[0.08] bg-black/70 p-1 backdrop-blur">
                    <IconBtn onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} title={t('pk.zoomIn')}><Plus size={13} /></IconBtn>
                    <IconBtn onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.25).toFixed(2)))} title={t('pk.zoomOut')}><Minus size={13} /></IconBtn>
                    <IconBtn onClick={resetView} title={t('pk.zoomFit')}><Maximize2 size={13} /></IconBtn>
                    <span className="pt-0.5 text-center font-mono text-[9px] text-dark-500">{Math.round(zoom * 100)}%</span>
                  </div>
                </div>
              </div>

              {/* Tooltip al pasar el ratón */}
              {hover?.row && (
                <div className="pointer-events-none fixed z-50 rounded-xl border border-white/[0.1] bg-dark-900/95 px-3 py-2 shadow-2xl backdrop-blur"
                  style={{ left: Math.min(hover.x + 14, window.innerWidth - 220), top: hover.y + 14 }}>
                  <p className="font-mono text-[13px] font-bold text-dark-50">{hover.row.vehicle?.license_plate || '—'}</p>
                  <p className="text-[11px] text-dark-400">{hover.row.driver?.name || t('pk.sinConductor')}</p>
                  <p className="mt-1 text-[10.5px] text-dark-500">
                    {t('pk.plaza')} {hover.code} · {t(SPOT_UI[spotState(hover.code).status].label)}
                  </p>
                </div>
              )}
            </div>

            {/* ══ PANEL LATERAL ══ */}
            <div className="rise" style={{ animationDelay: '130ms' }}>
              <div className="sticky top-4 space-y-3">
                {edit ? (
                  <EditorPanel draftSpot={draftSpot} draftIdx={draftIdx} draft={draft}
                    patchSpot={patchSpotH} addSpot={addSpot} dupSpot={dupSpot} removeSpot={removeSpot}
                    undo={undo} redo={redo}
                    canUndo={histRef.current.past.length > 0} canRedo={histRef.current.future.length > 0}
                    snapOn={snapOn} setSnapOn={setSnapOn} />
                ) : sel ? (
                  <DetailPanel
                    sel={sel} selRow={selRow} selStatus={selStatus} busy={busy} moving={moving}
                    setMoving={setMoving} resolve={resolve} moveTo={moveTo}
                  />
                ) : (
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 py-8 text-center text-[12.5px] text-dark-500">
                    <Car size={22} className="mx-auto mb-3 opacity-30" />
                    {t('pk.vacio1')}<br />{t('pk.vacio2')}
                  </div>
                )}

                {/* Vehículos sin plaza — se arrastran al plano */}
                {!edit && (
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="mb-2 flex items-baseline justify-between">
                      <p className="text-[12px] font-semibold text-dark-200">{t('pk.sinPlaza')}</p>
                      <span className={`font-mono text-[11px] tabular-nums ${pending.length ? 'text-amber-300' : 'text-dark-600'}`}>{pending.length}</span>
                    </div>
                    {pending.length === 0 ? (
                      <p className="py-3 text-center text-[11.5px] text-dark-600">{t('pk.todasUbicadas')}</p>
                    ) : (
                      <>
                        <div className="relative mb-2">
                          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
                          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pk.buscarMatricula')}
                            className="w-full rounded-lg border border-white/[0.07] bg-white/[0.02] py-1.5 pl-8 pr-2 text-[12px] text-dark-50 placeholder:text-dark-600 focus:border-brand-500/50 focus:outline-none" />
                        </div>
                        <p className="mb-1.5 text-[10.5px] text-dark-600">{t('pk.arrastraUno')}</p>
                        <div className="max-h-[240px] space-y-1 overflow-y-auto">
                          {pending.filter((v) => !q || (v.license_plate || '').toLowerCase().includes(q.toLowerCase()))
                            .slice(0, 40).map((v) => (
                              <div key={v.id} draggable
                                onDragStart={(e) => { e.dataTransfer.setData('text/vehicle-id', v.id); e.dataTransfer.effectAllowed = 'move' }}
                                onClick={() => sel && !selRow && doAssign(v.id, sel)}
                                className="flex cursor-grab items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5 transition hover:border-brand-500/40 active:cursor-grabbing">
                                <Car size={12} className="shrink-0 text-dark-500" />
                                <span className="font-mono text-[12px] font-semibold text-dark-100">{v.license_plate}</span>
                                <span className="truncate text-[10.5px] text-dark-600">{[v.brand, v.model].filter(Boolean).join(' ')}</span>
                              </div>
                            ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ══ UBICADAS HOY ══ */}
          {(data.assignments || []).length > 0 && (
            <section className="rise mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4" style={{ animationDelay: '170ms' }}>
              <h2 className="mb-3 text-[13px] font-semibold text-dark-100">
                {t('pk.ubicadasHoy')} <span className="text-dark-600">· {(data.assignments || []).length}</span>
              </h2>
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
                {(data.assignments || []).map((r) => {
                  const st = r.mismatch ? 'denegada' : (r.status || 'asignada')
                  const ui = SPOT_UI[st] || SPOT_UI.asignada
                  const shown = r.reported_spot || r.spot
                  return (
                    <button key={r.vehicle_id} onClick={() => { setSel(shown); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                      className="float-row flex items-center gap-2.5 rounded-xl px-3 py-2 text-left">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-[11px] font-bold ${ui.chip}`}>{shown || '—'}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold text-dark-100">{r.vehicle?.license_plate || '—'}</span>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${ui.dot}`} />
                    </button>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Metric({ n, l, c = 'text-dark-50' }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-[17px] font-semibold tabular-nums ${c}`}>{n}</span>
      <span className="text-[11px] text-dark-500">{l}</span>
    </div>
  )
}
function IconBtn({ onClick, title, children }) {
  return (
    <button onClick={onClick} title={title}
      className="flex h-6 w-6 items-center justify-center rounded text-dark-300 transition hover:bg-white/10 hover:text-dark-50">
      {children}
    </button>
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
function Stepper({ label, value, onMinus, onPlus }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11.5px] text-dark-400">{label}</span>
      <div className="flex items-center gap-1">
        <button onClick={onMinus} className="h-6 w-6 rounded-md border border-white/[0.1] text-[13px] leading-none text-dark-300 hover:border-brand-500/40 hover:text-brand-300">−</button>
        <span className="w-12 text-center font-mono text-[11.5px] tabular-nums text-dark-200">{value}</span>
        <button onClick={onPlus} className="h-6 w-6 rounded-md border border-white/[0.1] text-[13px] leading-none text-dark-300 hover:border-brand-500/40 hover:text-brand-300">+</button>
      </div>
    </div>
  )
}

function DetailPanel({ sel, selRow, selStatus, busy, moving, setMoving, resolve, moveTo }) {
  const { t } = useT()
  const ui = SPOT_UI[selStatus]
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] text-dark-500">{t('pk.plaza')}</p>
          <p className="font-display text-[30px] font-semibold leading-none tracking-tight text-dark-50">{sel}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${ui.chip}`}>{t(ui.label)}</span>
      </div>
      {!selRow ? (
        <p className="mt-4 border-t border-white/[0.06] pt-3 text-[12.5px] leading-relaxed text-dark-500">
          {t('pk.dLibre')}
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-3 text-[12.5px]">
            <Row k={t('pk.vehiculo')} v={selRow.vehicle?.license_plate || '—'} mono />
            <Row k={t('pk.dConductor')} v={selRow.driver?.name || '—'} />
            <Row k={t('pk.st.asignada')} v={selRow.spot || '—'} mono />
            <Row k={t('pk.st.reportada')} v={selRow.reported_spot || '—'} mono />
            {selRow.reported_by && <Row k={t('pk.dReporto')} v={selRow.reported_by} />}
          </div>
          {selRow.mismatch && (
            <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3 py-2 text-[11.5px] leading-relaxed text-red-300">
              {t('pk.mm1')} <b>{selRow.spot}</b> {t('pk.mm2')} <b>{selRow.reported_spot}</b>. {t('pk.mm3')}
            </p>
          )}
          {moving ? (
            <div className="mt-3">
              <p className="mb-2 text-[11.5px] text-dark-400">{t('pk.numCorrecta')}</p>
              <MoveTo onSubmit={moveTo} busy={busy} />
              <button onClick={() => setMoving(false)} className="mt-2 w-full text-center text-[11.5px] text-dark-500 hover:text-dark-300">{t('pk.cancelar')}</button>
            </div>
          ) : (
            <div className="mt-3 space-y-1.5">
              <button onClick={() => resolve('confirm')} disabled={busy}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/12 py-2 text-[12px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50">
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {t('pk.confirmarLlegada')}
              </button>
              <button onClick={() => setMoving(true)} disabled={busy}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/[0.1] py-2 text-[12px] font-semibold text-dark-300 transition hover:border-white/[0.18] disabled:opacity-50">
                <Move size={12} /> {t('pk.moverPlaza')}
              </button>
              <button onClick={() => resolve('deny')} disabled={busy}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-[12px] font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50">
                <X size={12} /> {t('pk.denegarUbi')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EditorPanel({ draftSpot, draftIdx, draft, patchSpot, addSpot, dupSpot, removeSpot,
  undo, redo, canUndo, canRedo, snapOn, setSnapOn }) {
  const { t } = useT()
  return (
    <div className="rounded-2xl border border-brand-500/25 bg-brand-500/[0.04] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-brand-300">{t('pk.eTitulo')}</p>
        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={!canUndo} title={t('pk.eDeshacer')}
            className="h-7 rounded-lg border border-white/[0.1] px-2 text-[11px] font-semibold text-dark-300 hover:border-brand-500/40 hover:text-brand-300 disabled:opacity-30">↩</button>
          <button onClick={redo} disabled={!canRedo} title={t('pk.eRehacer')}
            className="h-7 rounded-lg border border-white/[0.1] px-2 text-[11px] font-semibold text-dark-300 hover:border-brand-500/40 hover:text-brand-300 disabled:opacity-30">↪</button>
          <button onClick={() => setSnapOn((s) => !s)} title={t('pk.eImanTitle')}
            className={`h-7 rounded-lg border px-2 text-[11px] font-semibold ${snapOn
              ? 'border-brand-500/50 bg-brand-500/15 text-brand-300'
              : 'border-white/[0.1] text-dark-500 hover:text-dark-300'}`}>{t('pk.eIman')}</button>
        </div>
      </div>
      {!draftSpot ? (
        <p className="text-[12.5px] leading-relaxed text-dark-400">
          {t('pk.eAyuda')}
          <span className="mt-2 block text-[11px] leading-relaxed text-dark-500">
            {t('pk.eAtajos')}
          </span>
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[11px] text-dark-500">{t('pk.eNumero')}</p>
            <input value={draftSpot.code}
              onChange={(e) => patchSpot(draftIdx.zi, draftIdx.si, { code: e.target.value })}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 font-mono text-[13px] font-semibold text-dark-50 focus:border-brand-500/50 focus:outline-none" />
          </div>
          <Stepper label={t('pk.eRotacion')} value={`${draftSpot.rot || 0}°`}
            onMinus={() => patchSpot(draftIdx.zi, draftIdx.si, { rot: (draftSpot.rot || 0) - 5 })}
            onPlus={() => patchSpot(draftIdx.zi, draftIdx.si, { rot: (draftSpot.rot || 0) + 5 })} />
          <Stepper label={t('pk.eLargo')} value={`${draftSpot.w}`}
            onMinus={() => patchSpot(draftIdx.zi, draftIdx.si, { w: Math.max(3, +(draftSpot.w - 1).toFixed(1)) })}
            onPlus={() => patchSpot(draftIdx.zi, draftIdx.si, { w: Math.min(95, +(draftSpot.w + 1).toFixed(1)) })} />
          <Stepper label={t('pk.eAncho')} value={`${draftSpot.h}`}
            onMinus={() => patchSpot(draftIdx.zi, draftIdx.si, { h: Math.max(2, +(draftSpot.h - 0.5).toFixed(1)) })}
            onPlus={() => patchSpot(draftIdx.zi, draftIdx.si, { h: Math.min(95, +(draftSpot.h + 0.5).toFixed(1)) })} />
          <div className="flex gap-1.5">
            <button onClick={() => dupSpot(draftIdx.zi, draftIdx.si)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.1] py-2 text-[11.5px] font-semibold text-dark-300 hover:border-brand-500/40 hover:text-brand-300">
              <RotateCw size={11} /> {t('pk.eDuplicar')}
            </button>
            <button onClick={() => removeSpot(draftIdx.zi, draftIdx.si)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-[11.5px] font-semibold text-red-300 hover:bg-red-500/20">
              <Trash2 size={11} /> {t('pk.eEliminar')}
            </button>
          </div>
        </div>
      )}
      <div className="mt-4 space-y-1.5 border-t border-white/[0.08] pt-3">
        <p className="text-[11px] text-dark-500">{t('pk.eAnadirA')}</p>
        {(draft || []).map((z, zi) => (
          <button key={z.id} onClick={() => addSpot(zi)}
            className="flex w-full items-center justify-between rounded-lg border border-white/[0.07] px-3 py-1.5 text-[11.5px] text-dark-300 hover:border-brand-500/40 hover:text-brand-300">
            {z.name} <Plus size={11} />
          </button>
        ))}
      </div>
    </div>
  )
}

function MoveTo({ onSubmit, busy }) {
  const { t } = useT()
  const [v, setV] = useState('')
  return (
    <div className="flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && v.trim() && onSubmit(v.trim())}
        placeholder="Nº"
        className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 font-mono text-[12.5px] text-dark-50 focus:border-brand-500/50 focus:outline-none" />
      <button onClick={() => v.trim() && onSubmit(v.trim())} disabled={busy || !v.trim()}
        className="rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 px-3 text-[12px] font-semibold text-white disabled:opacity-40">
        {busy ? <Loader2 size={12} className="animate-spin" /> : t('pk.mover')}
      </button>
    </div>
  )
}
