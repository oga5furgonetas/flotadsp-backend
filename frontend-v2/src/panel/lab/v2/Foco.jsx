/* ─────────────────────────────────────────────────────────────────────────────
   E09 + E10 · "EL FOCO DE LA SEMANA"
   ---------------------------------------------------------------------------
   La pantalla que enseñaría en una demo, y la que más me costó aceptar porque
   contradice lo que construí antes en este mismo LAB.

   HIPÓTESIS: el manager no quiere un panel de operación. Quiere saber en qué
   métrica de Amazon se está dejando puntos ESTA semana, por qué, y quién puede
   moverla. Y quiere poder enseñarlo.

   POR QUÉ ES UN INFORME Y NO UN DASHBOARD: esto se lee de arriba abajo, se
   imprime y se pone encima de la mesa en una reunión. Un dashboard se escanea;
   un informe convence. Para vender un SaaS de varios cientos de euros al mes,
   la pantalla tiene que argumentar, no decorar.

   LO QUE HACE QUE ALGUIEN PREGUNTE "¿CÓMO SABE ESTO?":
     · que el WHC perfecto no salva una semana (caso real, semana 29);
     · que entre conductores de la misma ruta hay un factor 15×;
     · que el 44 % de los fallos por comercio cerrado caen en el cierre del
       mediodía español — no es la gente, es la franja;
     · que hay días de datos a punto de perderse PARA SIEMPRE y nadie lo vigila.

   Datos de operación: LAB/SIMULATED. Pesos y reglas: medidos sobre 17
   scorecards reales (docs/DSC.md, docs/REPORTES_DIARIOS.md).
   ───────────────────────────────────────────────────────────────────────────── */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Sun, Moon, AlertTriangle } from 'lucide-react'
import { CLARO, OSCURO } from './tema'
import {
  FOCOS, CASO_SEMANA_29, rankingDSC, factorExtremos, FLOTA_PCT, MIN_ENTREGAS, MUESTRA_CORTA,
  causasRetorno, cerradoPorHora, HORAS_CIERRE, analisisCierre,
  estadoVentana, semanaAmazon, VENTANA_DIAS,
} from './amazon'

const HOY = '2026-08-09'

export default function Foco() {
  const [claro, setClaro] = useState(true)
  const T = claro ? CLARO : OSCURO

  const ranking = rankingDSC()
  const ext = factorExtremos()
  const cierre = analisisCierre()
  const ventana = estadoVentana(HOY)
  const semana = semanaAmazon(HOY)
  const medibles = FOCOS.filter((f) => f.estado === 'medible')
  const pesoTotal = FOCOS.reduce((a, f) => a + f.peso, 0)
  const dsc = FOCOS[0]

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

        {/* ══ TITULAR ═══════════════════════════════════════════════════════ */}
        <section style={{ paddingTop: 54 }}>
          <Etq T={T}>Semana del {semana.desde.slice(8)} al {semana.hasta.slice(8)} · domingo a sábado</Etq>
          <h1 style={{ margin: '14px 0 0', fontSize: 'clamp(31px,5vw,52px)', lineHeight: 1.03, letterSpacing: '-.035em', fontWeight: 600 }}>
            Esta semana te la juegas<br />en <span style={{ color: T.acento }}>{dsc.corto}</span>.
          </h1>
          <p style={{ margin: '20px 0 0', fontSize: 17, lineHeight: 1.6, color: T.suave, maxWidth: 560, fontWeight: 300 }}>
            De las 17 scorecards que Amazon te ha mandado, <b style={{ color: T.tinta, fontWeight: 600 }}>{dsc.semanas} llevaban
            «{dsc.nombre}» en las áreas de foco</b>, y en 12 iba la primera. Pesa {dsc.peso} sobre {pesoTotal}.
            El WHC pesa {FOCOS.find((f) => f.key === 'whc').peso}.
          </p>

          {/* El contraejemplo. Es lo que hace recolocar la cabeza. */}
          <div style={{ marginTop: 30, borderLeft: `2px solid ${T.acento}`, paddingLeft: 18 }}>
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: T.tinta }}>
              En la <b>semana {CASO_SEMANA_29.semana}</b> tuviste el WHC al <b>{CASO_SEMANA_29.whc} %</b> ·
              {' '}{CASO_SEMANA_29.whc_tier}. El Overall fue <b style={{ color: T.mal }}>{CASO_SEMANA_29.overall} · {CASO_SEMANA_29.overall_tier}</b>,
              el peor de las 17.
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: T.suave }}>{CASO_SEMANA_29.leccion}</p>
          </div>

          {/* Reparto de pesos, y qué puedes medir de cada uno */}
          <div style={{ marginTop: 34 }}>
            {FOCOS.map((f) => (
              <BarraFoco key={f.key} T={T} f={f} max={FOCOS[0].peso} />
            ))}
            <p style={{ margin: '14px 0 0', fontSize: 12.5, lineHeight: 1.7, color: T.tenue }}>
              De las 9 métricas que te penalizan, <b style={{ color: T.suave }}>{medibles.length} se pueden medir desde tus
              propios datos</b>. Las demás dependen de sistemas que Amazon no cede, y por eso no aparecen con un
              número inventado al lado.
            </p>
          </div>
        </section>

        {/* ══ QUIÉN MUEVE EL DSC ════════════════════════════════════════════ */}
        <section style={{ paddingTop: 70 }}>
          <Etq T={T}>Quién mueve el DSC</Etq>
          <h2 style={{ margin: '14px 0 0', fontSize: 'clamp(25px,3.4vw,34px)', lineHeight: 1.12, letterSpacing: '-.03em', fontWeight: 600 }}>
            Entre tu mejor y tu peor conductor<br />hay un factor <span style={{ color: T.mal }}>{ext.factor}×</span>.
          </h2>
          <p style={{ margin: '18px 0 0', fontSize: 15.5, lineHeight: 1.65, color: T.suave, maxWidth: 560, fontWeight: 300 }}>
            {ext.peor} deja el <b style={{ color: T.tinta, fontWeight: 600 }}>{ext.alto} %</b> de sus paquetes sin nadie
            delante; {ext.mejor}, el <b style={{ color: T.tinta, fontWeight: 600 }}>{ext.bajo} %</b>. Misma estación,
            mismas rutas. La flota va al {FLOTA_PCT} %. Esto no es un juicio sobre nadie: es dónde se dejó cada
            paquete, y lo registra Cortex.
          </p>

          <div style={{ marginTop: 30 }}>
            {ranking.filter((c) => c.entra).map((c) => (
              <FilaDSC key={c.driver_id} T={T} c={c} maxExceso={ranking[0].exceso} />
            ))}
          </div>

          {/* Las compuertas, a la vista. Es lo que separa esto de un ranking injusto. */}
          <div style={{ marginTop: 22, padding: '16px 18px', border: `1px solid ${T.linea}`, borderRadius: 12 }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.7, color: T.suave }}>
              <b style={{ color: T.tinta }}>Dos reglas para no señalar a nadie injustamente.</b><br />
              1 · Hacen falta <b>{MIN_ENTREGAS} entregas</b> para entrar en la lista. Con menos, un porcentaje es ruido.
              {ranking.filter((c) => !c.entra).length > 0 && (
                <> Ahora mismo queda fuera <b>{ranking.filter((c) => !c.entra).map((c) => c.nombre).join(', ')}</b>.</>
              )}<br />
              2 · Se ordena por <b>exceso en paquetes</b>, no por porcentaje. Un 9 % con 700 entregas no sobra nada si
              la flota va al {FLOTA_PCT} %; un 20 % con 200 sobra 23 paquetes. Ordenar por tasa castigaría al de poco
              volumen.
            </div>
          </div>
        </section>

        {/* ══ POR QUÉ ═══════════════════════════════════════════════════════ */}
        <section style={{ paddingTop: 70 }}>
          <Etq T={T}>Por qué vuelven los paquetes</Etq>
          <h2 style={{ margin: '14px 0 0', fontSize: 'clamp(25px,3.4vw,34px)', lineHeight: 1.12, letterSpacing: '-.03em', fontWeight: 600 }}>
            {cierre.pctCierre} % de los fallos por comercio<br />cerrado caen entre las 14 y las 16 h.
          </h2>
          <p style={{ margin: '18px 0 0', fontSize: 15.5, lineHeight: 1.65, color: T.suave, maxWidth: 560, fontWeight: 300 }}>
            Es el cierre del mediodía. <b style={{ color: T.tinta, fontWeight: 600 }}>No se arregla hablando con nadie:
            se arregla moviendo esas paradas de franja.</b> Y es 1 de cada {Math.round(100 / cierre.pctSobreRetornos)} retornos
            de toda tu operación.
          </p>

          <div style={{ marginTop: 30, display: 'flex', alignItems: 'flex-end', gap: 6, height: 130 }}>
            {cerradoPorHora.map((x) => {
              const esCierre = HORAS_CIERRE.includes(x.h)
              const max = Math.max(...cerradoPorHora.map((y) => y.n))
              return (
                <div key={x.h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: esCierre ? T.mal : T.tenue }}>{x.n}</span>
                  <div style={{
                    width: '100%', height: `${(x.n / max) * 100}%`, minHeight: 3, borderRadius: '3px 3px 0 0',
                    background: esCierre ? T.mal : T.linea,
                  }} />
                  <span style={{ fontSize: 10.5, color: esCierre ? T.mal : T.tenue, fontWeight: esCierre ? 600 : 400 }}>{x.h}h</span>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 30 }}>
            {causasRetorno.slice(0, 4).map((c) => (
              <div key={c.causa} style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '13px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 14.5, fontWeight: 600, flex: '1 1 190px' }}>{c.causa}</span>
                <span style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', color: T.suave }}>{c.n}</span>
                <span style={{ flexBasis: '100%', fontSize: 12.5, color: c.accion ? T.acento : T.tenue }}>
                  {c.accion || 'Sin acción posible desde aquí'}
                </span>
              </div>
            ))}
            <p style={{ margin: '14px 0 0', fontSize: 12.5, lineHeight: 1.7, color: T.tenue }}>
              El segundo accionable no es operativo, es de formación: <b style={{ color: T.suave }}>144 retornos vuelven
              sin causa marcada</b>. Esa información se pierde y no se recupera.
            </p>
          </div>
        </section>

        {/* ══ EL GUARDIÁN ═══════════════════════════════════════════════════ */}
        <section style={{ paddingTop: 70 }}>
          <Etq T={T}>Datos a punto de perderse</Etq>

          {ventana.enRiesgo.length > 0 ? (
            <h2 style={{ margin: '14px 0 0', fontSize: 'clamp(25px,3.4vw,34px)', lineHeight: 1.12, letterSpacing: '-.03em', fontWeight: 600 }}>
              Tienes <span style={{ color: T.ojo }}>{ventana.enRiesgo.length} días de reporte</span><br />que caducan en horas.
            </h2>
          ) : (
            <h2 style={{ margin: '14px 0 0', fontSize: 'clamp(25px,3.4vw,34px)', lineHeight: 1.12, letterSpacing: '-.03em', fontWeight: 600 }}>
              Nada pendiente de rescatar.
            </h2>
          )}

          <p style={{ margin: '18px 0 0', fontSize: 15.5, lineHeight: 1.65, color: T.suave, maxWidth: 570, fontWeight: 300 }}>
            Amazon publica el reporte diario y <b style={{ color: T.tinta, fontWeight: 600 }}>rellena la columna DSC
            después</b>, uno a tres días más tarde. Si no vuelves a descargarlo en esa ventana, ese día se queda a cero
            para siempre. Se comprobó: seis reportes viejos re-descargados, <b style={{ color: T.tinta, fontWeight: 600 }}>ninguno
            cambió</b>, cuatro eran idénticos byte a byte.
          </p>

          <div style={{ marginTop: 28 }}>
            {ventana.enRiesgo.map((r) => (
              <div key={r.fecha} style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '14px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={14} style={{ color: T.ojo, flexShrink: 0 }} />
                <span style={{ fontSize: 14.5, fontWeight: 600, flex: '1 1 130px' }}>Reporte del {r.fecha.slice(8)}/{r.fecha.slice(5, 7)}</span>
                <span style={{ fontSize: 13, color: T.suave }}>{r.pendientes} concesiones sin clasificar</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: r.diasRestantes <= 1 ? T.mal : T.ojo }}>
                  {r.diasRestantes === 0 ? 'último día'
                    : r.diasRestantes === 1 ? 'queda 1 día'
                    : `quedan ${r.diasRestantes} días`}
                </span>
                <button style={btn(T)}>Volver a descargar</button>
              </div>
            ))}

            {ventana.perdidos.length > 0 && (
              <div style={{ marginTop: 20, padding: '16px 18px', background: T.panel, border: `1px solid ${T.linea}`, borderRadius: 12 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.mal }}>
                  {ventana.perdidos.length} días ya perdidos
                </div>
                <div style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.7, color: T.suave }}>
                  {ventana.perdidos.map((r) => r.fecha.slice(5)).join(' · ')} — pasaron más de {VENTANA_DIAS} días sin
                  re-descargar. No se recuperan: son un agujero permanente en tu histórico de la métrica que más te
                  penaliza.
                </div>
              </div>
            )}

            {ventana.faltan.length > 0 && (
              <p style={{ margin: '16px 0 0', fontSize: 12.5, lineHeight: 1.7, color: T.tenue }}>
                Además faltan por descargar {ventana.faltan.length} días de esta semana
                ({ventana.faltan.map((f) => f.fecha.slice(8)).join(', ')}).
              </p>
            )}
          </div>
        </section>

        {/* ══ LO QUE NO SE AFIRMA ═══════════════════════════════════════════ */}
        <section style={{ paddingTop: 70 }}>
          <Etq T={T}>Lo que este informe no te va a decir</Etq>
          <div style={{ marginTop: 18 }}>
            {[
              ['Tu Overall de esta semana', 'Falta el DVIC, que no se ve en los datos disponibles. Reconstruirlo sería inventarlo.'],
              ['Qué rutas van a acabar tarde', 'Probado sobre 702 rutas: las que acabaron mal iban al 60 % a las 14:00 y las buenas al 62 %. Indistinguibles.'],
              ['Quién incumplirá el límite diario de horas', 'Ningún umbral de duración reproduce el resultado real: >10 h marcaría 42 conductores y fallaron 2.'],
              ['Cuánto dinero te ahorra arreglar esto', 'No hay forma de atribuir euros a una mejora de DSC con los datos actuales.'],
            ].map(([q, r]) => (
              <div key={q} style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '15px 0' }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{q}</div>
                <div style={{ marginTop: 5, fontSize: 13, lineHeight: 1.65, color: T.suave }}>{r}</div>
              </div>
            ))}
          </div>
        </section>

        <footer style={{ marginTop: 66, borderTop: `1px solid ${T.linea}`, paddingTop: 22, fontSize: 12, lineHeight: 1.7, color: T.tenue }}>
          Los <b>pesos, las reglas y los porcentajes de causa</b> salen de 17 scorecards y 131 reportes diarios reales
          (docs/DSC.md, docs/REPORTES_DIARIOS.md). Los <b>nombres, las entregas y los reportes concretos</b> de esta
          pantalla son inventados para poder verla funcionar.
        </footer>
      </div>
    </div>
  )
}

/* ── piezas ───────────────────────────────────────────────────────────────── */

function Etq({ T, children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: T.tenue }}>{children}</div>
}

function btn(T) {
  return {
    marginLeft: 'auto', padding: '5px 11px', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${T.linea}`, background: 'transparent', color: T.tinta, fontSize: 12.5, fontWeight: 600,
  }
}

const ESTADO_TXT = {
  medible: { txt: 'se puede medir', color: (T) => T.bien },
  parcial: { txt: 'parcial', color: (T) => T.ojo },
  sin_dato: { txt: 'sin dato en tu sistema', color: (T) => T.tenue },
  sin_volumen: { txt: 'sin volumen suficiente', color: (T) => T.tenue },
}

function BarraFoco({ T, f, max }) {
  const e = ESTADO_TXT[f.estado]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0' }}>
      <span style={{ width: 42, fontSize: 12.5, fontWeight: 600, color: f.estado === 'medible' ? T.tinta : T.tenue }}>{f.corto}</span>
      <div style={{ flex: 1, height: 6, background: T.lineaSuave, borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${(f.peso / max) * 100}%`, height: '100%', background: f.estado === 'medible' ? T.acento : T.linea }} />
      </div>
      <span style={{ width: 30, textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: T.suave }}>{f.peso}</span>
      <span style={{ width: 148, fontSize: 11.5, color: e.color(T) }}>{e.txt}</span>
    </div>
  )
}

function FilaDSC({ T, c, maxExceso }) {
  const sobra = c.exceso > 0
  return (
    <div style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '14px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.01em', flex: '1 1 160px' }}>{c.nombre}</span>
        <span style={{ fontSize: 13, color: T.tenue }}>{c.entregas} entregas · {c.pct} %</span>
        <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: sobra ? T.mal : T.bien, minWidth: 92, textAlign: 'right' }}>
          {sobra ? `+${c.exceso}` : c.exceso} paquetes
        </span>
      </div>
      <div style={{ marginTop: 8, height: 4, background: T.lineaSuave, borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, (c.exceso / maxExceso) * 100)}%`, height: '100%', background: sobra ? T.mal : T.bien }} />
      </div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: T.tenue }}>
        {sobra
          ? `Sobre lo que haría la media de la flota con sus ${c.entregas} entregas`
          : 'Por debajo de la media de la flota'}
        {c.muestraCorta && <b style={{ color: T.ojo }}> · muestra corta ({'<'}{MUESTRA_CORTA})</b>}
      </div>
    </div>
  )
}
