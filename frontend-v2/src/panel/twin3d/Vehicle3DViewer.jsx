import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, Lightformer, ContactShadows, Html } from '@react-three/drei'
import {
  Loader2, Eye, EyeOff, Layers, Filter, Info, Car, Sparkles, BadgeCheck,
} from 'lucide-react'
import VanModel from './VanModel'
import DamagePins, { SEV_COLOR, SEV_LABEL } from './DamagePins'
import DamageSidebar from './DamageSidebar'
import CameraController, { frameFromNormal } from './CameraController'
import { useVehicleDamages } from './useVehicleDamages'
import { dimsFromResolver } from './vanGeometry'
import { resolveVehicleModel, identifyVehicleModel } from '../api'

const SEVERITIES = ['critico', 'grave', 'moderado', 'leve']

function Loader() {
  return (
    <Html center>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 13 }}>
        <Loader2 size={16} className="animate-spin" /> Cargando modelo 3D…
      </div>
    </Html>
  )
}

// Iluminación tipo configurador (Mercedes/Tesla): env procedural + key/fill/rim.
function VehicleLighting() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 10, 6]} intensity={1.4} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <directionalLight position={[-8, 6, -4]} intensity={0.5} color="#bcd4ff" />
      <Environment resolution={256}>
        <Lightformer intensity={2} position={[0, 6, 0]} scale={[10, 3, 1]} />
        <Lightformer intensity={1.2} position={[5, 3, 4]} scale={[6, 6, 1]} />
        <Lightformer intensity={1.2} position={[-5, 3, -4]} scale={[6, 6, 1]} color="#e6f0ff" />
      </Environment>
    </>
  )
}

export default function Vehicle3DViewer({ vehicle, inspections, ledger, loading, _debugModel }) {
  const controlsRef = useRef()
  const vanRef = useRef()   // modelo 3D → oclusión de pines detrás de la furgoneta

  // VehicleModelResolver: marca/modelo (IA si existe, si no lo introducido) → malla.
  const [modelInfo, setModelInfo] = useState(_debugModel || null)
  const [aiModel, setAiModel] = useState(vehicle?.ai_model || null)
  const [identifying, setIdentifying] = useState(false)
  const [idMsg, setIdMsg] = useState(null)

  useEffect(() => {
    if (_debugModel) return
    const b = aiModel?.brand || vehicle?.brand
    const m = aiModel?.model || vehicle?.model
    resolveVehicleModel(b, m).then((r) => setModelInfo(r.data)).catch(() => setModelInfo(null))
  }, [vehicle?.id, aiModel, vehicle?.brand, vehicle?.model, _debugModel])

  const dimsOverride = useMemo(
    () => dimsFromResolver(modelInfo, aiModel?.brand || vehicle?.brand, aiModel?.model || vehicle?.model),
    [modelInfo, aiModel, vehicle?.brand, vehicle?.model])

  const { dims, markers, timeline } = useVehicleDamages(vehicle, inspections, ledger, dimsOverride)

  async function identify() {
    setIdentifying(true); setIdMsg(null)
    try {
      const r = await identifyVehicleModel(vehicle.id)
      setAiModel(r.data?.ai_model || null)
      setModelInfo(r.data?.resolved || null)
      const am = r.data?.ai_model
      setIdMsg({ ok: true, text: am ? `${am.brand} ${am.model}${am.body_type ? ' · ' + am.body_type : ''} (${Math.round((am.confidence || 0) * 100)}%)` : 'Identificado' })
    } catch (e) {
      setIdMsg({ ok: false, text: e?.response?.data?.detail || 'No se pudo identificar el modelo' })
    } finally { setIdentifying(false) }
  }

  const modelName = modelInfo?.name || aiModel?.model || [vehicle?.brand, vehicle?.model].filter(Boolean).join(' ')

  const [selectedKey, setSelectedKey] = useState(null)
  const [hoveredKey, setHoveredKey] = useState(null)
  const [camTarget, setCamTarget] = useState(null)
  const [inspectionMode, setInspectionMode] = useState(false)
  const [sevFilter, setSevFilter] = useState(() => new Set(SEVERITIES))
  const [statusFilter, setStatusFilter] = useState('open') // open | repaired | all
  const [showFilters, setShowFilters] = useState(false)
  const [timeIdx, setTimeIdx] = useState(timeline.length) // = todos

  const orbitTarget = useMemo(() => [0, dims.H * 0.5, 0], [dims.H])
  const camDist = dims.L * 1.25

  // Fecha de corte del comparador temporal (null = actualidad).
  const cutoff = timeIdx >= timeline.length ? null : timeline[timeIdx]?.date

  const visible = useMemo(() => markers.filter((m) => {
    if (!sevFilter.has(m.severity)) return false
    if (statusFilter !== 'all' && m.status !== statusFilter) return false
    if (cutoff && (m.firstSeen || '') > cutoff) return false // aún no había aparecido
    return true
  }), [markers, sevFilter, statusFilter, cutoff])

  const selected = visible.find((m) => m.key === selectedKey) || markers.find((m) => m.key === selectedKey)
  const litZones = inspectionMode
    ? visible.map((m) => ({ pos: m.pos, color: SEV_COLOR[m.severity] || '#94a3b8' }))
    : []

  function selectMarker(key) {
    const m = markers.find((x) => x.key === key)
    if (!m) return
    setSelectedKey(key)
    setCamTarget(frameFromNormal(m.pos, m.normal, 3.2))
  }

  function setView(name) {
    const { L, H, W } = dims
    const P = {
      iso: [L * 0.85, H * 1.15, W * 1.9],
      frente: [L * 1.3, H * 0.6, 0.001],
      detras: [-L * 1.3, H * 0.6, 0.001],
      izq: [0.001, H * 0.6, W * 1.7],
      der: [0.001, H * 0.6, -W * 1.7],
      arriba: [0.001, L * 1.25, 0.001],
    }
    setCamTarget({ pos: P[name] || P.iso, look: orbitTarget })
    setSelectedKey(null)
  }

  const counts = useMemo(() => {
    const open = markers.filter((m) => m.status === 'open').length
    const repaired = markers.filter((m) => m.status === 'repaired').length
    return { open, repaired, total: markers.length }
  }, [markers])

  const toggleSev = (s) => setSevFilter((prev) => {
    const n = new Set(prev)
    n.has(s) ? n.delete(s) : n.add(s)
    return n
  })

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 440, background: 'radial-gradient(ellipse at 50% 40%, #1a2030 0%, #0b0e14 75%)', borderRadius: 12, overflow: 'hidden' }}>
      <style>{`
        @keyframes twinPulse { 0% { transform: scale(1); opacity: .9 } 70% { transform: scale(2.1); opacity: 0 } 100% { opacity: 0 } }
        @keyframes twinSlideIn { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
      `}</style>
      {/* ── Barra superior: vistas + modo inspección + filtros ── */}
      <div style={{ position: 'absolute', top: 10, left: 10, right: 10, zIndex: 20, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2, background: 'rgba(15,18,26,.85)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 9, padding: 3 }}>
          {[['iso', '3D'], ['frente', 'Frente'], ['izq', 'Izq.'], ['der', 'Der.'], ['detras', 'Detrás'], ['arriba', 'Arriba']].map(([k, lbl]) => (
            <button key={k} onClick={() => setView(k)} style={viewBtn}>{lbl}</button>
          ))}
        </div>

        <button onClick={() => setInspectionMode((v) => !v)}
          style={{ ...pillBtn, background: inspectionMode ? 'rgba(59,130,246,.22)' : 'rgba(15,18,26,.85)', color: inspectionMode ? '#93c5fd' : '#cbd5e1', borderColor: inspectionMode ? '#3b82f688' : 'rgba(255,255,255,.08)' }}>
          {inspectionMode ? <Eye size={14} /> : <EyeOff size={14} />} Inspección
        </button>

        <button onClick={() => setShowFilters((v) => !v)} style={{ ...pillBtn, background: 'rgba(15,18,26,.85)', color: '#cbd5e1' }}>
          <Filter size={14} /> Filtros
        </button>

        <button onClick={identify} disabled={identifying}
          style={{ ...pillBtn, background: 'rgba(168,85,247,.18)', color: '#d8b4fe', borderColor: '#a855f788' }}
          title="La IA identifica marca/modelo exacto desde las fotos de inspección">
          {identifying ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Identificar con IA
        </button>
      </div>

      {idMsg && (
        <div style={{ position: 'absolute', top: 52, left: 10, zIndex: 25,
          background: idMsg.ok ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
          color: idMsg.ok ? '#86efac' : '#fca5a5', border: `1px solid ${idMsg.ok ? '#22c55e55' : '#ef444455'}`,
          borderRadius: 8, padding: '6px 12px', fontSize: 12, maxWidth: 320 }}>
          {idMsg.ok ? '✓ Modelo identificado: ' : ''}{idMsg.text}
        </div>
      )}

      {/* ── Panel de filtros ── */}
      {showFilters && (
        <div style={{ position: 'absolute', top: 52, right: 10, zIndex: 20, background: 'rgba(15,18,26,.96)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: 14, width: 230, boxShadow: '0 12px 30px rgba(0,0,0,.5)' }}>
          <div style={filterTitle}>Estado</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {[['open', 'Abiertos'], ['repaired', 'Reparados'], ['all', 'Todos']].map(([k, lbl]) => (
              <button key={k} onClick={() => setStatusFilter(k)} style={{ ...miniPill, ...(statusFilter === k ? miniPillOn : {}) }}>{lbl}</button>
            ))}
          </div>
          <div style={filterTitle}>Severidad</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SEVERITIES.map((s) => (
              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: '#cbd5e1' }}>
                <input type="checkbox" checked={sevFilter.has(s)} onChange={() => toggleSev(s)} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEV_COLOR[s] }} />
                {SEV_LABEL[s]}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── Contador / leyenda inferior izquierda ── */}
      <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 20, background: 'rgba(15,18,26,.82)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#cbd5e1' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
          <Car size={13} /> {modelName || `${vehicle?.brand || ''} ${vehicle?.model || ''}`}
          {modelInfo && (modelInfo.glb_url
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(34,197,94,.18)', color: '#86efac', borderRadius: 20, padding: '1px 7px', fontSize: 9, fontWeight: 700 }}><BadgeCheck size={9} /> modelo real</span>
            : <span style={{ background: 'rgba(148,163,184,.18)', color: '#cbd5e1', borderRadius: 20, padding: '1px 7px', fontSize: 9, fontWeight: 700 }}>modelo provisional</span>)}
        </div>
        <div style={{ color: '#94a3b8', fontSize: 11 }}>
          <span style={{ color: '#fb923c' }}>{counts.open} abiertos</span>
          {counts.repaired > 0 && <span> · <span style={{ color: '#22c55e' }}>{counts.repaired} reparados</span></span>}
          {visible.length !== markers.length && <span> · {visible.length} en vista</span>}
          {aiModel && <span> · <span style={{ color: '#d8b4fe' }}>IA {Math.round((aiModel.confidence || 0) * 100)}%</span></span>}
        </div>
      </div>

      {/* ── Comparador temporal ── */}
      {timeline.length > 1 && (
        <div style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 20, background: 'rgba(15,18,26,.82)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: '8px 12px', width: 250 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
            <Layers size={12} /> Evolución en el tiempo
          </div>
          <input type="range" min={0} max={timeline.length} value={timeIdx}
            onChange={(e) => setTimeIdx(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#3b82f6' }} />
          <div style={{ fontSize: 11, color: '#cbd5e1', textAlign: 'center', marginTop: 2 }}>
            {cutoff ? new Date(cutoff).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Estado actual'}
          </div>
        </div>
      )}

      {/* ── Escena 3D ── */}
      <Canvas shadows dpr={[1, 2]} camera={{ position: [camDist * 0.8, dims.H * 1.15, dims.W * 1.9], fov: 42 }}
        onPointerMissed={() => setSelectedKey(null)}>
        <color attach="background" args={['#0b0e14']} />
        <VehicleLighting />
        <Suspense fallback={<Loader />}>
          <group ref={vanRef}>
            <VanModel dims={dims} brand={vehicle?.brand} inspectionMode={inspectionMode} litZones={litZones} glbUrl={modelInfo?.glb_url} />
          </group>
          <DamagePins markers={visible} selectedKey={selectedKey} hoveredKey={hoveredKey}
            onSelect={selectMarker} onHover={setHoveredKey} occluder={vanRef} />
        </Suspense>
        <ContactShadows position={[0, 0.01, 0]} opacity={0.55} scale={dims.L * 2.2} blur={2.4} far={4} />
        <OrbitControls ref={controlsRef} target={orbitTarget}
          enablePan minDistance={2.2} maxDistance={dims.L * 3}
          maxPolarAngle={Math.PI * 0.52} makeDefault />
        <CameraController controlsRef={controlsRef} target={camTarget} />
      </Canvas>

      {/* Estado de carga / vacío */}
      {loading && (
        <div style={overlayCenter}><Loader2 size={20} className="animate-spin" /> Cargando daños…</div>
      )}
      {!loading && markers.length === 0 && (
        <div style={overlayCenter}>
          <Info size={22} style={{ opacity: 0.6 }} />
          <div style={{ fontWeight: 600, color: '#e2e8f0' }}>Sin daños de carrocería registrados</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>El gemelo digital mostrará aquí cada golpe en su zona exacta.</div>
        </div>
      )}

      {/* Panel lateral de detalle */}
      {selected && <DamageSidebar marker={selected} onClose={() => setSelectedKey(null)} />}
    </div>
  )
}

const viewBtn = { background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: 12, fontWeight: 600, padding: '5px 9px', borderRadius: 7, cursor: 'pointer' }
const pillBtn = { display: 'flex', alignItems: 'center', gap: 5, border: '1px solid rgba(255,255,255,.08)', borderRadius: 9, padding: '6px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
const filterTitle = { color: '#64748b', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 7 }
const miniPill = { flex: 1, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', color: '#94a3b8', borderRadius: 7, padding: '5px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer' }
const miniPillOn = { background: 'rgba(59,130,246,.22)', color: '#93c5fd', borderColor: '#3b82f688' }
const overlayCenter = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#cbd5e1', textAlign: 'center', pointerEvents: 'none', padding: 20 }
