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
  const [odoPhoto, setOdoPhoto] = useState(null)     // Blob del cuentakilómetros
  const [odoKm, setOdoKm] = useState(null)           // km leídos por la IA
  const [odoError, setOdoError] = useState('')
  const [odoBusy, setOdoBusy] = useState(false)
  const [checklist, setChecklist] = useState({})
  const [checklistPhotos, setChecklistPhotos] = useState({})
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [assigned, setAssigned] = useState(null)
  const fileRefs = useRef({})
  const odoRef = useRef(null)
  const checklistRefs = useRef({})

  useEffect(() => {
    getAssignedVehicle()
      .then((r) => r.data?.assigned && setAssigned(r.data))
      .catch(() => {})
  }, [])

  /* ── Captura + validación IA de las fotos de zona ── */
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

  /* ── Cuentakilómetros: foto obligatoria, la IA lee los km ── */
  const handleOdoPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const blob = await compressImage(file, 1280, 0.8)
    setOdoBusy(true)
    setOdoError('')
    try {
      const r = await readOdometer(vehicleId, blob)
      if (r.data?.success && r.data.km) {
        setOdoPhoto(blob)
        setOdoKm(r.data.km)
        if (r.data.warning) {
          setOdoError(`⚠️ ${r.data.warning}`)
        }
        toast.success(`✅ Km leídos: ${r.data.km.toLocaleString()}`)
      } else {
        setOdoError('No se pudo leer el número de kilómetros. Acércate más al cuadro, enfoca bien y repite la foto.')
        toast.error('❌ Cuentakilómetros no legible. Repite la foto.')
      }
    } catch {
      // Fail-open: si la IA no responde, aceptamos la foto sin km
      setOdoPhoto(blob)
      setOdoKm(null)
      setOdoError('Lectura no disponible ahora mismo — la foto se ha guardado igualmente.')
      toast.warning('Foto guardada (lectura de km no disponible)')
    }
    setOdoBusy(false)
  }

  const handleChecklistPhoto = async (itemId, e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const blob = await compressImage(file, 1000, 0.65)
    setChecklistPhotos((p) => ({ ...p, [itemId]: blob }))
    toast.success(`Foto de ${CHECKLIST.find((c) => c.id === itemId)?.label} añadida`)
  }

  /* ── Envío ── */
  const allRequiredPhotos =
    PHOTO_SLOTS.filter((s) => s.required).every((s) => photos[s.id]) && !!odoPhoto
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
      fd.append(
        'notes',
        JSON.stringify({
          checklist,
          notes,
          driver_name: driver.name,
          center: driver.center,
          odometer_km: odoKm,
          checklist_photo_items: Object.keys(checklistPhotos).map(
            (id) => CHECKLIST.find((c) => c.id === id)?.label || id,
          ),
        }),
      )
      // Orden FIJO de zonas — el backend y la IA dependen de él
      PHOTO_SLOTS.forEach((slot, i) => {
        if (photos[slot.id]) fd.append('files', photos[slot.id], `angle_${i}_${slot.id}.jpg`)
      })
      if (odoPhoto) fd.append('files', odoPhoto, 'odometro.jpg')
      Object.entries(checklistPhotos).forEach(([itemId, blob]) =>
        fd.append('files', blob, `checklist_${itemId}.jpg`),
      )
      const r = await uploadInspection(fd)
      // Km leídos por la IA → al historial del vehículo (no bloquea)
      if (odoKm > 0) updateMileage(vehicleId, odoKm).catch(() => {})

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
      <div className="mx-auto flex max-w-2xl gap-1.5 px-4 py-3">
        {STEPS.map((label, i) => (
          <div key={label} className="flex-1">
            <div className={`h-1 rounded-full transition-all ${i <= step ? 'bg-brand-500' : 'bg-dark-800'}`} />
            <p className="mt-1 text-center text-[10px] text-dark-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-24">
        {/* ── Paso 0: vehículo ── */}
        {step === 0 && (
          <div className="animate-fadeIn space-y-3">
            <h3 className="mt-2 font-semibold text-dark-200">
              {assigned?.vehicle ? 'Tu asignación de hoy' : 'Selecciona tu vehículo'}
            </h3>

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
                className={`card-hover flex w-full items-center gap-4 p-3 text-left ${vehicleId === v.id ? 'border-brand-500' : ''}`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10">
                  <Truck size={16} className="text-brand-400" />
                </div>
                <div className="flex-1">
                  <p className="font-mono text-sm font-medium text-dark-100">{v.license_plate}</p>
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

        {/* ── Paso 1: fotos (4 zonas + cuentakilómetros) ── */}
        {step === 1 && (
          <div className="animate-fadeIn space-y-4">
            <h3 className="mt-2 font-semibold text-dark-200">Fotografías obligatorias</h3>
            <p className="text-xs text-dark-400">
              Captura cada ángulo del vehículo y el cuentakilómetros. La IA verifica cada foto.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {PHOTO_SLOTS.map((slot) => (
                <div key={slot.id}>
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
                    className={`flex aspect-[4/3] max-h-36 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition-all ${
                      photos[slot.id]
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : photoErrors[slot.id]
                          ? 'border-red-500/60 bg-red-500/5'
                          : 'border-dark-700 hover:border-brand-500/50'
                    }`}
                  >
                    {validating === slot.id ? (
                      <>
                        <Loader2 size={20} className="animate-spin text-brand-400" />
                        <span className="text-[11px] text-brand-400">Comprobando…</span>
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
                        <Camera size={20} className="text-dark-500" />
                        <span className="text-[11px] text-dark-400">{slot.label}</span>
                        <span className="text-[9px] text-brand-400">Obligatorio</span>
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

              {/* Casilla del cuentakilómetros */}
              <div>
                <input
                  ref={odoRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleOdoPhoto}
                  className="hidden"
                />
                <button
                  onClick={() => odoRef.current?.click()}
                  disabled={odoBusy}
                  className={`flex aspect-[4/3] max-h-36 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition-all ${
                    odoPhoto
                      ? 'border-emerald-500/50 bg-emerald-500/5'
                      : odoError
                        ? 'border-red-500/60 bg-red-500/5'
                        : 'border-brand-500/40 bg-brand-500/5 hover:border-brand-500/70'
                  }`}
                >
                  {odoBusy ? (
                    <>
                      <Loader2 size={20} className="animate-spin text-brand-400" />
                      <span className="text-[11px] text-brand-400">Leyendo km…</span>
                    </>
                  ) : odoPhoto ? (
                    <div className="relative h-full w-full">
                      <img
                        src={URL.createObjectURL(odoPhoto)}
                        className="h-full w-full rounded-lg object-cover"
                        alt="Cuentakilómetros"
                      />
                      <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                        <Check size={12} className="text-white" />
                      </div>
                      {odoKm && (
                        <div className="absolute bottom-1 left-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-center text-[11px] font-bold text-emerald-300">
                          {odoKm.toLocaleString()} km
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <Gauge size={20} className="text-brand-400" />
                      <span className="text-[11px] text-dark-300">Cuentakilómetros</span>
                      <span className="text-[9px] text-brand-400">Obligatorio · la IA lee los km</span>
                    </>
                  )}
                </button>
                {odoError && (
                  <div className="mt-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-300">
                    {odoError}
                  </div>
                )}
              </div>
            </div>

            {allRequiredPhotos ? (
              <button onClick={() => setStep(2)} className="btn-primary flex w-full items-center justify-center gap-2 py-3.5">
                Continuar <ChevronRight size={16} />
              </button>
            ) : (
              <p className="text-center text-xs text-amber-400">
                Captura las 4 fotos del vehículo y la del cuentakilómetros para continuar
              </p>
            )}
          </div>
        )}

        {/* ── Paso 2: checklist (foto opcional en TODOS los ítems) ── */}
        {step === 2 && (
          <div className="animate-fadeIn space-y-4">
            <h3 className="mt-2 font-semibold text-dark-200">Checklist del vehículo</h3>
            <p className="text-xs text-dark-400">
              Puedes añadir una foto a cualquier punto (limpieza, ruedas…) — el admin la verá en la inspección.
            </p>
            {CHECKLIST.map((item) => (
              <div key={item.id} className="card space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-dark-200">{item.label}</span>
                  <input
                    ref={(el) => (checklistRefs.current[item.id] = el)}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleChecklistPhoto(item.id, e)}
                    className="hidden"
                  />
                  <button
                    onClick={() => checklistRefs.current[item.id]?.click()}
                    className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                      checklistPhotos[item.id]
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                        : 'border-dark-700 text-dark-400 hover:border-brand-500/50 hover:text-brand-400'
                    }`}
                  >
                    <Camera size={11} />
                    {checklistPhotos[item.id] ? 'Foto ✓' : 'Foto'}
                  </button>
                </div>
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
                {(checklist[item.id] === 'malo' || checklist[item.id] === 'danado') &&
                  !checklistPhotos[item.id] && (
                    <p className="flex items-center gap-1 rounded-lg border border-red-800/30 bg-red-500/5 p-2.5 text-xs text-red-400">
                      <AlertTriangle size={12} /> Foto obligatoria del daño — usa el botón “Foto” de arriba
                    </p>
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
              className="btn-primary flex w-full items-center justify-center gap-2 py-3.5"
            >
              {missingDamagePhotos.length > 0
                ? `Faltan ${missingDamagePhotos.length} foto(s) de daños`
                : <>Revisar y enviar <ChevronRight size={16} /></>}
            </button>
          </div>
        )}

        {/* ── Paso 3: resumen + enviar ── */}
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
                  {Object.keys(photos).length + (odoPhoto ? 1 : 0) + Object.keys(checklistPhotos).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Kilómetros (leídos por IA)</span>
                <span className="font-semibold text-emerald-400">
                  {odoKm ? `${odoKm.toLocaleString()} km` : '— no legibles'}
                </span>
              </div>
            </div>

            {Object.keys(checklist).length > 0 && (
              <div className="card p-4">
                <h4 className="mb-2 text-xs font-medium text-dark-400">Checklist</h4>
                {Object.entries(checklist).map(([id, state]) => (
                  <div key={id} className="flex justify-between py-1 text-sm">
                    <span className="text-dark-300">
                      {CHECKLIST.find((c) => c.id === id)?.label}
                      {checklistPhotos[id] ? ' 📷' : ''}
                    </span>
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

            <div className="grid grid-cols-5 gap-2">
              {Object.entries(photos).map(([id, blob]) => (
                <img
                  key={id}
                  src={URL.createObjectURL(blob)}
                  className="aspect-square rounded-lg object-cover"
                  alt={id}
                />
              ))}
              {odoPhoto && (
                <img
                  src={URL.createObjectURL(odoPhoto)}
                  className="aspect-square rounded-lg border border-brand-500/40 object-cover"
                  alt="Cuentakilómetros"
                />
              )}
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
