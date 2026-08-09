/* ─────────────────────────────────────────────────────────────────────────────
   GEN 2 · CASOS
   ---------------------------------------------------------------------------
   Diferencia con todo lo anterior del laboratorio: esto NO se lee, se trabaja.

   Un caso se acepta, se asigna, se pone fecha y —lo que de verdad importa— se
   MIDE semanas después. La pantalla tiene dos mitades y la segunda es la que
   justifica la suscripción:

     ARRIBA   lo que hay que decidir hoy
     ABAJO    lo que decidiste antes y si funcionó

   Sin la mitad de abajo esto sería otro informe. Con ella, el producto acumula
   "qué funciona de verdad en MI flota", que es lo único que un competidor no
   puede copiar: no está en el software, está en el histórico del cliente.

   Y el veredicto SITIO / FRANJA / PERSONA es la respuesta a la pregunta que
   cambia con quién hablas el lunes. El cuarto veredicto —"no se puede
   distinguir"— existe porque señalar a una persona sin poder separarla de la
   dirección es el falso positivo más caro de este producto: se paga con
   alguien de tu equipo.

   Datos: LAB/SIMULATED. Los cambios de estado son reales en la pantalla pero
   no salen de aquí: no hay escritura contra ninguna base.
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Sun, Moon, MapPin, Clock, User, HelpCircle, ChevronDown, Check } from 'lucide-react'
import { CLARO, OSCURO } from '../v2/tema'
/* La lógica vive en `deteccion.js`, NO en `casos.js`: en Windows el sistema de
   ficheros no distingue mayúsculas y `casos.js` colisionaría con este
   `Casos.jsx`. El import resolvería al .js —sin export default— y React
   revienta con "Cannot convert object to primitive value". Ya pasó dos veces. */
import { detectarCasos, historial, resultado, UMBRALES, impacto } from './deteccion'
import { conductores } from '../datos'

const VEREDICTO = {
  sitio:          { txt: 'Es el sitio',        icono: MapPin,     tono: 'acento' },
  franja:         { txt: 'Es la franja',       icono: Clock,      tono: 'ojo' },
  persona:        { txt: 'Es la persona',      icono: User,       tono: 'mal' },
  sin_distinguir: { txt: 'No se distingue',    icono: HelpCircle, tono: 'tenue' },
}

export default function Casos() {
  const [claro, setClaro] = useState(true)
  const T = claro ? CLARO : OSCURO
  const nombreDe = (id) => conductores.find((c) => c.id === id)?.name || id

  const detectados = useMemo(() => detectarCasos(nombreDe), [])
  const [estado, setEstado] = useState({})     // id -> 'aceptado' | 'descartado'
  const [abierto, setAbierto] = useState(null)
  const [valorParada, setValorParada] = useState('')

  const pendientes = detectados.filter((c) => !estado[c.id])
  const aceptados = detectados.filter((c) => estado[c.id] === 'aceptado')

  const cerrados = historial.map((h) => ({ ...h, r: resultado(h) }))
  const funcionaron = cerrados.filter((h) => h.r.estado === 'funciono')
  const fallosEvitados = funcionaron.reduce((a, h) => {
    const esperados = h.despues.intentos * (h.antes.fallos / h.antes.intentos)
    return a + Math.max(0, Math.round(esperados - h.despues.fallos))
  }, 0)
  const dinero = impacto(fallosEvitados, Number(valorParada) || 0)

  return (
    <div style={{ background: T.papel, color: T.tinta, minHeight: '100vh' }}>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '0 24px 110px' }}>

        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0 0' }}>
          <Link to="/lab" style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.tenue, fontSize: 12.5, textDecoration: 'none' }}>
            <ArrowLeft size={13} /> Lab
          </Link>
          <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T.ojo }}>
            Prototipo · operación inventada
          </span>
          <button onClick={() => setClaro(!claro)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 8, border: `1px solid ${T.linea}`, background: 'transparent', color: T.suave, fontSize: 12, cursor: 'pointer' }}>
            {claro ? <Moon size={12.5} /> : <Sun size={12.5} />}{claro ? 'Oscuro' : 'Claro'}
          </button>
        </header>

        {/* ══ TITULAR ══════════════════════════════════════════════════════ */}
        <section style={{ paddingTop: 52 }}>
          <Etq T={T}>Casos · lo que hay que decidir</Etq>
          <h1 style={{ margin: '14px 0 0', fontSize: 'clamp(30px,4.6vw,48px)', lineHeight: 1.04, letterSpacing: '-.035em', fontWeight: 600 }}>
            {pendientes.length > 0
              ? <>{pendientes.length} decisiones,<br />y ninguna es «habla con todos».</>
              : <>Nada que decidir hoy.</>}
          </h1>
          <p style={{ margin: '20px 0 0', fontSize: 16.5, lineHeight: 1.6, color: T.suave, maxWidth: 570, fontWeight: 300 }}>
            Cada caso responde antes que nada a una pregunta:
            <b style={{ color: T.tinta, fontWeight: 600 }}> ¿es la persona, es el sitio o es la hora?</b> Se calcula
            cruzando quién intentó cada dirección y cómo le fue. Cambia con quién hablas el lunes.
          </p>
        </section>

        {/* ══ CASOS ════════════════════════════════════════════════════════ */}
        <section style={{ paddingTop: 40 }}>
          {pendientes.map((c) => (
            <Caso key={c.id} T={T} c={c}
              abierto={abierto === c.id}
              onAbrir={() => setAbierto(abierto === c.id ? null : c.id)}
              onAceptar={() => { setEstado({ ...estado, [c.id]: 'aceptado' }); setAbierto(null) }}
              onDescartar={() => { setEstado({ ...estado, [c.id]: 'descartado' }); setAbierto(null) }} />
          ))}

          {aceptados.length > 0 && (
            <div style={{ marginTop: 26, padding: '16px 18px', border: `1px solid ${T.linea}`, borderRadius: 12, background: T.panel }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.acento }}>
                {aceptados.length} caso(s) puestos en marcha
              </div>
              <div style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.7, color: T.suave }}>
                {aceptados.map((c) => c.titulo).join(' · ')}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: T.tenue }}>
                Se medirán solos dentro de {UMBRALES.medicion_min_intentos} intentos. Hasta entonces no dirán si
                funcionaron: eso es lo que los separa de una tarea en una lista.
              </div>
            </div>
          )}
        </section>

        {/* ══ LA MITAD QUE JUSTIFICA LA SUSCRIPCIÓN ════════════════════════ */}
        <section style={{ paddingTop: 70 }}>
          <Etq T={T}>Lo que decidiste antes · y si funcionó</Etq>
          <h2 style={{ margin: '14px 0 0', fontSize: 'clamp(24px,3.2vw,32px)', lineHeight: 1.12, letterSpacing: '-.03em', fontWeight: 600 }}>
            {funcionaron.length} de {cerrados.length} intervenciones<br />se puede demostrar que funcionaron.
          </h2>
          <p style={{ margin: '16px 0 0', fontSize: 15, lineHeight: 1.65, color: T.suave, maxWidth: 560, fontWeight: 300 }}>
            Antes y después, con la misma medida. Sin {UMBRALES.medicion_min_intentos} intentos posteriores no se
            afirma nada: <b style={{ color: T.tinta, fontWeight: 600 }}>«sin datos» es un resultado válido</b>, y no se
            cuenta como éxito.
          </p>

          <div style={{ marginTop: 28 }}>
            {cerrados.map((h) => <Cerrado key={h.id} T={T} h={h} />)}
          </div>
        </section>

        {/* ══ EL DINERO, POR EL CAMINO HONESTO ═════════════════════════════ */}
        <section style={{ paddingTop: 60 }}>
          <div style={{ padding: '22px 22px', border: `1px solid ${T.linea}`, borderRadius: 14, background: T.panel }}>
            <Etq T={T}>Cuánto vale esto</Etq>
            <p style={{ margin: '12px 0 0', fontSize: 14.5, lineHeight: 1.65, color: T.suave }}>
              No sabemos lo que te cuesta una entrega fallida y no lo vamos a inventar.
              <b style={{ color: T.tinta, fontWeight: 600 }}> Dilo tú</b> y hacemos la cuenta: el dato es tuyo, así que
              la cifra es defendible delante de quien haga falta.
            </p>
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: 13.5, color: T.suave }}>Lo que te cuesta un fallo de entrega</label>
              <input
                type="number" min="0" value={valorParada} placeholder="€"
                onChange={(e) => setValorParada(e.target.value)}
                style={{ width: 96, padding: '7px 10px', borderRadius: 8, border: `1px solid ${T.linea}`, background: 'transparent', color: T.tinta, fontSize: 14 }} />
              <span style={{ fontSize: 13, color: T.tenue }}>× {fallosEvitados} fallos evitados</span>
            </div>

            {dinero ? (
              <p style={{ margin: '16px 0 0', fontSize: 21, fontWeight: 600, letterSpacing: '-.02em' }}>
                {dinero.eur.toLocaleString('es-ES')} €
                <span style={{ marginLeft: 10, fontSize: 12.5, fontWeight: 400, color: T.tenue }}>
                  con tu cifra de {dinero.base} € · aritmética, no estimación
                </span>
              </p>
            ) : (
              <p style={{ margin: '16px 0 0', fontSize: 13, color: T.tenue }}>
                Sin tu cifra, aquí no aparece ningún euro. Es a propósito.
              </p>
            )}
            <p style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.7, color: T.tenue }}>
              «Fallos evitados» = los que habrían ocurrido al ritmo anterior menos los que ocurrieron, sólo en las
              intervenciones con medición suficiente. Las que no se pueden medir no suman.
            </p>
          </div>
        </section>

        <footer style={{ marginTop: 60, borderTop: `1px solid ${T.linea}`, paddingTop: 22, fontSize: 12, lineHeight: 1.7, color: T.tenue }}>
          Direcciones, nombres e intentos son inventados. La <b>lógica</b> —los umbrales de evidencia, la
          desambiguación sitio/franja/persona y la regla de no afirmar sin medición— está escrita contra los campos
          reales de Cortex (<code>stop_id</code>, <code>stop_address</code>, <code>driver_id</code>).
          Aceptar o descartar un caso <b>no escribe en ninguna base</b>: es estado de esta pantalla.
        </footer>
      </div>
    </div>
  )
}

/* ── piezas ───────────────────────────────────────────────────────────────── */

function Etq({ T, children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: T.tenue }}>{children}</div>
}

function Caso({ T, c, abierto, onAbrir, onAceptar, onDescartar }) {
  const v = VEREDICTO[c.veredicto]
  const Icono = v.icono
  const tono = T[v.tono]
  const accionable = c.veredicto !== 'sin_distinguir'

  return (
    <article style={{ borderTop: `1px solid ${T.linea}`, padding: '22px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99,
          background: tono + '18', color: tono, fontSize: 11, fontWeight: 700, letterSpacing: '.02em',
        }}>
          <Icono size={12} /> {v.txt}
        </span>
        <span style={{ fontSize: 12, color: T.tenue }}>{c.fallos} fallos</span>
      </div>

      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-.015em' }}>{c.titulo}</h3>
      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.65, color: T.suave, maxWidth: 580 }}>{c.porque}</p>

      {accionable ? (
        <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <button onClick={onAceptar} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9,
            border: 'none', background: tono, color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}>
            <Check size={14} /> {c.accion.txt}
          </button>
          {c.accion.destino && <span style={{ fontSize: 12, color: T.tenue }}>→ {c.accion.destino}</span>}
          <button onClick={onDescartar} style={{
            padding: '8px 12px', borderRadius: 9, border: `1px solid ${T.linea}`,
            background: 'transparent', color: T.suave, fontSize: 13, cursor: 'pointer',
          }}>
            No es un problema
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: T.tenue, fontStyle: 'italic' }}>
            Sin acción: el sistema se niega a señalar a nadie sin poder demostrarlo.
          </span>
          <button onClick={onDescartar} style={{
            padding: '6px 11px', borderRadius: 9, border: `1px solid ${T.linea}`,
            background: 'transparent', color: T.suave, fontSize: 12.5, cursor: 'pointer',
          }}>
            Ocultar
          </button>
        </div>
      )}

      <button onClick={onAbrir} style={{
        marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none',
        border: 'none', padding: 0, color: T.tenue, fontSize: 12.5, cursor: 'pointer',
      }}>
        <ChevronDown size={13} style={{ transform: abierto ? '' : 'rotate(-90deg)', transition: 'transform .2s' }} />
        {c.evidencia.length} intentos que lo sostienen
      </button>

      {abierto && (
        <div className="animate-fade-in" style={{ marginTop: 12, padding: '14px 16px', borderRadius: 10, background: T.papel === CLARO.papel ? '#fff' : '#111' , border: `1px solid ${T.lineaSuave}` }}>
          {c.evidencia.map((e, i) => (
            <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '5px 0', fontSize: 12.5 }}>
              <span style={{ color: T.tenue, minWidth: 78, fontVariantNumeric: 'tabular-nums' }}>{e.fecha}</span>
              <span style={{ color: T.tenue, minWidth: 30 }}>{e.hora}h</span>
              <span style={{ flex: '1 1 150px', color: T.tinta }}>{e.quien}</span>
              <span style={{ color: T.suave }}>{e.causa}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

function Cerrado({ T, h }) {
  const r = h.r
  const color = r.estado === 'funciono' ? T.bien : r.estado === 'no_funciono' ? T.mal : T.tenue
  return (
    <div style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '16px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, flex: '1 1 240px', letterSpacing: '-.01em' }}>{h.titulo}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color }}>
          {r.estado === 'funciono' ? 'Funcionó' : r.estado === 'no_funciono' ? 'No funcionó' : 'Sin datos'}
        </span>
      </div>
      <div style={{ marginTop: 5, fontSize: 12.5, color: T.tenue }}>
        {h.accion} · {h.responsable} · {h.fecha}
      </div>
      {r.delta !== null ? (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <span style={{ color: T.tenue }}>{r.antes} % fallo</span>
          <span style={{ color: T.tenue }}>→</span>
          <span style={{ fontWeight: 600, color }}>{r.despues} %</span>
          <span style={{ color: T.tenue, fontSize: 12 }}>
            ({h.antes.intentos} intentos antes · {h.despues.intentos} después) · {r.nota}
          </span>
        </div>
      ) : (
        <div style={{ marginTop: 8, fontSize: 12.5, color: T.ojo }}>{r.nota}</div>
      )}
    </div>
  )
}
