import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Box, MousePointerClick } from 'lucide-react'

const Vehicle3DViewer = lazy(() => import('../panel/twin3d/Vehicle3DViewer'))

// Datos de ejemplo (no tocan la API): un vehículo real con daños de muestra.
const vehicle = { id: 'demo', brand: 'Toyota', model: 'Proace', license_plate: '3696 NBX' }
const inspections = [
  { id: 'i1', created_at: '2026-05-18T09:00:00Z', driver_name: 'Carlos',
    photos: ['https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=640&q=70'],
    annotated_photos: ['https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=640&q=70'],
    analysis: { damages: [
      { part: 'puerta lateral', severity: 'moderado', description: 'Rayón profundo en la puerta corredera', location_hint: 'lateral izquierdo', photo_index: 1, estimated_cost: 220 },
    ] } },
  { id: 'i2', created_at: '2026-06-30T09:00:00Z', driver_name: 'María',
    photos: ['https://images.unsplash.com/photo-1502877338535-766e1452684a?w=640&q=70'],
    annotated_photos: ['https://images.unsplash.com/photo-1502877338535-766e1452684a?w=640&q=70'],
    analysis: { damages: [
      { part: 'aleta trasera', severity: 'grave', description: 'Abolladura por golpe en maniobra', location_hint: 'trasero derecho', photo_index: 1, estimated_cost: 480 },
      { part: 'paragolpes', severity: 'leve', description: 'Roce leve en el paragolpes delantero', location_hint: 'delantero', photo_index: 1, estimated_cost: 90 },
    ] } },
]
const ledger = { open: [
  { panel: 'puerta', severity: 'moderado', rank: 2, first_seen: '2026-05-18', status: 'open' },
  { panel: 'aleta', severity: 'grave', rank: 3, first_seen: '2026-06-30', status: 'open' },
  { panel: 'paragolpes', severity: 'leve', rank: 1, first_seen: '2026-06-30', status: 'open' },
], repaired: [] }
const debugModel = {
  key: 'toyota_proace', name: 'Toyota Proace', provisional: false,
  glb_url: '/models/toyota_proace.glb',
  body: { L: 5.31, H: 1.94, W: 1.92, cab: 0.37, roofDrop: 0.13, nose: 0.22 },
}

export default function Landing3DShowcase({ t }) {
  const ref = useRef(null)
  const [show, setShow] = useState(false)

  // Solo montamos el visor (y descargamos three.js) cuando entra en pantalla.
  useEffect(() => {
    const el = ref.current
    if (!el || show) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setShow(true); io.disconnect() }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [show])

  return (
    <section style={{ background: 'var(--ld-surface)', borderTop: '1px solid var(--ld-border)', borderBottom: '1px solid var(--ld-border)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '70px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(168,85,247,.12)', border: '1px solid rgba(168,85,247,.3)', borderRadius: 99, padding: '5px 14px', fontSize: 12, fontWeight: 700, color: '#c084fc', marginBottom: 16 }}>
            <Box size={13} /> {t?.badge || 'Gemelo Digital 3D'}
          </div>
          <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 950, letterSpacing: '-.02em', margin: '0 0 12px', color: 'var(--ld-text)' }}>
            {t?.title || 'Cada furgoneta, su gemelo 3D con los daños exactos'}
          </h2>
          <p style={{ fontSize: 16, color: 'var(--ld-muted)', maxWidth: 620, margin: '0 auto', lineHeight: 1.6 }}>
            {t?.sub || 'El modelo real de cada vehículo, con cada golpe marcado en su sitio. Gira, haz zoom y pincha en un daño para ver su foto, gravedad e historial.'}
          </p>
        </div>

        <div ref={ref} style={{ height: 'min(62vh, 540px)', minHeight: 420, borderRadius: 18, overflow: 'hidden', border: '1px solid var(--ld-border)', boxShadow: '0 30px 80px -30px rgba(0,0,0,.55)', position: 'relative' }}>
          {show ? (
            <Suspense fallback={<ShowcaseLoader t={t} />}>
              <Vehicle3DViewer vehicle={vehicle} inspections={inspections} ledger={ledger} loading={false} _debugModel={debugModel} publicMode />
            </Suspense>
          ) : <ShowcaseLoader t={t} />}
          {/* Pista de interacción */}
          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 5, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,.55)', color: '#e2e8f0', borderRadius: 20, padding: '5px 12px', fontSize: 12, pointerEvents: 'none', backdropFilter: 'blur(6px)' }}>
            <MousePointerClick size={13} /> {t?.hint || 'Arrastra para girar · pincha un daño'}
          </div>
        </div>
      </div>
    </section>
  )
}

function ShowcaseLoader({ t }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'radial-gradient(ellipse at 50% 40%, #1a2030 0%, #0b0e14 75%)', color: '#94a3b8' }}>
      <Box size={30} className="animate-pulse" />
      <span style={{ fontSize: 14 }}>{t?.loading || 'Cargando gemelo 3D…'}</span>
    </div>
  )
}
