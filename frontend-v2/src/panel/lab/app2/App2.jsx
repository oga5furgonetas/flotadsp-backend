/* ─────────────────────────────────────────────────────────────────────────────
   FLOTADSP 2.0
   ---------------------------------------------------------------------------
   No es un rediseño de la aplicación actual: es otra forma de organizarla.

   ANTES  35 pantallas agrupadas por módulo. Para saber si mañana sale todo el
          mundo hay que pasar por Asignación, Vehículos, Vencimientos e
          Inspecciones, y juntarlo en la cabeza.

   AHORA  Cuatro fases que son las horas del día de un DSP. La aplicación mira
          el reloj y te pone delante la que toca. El eje de arriba no es un
          menú: es tu jornada, con lo que hay pendiente en cada tramo.

   Tres cosas que se conservan de lo aprendido en el laboratorio porque se
   ganaron el sitio:
     · el veredicto sitio / franja / persona, con un cuarto que dice "no se
       distingue" para no señalar a nadie sin poder demostrarlo;
     · la medición posterior: una decisión no está cerrada hasta que se sabe
       si funcionó;
     · el suelo de 56 h 30 m como criba del riesgo de tier, en vez del límite
       propio de 55 h que a Amazon no le consta.

   Datos: LAB/SIMULATED. Ninguna acción escribe en ninguna base.
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react'
import {
  Sun, Moon, Truck, Package, ClipboardCheck, TrendingUp, AlertTriangle,
  MapPin, Clock, User, HelpCircle, Check, Circle,
} from 'lucide-react'
import { CLARO, OSCURO } from '../v2/tema'
import { FASES, faseActual, arranque, ruta, cierre, semana } from './fases'
import { hm } from '../motor'

const ICONO = { arranque: Truck, ruta: Package, cierre: ClipboardCheck, semana: TrendingUp }
const VER = {
  sitio: { txt: 'Es el sitio', ic: MapPin, tono: 'acento' },
  franja: { txt: 'Es la franja', ic: Clock, tono: 'ojo' },
  persona: { txt: 'Es la persona', ic: User, tono: 'mal' },
  sin_distinguir: { txt: 'No se distingue', ic: HelpCircle, tono: 'tenue' },
}
const eur = (n) => `${Math.round(n || 0).toLocaleString('es-ES')} €`

export default function App2() {
  const [claro, setClaro] = useState(true)
  const T = claro ? CLARO : OSCURO
  const [fase, setFase] = useState(() => faseActual())
  const [hechos, setHechos] = useState({})

  const D = useMemo(() => ({
    arranque: arranque(), ruta: ruta(), cierre: cierre(), semana: semana(),
  }), [])

  const hoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const horaAhora = new Date().getHours()

  return (
    <div style={{ background: T.papel, color: T.tinta, minHeight: '100vh' }}>
      {/* ── Cabecera mínima ── */}
      <header style={{ borderBottom: `1px solid ${T.lineaSuave}` }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.02em' }}>FlotaDSP</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.14em', color: T.acento }}>2.0</span>
          <span style={{ fontSize: 12.5, color: T.tenue, marginLeft: 6 }}>{hoy}</span>
          <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T.ojo }}>
            Prototipo · datos inventados
          </span>
          <button onClick={() => setClaro(!claro)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.tenue, padding: 3 }}>
            {claro ? <Moon size={14} /> : <Sun size={14} />}
          </button>
        </div>
      </header>

      {/* ══ EL EJE DE LA JORNADA — esto es la navegación ══════════════════ */}
      <nav style={{ borderBottom: `1px solid ${T.linea}`, background: T.panel }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', gap: 0 }}>
            {FASES.map((f) => {
              const activa = fase === f.id
              const esAhora = faseActual(horaAhora) === f.id
              const n = D[f.id].alertas
              const Ic = ICONO[f.id]
              return (
                <button key={f.id} onClick={() => setFase(f.id)}
                  style={{
                    flex: 1, minWidth: 0, padding: '14px 10px 12px', background: 'none', cursor: 'pointer',
                    border: 'none', borderBottom: `2px solid ${activa ? T.acento : 'transparent'}`,
                    textAlign: 'left', color: activa ? T.tinta : T.tenue,
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Ic size={13} />
                    <span style={{ fontSize: 13, fontWeight: activa ? 600 : 500, letterSpacing: '-.01em' }}>{f.nombre}</span>
                    {n > 0 && (
                      <span style={{
                        marginLeft: 'auto', minWidth: 17, height: 17, padding: '0 5px', borderRadius: 99,
                        background: activa ? T.acento : T.linea, color: activa ? '#fff' : T.suave,
                        fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}>{n}</span>
                    )}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11, color: T.tenue, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {esAhora ? <b style={{ color: T.acento }}>ahora</b> : f.desde >= 0 ? `${f.desde}-${f.hasta}h` : 'siempre'}
                    <span style={{ margin: '0 5px' }}>·</span>{f.sub}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      <main key={fase} className="animate-fade-in" style={{ maxWidth: 900, margin: '0 auto', padding: '38px 24px 100px' }}>
        {fase === 'arranque' && <Arranque T={T} d={D.arranque} hechos={hechos} setHechos={setHechos} />}
        {fase === 'ruta' && <Ruta T={T} d={D.ruta} />}
        {fase === 'cierre' && <Cierre T={T} d={D.cierre} hechos={hechos} setHechos={setHechos} />}
        {fase === 'semana' && <Semana T={T} d={D.semana} />}
      </main>
    </div>
  )
}

/* ── piezas comunes ───────────────────────────────────────────────────────── */
const Etq = ({ T, children }) => (
  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: T.tenue }}>{children}</div>
)
const H = ({ T, children, sub }) => (
  <>
    <h1 style={{ margin: '12px 0 0', fontSize: 'clamp(26px,4vw,40px)', lineHeight: 1.08, letterSpacing: '-.035em', fontWeight: 600 }}>{children}</h1>
    {sub && <p style={{ margin: '16px 0 0', fontSize: 16, lineHeight: 1.6, color: T.suave, maxWidth: 560, fontWeight: 300 }}>{sub}</p>}
  </>
)
const Nota = ({ T, children }) => (
  <p style={{ margin: '14px 0 0', fontSize: 12.5, lineHeight: 1.7, color: T.tenue }}>{children}</p>
)

/* ══ FASE 1 ════════════════════════════════════════════════════════════════ */
function Arranque({ T, d, hechos, setHechos }) {
  return (
    <>
      <Etq T={T}>Antes de salir</Etq>
      <H T={T} sub={d.bloqueadas > 0
        ? 'Cada ruta que no sale es ingreso perdido y un golpe al scorecard. Aquí está el cuadrante con lo único que decide si puede salir: furgoneta utilizable e inspección hecha.'
        : 'El cuadrante entero puede salir. Debajo está el detalle por si quieres comprobarlo.'}>
        {d.bloqueadas > 0
          ? <><span style={{ color: T.mal }}>{d.bloqueadas}</span> de {d.filas.length} rutas<br />no pueden salir.</>
          : <>Las {d.filas.length} rutas<br />pueden salir.</>}
      </H>

      <div style={{ marginTop: 34 }}>
        {d.filas.map((f) => {
          const hecho = hechos[f.vehicle_id]
          return (
            <div key={f.vehicle_id} style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '15px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.01em' }}>{f.matricula}</span>
                  <span style={{ fontSize: 12.5, color: T.tenue }}>{f.conductor}</span>
                </div>
                <div style={{ marginTop: 3, fontSize: 11.5, color: T.tenue }}>{f.modelo}</div>
              </div>

              <Estado T={T} tipo={f.inspeccion} />

              <div style={{ flex: '1 1 190px' }}>
                {f.bloqueos.length === 0
                  ? <span style={{ fontSize: 12.5, color: T.bien }}>Sin bloqueos</span>
                  : f.bloqueos.map((b, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: b.leve ? T.ojo : T.mal }}>
                      {b.txt}{b.detalle && <span style={{ color: T.tenue }}> · {b.detalle}</span>}
                    </div>
                  ))}
              </div>

              {(!f.puedeSalir || f.inspeccion !== 'ok') && (
                <button onClick={() => setHechos({ ...hechos, [f.vehicle_id]: !hecho })}
                  style={{
                    padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                    border: `1px solid ${hecho ? 'transparent' : T.linea}`,
                    background: hecho ? T.bien : 'transparent', color: hecho ? '#fff' : T.tinta,
                  }}>
                  {hecho ? <><Check size={12} style={{ verticalAlign: -1 }} /> Resuelto</> : (!f.puedeSalir ? 'Buscar sustituta' : 'Avisar')}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <Nota T={T}>
        {d.reserva.length > 0
          ? <>Reserva sin asignar: <b style={{ color: T.suave }}>{d.reserva.join(', ')}</b>. Es con lo que puedes cubrir un hueco.</>
          : 'No queda ninguna furgoneta sin asignar: no hay reserva.'}
        {' '}Esto cruza cuadrante, estado del vehículo, caducidad de ITV e inspección del día.
        <b style={{ color: T.suave }}> No predice absentismo</b>: no hay datos de asistencia.
      </Nota>
    </>
  )
}

function Estado({ T, tipo }) {
  const m = {
    ok: { t: 'Inspección hecha', c: T.bien, i: Check },
    falta: { t: 'Sin inspección', c: T.ojo, i: Circle },
    fallida: { t: 'Análisis fallido', c: T.mal, i: AlertTriangle },
  }[tipo]
  const I = m.i
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: m.c, minWidth: 132 }}>
      <I size={12} /> {m.t}
    </span>
  )
}

/* ══ FASE 2 ════════════════════════════════════════════════════════════════ */
function Ruta({ T, d }) {
  return (
    <>
      <Etq T={T}>En ruta</Etq>
      <H T={T} sub={<>Lo que ves aquí son <b style={{ color: T.tinta, fontWeight: 600 }}>hechos</b>: minutos desde la última entrega y paquetes pendientes. No hay predicción de hora de fin porque no se sostiene — se probó sobre 702 rutas y las que acababan mal iban al 60 % a las 14:00, las buenas al 62 %.</>}>
        {d.paradas > 0
          ? <><span style={{ color: T.mal }}>{d.paradas}</span> {d.paradas === 1 ? 'ruta lleva' : 'rutas llevan'}<br />más de 2 h sin entregar.</>
          : <>{d.entregados} de {d.total}<br />paquetes entregados.</>}
      </H>

      {d.congelado && (
        <div style={{ marginTop: 22, padding: '13px 16px', borderRadius: 10, background: T.mal + '12', border: `1px solid ${T.mal}33` }}>
          <b style={{ fontSize: 13.5, color: T.mal }}>Cortex lleva {d.frescura} minutos sin capturar.</b>
          <div style={{ marginTop: 4, fontSize: 12.5, color: T.suave }}>
            Todo lo de esta pantalla está congelado a esa hora. Los contadores siguen subiendo solos.
          </div>
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        {d.filas.map((r) => (
          <div key={r.route_code} style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '15px 0' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 600, minWidth: 74 }}>{r.route_code}</span>
              <span style={{ fontSize: 13, color: T.tenue, flex: '1 1 130px' }}>{r.driver_name}</span>
              <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: T.suave }}>{r.delivered}/{r.total}</span>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: r.parada ? T.mal : T.tenue, minWidth: 96, textAlign: 'right' }}>
                {r.min_sin_entregar != null ? `${Math.floor(r.min_sin_entregar / 60)}h ${String(r.min_sin_entregar % 60).padStart(2, '0')}m` : '—'}
              </span>
            </div>
            <div style={{ marginTop: 8, height: 4, background: T.lineaSuave, borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ width: `${r.pct}%`, height: '100%', background: r.parada ? T.mal : T.bien }} />
            </div>
            <div style={{ marginTop: 5, fontSize: 11.5, color: T.tenue }}>
              {r.pendientes} pendientes{r.missing > 0 && <span style={{ color: T.mal }}> · {r.missing} en paradero desconocido</span>}
              {r.parada && <span style={{ color: T.mal }}> · sin entregar desde hace rato</span>}
            </div>
          </div>
        ))}
      </div>

      <Nota T={T}>
        Un parón largo puede ser una comida, una zona sin cobertura o un edificio con muchas entregas seguidas.
        Caza el 70 % de las rutas que acaban mal pero acierta el 41 % de las veces, así que
        <b style={{ color: T.suave }}> no es una alerta automática</b>: se enseña con la ruta delante y decides tú.
      </Nota>
    </>
  )
}

/* ══ FASE 3 ════════════════════════════════════════════════════════════════ */
function Cierre({ T, d, hechos, setHechos }) {
  const accionables = d.casos.filter((c) => c.veredicto !== 'sin_distinguir')
  const dudosos = d.casos.filter((c) => c.veredicto === 'sin_distinguir')

  return (
    <>
      <Etq T={T}>Al cerrar</Etq>
      <H T={T} sub={<>Antes de decidir con quién hablar, el sistema separa <b style={{ color: T.tinta, fontWeight: 600 }}>si es la persona, el sitio o la hora</b>. Se calcula cruzando quién intentó cada dirección y cómo le fue. Cambia con quién hablas mañana.</>}>
        {accionables.length} cosas de hoy<br />que mañana son un problema.
      </H>

      <div style={{ marginTop: 34 }}>
        {accionables.map((c) => {
          const v = VER[c.veredicto]; const Ic = v.ic; const tono = T[v.tono]
          const hecho = hechos[c.id]
          return (
            <div key={c.id} style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '18px 0' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99, background: tono + '18', color: tono, fontSize: 11, fontWeight: 700 }}>
                <Ic size={12} /> {v.txt}
              </span>
              <h3 style={{ margin: '10px 0 0', fontSize: 16.5, fontWeight: 600, lineHeight: 1.32, letterSpacing: '-.015em' }}>{c.titulo}</h3>
              <p style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.65, color: T.suave, maxWidth: 600 }}>{c.porque}</p>
              <button onClick={() => setHechos({ ...hechos, [c.id]: !hecho })}
                style={{
                  marginTop: 13, padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  border: hecho ? 'none' : `1px solid ${T.linea}`,
                  background: hecho ? T.bien : 'transparent', color: hecho ? '#fff' : T.tinta,
                }}>
                {hecho ? <><Check size={13} style={{ verticalAlign: -2 }} /> En marcha · se medirá sola</> : c.accion.txt}
              </button>
            </div>
          )
        })}
      </div>

      {dudosos.length > 0 && (
        <div style={{ marginTop: 26, padding: '16px 18px', border: `1px solid ${T.linea}`, borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.tenue }}>{dudosos.length} caso(s) sin acción</div>
          {dudosos.map((c) => (
            <div key={c.id} style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.65, color: T.suave }}>
              {c.titulo}. <span style={{ color: T.tenue }}>{c.porque}</span>
            </div>
          ))}
          <div style={{ marginTop: 10, fontSize: 12, color: T.tenue }}>
            El sistema se niega a señalar a nadie sin poder separarlo de la dirección. Es el falso positivo más caro
            que puede cometer: se paga con una persona del equipo.
          </div>
        </div>
      )}

      <div style={{ marginTop: 40, display: 'grid', gap: 1, background: T.linea, border: `1px solid ${T.linea}`, borderRadius: 12, overflow: 'hidden' }}>
        <Cubo T={T} k="Daños nuevos hoy" v={d.danosNuevos.length}
          sub={d.danosNuevos.map((x) => `${x.matricula} · ${x.part}`).join(' · ') || 'Ninguno'} />
        <Cubo T={T} k="Daños que no gestiona nadie" v={d.sinGestionar} tono={T.ojo}
          sub={`${eur(d.sinGestionarEur)} por tarifa · ni taller ni presupuesto. Por defecto, lo pagas tú.`} />
        <Cubo T={T} k="Incidencias abiertas" v={d.incidencias.length}
          sub={d.incidencias.map((i) => `${i.matricula} · ${i.quien}`).join(' · ') || 'Ninguna'} />
      </div>

      <Nota T={T}>
        El {d.cierreHorario.pctCierre} % de los fallos por comercio cerrado caen entre las 14 y las 16 h, el cierre del
        mediodía. Eso no se arregla hablando con nadie: se arregla moviendo esas paradas de franja.
      </Nota>
    </>
  )
}

function Cubo({ T, k, v, sub, tono }) {
  return (
    <div style={{ background: T.panel, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: tono || T.tinta, flex: 1 }}>{k}</span>
        <span style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: tono || T.tinta }}>{v}</span>
      </div>
      <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.6, color: T.tenue }}>{sub}</div>
    </div>
  )
}

/* ══ FASE 4 ════════════════════════════════════════════════════════════════ */
function Semana({ T, d }) {
  const t = d.tier
  return (
    <>
      <Etq T={T}>La semana · te la juegas en {d.foco.corto}</Etq>
      <H T={T} sub={<>De las 17 scorecards que Amazon te ha mandado, <b style={{ color: T.tinta, fontWeight: 600 }}>{d.foco.semanas} llevaban {d.foco.corto} en las áreas de foco</b> y pesa {d.foco.peso}. El WHC pesa 10. Hubo una semana con el WHC al 100 % y el Overall en Fair: arreglar solo las horas no salva la semana.</>}>
        {d.dsc.length > 0
          ? <>Entre tu mejor y tu peor<br />conductor hay {Math.round((d.dsc[0].pct / d.dsc[d.dsc.length - 1].pct) * 10) / 10}× de diferencia.</>
          : <>Sin datos de DSC.</>}
      </H>

      <div style={{ marginTop: 32 }}>
        {d.dsc.map((c) => (
          <div key={c.driver_id} style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '13px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600, flex: '1 1 150px' }}>{c.nombre}</span>
            <span style={{ fontSize: 12.5, color: T.tenue }}>{c.entregas} entregas · {c.pct} %</span>
            <span style={{ fontSize: 14.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: c.exceso > 0 ? T.mal : T.bien, minWidth: 92, textAlign: 'right' }}>
              {c.exceso > 0 ? `+${c.exceso}` : c.exceso} paquetes
            </span>
          </div>
        ))}
      </div>
      <Nota T={T}>
        Ordenado por <b style={{ color: T.suave }}>exceso en paquetes</b>, nunca por porcentaje: un 9 % con 700 entregas
        no sobra nada; un 20 % con 200 sobra 23. Y hacen falta 80 entregas para entrar en la lista.
      </Nota>

      {t && (
        <div style={{ marginTop: 44, paddingTop: 26, borderTop: `1px solid ${T.linea}` }}>
          <Etq T={T}>Horas · el tier</Etq>
          <p style={{ margin: '12px 0 0', fontSize: 17, lineHeight: 1.5, fontWeight: 300, color: T.suave, maxWidth: 560 }}>
            {t.enZona.length === 0
              ? <>Nadie puede generar excepción: los {t.total} proyectan por debajo de {hm(t.suelo)}.</>
              : <>Sólo <b style={{ color: T.tinta, fontWeight: 600 }}>{t.enZona.length} de {t.total}</b> proyectan por encima de {hm(t.suelo)}, que es el máximo visto <i>cumpliendo</i>. Los otros {t.fuera} están demostrablemente fuera de riesgo.</>}
          </p>
          {t.enZona.map((c) => (
            <div key={c.id} style={{ borderTop: `1px solid ${T.lineaSuave}`, marginTop: 12, paddingTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline' }}>
              <span style={{ fontSize: 14.5, fontWeight: 600, flex: '1 1 150px' }}>{c.nombre}</span>
              <span style={{ fontSize: 12.5, color: T.tenue }}>{hm(c.trabajado)} hechas</span>
              <span style={{ fontSize: 14.5, fontWeight: 600, color: T.mal }}>{hm(c.proyeccion)}</span>
            </div>
          ))}
        </div>
      )}

      {d.ventana.enRiesgo.length > 0 && (
        <div style={{ marginTop: 40, padding: '18px 20px', borderRadius: 12, background: T.ojo + '10', border: `1px solid ${T.ojo}33` }}>
          <b style={{ fontSize: 14, color: T.ojo }}>{d.ventana.enRiesgo.length} días de reporte caducan en horas</b>
          <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.65, color: T.suave }}>
            Amazon rellena la columna DSC uno a tres días después de publicar el reporte. Si no vuelves a
            descargarlo en esa ventana, ese día se queda a cero <b style={{ color: T.tinta }}>para siempre</b>.
            Se comprobó: seis reportes viejos re-descargados, ninguno cambió.
          </div>
          <div style={{ marginTop: 10 }}>
            {d.ventana.enRiesgo.map((r) => (
              <div key={r.fecha} style={{ fontSize: 12.5, color: T.suave, padding: '3px 0' }}>
                {r.fecha} · {r.pendientes} sin clasificar · <b style={{ color: r.diasRestantes <= 1 ? T.mal : T.ojo }}>
                  {r.diasRestantes === 0 ? 'último día' : r.diasRestantes === 1 ? 'queda 1 día' : `quedan ${r.diasRestantes} días`}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 44, paddingTop: 26, borderTop: `1px solid ${T.linea}` }}>
        <Etq T={T}>Lo que decidiste · y si funcionó</Etq>
        <p style={{ margin: '12px 0 20px', fontSize: 15, lineHeight: 1.6, color: T.suave, maxWidth: 560, fontWeight: 300 }}>
          <b style={{ color: T.tinta, fontWeight: 600 }}>{d.funcionaron} de {d.cerrados.length}</b> intervenciones se puede
          demostrar que funcionaron. Sin 20 intentos posteriores no se afirma nada: «sin datos» es un resultado válido
          y no cuenta como éxito.
        </p>
        {d.cerrados.map((h) => {
          const color = h.r.estado === 'funciono' ? T.bien : h.r.estado === 'no_funciono' ? T.mal : T.tenue
          return (
            <div key={h.id} style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '14px 0' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 14.5, fontWeight: 600, flex: '1 1 260px' }}>{h.titulo}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color }}>
                  {h.r.estado === 'funciono' ? 'Funcionó' : h.r.estado === 'no_funciono' ? 'No funcionó' : 'Sin datos'}
                </span>
              </div>
              <div style={{ marginTop: 5, fontSize: 12.5, color: T.tenue }}>
                {h.r.delta !== null
                  ? `${h.r.antes} % → ${h.r.despues} % de fallo · ${h.antes.intentos} intentos antes, ${h.despues.intentos} después`
                  : h.r.nota}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
