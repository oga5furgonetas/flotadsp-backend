/* ─────────────────────────────────────────────────────────────────────────────
   PRÓXIMOS CAMBIOS — mantenimiento de la flota como cola de trabajo
   ---------------------------------------------------------------------------
   LO QUE YA EXISTE Y NO SE DUPLICA
   `get_maintenance_info` (server.py:13247) ya calcula, POR VEHÍCULO, los km/día
   reales del histórico de 60 días y estima los días hasta cada cambio, exigiendo
   2 apuntes separados 7+ días "para no extrapolar ruido". Y
   `register_maintenance_change` ya admite aceite, ruedas y pastillas. La lógica
   estaba bien hecha; lo que faltaba era la vista de FLOTA: con 81 furgonetas,
   nadie entra una por una, y por eso los cambios se hacen tarde.

   TRES REGLAS PARA QUE NO MIENTA
   1 · Sólo salen los cercanos: 30 días o ya pasados.
   2 · SIN RITMO MEDIDO NO HAY FECHA. Se dice cuántos km faltan y va a su propio
       bloque. Poner un día a ojo sería inventarlo.
   3 · El km de la ficha puede estar viejo: cada fila lleva cuándo se apuntó.

   SOBRE EL ASPECTO (ver elite.css)
   Base gris real en vez de negro, cuatro escalones de elevación por luminosidad
   en lugar de sombras, un único acento saturado, texto al 90 % de blanco y
   micro-gráficos con la rejilla al 6 % sobre la base. La barra de cada fila no
   es decoración: es la autonomía restante contra el intervalo completo, que es
   la única forma de comparar de un vistazo un aceite con unas ruedas.

   Datos: LAB/SIMULATED.
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react'
import { Wrench, CircleDot, Droplet, Disc, Check, ArrowUpRight } from 'lucide-react'
import { vehiculos } from '../app2/datosPlus'
import './elite.css'

const TIPOS = [
  { kind: 'aceite', label: 'Aceite', ic: Droplet, intervalo: 15000, aviso: 2500 },
  { kind: 'pastillas', label: 'Pastillas de freno', ic: Disc, intervalo: 45000, aviso: 5000 },
  { kind: 'ruedas', label: 'Ruedas', ic: CircleDot, intervalo: 60000, aviso: 7000 },
]
const HORIZONTE = 30
const km = (n) => `${Math.round(n).toLocaleString('es-ES')}`

const ritmoDe = (i) => (i % 7 === 3 ? null : 38 + ((i * 13) % 42))
const antigKm = (i) => (i % 5 === 0 ? 21 : i % 3 === 0 ? 9 : 2)

function calcular() {
  const filas = []
  vehiculos.forEach((v, i) => {
    const ritmo = ritmoDe(i)
    vehiculos && TIPOS.forEach((t, j) => {
      const ultimo = t.kind === 'aceite'
        ? v.oil_last_change_km
        : v.mileage - ((i * 3200 + j * 9100) % t.intervalo)
      const recorrido = v.mileage - ultimo
      const restanKm = t.intervalo - recorrido
      const dias = ritmo ? Math.round(restanKm / ritmo) : null
      filas.push({
        id: `${v.id}-${t.kind}`, matricula: v.license_plate,
        modelo: `${v.brand} ${v.model}`, centro: v.center,
        tipo: t, restanKm, dias, ritmo, kmViejo: antigKm(i),
        pasado: restanKm <= 0,
        /* Cuánto queda del intervalo: permite comparar un aceite con unas ruedas */
        vida: Math.max(0, Math.min(1, restanKm / t.intervalo)),
        cerca: ritmo ? dias <= HORIZONTE : restanKm <= t.aviso,
      })
    })
  })
  return filas.filter((f) => f.cerca)
    .sort((a, b) => (a.dias ?? 9999) - (b.dias ?? 9999) || a.restanKm - b.restanKm)
}

export default function Proximos({ center }) {
  const [hechos, setHechos] = useState({})
  const [vista, setVista] = useState('taller')

  const filas = useMemo(() => calcular()
    .filter((f) => !center || center === 'Todos' || f.centro === center), [center])

  const conRitmo = filas.filter((f) => f.dias !== null)
  const sinRitmo = filas.filter((f) => f.dias === null)
  const pasados = conRitmo.filter((f) => f.pasado)
  const semana = conRitmo.filter((f) => !f.pasado && f.dias <= 7)

  const porTipo = TIPOS.map((t) => ({ ...t, filas: conRitmo.filter((f) => f.tipo.kind === t.kind) }))
    .filter((g) => g.filas.length)

  return (
    <div className="elite animate-fade-in" style={{ margin: '-8px -4px', padding: '20px 18px 40px', borderRadius: 14 }}>

      {/* ── Cabecera: una sola cifra que responde "¿voy bien?" ── */}
      <header className="e-in" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 28, paddingBottom: 22 }}>
        <div>
          <div className="e-lab">Próximos cambios{center && center !== 'Todos' ? ` · ${center}` : ''}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
            <span className="e-num" style={{ fontSize: 44, lineHeight: 1, color: pasados.length ? 'var(--e-bad)' : 'var(--e-tx)' }}>
              {pasados.length}
            </span>
            <span style={{ fontSize: 14, color: 'var(--e-tx-2)' }}>ya pasados</span>
          </div>
        </div>
        <Metrica n={semana.length} txt="esta semana" tono="var(--e-warn)" />
        <Metrica n={conRitmo.length - pasados.length - semana.length} txt={`en ${HORIZONTE} días`} tono="var(--e-tx-2)" />
        <Metrica n={sinRitmo.length} txt="sin fecha estimable" tono="var(--e-tx-3)" />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, background: 'var(--e-1)', padding: 3, borderRadius: 8 }}>
          {[['taller', 'Por taller'], ['urgencia', 'Por urgencia']].map(([id, t]) => (
            <button key={id} onClick={() => setVista(id)} style={{
              padding: '5px 11px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500, letterSpacing: '-0.005em',
              background: vista === id ? 'var(--e-3)' : 'transparent',
              color: vista === id ? 'var(--e-tx)' : 'var(--e-tx-3)',
            }}>{t}</button>
          ))}
        </div>
      </header>

      {vista === 'taller' ? porTipo.map((g, gi) => {
        const I = g.ic
        return (
          <section key={g.kind} className="e-in e-surf" style={{ padding: '14px 4px 6px', marginBottom: 12, animationDelay: `${gi * 50}ms` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 14px 10px' }}>
              <I size={13} style={{ color: 'var(--e-acc)' }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{g.label}</span>
              <span style={{ fontSize: 11.5, color: 'var(--e-tx-3)' }}>
                {g.filas.length === 1 ? '1 furgoneta' : `${g.filas.length} furgonetas · una sola entrada al taller`}
              </span>
              <span className="e-num" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--e-tx-3)', paddingRight: 4 }}>
                cada {km(g.intervalo)} km
              </span>
            </div>
            {g.filas.map((f) => <Fila key={f.id} f={f} hechos={hechos} setHechos={setHechos} />)}
          </section>
        )
      }) : (
        <section className="e-in e-surf" style={{ padding: '8px 4px' }}>
          {conRitmo.map((f) => <Fila key={f.id} f={f} hechos={hechos} setHechos={setHechos} conTipo />)}
        </section>
      )}

      {/* ── Sin ritmo: km sí, fecha no ── */}
      {sinRitmo.length > 0 && (
        <section className="e-in e-surf" style={{ padding: '14px 18px', marginTop: 14 }}>
          <div className="e-lab" style={{ color: 'var(--e-warn)' }}>Sin fecha estimable</div>
          <p style={{ margin: '9px 0 0', fontSize: 12.5, lineHeight: 1.65, color: 'var(--e-tx-2)', maxWidth: 560 }}>
            Hacen falta dos apuntes de cuentakilómetros separados una semana. Se sabe cuántos km faltan, pero no
            cuándo — y poner una fecha a ojo sería inventarla.
          </p>
          <div style={{ marginTop: 10 }}>
            {sinRitmo.map((f) => (
              <div key={f.id} className="e-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500, minWidth: 82 }}>{f.matricula}</span>
                <span style={{ fontSize: 12, color: 'var(--e-tx-3)', flex: 1 }}>{f.tipo.label}</span>
                <span className="e-num" style={{ fontSize: 12.5, color: 'var(--e-warn)' }}>
                  {f.restanKm <= 0 ? `pasado en ${km(Math.abs(f.restanKm))} km` : `faltan ${km(f.restanKm)} km`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p style={{ marginTop: 18, fontSize: 11.5, lineHeight: 1.7, color: 'var(--e-tx-3)', maxWidth: 620 }}>
        El cálculo parte del kilometraje de la ficha, que se actualiza con la foto del cuentakilómetros. Si ese apunte
        es viejo, la furgoneta ya ha rodado más de lo que dice esta cuenta: por eso cada fila lleva cuándo se apuntó.
      </p>
    </div>
  )
}

function Metrica({ n, txt, tono }) {
  return (
    <div>
      <div className="e-num" style={{ fontSize: 26, lineHeight: 1, color: tono }}>{n}</div>
      <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--e-tx-3)' }}>{txt}</div>
    </div>
  )
}

function Fila({ f, hechos, setHechos, conTipo }) {
  const hecho = hechos[f.id]
  const I = f.tipo.ic
  const tono = f.pasado ? 'var(--e-bad)' : f.dias <= 7 ? 'var(--e-warn)' : 'var(--e-ok)'
  const viejo = f.kmViejo > 14

  return (
    <div className="e-row">
      {conTipo && <I size={12} style={{ color: 'var(--e-tx-3)', flexShrink: 0 }} />}

      <div style={{ minWidth: 0, flex: '1 1 190px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{f.matricula}</span>
          {conTipo && <span style={{ fontSize: 11.5, color: 'var(--e-tx-3)' }}>{f.tipo.label}</span>}
        </div>
        <div style={{ marginTop: 2, fontSize: 11, color: 'var(--e-tx-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {f.modelo} · apuntado hace {f.kmViejo} d
          {viejo && <span style={{ color: 'var(--e-warn)' }}> · la cuenta va corta</span>}
        </div>
      </div>

      {/* Autonomía restante contra el intervalo: dato-tinta, no adorno */}
      <div style={{ flex: '1 1 120px', minWidth: 90 }}>
        <div className="e-track">
          <div className="e-fill" style={{ width: `${Math.max(2, f.vida * 100)}%`, background: tono, opacity: .85 }} />
        </div>
      </div>

      <div style={{ width: 78, textAlign: 'right', flexShrink: 0 }}>
        <div className="e-num" style={{ fontSize: 13, color: tono }}>
          {f.pasado ? 'pasado' : `${f.dias} d`}
        </div>
        <div className="e-num" style={{ fontSize: 10.5, color: 'var(--e-tx-3)', marginTop: 1 }}>
          {km(Math.abs(f.restanKm))} km
        </div>
      </div>

      <div className="e-num" style={{ width: 62, textAlign: 'right', fontSize: 11, color: 'var(--e-tx-3)', flexShrink: 0 }}>
        {f.ritmo} km/d
      </div>

      <button
        onClick={() => setHechos({ ...hechos, [f.id]: !hecho })}
        title="Prototipo: no escribe en ninguna base"
        style={{
          flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
          fontSize: 11.5, fontWeight: 500,
          background: hecho ? 'rgba(75,185,138,.16)' : 'var(--e-acc-dim)',
          color: hecho ? 'var(--e-ok)' : 'var(--e-acc)',
        }}>
        {hecho ? <><Check size={11} /> Hecho</> : <><Wrench size={11} /> Registrar</>}
      </button>
    </div>
  )
}

export { ArrowUpRight }
