/* ─────────────────────────────────────────────────────────────────────────────
   V2 · "LA SEMANA" — una sola página, tres preguntas
   ---------------------------------------------------------------------------
   POR QUÉ ESTO Y NO OTRO PANEL

   Lo anterior estaba organizado por SUSTANTIVOS (furgonetas, conductores) y eso
   es una herramienta de operación. Quien firma el cheque no piensa en
   sustantivos, piensa en consecuencias. Un dueño de DSP abre esto con tres
   preguntas, y son siempre las mismas:

     ¿Sigo siendo Fantastic?   El tier decide cuántas rutas te asignan.
     ¿Qué me está costando?    El daño que nadie gestiona lo acabas pagando tú.
     ¿Cubro mañana?            Una ruta sin furgoneta es ingreso perdido.

   Así que la aplicación es una página con esas tres respuestas y nada más. Sin
   menú, sin pestañas, sin dashboard. El detalle se abre encima cuando hace
   falta. Si algo no cabe aquí, probablemente no había que mirarlo cada día.

   POR QUÉ CLARA Y NO OSCURA

   El modo noche va bien para un panel de vigilancia que se mira ocho horas.
   Esto se mira tres minutos por la mañana y se enseña en una reunión de venta.
   Superficie clara, tipografía como instrumento y un solo acento leen como
   software caro; el degradado y la tarjeta de colores leen como plantilla.
   Hay interruptor para verlo en oscuro y comparar.

   OJO CON EL NOMBRE DEL FICHERO: este componente NO puede llamarse Negocio.jsx
   porque al lado vive negocio.js (la lógica). Windows no distingue mayúsculas,
   así que import('./v2/Negocio') resolvía al .js de lógica —sin export default—
   y React reventaba al intentar avisarlo. Costó encontrarlo; no lo repitas.

   Datos: LAB/SIMULATED (datos.js). Nada de aquí sale de una base real.
   ───────────────────────────────────────────────────────────────────────────── */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, X, Sun, Moon, ChevronRight } from 'lucide-react'
import { DATOS_SINTETICOS } from '../datos'
import { estadoTier, estadoDinero, estadoManana, huecos } from './negocio'
import { hm, fecha } from '../motor'

const SUELO = 56 * 60 + 30

/* Tema propio en variables locales: no depende del tema del panel ni lo pisa. */
const CLARO = {
  papel: '#faf9f7', tinta: '#141414', suave: '#6b6b6b', tenue: '#9a9a9a',
  linea: 'rgba(20,20,20,.10)', lineaSuave: 'rgba(20,20,20,.055)',
  panel: '#ffffff', acento: '#d4541f',
  bien: '#0f7a52', mal: '#b3261e', ojo: '#8a5a00',
}
const OSCURO = {
  papel: '#0b0b0c', tinta: '#f2f1ef', suave: '#a0a0a0', tenue: '#6a6a6a',
  linea: 'rgba(255,255,255,.13)', lineaSuave: 'rgba(255,255,255,.07)',
  panel: '#161617', acento: '#ff7a45',
  bien: '#4ade80', mal: '#ff6b6b', ojo: '#e0a33a',
}

const eur = (n) => `${Math.round(n || 0).toLocaleString('es-ES')} €`

export default function Semana() {
  const D = DATOS_SINTETICOS
  const [claro, setClaro] = useState(true)
  const [detalle, setDetalle] = useState(null)
  const T = claro ? CLARO : OSCURO

  const tier = estadoTier(D)
  const dinero = estadoDinero(D)
  const manana = estadoManana(D)
  const gaps = huecos(D)

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setDetalle(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <div style={{ background: T.papel, color: T.tinta, minHeight: '100vh' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 100px' }}>

        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0 0' }}>
          <Link to="/lab" style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.tenue, fontSize: 12.5, textDecoration: 'none' }}>
            <ArrowLeft size={13} /> Lab
          </Link>
          <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T.ojo }}>
            Prototipo · datos inventados
          </span>
          <button
            onClick={() => setClaro(!claro)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 8, border: `1px solid ${T.linea}`, background: 'transparent', color: T.suave, fontSize: 12, cursor: 'pointer' }}
          >
            {claro ? <Moon size={12.5} /> : <Sun size={12.5} />}
            {claro ? 'Oscuro' : 'Claro'}
          </button>
        </header>

        {/* ══ 1 · EL TIER ══════════════════════════════════════════════════ */}
        {tier && (
          <section style={{ paddingTop: 56 }}>
            <Etiqueta T={T}>Semana {tier.semana} · sin cerrar</Etiqueta>

            <h1 style={{ margin: '14px 0 0', fontSize: 'clamp(32px,5.2vw,54px)', lineHeight: 1.02, letterSpacing: '-.035em', fontWeight: 600 }}>
              {tier.intacto ? (
                <>Tu <span style={{ color: T.bien }}>Fantastic</span><br />sigue intacto.</>
              ) : (
                <>El Fantastic de<br />esta semana <span style={{ color: T.mal }}>ya no</span>.</>
              )}
            </h1>

            <p style={{ margin: '20px 0 0', fontSize: 17, lineHeight: 1.6, color: T.suave, maxWidth: 540, fontWeight: 300 }}>
              {tier.intacto ? (
                <>Amazon no ha reportado ninguna excepción de horas. En 17 semanas medidas,
                  <b style={{ color: T.tinta, fontWeight: 600 }}> cero excepciones ha significado siempre Fantastic</b> — y
                  una sola, nunca.</>
              ) : (
                <><b style={{ color: T.tinta, fontWeight: 600 }}>{tier.excepciones} excepción(es)</b> reportadas.
                  En 17 semanas medidas, ninguna con excepciones acabó en Fantastic.</>
              )}
            </p>

            <div style={{ marginTop: 40, borderTop: `1px solid ${T.linea}`, paddingTop: 24 }}>
              <Etiqueta T={T}>Quién puede romperlo</Etiqueta>

              {tier.enZona.length === 0 ? (
                <>
                  <p style={{ margin: '14px 0 0', fontSize: 21, lineHeight: 1.4, letterSpacing: '-.02em' }}>
                    Nadie, con lo planificado ahora mismo.
                  </p>
                  <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.65, color: T.suave, maxWidth: 520 }}>
                    Los {tier.total} conductores proyectan por debajo de {hm(tier.suelo)}, que es el máximo que se ha
                    visto <i>cumpliendo</i>. Por debajo de ahí no ha saltado una excepción jamás.
                  </p>
                </>
              ) : (
                <>
                  <p style={{ margin: '14px 0 18px', fontSize: 14, lineHeight: 1.65, color: T.suave, maxWidth: 520 }}>
                    Sólo estos {tier.enZona.length} proyectan por encima de {hm(tier.suelo)}. Los otros {tier.fuera} están
                    fuera de la zona donde una excepción es posible.
                  </p>
                  {tier.enZona.map((c) => (
                    <Fila key={c.id} T={T}
                      izq={c.nombre}
                      centro={`${hm(c.trabajado)} hechas`}
                      der={hm(c.proyeccion)}
                      derColor={T.mal}
                      pie={`${c.bloques_restantes} bloque(s) por delante`} />
                  ))}
                </>
              )}

              <button onClick={() => setDetalle('tier')} style={btnLink(T)}>
                Por qué {hm(tier.suelo)} y no tu límite de 55 h <ChevronRight size={13} />
              </button>
            </div>

            {tier.coste_una_excepcion && (
              <p style={{ margin: '26px 0 0', fontSize: 13.5, color: T.tenue, lineHeight: 1.6 }}>
                Cada excepción cuesta <b style={{ color: T.suave }}>{tier.coste_una_excepcion} puntos</b> de WHC
                sobre {tier.total} conductores con actividad.
              </p>
            )}
          </section>
        )}

        {/* ══ 2 · EL DINERO ════════════════════════════════════════════════ */}
        <section style={{ paddingTop: 72 }}>
          <Etiqueta T={T}>Daños · dinero</Etiqueta>

          <h2 style={{ margin: '14px 0 0', fontSize: 'clamp(26px,3.6vw,36px)', lineHeight: 1.1, letterSpacing: '-.03em', fontWeight: 600 }}>
            {dinero.sinGestionar.n > 0 ? (
              <>Hay <span style={{ color: T.ojo }}>{dinero.sinGestionar.n} daños</span> que<br />no está gestionando nadie.</>
            ) : (
              <>Todos los daños abiertos<br />tienen taller asignado.</>
            )}
          </h2>

          {dinero.sinGestionar.n > 0 && (
            <p style={{ margin: '18px 0 0', fontSize: 15.5, lineHeight: 1.65, color: T.suave, maxWidth: 540, fontWeight: 300 }}>
              Ni taller, ni presupuesto, ni importe. Mientras siga así, no se ha decidido si lo paga el seguro, el
              renting o tú. <b style={{ color: T.tinta, fontWeight: 600 }}>Por defecto, lo pagas tú.</b>
            </p>
          )}

          <div style={{ marginTop: 34, display: 'grid', gap: 1, background: T.linea, border: `1px solid ${T.linea}`, borderRadius: 12, overflow: 'hidden' }}>
            <Cubo T={T} papel={T.panel} titulo="Sin gestionar" n={dinero.sinGestionar.n}
              importe={dinero.sinGestionar.eur} tono={T.ojo} clase="tarifa"
              nota="Nadie lo ha tocado" onVer={() => setDetalle('sin')} />
            <Cubo T={T} papel={T.panel} titulo="En taller" n={dinero.comprometido.n}
              importe={dinero.comprometido.eur} tono={T.suave} clase="tarifa"
              nota="Comprometido, importe pendiente" onVer={() => setDetalle('taller')} />
            <Cubo T={T} papel={T.panel} titulo="Ya pagado" n={dinero.gastado.n}
              importe={dinero.gastado.eur} tono={T.tinta} clase="factura"
              nota="Facturas reales introducidas" onVer={() => setDetalle('pagado')} />
          </div>

          <p style={{ margin: '16px 0 0', fontSize: 12.5, lineHeight: 1.7, color: T.tenue }}>
            <b style={{ color: T.suave }}>Ojo con estos euros.</b> Sólo «Ya pagado» son facturas. Los otros dos salen de
            una <i>tarifa</i> por panel y severidad, no de un presupuesto: sirven para priorizar, no para contabilizar.
            {dinero.desviacion !== null && (
              <> Donde existen ambos ({dinero.muestraDesviacion} casos), la factura real se desvió
                un <b style={{ color: T.suave }}>{dinero.desviacion > 0 ? '+' : ''}{dinero.desviacion} %</b> de la tarifa.</>
            )}
          </p>
        </section>

        {/* ══ 3 · MAÑANA ═══════════════════════════════════════════════════ */}
        <section style={{ paddingTop: 72 }}>
          <Etiqueta T={T}>Mañana{manana.hay ? ` · ${fecha(manana.fecha)}` : ''}</Etiqueta>

          {!manana.hay ? (
            <>
              <h2 style={{ margin: '14px 0 0', fontSize: 'clamp(24px,3.2vw,32px)', lineHeight: 1.15, letterSpacing: '-.03em', fontWeight: 600, color: T.suave }}>
                No lo sé.
              </h2>
              <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.65, color: T.suave, maxWidth: 520 }}>{manana.motivo}</p>
            </>
          ) : (
            <>
              <h2 style={{ margin: '14px 0 0', fontSize: 'clamp(26px,3.6vw,36px)', lineHeight: 1.1, letterSpacing: '-.03em', fontWeight: 600 }}>
                {manana.cubierto ? (
                  <>Las {manana.rutas} rutas<br />están cubiertas.</>
                ) : (
                  <><span style={{ color: T.mal }}>{manana.problemas.length}</span> de {manana.rutas} rutas<br />tienen un problema.</>
                )}
              </h2>

              <div style={{ marginTop: 28 }}>
                {manana.problemas.map((p, i) => (
                  <Fila key={i} T={T} izq={p.txt} centro={p.quien} der="" pie={p.detalle} malo />
                ))}
              </div>

              <p style={{ margin: '20px 0 0', fontSize: 13.5, lineHeight: 1.65, color: T.tenue }}>
                {manana.reservas.length > 0
                  ? <>Sin asignar mañana: <b style={{ color: T.suave }}>{manana.reservas.join(', ')}</b>. Es la reserva que tienes.</>
                  : 'No queda ninguna furgoneta sin asignar: no hay reserva.'}
              </p>
              <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.7, color: T.tenue }}>
                Esto cruza cuadrante, estado del vehículo y caducidad de ITV. <b style={{ color: T.suave }}>No predice
                absentismo</b>: no hay datos de asistencia.
              </p>
            </>
          )}
        </section>

        {/* ══ 4 · LO QUE NO SÉ ═════════════════════════════════════════════ */}
        {gaps.length > 0 && (
          <section style={{ paddingTop: 72 }}>
            <Etiqueta T={T}>Lo que aún no puedo responder</Etiqueta>
            <p style={{ margin: '14px 0 26px', fontSize: 15, lineHeight: 1.65, color: T.suave, maxWidth: 540, fontWeight: 300 }}>
              No son fallos, son huecos de datos. Cada uno dice qué se desbloquea al rellenarlo.
            </p>
            {gaps.map((g, i) => (
              <div key={i} style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '18px 0' }}>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.01em' }}>{g.que}</div>
                {g.quien && <div style={{ marginTop: 3, fontSize: 12.5, color: T.tenue }}>{g.quien}</div>}
                <div style={{ marginTop: 7, fontSize: 13.5, lineHeight: 1.6, color: T.suave }}>
                  <span style={{ color: T.acento }}>→</span> {g.desbloquea}
                </div>
                {g.donde && <div style={{ marginTop: 6, fontSize: 11.5, color: T.tenue }}>{g.donde}</div>}
              </div>
            ))}
          </section>
        )}

        <footer style={{ marginTop: 72, borderTop: `1px solid ${T.linea}`, paddingTop: 22, fontSize: 12, lineHeight: 1.7, color: T.tenue }}>
          Todo lo de esta página son datos inventados para probar la interfaz: las matrículas acaban en «LAB» y los
          nombres no corresponden a nadie. Las reglas —el suelo de {hm(SUELO)}, la regla de la excepción y la tarifa
          por panel— sí salen del sistema real.
        </footer>
      </div>

      {detalle && <Detalle T={T} cual={detalle} tier={tier} dinero={dinero} onCerrar={() => setDetalle(null)} />}
    </div>
  )
}

/* ── piezas ───────────────────────────────────────────────────────────────── */

function Etiqueta({ T, children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: T.tenue }}>
      {children}
    </div>
  )
}

function Fila({ T, izq, centro, der, derColor, pie, malo }) {
  return (
    <div style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '13px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 }}>
      <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.01em', color: malo ? T.mal : T.tinta, flex: '1 1 180px' }}>{izq}</span>
      {centro && <span style={{ fontSize: 13, color: T.tenue }}>{centro}</span>}
      {der && <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: derColor || T.tinta }}>{der}</span>}
      {pie && <span style={{ flexBasis: '100%', fontSize: 12, color: T.tenue }}>{pie}</span>}
    </div>
  )
}

/* El prop se llama `importe`, no `eur`: dar a un prop el mismo nombre que una
   función del módulo es pedir un choque de nombres que no se ve al leer. */
function Cubo({ T, papel, titulo, n, importe, tono, nota, clase, onVer }) {
  return (
    <button
      onClick={onVer}
      disabled={!n}
      style={{
        background: papel, border: 'none', textAlign: 'left', padding: '18px 20px',
        cursor: n ? 'pointer' : 'default', display: 'flex', alignItems: 'baseline', gap: 14, width: '100%',
      }}
    >
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: tono }}>{titulo}</div>
        <div style={{ marginTop: 2, fontSize: 12, color: T.tenue }}>{nota}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.025em', fontVariantNumeric: 'tabular-nums', color: tono }}>
          {eur(importe)}
        </div>
        <div style={{ marginTop: 1, fontSize: 11, color: T.tenue }}>
          {n} {n === 1 ? 'daño' : 'daños'} · {clase}
        </div>
      </div>
      {!!n && <ChevronRight size={15} style={{ color: T.tenue, flexShrink: 0 }} />}
    </button>
  )
}

function btnLink(T) {
  return {
    marginTop: 22, display: 'inline-flex', alignItems: 'center', gap: 4,
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    color: T.acento, fontSize: 13.5, fontWeight: 500,
  }
}

/* El detalle se abre encima. No navega: no se pierde dónde estabas. */
function Detalle({ T, cual, dinero, tier, onCerrar }) {
  const mapa = {
    sin: { t: 'Sin gestionar', lista: dinero.sinGestionar.lista, pie: 'Ni taller ni importe. Cada línea es una decisión que nadie ha tomado.' },
    taller: { t: 'En taller', lista: dinero.comprometido.lista, pie: 'Trabajo comprometido. El importe real se sabrá con la factura.' },
    pagado: { t: 'Ya pagado', lista: dinero.gastado.lista, pie: 'Importes reales introducidos tras la reparación.' },
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)' }} onClick={onCerrar} />
      <aside className="animate-pop" style={{
        position: 'relative', height: '100%', width: '100%', maxWidth: 460, overflowY: 'auto',
        background: T.papel, color: T.tinta, borderLeft: `1px solid ${T.linea}`, padding: '22px 24px 60px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <h3 style={{ margin: 0, flex: 1, fontSize: 20, fontWeight: 600, letterSpacing: '-.02em' }}>
            {cual === 'tier' ? `Por qué ${hm(SUELO)}` : mapa[cual].t}
          </h3>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.suave, padding: 2 }}>
            <X size={18} />
          </button>
        </div>

        {cual === 'tier' ? (
          <div style={{ marginTop: 18, fontSize: 14, lineHeight: 1.7, color: T.suave }}>
            <p style={{ margin: 0 }}>
              Tu límite de <b style={{ color: T.tinta }}>55 h</b> es contractual tuyo. Marcar a alguien por pasarlo no
              dice nada sobre Amazon, y manda al gestor a hablar con gente que no ha incumplido nada.
            </p>
            <p style={{ marginTop: 14 }}>
              El umbral de Amazon <b style={{ color: T.tinta }}>no se conoce</b>. Pero sí hay una cosa medida: en la
              semana 31 un conductor hizo <b style={{ color: T.tinta }}>56 h 30 m</b> y Amazon marcó
              <i> Weekly Limit Exceeded = No</i>. Su umbral real está por encima de ahí.
            </p>
            <p style={{ marginTop: 14 }}>
              Por eso el cribado usa el <b style={{ color: T.tinta }}>suelo observado</b> y no tu límite: quien proyecta
              por debajo de {hm(SUELO)} es demostrablemente seguro. Así la lista sale corta y accionable, en vez de
              media plantilla marcada.
            </p>
            {tier && (
              <p style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.lineaSuave}` }}>
                Ahora mismo: <b style={{ color: T.tinta }}>{tier.enZona.length}</b> en zona,
                <b style={{ color: T.tinta }}> {tier.fuera}</b> demostrablemente fuera.
              </p>
            )}
            <p style={{ marginTop: 14, fontSize: 12.5, color: T.tenue }}>
              Fuente: docs/WHC.md §6.2 · 17 semanas de scorecards reales.
            </p>
          </div>
        ) : (
          <>
            <div style={{ marginTop: 18 }}>
              {mapa[cual].lista.map((x) => (
                <div key={x.id} style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '13px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 600 }}>{x.matricula}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 14.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {eur(x.actual_cost || x.estimated_cost)}
                    </span>
                  </div>
                  <div style={{ marginTop: 3, fontSize: 13, color: T.suave }}>{x.part} · {x.severity}</div>
                  <div style={{ marginTop: 3, fontSize: 11.5, color: T.tenue }}>
                    abierto hace {x.dias} días{x.actual_cost ? ' · factura real' : ' · tarifa, no factura'}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 20, fontSize: 12.5, lineHeight: 1.7, color: T.tenue }}>{mapa[cual].pie}</p>
          </>
        )}
      </aside>
    </div>
  )
}
