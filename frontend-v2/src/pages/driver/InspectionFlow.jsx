import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, Camera, Check, ChevronLeft, ChevronRight,
  Gauge, Loader2, LogOut, Send, Truck, ArrowRight, Shield, Bell,
} from 'lucide-react'
import {
  getAssignedVehicle, readOdometer, updateMileage, uploadInspection, validatePhoto,
} from '../../services/api'
import { compressImage } from '../../lib/compressImage'
import { useToast } from '../../lib/toast'
import { pushSupported, isPushEnabled, enablePush } from '../../lib/push'

const PHOTO_SLOTS = [
  { id: 'frontal',      label: 'Frontal',            icon: '⬆', required: true },
  { id: 'trasera',      label: 'Trasera',             icon: '⬇', required: true },
  { id: 'lateral_izq',  label: 'Lateral izquierdo',  icon: '◀', required: true },
  { id: 'lateral_der',  label: 'Lateral derecho',     icon: '▶', required: true },
]

const CHECKLIST = [
  { id: 'neumaticos', label: 'Neumáticos',      emoji: '🛞' },
  { id: 'luces',      label: 'Luces',           emoji: '💡' },
  { id: 'chapa',      label: 'Chapa/Carrocería', emoji: '🔧' },
  { id: 'puertas',    label: 'Puertas',         emoji: '🚪' },
  { id: 'espejos',    label: 'Espejos',         emoji: '🪞' },
  { id: 'interior',   label: 'Interior',        emoji: '🪑' },
  { id: 'combustible',label: 'Combustible',     emoji: '⛽' },
  { id: 'limpieza',   label: 'Limpieza',        emoji: '🧹' },
]

const CHECK_STATES = [
  { id: 'ok',     label: 'OK',     cls: 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400' },
  { id: 'regular',label: 'Regular',cls: 'bg-amber-500/20 border-amber-500/60 text-amber-400' },
  { id: 'malo',   label: 'Malo',   cls: 'bg-red-500/20 border-red-500/60 text-red-400' },
  { id: 'danado', label: '⚠ Daño', cls: 'bg-red-500/20 border-red-500/60 text-red-400' },
]

const STEPS = [
  { label: 'Vehículo', short: '1' },
  { label: 'Fotos',    short: '2' },
  { label: 'Checklist',short: '3' },
  { label: 'Enviar',   short: '4' },
]

function StepBar({ step }) {
  return (
    <div className="flex items-center gap-0 px-4 py-4">
      {STEPS.map((s, i) => (
        <div key={s.label} className="flex flex-1 items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
              i < step  ? 'bg-brand-500 text-white' :
              i === step ? 'bg-brand-500 text-white ring-4 ring-brand-500/20' :
                           'bg-dark-800 text-dark-500'
            }`}>
              {i < step ? <Check size={13} /> : s.short}
            </div>
            <span className={`text-[9px] font-medium ${i === step ? 'text-brand-400' : 'text-dark-600'}`}>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`mx-1 mb-4 h-px flex-1 transition-all ${i < step ? 'bg-brand-500' : 'bg-dark-800'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function InspectionFlow({ driver, vehicles, onComplete, onLogout }) {
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [vehicleId, setVehicleId] = useState('')
  const [photos, setPhotos] = useState({})
  const [photoErrors, setPhotoErrors] = useState({})
  const [validating, setValidating] = useState(null)
  const [odoPhoto, setOdoPhoto] = useState(null)
  const [odoKm, setOdoKm] = useState(null)
  const [odoError, setOdoError] = useState('')
  const [odoBusy, setOdoBusy] = useState(false)
  const [checklist, setChecklist] = useState({})
  const [checklistPhotos, setChecklistPhotos] = useState({})
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [assigned, setAssigned] = useState(null)
  const [pushOn, setPushOn] = useState(true)      // true de inicio = no mostrar botón hasta saber
  const [pushBusy, setPushBusy] = useState(false)
  const fileRefs = useRef({})

  // ¿Este móvil ya tiene los avisos activados?
  useEffect(() => { isPushEnabled().then(setPushOn).catch(() => setPushOn(false)) }, [])

  async function activateDriverPush() {
    if (pushBusy) return
    setPushBusy(true)
    try {
      const r = await enablePush()
      if (r === 'ok') { setPushOn(true); toast.success('🔔 Avisos activados en este móvil') }
      else if (r === 'denied') toast.error('Notificaciones bloqueadas: actívalas en ajustes del navegador')
      else toast.error('No se pudieron activar los avisos')
    } finally { setPushBusy(false) }
  }
  const odoRef = useRef(null)
  const checklistRefs = useRef({})

  // Cache de blob URLs para evitar memory leaks: un URL por blob, revocado al desmontar
  const blobUrlCache = useRef(new Map())
  const getBlobUrl = (blob) => {
    if (!blob) return null
    if (!blobUrlCache.current.has(blob)) {
      blobUrlCache.current.set(blob, URL.createObjectURL(blob))
    }
    return blobUrlCache.current.get(blob)
  }
  useEffect(() => {
    return () => { blobUrlCache.current.forEach((url) => URL.revokeObjectURL(url)) }
  }, [])

  useEffect(() => {
    getAssignedVehicle()
      .then((r) => r.data?.assigned && setAssigned(r.data))
      .catch(() => {})
  }, [])

  const handlePhoto = async (slotId, e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const blob = await compressImage(file, 1200, 0.7)
    if (!vehicleId) {
      setPhotos((p) => ({ ...p, [slotId]: blob }))
      return
    }
    setValidating(slotId)
    try {
      const r = await validatePhoto(vehicleId, slotId, blob)
      if (r.data?.valid === false) {
        setPhotoErrors((errs) => ({ ...errs, [slotId]: r.data.reason || 'Foto no válida. Repítela.' }))
        toast.error(`❌ ${r.data.reason || 'Foto rechazada'}`)
        setValidating(null)
        return
      }
      setPhotoErrors((errs) => { const next = { ...errs }; delete next[slotId]; return next })
      setPhotos((p) => ({ ...p, [slotId]: blob }))
      toast.success(r.data?.checked ? '✅ Foto verificada' : '📷 Foto capturada')
    } catch {
      setPhotos((p) => ({ ...p, [slotId]: blob }))
    }
    setValidating(null)
  }

  const handleOdoPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const blob = await compressImage(file, 1280, 0.8)
    setOdoBusy(true); setOdoError('')
    try {
      const r = await readOdometer(vehicleId, blob)
      if (r.data?.success && r.data.km) {
        setOdoPhoto(blob); setOdoKm(r.data.km)
        if (r.data.warning) setOdoError(`⚠️ ${r.data.warning}`)
        toast.success(`✅ ${r.data.km.toLocaleString()} km detectados`)
      } else {
        setOdoError('No se pudo leer el cuentakilómetros. Acércate más, enfoca bien y vuelve a intentar.')
        toast.error('❌ Cuentakilómetros no legible')
      }
    } catch {
      setOdoPhoto(blob); setOdoKm(null)
      setOdoError('Foto guardada — lectura automática no disponible ahora mismo.')
    }
    setOdoBusy(false)
  }

  const handleChecklistPhoto = async (itemId, e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const blob = await compressImage(file, 1000, 0.65)
    setChecklistPhotos((p) => ({ ...p, [itemId]: blob }))
  }

  const allRequiredPhotos = PHOTO_SLOTS.filter((s) => s.required).every((s) => photos[s.id]) && !!odoPhoto
  const missingDamagePhotos = Object.entries(checklist).filter(
    ([id, st]) => (st === 'malo' || st === 'danado') && !checklistPhotos[id],
  )

  const submit = async () => {
    if (!vehicleId) return toast.error('Selecciona un vehículo')
    if (!allRequiredPhotos) return toast.error('Faltan fotos obligatorias')
    if (missingDamagePhotos.length > 0) return toast.error('Faltan fotos de los daños marcados')
    setSending(true)
    // Evitar que un cierre accidental de la pestaña pierda la inspección en curso
    const guard = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    try {
      const fd = new FormData()
      fd.append('vehicle_id', vehicleId)
      fd.append('driver_id', driver.id)
      fd.append('notes', JSON.stringify({
        checklist, notes, driver_name: driver.name, center: driver.center,
        odometer_km: odoKm,
        checklist_photo_items: Object.keys(checklistPhotos).map((id) => CHECKLIST.find((c) => c.id === id)?.label || id),
      }))
      PHOTO_SLOTS.forEach((slot, i) => {
        if (photos[slot.id]) fd.append('files', photos[slot.id], `angle_${i}_${slot.id}.jpg`)
      })
      if (odoPhoto) fd.append('files', odoPhoto, 'odometro.jpg')
      Object.entries(checklistPhotos).forEach(([itemId, blob]) =>
        fd.append('files', blob, `checklist_${itemId}.jpg`))

      // Subida con reintentos: los conductores suben desde garajes con cobertura
      // mala. Red caída o 5xx → hasta 3 intentos; errores 4xx no se reintentan.
      let r = null
      for (let attempt = 1; ; attempt++) {
        try {
          if (!navigator.onLine) {
            toast.error('Sin conexión — esperando a recuperarla…')
            await new Promise((resolve) => {
              const onBack = () => { window.removeEventListener('online', onBack); resolve() }
              window.addEventListener('online', onBack)
              setTimeout(() => { window.removeEventListener('online', onBack); resolve() }, 60000)
            })
          }
          r = await uploadInspection(fd)
          break
        } catch (err) {
          const status = err?.response?.status
          if ((status >= 400 && status < 500) || attempt >= 3) throw err
          toast.error(`Fallo de conexión — reintentando (${attempt}/3)…`)
          await new Promise((resolve) => setTimeout(resolve, attempt * 3000))
        }
      }
      if (odoKm > 0) updateMileage(vehicleId, odoKm).catch(() => {})
      onComplete(r.data)
    } catch (err) {
      const detail = err?.response?.data?.detail
      toast.error(`Error: ${typeof detail === 'string' ? detail : err.message}`)
    } finally {
      window.removeEventListener('beforeunload', guard)
      setSending(false)
    }
  }

  const otherVehicles = vehicles.filter((v) => !assigned?.vehicle || v.id !== assigned.vehicle.id)
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) || assigned?.vehicle
  const photosOk = Object.keys(photos).length
  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="min-h-[100dvh] bg-dark-950">
      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b border-dark-800/60 bg-dark-950/95 backdrop-blur-md"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 12px))' }}
      >
        <div className="flex items-center gap-3 px-4 pb-3">
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} className="btn-ghost p-1.5">
              <ChevronLeft size={18} />
            </button>
          )}
          <div className="flex-1">
            {driver.photo_url && (
              <div className="mb-0.5 flex items-center gap-2">
                <img src={driver.photo_url} className="h-6 w-6 rounded-full border border-brand-500/40 object-cover" alt="" />
                <span className="text-xs font-medium text-dark-300">{driver.name}</span>
              </div>
            )}
            {pushSupported() && !pushOn && (
              <button onClick={activateDriverPush} disabled={pushBusy}
                className="mt-1 flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-2.5 py-1 text-[11px] font-semibold text-brand-300 disabled:opacity-50">
                {pushBusy ? <Loader2 size={11} className="animate-spin" /> : <Bell size={11} />}
                Activar avisos en este móvil
              </button>
            )}
            {!driver.photo_url && (
              <p className="text-xs font-semibold text-dark-300">{driver.name}</p>
            )}
            <p className="text-[10px] capitalize text-dark-600">{today} · {driver.center}</p>
          </div>
          <button onClick={onLogout} className="btn-ghost p-1.5 text-dark-500" title="Cerrar sesión">
            <LogOut size={15} />
          </button>
        </div>
        <StepBar step={step} />
      </header>

      <div className="mx-auto max-w-lg px-4 pt-2" style={{ paddingBottom: 'max(7rem, calc(5rem + env(safe-area-inset-bottom)))' }}>

        {/* ── PASO 0: Selección de vehículo ── */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-dark-50">Inspección diaria</h2>
              <p className="text-xs text-dark-500">Selecciona tu furgoneta asignada para hoy</p>
            </div>

            {assigned?.vehicle && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-500">Tu asignación de hoy</p>
                <button
                  onClick={() => { setVehicleId(assigned.vehicle.id); setStep(1) }}
                  className="group flex w-full items-center gap-4 rounded-2xl border-2 border-brand-500/40 bg-gradient-to-r from-brand-500/10 to-transparent p-4 text-left transition-all hover:border-brand-500/70"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500/20">
                    <Truck size={22} className="text-brand-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-mono text-xl font-black tracking-widest text-dark-50">
                      {assigned.vehicle.license_plate}
                    </p>
                    <p className="text-xs text-dark-400">
                      {[assigned.vehicle.brand, assigned.vehicle.model].filter(Boolean).join(' ')}
                    </p>
                    {assigned.already_inspected && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                        <Check size={10} /> Ya inspeccionada hoy
                      </span>
                    )}
                  </div>
                  <ArrowRight size={18} className="text-brand-400 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </button>
              </div>
            )}

            {otherVehicles.length > 0 && (
              <div>
                {assigned?.vehicle && <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-dark-600">Otras furgonetas</p>}
                <div className="space-y-2">
                  {otherVehicles.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => { setVehicleId(v.id); setStep(1) }}
                      className="card-hover flex w-full items-center gap-3 p-3 text-left"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-dark-800">
                        <Truck size={16} className="text-dark-400" />
                      </div>
                      <div className="flex-1">
                        <p className="font-mono text-sm font-bold text-dark-100">{v.license_plate}</p>
                        <p className="text-xs text-dark-500">{[v.brand, v.model].filter(Boolean).join(' ')}</p>
                      </div>
                      <ChevronRight size={15} className="text-dark-600" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {vehicles.length === 0 && !assigned?.vehicle && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dark-800 bg-dark-900/50 py-16 text-center">
                <Truck size={32} className="text-dark-700" />
                <p className="text-sm text-dark-500">No hay vehículos disponibles en tu centro</p>
                <p className="text-xs text-dark-600">Contacta con tu responsable de flota</p>
              </div>
            )}

            {/* Incentivos */}
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4">
              <span className="text-lg">🏆</span>
              <div>
                <p className="text-xs font-bold text-amber-400">Próximamente: incentivos para conductores</p>
                <p className="mt-0.5 text-[11px] text-dark-500">
                  Cada mes premiaremos a quienes mantengan su furgoneta en perfecto estado y con inspecciones al día.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── PASO 1: Fotografías ── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <div className="mb-0.5 flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-brand-400">{selectedVehicle?.license_plate}</span>
                {photosOk > 0 && <span className="text-[10px] text-dark-500">{photosOk + (odoPhoto ? 1 : 0)} / 5 fotos</span>}
              </div>
              <h2 className="text-lg font-bold text-dark-50">Fotografías obligatorias</h2>
              <p className="text-xs text-dark-500">La IA verifica que cada foto sea correcta y nítida</p>
            </div>

            {/* 4 ángulos + cuentakilómetros */}
            <div className="grid grid-cols-2 gap-3">
              {PHOTO_SLOTS.map((slot) => (
                <div key={slot.id}>
                  <input
                    ref={(el) => (fileRefs.current[slot.id] = el)}
                    type="file" accept="image/*" capture="environment"
                    onChange={(e) => handlePhoto(slot.id, e)}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileRefs.current[slot.id]?.click()}
                    disabled={validating === slot.id}
                    className={`relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border-2 border-dashed transition-all ${
                      photos[slot.id]     ? 'border-emerald-500/50 bg-emerald-500/5' :
                      photoErrors[slot.id]? 'border-red-500/50 bg-red-500/5' :
                                            'border-dark-700 hover:border-brand-500/40 hover:bg-brand-500/5'
                    }`}
                  >
                    {validating === slot.id ? (
                      <>
                        <Loader2 size={22} className="animate-spin text-brand-400" />
                        <span className="text-[10px] font-semibold text-brand-400">Verificando IA…</span>
                      </>
                    ) : photos[slot.id] ? (
                      <>
                        <img src={getBlobUrl(photos[slot.id])} className="absolute inset-0 h-full w-full object-cover" alt={slot.label} />
                        <div className="absolute inset-0 bg-black/20" />
                        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 shadow-lg">
                          <Check size={13} className="text-white" />
                        </div>
                        <span className="absolute bottom-2 left-0 right-0 text-center text-[10px] font-bold text-white drop-shadow">{slot.label}</span>
                      </>
                    ) : (
                      <>
                        <Camera size={22} className={photoErrors[slot.id] ? 'text-red-400' : 'text-dark-500'} />
                        <span className="text-[11px] font-semibold text-dark-400">{slot.label}</span>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-brand-500">Obligatorio</span>
                      </>
                    )}
                  </button>
                  {photoErrors[slot.id] && (
                    <p className="mt-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[10px] leading-snug text-red-300">
                      ❌ {photoErrors[slot.id]}
                    </p>
                  )}
                </div>
              ))}

              {/* Cuentakilómetros */}
              <div className="col-span-2">
                <input ref={odoRef} type="file" accept="image/*" capture="environment" onChange={handleOdoPhoto} className="hidden" />
                <button
                  onClick={() => odoRef.current?.click()}
                  disabled={odoBusy}
                  className={`relative flex h-28 w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border-2 border-dashed transition-all ${
                    odoPhoto   ? 'border-emerald-500/50 bg-emerald-500/5' :
                    odoError   ? 'border-amber-500/50 bg-amber-500/5' :
                                 'border-brand-500/30 bg-brand-500/5 hover:border-brand-500/60'
                  }`}
                >
                  {odoBusy ? (
                    <>
                      <Loader2 size={22} className="animate-spin text-brand-400" />
                      <span className="text-[11px] font-semibold text-brand-400">La IA está leyendo los km…</span>
                    </>
                  ) : odoPhoto ? (
                    <>
                      <img src={getBlobUrl(odoPhoto)} className="absolute inset-0 h-full w-full object-cover" alt="Cuentakilómetros" />
                      <div className="absolute inset-0 bg-black/40" />
                      <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500">
                        <Check size={13} className="text-white" />
                      </div>
                      {odoKm && (
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-dark-900/90 px-4 py-1 text-xs font-black text-emerald-300 ring-1 ring-emerald-500/30">
                          {odoKm.toLocaleString()} km
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <Gauge size={24} className="text-brand-400" />
                      <span className="text-xs font-semibold text-dark-300">Foto del cuentakilómetros</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-brand-500">Obligatorio · la IA lee los km automáticamente</span>
                    </>
                  )}
                </button>
                {odoError && (
                  <p className="mt-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] leading-snug text-amber-300">
                    {odoError}
                  </p>
                )}
              </div>
            </div>

            {allRequiredPhotos ? (
              <button onClick={() => setStep(2)} className="btn-primary flex w-full items-center justify-center gap-2 py-3.5 text-sm">
                Continuar al checklist <ChevronRight size={16} />
              </button>
            ) : (
              <div className="rounded-xl border border-dark-800 bg-dark-900/50 p-3 text-center text-xs text-dark-500">
                Necesitas las 4 fotos del vehículo + la del cuentakilómetros para continuar
              </div>
            )}
          </div>
        )}

        {/* ── PASO 2: Checklist ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-dark-50">Estado del vehículo</h2>
              <p className="text-xs text-dark-500">Revisa cada punto. Si hay daño, saca una foto obligatoriamente.</p>
            </div>

            <div className="space-y-2">
              {CHECKLIST.map((item) => {
                const state = checklist[item.id]
                const hasPhoto = !!checklistPhotos[item.id]
                const needsPhoto = (state === 'malo' || state === 'danado') && !hasPhoto
                return (
                  <div key={item.id} className={`rounded-2xl border p-4 transition-all ${
                    needsPhoto ? 'border-red-500/40 bg-red-500/5' :
                    state === 'ok' ? 'border-emerald-500/20 bg-dark-900' :
                    state ? 'border-amber-500/20 bg-dark-900' :
                            'border-dark-800 bg-dark-900'
                  }`}>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-dark-100">
                        {item.emoji} {item.label}
                      </span>
                      <div>
                        <input
                          ref={(el) => (checklistRefs.current[item.id] = el)}
                          type="file" accept="image/*" capture="environment"
                          onChange={(e) => handleChecklistPhoto(item.id, e)}
                          className="hidden"
                        />
                        <button
                          onClick={() => checklistRefs.current[item.id]?.click()}
                          className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            hasPhoto
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                              : needsPhoto
                                ? 'border-red-500/60 bg-red-500/15 text-red-400'
                                : 'border-dark-700 text-dark-400 hover:border-brand-500/40 hover:text-brand-400'
                          }`}
                        >
                          <Camera size={11} />
                          {hasPhoto ? 'Foto ✓' : needsPhoto ? 'Foto ← OBLIGATORIA' : 'Foto'}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {CHECK_STATES.map((st) => (
                        <button
                          key={st.id}
                          onClick={() => setChecklist((c) => ({ ...c, [item.id]: st.id }))}
                          className={`rounded-xl border py-3 text-[11px] font-semibold transition-all ${
                            state === st.id ? st.cls : 'border-dark-700 text-dark-500 hover:border-dark-500 hover:text-dark-300'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                    {needsPhoto && (
                      <p className="mt-2.5 flex items-center gap-1.5 rounded-xl border border-red-500/25 bg-red-500/8 p-2 text-[11px] text-red-300">
                        <AlertTriangle size={12} className="shrink-0" />
                        Foto obligatoria cuando hay daño — pulsa el botón "Foto" para hacer una
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            <div>
              <label className="label">Observaciones adicionales</label>
              <textarea
                className="input min-h-[80px] resize-none"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Escribe aquí cualquier comentario relevante sobre el estado del vehículo…"
              />
            </div>

            <button
              onClick={() => setStep(3)}
              disabled={missingDamagePhotos.length > 0}
              className="btn-primary flex w-full items-center justify-center gap-2 py-3.5 text-sm disabled:opacity-60"
            >
              {missingDamagePhotos.length > 0
                ? `Faltan ${missingDamagePhotos.length} foto(s) de daños`
                : <>Revisar y enviar <ChevronRight size={16} /></>}
            </button>
          </div>
        )}

        {/* ── PASO 3: Resumen + Enviar ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-dark-50">Confirmar y enviar</h2>
              <p className="text-xs text-dark-500">Revisa el resumen antes de enviar la inspección</p>
            </div>

            {/* Resumen */}
            <div className="overflow-hidden rounded-2xl border border-dark-800 bg-dark-900">
              <div className="border-b border-dark-800 bg-gradient-to-r from-dark-800/50 to-transparent px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-base font-black text-dark-50">{selectedVehicle?.license_plate}</span>
                  <span className="badge-orange">{driver.center}</span>
                </div>
                <p className="text-xs text-dark-500">{driver.name}</p>
              </div>
              <div className="divide-y divide-dark-800/60 px-4">
                <div className="flex justify-between py-2.5 text-sm">
                  <span className="text-dark-400">Fotos enviadas</span>
                  <span className="font-semibold text-dark-100">
                    {Object.keys(photos).length + (odoPhoto ? 1 : 0) + Object.keys(checklistPhotos).length}
                  </span>
                </div>
                <div className="flex justify-between py-2.5 text-sm">
                  <span className="text-dark-400">Kilómetros</span>
                  <span className={`font-bold ${odoKm ? 'text-emerald-400' : 'text-dark-500'}`}>
                    {odoKm ? `${odoKm.toLocaleString()} km ✓` : '— no detectados'}
                  </span>
                </div>
                <div className="flex justify-between py-2.5 text-sm">
                  <span className="text-dark-400">Ítems revisados</span>
                  <span className="font-semibold text-dark-100">{Object.keys(checklist).length} / {CHECKLIST.length}</span>
                </div>
                {Object.keys(checklist).length > 0 && (
                  <div className="py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(checklist).map(([id, state]) => (
                        <span key={id} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          state === 'ok'  ? 'bg-emerald-500/15 text-emerald-400' :
                          state === 'regular' ? 'bg-amber-500/15 text-amber-400' :
                                                'bg-red-500/15 text-red-400'
                        }`}>
                          {CHECKLIST.find(c => c.id === id)?.emoji} {CHECKLIST.find(c => c.id === id)?.label}
                          {checklistPhotos[id] ? ' 📷' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Miniaturas */}
            <div className="grid grid-cols-5 gap-1.5">
              {[...Object.entries(photos), odoPhoto ? ['odo', odoPhoto] : null, ...Object.entries(checklistPhotos)]
                .filter(Boolean)
                .map(([id, blob]) => (
                  <img
                    key={id}
                    src={getBlobUrl(blob)}
                    className={`aspect-square rounded-xl object-cover ${id === 'odo' ? 'ring-2 ring-brand-500/50' : ''}`}
                    alt={id}
                  />
                ))}
            </div>

            <button
              onClick={submit}
              disabled={sending}
              className="btn-primary flex w-full items-center justify-center gap-2 py-4 text-base font-bold"
            >
              {sending ? (
                <><Loader2 size={18} className="animate-spin" /> Analizando con IA…</>
              ) : (
                <><Shield size={18} /> Enviar inspección</>
              )}
            </button>

            {sending && (
              <p className="text-center text-xs text-dark-500">
                La IA está analizando las fotos. Puede tardar unos segundos…
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
