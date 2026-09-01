import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { useT, LANG_LOCALE } from '../../i18n'
import { lista } from '../../lib/lista'
import { useEscape } from '../../lib/useEscape'
import { hoyLocal } from '../../lib/fecha'
import { PageSkeleton } from '../components/Skeleton'
import GuidedEmpty from '../components/GuidedEmpty'
import VidaVehiculo from '../components/VidaVehiculo'
import { ultimaRueda } from '../../lib/rueda'
import QRCode from 'qrcode'
import {
  Loader2, Search, Truck, X, Save, Download, QrCode,
  MapPin, Gauge, Calendar, Package, Shield, ChevronRight,
  User, Camera, ZoomIn, Pencil, Check, Maximize2, ArrowLeft,
  Fuel, Palette, Hash, Building2, Clock, AlertTriangle, Wrench,
  Droplets, CircleDot, Disc, FileText, Trash2, Upload, ExternalLink,
  FileCheck, FileBadge, FileImage, File, Plus, Box,
} from 'lucide-react'
import {
  getVehicles, getLastInspections, getVehicleDriver, getVehicleInspections, updateVehicle, deleteVehicle, createIncident, getIncidents,
  getVehicleMaintenance, registerOilChange, registerMaintenanceChange,
  getVehicleDocuments, uploadVehicleDocument, deleteVehicleDocument, createVehicle,
  getVehicleDamageLedger, repairVehicleLedger, getSpareWheels, getMaintenanceLog, borrarApunteMantenimiento,
  getAllDocuments,
  getExposicionVehiculos, getVehiculosDuplicados, fusionarVehiculos, getExpedienteVehiculo,
  getOdometroSospechosas, sanearOdometro, getDatosQueFaltan, rellenarDatosLote, getCheckerEstados, corregirEstados, getCheckerCentros, corregirCentros,
  fijarBolsas,
} from '../api'
import { getAdmin } from '../auth'

// El visor 3D (three.js ~400 kB) se carga solo al abrir la pestaña Gemelo 3D.
const Vehicle3DViewer = lazy(() => import('../twin3d/Vehicle3DViewer'))

const STATUS_MAP = {
  active: { label: 'Disponible',  labelKey: 'veh.available', dot: 'bg-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30' },
  taller: { label: 'En taller',   labelKey: 'veh.workshop',  dot: 'bg-orange-400',  badge: 'bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/30' },
  baja:   { label: 'Baja',        labelKey: 'veh.inactive',  dot: 'bg-slate-500',   badge: 'bg-slate-700/60 text-slate-400 ring-1 ring-slate-600/40' },
}

// Etiquetas de lo que se le hace a una furgoneta, para el historial.
const MAINT_LABEL = {
  oil: 'Aceite', ruedas: 'Ruedas', pastillas: 'Pastillas',
  itv: 'ITV', renting: 'Renting', taller: 'Taller', otro: 'Otro',
}

const EJE_LABEL = { delante: 'Delanteras', detras: 'Traseras' }

const daysTo = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null

function itvBadge(itv) {
  const d = daysTo(itv)
  if (d == null) return <span className="text-dark-600">—</span>
  if (d < 0)   return <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400 ring-1 ring-red-500/20">ITV vencida</span>
  if (d <= 30) return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/20">ITV en {d}d</span>
  return <span className="text-[11px] text-dark-500">{itv}</span>
}

function lastInspDot(date) {
  if (!date) return { cls: 'bg-dark-600', txt: 'Nunca inspeccionada' }
  const d = Math.floor((new Date() - new Date(date)) / 86400000)
  if (d <= 7)  return { cls: 'bg-emerald-400', txt: `Insp. hace ${d}d` }
  if (d <= 30) return { cls: 'bg-amber-400',   txt: `Insp. hace ${d}d` }
  return { cls: 'bg-red-400', txt: `Insp. hace ${d}d` }
}

/* ── QR Lightbox ── */
function QrLightbox({ dataUrl, label, onClose }) {
  useEffect(() => {
    const fn = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col items-center gap-6 rounded-3xl bg-dark-900 p-8 shadow-2xl ring-1 ring-white/10"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-dark-400 hover:bg-dark-800 hover:text-white transition">
          <X size={16} />
        </button>
        <div className="rounded-2xl bg-white p-4 shadow-xl">
          <img src={dataUrl} alt="QR" className="h-64 w-64" />
        </div>
        <div className="text-center">
          <div className="font-mono text-base font-bold tracking-widest text-dark-50">{label}</div>
          <div className="mt-1 text-xs text-dark-500">Escanea con cualquier lector QR</div>
        </div>
        <a
          href={dataUrl}
          download={`QR_${label}.png`}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 px-5 py-2 text-sm font-semibold text-white shadow hover:brightness-110 transition"
        >
          <Download size={14} /> Descargar QR
        </a>
      </div>
    </div>
  )
}

/* ── Inline editable field ── */
function EditableField({ label, value, onSave, type = 'text', icon, mono, children }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const inputRef = useRef()

  function start() { setDraft(value || ''); setEditing(true); setTimeout(() => inputRef.current?.focus(), 0) }
  function confirm() { onSave(draft); setEditing(false) }
  function cancel() { setEditing(false); setDraft(value || '') }

  useEffect(() => {
    if (!editing) return
    function fn(e) { if (e.key === 'Escape') cancel() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [editing])

  return (
    <div className="group relative flex items-start gap-2.5 rounded-xl px-3 py-2.5 transition hover:bg-dark-800/50">
      {icon && <span className="mt-0.5 shrink-0 text-dark-500">{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-dark-600">{label}</div>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type={type}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirm()}
              className="min-w-0 flex-1 rounded-lg border border-brand-500/50 bg-dark-700 px-2.5 py-1.5 text-sm text-dark-50 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
            />
            <button onClick={confirm} className="rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 p-1.5 text-white hover:brightness-110 transition"><Check size={12} /></button>
            <button onClick={cancel}  className="rounded-lg bg-dark-700 p-1.5 text-dark-200 hover:text-dark-100 transition"><X size={12} /></button>
          </div>
        ) : (
          <div className={`text-sm font-medium text-dark-100 ${mono ? 'font-mono tracking-wider' : ''}`}>
            {children || value || <span className="text-dark-600">—</span>}
          </div>
        )}
      </div>
      {onSave && !editing && (
        <button
          onClick={start}
          className="mt-0.5 shrink-0 rounded-lg p-1 text-dark-600 opacity-0 transition hover:bg-dark-700 hover:text-brand-400 group-hover:opacity-100"
          title={`Editar ${label}`}
        >
          <Pencil size={11} />
        </button>
      )}
    </div>
  )
}

function ReadField({ label, icon, children }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl px-3 py-2.5">
      {icon && <span className="mt-0.5 shrink-0 text-dark-500">{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-dark-600">{label}</div>
        <div className="text-sm font-medium text-dark-100">{children || <span className="text-dark-600">—</span>}</div>
      </div>
    </div>
  )
}

/* ── Taller modal ── */
const TALLER_SEV = [
  { value: 'leve',     label: 'Leve',     cls: 'text-yellow-400' },
  { value: 'moderado', label: 'Moderado', cls: 'text-amber-400' },
  { value: 'grave',    label: 'Grave',    cls: 'text-orange-400' },
  { value: 'critico',  label: 'Crítico',  cls: 'text-red-400' },
]

function TallerModal({ vehicle, onConfirm, onCancel }) {
  const [form, setForm] = useState({ title: `Vehículo en taller — ${vehicle.license_plate || ''}`, description: '', severity: 'leve', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  useEscape(onCancel)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const valid = form.description.trim().length >= 3

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onCancel}>
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-dark-700 bg-dark-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <button onClick={onCancel} className="absolute right-4 top-4 rounded-lg p-1.5 text-dark-300 hover:bg-dark-800 hover:text-white transition"><X size={15} /></button>

        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15">
            <Wrench size={18} className="text-orange-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-dark-50">Enviar a taller</div>
            <div className="text-xs text-dark-500">{vehicle.license_plate} · Rellena la incidencia</div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-600">Título</label>
            <input className="input w-full text-sm" value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-600">Motivo <span className="text-red-400">*</span></label>
            <textarea
              className="input w-full resize-none text-sm leading-relaxed"
              rows={3}
              placeholder="Describe el problema o motivo de la entrada en taller…"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-600">Severidad</label>
            <div className="flex gap-2">
              {TALLER_SEV.map(s => (
                <button
                  key={s.value}
                  onClick={() => set('severity', s.value)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition ${form.severity === s.value ? `border-current bg-dark-800 ${s.cls}` : 'border-dark-700 text-dark-500 hover:border-dark-600'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-600">Notas adicionales</label>
            <input className="input w-full text-sm" placeholder="Opcional…" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-dark-700 py-2.5 text-sm text-dark-400 hover:border-dark-600 hover:text-dark-200 transition">Cancelar</button>
          <button
            onClick={() => { if (!valid || submitting) return; setSubmitting(true); onConfirm(form) }}
            disabled={!valid || submitting}
            className="flex-1 rounded-xl bg-orange-700 py-2.5 text-sm font-bold text-white transition hover:bg-orange-700 disabled:opacity-40"
          >
            {submitting ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'Confirmar y registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const MAINT_META = {
  oil:       { label: 'Aceite',             defaultInterval: 15000, defaultWarn: 2500 },
  ruedas:    { label: 'Ruedas',             defaultInterval: 40000, defaultWarn: 3000 },
  pastillas: { label: 'Pastillas de freno', defaultInterval: 30000, defaultWarn: 3000 },
}

function MaintModal({ kind, currentKm, onSave, onClose }) {
  const meta = MAINT_META[kind] || {}
  useEscape(onClose)
  const [km, setKm] = useState(String(currentKm || ''))
  const [date, setDate] = useState(hoyLocal())
  const [intervalKm, setIntervalKm] = useState(String(meta.defaultInterval || 15000))
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    await onSave({ km: Number(km), date, interval_km: Number(intervalKm) })
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-4 w-full max-w-sm rounded-2xl border border-dark-700 bg-dark-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-dark-300 hover:bg-dark-800 hover:text-white transition"><X size={15} /></button>
        <h2 className="mb-4 text-sm font-bold text-dark-50">Registrar: {meta.label}</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-dark-600">Km actuales</label>
            <input className="input w-full text-sm" type="number" placeholder="Ej: 45000" value={km} onChange={e => setKm(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-dark-600">Fecha del cambio</label>
            <input className="input w-full text-sm" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-dark-600">Intervalo (km)</label>
            <input className="input w-full text-sm" type="number" value={intervalKm} onChange={e => setIntervalKm(e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-dark-700 py-2.5 text-sm text-dark-400 hover:border-dark-600 transition">Cancelar</button>
          <button onClick={submit} disabled={!km || busy} className="flex-1 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-40">
            {busy ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Índice de salud 0-100: SIN caja negra ─────────────────────────────────
   Cada punto restado sale de un hecho registrado y se lista con su motivo.
   Un jefe de flota debe poder auditar el número de un vistazo. */
function computeHealth({ vehicle, insps, incidents, maintenance, ledger, t }) {
  const factors = []
  const add = (pts, label) => factors.push({ pts, label })
  const dmgPts = { leve: 5, moderado: 10, grave: 18, critico: 25 }
  for (const e of (ledger?.open || [])) {
    add(dmgPts[e.severity] ?? 8, `${t('vh.f.damage')}: ${e.part || e.panel}${e.severity ? ` (${e.severity})` : ''}`)
  }
  const incPts = { leve: 5, moderado: 8, grave: 12, critico: 18 }
  for (const inc of (incidents || []).filter(i => i.status === 'open')) {
    add(incPts[inc.severity] ?? 8, `${t('vh.f.incident')}: ${(inc.title || inc.description || '').slice(0, 42)}`)
  }
  const d = daysTo(vehicle.itv_date)
  if (d != null && d < 0) add(20, t('vh.f.itv.exp'))
  else if (d != null && d <= 30) add(8, t('vh.f.itv.soon').replace('{n}', d))
  for (const k of Object.keys(MAINT_META)) {
    const m = maintenance?.[k]
    if (m?.overdue) add(10, `${t('vh.f.maint')}: ${MAINT_META[k].label}`)
    else if (m?.warning) add(4, `${t('vh.f.maint.soon')}: ${MAINT_META[k].label}`)
  }
  if (Array.isArray(insps)) {
    if (insps.length === 0) add(15, t('vh.f.insp.never'))
    else {
      const days = Math.floor((Date.now() - new Date(insps[0].created_at)) / 864e5)
      if (days > 30) add(10, t('vh.f.insp.old').replace('{n}', days))
    }
  }
  const score = Math.max(0, 100 - factors.reduce((a, f) => a + f.pts, 0))
  return { score, factors }
}

/* ── Vehicle detail panel ── */
function VehicleDetail({ vehicle: initVehicle, onClose, onSaved }) {
  const { t, lang } = useT()
  const [vehicle, setVehicle] = useState(initVehicle)
  const [driver, setDriver] = useState(undefined)
  const [insps, setInsps] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [tallerModal, setTallerModal] = useState(null) // holds target status while modal open
  const [vehicleIncidents, setVehicleIncidents] = useState(null)
  const [maintenance, setMaintenance] = useState(null)
  const [maintLog, setMaintLog] = useState(null)     // qué se le ha hecho ya
  const [maintModal, setMaintModal] = useState(null) // 'oil' | 'ruedas' | 'pastillas' | null
  const [bolsasOpen, setBolsasOpen] = useState(false)
  const [docs, setDocs] = useState(null)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const docInputRef = useRef()
  const [pendingDocType, setPendingDocType] = useState(null)
  const [activeTab, setActiveTab] = useState('info') // 'info' | 'gemelo' | 'inspecciones' | 'docs'
  const [ledger, setLedger] = useState(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)

  const vinOrPlate = vehicle.vin || vehicle.license_plate || ''
  const st = STATUS_MAP[vehicle.status] || STATUS_MAP.baja

  // Salud: solo se calcula con TODOS los datos cargados (nunca un número a medias)
  const healthReady = Array.isArray(insps) && vehicleIncidents !== null && ledger !== null
  const health = healthReady ? computeHealth({ vehicle, insps, incidents: vehicleIncidents, maintenance, ledger, t }) : null
  const healthCls = (s) => (s >= 85 ? 'text-emerald-400' : s >= 60 ? 'text-amber-300' : 'text-red-400')

  useEffect(() => {
    let cancelled = false
    setDriver(undefined); setInsps(null); setVehicleIncidents(null)
    getVehicleDriver(vehicle.id).then(r => { if (!cancelled) setDriver(r.data?.driver || null) }).catch(() => { if (!cancelled) setDriver(null) })
    getVehicleInspections(vehicle.id).then(r => { if (!cancelled) setInsps(lista(r.data)) }).catch(() => { if (!cancelled) setInsps([]) })
    getIncidents({ vehicle_id: vehicle.id }).then(r => { if (!cancelled) setVehicleIncidents(Array.isArray(r.data) ? r.data : []) }).catch(() => { if (!cancelled) setVehicleIncidents([]) })
    getVehicleMaintenance(vehicle.id).then(r => { if (!cancelled) setMaintenance(r.data || null) }).catch(() => { if (!cancelled) setMaintenance(null) })
    // Lo que se le ha HECHO, no lo que le toca: la ficha guardaba solo el km
    // del último cambio de cada cosa, que al siguiente cambio se pisa y borra
    // el anterior. Esto es el registro que queda.
    getMaintenanceLog(vehicle.id).then(r => { if (!cancelled) setMaintLog(lista(r.data?.rows)) }).catch(() => { if (!cancelled) setMaintLog([]) })
    getVehicleDocuments(vehicle.id).then(r => { if (!cancelled) setDocs(Array.isArray(r.data) ? r.data : []) }).catch(() => { if (!cancelled) setDocs([]) })
    // Ledger desde el arranque: el índice de salud y el historial lo necesitan.
    // Si falla (demo/red), vacío = sin daños registrados; no bloquear la salud.
    setLedger(null)
    getVehicleDamageLedger(vehicle.id)
      .then(r => { if (!cancelled) setLedger(r.data || { open: [], repaired: [] }) })
      .catch(() => { if (!cancelled) setLedger({ open: [], repaired: [] }) })
    return () => { cancelled = true }
  }, [vehicle.id])

  // Ledger del gemelo 3D: se carga la primera vez que se abre la pestaña.
  useEffect(() => {
    if (activeTab !== 'gemelo' || ledger || ledgerLoading) return
    let cancelled = false
    setLedgerLoading(true)
    getVehicleDamageLedger(vehicle.id)
      .then(r => { if (!cancelled) setLedger(r.data || { open: [], repaired: [] }) })
      .catch(() => { if (!cancelled) setLedger({ open: [], repaired: [] }) })
      .finally(() => { if (!cancelled) setLedgerLoading(false) })
    return () => { cancelled = true }
  }, [activeTab, vehicle.id, ledger, ledgerLoading])

  // Reparaciones del registro de daños: un panel o "salió de chapa" (todo).
  const [repairing, setRepairing] = useState(false)
  async function repairLedger(body) {
    setRepairing(true)
    try { await repairVehicleLedger(vehicle.id, body); setLedger(null) } // null → recarga
    catch { /* red */ }
    setRepairing(false)
  }
  function repairAll() {
    if (!window.confirm(`¿Marcar TODOS los daños de ${vehicle.license_plate || 'este vehículo'} como reparados?\n\nÚsalo cuando vuelve del taller de chapa como nuevo. Un golpe futuro contará como daño NUEVO.`)) return
    repairLedger({ all: true, note: 'chapa completa' })
  }

  useEffect(() => {
    if (!vinOrPlate) return
    QRCode.toDataURL(vinOrPlate, {
      width: 400, margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    }).then(setQrDataUrl).catch(() => {})
  }, [vinOrPlate])

  // El temporizador se guarda para limpiarlo al desmontar y para que dos
  // avisos seguidos no se pisen el cierre el uno al otro.
  const toastTimer = useRef(null)
  useEffect(() => () => clearTimeout(toastTimer.current), [])
  function showToast(msg, ok = true) {
    setToast({ msg, ok })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  async function patch(fields) {
    setBusy(true)
    try {
      await updateVehicle(vehicle.id, fields)
      setVehicle(v => ({ ...v, ...fields }))
      showToast('Guardado correctamente')
      onSaved?.()
    } catch { showToast('No se pudo guardar', false) }
    finally { setBusy(false) }
  }

  async function handleDocUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !pendingDocType) return
    setUploadingDoc(true)
    try {
      const fd = new FormData()
      fd.append('doc_type', pendingDocType)
      fd.append('file', file)
      await uploadVehicleDocument(vehicle.id, fd)
      const r = await getVehicleDocuments(vehicle.id)
      setDocs(Array.isArray(r.data) ? r.data : [])
      showToast('Documento subido correctamente')
    } catch { showToast('No se pudo subir el documento', false) }
    finally { setUploadingDoc(false); setPendingDocType(null) }
  }

  async function handleDocDelete(docId) {
    try {
      await deleteVehicleDocument(vehicle.id, docId)
      setDocs(d => d.filter(x => x.id !== docId))
      showToast('Documento eliminado')
    } catch { showToast('No se pudo eliminar', false) }
  }

  function triggerUpload(docType) {
    setPendingDocType(docType)
    setTimeout(() => docInputRef.current?.click(), 0)
  }

  // Intercept status → taller: open modal first
  function handleStatusChange(newStatus) {
    if (newStatus === 'taller' && vehicle.status !== 'taller') {
      setTallerModal(newStatus)
    } else {
      patch({ status: newStatus })
    }
  }

  async function confirmTaller(incForm) {
    setTallerModal(null)
    setBusy(true)
    try {
      await updateVehicle(vehicle.id, { status: 'taller' })
      await createIncident({ vehicle_id: vehicle.id, ...incForm })
      setVehicle(v => ({ ...v, status: 'taller' }))
      showToast('Vehículo en taller · incidencia creada')
      onSaved?.()
    } catch { showToast('Error al guardar', false) }
    finally { setBusy(false) }
  }

  /* Parte de disputa 1-clic: documento formal imprimible (Ctrl+P → PDF) con
     identidad del vehículo, cronología con marca de tiempo y evidencia
     antes/después de cada daño nuevo. Para enviar al renting tal cual. */
  function buildDisputeDoc(evs) {
    const admin = getAdmin()
    const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
    const fmtAt = (at) => esc(String(at).slice(0, 16).replace('T', ' '))
    const rows = evs.map((e) => `<tr><td class="dt">${fmtAt(e.at)}</td><td>${esc(e.txt)}</td></tr>`).join('')

    // Evidencia: hasta 3 inspecciones con daño nuevo, cada una con su "antes"
    const withNew = (insps || []).filter((i) => (i.analysis?.new_damages || []).length > 0).slice(0, 3)
    const evidence = withNew.map((i) => {
      const idx = insps.indexOf(i)
      const prev = insps[idx + 1] // la siguiente en la lista es la anterior en el tiempo
      const cur = i.annotated_photos?.[0] || i.photos?.[0]
      const before = prev?.photos?.[0]
      if (!cur) return ''
      return `<div class="ev">
        <div class="ev-h">Daño nuevo detectado el ${fmtAt(i.created_at)}${i.driver_name ? ` · Conductor: ${esc(i.driver_name)}` : ''}</div>
        <div class="ev-imgs">
          ${before ? `<figure><img src="${esc(before)}"><figcaption>Estado anterior — ${fmtAt(prev.created_at)}${prev.driver_name ? ` (${esc(prev.driver_name)})` : ''}</figcaption></figure>` : ''}
          <figure><img src="${esc(cur)}"><figcaption>Daño documentado — ${fmtAt(i.created_at)}</figcaption></figure>
        </div>
      </div>`
    }).join('')

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Parte de disputa — ${esc(vehicle.license_plate)}</title>
<style>
  body { font: 13px/1.5 -apple-system, 'Segoe UI', sans-serif; color: #111; margin: 40px auto; max-width: 760px; }
  h1 { font-size: 19px; margin: 0; letter-spacing: -0.01em; }
  .sub { color: #666; font-size: 11px; margin-top: 2px; }
  .plate { font-family: ui-monospace, monospace; font-size: 30px; font-weight: 800; letter-spacing: 3px; margin: 18px 0 2px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 18px; margin: 14px 0 4px; font-size: 12px; }
  .meta b { display: block; color: #888; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1.5px solid #111; padding-bottom: 4px; margin: 26px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 4.5px 8px 4.5px 0; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  td.dt { white-space: nowrap; font-family: ui-monospace, monospace; font-size: 11px; color: #555; width: 118px; }
  .ev { margin: 14px 0; page-break-inside: avoid; }
  .ev-h { font-weight: 600; font-size: 12px; margin-bottom: 6px; }
  .ev-imgs { display: flex; gap: 10px; }
  figure { margin: 0; flex: 1; }
  img { width: 100%; border: 1px solid #ddd; border-radius: 4px; }
  figcaption { font-size: 10px; color: #666; margin-top: 3px; }
  .foot { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 10px; color: #888; }
  @media print { body { margin: 10mm; } }
</style></head><body>
  <h1>Parte de disputa — Historial del vehículo</h1>
  <div class="sub">Generado por FlotaDSP · ${esc(new Date().toLocaleString('es-ES'))}${admin?.name ? ` · ${esc(admin.name)}` : ''}</div>
  <div class="plate">${esc(vehicle.license_plate || '—')}</div>
  <div class="sub">${esc([vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' '))}</div>
  <div class="meta">
    <div><b>VIN / Bastidor</b>${esc(vehicle.vin || '—')}</div>
    <div><b>Proveedor renting</b>${esc(vehicle.provider || '—')}</div>
    <div><b>Centro</b>${esc(vehicle.center || '—')}</div>
    <div><b>Kilómetros</b>${vehicle.mileage != null ? esc(vehicle.mileage.toLocaleString('es')) + ' km' : '—'}</div>
    <div><b>ITV</b>${esc(vehicle.itv_date || '—')}</div>
    <div><b>Fin renting</b>${esc(vehicle.renting_end_date || '—')}</div>
  </div>
  <h2>Cronología registrada</h2>
  <table>${rows}</table>
  ${evidence ? `<h2>Evidencia fotográfica</h2>${evidence}` : ''}
  <div class="foot">Documento generado automáticamente a partir de registros con marca de tiempo de FlotaDSP
  (inspecciones fotográficas, incidencias y reparaciones). Las inspecciones individuales disponen además de
  informe forense firmado descargable desde la plataforma.</div>
  <script>window.onload = () => setTimeout(() => window.print(), 400)</script>
</body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }

  function downloadCard() {
    const canvas = document.createElement('canvas')
    canvas.width = 680; canvas.height = 380
    const ctx = canvas.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, 680, 380)
    g.addColorStop(0, '#0b1120'); g.addColorStop(1, '#131e33')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 680, 380)

    // Borde azul izquierdo
    const gv = ctx.createLinearGradient(0, 0, 0, 380)
    gv.addColorStop(0, '#3b82f6'); gv.addColorStop(1, '#6366f1')
    ctx.fillStyle = gv; ctx.fillRect(0, 0, 5, 380)

    // Logo
    ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#3b82f6'
    ctx.fillText('FlotaDSP', 24, 30)
    ctx.font = '11px system-ui'; ctx.fillStyle = '#334155'
    ctx.fillText('Sistema de gestión de flotas', 24, 46)

    // Matrícula
    ctx.font = 'bold 44px monospace'; ctx.fillStyle = '#f1f5f9'
    ctx.fillText(vehicle.license_plate || '—', 24, 100)

    // Marca/modelo
    ctx.font = '500 16px system-ui'; ctx.fillStyle = '#64748b'
    ctx.fillText(`${vehicle.brand || ''} ${vehicle.model || ''}`.trim() || '—', 24, 124)

    // Línea
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(24, 144); ctx.lineTo(400, 144); ctx.stroke()

    // Campos
    const fields = [
      ['CENTRO', vehicle.center], ['VIN', vehicle.vin],
      ['PROVEEDOR', vehicle.provider], ['ESTADO', t(st.labelKey)],
      ['COMBUSTIBLE', vehicle.fuel_type], ['COLOR', vehicle.color],
    ]
    fields.forEach(([lbl, val], i) => {
      const col = i % 2, row = Math.floor(i / 2)
      const x = 24 + col * 200, y = 164 + row * 52
      ctx.font = '10px system-ui'; ctx.fillStyle = '#334155'
      ctx.fillText(lbl, x, y)
      ctx.font = '500 14px system-ui'; ctx.fillStyle = '#cbd5e1'
      ctx.fillText(val || '—', x, y + 18)
    })

    // Footer
    ctx.font = '10px system-ui'; ctx.fillStyle = '#1e293b'
    ctx.fillText(`Generado por FlotaDSP · ${new Date().toLocaleDateString('es')}`, 24, 360)

    const finalize = (c) => {
      const a = document.createElement('a')
      a.href = c.toDataURL('image/png')
      a.download = `Tarjeta_${vehicle.license_plate || vehicle.id}.png`
      a.click()
    }

    if (qrDataUrl) {
      const img = new Image(); img.onload = () => {
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        const [rx, ry, rs] = [500, 80, 176]
        ctx.roundRect(rx, ry, rs, rs, 14)
        ctx.fill()
        ctx.drawImage(img, rx + 8, ry + 8, rs - 16, rs - 16)
        ctx.font = 'bold 10px monospace'; ctx.fillStyle = '#475569'; ctx.textAlign = 'center'
        ctx.fillText(vinOrPlate.slice(0, 20), rx + rs / 2, ry + rs + 16)
        finalize(canvas)
      }
      img.src = qrDataUrl
    } else { finalize(canvas) }
  }

  return (
    <>
      {qrOpen && qrDataUrl && <QrLightbox dataUrl={qrDataUrl} label={vinOrPlate} onClose={() => setQrOpen(false)} />}
      {tallerModal && <TallerModal vehicle={vehicle} onConfirm={confirmTaller} onCancel={() => setTallerModal(null)} />}
      {bolsasOpen && (
        <BolsasModal vehicle={vehicle} onClose={() => setBolsasOpen(false)}
          onGuardar={async (n) => {
            await fijarBolsas(vehicle.id, n)
            // Se refleja en la ficha sin recargar: el chip es lo unico que
            // cambia y volver a pedir la furgoneta entera para eso sobra.
            setVehicle((v) => ({ ...v, bags_remaining: n }))
            setToast({ ok: true, t: `Bolsas de ${vehicle.license_plate}: ${n}` })
          }} />
      )}
      {maintModal && (
        <MaintModal
          kind={maintModal}
          currentKm={vehicle.mileage}
          onSave={async (body) => {
            try {
              if (maintModal === 'oil') await registerOilChange(vehicle.id, body)
              else await registerMaintenanceChange(vehicle.id, maintModal, body)
              const r = await getVehicleMaintenance(vehicle.id)
              setMaintenance(r.data || null)
              showToast('Mantenimiento registrado')
            } catch { showToast('No se pudo guardar', false) }
            setMaintModal(null)
          }}
          onClose={() => setMaintModal(null)}
        />
      )}

      <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
        <div
          className="relative flex h-full w-full max-w-lg flex-col overflow-hidden bg-dark-950 shadow-2xl ring-1 ring-white/[0.06]"
          onClick={e => e.stopPropagation()}
        >
          {/* Toast */}
          {toast && (
            <div className={`absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-xl transition ${toast.ok ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30' : 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'}`}>
              {toast.msg}
            </div>
          )}

          {/* ── HEADER HERO ── */}
          <div className="relative overflow-hidden bg-dark-900 px-6 pb-6 pt-5">
            {/* Luz cálida de fondo: profundidad sin sombras teatrales */}
            <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-brand-500/[0.07] blur-2xl" />
            <div className="pointer-events-none absolute -bottom-4 left-24 h-24 w-24 rounded-full bg-brand-400/[0.05] blur-xl" />

            <div className="relative flex items-start justify-between">
              <div className="flex-1">
                <div className="mb-3 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${st.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                    {t(st.labelKey)}
                  </span>
                  {itvBadge(vehicle.itv_date)}
                </div>
                <h2 className="font-mono text-3xl font-black tracking-[0.12em] text-dark-50 drop-shadow">
                  {vehicle.license_plate || '—'}
                </h2>
                <div className="mt-1 text-sm text-slate-400">
                  {[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Sin modelo'}
                  {vehicle.year && <span className="ml-1 text-slate-500">· {vehicle.year}</span>}
                </div>
              </div>

              {/* QR widget */}
              <div className="ml-4 flex flex-col items-center gap-1.5">
                <button
                  onClick={() => setQrOpen(true)}
                  className="group relative flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-xl bg-white p-1.5 shadow-lg ring-2 ring-white/20 transition hover:ring-brand-400/60"
                  title="Ampliar QR"
                >
                  {qrDataUrl
                    ? <img src={qrDataUrl} alt="QR" className="h-full w-full" />
                    : <Loader2 size={16} className="animate-spin text-slate-400" />
                  }
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
                    <Maximize2 size={14} className="text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
                  </div>
                </button>
                <span className="text-[9px] text-slate-600">Ver QR</span>
              </div>

              <button onClick={onClose} className="ml-2 rounded-xl p-2 text-slate-500 hover:bg-white/5 hover:text-white transition">
                <X size={16} />
              </button>
            </div>

            {/* Stats rápidos */}
            <div className="mt-4 grid grid-cols-4 gap-2">
              <StatChip icon={<Shield size={12} />} val={health ? <span className={healthCls(health.score)}>{health.score}</span> : '…'} label={t('vh.health.short')} />
              <StatChip icon={<Gauge size={12} />} val={vehicle.mileage != null ? `${vehicle.mileage.toLocaleString('es')} km` : '—'} label="Kilómetros" />
              <StatChip icon={<Package size={12} />} val={vehicle.bags_remaining ?? '—'} label="Bolsas"
                titulo="Poner cuántas bolsas quedan" onClick={() => setBolsasOpen(true)} />
              <StatChip icon={<Camera size={12} />} val={insps ? insps.length : '…'} label="Inspecciones" />
            </div>
          </div>

          {/* ── TABS ── */}
          <div className="flex shrink-0 border-b border-white/5">
            {[
              { id: 'info',         label: 'Info',          count: null },
              { id: 'gemelo',       label: 'Gemelo 3D',     count: null },
              { id: 'inspecciones', label: 'Inspecciones',  count: insps?.length ?? null },
              { id: 'expediente',  label: 'Expediente',    count: null },
              { id: 'historial',    label: t('vh.tab.history'), count: null },
              { id: 'docs',         label: 'Documentos',    count: docs?.length ?? null },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition border-b-2 ${
                  activeTab === tab.id
                    ? 'border-brand-500 text-brand-400'
                    : 'border-transparent text-dark-500 hover:text-dark-300'
                }`}
              >
                {tab.label}
                {tab.count != null && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === tab.id ? 'bg-brand-500/20 text-brand-200' : 'bg-dark-800 text-dark-300'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── CONTENIDO SCROLLABLE ── */}
          <div className="flex-1 overflow-y-auto">

            {/* ══ TAB: INFO ══ */}
            {activeTab === 'info' && <>

            {/* Sección: Salud del vehículo — índice AUDITABLE, cada resta con motivo */}
            <Section title={t('vh.health')} icon={<Shield size={13} />}>
              <div className="px-3 pb-4 pt-1">
                {!health ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-dark-500">
                    <Loader2 size={12} className="animate-spin" /> …
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline gap-3 px-3">
                      <span className={`font-display text-[44px] font-semibold leading-none tracking-tight ${healthCls(health.score)}`}>{health.score}</span>
                      <span className="text-sm text-dark-500">/ 100</span>
                    </div>
                    <div className="mx-3 mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${health.score >= 85 ? 'bg-emerald-400/80' : health.score >= 60 ? 'bg-amber-400/80' : 'bg-red-400/80'}`}
                        style={{ width: `${health.score}%` }}
                      />
                    </div>
                    <div className="mt-3 space-y-1 px-3">
                      {health.factors.length === 0 ? (
                        <p className="text-[12.5px] text-emerald-400/90">✓ {t('vh.health.ok')}</p>
                      ) : health.factors.map((f, i) => (
                        <div key={i} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                          <span className="min-w-0 truncate text-dark-300">{f.label}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-red-300">−{f.pts}</span>
                        </div>
                      ))}
                    </div>
                    {health.factors.length > 0 && (
                      <p className="mt-2 px-3 text-[11px] leading-relaxed text-dark-600">{t('vh.health.hint')}</p>
                    )}
                  </>
                )}
              </div>
            </Section>

            {/* ══ RUEDA DE REPUESTO ══
                Sale del JSON de notes de las auditorías que ya están cargadas:
                ni endpoint ni llamada extra. Se enseña como testimonio (quién
                y cuándo), nunca como inventario, y "nunca se preguntó" tiene
                su propio estado para no confundirse con "no la lleva". */}
            {insps !== null && (() => {
              const r = ultimaRueda(insps)
              const tono = !r ? { c: 'text-dark-500', b: 'border-dark-700/50' }
                : r.estado === 'no' ? { c: 'text-red-300', b: 'border-red-500/25 bg-red-500/[0.04]' }
                : r.estado === 'si' ? { c: 'text-emerald-300', b: 'border-emerald-500/20' }
                : { c: 'text-amber-300', b: 'border-amber-500/20' }
              const fecha = r?.at ? new Date(r.at).toLocaleDateString(LANG_LOCALE[lang] || 'es-ES') : ''
              const quien = r?.driver_name
                ? t('vh.rueda.quien').replace('{n}', r.driver_name).replace('{d}', fecha)
                : t('vh.rueda.anon').replace('{d}', fecha)
              return (
                <div className={`mx-3 mb-3 rounded-xl border px-3.5 py-3 ${tono.b}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-dark-600">
                      🛞 {t('vh.rueda.t')}
                    </span>
                    <span className={`text-[13px] font-semibold ${tono.c}`}>
                      {t(r ? `vh.rueda.${r.estado}` : 'vh.rueda.nunca')}
                    </span>
                  </div>
                  {r && (
                    <>
                      <p className="mt-1 text-[11.5px] text-dark-500">
                        {quien}{r.foto ? ' · 📷' : ''}
                      </p>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-dark-600">{t('vh.rueda.foot')}</p>
                    </>
                  )}
                </div>
              )
            })()}

            {/* Sección: Datos del vehículo */}
            <Section title={t('veh.title')} icon={<Truck size={13} />}>
              <div className="grid grid-cols-2 gap-0">
                {/* Status — dropdown personalizado */}
                <div className="group relative flex items-start gap-2.5 rounded-xl px-3 py-2.5 transition hover:bg-dark-800/50">
                  <span className={`mt-2.5 h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-dark-600">Estado</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(STATUS_MAP).map(([key, m]) => (
                        <button
                          key={key}
                          disabled={busy}
                          onClick={() => vehicle.status !== key && handleStatusChange(key)}
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition ${vehicle.status === key ? m.badge + ' cursor-default' : 'bg-dark-700 text-dark-200 hover:bg-dark-600 hover:text-dark-200'}`}
                        >
                          {t(m.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <EditableField label="Matrícula" icon={<Hash size={13} />}
                  value={vehicle.license_plate} mono
                  onSave={v => {
                    const p = v.trim().toUpperCase()
                    if (!p) { showToast('La matrícula no puede quedar vacía', false); return }
                    patch({ license_plate: p })
                  }}
                />
                <EditableField label="Kilómetros" icon={<Gauge size={13} />}
                  value={String(vehicle.mileage ?? '')} type="number"
                  onSave={v => patch({ mileage: Number(v) })}
                />
                <EditableField label="Centro" icon={<MapPin size={13} />}
                  value={vehicle.center}
                  onSave={v => patch({ center: v })}
                />
                <EditableField label="Color" icon={<Palette size={13} />}
                  value={vehicle.color}
                  onSave={v => patch({ color: v })}
                />
                <EditableField label="Combustible" icon={<Fuel size={13} />}
                  value={vehicle.fuel_type}
                  onSave={v => patch({ fuel_type: v })}
                />
                <EditableField label="Tipo" icon={<Truck size={13} />}
                  value={vehicle.vehicle_type}
                  onSave={v => patch({ vehicle_type: v })}
                />
                <EditableField label="ITV (caducidad)" icon={<Calendar size={13} />}
                  value={vehicle.itv_date} type="date"
                  onSave={v => patch({ itv_date: v })}
                />
                <EditableField label="Fin renting" icon={<Clock size={13} />}
                  value={vehicle.renting_end_date} type="date"
                  onSave={v => patch({ renting_end_date: v })}
                />
                <div className="col-span-2">
                  <EditableField label="VIN / Bastidor" icon={<Hash size={13} />}
                    value={vehicle.vin} mono
                    onSave={v => patch({ vin: v.trim().toUpperCase() })}
                  />
                </div>
                <div className="col-span-2">
                  <EditableField label="Proveedor" icon={<Building2 size={13} />}
                    value={vehicle.provider}
                    onSave={v => patch({ provider: v.trim() })}
                  />
                </div>
              </div>
            </Section>

            {/* Sección: QR descargable */}
            <Section title="Identificación QR" icon={<QrCode size={13} />}>
              <div className="px-3 pb-3">
                <div className="flex items-center gap-4 rounded-2xl border border-dark-700/60 bg-dark-800/40 p-4">
                  <button onClick={() => setQrOpen(true)} className="group relative shrink-0">
                    <div className="h-20 w-20 overflow-hidden rounded-xl bg-white p-1 shadow-md ring-1 ring-white/20 transition group-hover:ring-brand-400/50">
                      {qrDataUrl
                        ? <img src={qrDataUrl} alt="QR" className="h-full w-full" />
                        : <Loader2 size={18} className="m-auto animate-spin text-slate-400" />
                      }
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 transition group-hover:bg-black/30">
                      <ZoomIn size={16} className="text-white opacity-0 transition group-hover:opacity-100" />
                    </div>
                  </button>
                  <div className="flex-1">
                    <div className="mb-0.5 text-xs font-semibold text-dark-100">QR del VIN</div>
                    <div className="mb-3 font-mono text-[10px] text-dark-500 break-all">{vinOrPlate || 'Sin VIN'}</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setQrOpen(true)}
                        className="flex items-center gap-1.5 rounded-lg border border-dark-600 px-3 py-1.5 text-[11px] font-medium text-dark-300 hover:border-brand-500/40 hover:text-brand-400 transition"
                      >
                        <Maximize2 size={10} /> Ampliar
                      </button>
                      <a
                        href={qrDataUrl || '#'}
                        download={`QR_${vehicle.license_plate || vehicle.id}.png`}
                        onClick={e => !qrDataUrl && e.preventDefault()}
                        className={`flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:brightness-110 transition ${!qrDataUrl ? 'opacity-40 pointer-events-none' : ''}`}
                      >
                        <Download size={10} /> QR
                      </a>
                      <button
                        onClick={downloadCard}
                        disabled={!qrDataUrl}
                        className="flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 text-[11px] font-semibold text-brand-300 hover:bg-brand-500/20 transition disabled:opacity-40"
                      >
                        <Download size={10} /> Tarjeta
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* Sección: Conductor */}
            <Section title="Conductor asignado" icon={<User size={13} />}>
              <div className="px-3 pb-3">
                <div className="flex items-center gap-3 rounded-xl border border-dark-700/40 bg-dark-800/30 p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-dark-700">
                    <User size={16} className="text-dark-400" />
                  </div>
                  <div>
                    {driver === undefined
                      ? <Loader2 size={14} className="animate-spin text-dark-500" />
                      : driver
                        ? <>
                            <div className="text-sm font-semibold text-dark-100">{driver.name}</div>
                            {driver.center && <div className="text-xs text-dark-500">{driver.center}</div>}
                          </>
                        : <span className="text-sm text-dark-500">{t('ui.no.driver')}</span>
                    }
                  </div>
                </div>
              </div>
            </Section>

            {/* Sección: Mantenimiento por km */}
            <Section title="Mantenimiento" icon={<Wrench size={13} />}>
              <div className="px-3 pb-3 space-y-2">
                {maintenance?.km_per_day != null && (
                  <div className="flex items-center gap-1.5 text-[11px] text-dark-500">
                    <Gauge size={11} className="text-brand-400" />
                    Ritmo real: <b className="text-dark-300">{maintenance.km_per_day} km/día</b> (últimos 60 días) — las fechas ≈ se estiman con este ritmo
                  </div>
                )}
                {[
                  { key: 'oil',       label: 'Aceite',              Icon: Droplets,  color: 'amber'   },
                  { key: 'ruedas',    label: 'Ruedas',              Icon: CircleDot, color: 'sky'     },
                  { key: 'pastillas', label: 'Pastillas de freno',  Icon: Disc,      color: 'rose'    },
                ].map(({ key, label, Icon, color }) => {
                  const item = maintenance?.[key]
                  const overdue  = item?.overdue
                  const warning  = item?.warning
                  const stateCls = overdue  ? `bg-red-500/10 border-red-500/30 text-red-300`
                                 : warning  ? `bg-amber-500/10 border-amber-500/30 text-amber-300`
                                 : item     ? `bg-emerald-500/10 border-emerald-500/30 text-emerald-300`
                                            : `border-dark-700/50 bg-dark-800/30 text-dark-500`
                  return (
                    <div key={key} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${stateCls}`}>
                      <Icon size={14} className="shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold">{label}</div>
                        {item ? (
                          <div className="mt-0.5 text-[11px] opacity-80">
                            {overdue
                              ? `Vencido hace ${Math.abs(item.km_until_change).toLocaleString()} km`
                              : `${item.km_until_change.toLocaleString()} km restantes · próximo a ${item.next_change_at_km.toLocaleString()} km`}
                            {!overdue && item.days_left_estimate != null && (
                              <span className="ml-1 font-semibold text-brand-300">· ≈ {item.days_left_estimate} días</span>
                            )}
                          </div>
                        ) : (
                          <div className="mt-0.5 text-[11px] opacity-60">Sin datos registrados</div>
                        )}
                      </div>
                      <button
                        onClick={() => setMaintModal(key)}
                        className="shrink-0 rounded-lg border border-current/20 px-2 py-1 text-[10px] font-semibold opacity-80 hover:opacity-100 transition"
                      >
                        {item ? 'Actualizar' : 'Registrar'}
                      </button>
                    </div>
                  )
                })}
                {maintenance === null && (
                  <div className="flex items-center gap-2 py-2 text-xs text-dark-500">
                    <Loader2 size={12} className="animate-spin" /> Cargando mantenimiento…
                  </div>
                )}
              </div>
            </Section>

            {/* Zona de peligro: eliminar furgoneta (borrado suave, doble confirmación) */}
            <div className="mx-3 mb-4 mt-2 rounded-xl border border-red-500/15 bg-red-500/[0.03] p-3">
              {confirmDel ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-red-300">
                    ¿Eliminar <b className="font-mono">{vehicle.license_plate}</b>? Desaparecerá de todas las listas (el historial se conserva).
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true)
                        try {
                          await deleteVehicle(vehicle.id)
                          onSaved?.()
                          onClose()
                        } catch { showToast('No se pudo eliminar', false); setBusy(false) }
                      }}
                      className="rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      {busy ? 'Eliminando…' : 'Sí, eliminar'}
                    </button>
                    <button onClick={() => setConfirmDel(false)} className="rounded-lg border border-dark-600 px-3 py-1.5 text-xs text-dark-300 hover:text-white transition">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmDel(true)} className="flex items-center gap-1.5 text-xs font-semibold text-red-400/70 transition hover:text-red-400">
                  <Trash2 size={12} /> Eliminar esta furgoneta
                </button>
              )}
            </div>

            <div className="h-4" />
            </> /* fin tab info */}

            {/* ══ TAB: GEMELO DIGITAL 3D ══ */}
            {activeTab === 'gemelo' && (
              <div className="flex flex-col p-3" style={{ height: 'calc(100vh - 220px)', minHeight: 460 }}>
                {/* Historial de daños + reparaciones (taller de chapa) */}
                {ledger && (
                  <div className="mb-2 rounded-xl border border-dark-800 bg-dark-900/60 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-dark-500">Daños registrados</span>
                      {(ledger.open || []).length === 0 && <span className="text-[12px] text-emerald-400">✓ Sin daños abiertos</span>}
                      {(ledger.open || []).map((e) => (
                        <span key={e.panel} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-[11.5px] font-medium text-amber-300 ring-1 ring-amber-500/25">
                          {e.part || e.panel} · {e.severity}
                          <button
                            title="Marcar este panel como reparado"
                            disabled={repairing}
                            onClick={() => repairLedger({ panel: e.panel })}
                            className="rounded bg-emerald-500/20 px-1.5 text-emerald-300 hover:bg-emerald-500/40 disabled:opacity-50">✓</button>
                        </span>
                      ))}
                      <span className="ml-auto flex items-center gap-2">
                        {vehicle.body_repaired_at && (
                          <span className="text-[11px] text-emerald-400/80">🔧 Chapa completa: {String(vehicle.body_repaired_at).slice(0, 10)}</span>
                        )}
                        {(ledger.repaired || []).length > 0 && (
                          <span className="text-[11px] text-dark-500">{ledger.repaired.length} reparados</span>
                        )}
                        <button
                          onClick={repairAll}
                          disabled={repairing || (ledger.open || []).length === 0}
                          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[12px] font-semibold text-emerald-300 hover:border-emerald-500/60 disabled:opacity-40">
                          {repairing ? 'Guardando…' : '🔧 Salió de chapa — todo reparado'}
                        </button>
                      </span>
                    </div>
                  </div>
                )}
                <div className="min-h-0 flex-1">
                {insps === null ? (
                  <div className="flex h-full items-center justify-center text-dark-500">
                    <Loader2 size={18} className="animate-spin" /> <span className="ml-2">Cargando…</span>
                  </div>
                ) : (
                  <Suspense fallback={
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-dark-500">
                      <Box size={26} className="animate-pulse" />
                      <span className="text-sm">Preparando el gemelo digital…</span>
                    </div>
                  }>
                    <Vehicle3DViewer
                      vehicle={vehicle}
                      inspections={insps || []}
                      ledger={ledger}
                      loading={ledgerLoading}
                    />
                  </Suspense>
                )}
                </div>
              </div>
            )}

            {/* ══ TAB: INSPECCIONES ══ */}
            {activeTab === 'inspecciones' && (
              <div className="px-3 py-3">
                {/* ── Línea de tiempo visual: la historia del vehículo de un vistazo.
                     Oro para disputas con el renting: "entró sin daño el 12, salió con él el 13" ── */}
                {insps?.length > 1 && (
                  <div className="mb-4 overflow-x-auto pb-2">
                    <div className="flex min-w-max items-end gap-1 px-1">
                      {[...insps].reverse().slice(-30).map((tl) => {
                        const s = tl.analysis?.severity || 'sin_analisis'
                        const hasNew = (tl.analysis?.new_damages || []).length > 0
                        const col = s === 'critico' || s === 'grave' ? 'bg-red-400'
                          : s === 'moderado' ? 'bg-orange-400'
                          : s === 'leve' ? 'bg-yellow-400'
                          : s === 'sin_danos' ? 'bg-emerald-400' : 'bg-dark-600'
                        return (
                          <div key={tl.id} className="group relative flex flex-col items-center gap-1"
                            title={`${(tl.created_at || '').slice(0, 10)} · ${s}${hasNew ? ' · DAÑO NUEVO' : ''}${tl.driver_name ? ' · ' + tl.driver_name : ''}`}>
                            {tl.photos?.[0] ? (
                              <img src={tl.photos[0]} alt="" loading="lazy"
                                className={`h-9 w-9 rounded-md object-cover opacity-80 ring-2 transition group-hover:scale-125 group-hover:opacity-100 ${hasNew ? 'ring-red-500/70' : 'ring-transparent'}`} />
                            ) : (
                              <div className="h-9 w-9 rounded-md bg-dark-800" />
                            )}
                            <span className={`h-1.5 w-1.5 rounded-full ${col}`} />
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-1 flex justify-between px-1 text-[9px] text-dark-600">
                      <span>{(insps[insps.length - 1]?.created_at || '').slice(0, 10)}</span>
                      <span>hoy · {insps.length} inspecciones</span>
                    </div>
                  </div>
                )}
                {!insps ? (
                  <div className="flex items-center gap-2 py-8 text-dark-500"><Loader2 size={14} className="animate-spin" /> Cargando…</div>
                ) : insps.length === 0 ? (
                  <div className="rounded-xl border border-dark-700/40 p-10 text-center text-sm text-dark-500">
                    <Camera size={28} className="mx-auto mb-3 opacity-20" />
                    Sin inspecciones registradas
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {insps.map((insp) => {
                      const sev = insp.analysis?.severity || ''
                      const sevMap = {
                        grave:    'bg-red-500/10 text-red-300 ring-red-500/20',
                        critico:  'bg-red-500/10 text-red-300 ring-red-500/20',
                        moderado: 'bg-orange-500/10 text-orange-300 ring-orange-500/20',
                        leve:     'bg-amber-500/10 text-amber-300 ring-amber-500/20',
                      }
                      const sevCls = sevMap[sev] || 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20'
                      return (
                        <div key={insp.id} className="flex items-center gap-3 rounded-xl border border-dark-800/60 px-3 py-2.5 transition hover:bg-dark-800/40">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-dark-200">{(insp.created_at || '').slice(0, 16).replace('T', ' ')}</span>
                              {sev && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${sevCls}`}>{sev}</span>}
                            </div>
                            {insp.driver_name && (
                              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-dark-500">
                                <User size={9} className="shrink-0" />
                                <span className="truncate">{insp.driver_name}</span>
                              </div>
                            )}
                          </div>
                          <ChevronRight size={12} className="shrink-0 text-dark-700" />
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Incidencias dentro del mismo tab */}
                {vehicleIncidents !== null && vehicleIncidents.length > 0 && (
                  <div className="mt-5">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-dark-500">
                      <AlertTriangle size={11} /> Incidencias ({vehicleIncidents.length})
                    </div>
                    <div className="space-y-2">
                      {vehicleIncidents.map(inc => {
                        const sevCls = {
                          leve:     'bg-yellow-500/10 text-yellow-300 ring-yellow-500/20',
                          moderado: 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
                          grave:    'bg-orange-500/10 text-orange-300 ring-orange-500/20',
                          critico:  'bg-red-500/10 text-red-300 ring-red-500/20',
                        }[inc.severity] || 'bg-dark-700 text-dark-400'
                        const isResolved = inc.status !== 'open'
                        return (
                          <div key={inc.id} className={`rounded-xl border px-3 py-2.5 ${isResolved ? 'border-dark-800/40 opacity-60' : 'border-dark-700/60'}`}>
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ${sevCls}`}>{inc.severity}</span>
                              {isResolved && <span className="mt-0.5 inline-flex rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">resuelta</span>}
                            </div>
                            <p className="mt-1 text-[12px] font-medium text-dark-200 leading-snug">{inc.title || inc.description?.slice(0, 60) || '—'}</p>
                            {inc.description && inc.title && <p className="mt-0.5 text-[11px] text-dark-500 line-clamp-2">{inc.description}</p>}
                            <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-dark-600">
                              {inc.created_by_name && <span>Por: <span className="text-dark-400">{inc.created_by_name}</span></span>}
                              {inc.created_at && <span>{(inc.created_at || '').slice(0, 10)}</span>}
                              {inc.resolved_at && <span className="text-emerald-700">· Resuelta {(inc.resolved_at || '').slice(0, 10)}</span>}
                            </div>
                            {inc.notes && <p className="mt-1 text-[10px] italic text-dark-600">{inc.notes}</p>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                <div className="h-4" />
              </div>
            )}

            {/* ══ TAB: HISTORIAL — línea de vida cronológica del vehículo ══
                Oro en disputas con el renting: qué pasó, cuándo y con quién,
                todo desde datos ya registrados (nada inventado). */}
            {activeTab === 'expediente' && <Expediente vehicleId={vehicle?.id} />}

            {activeTab === 'historial' && (() => {
              const evs = []
              for (const i of insps || []) {
                const s = i.analysis?.severity
                const nd = (i.analysis?.new_damages || []).length
                const dot = s === 'grave' || s === 'critico' ? 'bg-red-400'
                  : s === 'moderado' ? 'bg-orange-400'
                  : s === 'leve' ? 'bg-amber-400'
                  : s === 'sin_danos' ? 'bg-emerald-400' : 'bg-dark-600'
                evs.push({
                  at: i.created_at, dot, strong: nd > 0,
                  txt: `${t('vh.ev.insp')}${s ? ` · ${s}` : ''}${nd ? ` · ${nd} ${t('vh.ev.new')}` : ''}${i.driver_name ? ` · ${i.driver_name}` : ''}`,
                })
              }
              for (const inc of vehicleIncidents || []) {
                if (inc.created_at) evs.push({ at: inc.created_at, dot: 'bg-amber-400', txt: `${t('vh.f.incident')}: ${(inc.title || inc.description || '').slice(0, 60)}` })
                if (inc.resolved_at) evs.push({ at: inc.resolved_at, dot: 'bg-emerald-400', txt: `${t('vh.ev.inc.res')}: ${(inc.title || '').slice(0, 60)}` })
              }
              for (const e of (ledger?.repaired || [])) {
                if (e.repaired_at) evs.push({ at: e.repaired_at, dot: 'bg-emerald-400', txt: `${t('vh.ev.repair')}: ${e.part || e.panel}` })
              }
              if (vehicle.body_repaired_at) evs.push({ at: vehicle.body_repaired_at, dot: 'bg-emerald-400', txt: `🔧 ${t('vh.ev.repair.all')}` })
              // Mantenimientos hechos. La nota es lo que de verdad se hizo
              // ("ruedas traseras"), que casi nunca es el título del cambio, y
              // es justo lo que hace falta leer dentro de seis meses.
              for (const m of (maintLog || [])) {
                const et = MAINT_LABEL[m.tipo] || m.tipo
                // Qué ejes: "Ruedas" a secas y "Ruedas delanteras" no dicen lo
                // mismo, y es lo primero que se pregunta al mirar atrás.
                const ejes = (m.posiciones || []).map((p) => EJE_LABEL[p] || p)
                const cual = ejes.length && ejes.length < 2 ? ` ${ejes[0].toLowerCase()}` : ''
                evs.push({
                  at: m.fecha, dot: 'bg-sky-400', strong: true, apunte: m.id,
                  txt: [`🔧 ${et}${cual}`, m.nota, m.km != null ? `${Number(m.km).toLocaleString('es')} km` : null, m.taller]
                    .filter(Boolean).join(' · '),
                })
              }
              evs.sort((a, b) => String(b.at).localeCompare(String(a.at)))
              return (
                <div className="px-5 py-4">
                  {evs.length > 0 && (
                    <button
                      onClick={() => buildDisputeDoc(evs)}
                      className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-brand-500/25 transition hover:brightness-110 active:scale-[0.99]"
                    >
                      <FileText size={14} /> {t('vh.dispute')}
                    </button>
                  )}
                  {/* Cuánto tiempo estuvo abierto cada daño. La lista de abajo
                      dice QUÉ pasó y CUÁNDO; esto dice CUÁNTO DURÓ. Solo si el
                      ledger trae algo: sin daños no hay nada que dibujar. */}
                  {((ledger?.open?.length || 0) + (ledger?.repaired?.length || 0)) > 0 && (
                    <div className="mb-4"><VidaVehiculo ledger={ledger} /></div>
                  )}
                  {(insps === null || vehicleIncidents === null) ? (
                    <div className="flex items-center gap-2 py-8 text-dark-500"><Loader2 size={14} className="animate-spin" /> …</div>
                  ) : evs.length === 0 ? (
                    <div className="rounded-xl border border-dark-700/40 p-10 text-center text-sm text-dark-500">
                      <Clock size={26} className="mx-auto mb-3 opacity-25" />
                      {t('rev.no.pending') /* sin eventos aún */}
                    </div>
                  ) : (
                    <ol className="relative ml-1.5 border-l border-white/[0.08]">
                      {evs.map((e, i) => (
                        <li key={i} className="group/ev relative ml-5 pb-4 last:pb-0">
                          <span className={`absolute -left-[25.5px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-dark-950 ${e.dot}`} />
                          <div className="flex items-center gap-2">
                            <div className="text-[11px] tabular-nums text-dark-500">{String(e.at).slice(0, 16).replace('T', ' · ')}</div>
                            {/* Un apunte de mantenimiento se puede quitar, y al
                                quitarlo se deshace: el contador de km vuelve a
                                donde estaba y la cita vuelve a pendiente. */}
                            {e.apunte && (
                              <button
                                title={t('vh.maint.del')}
                                onClick={async () => {
                                  await borrarApunteMantenimiento(vehicle.id, e.apunte)
                                  const [l, m] = await Promise.all([
                                    getMaintenanceLog(vehicle.id), getVehicleMaintenance(vehicle.id),
                                  ])
                                  setMaintLog(lista(l.data?.rows)); setMaintenance(m.data || null)
                                }}
                                className="rounded p-0.5 text-dark-700 opacity-0 transition hover:text-red-300 group-hover/ev:opacity-100"
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                          <div className={`text-[13px] leading-snug ${e.strong ? 'font-semibold text-dark-100' : 'text-dark-300'}`}>{e.txt}</div>
                        </li>
                      ))}
                    </ol>
                  )}
                  <div className="h-4" />
                </div>
              )
            })()}

            {/* ══ TAB: DOCUMENTOS ══ */}
            {activeTab === 'docs' && (
              <div className="px-3 py-3">
                {/* Input oculto para subir */}
                <input ref={docInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleDocUpload} />

                {/* Tipos de documentos.

                    Se agrupa por `tipo`, que lo normaliza el backend, y NO por
                    `doc_type` en crudo. Antes se comparaba por igualdad exacta
                    contra estos cajones, y como el mismo papel se ha guardado
                    de seis maneras ('seguro' y 'Seguro', 'contrato' y 'Contrato
                    renting'), todo lo que no encajaba EXACTAMENTE no se pintaba
                    en ninguna parte. Sin error y sin aviso: simplemente no
                    estaba. Eran 60 de 140 documentos, el 43%.

                    El cajón 'otro' recoge además todo lo que no case con
                    ninguno, así que ya no hay forma de que un documento subido
                    desaparezca de la pantalla. */}
                <div className="space-y-4">
                  {[
                    { type: 'seguro',        label: 'Seguro',           Icon: Shield },
                    { type: 'itv',           label: 'Certificado ITV',  Icon: FileCheck },
                    { type: 'ficha_tecnica', label: 'Ficha técnica',    Icon: FileBadge },
                    { type: 'contrato',      label: 'Contrato renting', Icon: FileText },
                    { type: 'permiso',       label: 'Permiso de circulación', Icon: FileCheck },
                    { type: 'otro',          label: 'Otro documento',   Icon: File },
                  ].map(({ type, label, Icon }) => {
                    const CAJONES = ['seguro', 'itv', 'ficha_tecnica', 'contrato', 'permiso']
                    const tipoDe = (d) => d.tipo || d.doc_type
                    const typeDocs = (docs || []).filter(d => (
                      type === 'otro' ? !CAJONES.includes(tipoDe(d)) : tipoDe(d) === type))
                    return (
                      <div key={type}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-dark-500">
                            <Icon size={11} /> {label}
                          </div>
                          <button
                            onClick={() => triggerUpload(type)}
                            disabled={uploadingDoc}
                            className="flex items-center gap-1 rounded-lg border border-dark-700 px-2 py-0.5 text-[10px] font-medium text-dark-400 hover:border-brand-500/40 hover:text-brand-400 transition disabled:opacity-40"
                          >
                            {uploadingDoc && pendingDocType === type ? <Loader2 size={9} className="animate-spin" /> : <Upload size={9} />}
                            Subir
                          </button>
                        </div>
                        {typeDocs.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-dark-700/50 px-3 py-2 text-[11px] text-dark-600">
                            Sin documentos — pulsa Subir para añadir
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {typeDocs.map(doc => (
                              <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-dark-700/50 bg-dark-800/40 px-3 py-2">
                                <FileImage size={12} className="shrink-0 text-brand-400/70" />
                                <span className="flex-1 truncate text-[11px] text-dark-300" title={doc.name}>{doc.name}</span>
                                <span className="shrink-0 text-[10px] text-dark-600">{(doc.uploaded_at || '').slice(0, 10)}</span>
                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded p-1 text-dark-500 hover:text-brand-400 transition" title="Abrir">
                                  <ExternalLink size={11} />
                                </a>
                                <button onClick={() => handleDocDelete(doc.id)} className="shrink-0 rounded p-1 text-dark-600 hover:text-red-400 transition" title="Eliminar">
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {docs === null && (
                  <div className="flex items-center gap-2 py-4 text-xs text-dark-500">
                    <Loader2 size={12} className="animate-spin" /> Cargando documentos…
                  </div>
                )}
                <div className="h-4" />
              </div>
            )}

            <div className="h-6" />
          </div>

          {/* Loading overlay */}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
              <Loader2 size={24} className="animate-spin text-brand-400" />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function StatChip({ icon, val, label, onClick, titulo }) {
  const clases = 'flex flex-col items-center gap-0.5 rounded-xl bg-white/5 py-2.5 px-2 text-center'
  const dentro = (
    <>
      <div className="mb-0.5 text-slate-500">{icon}</div>
      <div className="text-sm font-bold text-slate-200">{val}</div>
      <div className="text-[9px] text-slate-600">{label}</div>
    </>
  )
  // Los chips que se pueden tocar tienen que PARECER que se pueden tocar: si no
  // se distinguen del resto, nadie descubre que hay algo detras.
  if (!onClick) return <div className={clases}>{dentro}</div>
  return (
    <button type="button" onClick={onClick} title={titulo}
      className={`${clases} cursor-pointer transition-colors hover:bg-white/10`}>
      {dentro}
    </button>
  )
}


/* PONER LAS BOLSAS QUE QUEDAN
   ═══════════════════════════════════════════════════════════════════════════
   La ficha llevaba enseñando este numero desde siempre y no habia forma de
   cambiarlo: las rutas `bags/set` y `bags/consume` existian sin un solo boton,
   asi que el chip decia 0 en todas las furgonetas de todas las empresas.

   Se fija el stock, no se suma: quien cuenta bolsas en la nave mira cuantas
   hay y escribe ese numero. Pedirle la diferencia obliga a restar de cabeza y
   a acordarse de lo que habia. */
function BolsasModal({ vehicle, onGuardar, onClose }) {
  const [n, setN] = useState(String(vehicle.bags_remaining ?? 0))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const num = Number(n)
  const valido = n !== '' && Number.isFinite(num) && num >= 0 && num <= 100000

  const guardar = async () => {
    if (!valido) return
    setBusy(true); setErr('')
    try { await onGuardar(num) } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo guardar.')
      setBusy(false); return
    }
    setBusy(false); onClose()
  }

  return (
    /* Las clases son las del panel (`dark-*` y `.input`), no `slate-*`: el modo
       dia compensa unas y no las otras, y `text-slate-100` sobre `bg-slate-800`
       da 1,01:1 —texto claro sobre fondo claro—. Lo canto `check-contraste`
       antes de desplegarlo. */
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-2xl border border-dark-700 bg-dark-900 p-5 shadow-xl">
        <h3 className="text-sm font-bold text-dark-50">Bolsas de {vehicle.license_plate}</h3>
        <p className="mt-1 text-[12px] text-dark-400">
          Cuántas quedan ahora mismo en la furgoneta.
        </p>
        <input type="number" min="0" max="100000" value={n} autoFocus
          onChange={(e) => setN(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && valido) guardar() }}
          className="cifra input mt-3 w-full text-center text-lg font-bold" />
        {err && <p className="mt-2 text-[12px] text-red-400">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={guardar} disabled={!valido || busy}
            className="btn-primary flex-1 disabled:opacity-40">
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, icon, count, children }) {
  return (
    <div className="border-t border-white/5">
      <div className="flex items-center gap-2 px-6 py-3">
        <span className="text-dark-500">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-dark-500">{title}</span>
        {count != null && <span className="ml-auto text-xs text-dark-600">{count}</span>}
      </div>
      {children}
    </div>
  )
}

/* ── Modal: Añadir vehículo ── */
const FUEL_TYPES   = ['Gasolina', 'Diésel', 'Híbrido', 'Eléctrico', 'GLP', 'GNC']
const VEHICLE_TYPES = ['Furgoneta', 'Camión', 'Turismo', 'Monovolumen', 'Pick-up', 'Otro']
const PROVIDERS     = ['BANSACAR', 'SANTANDER RENTING', 'LeasePlan', 'ALD', 'Arval', 'Alphabet', 'Kinto One', 'Leaseplan', 'One Furgo', 'Otro']

function AddVehicleModal({ centers, onSaved, onClose }) {
  useEscape(onClose)
  const [form, setForm] = useState({
    license_plate: '', brand: '', model: '', color: '',
    year: '', vin: '', center: centers?.[0] || '',
    mileage: '', provider: '', vehicle_type: 'Furgoneta',
    fuel_type: '', itv_date: '', renting_end_date: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const valid = form.license_plate.trim().length >= 4 && form.center

  async function submit() {
    if (!valid || busy) return
    setBusy(true); setErr('')
    try {
      const payload = {
        license_plate: form.license_plate.trim().toUpperCase(),
        brand: form.brand.trim(),
        model: form.model.trim(),
        color: form.color.trim(),
        year: form.year ? Number(form.year) : undefined,
        vin: form.vin.trim() || undefined,
        center: form.center,
        mileage: form.mileage ? Number(form.mileage) : undefined,
        provider: form.provider || undefined,
        vehicle_type: form.vehicle_type || undefined,
        fuel_type: form.fuel_type || undefined,
        itv_date: form.itv_date || undefined,
        renting_end_date: form.renting_end_date || undefined,
      }
      await createVehicle(payload)
      onSaved()
      onClose()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo crear el vehículo')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-xl rounded-2xl border border-dark-700 bg-dark-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/15">
              <Truck size={17} className="text-brand-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-dark-50">Añadir vehículo</h2>
              <p className="text-[11px] text-dark-500">Nuevo vehículo en la flota</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-dark-300 hover:bg-dark-800 hover:text-white transition">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          <div className="space-y-5">

            {/* Matrícula + Centro — los dos más importantes */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-1">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">
                  Matrícula <span className="text-red-400">*</span>
                </label>
                <input
                  autoFocus
                  className="input w-full font-mono text-sm font-bold tracking-widest uppercase"
                  placeholder="1234 ABC"
                  value={form.license_plate}
                  onChange={e => set('license_plate', e.target.value.toUpperCase())}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">
                  Centro <span className="text-red-400">*</span>
                </label>
                {centers?.length > 0 ? (
                  <select className="select w-full text-sm" value={form.center} onChange={e => set('center', e.target.value)}>
                    {centers.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <input className="input w-full text-sm" placeholder="OGA5, DGA1…" value={form.center} onChange={e => set('center', e.target.value)} />
                )}
              </div>
            </div>

            {/* Marca + Modelo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">Marca</label>
                <input className="input w-full text-sm" placeholder="Toyota, Renault…" value={form.brand} onChange={e => set('brand', e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">Modelo</label>
                <input className="input w-full text-sm" placeholder="Proace, Trafic…" value={form.model} onChange={e => set('model', e.target.value)} />
              </div>
            </div>

            {/* Tipo + Combustible + Año */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">Tipo</label>
                <select className="select w-full text-sm" value={form.vehicle_type} onChange={e => set('vehicle_type', e.target.value)}>
                  {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">Combustible</label>
                <select className="select w-full text-sm" value={form.fuel_type} onChange={e => set('fuel_type', e.target.value)}>
                  <option value="">—</option>
                  {FUEL_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">Año</label>
                <input className="input w-full text-sm" type="number" placeholder="2023" min="2000" max="2030" value={form.year} onChange={e => set('year', e.target.value)} />
              </div>
            </div>

            {/* Color + Km */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">Color</label>
                <input className="input w-full text-sm" placeholder="Blanco, Gris…" value={form.color} onChange={e => set('color', e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">Kilómetros</label>
                <input className="input w-full text-sm" type="number" placeholder="0" value={form.mileage} onChange={e => set('mileage', e.target.value)} />
              </div>
            </div>

            {/* VIN */}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">VIN / Bastidor</label>
              <input className="input w-full font-mono text-xs tracking-wider" placeholder="YARVJYHVMRZxxxxxxx" value={form.vin} onChange={e => set('vin', e.target.value.toUpperCase())} />
            </div>

            {/* Proveedor */}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">Proveedor renting</label>
              <select className="select w-full text-sm" value={form.provider} onChange={e => set('provider', e.target.value)}>
                <option value="">— Sin proveedor —</option>
                {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* ITV + Fin renting */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">Caducidad ITV</label>
                <input className="input w-full text-sm" type="date" value={form.itv_date} onChange={e => set('itv_date', e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">Fin contrato renting</label>
                <input className="input w-full text-sm" type="date" value={form.renting_end_date} onChange={e => set('renting_end_date', e.target.value)} />
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/5 px-6 py-4">
          {err ? (
            <p className="text-xs text-red-400">{err}</p>
          ) : (
            <p className="text-[11px] text-dark-600">Los campos con <span className="text-red-400">*</span> son obligatorios</p>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
            <button
              onClick={submit}
              disabled={!valid || busy}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Añadir vehículo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Tabla principal ── */
/* ── TODA LA DOCUMENTACIÓN, PASE LO QUE PASE CON LA FURGONETA ────────────────
   Hasta ahora el papeleo sólo se veía entrando en la ficha de su furgoneta.
   Parece razonable hasta que la furgoneta se devuelve: entonces desaparece de
   la lista y su documentación se vuelve inalcanzable, aunque siga guardada.

   Medido en producción el 20-08-2026, sobre 140 documentos subidos:
     · 22 colgaban de furgonetas de baja o borradas — sin forma de abrirlos.
     · 38 más no se pintaban ni estando la furgoneta activa, porque su tipo
       ('Permiso circulacion', 'Poliza'…) no casaba con ninguno de los cinco
       cajones fijos de la ficha.
   Total: 60 de 140 invisibles. Los 22 ficheros se comprobaron uno a uno contra
   R2 y estaban TODOS ahí, con su tamaño. No se había perdido nada: no había por
   dónde llegar. Por eso María entraba varias veces y no encontraba lo suyo.

   Aquí no hay filtro por estado, y es el sentido de la pantalla: si se subió
   alguna vez, aparece. El estado de la furgoneta se enseña como etiqueta —
   devuelta, en taller, ficha borrada — porque saber de qué furgoneta es y en
   qué situación está forma parte de la respuesta. */
function PanelDocumentos() {
  // `useT()` devuelve el contexto entero ({ lang, setLang, t }), no la funcion.
  // Sin desestructurar, `t('...')` es "t is not a function" y la pantalla se
  // cae entera en cuanto pinta la primera etiqueta.
  const { t } = useT()
  const [docs, setDocs] = useState(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    getAllDocuments()
      .then((r) => setDocs(r.data?.documentos || []))
      .catch(() => setErr('No se pudo cargar la documentación.'))
  }, [])

  /* El filtro se hace aquí y no pidiéndoselo al servidor en cada tecla: son
     unos cientos de documentos y así se escribe sin esperas ni parpadeos. */
  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return docs || []
    const limpia = (x) => String(x || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
    const term = s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    return (docs || []).filter((d) => [d.matricula, d.name, d.doc_type, d.tipo, d.center]
      .some((c) => limpia(c).includes(term)))
  }, [docs, q])

  const ETIQUETA = {
    seguro: 'Seguro', itv: 'ITV', ficha_tecnica: 'Ficha técnica',
    contrato: 'Contrato renting', permiso: 'Permiso de circulación', otro: 'Otro',
  }
  const ESTADO = {
    baja: { txt: t('doc.devuelta'), cls: 'bg-amber-500/15 text-amber-300' },
    deleted: { txt: t('doc.borrada'), cls: 'bg-red-500/15 text-red-300' },
    borrada: { txt: t('doc.borrada'), cls: 'bg-red-500/15 text-red-300' },
    taller: { txt: t('doc.taller'), cls: 'bg-sky-500/15 text-sky-300' },
  }

  if (err) return <p className="text-red-400">{err}</p>

  return (
    <div className="rise">
      <p className="mb-4 max-w-3xl text-[12px] leading-relaxed text-dark-500">{t('doc.exp')}</p>

      <div className="relative mb-4 w-full max-w-md">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-500" />
        <input
          className="w-full rounded-xl border border-white/[0.07] bg-white/[0.02] py-2.5 pl-10 pr-3 text-[13.5px] text-dark-50 placeholder:text-dark-600 transition-all duration-300 hover:border-white/[0.12] focus:border-brand-500/50 focus:bg-white/[0.045] focus:outline-none focus:ring-[3px] focus:ring-brand-500/15"
          placeholder={t('doc.buscar')} value={q} onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {docs === null ? (
        <PageSkeleton kpis={0} rows={8} />
      ) : filtrados.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center text-dark-400">
          <FileText size={28} /> {t('doc.vacio')}
        </div>
      ) : (
        <>
          <div className="mb-2 text-[11px] text-dark-600">
            {filtrados.length}{filtrados.length !== docs.length && ` de ${docs.length}`}
          </div>
          <div className="divide-y divide-white/[0.04]">
            {filtrados.map((d) => {
              const est = ESTADO[d.estado]
              return (
                <a
                  key={d.id}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="float-row group flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left"
                >
                  <FileImage size={14} className="shrink-0 text-brand-400/70" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-[14px] font-semibold tracking-wider text-dark-50">
                        {d.matricula || '—'}
                      </span>
                      <span className="text-[12.5px] text-dark-400">
                        {ETIQUETA[d.tipo] || d.doc_type || 'Documento'}
                      </span>
                      {est && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${est.cls}`}>
                          {est.txt}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11.5px] text-dark-600">
                      <span className="truncate" title={d.name}>{d.name}</span>
                      {d.center && <span className="inline-flex items-center gap-1"><MapPin size={10} /> {d.center}</span>}
                      <span>{(d.uploaded_at || '').slice(0, 10)}</span>
                    </div>
                  </div>
                  <ExternalLink size={14} className="shrink-0 text-dark-700 transition group-hover:text-brand-400" />
                </a>
              )
            })}
          </div>
        </>
      )}
      <div className="h-6" />
    </div>
  )
}


/* ── LO QUE ACUMULA CADA FURGONETA ─────────────────────────────────────────
   La pregunta que hoy no se puede contestar: cuál de las 129 te está costando
   dinero. Los golpes se ven uno a uno en cada ficha, pero no había ningún sitio
   donde se vieran las 129 en fila y ordenadas por lo que arrastran.

   HECHO Y ESTIMACIÓN VAN SEPARADOS a propósito. Los golpes, la gravedad y los
   días son hechos: salen del libro. Los euros los calcula la IA sobre las fotos
   y NO están calibrados con ninguna factura, porque todavía no hay ninguna
   cargada — así que van en gris y con su aviso. Un número en euros que parece
   contabilidad y sale de una IA sin calibrar es el falso positivo más caro que
   hay: con él se toman decisiones de dinero. */
function PanelExposicion({ center, onAbrir }) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [soloConGolpes, setSoloConGolpes] = useState(true)

  useEffect(() => {
    setCargando(true)
    getExposicionVehiculos(center)
      .then((r) => setDatos(r.data))
      .catch(() => setDatos({ vehiculos: [] }))
      .finally(() => setCargando(false))
  }, [center])

  const lista = useMemo(() => {
    const vs = datos?.vehiculos || []
    return soloConGolpes ? vs.filter((v) => v.abiertos > 0) : vs
  }, [datos, soloConGolpes])

  if (cargando) {
    return (
      <div className="card flex items-center justify-center gap-2 p-12 text-dark-400">
        <Loader2 size={16} className="animate-spin" /> Sumando lo que arrastra cada furgoneta…
      </div>
    )
  }

  const sinGolpes = (datos?.vehiculos || []).filter((v) => v.abiertos === 0).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setSoloConGolpes(!soloConGolpes)}
          className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            soloConGolpes ? 'bg-dark-700 text-dark-100' : 'bg-dark-800/60 text-dark-400 hover:text-dark-200'}`}>
          {soloConGolpes ? 'Solo con golpes' : 'Todas'}
        </button>
        <span className="text-[12px] text-dark-500">
          <span className="cifra text-lime-400">{sinGolpes}</span> sin ningún golpe abierto
        </span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="sticky top-0 z-10 bg-dark-900">
              <tr className="border-b border-dark-800">
                <th className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-dark-500">Matrícula</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-dark-500">Modelo</th>
                <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-dark-500">Golpes</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-dark-500">Gravedad</th>
                <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-dark-500" title="Los graves pesan más que los leves">Índice</th>
                <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-dark-500">vs. modelo</th>
                <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-dark-500">Más viejo</th>
                <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-dark-500">€ estim.</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => (
                <tr key={v.vehicle_id} onClick={() => onAbrir?.(v.vehicle_id)}
                  className="float-row cursor-pointer border-b border-dark-800/50 last:border-0">
                  <td className="cifra px-2 py-1.5 font-semibold tracking-wider text-dark-50">{v.matricula}</td>
                  <td className="max-w-[170px] truncate px-2 py-1.5 text-dark-500">{v.modelo}</td>
                  <td className="cifra px-2 py-1.5 text-right text-dark-200">{v.abiertos || '—'}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {['critico', 'grave', 'moderado', 'leve'].map((k) => v.severidad[k] > 0 && (
                      <span key={k} className={`cifra mr-1 rounded px-1 text-[11px] ${
                        k === 'critico' ? 'bg-red-500/15 text-red-300'
                          : k === 'grave' ? 'bg-orange-500/15 text-orange-300'
                            : k === 'moderado' ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-dark-800 text-dark-400'}`}>
                        {v.severidad[k]}{k[0]}
                      </span>
                    ))}
                    {!v.abiertos && <span className="text-dark-700">—</span>}
                  </td>
                  <td className="cifra px-2 py-1.5 text-right text-dark-200">{v.indice || '—'}</td>
                  <td className="cifra px-2 py-1.5 text-right">
                    {v.vs_modelo ? (
                      <span className={v.vs_modelo >= 2 ? 'text-orange-300' : v.vs_modelo >= 1.5 ? 'text-amber-300' : 'text-dark-500'}
                        title={`Media de las ${v.modelo_n} de su modelo: ${v.modelo_media}`}>
                        {v.vs_modelo}x
                      </span>
                    ) : (
                      <span className="text-dark-700" title={v.vs_nota || 'No hay con qué comparar'}>—</span>
                    )}
                  </td>
                  <td className="cifra px-2 py-1.5 text-right text-dark-500">
                    {v.dias_golpe_mas_viejo != null ? `${v.dias_golpe_mas_viejo} d` : '—'}
                  </td>
                  <td className="cifra px-2 py-1.5 text-right text-dark-600">
                    {v.coste_estimado ? v.coste_estimado.toLocaleString('es') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-dark-800 px-3 py-2 text-[11.5px] leading-relaxed text-dark-500">
          <span className="font-semibold text-dark-400">Los euros son una estimación</span> que
          calcula la IA sobre las fotos: no están contrastados con ninguna factura, así que
          sirven para ordenar entre sí, no como coste real. Lo demás —golpes, gravedad y
          días— sale del libro y es un hecho. El índice pesa los graves más que los leves;
          el múltiplo solo sale cuando hay al menos {datos?.min_modelo || 4} furgonetas del
          mismo modelo con las que comparar.
        </p>
      </div>
    </div>
  )
}


/* ── FURGONETAS DADAS DE ALTA DOS VECES ────────────────────────────────────
   El daño no es el duplicado, es que el HISTORIAL SE PARTE. En la 9873LTX una
   ficha tiene 9 registros y la otra 8: ni los daños, ni el coste, ni las
   inspecciones de esa furgoneta son ciertos en ninguna de las dos. Y 38 slots
   del cuadrante apuntan a fichas duplicadas, así que «qué furgoneta lleva esta
   persona» depende de cuál tocó el sistema esa mañana.

   Primero salen las que tienen más de una ficha VIVA, que son las que están
   haciendo daño ahora. Las que ya tienen la otra de baja están resueltas de
   hecho y solo ensucian. */
/* ── EXPEDIENTE ────────────────────────────────────────────────────────────
   Todo lo que le ha pasado a esta furgoneta en una sola línea de tiempo. Hoy
   cada cosa vive en su pantalla —inspecciones aquí, golpes en el libro, averías
   en Incidencias, taller en Órdenes— y para contestar «qué le ha pasado» hay
   que abrir cuatro sitios y cruzarlos a mano. Nadie lo hace.

   Con una revisión al día, veintiuna líneas iguales entierran los tres hitos
   que importan. Por eso las revisiones que NO descubrieron nada se pueden
   esconder: la rutina se cuenta, pero no ocupa. Es la diferencia entre un
   historial y un listado. */

const HITO = {
  alta: { ico: '●', cls: 'text-dark-500', txt: 'Alta' },
  revision: { ico: '○', cls: 'text-dark-500', txt: 'Revisión' },
  golpe: { ico: '▲', cls: 'text-orange-400', txt: 'Golpe' },
  reparado: { ico: '✓', cls: 'text-lime-400', txt: 'Reparado' },
  averia: { ico: '!', cls: 'text-red-400', txt: 'Avería' },
  resuelta: { ico: '✓', cls: 'text-lime-400', txt: 'Resuelta' },
  taller: { ico: '→', cls: 'text-amber-400', txt: 'Al taller' },
  vuelve: { ico: '←', cls: 'text-lime-400', txt: 'Vuelve' },
  mantenimiento: { ico: '◆', cls: 'text-sky-400', txt: 'Mantenimiento' },
}

function Expediente({ vehicleId }) {
  const [d, setD] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [verRutina, setVerRutina] = useState(false)

  useEffect(() => {
    if (!vehicleId) return
    setCargando(true)
    getExpedienteVehiculo(vehicleId)
      .then((r) => setD(r.data))
      .catch(() => setD(null))
      .finally(() => setCargando(false))
  }, [vehicleId])

  const hitos = useMemo(() => {
    const hs = d?.hitos || []
    return verRutina ? hs : hs.filter((h) => h.tipo !== 'revision' || h.novedad)
  }, [d, verRutina])

  if (cargando) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-dark-400">
        <Loader2 size={15} className="animate-spin" /> Reuniendo su historia…
      </div>
    )
  }
  if (!d) return <div className="p-8 text-center text-sm text-dark-400">No se pudo cargar.</div>

  const r = d.resumen
  const ocultas = (d.hitos || []).filter((h) => h.tipo === 'revision' && !h.novedad).length

  return (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[['Revisiones', r.revisiones], ['Golpes abiertos', r.golpes_abiertos],
          ['Reparados', r.golpes_reparados], ['Veces al taller', r.veces_en_taller]].map(([et, n]) => (
          <div key={et} className="rounded-lg border border-dark-800 bg-dark-900/60 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-dark-500">{et}</p>
            <p className="cifra mt-0.5 text-[19px] font-semibold text-dark-100">{n}</p>
          </div>
        ))}
      </div>

      {!!r.conductores?.length && (
        <p className="text-[12px] leading-relaxed text-dark-500">
          La han llevado <span className="cifra text-dark-300">{r.conductores_distintos}</span> personas
          distintas desde <span className="cifra">{r.desde}</span>. Los que más:{' '}
          {r.conductores.map((c, i) => (
            <span key={c.nombre}>
              {i > 0 && ', '}
              <span className="text-dark-300">{c.nombre}</span>
              {' '}<span className="cifra">({c.veces})</span>
            </span>
          ))}.
        </p>
      )}

      {ocultas > 0 && (
        <button onClick={() => setVerRutina(!verRutina)}
          className="text-[12px] font-medium text-brand-300 hover:text-brand-200">
          {verRutina
            ? `Esconder las ${ocultas} revisiones sin novedad`
            : `Ver también las ${ocultas} revisiones que no descubrieron nada`}
        </button>
      )}

      <div className="space-y-0.5">
        {hitos.map((h, i) => {
          const c = HITO[h.tipo] || HITO.revision
          return (
            <div key={`${h.fecha}-${h.tipo}-${i}`}
              className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-dark-800/40">
              <span className="cifra w-[74px] flex-none pt-0.5 text-[11.5px] text-dark-500">{h.fecha}</span>
              <span className={`w-3 flex-none pt-0.5 text-center text-[11px] ${c.cls}`}>{c.ico}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-dark-200">
                  {h.texto}
                  {h.gravedad && h.tipo !== 'revision' && (
                    <span className={`ml-1.5 text-[11px] ${
                      h.gravedad === 'critico' ? 'text-red-300'
                        : h.gravedad === 'grave' ? 'text-orange-300' : 'text-dark-500'}`}>
                      {h.gravedad}
                    </span>
                  )}
                </span>
                {(h.detalle || h.llevaba || h.orden) && (
                  <span className="mt-0.5 block text-[11.5px] text-dark-500">
                    {h.llevaba && <>La llevaba <span className="text-dark-300">{h.llevaba}</span>. </>}
                    {h.detalle}
                    {h.orden && <> · orden {h.orden}</>}
                  </span>
                )}
              </span>
              {h.foto && (
                <img src={h.foto} alt="" loading="lazy"
                  className="h-9 w-12 flex-none rounded border border-dark-700 object-cover" />
              )}
            </div>
          )
        })}
      </div>

      {d.total_hitos > (d.hitos || []).length && (
        <p className="text-[11.5px] text-dark-600">
          Se enseñan los {(d.hitos || []).length} más recientes de {d.total_hitos}.
        </p>
      )}
    </div>
  )
}


/* ── LECTURAS DE KILOMETRAJE QUE NO PUEDEN SER ───────────────────────────────
   Dos errores reales, vistos en producción: un dígito de más o de menos
   (611105 por 61110) y meter el cuentakilómetros PARCIAL en vez del total
   (350, 500, 25 km). Con esos picos dentro, el ritmo salía entre -6.350 y
   +7.616 km/día y no se podía predecir nada; limpiando, va de 21 a 281.

   No se borra nada: la lectura queda marcada con su motivo y deja de contar.
   Si el juicio estuviera mal, está ahí para verlo. */
/* ── DATOS QUE FALTAN ──────────────────────────────────────────────────────
   Un dato que cuesta dos minutos por unidad no se rellena nunca, por muy rojo
   que se pinte el aviso. Con la ITV se vio: el sistema llevaba dos días
   sacando las 56 sin fecha y seguían las 56, porque rellenarlas era abrir
   cincuenta y seis fichas.

   El del aceite es el que más duele: el ritmo km/día ya se calcula bien para
   85 furgonetas, pero sin saber DESDE DÓNDE contar, ese ritmo no sirve de
   nada. Se sabe a qué velocidad va y no cuánto le queda. */
/* ── ESTADOS QUE NO CUADRAN ─────────────────────────────────────────────────
   Una furgoneta marcada «en taller» sin nada detrás es el agujero por donde se
   escapa la operación: está fuera de servicio, alguien lo sabe, y el sistema
   no. Aquí salen esos casos con lo que se puede hacer con cada uno.

   Lo que se puede corregir solo se corrige; lo demás se explica y espera a una
   persona. Que una furgoneta esté en taller sin orden PUEDE ser correcto —se
   llevó y no se abrió orden— y crear una por nuestra cuenta sería inventar un
   trabajo que nadie encargó. */
const CLASE = {
  SAFE_TO_AUTOCORRECT: { txt: 'se arregla solo', cls: 'bg-lime-500/15 text-lime-300 ring-lime-500/30' },
  NEEDS_REVIEW: { txt: 'lo mira una persona', cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/30' },
  HIGH_RISK: { txt: 'riesgo alto', cls: 'bg-red-500/15 text-red-300 ring-red-500/30' },
  UNKNOWN: { txt: 'sin clasificar', cls: 'bg-dark-800 text-dark-400 ring-dark-700' },
}

/* ── EL CENTRO ESCRITO DE VARIAS FORMAS ─────────────────────────────────────
   'OGA5' y 'AMZL OGA5 SANTIAGO XPT' son la misma nave, y para la base de datos
   son dos. Cuando eso pasa, cualquier lista filtrada por centro enseña la mitad
   de lo que hay y no falla nada: simplemente faltan filas.

   Salió el 30-08-2026 en el historial de mantenimiento — 5 de 9 registros
   invisibles— y en una orden de taller. */
function PanelCentros() {
  const [d, setD] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(() => {
    setCargando(true)
    getCheckerCentros()
      .then((r) => setD(r.data))
      .catch(() => setD(null))
      .finally(() => setCargando(false))
  }, [])
  useEffect(cargar, [cargar])

  const corregir = async () => {
    setCorrigiendo(true); setMsg(null)
    try {
      const r = await corregirCentros()
      setMsg(r.data.corregidos
        ? { txt: `${r.data.corregidos} registros unificados${r.data.verificado ? ' y comprobado' : ', pero quedan casos'}.` }
        : { txt: r.data.motivo || 'No había nada que unificar solo.' })
      cargar()
    } catch (e) {
      setMsg({ mal: true, txt: e?.response?.data?.detail || 'No se pudo.' })
    } finally { setCorrigiendo(false) }
  }

  if (cargando) {
    return (
      <div className="card flex items-center justify-center gap-2 p-10 text-dark-400">
        <Loader2 size={15} className="animate-spin" /> Comprobando cómo está escrito el centro…
      </div>
    )
  }
  if (!d?.hallazgos?.length) {
    return (
      <div className="card p-10 text-center text-[13px] text-dark-400">
        El centro está escrito igual en las {d?.colecciones_revisadas || 0} tablas que lo llevan.
      </div>
    )
  }

  const seguros = d.hallazgos.filter((h) => h.clase === 'SAFE_TO_AUTOCORRECT').length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[12.5px] text-dark-500">
          <span className="cifra text-dark-300">{d.total}</span> casos en{' '}
          <span className="cifra">{d.colecciones_revisadas}</span> tablas revisadas ·{' '}
          <span className="cifra text-lime-300">{seguros}</span> se unifican solos
        </span>
        {seguros > 0 && (
          <button onClick={corregir} disabled={corrigiendo}
            className="btn-primary ml-auto px-3 py-1.5 text-[12.5px] disabled:opacity-50">
            {corrigiendo ? 'Unificando…' : `Unificar los ${seguros} seguros`}
          </button>
        )}
      </div>

      {msg && <p className={`text-[12.5px] ${msg.mal ? 'text-red-300' : 'text-lime-300'}`}>{msg.txt}</p>}

      <div className="space-y-1.5">
        {d.hallazgos.map((h) => (
          <div key={`${h.coleccion}-${h.codigo}`} className="card px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="cifra font-semibold text-dark-100">{h.codigo}</span>
              <span className="text-[13px] text-dark-300">{h.que_pasa}</span>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${
                (CLASE[h.clase] || CLASE.UNKNOWN).cls}`}>
                {(CLASE[h.clase] || CLASE.UNKNOWN).txt}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
              {h.formas.map((f) => (
                <span key={f.valor} className="text-[12px] text-dark-500">
                  <span className="cifra text-dark-400">{f.docs}</span>
                  {' '}× «{f.valor}»
                </span>
              ))}
            </div>
            <p className="mt-1 text-[12px] text-dark-500">{h.impacto}</p>
            <p className="mt-0.5 text-[12px] text-brand-300">{h.correccion}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function PanelEstados() {
  const [d, setD] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(() => {
    setCargando(true)
    getCheckerEstados()
      .then((r) => setD(r.data))
      .catch(() => setD(null))
      .finally(() => setCargando(false))
  }, [])
  useEffect(cargar, [cargar])

  const corregir = async () => {
    setCorrigiendo(true); setMsg(null)
    try {
      const r = await corregirEstados({})
      setMsg(r.data.corregidos
        ? { txt: `${r.data.corregidos} corregidos${r.data.verificado ? ' y comprobado' : ', pero quedan casos'}.` }
        : { txt: r.data.motivo || 'No había nada que corregir solo.' })
      cargar()
    } catch (e) {
      setMsg({ mal: true, txt: e?.response?.data?.detail || 'No se pudo.' })
    } finally { setCorrigiendo(false) }
  }

  if (cargando) {
    return (
      <div className="card flex items-center justify-center gap-2 p-10 text-dark-400">
        <Loader2 size={15} className="animate-spin" /> Comprobando estados…
      </div>
    )
  }
  if (!d?.hallazgos?.length) {
    return (
      <div className="card p-10 text-center text-[13px] text-dark-400">
        Todos los estados cuadran con lo que hay detrás.
      </div>
    )
  }

  const seguros = d.por_clase?.SAFE_TO_AUTOCORRECT || 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[12.5px] text-dark-500">
          <span className="cifra text-dark-300">{d.total}</span> hallazgos ·{' '}
          <span className="cifra text-lime-300">{seguros}</span> se arreglan solos ·{' '}
          <span className="cifra text-amber-300">{d.por_clase?.NEEDS_REVIEW || 0}</span> necesitan a alguien
          {d.dias_furgoneta_parados > 0 && (
            <> · <span className="cifra text-orange-300">{d.dias_furgoneta_parados}</span> días-furgoneta parados</>
          )}
        </span>
        {seguros > 0 && (
          <button onClick={corregir} disabled={corrigiendo}
            className="btn-primary ml-auto px-3 py-1.5 text-[12.5px] disabled:opacity-50">
            {corrigiendo ? 'Corrigiendo…' : `Corregir los ${seguros} seguros`}
          </button>
        )}
      </div>

      {msg && <p className={`text-[12.5px] ${msg.mal ? 'text-red-300' : 'text-lime-300'}`}>{msg.txt}</p>}

      <div className="space-y-1.5">
        {d.hallazgos.map((h, i) => {
          const c = CLASE[h.clase] || CLASE.UNKNOWN
          return (
            <div key={`${h.vehicle_id}-${h.problema}-${i}`} className="card px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="cifra font-semibold text-dark-100">{h.matricula}</span>
                <span className="text-[13px] text-dark-300">{h.que_pasa}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${c.cls}`}>
                  {c.txt}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-dark-500">{h.impacto}</p>
              <p className="mt-0.5 text-[12px] text-brand-300">{h.correccion}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}


function PanelFaltan() {
  const [d, setD] = useState(null)
  const [campo, setCampo] = useState('oil_last_change_km')
  const [lista, setLista] = useState(null)
  const [borrador, setBorrador] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)

  const cargarResumen = useCallback(() => {
    getDatosQueFaltan().then((r) => setD(r.data)).catch(() => setD(null))
  }, [])
  useEffect(cargarResumen, [cargarResumen])

  const cargarCampo = useCallback((c) => {
    setLista(null); setBorrador({})
    getDatosQueFaltan(c).then((r) => setLista(r.data)).catch(() => setLista(null))
  }, [])
  useEffect(() => { if (campo) cargarCampo(campo) }, [campo, cargarCampo])

  const guardar = async () => {
    const valores = Object.entries(borrador).filter(([, v]) => v !== '' && v != null)
      .map(([vehicle_id, valor]) => ({ vehicle_id, valor }))
    if (!valores.length) return
    setGuardando(true); setMsg(null)
    try {
      const r = await rellenarDatosLote({ campo, valores })
      const err = r.data?.errores || []
      setMsg(err.length
        ? { mal: true, txt: `${r.data.guardadas} guardados. ${err.length} con problema: ${[...new Set(err.map((e) => e.error))].join(' · ')}` }
        : { txt: `${r.data.guardadas} guardados.` })
      // Solo se limpian los que entraron: los que fallaron se quedan escritos
      // para poder corregirlos sin volver a teclearlos.
      const bien = new Set((r.data?.detalle || []).map((x) => x.vehicle_id))
      setBorrador((b) => Object.fromEntries(Object.entries(b).filter(([k]) => !bien.has(k))))
      cargarCampo(campo); cargarResumen()
    } catch (e) {
      setMsg({ mal: true, txt: e?.response?.data?.detail || 'No se pudo guardar.' })
    } finally { setGuardando(false) }
  }

  if (!d) {
    return (
      <div className="card flex items-center justify-center gap-2 p-10 text-dark-400">
        <Loader2 size={15} className="animate-spin" /> Mirando qué falta…
      </div>
    )
  }

  const pendientes = Object.values(borrador).filter((v) => v !== '' && v != null).length
  const esFecha = lista?.tipo === 'fecha'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(d.resumen)
          .filter(([, n]) => n > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => (
            <button key={k} onClick={() => setCampo(k)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                campo === k ? 'bg-dark-700 text-dark-100' : 'bg-dark-800/60 text-dark-400 hover:text-dark-200'}`}>
              {d.campos[k]}
              <span className="cifra rounded-full bg-orange-500/20 px-1.5 text-[10px] text-orange-300">{n}</span>
            </button>
          ))}
      </div>

      {msg && <p className={`text-[12.5px] ${msg.mal ? 'text-red-300' : 'text-lime-300'}`}>{msg.txt}</p>}

      {!lista ? (
        <div className="card flex items-center justify-center gap-2 p-8 text-dark-400">
          <Loader2 size={14} className="animate-spin" /> Cargando…
        </div>
      ) : !lista.faltan?.length ? (
        <div className="card p-8 text-center text-[13px] text-dark-400">
          Todas las furgonetas activas tienen este dato.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <p className="border-b border-dark-800 px-3.5 py-2 text-[12.5px] text-dark-400">
            <span className="font-semibold text-dark-200">{d.campos[campo]}</span> ·{' '}
            <span className="cifra">{lista.faltan.length}</span> furgonetas sin este dato
            {campo === 'oil_last_change_km' && (
              <span className="ml-1 text-dark-500">
                — es el kilometraje que marcaba cuando se le hizo el último cambio, no el de ahora.
              </span>
            )}
          </p>
          <div className="max-h-[460px] divide-y divide-dark-800/60 overflow-y-auto">
            {lista.faltan.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3 px-3.5 py-1.5">
                <span className="cifra w-[86px] flex-none font-semibold text-dark-100">{v.matricula}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-dark-500">
                  {v.modelo}{v.center && ` · ${v.center}`}
                  {v.km != null && campo === 'oil_last_change_km' && (
                    <> · ahora marca <span className="cifra text-dark-400">{v.km.toLocaleString('es')}</span></>
                  )}
                </span>
                <input
                  type={esFecha ? 'date' : lista.tipo === 'km' ? 'number' : 'text'}
                  value={borrador[v.id] ?? ''}
                  onChange={(e) => setBorrador({ ...borrador, [v.id]: e.target.value })}
                  placeholder={lista.tipo === 'km' ? 'km' : ''}
                  className="input w-[150px] py-1 text-[12.5px]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {pendientes > 0 && (
        <div className="sticky bottom-3 flex items-center gap-3 rounded-lg border border-dark-700 bg-dark-900 px-3.5 py-2.5 shadow-lg shadow-black/40">
          <span className="text-[13px] text-dark-300">
            <span className="cifra font-semibold">{pendientes}</span> por guardar
          </span>
          <button onClick={() => setBorrador({})}
            className="text-[12px] text-dark-500 hover:text-dark-300">descartar</button>
          <button onClick={guardar} disabled={guardando}
            className="btn-primary ml-auto px-4 py-1.5 text-[13px] disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  )
}


function PanelOdometro() {
  const [d, setD] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [saneando, setSaneando] = useState(false)
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(() => {
    setCargando(true)
    getOdometroSospechosas()
      .then((r) => setD(r.data))
      .catch(() => setD(null))
      .finally(() => setCargando(false))
  }, [])
  useEffect(cargar, [cargar])

  const sanear = async (soloUno) => {
    setSaneando(true); setMsg(null)
    try {
      const r = await sanearOdometro(soloUno ? { vehiculos: [soloUno] } : {})
      setMsg({ txt: `${r.data.lecturas_descartadas} lecturas descartadas en ${r.data.vehiculos_tocados} furgonetas.` })
      cargar()
    } catch (e) {
      setMsg({ mal: true, txt: e?.response?.data?.detail || 'No se pudo.' })
    } finally { setSaneando(false) }
  }

  if (cargando) {
    return (
      <div className="card flex items-center justify-center gap-2 p-10 text-dark-400">
        <Loader2 size={15} className="animate-spin" /> Revisando el historial de kilómetros…
      </div>
    )
  }
  if (!d?.vehiculos?.length) {
    return (
      <div className="card p-10 text-center text-[13px] text-dark-400">
        Ninguna lectura de kilometraje se sale de lo posible.
        <span className="mt-1 block text-[12px] text-dark-600">
          Revisadas {d?.total_lecturas?.toLocaleString('es') || 0} lecturas.
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[12.5px] text-dark-500">
          <span className="cifra text-orange-300">{d.sospechosas}</span> lecturas imposibles
          de <span className="cifra">{d.total_lecturas.toLocaleString('es')}</span> ·{' '}
          <span className="cifra">{d.vehiculos.length}</span> furgonetas
          {d.con_km_actual_malo > 0 && (
            <> · <span className="cifra text-red-300">{d.con_km_actual_malo}</span> con el km de la ficha equivocado</>
          )}
        </span>
        <button onClick={() => sanear(null)} disabled={saneando}
          className="btn-primary ml-auto px-3 py-1.5 text-[12.5px] disabled:opacity-50">
          {saneando ? 'Limpiando…' : 'Descartar todas'}
        </button>
      </div>

      {msg && <p className={`text-[12.5px] ${msg.mal ? 'text-red-300' : 'text-lime-300'}`}>{msg.txt}</p>}

      <p className="max-w-[74ch] text-[12.5px] leading-relaxed text-dark-500">
        Los dos errores de siempre: un dígito de más o de menos, y meter el
        cuentakilómetros <span className="text-dark-300">parcial</span> en vez del total.
        No se borra nada — la lectura queda marcada y deja de contar, así que se puede
        revisar después.
      </p>

      {d.vehiculos.map((v) => (
        <div key={v.vehicle_id} className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-dark-800 px-3.5 py-2">
            <span className="cifra font-semibold text-dark-100">{v.matricula}</span>
            <span className="text-[12px] text-dark-500">
              ficha: <span className="cifra">{v.km_actual?.toLocaleString('es') || '—'}</span> km
              {v.km_bueno != null && v.km_bueno !== v.km_actual && (
                <> · debería ser <span className="cifra text-lime-300">{v.km_bueno.toLocaleString('es')}</span></>
              )}
            </span>
            {v.actual_es_malo && (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-red-300 ring-1 ring-inset ring-red-500/30">
                la ficha miente
              </span>
            )}
            <button onClick={() => sanear(v.vehicle_id)} disabled={saneando}
              className="ml-auto rounded-md border border-dark-700 px-2.5 py-1 text-[12px] text-dark-400 hover:text-dark-200 disabled:opacity-40">
              solo esta
            </button>
          </div>
          <div className="divide-y divide-dark-800/60">
            {v.lecturas.map((l) => (
              <div key={`${l.i}-${l.fecha}`} className="flex flex-wrap items-center gap-3 px-3.5 py-1.5">
                <span className="cifra w-[86px] flex-none text-[12px] text-dark-500">{l.fecha}</span>
                <span className="cifra w-[100px] flex-none text-right text-[13px] text-orange-300">
                  {typeof l.km === 'number' ? l.km.toLocaleString('es') : l.km}
                </span>
                <span className="w-[120px] flex-none text-[11.5px] text-dark-600">{l.origen}</span>
                <span className="min-w-0 flex-1 text-[12px] text-dark-500">{l.motivo}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}


function PanelDuplicados() {
  const [d, setD] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [fusionando, setFusionando] = useState('')
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(() => {
    setCargando(true)
    getVehiculosDuplicados()
      .then((r) => setD(r.data))
      .catch(() => setD({ duplicados: [] }))
      .finally(() => setCargando(false))
  }, [])
  useEffect(cargar, [cargar])

  const fusionar = async (grupo, conservar) => {
    const absorber = grupo.fichas.filter((f) => f.id !== conservar).map((f) => f.id)
    setFusionando(grupo.matricula); setMsg(null)
    try {
      const r = await fusionarVehiculos({ conservar, absorber })
      const n = Object.values(r.data?.movidos || {}).reduce((a, b) => a + b, 0)
      setMsg({ txt: `${grupo.matricula}: ${absorber.length} ficha${absorber.length > 1 ? 's' : ''} unida${absorber.length > 1 ? 's' : ''}, ${n} registros movidos.` })
      cargar()
    } catch (e) {
      setMsg({ mal: true, txt: e?.response?.data?.detail || 'No se pudo unir.' })
    } finally { setFusionando('') }
  }

  if (cargando) {
    return (
      <div className="card flex items-center justify-center gap-2 p-12 text-dark-400">
        <Loader2 size={16} className="animate-spin" /> Buscando matrículas repetidas…
      </div>
    )
  }
  if (!d?.duplicados?.length) {
    return (
      <div className="card p-10 text-center text-[13px] text-dark-400">
        Ninguna matrícula está dada de alta dos veces.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-dark-500">
        <span><span className="cifra text-dark-300">{d.total}</span> matrículas repetidas</span>
        <span><span className="cifra text-orange-300">{d.parten_historial}</span> con el historial partido</span>
        <span><span className="cifra text-dark-400">{d.fichas_de_mas}</span> fichas de más</span>
      </div>

      {msg && (
        <p className={`text-[12.5px] ${msg.mal ? 'text-red-300' : 'text-lime-300'}`}>{msg.txt}</p>
      )}

      <p className="max-w-[74ch] text-[12.5px] leading-relaxed text-dark-500">
        Al unirlas <span className="text-dark-300">no se borra nada</span>: la ficha absorbida
        queda marcada y se puede deshacer. Se mueven las inspecciones, los daños, las
        incidencias, las órdenes, los documentos y los slots del cuadrante. El kilometraje se
        queda con el mayor —un cuentakilómetros no baja— y lo que le falte a la que se conserva
        lo hereda de la otra.
      </p>

      {d.duplicados.map((g) => (
        <div key={g.matricula} className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-dark-800 px-3.5 py-2">
            <span className="cifra font-semibold text-dark-100">{g.matricula}</span>
            <span className="text-[12px] text-dark-500">
              {g.fichas.length} fichas · <span className="cifra">{g.total_datos}</span> registros
            </span>
            {g.parte_historial ? (
              <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-orange-300 ring-1 ring-inset ring-orange-500/30">
                historial partido
              </span>
            ) : (
              <span className="rounded-full bg-dark-800 px-2 py-0.5 text-[10.5px] text-dark-400">
                la otra ya está de baja
              </span>
            )}
          </div>
          <div className="divide-y divide-dark-800/60">
            {g.fichas.map((f, i) => (
              <div key={f.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2">
                <span className="cifra w-[100px] flex-none text-[12px] text-dark-500">{f.id.slice(0, 8)}</span>
                <span className={`w-[62px] flex-none text-[12px] ${
                  f.status === 'active' ? 'text-lime-400'
                    : f.status === 'deleted' ? 'text-dark-600' : 'text-amber-300'}`}>
                  {f.status}
                </span>
                <span className="min-w-0 flex-1 text-[12px] text-dark-400">
                  alta <span className="cifra">{f.alta || '—'}</span>
                  {f.km != null && <> · <span className="cifra">{f.km.toLocaleString('es')}</span> km</>}
                  {f.vin && <> · VIN</>}
                </span>
                <span className="cifra text-[12px] text-dark-300">
                  {f.total_datos > 0
                    ? Object.entries(f.datos).filter(([, n]) => n > 0)
                        .map(([c, n]) => `${c.slice(0, 6)} ${n}`).join(' · ')
                    : <span className="text-dark-600">sin datos</span>}
                </span>
                {i === 0 ? (
                  <button onClick={() => fusionar(g, f.id)} disabled={fusionando === g.matricula}
                    className="btn-primary px-2.5 py-1 text-[12px] disabled:opacity-40"
                    title="Une el resto de fichas en esta">
                    {fusionando === g.matricula ? 'Uniendo…' : 'Unir en esta'}
                  </button>
                ) : (
                  <button onClick={() => fusionar(g, f.id)} disabled={fusionando === g.matricula}
                    className="rounded-md border border-dark-700 px-2.5 py-1 text-[12px] text-dark-400 hover:text-dark-200 disabled:opacity-40"
                    title="Conservar esta en su lugar">
                    conservar esta
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}


export default function Vehiculos() {
  const { center, centers } = useOutletContext()
  const { t, lang } = useT()
  const [vehicles, setVehicles] = useState(null)
  const [lastInsp, setLastInsp] = useState({})
  const [spare, setSpare] = useState({})          // vehicle_id → última declaración
  const [soloSinRueda, setSoloSinRueda] = useState(false)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  // Las de baja están devueltas al renting: no se les hace la ITV, no se les
  // cambia el aceite y no se asignan. Viven aquí, aparte, por si vuelven.
  const [verBaja, setVerBaja] = useState(false)
  const [nBaja, setNBaja] = useState(0)
  const [verDocs, setVerDocs] = useState(false)
  const [verExpo, setVerExpo] = useState(false)
  const [verDup, setVerDup] = useState(false)
  const [nDup, setNDup] = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()

  // Deep-link desde la paleta de comandos: /panel/vehiculos?open=<id>
  useEffect(() => {
    const openId = searchParams.get('open')
    if (openId && vehicles) {
      const v = vehicles.find((x) => x.id === openId)
      if (v) setSel(v)
      setSearchParams({}, { replace: true })
    }
  }, [vehicles]) // eslint-disable-line

  function load() {
    setVehicles(null); setErr('')
    getVehicles(center, verBaja ? 'baja' : '')
      .then(r => setVehicles(lista(r.data))).catch(() => setErr('No se pudieron cargar los vehículos.'))
    getLastInspections().then(r => setLastInsp(r.data || {})).catch(() => {})
    // Si falla, {} = no sabemos de ninguna. El KPI dirá 0, que es la verdad
    // ("no consta ninguna declarada ausente"), nunca un número inventado.
    getSpareWheels().then(r => setSpare(r.data || {})).catch(() => setSpare({}))
    // Cuántas hay de baja se pide siempre, aunque se esté viendo la flota
    // activa: es el número que va en la pestaña.
    getVehicles(center, 'baja').then(r => setNBaja(lista(r.data).length)).catch(() => setNBaja(0))
    // El contador de repetidas va en la pestana: si no se ve el numero,
    // nadie entra a mirar y el historial sigue partido.
    getVehiculosDuplicados().then(r => setNDup(r.data?.parten_historial || 0)).catch(() => setNDup(0))
  }
  useEffect(load, [center, verBaja])

  const list = useMemo(() => (vehicles || []).filter(v => {
    if (soloSinRueda && spare[v.id]?.estado !== 'no') return false
    if (!q) return true
    const s = q.toLowerCase()
    return [v.license_plate, v.brand, v.model, v.center, v.vin].some(x => (x || '').toLowerCase().includes(s))
  }), [vehicles, q, soloSinRueda, spare])

  const kpis = useMemo(() => {
    const vs = vehicles || []
    return {
      total: vs.length,
      taller: vs.filter(v => v.status === 'taller').length,
      itv: vs.filter(v => { const d = daysTo(v.itv_date); return d != null && d <= 30 }).length,
      sinInsp: vs.filter(v => !lastInsp[v.id]).length,
      // SOLO las declaradas ausentes. Las que nunca se preguntaron no entran:
      // no saber si la lleva no es lo mismo que saber que no la lleva.
      sinRueda: vs.filter(v => spare[v.id]?.estado === 'no').length,
    }
  }, [vehicles, lastInsp, spare])

  if (err) return <p className="text-red-400">{err}</p>

  return (
    <div>
      <header className="rise mb-8">
        {center && center !== 'Todos' && (
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-brand-400/80">{center}</p>
        )}
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-[clamp(28px,3.4vw,42px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">
            {t('veh.title')}{vehicles && <span className="text-dark-600"> · {list.length}</span>}
          </h1>
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                className="w-64 rounded-xl border border-white/[0.07] bg-white/[0.02] py-2.5 pl-10 pr-3 text-[13.5px] text-dark-50 placeholder:text-dark-600 transition-all duration-300 hover:border-white/[0.12] focus:border-brand-500/50 focus:bg-white/[0.045] focus:outline-none focus:ring-[3px] focus:ring-brand-500/15"
                placeholder={`${t('ui.search')} ${t('veh.plate')}, VIN…`} value={q} onChange={e => setQ(e.target.value)}
              />
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="group relative flex items-center gap-1.5 overflow-hidden rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-lg shadow-brand-500/25 transition-all duration-300 [text-shadow:0_1px_1px_rgba(0,0,0,0.15)] hover:-translate-y-px hover:shadow-xl hover:shadow-brand-500/30 hover:brightness-110 active:translate-y-0 active:scale-[0.98]"
            >
              <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
              <Plus size={15} /> Añadir vehículo
            </button>
          </div>
        </div>
      </header>

      {addOpen && (
        <AddVehicleModal
          centers={centers?.filter(c => c !== 'Todos') || []}
          onSaved={load}
          onClose={() => setAddOpen(false)}
        />
      )}

      {/* ── Flota activa / de baja ────────────────────────────────────────
          Separadas a propósito: una furgoneta devuelta no puede engordar los
          contadores ni salir en las listas de mantenimiento, pero tampoco se
          borra, porque a veces vuelve. */}
      <div className="rise mb-5 flex gap-1 rounded-lg bg-dark-900 p-1 ring-1 ring-dark-700 w-fit">
        {[
          { id: 'activas', label: t('veh.tab.activas') },
          { id: 'baja', label: t('veh.tab.baja'), n: nBaja },
          // La documentación es su propia pestaña y no cuelga de ninguna
          // furgoneta: ver el comentario de PanelDocumentos.
          { id: 'expo', label: 'Lo que acumulan' },
          { id: 'dup', label: 'Revisar datos', n: nDup },
          { id: 'docs', label: t('veh.tab.docs') },
        ].map((x) => {
          const activa = x.id === 'docs' ? verDocs : x.id === 'expo' ? verExpo
            : x.id === 'dup' ? verDup
            : (!verDocs && !verExpo && !verDup && verBaja === (x.id === 'baja'))
          return (
            <button key={x.id}
              onClick={() => { setVerDocs(x.id === 'docs'); setVerExpo(x.id === 'expo')
                setVerDup(x.id === 'dup')
                if (!['docs', 'expo', 'dup'].includes(x.id)) setVerBaja(x.id === 'baja') }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activa ? 'bg-brand-500/20 text-brand-300' : 'text-dark-400 hover:text-dark-200'}`}>
              {x.label}
              {x.n > 0 && <span className="rounded-full bg-dark-800 px-1.5 text-[10px] tabular-nums text-dark-400">{x.n}</span>}
            </button>
          )
        })}
      </div>

      {verDocs && <PanelDocumentos />}
      {verDup && (
        <div className="space-y-6">
          {/* Dos revisiones distintas del mismo sitio: fichas repetidas y
              kilometrajes imposibles. Las dos ensucian TODO lo que se calcula
              encima, asi que van juntas y no escondidas en pantallas aparte. */}
          <div>
            <h2 className="mb-2 text-[15px] font-semibold text-dark-100">Matrículas repetidas</h2>
            <PanelDuplicados />
          </div>
          <div>
            <h2 className="mb-2 text-[15px] font-semibold text-dark-100">Kilometrajes imposibles</h2>
            <PanelOdometro />
          </div>
          <div>
            <h2 className="mb-2 text-[15px] font-semibold text-dark-100">Estados que no cuadran</h2>
            <PanelEstados />
          </div>
          <div>
            <h2 className="mb-2 text-[15px] font-semibold text-dark-100">El centro escrito de varias formas</h2>
            <PanelCentros />
          </div>
          <div>
            <h2 className="mb-2 text-[15px] font-semibold text-dark-100">Datos que faltan</h2>
            <PanelFaltan />
          </div>
        </div>
      )}
      {verExpo && <PanelExposicion center={center} onAbrir={(id) => {
        const v = list.find((x) => x.id === id); if (v) setSel(v)
      }} />}

      {!verDocs && verBaja && (
        <p className="mb-4 text-[12px] leading-relaxed text-dark-500">{t('veh.baja.exp')}</p>
      )}

      {vehicles && !verBaja && !verDocs && (
        <div className="rise mb-6 flex flex-wrap items-baseline gap-x-7 gap-y-2 border-y border-white/[0.05] py-3.5" style={{ animationDelay: '60ms' }}>
          {[
            { val: kpis.total,   label: t('veh.all'),        color: 'text-dark-50' },
            { val: kpis.taller,  label: t('veh.workshop'),   color: 'text-amber-300' },
            { val: kpis.itv,     label: 'ITV ≤ 30 días',     color: 'text-amber-300' },
            { val: kpis.sinInsp, label: t('veh.never.insp'), color: 'text-red-300' },
            // Clicable: filtra la lista. Solo se ofrece si hay alguna, para no
            // dejar un filtro que no lleva a ningún sitio.
            { val: kpis.sinRueda, label: t('vh.rueda.kpi'), color: 'text-red-300',
              onClick: kpis.sinRueda > 0 ? () => setSoloSinRueda((s) => !s) : null,
              on: soloSinRueda },
          ].map(({ val, label, color, onClick, on }, i) => (
            <div
              key={label}
              onClick={onClick || undefined}
              className={`flex items-baseline gap-2 ${onClick ? 'cursor-pointer rounded-lg px-2 -mx-2 transition hover:bg-white/[0.04]' : ''} ${on ? 'bg-white/[0.06] rounded-lg px-2 -mx-2' : ''}`}
            >
              <span className={`text-[19px] font-semibold tabular-nums ${(val > 0 || i === 0) ? color : 'text-dark-600'}`}>{val}</span>
              <span className={`text-[12.5px] ${on ? 'text-dark-200' : 'text-dark-500'}`}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {verDocs ? null : !vehicles ? (
        <PageSkeleton kpis={4} rows={9} />
      ) : list.length === 0 ? (
        verBaja ? (
          <div className="card flex flex-col items-center gap-2 p-10 text-center text-dark-400">
            <Truck size={28} /> {t('veh.baja.ninguna')}
          </div>
        ) : vehicles.length === 0 ? (
          <GuidedEmpty
            emoji="🚐"
            title={t('empty.veh.title')}
            hint={t('empty.veh.hint')}
            actionLabel={`+ ${t('empty.veh.add')}`}
            onAction={() => setAddOpen(true)}
            secondary={{ to: '/panel/importaciones', label: t('empty.veh.import') }}
          />
        ) : (
          <div className="card flex flex-col items-center gap-2 p-10 text-center text-dark-400">
            <Truck size={28} /> {t('veh.empty')} {center !== 'Todos' && `en ${center}`}.
          </div>
        )
      ) : (
        <div className="rise" style={{ animationDelay: '120ms' }}>
          {/* TABLA, no lista de fichas a dos lineas. Con 129 furgonetas cada
              ficha de 60 px son 7.700 px de scroll, y los datos que se comparan
              —km, ITV, ultima revision— quedaban a alturas distintas en cada
              una. En columna se leen en vertical y cabe el triple por pantalla.
              La cabecera se queda pegada arriba: sin eso, a la fila 40 ya no
              sabes que columna estas mirando. */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead className="sticky top-0 z-10 bg-dark-900">
                  <tr className="border-b border-dark-800">
                    <th className="w-6 px-2 py-2"></th>
                    <th className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-dark-500">Matrícula</th>
                    <th className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-dark-500">Modelo</th>
                    <th className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-dark-500">Centro</th>
                    <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-dark-500">Km</th>
                    <th className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-dark-500">Revisión</th>
                    <th className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-dark-500">ITV</th>
                    <th className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-dark-500">Estado</th>
                    <th className="w-6 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(v => {
                    const st = STATUS_MAP[v.status] || STATUS_MAP.baja
                    const dot = lastInspDot(lastInsp[v.id])
                    return (
                      <tr key={v.id} onClick={() => setSel(v)}
                        className="float-row group cursor-pointer border-b border-dark-800/50 last:border-0">
                        <td className="px-2 py-1.5">
                          <span className={`block h-2 w-2 rounded-full ${st.dot}`} title={t(st.labelKey)} />
                        </td>
                        <td className="cifra px-2 py-1.5 font-semibold tracking-wider text-dark-50">
                          {v.license_plate}
                          {v.vin && <QrCode size={9} className="ml-1.5 inline text-dark-700" title="Tiene VIN" />}
                        </td>
                        <td className="max-w-[190px] truncate px-2 py-1.5 text-dark-400">
                          {[v.brand, v.model].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-dark-400">{v.center || '—'}</td>
                        <td className="cifra px-2 py-1.5 text-right text-dark-300">
                          {v.mileage != null ? v.mileage.toLocaleString('es') : '—'}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${dot.cls}`} />
                          <span className="text-[12px] text-dark-400">{dot.txt}</span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">{itvBadge(v.itv_date)}</td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          {v.status !== 'active'
                            ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.badge}`}>{t(st.labelKey)}</span>
                            : <span className="text-[12px] text-dark-600">activa</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          <ChevronRight size={14} className="text-dark-700 transition-transform group-hover:translate-x-0.5 group-hover:text-dark-400" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {sel && <VehicleDetail vehicle={sel} onClose={() => setSel(null)} onSaved={load} />}
    </div>
  )
}
