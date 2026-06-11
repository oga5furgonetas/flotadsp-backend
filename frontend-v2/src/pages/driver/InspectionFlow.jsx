import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight,
  Gauge, Loader2, LogOut, Send, Truck,
} from 'lucide-react'
import {
  getAssignedVehicle, readOdometer, updateMileage, uploadInspection, validatePhoto,
} from '../../services/api'
import { compressImage } from '../../lib/compressImage'
import { useToast } from '../../lib/toast'

const PHOTO_SLOTS = [
  { id: 'frontal', label: 'Frontal', required: true },
  { id: 'trasera', label: 'Trasera', required: true },
  { id: 'lateral_izq', label: 'Lateral izquierdo', required: true },
  { id: 'lateral_der', label: 'Lateral derecho', required: true },
]

const CHECKLIST = [
  { id: 'neumaticos', label: 'Neumáticos' },
  { id: 'luces', label: 'Luces' },
  { id: 'chapa', label: 'Chapa/Carrocería' },
  { id: 'puertas', label: 'Puertas' },
  { id: 'espejos', label: 'Espejos' },
  { id: 'interior', label: 'Interior' },
  { id: 'combustible', label: 'Combustible' },
  { id: 'limpieza', label: 'Limpieza' },
]

const CHECK_STATES = [
  { id: 'ok', label: '✓ OK', cls: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' },
  { id: 'regular', label: '~ Regular', cls: 'bg-amber-500/20 border-amber-500/50 text-amber-400' },
  { id: 'malo', label: '✗ Malo', cls: 'bg-red-500/20 border-red-500/50 text-red-400' },
  { id: 'danado', label: '⚠ Daño', cls: 'bg-red-500/20 border-red-500/50 text-red-400' },
]

const STEPS = ['Vehículo', 'Fotos', 'Checklist', 'Enviar']

export default function InspectionFlow({ driver, vehicles, onComplete, onLogout }) {
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [vehicleId, setVehicleId] = useState('')
  const [photos, setPhotos] = useState({})          // slotId → Blob
  const [photoErrors, setPhotoErrors] = useState({}) // slotId → motivo de rechazo
  const [validating, setValidating] = useState(null) // slotId en validación
  const [checklist, setChecklist] = useState({})
  const [checklistPhotos, setChecklistPhotos] = useState({})
  const [notes, setNotes] = useState('')
  const [km, setKm] = useState('')
  const [odoStatus, setOdoStatus] = useState('')
  const [sending, setSending] = useState(false)
  const [assigned, setAssigned] = useState(null)
  const fileRefs = useRef({})
  const odoRef = useRef(null)

  useEffect(() => {
    getAssignedVehicle()
      .then((r) => r.data?.assigned && setAssigned(r.data))
      .catch(() => {})
  }, [])

  /* ── Captura + validación IA de las fotos obligatorias ── */
  const handlePhoto = async (slotId, e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const blob = await compressImage(file, 1200, 0.7)

    if (!vehicleId) {
      setPhotos((p) => ({ ...p, [slotId]: blob }))
      toast.success(`Foto ${slotId} capturada`)
      return
    }
    setValidating(slotId)
    try {
      const r = await validatePhoto(vehicleId, slotId, blob)
      if (r.data?.valid === false) {
        const reason = r.data.reason || 'Foto no válida. Repítela.'
        setPhotoErrors((errs) => ({ ...errs, [slotId]: reason }))
        toast.error(`❌ ${reason}`)
        setValidating(null)
        return
      }
      setPhotoErrors((errs) => {
        const next = { ...errs }
        delete next[slotId]
        return next
      })
      setPhotos((p) => ({ ...p, [slotId]: blob }))
      toast.success(r.data?.checked ? '✅ Foto verificada y aceptada' : `Foto ${slotId} capturada`)
    } catch {
      // Fail-open: si la validación no responde, la foto se acepta
      setPhotos((p) => ({ ...p, [slotId]: blob }))
      toast.success(`Foto ${slotId} capturada`)
    }
    setValidating(null)
  }

  const handleChecklistPhoto = async (itemId, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const blob = await compressImage(file, 800, 0.6)
    setChecklistPhotos((p) => ({ ...p, [itemId]: blob }))
  }

  const handleOdometerPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !vehicleId) return
    setOdoStatus('📷 Leyendo cuentakilómetros…')
    try {
      const blob = await compressImage(file, 1280, 0.8)
      const r = await readOdometer(vehicleId, blob)
      if (r.data?.success && r.data.km) {
        setKm(String(r.data.km))
        setOdoStatus(
          r.data.warning
            ? `⚠️ ${r.data.warning}`
            : `✅ Leído: ${r.data.km.toLocaleString()} km — revisa que sea correcto`,
        )
        toast.success(`Km leídos: ${r.data.km.toLocaleString()}`)
      } else {
        setOdoStatus('❌ No se pudo leer. Escríbelo a mano.')
        toast.error('No se pudo leer el cuentakilómetros')
      }
    } catch {
      setOdoStatus('❌ Error leyendo. Escríbelo a mano.')
    }
  }

  /* ── Envío ── */
  const allRequiredPhotos = PHOTO_SLOTS.filter((s) => s.required).every((s) => photos[s.id])
  const missingDamagePhotos = Object.entries(checklist).filter(
    ([id, st]) => (st === 'malo' || st === 'danado') && !checklistPhotos[id],
  )

  const submit = async () => {
    if (!vehicleId) return toast.error('Selecciona un vehículo')
    if (!allRequiredPhotos) return toast.error('Faltan fotos obligatorias')
    if (missingDamagePhotos.length > 0)
      return toast.error('Faltan fotos del checklist para ítems con daños')
    setSending(true)
    try {
      const fd = new FormData()
      fd.append('vehicle_id', vehicleId)
      fd.append('driver_id', driver.id)
      fd.append('notes', JSON.stringify({ checklist, notes, driver_name: driver.name, center: driver.center }))
      // Orden FIJO de zonas — el backend y la IA dependen de él
      PHOTO_SLOTS.forEach((slot, i) => {
        if (photos[slot.id]) fd.append('files', photos[slot.id], `angle_${i}_${slot.id}.jpg`)
      })
      Object.values(checklistPhotos).forEach((blob, i) =>
        fd.append('files', blob, `checklist_${i}.jpg`),
      )
      const r = await uploadInspection(fd)
      // Km en paralelo, no bloquea el resultado
      const kmVal = parseInt(km, 10)
      if (kmVal > 0) updateMileage(vehicleId, kmVal).catch(() => {})

      if (r.data.analysis_status === 'ok' || r.data.analysis_status === 'pending') {
        toast.success('Inspección enviada correctamente. Las fotos se han guardado.')
      } else {
        toast.error(`⚠️ ${r.data.message}`)
      }
      onComplete(r.data)
    } catch (err) {
      const detail = err?.response?.data?.detail
      toast.error(`Error enviando: ${typeof detail === 'string' ? detail : err.message}`)
    }
    setSending(false)
  }

  /* ── Selección de vehículo (asignada primero) ── */
  const otherVehicles = vehicles.filter((v) => !assigned?.vehicle || v.id !== assigned.vehicle.id)
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) || assigned?.vehicle

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Header */}
      <header
        className="sticky top-0 z-40 flex items-center gap-3 border-b border-dark-800 bg-dark-950/90 px-4 pb-3 backdrop-blur-md"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 12px))' }}
      >
        {step > 0 && (
          <button onClick={() => setStep((s) => s - 1)} className="btn-ghost p-1">
            <ChevronLeft size={18} />
          </button>
        )}
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-dark-100">Inspección diaria</h2>
          <p className="text-xs text-dark-500">{driver.name} · {driver.center}</p>
        </div>
        <button onClick={onLogout} className="btn-ghost p-1.5 text-dark-400">
          <LogOut size={16} />
        </button>
      </header>

      {/* Progreso */}
      <div className="flex gap-1.5 px-4 py-3">
        {STEPS.map((label, i) => (
          <div key={label} className="flex-1">
            <div className={`h-1 rounded-full transition-all ${i <= step ? 'bg-brand-500' : 'bg-dark-800'}`} />
            <p className="mt-1 text-center text-[10px] text-dark-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="px-4 pb-24">
        {/* ── Paso 0: vehículo ── */}
        {step === 0 && (
          <div className="animate-fadeIn space-y-3">
            <h3 className="mt-2 font-semibold text-dark-200">
              {assigned?.vehicle ? 'Tu asignación de hoy' : 'Selecciona tu vehículo'}
            </h3>

            {/* Banner incentivos */}
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 p-4"
                 style={{ background: 'linear-gradient(135deg, rgba(34,197,94,.10), rgba(249,115,22,.08))' }}>
              <span className="text-[22px] leading-none">🎁</span>
              <div>
                <p className="text-sm font-semibold text-emerald-400">Próximamente: incentivos para conductores</p>
                <p className="mt-1 text-xs text-dark-400">
                  Premiaremos cada mes a quienes mantengan su furgoneta sin golpes, limpia y con las
                  inspecciones al día. ¡Tu cuidado cuenta desde hoy!
                </p>
              </div>
            </div>

            {/* Furgoneta asignada */}
            {assigned?.vehicle && (
              <button
                onClick={() => { setVehicleId(assigned.vehicle.id); setStep(1) }}
                className="flex w-full items-center gap-4 rounded-xl border-2 p-4 text-left transition-all"
                style={{
                  borderColor: 'rgba(249,115,22,.65)',
                  background: 'rgba(249,115,22,.10)',
                  boxShadow: '0 0 18px rgba(249,115,22,.18)',
                }}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-500/20">
                  <Truck size={20} className="text-brand-400" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-brand-400">
                    🚐 Tu furgoneta de hoy
                  </p>
                  <p className="font-mono text-base font-semibold text-dark-100">
                    {assigned.vehicle.license_plate}
                  </p>
                  <p className="text-xs text-dark-400">
                    {assigned.vehicle.brand} {assigned.vehicle.model}
                    {assigned.already_inspected ? ' · ✅ ya inspeccionada hoy' : ''}
                  </p>
                </div>
                <ChevronRight size={18} className="text-brand-400" />
              </button>
            )}

            {assigned?.vehicle && otherVehicles.length > 0 && (
              <p className="pt-2 text-xs text-dark-500">Otras furgonetas:</p>
            )}

            {otherVehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => { setVehicleId(v.id); setStep(1) }}
                className={`card-hover flex w-full items-center gap-4 p-4 text-left ${vehicleId === v.id ? 'border-brand-500' : ''}`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
                  <Truck size={18} className="text-brand-400" />
                </div>
                <div className="flex-1">
                  <p className="font-mono font-medium text-dark-100">{v.license_plate}</p>
                  <p className="text-xs text-dark-400">{v.brand} {v.model}</p>
                </div>
                <ChevronRight size={16} className="text-dark-500" />
              </button>
            ))}

            {vehicles.length === 0 && !assigned?.vehicle && (
              <div className="py-10 text-center text-sm text-dark-500">
                No hay vehículos asignados a tu centro
              </div>
            )}
          </div>
        )}

        {/* ── Paso 1: fotos ── */}
        {step === 1 && (
          <div className="animate-fadeIn space-y-4">
            <h3 className="mt-2 font-semibold text-dark-200">Fotografías obligatorias</h3>
            <p className="text-xs text-dark-400">Usa la cámara para capturar cada ángulo del vehículo</p>
            <div className="grid grid-cols-2 gap-3">
              {PHOTO_SLOTS.map((slot) => (
                <div key={slot.id} className="relative">
                  <input
                    ref={(el) => (fileRefs.current[slot.id] = el)}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handlePhoto(slot.id, e)}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileRefs.current[slot.id]?.click()}
                    disabled={validating === slot.id}
                    className={`flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-all ${
                      photos[slot.id]
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : photoErrors[slot.id]
                          ? 'border-red-500/60 bg-red-500/5'
                          : 'border-dark-700 hover:border-brand-500/50'
                    }`}
                  >
                    {validating === slot.id ? (
                      <>
                        <Loader2 size={24} className="animate-spin text-brand-400" />
                        <span className="text-xs text-brand-400">Comprobando…</span>
                      </>
                    ) : photos[slot.id] ? (
                      <div className="relative h-full w-full">
                        <img
                          src={URL.createObjectURL(photos[slot.id])}
                          className="h-full w-full rounded-lg object-cover"
                          alt={slot.label}
                        />
                        <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                          <Check size={12} className="text-white" />
                        </div>
                      </div>
                    ) : (
                      <>
                        <Camera size={24} className="text-dark-500" />
                        <span className="text-xs text-dark-400">{slot.label}</span>
                        {slot.required && <span className="text-[10px] text-brand-400">Obligatorio</span>}
                      </>
                    )}
                  </button>
                  {photoErrors[slot.id] && (
                    <div className="mt-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] leading-snug text-red-300">
                      ❌ {photoErrors[slot.id]}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {allRequiredPhotos ? (
              <button onClick={() => setStep(2)} className="btn-primary flex w-full items-center justify-center gap-2 py-4">
                Continuar <ChevronRight size={16} />
              </button>
            ) : (
              <p className="text-center text-xs text-amber-400">
                Captura las 4 fotos obligatorias para continuar
              </p>
            )}
          </div>
        )}

        {/* ── Paso 2: checklist ── */}
        {step === 2 && (
          <div className="animate-fadeIn space-y-4">
            <h3 className="mt-2 font-semibold text-dark-200">Checklist del vehículo</h3>
            {CHECKLIST.map((item) => (
              <div key={item.id} className="card space-y-2 p-4">
                <span className="text-sm font-medium text-dark-200">{item.label}</span>
                <div className="flex gap-2">
                  {CHECK_STATES.map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setChecklist((c) => ({ ...c, [item.id]: st.id }))}
                      className={`flex-1 rounded-lg border py-2 text-xs transition-all ${
                        checklist[item.id] === st.id
                          ? st.cls
                          : 'border-dark-700 text-dark-400 hover:border-dark-500'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
                {(checklist[item.id] === 'malo' || checklist[item.id] === 'danado') && (
                  <div className="mt-2 rounded-lg border border-red-800/30 bg-red-500/5 p-3">
                    <p className="mb-2 flex items-center gap-1 text-xs text-red-400">
                      <AlertTriangle size={12} /> Foto obligatoria del daño
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handleChecklistPhoto(item.id, e)}
                      className="text-xs text-dark-400"
                    />
                    {checklistPhotos[item.id] && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-emerald-400">
                        <CheckCircle2 size={12} /> Foto capturada
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div>
              <label className="label">Observaciones</label>
              <textarea
                className="input min-h-[60px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas adicionales…"
              />
            </div>
            <button
              onClick={() => setStep(3)}
              disabled={missingDamagePhotos.length > 0}
              className="btn-primary flex w-full items-center justify-center gap-2 py-4"
            >
              {missingDamagePhotos.length > 0
                ? `Faltan ${missingDamagePhotos.length} foto(s) de daños`
                : <>Revisar y enviar <ChevronRight size={16} /></>}
            </button>
          </div>
        )}

        {/* ── Paso 3: resumen + km + enviar ── */}
        {step === 3 && (
          <div className="animate-fadeIn space-y-4">
            <h3 className="mt-2 font-semibold text-dark-200">Resumen de la inspección</h3>

            <div className="card space-y-2 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-dark-400">Conductor</span>
                <span className="text-dark-100">{driver.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Vehículo</span>
                <span className="font-mono text-dark-100">{selectedVehicle?.license_plate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Centro</span>
                <span className="badge-orange">{driver.center}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Fotos</span>
                <span className="text-dark-100">
                  {Object.keys(photos).length + Object.keys(checklistPhotos).length}
                </span>
              </div>
            </div>

            {Object.keys(checklist).length > 0 && (
              <div className="card p-4">
                <h4 className="mb-2 text-xs font-medium text-dark-400">Checklist</h4>
                {Object.entries(checklist).map(([id, state]) => (
                  <div key={id} className="flex justify-between py-1 text-sm">
                    <span className="text-dark-300">{CHECKLIST.find((c) => c.id === id)?.label}</span>
                    <span className={
                      state === 'ok' ? 'text-emerald-400'
                        : state === 'regular' ? 'text-amber-400' : 'text-red-400'
                    }>
                      {state.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-4 gap-2">
              {Object.entries(photos).map(([id, blob]) => (
                <img
                  key={id}
                  src={URL.createObjectURL(blob)}
                  className="aspect-square rounded-lg object-cover"
                  alt={id}
                />
              ))}
            </div>

            {/* Kilómetros con lectura por foto */}
            <div className="card border border-brand-500/30 p-4">
              <label className="label flex items-center gap-2">
                <Gauge size={14} className="text-brand-400" /> Kilómetros actuales del vehículo
              </label>
              <input
                type="number"
                inputMode="numeric"
                className="input text-lg"
                placeholder="Ej: 142500"
                value={km}
                onChange={(e) => setKm(e.target.value)}
              />
              <div className="mt-2">
                <input
                  ref={odoRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleOdometerPhoto}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => odoRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-brand-500/45 bg-brand-500/10 py-2.5 text-sm font-semibold text-brand-400"
                >
                  📷 Foto del cuentakilómetros (lectura automática)
                </button>
                {odoStatus && (
                  <p className="mt-1.5 text-center text-xs text-dark-400">{odoStatus}</p>
                )}
              </div>
              <p className="mt-1 text-xs text-dark-500">
                Haz una foto al salpicadero o introduce el kilometraje a mano
              </p>
            </div>

            <button
              onClick={submit}
              disabled={sending}
              className="btn-primary flex w-full items-center justify-center gap-2 py-4 text-base"
            >
              {sending ? (
                <><Loader2 size={18} className="animate-spin" /> Enviando análisis IA…</>
              ) : (
                <><Send size={18} /> Enviar inspección</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
