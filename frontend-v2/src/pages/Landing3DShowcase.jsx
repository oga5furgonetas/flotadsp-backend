import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Box, MousePointerClick } from 'lucide-react'

const Vehicle3DViewer = lazy(() => import('../panel/twin3d/Vehicle3DViewer'))

// Datos de ejemplo (no tocan la API): un vehículo real con daños de muestra.
// Las fotos se sirven desde /public/demo — antes eran de Unsplash y resultaron
// ser un Mercedes deportivo y un BMW, en un producto de gestión de FURGONETAS.
const vehicle = { id: 'demo', brand: 'Toyota', model: 'Proace', license_plate: '3696 NBX' }
const inspections = [
  { id: 'i1', created_at: '2026-05-18T09:00:00Z', driver_name: 'Carlos',
    photos: ['/demo/van-lateral.jpg'],
    annotated_photos: ['/demo/van-lateral.jpg'],
    analysis: { damages: [
      { part: 'puerta lateral', severity: 'moderado', description: 'Rayón profundo en la puerta corredera', location_hint: 'lateral izquierdo', photo_index: 1, estimated_cost: 220 },
    ] } },
  { id: 'i2', created_at: '2026-06-30T09:00:00Z', driver_name: 'María',
    photos: ['/demo/van-frontal.jpg'],
    annotated_photos: ['/demo/van-frontal.jpg'],
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

/* ¿Puede este navegador pintar en 3D?
 *
 * MEDIDO EN PRODUCCION el 06-09-2026: con WebGL desactivado, el heroe de
 * flotadsp.com se queda en «Cargando gemelo 3D…» PARA SIEMPRE. No revienta ni
 * salta el ErrorBoundary —el visor nunca llega a crear su canvas y el fallback
 * del Suspense se queda puesto—, asi que lo primero que ve quien entra es una
 * caja de 420 px cargando eternamente. En la pagina que vende el producto.
 *
 * A quien le pasa: maquinas sin aceleracion por hardware, moviles con poca
 * memoria, y los ROBOTS que generan la vista previa de un enlace. Dos de los
 * tres errores de WebGL guardados venian de `facebookexternalhit`, o sea que
 * la miniatura de flotadsp.com en Facebook y WhatsApp se hacia con la pantalla
 * de carga puesta.
 *
 * Se comprueba ANTES de montar nada: si no hay 3D no se descarga ni el megabyte
 * de three.js, se enseña la foto y se acabo.
 */
function hayWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false           // algunos navegadores lanzan en vez de devolver null
  }
}

export default function Landing3DShowcase({ t, inline = false }) {
  const ref = useRef(null)
  const [show, setShow] = useState(false)
  const [sinTresD, setSinTresD] = useState(false)
  const [listo, setListo] = useState(false)

  // La comprobacion va en un efecto y no en el primer render: `document` existe
  // siempre aqui, pero crear un contexto WebGL en el render bloquea la pintura
  // inicial del heroe, que es justo lo que no queremos ralentizar.
  useEffect(() => { if (!hayWebGL()) setSinTresD(true) }, [])

  // Solo montamos el visor (y descargamos three.js) cuando entra en pantalla.
  useEffect(() => {
    const el = ref.current
    if (!el || show || sinTresD) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setShow(true); io.disconnect() }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [show, sinTresD])

  /* FOTO PRIMERO, 3D CUANDO ESTE. La foto se pinta ya y se quita sola en cuanto
     el visor tiene su <canvas>.

     MEDIDO en produccion el 06-09-2026, con fibra y una GTX 1060: **29,1 s**
     desde que se abre flotadsp.com hasta que aparece el gemelo. Son 692 KB de
     bundle principal, luego 282 KB comprimidos del visor y luego el modelo. En
     todo ese rato, el heroe de la pagina que vende el producto era una caja
     gris diciendo «Cargando gemelo 3D…». Medio minuto de spinner en la puerta
     de entrada, para TODO EL MUNDO, no solo para quien no tiene GPU.

     Asi ademas sobra el temporizador de seguridad que tenia aqui puesto: si el
     visor no llega nunca —el fallo original—, la foto simplemente se queda. No
     hay plazo que calibrar, y por tanto no hay plazo que se pueda quedar corto
     y quitarle el 3D a quien solo va lento. */
  useEffect(() => {
    if (!show || sinTresD || listo) return
    const el = ref.current
    if (!el) return
    if (el.querySelector('canvas')) { setListo(true); return }
    const mo = new MutationObserver(() => {
      if (el.querySelector('canvas')) { setListo(true); mo.disconnect() }
    })
    mo.observe(el, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [show, sinTresD, listo])

  const visor = (
    <div ref={ref} style={{ height: inline ? 'min(64vh, 520px)' : 'min(62vh, 540px)', minHeight: inline ? 430 : 420, borderRadius: 18, overflow: 'hidden', border: '1px solid var(--ld-border)', boxShadow: '0 30px 80px -30px rgba(0,0,0,.55)', position: 'relative' }}>
      {show && !sinTresD && (
        <Suspense fallback={null}>
          <Vehicle3DViewer vehicle={vehicle} inspections={inspections} ledger={ledger} loading={false} _debugModel={debugModel} publicMode />
        </Suspense>
      )}
      {!listo && <ShowcaseFoto t={t} sinTresD={sinTresD} />}
      {!inline && listo && (
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 5, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,.55)', color: '#e2e8f0', borderRadius: 20, padding: '5px 12px', fontSize: 12, pointerEvents: 'none', backdropFilter: 'blur(6px)' }}>
          <MousePointerClick size={13} /> {t?.hint || 'Arrastra para girar · pincha un daño'}
        </div>
      )}
    </div>
  )

  // En el hero va suelto, sin seccion ni titular propios.
  if (inline) return visor

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

        {visor}
      </div>
    </section>
  )
}

/* Lo que se ve cuando no hay 3D. La misma furgoneta del gemelo, en foto: la
   pagina sigue contando lo que vende en vez de enseñar una caja cargando. */
function ShowcaseFoto({ t, sinTresD }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 4, background: '#0b0e14' }}>
      <img
        src="/demo/van-lateral.jpg"
        alt={t?.fotoAlt || 'Furgoneta de la flota con los daños registrados'}
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }}
      />
      {/* El aviso SOLO cuando de verdad no hay 3D. Mientras se esta cargando no
          se dice nada: la foto ya cuenta lo que tiene que contar y un cartel de
          «espera» invita a irse. */}
      {sinTresD && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '28px 18px 14px', background: 'linear-gradient(to top, rgba(0,0,0,.8), transparent)', color: '#e2e8f0', fontSize: 13, textAlign: 'center' }}>
          {t?.sinTresD || 'El gemelo 3D necesita un navegador con aceleración gráfica.'}
        </div>
      )}
    </div>
  )
}
