/* ─────────────────────────────────────────────────────────────────────────────
   FLOTADSP 2.0
   ---------------------------------------------------------------------------
   La aplicación entera, reorganizada. No es un panel de resumen: cubre lo que
   hoy son 35 pantallas, con la misma profundidad, en 7 áreas.

     Hoy            lo que hay que resolver ahora — el arranque, la ruta, el cierre
     Furgonetas     ← Vehículos, Inspecciones, Vencimientos, Renting, AvisosITV,
                      Aparcamiento, Importaciones
     Equipo         ← Conductores, WHC, Turnos, scoring, Portal del conductor
     Reparto        ← PackageIntel, DSC, Actividad
     Taller         ← Incidencias, Talleres, IA Peritaje, Revisión Rápida
     Planificación  ← Asignación, Turnos, Checklist, Plantilla, Chat
     Métricas       ← Scorecard, WHC, DSC, Métricas

   DOS REGLAS DE ARQUITECTURA, y las dos vienen de haber probado lo contrario:

   1. UNA lista por área, y la profundidad SE ABRE encima. Nunca se navega a un
      sitio del que haya que volver. La ficha de un vehículo o de una persona
      trae en un panel lo que hoy exige recorrer siete pantallas.

   2. La app mira el reloj. "Hoy" cambia de contenido según la hora, porque el
      día de un DSP tiene una forma que se repite: antes de salir, en ruta, al
      cerrar. No hay que acordarse de mirar.

   Datos: LAB/SIMULATED (datosPlus.js) — 24 furgonetas, 31 personas, 9 meses de
   historial. Ninguna acción escribe en ninguna base. /panel no se toca.
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react'
import {
  Sun, Moon, Truck, Users, Package, Wrench, CalendarRange, TrendingUp, Home,
  AlertTriangle, Check, Circle,
} from 'lucide-react'
import { CLARO, OSCURO } from '../v2/tema'
import {
  vehiculos, conductores, inspecciones, danos, incidencias, rutas, asignaciones,
  whc, cortexOverview, semanas, HOY, vehPorId, fuentes,
} from './datosPlus'
import { Etq, Titulo, Nota, Chip, Fila, Barra } from './ui2'
import { Furgonetas, Equipo, Reparto, Taller, Planificacion, Metricas } from './vistas'

const AREAS = [
  { id: 'hoy', nombre: 'Hoy', ic: Home },
  { id: 'furgonetas', nombre: 'Furgonetas', ic: Truck },
  { id: 'equipo', nombre: 'Equipo', ic: Users },
  { id: 'reparto', nombre: 'Reparto', ic: Package },
  { id: 'taller', nombre: 'Taller', ic: Wrench },
  { id: 'planificacion', nombre: 'Planificación', ic: CalendarRange },
  { id: 'metricas', nombre: 'Métricas', ic: TrendingUp },
]

const hm = (m) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`
const dias = (s) => Math.round((Date.parse(String(s).slice(0, 10) + 'T12:00:00Z') - Date.parse(HOY + 'T12:00:00Z')) / 86400000)
const eur = (n) => `${Math.round(n || 0).toLocaleString('es-ES')} €`

export default function App2() {
  const [claro, setClaro] = useState(true)
  const T = claro ? CLARO : OSCURO
  const [area, setArea] = useState('hoy')

  const pend = useMemo(() => {
    const cuadrante = asignaciones[0].slots
    const inspHoy = new Set(inspecciones.filter((i) => i.created_at.startsWith(HOY)).map((i) => i.vehicle_id))
    return {
      furgonetas: vehiculos.filter((v) => v.status === 'taller' || dias(v.itv_date) <= 15).length,
      equipo: whc.conductores.filter((c) => c.proyeccion > 56 * 60 + 30).length,
      reparto: rutas.filter((r) => r.min_sin_entregar >= 120).length + cortexOverview.missing_now,
      taller: danos.filter((d) => d.repair_status === 'pending').length,
      planificacion: cuadrante.filter((s) => vehPorId(s.vehicle_id)?.status === 'taller' || !inspHoy.has(s.vehicle_id)).length,
      metricas: 0,
    }
  }, [])

  return (
    <div style={{ background: T.papel, color: T.tinta, minHeight: '100vh' }}>
      <header style={{ borderBottom: `1px solid ${T.lineaSuave}`, position: 'sticky', top: 0, zIndex: 40, background: T.papel }}>
        <div style={{ maxWidth: 1020, margin: '0 auto', padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.02em' }}>FlotaDSP</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.14em', color: T.acento }}>2.0</span>
          <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, letterSpacing: '.13em', textTransform: 'uppercase', color: T.ojo }}>
            Prototipo · datos inventados
          </span>
          <button onClick={() => setClaro(!claro)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.tenue, padding: 3 }}>
            {claro ? <Moon size={14} /> : <Sun size={14} />}
          </button>
        </div>
        <nav style={{ maxWidth: 1020, margin: '0 auto', padding: '0 14px', display: 'flex', gap: 0, overflowX: 'auto' }}>
          {AREAS.map((a) => {
            const act = area === a.id
            const n = pend[a.id]
            const Ic = a.ic
            return (
              <button key={a.id} onClick={() => setArea(a.id)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '11px 12px', whiteSpace: 'nowrap',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${act ? T.acento : 'transparent'}`,
                color: act ? T.tinta : T.tenue, fontSize: 13.5, fontWeight: act ? 600 : 500,
              }}>
                <Ic size={13} /> {a.nombre}
                {n > 0 && (
                  <span style={{
                    minWidth: 16, height: 16, padding: '0 4px', borderRadius: 99, fontSize: 10, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: act ? T.acento : T.linea, color: act ? '#fff' : T.suave,
                  }}>{n}</span>
                )}
              </button>
            )
          })}
        </nav>
      </header>

      <main key={area} className="animate-fade-in" style={{ maxWidth: 1020, margin: '0 auto', padding: '34px 22px 110px' }}>
        {area === 'hoy' && <Hoy T={T} ir={setArea} />}
        {area === 'furgonetas' && <Furgonetas T={T} />}
        {area === 'equipo' && <Equipo T={T} />}
        {area === 'reparto' && <Reparto T={T} />}
        {area === 'taller' && <Taller T={T} />}
        {area === 'planificacion' && <Planificacion T={T} />}
        {area === 'metricas' && <Metricas T={T} />}
      </main>
    </div>
  )
}

/* ═══ HOY — cambia con la hora ═════════════════════════════════════════════ */
function Hoy({ T, ir }) {
  const h = new Date().getHours()
  const fase = h < 9 ? 'arranque' : h < 20 ? 'ruta' : 'cierre'
  const [ver, setVer] = useState(fase)

  const cuadrante = asignaciones[0].slots
  const inspHoy = new Set(inspecciones.filter((i) => i.created_at.startsWith(HOY)).map((i) => i.vehicle_id))
  const bloqueadas = cuadrante.filter((s) => vehPorId(s.vehicle_id)?.status === 'taller')
  const sinInsp = cuadrante.filter((s) => !inspHoy.has(s.vehicle_id))
  const paradas = rutas.filter((r) => r.min_sin_entregar >= 120)
  const nuevos = danos.filter((d) => Math.abs(dias(d.first_seen)) <= 2)
  const sinGestionar = danos.filter((d) => d.repair_status === 'pending')
  const abiertas = incidencias.filter((i) => i.status !== 'resolved')
  const frescura = Math.round((Date.now() - Date.parse(cortexOverview.last_capture_at)) / 60000)

  const FASES = [
    ['arranque', 'Antes de salir', '5-9h'],
    ['ruta', 'En ruta', '9-20h'],
    ['cierre', 'Al cerrar', '20-24h'],
  ]

  return (
    <>
      <Etq T={T}>{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</Etq>

      <div style={{ marginTop: 14, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {FASES.map(([id, nom, hor]) => (
          <button key={id} onClick={() => setVer(id)} style={{
            padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5,
            fontWeight: ver === id ? 600 : 500,
            background: ver === id ? T.linea : 'transparent',
            color: ver === id ? T.tinta : T.tenue,
          }}>
            {nom} <span style={{ opacity: .5 }}>{hor}</span>
            {id === fase && <span style={{ marginLeft: 6, color: T.acento, fontWeight: 700 }}>ahora</span>}
          </button>
        ))}
      </div>

      {ver === 'arranque' && (
        <>
          <Titulo T={T} sub="Una ruta que no sale es ingreso perdido y un golpe al scorecard. Lo único que decide si puede salir: furgoneta utilizable e inspección hecha.">
            {bloqueadas.length > 0
              ? <><span style={{ color: T.mal }}>{bloqueadas.length}</span> de {cuadrante.length} rutas bloqueadas</>
              : <>Las {cuadrante.length} rutas pueden salir</>}
          </Titulo>
          <div style={{ marginTop: 26 }}>
            {cuadrante.map((s) => {
              const v = vehPorId(s.vehicle_id)
              const bloq = v?.status === 'taller' ? 'En taller' : dias(v?.itv_date) <= 0 ? 'ITV caducada' : null
              const ok = inspHoy.has(s.vehicle_id)
              if (!bloq && ok) return null
              return (
                <Fila key={s.vehicle_id} T={T} izq={`${s.vehicle_plate} · ${s.driver_name}`}
                  sub={`${v?.brand} ${v?.model}`}
                  medio={<>
                    {bloq && <Chip T={T} tono={T.mal}><AlertTriangle size={10} /> {bloq}</Chip>}
                    <Chip T={T} tono={ok ? T.bien : T.ojo}>
                      {ok ? <><Check size={10} /> inspección hecha</> : <><Circle size={10} /> sin inspección</>}
                    </Chip>
                  </>} />
              )
            })}
          </div>
          <Nota T={T}>
            {sinInsp.length} sin inspección y {bloqueadas.length} con la furgoneta no utilizable.
            <b style={{ color: T.suave }}> No predice absentismo</b>: no hay datos de asistencia.
            {' '}<Enlace T={T} onClick={() => ir('planificacion')}>Ver el cuadrante entero</Enlace>
          </Nota>
        </>
      )}

      {ver === 'ruta' && (
        <>
          <Titulo T={T} sub={<>Minutos desde la última entrega y pendientes. Son hechos: no hay predicción de hora de fin porque no se sostiene con estos datos.</>}>
            {paradas.length > 0
              ? <><span style={{ color: T.mal }}>{paradas.length}</span> {paradas.length === 1 ? 'ruta lleva' : 'rutas llevan'} +2 h sin entregar</>
              : <>Las {rutas.length} rutas avanzan</>}
          </Titulo>
          {frescura > 45 && (
            <div style={{ marginTop: 20, padding: '12px 15px', borderRadius: 10, background: T.mal + '12', border: `1px solid ${T.mal}33`, fontSize: 13 }}>
              <b style={{ color: T.mal }}>Cortex lleva {frescura} min sin capturar.</b>
              <span style={{ color: T.suave }}> Todo esto está congelado a esa hora.</span>
            </div>
          )}
          <div style={{ marginTop: 24 }}>
            {[...rutas].sort((a, b) => b.min_sin_entregar - a.min_sin_entregar).slice(0, 8).map((r) => (
              <div key={r.route_code} style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '12px 0' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, minWidth: 66 }}>{r.route_code}</span>
                  <span style={{ fontSize: 12.5, color: T.tenue, flex: '1 1 130px' }}>{r.driver_name}</span>
                  <span style={{ fontSize: 12.5, color: T.tenue }}>{r.delivered}/{r.total}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, minWidth: 74, textAlign: 'right', color: r.min_sin_entregar >= 120 ? T.mal : T.tenue }}>
                    {hm(r.min_sin_entregar)}
                  </span>
                </div>
                <div style={{ marginTop: 7 }}><Barra T={T} pct={(r.delivered / r.total) * 100} tono={r.min_sin_entregar >= 120 ? T.mal : T.bien} /></div>
              </div>
            ))}
          </div>
          <Nota T={T}>
            El parón caza el 70 % de las rutas que acaban mal pero acierta el 41 % de las veces, así que
            <b style={{ color: T.suave }}> no es una alerta automática</b>.
            {' '}<Enlace T={T} onClick={() => ir('reparto')}>Ver las {rutas.length} rutas</Enlace>
          </Nota>
        </>
      )}

      {ver === 'cierre' && (
        <>
          <Titulo T={T} sub="Lo que ha pasado hoy y mañana es un problema si nadie lo toca.">
            {nuevos.length} daños nuevos · {abiertas.length} incidencias abiertas
          </Titulo>
          <div style={{ marginTop: 24 }}>
            {nuevos.slice(0, 8).map((d) => (
              <Fila key={d.id} T={T} izq={`${vehPorId(d.vehicle_id)?.license_plate} · ${d.part}`}
                sub={`detectado hace ${Math.abs(dias(d.first_seen))} días`}
                medio={<Chip T={T} tono={d.severity === 'grave' ? T.mal : T.ojo}>{d.severity}</Chip>}
                der={eur(d.estimated_cost)} derTono={T.tenue} />
            ))}
            {nuevos.length === 0 && <Nota T={T}>Ningún daño nuevo en los últimos dos días.</Nota>}
          </div>
          <Nota T={T}>
            <b style={{ color: T.suave }}>{sinGestionar.length} daños no los está gestionando nadie</b> — ni taller, ni
            presupuesto, ni importe. Por defecto, lo pagas tú.
            {' '}<Enlace T={T} onClick={() => ir('taller')}>Ir a taller</Enlace>
          </Nota>
        </>
      )}

      <footer style={{ marginTop: 54, paddingTop: 22, borderTop: `1px solid ${T.linea}` }}>
        <Etq T={T}>De cuándo son estos datos</Etq>
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: '6px 22px' }}>
          {Object.values(fuentes).map((f) => {
            const m = f.actualizado ? Math.round((Date.now() - Date.parse(f.actualizado)) / 60000) : null
            const viejo = m === null || m > 1440 || f.desfase_dias > 0
            return (
              <span key={f.etiqueta} style={{ fontSize: 11.5, color: viejo ? T.ojo : T.tenue }}>
                {f.etiqueta} · {m === null ? 'sin fecha' : m < 60 ? `hace ${m} min` : m < 2160 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`}
                {f.modo === 'manual' && ' · a mano'}
              </span>
            )
          })}
        </div>
        <Nota T={T}>
          Flota de laboratorio: {vehiculos.length} furgonetas, {conductores.length} personas,
          {' '}{inspecciones.length} inspecciones y {semanas.length} semanas de scorecard. Todo inventado — las
          matrículas acaban en «LAB». <b style={{ color: T.suave }}>/panel no se ha tocado.</b>
        </Nota>
      </footer>
    </>
  )
}

const Enlace = ({ T, onClick, children }) => (
  <button onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: T.acento, fontSize: 12.5, fontWeight: 500 }}>
    {children} →
  </button>
)
