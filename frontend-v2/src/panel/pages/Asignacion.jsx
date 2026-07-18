import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT } from '../../i18n'
import { useEscape } from '../../lib/useEscape'
import {
  Loader2, Save, ClipboardList, Truck, User, Calendar,
  Copy, RotateCcw, Trash2, Camera, AlertTriangle, Check,
  ClipboardPaste, Plus, X,
} from 'lucide-react'
import { getDailyAssignment, putDailyAssignment, getVehicles, getDrivers, getInspections } from '../api'

/* ── Date helpers ── */
function isoToday() { return new Date().toISOString().slice(0, 10) }
function isoPrev(iso) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

/* ── Name normalization ── */
function normName(raw) {
  return (raw || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
}
function amazonToNorm(raw) {
  const idx = raw.indexOf(',')
  if (idx < 0) return normName(raw)
  return normName(`${raw.slice(idx + 1)} ${raw.slice(0, idx)}`)
}

/* ── Amazon roster parser — formato con tabulaciones del portal Amazon ── */
function parseTabRoster(text) {
  const seen = new Map()
  for (const line of text.split('\n')) {
    const cols = line.split('\t').map(c => c.trim())
    if (cols.length < 8) continue
    const di = cols.findIndex(c => /^\d{2}\/\d{2}\/\d{4}$/.test(c))
    if (di < 0) continue
    const driverRaw = cols[di + 3]
    if (!driverRaw || driverRaw === 'C' || !driverRaw.includes(',') || driverRaw.length < 4) continue
    const plateRaw = cols[di + 5]
    const plate = plateRaw && /\d{4}\s*[A-Z]{2,3}/.test(plateRaw) ? plateRaw : null
    const route = cols[di + 6] || null
    if (!seen.has(driverRaw) || plate) seen.set(driverRaw, { rawName: driverRaw, plate, route })
  }
  return [...seen.values()]
}

/* ── Parser simple: "NOMBRE APELLIDO   1234 ABC" (una línea por conductor) ── */
function parseSimpleRoster(text) {
  const seen = new Map()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length < 3) continue
    // Intenta extraer matrícula al final: 4 dígitos + 2-3 letras (con o sin espacio)
    const plateMatch = trimmed.match(/^(.+?)\s{2,}(\d{4}\s*[A-Z]{2,3})\s*$/) ||
                       trimmed.match(/^(.+)\s+(\d{4}\s*[A-Z]{2,3})\s*$/)
    if (plateMatch) {
      const rawName = plateMatch[1].trim()
      if (rawName.length < 3) continue
      const plate = plateMatch[2].replace(/\s/g, ' ').trim()
      if (!seen.has(rawName)) seen.set(rawName, { rawName, plate, route: null })
      continue
    }
    // Sin matrícula: solo nombre
    const words = trimmed.split(/\s+/)
    if (words.length >= 2 && /^[A-ZÁÉÍÓÚÀÈÌÒÙÑÜÇ\-']+$/i.test(words[0])) {
      const rawName = trimmed
      if (!seen.has(rawName)) seen.set(rawName, { rawName, plate: null, route: null })
    }
  }
  return [...seen.values()]
}

/* ── Selecciona el parser adecuado ── */
function parseRoster(text) {
  const tabResult = parseTabRoster(text)
  if (tabResult.length > 0) return tabResult
  return parseSimpleRoster(text)
}

/* ── Fuzzy match ── */
function matchRoster(parsed, drivers, vehicles) {
  return parsed.map(row => {
    const normSearch = amazonToNorm(row.rawName)
    let bestDriver = null, bestScore = 0
    for (const d of drivers) {
      const normD = normName(d.name)
      const sw = normSearch.split(' ').filter(w => w.length > 1)
      const dw = normD.split(' ').filter(w => w.length > 1)
      const hits = sw.filter(w => dw.some(dv => dv.startsWith(w) || w.startsWith(dv)))
      const score = hits.length / Math.max(sw.length, dw.length)
      if (score > bestScore && score >= 0.4) { bestScore = score; bestDriver = d }
    }
    let matchedV = null
    if (row.plate) {
      const np = row.plate.replace(/\s/g, '').toLowerCase()
      matchedV = vehicles.find(v => v.license_plate?.replace(/\s/g, '').toLowerCase() === np)
    }
    return {
      rawName: row.rawName, route: row.route,
      driver_id: bestDriver?.id || '', driver_name: bestDriver?.name || '',
      vehicle_id: matchedV?.id || '', vehicle_plate: matchedV?.license_plate || row.plate || '',
      _driverOk: !!bestDriver,
    }
  })
}

/* ── Avatar ── */
function avatarBg(name) {
  let h = 0; for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return `hsl(${Math.abs(h) % 360},50%,36%)`
}
function initials(name) {
  const p = (name || '').split(' ').filter(Boolean)
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : (name || '?')[0].toUpperCase()
}

/* ── Severity badge ── */
function SeverityBadge({ insp }) {
  const { t } = useT()
  if (!insp) return <span className="text-xs text-dark-600">{t('asgn.no.photos')}</span>
  // Las inspecciones reales traen la severidad dentro de analysis; el fallback
  // del slot (backend) la trae a nivel raíz como severity.
  const sev = insp.analysis?.severity || insp.damage_level || insp.severity || insp.damage_severity || ''
  const cls =
    /CRIT/i.test(sev) ? 'bg-red-500/25 text-red-300' :
    /GRAV/i.test(sev) ? 'bg-orange-500/25 text-orange-300' :
    /MOD/i.test(sev)  ? 'bg-amber-500/25 text-amber-300' :
    /LEV/i.test(sev)  ? 'bg-yellow-500/20 text-yellow-300' :
    'bg-emerald-500/20 text-emerald-300'
  // Traducir claves conocidas (sin_danos → "Sin daños"); si no hay clave, mostrar tal cual.
  const label = sev ? (t('sev.' + sev) !== 'sev.' + sev ? t('sev.' + sev) : sev) : 'Subidas'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      <Camera size={10} /> {label}
    </span>
  )
}

/* ── Toast notifications ── */
function Toasts({ toasts }) {
  const { t: tr } = useT()
  if (!toasts.length) return null
  return (
    <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-dark-900 px-4 py-3 shadow-2xl"
          style={{ animation: 'slideIn 0.25s ease' }}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
            <Camera size={15} className="text-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-dark-50">{t.name}</div>
            <div className="text-xs text-dark-400">{tr('asgn.photos.uploaded')}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Paste Modal ── */
function PasteModal({ drivers, vehicles, onApply, onClose }) {
  useEscape(onClose)
  const { t } = useT()
  const [text, setText] = useState('')
  const parsed = useMemo(() => (text.trim() ? parseRoster(text) : []), [text])
  const matched = useMemo(() => matchRoster(parsed, drivers, vehicles), [parsed, drivers, vehicles])
  const withV = matched.filter(m => m.vehicle_id).length
  const withD = matched.filter(m => m.driver_id).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-4 flex w-full max-w-2xl flex-col gap-4 rounded-xl border border-dark-700 bg-dark-900 p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-dark-50">{t('asgn.paste.title')}</h2>
            <p className="mt-0.5 text-xs text-dark-400">{t('asgn.paste.hint')}</p>
          </div>
          <button onClick={onClose} className="btn-ghost shrink-0 p-1.5"><X size={16} /></button>
        </div>

        <textarea
          className="input h-52 resize-none font-mono text-xs leading-relaxed"
          placeholder={t('asgn.paste.textarea.ph')}
          value={text}
          onChange={e => setText(e.target.value)}
          autoFocus
        />

        {parsed.length > 0 && (
          <div className="rounded-lg border border-dark-700 bg-dark-800/60 p-3">
            <div className="flex flex-wrap gap-5 text-sm">
              <span className="flex items-center gap-1.5 text-dark-200">
                <User size={13} className="text-brand-400" />
                <b className="text-white">{parsed.length}</b> {t('asgn.paste.detected')}
              </span>
              <span className="flex items-center gap-1.5 text-dark-200">
                <Check size={13} className="text-emerald-400" />
                <b className="text-white">{withD}</b> {t('asgn.paste.matched')}
              </span>
              <span className="flex items-center gap-1.5 text-dark-200">
                <Truck size={13} className="text-brand-400" />
                <b className="text-white">{withV}</b> {t('asgn.paste.plate')}
              </span>
              {withD < parsed.length && (
                <span className="flex items-center gap-1.5 text-amber-300">
                  <AlertTriangle size={13} />
                  {parsed.length - withD} {t('asgn.paste.unmatched')}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">{t('ui.cancel')}</button>
          <button
            onClick={() => { onApply(matched); onClose() }}
            disabled={matched.length === 0}
            className="btn-primary flex items-center gap-1.5 disabled:opacity-40"
          >
            <Check size={14} /> {t('asgn.paste.apply')} {matched.length > 0 ? `(${matched.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Assignment row ── */
function SlotRow({ slot, vehicles, drivers, usedV, usedD, onChange, onDelete, inspection, center }) {
  const { t } = useT()
  const hasIssue = !slot.vehicle_id || !slot.driver_id
  const hasPhotos = !!inspection
  const bg = avatarBg(slot.driver_name)

  // Find driver object to get photo_url
  const driverObj = slot.driver_id ? drivers.find(d => d.id === slot.driver_id) : null
  const photoUrl = driverObj?.photo_url || null

  return (
    <div className={`group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-300 ${
      hasPhotos
        ? 'border-emerald-500/20 bg-emerald-500/5'
        : hasIssue
          ? 'border-amber-500/20 bg-amber-500/5'
          : 'border-dark-800/80 bg-dark-900/50 hover:border-dark-700'
    }`}>

      {/* Vehicle plate — verde si tiene fotos */}
      <div className="w-32 shrink-0">
        <select
          value={slot.vehicle_id}
          onChange={e => {
            const v = vehicles.find(x => x.id === e.target.value)
            onChange({ vehicle_id: e.target.value, vehicle_plate: v?.license_plate || '' })
          }}
          className={`w-full cursor-pointer appearance-none rounded-md border px-2 py-1.5 text-center text-sm font-bold tracking-widest transition-colors focus:outline-none focus:ring-1 ${
            hasPhotos
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300 focus:ring-emerald-500'
              : slot.vehicle_id
                ? 'border-dark-600 bg-dark-800 text-white hover:border-dark-500 focus:ring-brand-500'
                : 'border-amber-500/40 bg-amber-500/8 text-amber-400 focus:ring-amber-500'
          }`}
        >
          <option value="">{t('asgn.plate.ph')}</option>
          {vehicles.filter(v => v.status !== 'baja').map(v => (
            <option key={v.id} value={v.id} disabled={usedV.has(v.id) && v.id !== slot.vehicle_id}>
              {v.license_plate}
            </option>
          ))}
        </select>
      </div>

      {/* Driver avatar + name */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {/* Avatar: foto si existe, iniciales si no */}
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={slot.driver_name}
            className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-dark-600"
          />
        ) : slot.driver_name ? (
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ background: bg }}
          >
            {initials(slot.driver_name)}
          </div>
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dark-700 bg-dark-800">
            <User size={12} className="text-dark-500" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <select
            value={slot.driver_id}
            onChange={e => {
              const d = drivers.find(x => x.id === e.target.value)
              onChange({ driver_id: e.target.value, driver_name: d?.name || '' })
            }}
            className={`select w-full text-sm ${!slot.driver_id ? 'text-amber-400' : hasPhotos ? 'text-emerald-200' : ''}`}
          >
            <option value="">{t('asgn.driver.ph')}</option>
            <optgroup label={t('asgn.drv.center')}>
              {drivers.filter(d => !d.center || d.center === center).map(d => (
                <option key={d.id} value={d.id} disabled={usedD.has(d.id) && d.id !== slot.driver_id}>
                  {d.name}
                </option>
              ))}
            </optgroup>
            {drivers.some(d => center && d.center && d.center !== center) && (
              <optgroup label={t('asgn.drv.other')}>
                {drivers.filter(d => center && d.center && d.center !== center).map(d => (
                  <option key={d.id} value={d.id} disabled={usedD.has(d.id) && d.id !== slot.driver_id}>
                    {d.name} — {d.center}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {(() => {
            const dObj = slot.driver_id ? drivers.find(x => x.id === slot.driver_id) : null
            return dObj && center && dObj.center && dObj.center !== center ? (
              <div className="mt-0.5 truncate px-0.5 text-[11px] font-semibold text-sky-400/80">
                ⇄ {t('asgn.drv.loan')} · {dObj.center}
              </div>
            ) : null
          })()}
          {slot.rawName && !slot._driverOk && (
            <div className="mt-0.5 truncate px-0.5 text-[11px] text-amber-400/70">⚠ {slot.rawName}</div>
          )}
        </div>
      </div>

      {/* Photos today */}
      <div className="w-28 shrink-0 text-right">
        {slot.vehicle_id
          ? <SeverityBadge insp={inspection} />
          : <span className="text-xs text-dark-700">—</span>
        }
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="btn-ghost shrink-0 p-1.5 text-dark-700 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

/* ── Main page ── */
export default function Asignacion() {
  const { center, centers } = useOutletContext()
  const { t } = useT()
  const [date, setDate] = useState(isoToday())
  const [slots, setSlots] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [inspMap, setInspMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [toasts, setToasts] = useState([])

  // Refs para el polling (evitan closures obsoletas)
  const prevInspRef = useRef({})
  const slotsRef = useRef([])
  useEffect(() => { slotsRef.current = slots }, [slots])

  const noCenter = center === 'Todos'

  function addToast(name) {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, name }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000)
  }

  /* ── Carga inicial ── */
  const load = useCallback(async () => {
    if (noCenter) return
    setLoading(true); setMsg(null)
    try {
      const [da, vs, ds, insp] = await Promise.all([
        getDailyAssignment(center, date),
        getVehicles(center),
        // Todos los centros: a veces se usan conductores prestados de otra estación
        getDrivers('Todos'),
        getInspections({ center, date_from: date, date_to: date, limit: 500 }).catch(() => ({ data: [] })),
      ])
      setVehicles(vs.data || [])
      setDrivers(ds.data || [])
      const doc = Array.isArray(da.data) ? da.data[0] : da.data
      const loadedSlots = Array.isArray(doc?.slots) ? doc.slots : []
      setSlots(loadedSlots)
      const insps = Array.isArray(insp.data) ? insp.data : []
      const map = buildInspMap(loadedSlots, insps)
      prevInspRef.current = map
      setInspMap(map)
    } catch { setMsg({ ok: false, t: t('asgn.load.error') }) }
    finally { setLoading(false) }
  }, [center, date, noCenter])

  useEffect(() => { load() }, [load])

  /* ── Polling cada 30s — actualización a tiempo real ── */
  useEffect(() => {
    if (noCenter) return
    const poll = async () => {
      try {
        const [da, insp] = await Promise.all([
          getDailyAssignment(center, date),
          getInspections({ center, date_from: date, date_to: date, limit: 500 }).catch(() => ({ data: [] })),
        ])
        const doc = Array.isArray(da.data) ? da.data[0] : da.data
        const freshSlots = Array.isArray(doc?.slots) ? doc.slots : []
        const insps = Array.isArray(insp.data) ? insp.data : []
        const newMap = buildInspMap(freshSlots, insps)
        for (const vid of Object.keys(newMap)) {
          if (!prevInspRef.current[vid]) {
            const slot = slotsRef.current.find(s => s.vehicle_id === vid)
            if (slot?.driver_name) addToast(slot.driver_name)
          }
        }
        prevInspRef.current = newMap
        setInspMap(newMap)
      } catch { /* silencioso */ }
    }
    const id = setInterval(poll, 30_000)
    return () => clearInterval(id)
  }, [center, date, noCenter])

  // Combina: has_inspection del slot (backend) + inspecciones directas por vehicle_id
  function buildInspMap(slotsArr, insps) {
    const map = {}
    // Desde inspecciones reales (fuente principal)
    for (const ins of insps) {
      if (!ins.vehicle_id) continue
      if (!map[ins.vehicle_id] || ins.created_at > map[ins.vehicle_id].created_at) {
        map[ins.vehicle_id] = ins
      }
    }
    // Desde el enriquecimiento del backend (fallback si getInspections falló)
    for (const slot of slotsArr) {
      if (slot.vehicle_id && slot.has_inspection && !map[slot.vehicle_id]) {
        map[slot.vehicle_id] = { severity: slot.inspection_severity || '' }
      }
    }
    return map
  }

  /* ── Ordenar: sin fotos arriba, con fotos abajo ── */
  const sortedIndexes = useMemo(() => {
    return slots
      .map((s, i) => ({ i, hasPhotos: !!(s.vehicle_id && inspMap[s.vehicle_id]) }))
      .sort((a, b) => {
        if (a.hasPhotos !== b.hasPhotos) return a.hasPhotos ? 1 : -1
        return 0
      })
      .map(x => x.i)
  }, [slots, inspMap])

  const usedV = useMemo(() => new Set(slots.map(s => s.vehicle_id).filter(Boolean)), [slots])
  const usedD = useMemo(() => new Set(slots.map(s => s.driver_id).filter(Boolean)), [slots])

  /* ── Acciones ── */
  async function copyYesterday() {
    try {
      const res = await getDailyAssignment(center, isoPrev(date))
      const doc = Array.isArray(res.data) ? res.data[0] : res.data
      const prev = Array.isArray(doc?.slots) ? doc.slots : []
      if (!prev.length) { setMsg({ ok: false, t: t('asgn.copy.empty') }); return }
      setSlots(prev)
      setMsg({ ok: true, t: t('asgn.copy.ok').replace('{n}', prev.length) })
    } catch { setMsg({ ok: false, t: t('asgn.copy.error') }) }
  }

  function applyRoster(matched) {
    setSlots(matched.map(m => ({
      vehicle_id: m.vehicle_id, vehicle_plate: m.vehicle_plate,
      driver_id: m.driver_id, driver_name: m.driver_name,
      rawName: m.rawName, _driverOk: m._driverOk, route: m.route,
    })))
  }

  function updateSlot(i, patch) { setSlots(arr => arr.map((s, k) => k === i ? { ...s, ...patch } : s)) }
  function deleteSlot(i) { setSlots(arr => arr.filter((_, k) => k !== i)) }
  function addSlot() { setSlots(s => [...s, { vehicle_id: '', vehicle_plate: '', driver_id: '', driver_name: '' }]) }

  async function save() {
    const clean = slots
      .filter(s => s.vehicle_id || s.driver_id)
      .map(({ vehicle_id, vehicle_plate, driver_id, driver_name }) => ({ vehicle_id, vehicle_plate, driver_id, driver_name }))
    setBusy(true); setMsg(null)
    try {
      await putDailyAssignment({ center, date, slots: clean })
      setSlots(clean)
      setMsg({ ok: true, t: t('asgn.save.ok').replace('{n}', clean.length) })
    } catch { setMsg({ ok: false, t: t('asgn.save.error') }) }
    finally { setBusy(false) }
  }

  /* ── Stats ── */
  const withVehicle = slots.filter(s => s.vehicle_id).length
  const withDriver  = slots.filter(s => s.driver_id).length
  const withPhotos  = slots.filter(s => s.vehicle_id && inspMap[s.vehicle_id]).length
  const pending     = withVehicle - withPhotos
  const issues      = slots.filter(s => !s.vehicle_id || !s.driver_id).length

  if (noCenter) return (
    <div>
      <h1 className="rise mb-6 font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">{t('asgn.daily')}</h1>
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <ClipboardList size={30} className="text-brand-400" />
        <p className="text-dark-200">{t('asgn.pick.center')}</p>
        <p className="text-sm text-dark-500">Disponibles: {centers?.join(' · ') || '—'}</p>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-4xl">
      {/* Toast overlay — fuera del flujo, encima de todo */}
      <Toasts toasts={toasts} />

      {pasteOpen && (
        <PasteModal
          drivers={drivers}
          vehicles={vehicles}
          onApply={applyRoster}
          onClose={() => setPasteOpen(false)}
        />
      )}

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="rise font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">{t('asgn.title')} <span className="text-dark-600">· {center}</span></h1>
          <p className="text-sm text-dark-400">{t('asgn.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 text-dark-500">
          <Calendar size={14} />
          <input type="date" className="input w-44 py-1.5" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>

      {/* Stats */}
      {!loading && slots.length > 0 && (
        <div className="mb-4 grid grid-cols-4 gap-3">
          {[
            { label: t('asgn.vans'),     value: withVehicle, color: 'text-brand-300' },
            { label: t('asgn.assigned'), value: withDriver,  color: 'text-brand-300' },
            { label: t('asgn.with.photos'), value: withPhotos, color: 'text-emerald-300' },
            { label: t('asgn.pending'),  value: pending,     color: pending > 0 ? 'text-amber-300' : 'text-dark-500' },
          ].map(s => (
            <div key={s.label} className="card p-3 text-center">
              <div className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
              <div className="text-xs text-dark-500">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setPasteOpen(true)} className="btn-primary flex items-center gap-1.5 text-sm">
          <ClipboardPaste size={14} /> {t('asgn.paste.roster')}
        </button>
        <button onClick={copyYesterday} className="btn-secondary flex items-center gap-1.5 text-sm">
          <Copy size={14} /> {t('asgn.copy.yesterday')}
        </button>
        <button onClick={addSlot} className="btn-secondary flex items-center gap-1.5 text-sm">
          <Plus size={14} /> {t('asgn.add.row')}
        </button>
        <button onClick={load} className="btn-ghost p-2 text-dark-400 hover:text-dark-200" title="Recargar">
          <RotateCcw size={14} />
        </button>
        <button
          onClick={save}
          disabled={busy || slots.length === 0}
          className="btn-primary ml-auto flex items-center gap-2 disabled:opacity-40"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {t('asgn.save')}
        </button>
      </div>

      {/* Message */}
      {msg && (
        <div className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
          {msg.t}
        </div>
      )}

      {/* Issues warning */}
      {!loading && issues > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-sm text-amber-300">
          <AlertTriangle size={14} className="shrink-0" />
          {issues} {t('asgn.incomplete.rows')} — {t('asgn.complete.before.save')}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-dark-400">
          <Loader2 className="animate-spin" size={16} /> {t('ui.loading')}
        </div>
      ) : slots.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-dark-800">
            <ClipboardList size={26} className="text-dark-500" />
          </div>
          <div>
            <div className="font-medium text-dark-200">{t('asgn.no.roster')}</div>
            <p className="mt-1 max-w-xs text-sm text-dark-500">
              {t('asgn.paste.hint')}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPasteOpen(true)} className="btn-primary flex items-center gap-1.5 text-sm">
              <ClipboardPaste size={14} /> {t('asgn.paste.roster')}
            </button>
            <button onClick={copyYesterday} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Copy size={14} /> {t('asgn.copy.yesterday')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-2 grid grid-cols-12 gap-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-dark-600">
            <div className="col-span-3 flex items-center gap-1"><Truck size={10} /> {t('asgn.col.van')}</div>
            <div className="col-span-6 flex items-center gap-1"><User size={10} /> {t('asgn.col.driver')}</div>
            <div className="col-span-3 flex items-center justify-end gap-1"><Camera size={10} /> {t('asgn.col.photos')}</div>
          </div>

          {/* Filas ordenadas: pendientes arriba, con fotos abajo */}
          <div className="flex flex-col gap-1.5">
            {sortedIndexes.map(i => (
              <SlotRow
                key={i}
                slot={slots[i]}
                vehicles={vehicles}
                drivers={drivers}
                usedV={usedV}
                usedD={usedD}
                center={center}
                onChange={patch => updateSlot(i, patch)}
                onDelete={() => deleteSlot(i)}
                inspection={slots[i].vehicle_id ? inspMap[slots[i].vehicle_id] : null}
              />
            ))}
          </div>

          <p className="mt-4 text-[11px] text-dark-600">
            {t('asgn.auto.refresh')}
          </p>
        </>
      )}

      {/* Animación para toasts */}
      <style>{`@keyframes slideIn { from { opacity: 0; transform: translateX(1rem); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </div>
  )
}
