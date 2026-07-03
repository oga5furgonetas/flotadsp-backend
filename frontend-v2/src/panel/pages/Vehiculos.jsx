import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { useT, LANG_LOCALE } from '../../i18n'
import { useEscape } from '../../lib/useEscape'
import { PageSkeleton } from '../components/Skeleton'
import QRCode from 'qrcode'
import {
  Loader2, Search, Truck, X, Save, Download, QrCode,
  MapPin, Gauge, Calendar, Package, Shield, ChevronRight,
  User, Camera, ZoomIn, Pencil, Check, Maximize2, ArrowLeft,
  Fuel, Palette, Hash, Building2, Clock, AlertTriangle, Wrench,
  Droplets, CircleDot, Disc, FileText, Trash2, Upload, ExternalLink,
  FileCheck, FileBadge, FileImage, File, Plus,
} from 'lucide-react'
import {
  getVehicles, getLastInspections, getVehicleDriver, getVehicleInspections, updateVehicle, deleteVehicle, createIncident, getIncidents,
  getVehicleMaintenance, registerOilChange, registerMaintenanceChange,
  getVehicleDocuments, uploadVehicleDocument, deleteVehicleDocument, createVehicle,
} from '../api'

const STATUS_MAP = {
  active: { label: 'Disponible',  labelKey: 'veh.available', dot: 'bg-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30' },
  taller: { label: 'En taller',   labelKey: 'veh.workshop',  dot: 'bg-orange-400',  badge: 'bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/30' },
  baja:   { label: 'Baja',        labelKey: 'veh.inactive',  dot: 'bg-slate-500',   badge: 'bg-slate-700/60 text-slate-400 ring-1 ring-slate-600/40' },
}

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
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 transition"
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
              className="min-w-0 flex-1 rounded-lg border border-blue-500/50 bg-dark-700 px-2.5 py-1.5 text-sm text-dark-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
            <button onClick={confirm} className="rounded-lg bg-blue-600 p-1.5 text-white hover:bg-blue-500 transition"><Check size={12} /></button>
            <button onClick={cancel}  className="rounded-lg bg-dark-700 p-1.5 text-dark-400 hover:text-dark-100 transition"><X size={12} /></button>
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
          className="mt-0.5 shrink-0 rounded-lg p-1 text-dark-600 opacity-0 transition hover:bg-dark-700 hover:text-blue-400 group-hover:opacity-100"
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
        <button onClick={onCancel} className="absolute right-4 top-4 rounded-lg p-1.5 text-dark-500 hover:bg-dark-800 hover:text-white transition"><X size={15} /></button>

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
            className="flex-1 rounded-xl bg-orange-600 py-2.5 text-sm font-bold text-white transition hover:bg-orange-500 disabled:opacity-40"
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
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
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
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-dark-500 hover:bg-dark-800 hover:text-white transition"><X size={15} /></button>
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
          <button onClick={submit} disabled={!km || busy} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500 disabled:opacity-40">
            {busy ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Vehicle detail panel ── */
function VehicleDetail({ vehicle: initVehicle, onClose, onSaved }) {
  const { t } = useT()
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
  const [maintModal, setMaintModal] = useState(null) // 'oil' | 'ruedas' | 'pastillas' | null
  const [docs, setDocs] = useState(null)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const docInputRef = useRef()
  const [pendingDocType, setPendingDocType] = useState(null)
  const [activeTab, setActiveTab] = useState('info') // 'info' | 'inspecciones' | 'docs'

  const vinOrPlate = vehicle.vin || vehicle.license_plate || ''
  const st = STATUS_MAP[vehicle.status] || STATUS_MAP.baja

  useEffect(() => {
    let cancelled = false
    setDriver(undefined); setInsps(null); setVehicleIncidents(null)
    getVehicleDriver(vehicle.id).then(r => { if (!cancelled) setDriver(r.data?.driver || null) }).catch(() => { if (!cancelled) setDriver(null) })
    getVehicleInspections(vehicle.id).then(r => { if (!cancelled) setInsps(r.data || []) }).catch(() => { if (!cancelled) setInsps([]) })
    getIncidents({ vehicle_id: vehicle.id }).then(r => { if (!cancelled) setVehicleIncidents(Array.isArray(r.data) ? r.data : []) }).catch(() => { if (!cancelled) setVehicleIncidents([]) })
    getVehicleMaintenance(vehicle.id).then(r => { if (!cancelled) setMaintenance(r.data || null) }).catch(() => { if (!cancelled) setMaintenance(null) })
    getVehicleDocuments(vehicle.id).then(r => { if (!cancelled) setDocs(Array.isArray(r.data) ? r.data : []) }).catch(() => { if (!cancelled) setDocs([]) })
    return () => { cancelled = true }
  }, [vehicle.id])

  useEffect(() => {
    if (!vinOrPlate) return
    QRCode.toDataURL(vinOrPlate, {
      width: 400, margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    }).then(setQrDataUrl).catch(() => {})
  }, [vinOrPlate])

  function showToast(msg, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
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
          className="relative flex h-full w-full max-w-lg flex-col overflow-hidden bg-dark-950 shadow-2xl ring-1 ring-white/5"
          onClick={e => e.stopPropagation()}
          style={{ background: 'linear-gradient(160deg, #0d1526 0%, #0a0f1e 100%)' }}
        >
          {/* Toast */}
          {toast && (
            <div className={`absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-xl transition ${toast.ok ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30' : 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'}`}>
              {toast.msg}
            </div>
          )}

          {/* ── HEADER HERO ── */}
          <div className="relative overflow-hidden px-6 pb-6 pt-5" style={{ background: 'linear-gradient(135deg, #1a2744 0%, #0f1a33 100%)' }}>
            {/* Decoración de fondo */}
            <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-blue-500/5" />
            <div className="pointer-events-none absolute -bottom-4 left-24 h-24 w-24 rounded-full bg-indigo-500/5" />

            <div className="relative flex items-start justify-between">
              <div className="flex-1">
                <div className="mb-3 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${st.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                    {t(st.labelKey)}
                  </span>
                  {itvBadge(vehicle.itv_date)}
                </div>
                <h2 className="font-mono text-3xl font-black tracking-[0.12em] text-white drop-shadow">
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
                  className="group relative flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-xl bg-white p-1.5 shadow-lg ring-2 ring-white/20 transition hover:ring-blue-400/60"
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
            <div className="mt-4 grid grid-cols-3 gap-2">
              <StatChip icon={<Gauge size={12} />} val={vehicle.mileage != null ? `${vehicle.mileage.toLocaleString('es')} km` : '—'} label="Kilómetros" />
              <StatChip icon={<Package size={12} />} val={vehicle.bags_remaining ?? '—'} label="Bolsas" />
              <StatChip icon={<Camera size={12} />} val={insps ? insps.length : '…'} label="Inspecciones" />
            </div>
          </div>

          {/* ── TABS ── */}
          <div className="flex shrink-0 border-b border-white/5">
            {[
              { id: 'info',         label: 'Info',          count: null },
              { id: 'inspecciones', label: 'Inspecciones',  count: insps?.length ?? null },
              { id: 'docs',         label: 'Documentos',    count: docs?.length ?? null },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition border-b-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-dark-500 hover:text-dark-300'
                }`}
              >
                {tab.label}
                {tab.count != null && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === tab.id ? 'bg-blue-500/20 text-blue-300' : 'bg-dark-800 text-dark-500'}`}>
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
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition ${vehicle.status === key ? m.badge + ' cursor-default' : 'bg-dark-700 text-dark-500 hover:bg-dark-600 hover:text-dark-200'}`}
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
                    <div className="h-20 w-20 overflow-hidden rounded-xl bg-white p-1 shadow-md ring-1 ring-white/20 transition group-hover:ring-blue-400/50">
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
                        className="flex items-center gap-1.5 rounded-lg border border-dark-600 px-3 py-1.5 text-[11px] font-medium text-dark-300 hover:border-blue-500/40 hover:text-blue-400 transition"
                      >
                        <Maximize2 size={10} /> Ampliar
                      </button>
                      <a
                        href={qrDataUrl || '#'}
                        download={`QR_${vehicle.license_plate || vehicle.id}.png`}
                        onClick={e => !qrDataUrl && e.preventDefault()}
                        className={`flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-500 transition ${!qrDataUrl ? 'opacity-40 pointer-events-none' : ''}`}
                      >
                        <Download size={10} /> QR
                      </a>
                      <button
                        onClick={downloadCard}
                        disabled={!qrDataUrl}
                        className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-semibold text-indigo-300 hover:bg-indigo-500/20 transition disabled:opacity-40"
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
                      className="rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-500 disabled:opacity-50"
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

            {/* ══ TAB: INSPECCIONES ══ */}
            {activeTab === 'inspecciones' && (
              <div className="px-3 py-3">
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

            {/* ══ TAB: DOCUMENTOS ══ */}
            {activeTab === 'docs' && (
              <div className="px-3 py-3">
                {/* Input oculto para subir */}
                <input ref={docInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleDocUpload} />

                {/* Tipos de documentos */}
                <div className="space-y-4">
                  {[
                    { type: 'seguro',        label: 'Seguro',           Icon: Shield },
                    { type: 'itv',           label: 'Certificado ITV',  Icon: FileCheck },
                    { type: 'ficha_tecnica', label: 'Ficha técnica',    Icon: FileBadge },
                    { type: 'contrato',      label: 'Contrato renting', Icon: FileText },
                    { type: 'otro',          label: 'Otro documento',   Icon: File },
                  ].map(({ type, label, Icon }) => {
                    const typeDocs = (docs || []).filter(d => d.doc_type === type)
                    return (
                      <div key={type}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-dark-500">
                            <Icon size={11} /> {label}
                          </div>
                          <button
                            onClick={() => triggerUpload(type)}
                            disabled={uploadingDoc}
                            className="flex items-center gap-1 rounded-lg border border-dark-700 px-2 py-0.5 text-[10px] font-medium text-dark-400 hover:border-blue-500/40 hover:text-blue-400 transition disabled:opacity-40"
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
                                <FileImage size={12} className="shrink-0 text-blue-400/70" />
                                <span className="flex-1 truncate text-[11px] text-dark-300" title={doc.name}>{doc.name}</span>
                                <span className="shrink-0 text-[10px] text-dark-600">{(doc.uploaded_at || '').slice(0, 10)}</span>
                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded p-1 text-dark-500 hover:text-blue-400 transition" title="Abrir">
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
              <Loader2 size={24} className="animate-spin text-blue-400" />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function StatChip({ icon, val, label }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-white/5 py-2.5 px-2 text-center">
      <div className="mb-0.5 text-slate-500">{icon}</div>
      <div className="text-sm font-bold text-slate-200">{val}</div>
      <div className="text-[9px] text-slate-600">{label}</div>
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
        style={{ background: 'linear-gradient(160deg,#0f1829 0%,#0a0f1e 100%)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15">
              <Truck size={17} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-dark-50">Añadir vehículo</h2>
              <p className="text-[11px] text-dark-500">Nuevo vehículo en la flota</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-dark-500 hover:bg-dark-800 hover:text-white transition">
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
export default function Vehiculos() {
  const { center, centers } = useOutletContext()
  const { t, lang } = useT()
  const [vehicles, setVehicles] = useState(null)
  const [lastInsp, setLastInsp] = useState({})
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
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
    getVehicles(center).then(r => setVehicles(r.data || [])).catch(() => setErr('No se pudieron cargar los vehículos.'))
    getLastInspections().then(r => setLastInsp(r.data || {})).catch(() => {})
  }
  useEffect(load, [center])

  const list = useMemo(() => (vehicles || []).filter(v => {
    if (!q) return true
    const s = q.toLowerCase()
    return [v.license_plate, v.brand, v.model, v.center, v.vin].some(x => (x || '').toLowerCase().includes(s))
  }), [vehicles, q])

  const kpis = useMemo(() => {
    const vs = vehicles || []
    return {
      total: vs.length,
      taller: vs.filter(v => v.status === 'taller').length,
      itv: vs.filter(v => { const d = daysTo(v.itv_date); return d != null && d <= 30 }).length,
      sinInsp: vs.filter(v => !lastInsp[v.id]).length,
    }
  }, [vehicles, lastInsp])

  if (err) return <p className="text-red-400">{err}</p>

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('veh.title')} {vehicles && <span className="text-dark-500">· {list.length}</span>}</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input className="input w-56 pl-9" placeholder={`${t('ui.search')} ${t('veh.plate')}, VIN…`} value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Plus size={14} />
            Añadir vehículo
          </button>
        </div>
      </div>

      {addOpen && (
        <AddVehicleModal
          centers={centers?.filter(c => c !== 'Todos') || []}
          onSaved={load}
          onClose={() => setAddOpen(false)}
        />
      )}

      {vehicles && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { val: kpis.total,   label: center !== 'Todos' ? `${t('veh.all')} · ${center}` : t('veh.all'), color: 'text-slate-100' },
            { val: kpis.taller,  label: t('veh.workshop'),   color: 'text-orange-400' },
            { val: kpis.itv,     label: 'ITV ≤ 30 días',    color: 'text-amber-400'  },
            { val: kpis.sinInsp, label: t('veh.never.insp'), color: 'text-red-400'   },
          ].map(({ val, label, color }) => (
            <div key={label} className="card p-4">
              <div className={`text-2xl font-extrabold ${color}`}>{val}</div>
              <div className="mt-0.5 text-xs text-dark-400">{label}</div>
            </div>
          ))}
        </div>
      )}

      {!vehicles ? (
        <PageSkeleton kpis={4} rows={9} />
      ) : list.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center text-dark-400">
          <Truck size={28} /> {t('veh.empty')} {center !== 'Todos' && `en ${center}`}.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-800 text-left text-xs uppercase tracking-wide text-dark-500">
                  <th className="px-4 py-2.5">{t('veh.plate')}</th>
                  <th className="px-4 py-2.5">{t('ui.vehicle')}</th>
                  <th className="px-4 py-2.5">{t('ui.center')}</th>
                  <th className="px-4 py-2.5">{t('ui.status')}</th>
                  <th className="px-4 py-2.5">{t('veh.km')}</th>
                  <th className="px-4 py-2.5">{t('veh.last.insp')}</th>
                  <th className="px-4 py-2.5">{t('veh.next.itv')}</th>
                  <th className="px-4 py-2.5 text-center">QR</th>
                </tr>
              </thead>
              <tbody>
                {list.map(v => {
                  const st = STATUS_MAP[v.status] || STATUS_MAP.baja
                  const dot = lastInspDot(lastInsp[v.id])
                  return (
                    <tr key={v.id} onClick={() => setSel(v)} className="cursor-pointer border-b border-dark-800/60 hover:bg-dark-800/40 transition">
                      <td className="px-4 py-2.5 font-mono font-semibold tracking-wider">{v.license_plate}</td>
                      <td className="px-4 py-2.5 text-dark-300">{[v.brand, v.model].filter(Boolean).join(' ') || '—'}</td>
                      <td className="px-4 py-2.5 text-dark-400">{v.center || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {t(st.labelKey)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-dark-400">{v.mileage != null ? `${v.mileage.toLocaleString('es')} km` : '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5 text-xs text-dark-400">
                          <span className={`h-2 w-2 rounded-full ${dot.cls}`} /> {dot.txt}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">{itvBadge(v.itv_date)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {v.vin
                          ? <QrCode size={13} className="mx-auto text-blue-400/70" />
                          : <span className="text-dark-700">—</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sel && <VehicleDetail vehicle={sel} onClose={() => setSel(null)} onSaved={load} />}
    </div>
  )
}
