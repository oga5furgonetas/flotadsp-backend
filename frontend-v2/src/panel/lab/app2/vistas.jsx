/* ─────────────────────────────────────────────────────────────────────────────
   FLOTADSP 2.0 · las áreas de la aplicación
   ---------------------------------------------------------------------------
   Cada área se come varias pantallas de las 35 actuales. El patrón es siempre
   el mismo: UNA lista con lo que decide, y la profundidad se abre en un panel
   lateral encima. Nunca se navega a un sitio del que haya que volver.

     Furgonetas   ← Vehículos, Inspecciones, Vencimientos, Renting, AvisosITV,
                    Aparcamiento, Importaciones
     Equipo       ← Conductores, WHC, Turnos, scoring, PortalConductor
     Reparto      ← PackageIntel, DSC, Actividad
     Taller       ← Incidencias, Talleres, IAPeritaje, RevisiónRápida
     Planificación← Asignación, Turnos, Checklist, Plantilla, Chat
     Métricas     ← Scorecard, WHC, DSC, Métricas
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react'
import { AlertTriangle, Wrench, Clock, Phone, Star } from 'lucide-react'
import {
  vehiculos, conductores, inspecciones, danos, incidencias, talleres, rutas,
  asignaciones, turnos, chat, whc, semanas, dscConductores, FLOTA_PCT,
  aparcamiento, cortexOverview, HOY, vehPorId, condPorId,
} from './datosPlus'
import { Etq, Titulo, Nota, Chip, Fila, Panel, Bloque, Dato, Buscador, Filtros, Vacio, Barra } from './ui2'

const eur = (n) => `${Math.round(n || 0).toLocaleString('es-ES')} €`
const km = (n) => `${(n || 0).toLocaleString('es-ES')} km`
const hm = (m) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`
/* El año se añade cuando no es el actual: sin él, un vencimiento de 2028 se lee
   como "27 may" y parece que ya pasó. */
const fecha = (s) => {
  if (!s) return '—'
  const d = new Date(String(s).slice(0, 10) + 'T12:00:00Z')
  const mismoAno = d.getUTCFullYear() === new Date(HOY + 'T12:00:00Z').getUTCFullYear()
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(mismoAno ? {} : { year: 'numeric' }) })
}
const dias = (s) => Math.round((Date.parse(String(s).slice(0, 10) + 'T12:00:00Z') - Date.parse(HOY + 'T12:00:00Z')) / 86400000)
const SEVT = { leve: 'ojo', moderado: 'ojo', grave: 'mal', critico: 'mal', sin_danos: 'bien' }

/* ═══════════════════════════════════════════════════════════════════════════
   FURGONETAS
   ═══════════════════════════════════════════════════════════════════════════ */
export function Furgonetas({ T }) {
  const [q, setQ] = useState('')
  const [f, setF] = useState('todas')
  const [sel, setSel] = useState(null)

  const enriquecidas = useMemo(() => vehiculos.map((v) => {
    const abiertos = danos.filter((d) => d.vehicle_id === v.id && d.repair_status !== 'done')
    const dITV = dias(v.itv_date)
    const recorrido = v.mileage - v.oil_last_change_km
    return {
      ...v, abiertos,
      peor: abiertos.sort((a, b) => ({ leve: 1, moderado: 2, grave: 3 }[b.severity]) - ({ leve: 1, moderado: 2, grave: 3 }[a.severity]))[0],
      dITV, itvUrgente: dITV <= 15,
      aceitePasado: recorrido >= v.oil_interval_km,
      incidencias: incidencias.filter((i) => i.vehicle_id === v.id && i.status !== 'resolved').length,
    }
  }), [])

  const conts = {
    todas: enriquecidas.length,
    problema: enriquecidas.filter((v) => v.status === 'taller' || v.itvUrgente || v.aceitePasado || v.incidencias > 0).length,
    taller: enriquecidas.filter((v) => v.status === 'taller').length,
    danos: enriquecidas.filter((v) => v.abiertos.length > 0).length,
  }
  const lista = enriquecidas.filter((v) => {
    const t = q.trim().toLowerCase()
    if (t && !`${v.license_plate} ${v.brand} ${v.model} ${v.provider}`.toLowerCase().includes(t)) return false
    if (f === 'problema') return v.status === 'taller' || v.itvUrgente || v.aceitePasado || v.incidencias > 0
    if (f === 'taller') return v.status === 'taller'
    if (f === 'danos') return v.abiertos.length > 0
    return true
  })

  return (
    <>
      <Etq T={T}>Furgonetas</Etq>
      <Titulo T={T} sub="Toda la flota en una lista. Cada fila se abre y trae su ficha entera: daños abiertos, vencimientos, mantenimiento, incidencias e historial de inspecciones.">
        {conts.problema} de {conts.todas} necesitan algo
      </Titulo>

      <div style={{ marginTop: 26, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <Buscador T={T} valor={q} onChange={setQ} placeholder="Matrícula, modelo o proveedor…" />
        <Filtros T={T} valor={f} onChange={setF} opciones={[
          ['todas', 'Todas', conts.todas], ['problema', 'Con algo', conts.problema],
          ['taller', 'En taller', conts.taller], ['danos', 'Con daños', conts.danos],
        ]} />
      </div>

      <div style={{ marginTop: 18 }}>
        {lista.map((v) => (
          <Fila key={v.id} T={T} onClick={() => setSel(v)}
            izq={v.license_plate} sub={`${v.brand} ${v.model} · ${v.provider} · ${v.center}`}
            medio={<>
              {v.status === 'taller' && <Chip T={T} tono={T.ojo}><Wrench size={10} /> En taller</Chip>}
              {v.abiertos.length > 0 && <Chip T={T} tono={T[SEVT[v.peor.severity]]}>{v.abiertos.length} daño{v.abiertos.length > 1 ? 's' : ''}</Chip>}
              {v.itvUrgente && <Chip T={T} tono={T.mal}>ITV {v.dITV <= 0 ? 'caducada' : `${v.dITV}d`}</Chip>}
              {v.aceitePasado && <Chip T={T} tono={T.ojo}>Aceite</Chip>}
              {v.incidencias > 0 && <Chip T={T} tono={T.suave}>{v.incidencias} incid.</Chip>}
            </>}
            der={km(v.mileage)} derTono={T.tenue} />
        ))}
        {lista.length === 0 && <Vacio T={T}>Ninguna coincide con «{q}».</Vacio>}
      </div>

      {sel && <FichaVehiculo T={T} v={sel} onCerrar={() => setSel(null)} />}
    </>
  )
}

function FichaVehiculo({ T, v, onCerrar }) {
  const abiertos = danos.filter((d) => d.vehicle_id === v.id && d.repair_status !== 'done')
  const reparados = danos.filter((d) => d.vehicle_id === v.id && d.repair_status === 'done')
  const insp = inspecciones.filter((i) => i.vehicle_id === v.id).slice(0, 8)
  const incs = incidencias.filter((i) => i.vehicle_id === v.id)
  const plaza = aparcamiento.ocupacion.find((o) => o.vehicle_id === v.id)
  const recorrido = v.mileage - v.oil_last_change_km
  const restanteAceite = v.oil_interval_km - recorrido
  const dITV = dias(v.itv_date)
  const dRent = dias(v.renting_end_date)
  const cond = asignaciones[0].slots.find((s) => s.vehicle_id === v.id)

  return (
    <Panel T={T} titulo={v.license_plate} sub={`${v.brand} ${v.model} · ${v.provider}`} onCerrar={onCerrar}>
      <Bloque T={T} titulo="Ahora">
        <Dato T={T} k="Estado" v={v.status === 'taller' ? 'En taller' : 'En servicio'} tono={v.status === 'taller' ? T.ojo : T.bien} />
        {v.workshop_reason && <Dato T={T} k="Motivo" v={v.workshop_reason} />}
        <Dato T={T} k="Hoy la lleva" v={cond?.driver_name || 'Sin asignar'} />
        {plaza && <Dato T={T} k="Plaza" v={plaza.plaza} />}
        <Dato T={T} k="Kilómetros" v={km(v.mileage)} />
        <Dato T={T} k="Bolsas" v={String(v.bags_remaining)} />
      </Bloque>

      <Bloque T={T} titulo={`Daños abiertos · ${abiertos.length}`}>
        {abiertos.length === 0 ? <Dato T={T} k="Sin daños en el registro" v="" tono={T.bien} /> : abiertos.map((d) => (
          <div key={d.id} style={{ padding: '7px 0', borderTop: `1px solid ${T.lineaSuave}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>{d.part}</span>
              <Chip T={T} tono={T[SEVT[d.severity]]}>{d.severity}</Chip>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{eur(d.estimated_cost)}</span>
            </div>
            <div style={{ marginTop: 3, fontSize: 11.5, color: T.tenue }}>
              desde {fecha(d.first_seen)} · {d.workshop_id ? `taller ${talleres.find((w) => w.id === d.workshop_id)?.name || d.workshop_id}` : 'sin taller asignado'}
              {' · '}<b style={{ color: T.tenue }}>tarifa, no factura</b>
            </div>
          </div>
        ))}
        {reparados.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: T.tenue }}>
            {reparados.length} ya reparados · {eur(reparados.reduce((a, d) => a + (d.actual_cost || 0), 0))} en facturas reales
          </div>
        )}
      </Bloque>

      <Bloque T={T} titulo="Vencimientos y mantenimiento">
        <Dato T={T} k="ITV" v={`${fecha(v.itv_date)} · ${dITV <= 0 ? 'caducada' : `${dITV} días`}`} tono={dITV <= 15 ? T.mal : T.tinta} />
        <Dato T={T} k="Fin de renting" v={`${fecha(v.renting_end_date)} · ${dRent} días`} tono={dRent <= 60 ? T.ojo : T.tinta} />
        <Dato T={T} k="Aceite" v={restanteAceite <= 0 ? `pasado en ${km(Math.abs(restanteAceite))}` : `quedan ${km(restanteAceite)}`}
          tono={restanteAceite <= 0 ? T.mal : restanteAceite < 2500 ? T.ojo : T.tinta}
          pie={`${km(recorrido)} desde el último cambio · intervalo ${km(v.oil_interval_km)}`} />
      </Bloque>

      <Bloque T={T} titulo={`Incidencias · ${incs.length}`}>
        {incs.length === 0 ? <Dato T={T} k="Ninguna registrada" v="" /> : incs.slice(0, 6).map((i) => (
          <Dato key={i.id} T={T} k={`${fecha(i.created_at)} · ${i.type}`} v={i.status === 'resolved' ? 'resuelta' : 'abierta'}
            tono={i.status === 'resolved' ? T.tenue : T.ojo} pie={i.description} />
        ))}
      </Bloque>

      <Bloque T={T} titulo="Últimas inspecciones">
        {insp.length === 0 ? <Dato T={T} k="Ninguna" v="" /> : insp.map((i) => (
          <Dato key={i.id} T={T} k={fecha(i.created_at)}
            v={i.analysis_status !== 'ok' ? 'sin analizar' : i.severity}
            tono={i.analysis_status !== 'ok' ? T.mal : T[SEVT[i.severity]] || T.tinta}
            pie={`${condPorId(i.driver_id)?.name || '—'}${i.new_damages ? ` · ${i.new_damages} daño nuevo` : ''}`} />
        ))}
      </Bloque>
    </Panel>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   EQUIPO
   ═══════════════════════════════════════════════════════════════════════════ */
/* Suelo observado: 56h30m es el máximo visto CUMPLIENDO (docs/WHC.md §6.2).
   Fuera del componente para que no entre en las dependencias del useMemo. */
const SUELO = 56 * 60 + 30

export function Equipo({ T }) {
  const [q, setQ] = useState('')
  const [f, setF] = useState('activos')
  const [sel, setSel] = useState(null)

  const lista = useMemo(() => conductores.map((c) => {
    const w = whc.conductores.find((x) => x.driver_id === c.id)
    const d = dscConductores.find((x) => x.driver_id === c.id)
    const pct = d ? Math.round((d.sin_nadie / d.entregas) * 1000) / 10 : null
    return {
      ...c, w, d, pct,
      enZona: w ? w.proyeccion > SUELO : false,
      exceso: d ? Math.round(d.sin_nadie - (d.entregas * FLOTA_PCT) / 100) : null,
      incs: incidencias.filter((i) => i.driver_id === c.id).length,
    }
  }), [])

  const conts = {
    activos: lista.filter((c) => c.active).length,
    riesgo: lista.filter((c) => c.enZona).length,
    sinid: lista.filter((c) => c.active && !c.driver_id).length,
  }
  const vistos = lista.filter((c) => {
    const t = q.trim().toLowerCase()
    if (t && !c.name.toLowerCase().includes(t)) return false
    if (f === 'activos') return c.active
    if (f === 'riesgo') return c.enZona
    if (f === 'sinid') return c.active && !c.driver_id
    return true
  })

  return (
    <>
      <Etq T={T}>Equipo</Etq>
      <Titulo T={T} sub={<>Horas, entregas e incidencias de cada persona en un sitio. El aviso de horas usa el <b style={{ color: T.tinta, fontWeight: 600 }}>suelo medido de {hm(SUELO)}</b>, no tu límite de 55 h: por debajo de ahí nunca ha saltado una excepción, así que la lista sale corta y no señala a quien no ha incumplido nada.</>}>
        {conts.riesgo} de {conts.activos} en zona de riesgo
      </Titulo>

      <div style={{ marginTop: 26, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <Buscador T={T} valor={q} onChange={setQ} placeholder="Nombre…" />
        <Filtros T={T} valor={f} onChange={setF} opciones={[
          ['activos', 'Activos', conts.activos], ['riesgo', 'En zona', conts.riesgo],
          ['sinid', 'Sin ID Amazon', conts.sinid], ['todos', 'Todos', lista.length],
        ]} />
      </div>

      <div style={{ marginTop: 18 }}>
        {vistos.map((c) => (
          <Fila key={c.id} T={T} onClick={() => setSel(c)}
            izq={c.name} sub={`${c.nivel} · ${c.contrato} · ${c.center}${c.zona ? ` · ${c.zona}` : ''}`}
            medio={<>
              {c.enZona && <Chip T={T} tono={T.mal}><Clock size={10} /> {hm(c.w.proyeccion)}</Chip>}
              {!c.driver_id && c.active && <Chip T={T} tono={T.ojo}>sin ID Amazon</Chip>}
              {c.exceso > 8 && <Chip T={T} tono={T.ojo}>+{c.exceso} paq. sin nadie</Chip>}
              {!c.active && <Chip T={T} tono={T.tenue}>inactivo</Chip>}
            </>}
            der={c.w ? hm(c.w.trabajado) : '—'} derTono={T.tenue} />
        ))}
        {vistos.length === 0 && <Vacio T={T}>Nadie coincide con «{q}».</Vacio>}
      </div>

      {sel && <FichaConductor T={T} c={sel} onCerrar={() => setSel(null)} />}
    </>
  )
}

function FichaConductor({ T, c, onCerrar }) {
  const ruta = rutas.find((r) => r.driver_id === c.id)
  const insp = inspecciones.filter((i) => i.driver_id === c.id).slice(0, 6)
  const incs = incidencias.filter((i) => i.driver_id === c.id)
  const t = turnos.find((x) => x.driver_id === c.id)

  return (
    <Panel T={T} titulo={c.name} sub={`${c.nivel} · ${c.contrato} · ${c.center}`} onCerrar={onCerrar}>
      <Bloque T={T} titulo="Hoy">
        {ruta ? (
          <>
            <Dato T={T} k={ruta.route_code} v={`${ruta.delivered}/${ruta.total}`} />
            <Dato T={T} k="Pendientes" v={String(ruta.pendientes)} />
            <Dato T={T} k="Sin entregar desde hace" v={`${ruta.min_sin_entregar} min`}
              tono={ruta.min_sin_entregar >= 120 ? T.mal : T.tinta} />
            <div style={{ marginTop: 8 }}><Barra T={T} pct={(ruta.delivered / ruta.total) * 100} tono={ruta.min_sin_entregar >= 120 ? T.mal : T.bien} /></div>
          </>
        ) : <Dato T={T} k="Hoy no tiene ruta en Cortex" v="" />}
      </Bloque>

      <Bloque T={T} titulo="Horas de la semana">
        {c.w ? (
          <>
            <Dato T={T} k="Trabajado (dato del portal)" v={hm(c.w.trabajado)} />
            <Dato T={T} k="Proyección si completa" v={hm(c.w.proyeccion)} tono={c.enZona ? T.mal : T.bien}
              pie={c.enZona
                ? `Por encima del suelo medido de ${hm(SUELO)}: es la única zona donde una excepción ha sido posible.`
                : `Por debajo del suelo medido de ${hm(SUELO)}. Demostrablemente fuera de riesgo.`} />
            <Dato T={T} k="Bloques que quedan" v={String(c.w.bloques_restantes)} />
          </>
        ) : <Dato T={T} k="Sin plan de horas para esta semana" v="" />}
      </Bloque>

      <Bloque T={T} titulo="Dónde deja los paquetes">
        {c.d ? (
          <>
            <Dato T={T} k="Entregas medidas" v={String(c.d.entregas)} />
            <Dato T={T} k="Sin nadie delante" v={`${c.pct} %`} tono={c.pct > FLOTA_PCT ? T.ojo : T.bien}
              pie={`La flota va al ${FLOTA_PCT} %`} />
            <Dato T={T} k="Exceso sobre la media" v={`${c.exceso > 0 ? '+' : ''}${c.exceso} paquetes`}
              tono={c.exceso > 0 ? T.mal : T.bien}
              pie={c.d.entregas < 250 ? 'Muestra corta: por debajo de 250 entregas el porcentaje se mueve mucho.' : null} />
          </>
        ) : <Dato T={T} k="Sin datos de entrega" v="" />}
      </Bloque>

      {t && (
        <Bloque T={T} titulo="Cuadrante de la semana">
          <div style={{ display: 'flex', gap: 4 }}>
            {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((d, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: T.tenue }}>{d}</div>
                <div style={{
                  marginTop: 3, padding: '5px 0', borderRadius: 6, fontSize: 10.5, fontWeight: 600,
                  background: t.dias[i] === 'ruta' ? T.acento + '20' : T.lineaSuave,
                  color: t.dias[i] === 'ruta' ? T.acento : T.tenue,
                }}>{t.dias[i] === 'ruta' ? 'ruta' : 'libre'}</div>
              </div>
            ))}
          </div>
        </Bloque>
      )}

      <Bloque T={T} titulo="Ficha">
        <Dato T={T} k="Teléfono" v={c.phone} />
        <Dato T={T} k="ID de Amazon" v={c.driver_id || 'sin rellenar'} tono={c.driver_id ? T.tinta : T.ojo}
          pie={c.driver_id ? null : 'Sin esto no se puede cruzar el informe de excepciones del scorecard con su ficha.'} />
        <Dato T={T} k="Incidencias en las que estuvo" v={String(incs.length)}
          pie="Estar implicado no es ser responsable: se enumera, no se juzga." />
      </Bloque>

      <Bloque T={T} titulo="Últimas inspecciones">
        {insp.length === 0 ? <Dato T={T} k="Ninguna" v="" /> : insp.map((i) => (
          <Dato key={i.id} T={T} k={`${fecha(i.created_at)} · ${vehPorId(i.vehicle_id)?.license_plate}`}
            v={i.analysis_status !== 'ok' ? 'sin analizar' : i.severity}
            tono={i.analysis_status !== 'ok' ? T.mal : T[SEVT[i.severity]] || T.tinta} />
        ))}
      </Bloque>
    </Panel>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   REPARTO
   ═══════════════════════════════════════════════════════════════════════════ */
export function Reparto({ T }) {
  const paradas = rutas.filter((r) => r.min_sin_entregar >= 120)
  const entregados = rutas.reduce((a, r) => a + r.delivered, 0)
  const total = rutas.reduce((a, r) => a + r.total, 0)
  const frescura = Math.round((Date.now() - Date.parse(cortexOverview.last_capture_at)) / 60000)

  return (
    <>
      <Etq T={T}>Reparto · {rutas.length} rutas</Etq>
      <Titulo T={T} sub={<>Minutos desde la última entrega y paquetes pendientes. Son <b style={{ color: T.tinta, fontWeight: 600 }}>hechos</b>: no hay predicción de hora de fin porque se probó sobre 702 rutas y las que acababan mal iban al 60 % a las 14:00, las buenas al 62 %.</>}>
        {entregados.toLocaleString('es-ES')} de {total.toLocaleString('es-ES')} entregados
      </Titulo>

      <div style={{ marginTop: 22, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'baseline' }}>
        <Metrica T={T} k="Rutas paradas +2h" v={paradas.length} tono={paradas.length ? T.mal : T.bien} />
        <Metrica T={T} k="En paradero desconocido" v={cortexOverview.missing_now} tono={cortexOverview.missing_now ? T.ojo : T.bien} />
        <Metrica T={T} k="Cortex capturó hace" v={`${frescura} min`} tono={frescura > 45 ? T.mal : T.tenue} />
      </div>

      <div style={{ marginTop: 26 }}>
        {[...rutas].sort((a, b) => b.min_sin_entregar - a.min_sin_entregar).map((r) => (
          <div key={r.route_code} style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '13px 0' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600, minWidth: 68 }}>{r.route_code}</span>
              <span style={{ fontSize: 12.5, color: T.tenue, flex: '1 1 140px' }}>{r.driver_name}</span>
              {r.missing > 0 && <Chip T={T} tono={T.mal}>{r.missing} perdidos</Chip>}
              <span style={{ fontSize: 12.5, color: T.tenue, fontVariantNumeric: 'tabular-nums' }}>{r.delivered}/{r.total}</span>
              <span style={{ fontSize: 14, fontWeight: 600, minWidth: 78, textAlign: 'right', color: r.min_sin_entregar >= 120 ? T.mal : T.tenue }}>
                {hm(r.min_sin_entregar)}
              </span>
            </div>
            <div style={{ marginTop: 8 }}><Barra T={T} pct={(r.delivered / r.total) * 100} tono={r.min_sin_entregar >= 120 ? T.mal : T.bien} /></div>
          </div>
        ))}
      </div>

      <Nota T={T}>
        Un parón puede ser una comida, una zona sin cobertura o un edificio con muchas entregas seguidas. Caza el
        70 % de las rutas que acaban mal pero acierta el 41 % de las veces, así que <b style={{ color: T.suave }}>no es
        una alerta automática</b>: se enseña con la ruta delante y decides tú.
      </Nota>
    </>
  )
}

const Metrica = ({ T, k, v, tono }) => (
  <div>
    <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.025em', color: tono || T.tinta, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
    <div style={{ marginTop: 2, fontSize: 11.5, color: T.tenue }}>{k}</div>
  </div>
)

/* ═══════════════════════════════════════════════════════════════════════════
   TALLER
   ═══════════════════════════════════════════════════════════════════════════ */
export function Taller({ T }) {
  const [f, setF] = useState('sin')
  const sin = danos.filter((d) => d.repair_status === 'pending')
  const en = danos.filter((d) => d.repair_status === 'assigned')
  const hechos = danos.filter((d) => d.repair_status === 'done')
  const abiertas = incidencias.filter((i) => i.status !== 'resolved')

  const listas = { sin, en, hechos }
  const lista = listas[f] || sin

  return (
    <>
      <Etq T={T}>Taller y daños</Etq>
      <Titulo T={T} sub={<>El cubo que importa es el primero: daños sin taller, sin presupuesto y sin importe. Mientras siga así no se ha decidido si lo paga el seguro, el renting o tú — y <b style={{ color: T.tinta, fontWeight: 600 }}>por defecto lo pagas tú</b>.</>}>
        {sin.length} daños que no gestiona nadie
      </Titulo>

      <div style={{ marginTop: 22, display: 'flex', flexWrap: 'wrap', gap: 22 }}>
        <Metrica T={T} k={`Sin gestionar · ${eur(sin.reduce((a, d) => a + d.estimated_cost, 0))} por tarifa`} v={sin.length} tono={T.ojo} />
        <Metrica T={T} k="En taller" v={en.length} tono={T.suave} />
        <Metrica T={T} k={`Pagado · ${eur(hechos.reduce((a, d) => a + (d.actual_cost || 0), 0))}`} v={hechos.length} tono={T.tinta} />
        <Metrica T={T} k="Incidencias abiertas" v={abiertas.length} tono={abiertas.length ? T.ojo : T.bien} />
      </div>

      <div style={{ marginTop: 26 }}>
        <Filtros T={T} valor={f} onChange={setF} opciones={[
          ['sin', 'Sin gestionar', sin.length], ['en', 'En taller', en.length], ['hechos', 'Reparados', hechos.length],
        ]} />
      </div>

      <div style={{ marginTop: 14 }}>
        {lista.slice(0, 20).map((d) => {
          const v = vehPorId(d.vehicle_id)
          const w = talleres.find((x) => x.id === d.workshop_id)
          return (
            <Fila key={d.id} T={T}
              izq={`${v?.license_plate} · ${d.part}`}
              sub={`${v?.brand} ${v?.model} · desde ${fecha(d.first_seen)}${w ? ` · ${w.name}` : ''}`}
              medio={<Chip T={T} tono={T[SEVT[d.severity]]}>{d.severity}</Chip>}
              der={d.actual_cost ? eur(d.actual_cost) : eur(d.estimated_cost)}
              derTono={d.actual_cost ? T.tinta : T.tenue}
              pie={d.actual_cost ? 'factura real' : 'tarifa por panel y severidad — no es un presupuesto'} />
          )
        })}
      </div>

      <div style={{ marginTop: 40 }}>
        <Etq T={T}>Talleres</Etq>
        <div style={{ marginTop: 12 }}>
          {talleres.map((w) => (
            <Fila key={w.id} T={T}
              izq={w.name} sub={`${w.categories.join(', ')} · ${w.city} · ${w.hours}`}
              medio={<>
                {w.is_official && <Chip T={T} tono={T.acento}>oficial</Chip>}
                <Chip T={T} tono={T.tenue}><Phone size={10} /> {w.phone}</Chip>
                <Chip T={T} tono={T.tenue}>convenio {w.convenios.join(', ')}</Chip>
              </>}
              der={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Star size={11} /> {w.rating}</span>}
              derTono={T.tenue} />
          ))}
        </div>
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PLANIFICACIÓN
   ═══════════════════════════════════════════════════════════════════════════ */
export function Planificacion({ T }) {
  const cuadrante = asignaciones[0].slots
  const inspHoy = new Set(inspecciones.filter((i) => i.created_at.startsWith(HOY)).map((i) => i.vehicle_id))
  const vencen = vehiculos.map((v) => ({ ...v, d: dias(v.itv_date) })).filter((v) => v.d <= 45).sort((a, b) => a.d - b.d)

  const filas = cuadrante.map((s) => {
    const v = vehPorId(s.vehicle_id)
    const bloqueo = v?.status === 'taller' ? 'En taller'
      : dias(v?.itv_date) <= 0 ? 'ITV caducada' : null
    return { ...s, v, bloqueo, insp: inspHoy.has(s.vehicle_id) }
  })
  const libres = vehiculos.filter((v) => v.status !== 'taller' && !cuadrante.some((s) => s.vehicle_id === v.id))

  return (
    <>
      <Etq T={T}>Planificación</Etq>
      <Titulo T={T} sub="Cuadrante de hoy cruzado con el estado real de cada furgoneta. Una ruta que no sale es ingreso perdido y un golpe al scorecard, así que lo primero es si puede salir.">
        {filas.filter((f) => f.bloqueo).length} de {filas.length} rutas bloqueadas
      </Titulo>

      <div style={{ marginTop: 24 }}>
        {filas.map((f) => (
          <Fila key={f.vehicle_id} T={T}
            izq={`${f.vehicle_plate} · ${f.driver_name}`}
            sub={`${f.v?.brand} ${f.v?.model}`}
            medio={<>
              {f.bloqueo && <Chip T={T} tono={T.mal}><AlertTriangle size={10} /> {f.bloqueo}</Chip>}
              <Chip T={T} tono={f.insp ? T.bien : T.ojo}>{f.insp ? 'inspección hecha' : 'sin inspección'}</Chip>
            </>} />
        ))}
      </div>

      <Nota T={T}>
        Reserva sin asignar: <b style={{ color: T.suave }}>{libres.length ? libres.slice(0, 6).map((v) => v.license_plate).join(', ') : 'ninguna'}</b>
        {libres.length > 6 && ` y ${libres.length - 6} más`}. <b style={{ color: T.suave }}>No predice absentismo</b>: no hay datos de asistencia.
      </Nota>

      <div style={{ marginTop: 42 }}>
        <Etq T={T}>Vencimientos · próximos 45 días</Etq>
        <div style={{ marginTop: 12 }}>
          {vencen.map((v) => (
            <Fila key={v.id} T={T} izq={v.license_plate} sub={`${v.brand} ${v.model} · ${v.provider}`}
              medio={<Chip T={T} tono={v.d <= 0 ? T.mal : v.d <= 15 ? T.ojo : T.tenue}>
                ITV {v.d <= 0 ? 'caducada' : `en ${v.d} días`}</Chip>}
              der={fecha(v.itv_date)} derTono={T.tenue} />
          ))}
          {vencen.length === 0 && <Vacio T={T}>Nada vence en los próximos 45 días.</Vacio>}
        </div>
      </div>

      <div style={{ marginTop: 42 }}>
        <Etq T={T}>Chat del centro</Etq>
        <div style={{ marginTop: 12 }}>
          {chat.map((m) => (
            <div key={m.id} style={{ borderTop: `1px solid ${T.lineaSuave}`, padding: '11px 0' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{m.autor}</span>
                <span style={{ fontSize: 11, color: T.tenue }}>
                  hace {Math.round((Date.now() - Date.parse(m.at)) / 60000)} min
                </span>
              </div>
              <div style={{ marginTop: 3, fontSize: 13.5, color: T.suave }}>{m.txt}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MÉTRICAS
   ═══════════════════════════════════════════════════════════════════════════ */
export function Metricas({ T }) {
  const enZona = whc.conductores.filter((c) => c.proyeccion > SUELO)
  const dsc = dscConductores.map((c) => ({
    ...c, pct: Math.round((c.sin_nadie / c.entregas) * 1000) / 10,
    exceso: Math.round(c.sin_nadie - (c.entregas * FLOTA_PCT) / 100),
  })).filter((c) => c.entregas >= 80).sort((a, b) => b.exceso - a.exceso)
  const ultima = semanas[semanas.length - 1]
  const s29 = semanas.find((s) => s.semana === 29)

  return (
    <>
      <Etq T={T}>Métricas · lo que Amazon puntúa</Etq>
      <Titulo T={T} sub={<>De las 17 scorecards recibidas, <b style={{ color: T.tinta, fontWeight: 600 }}>14 llevaban DSC en las áreas de foco</b> y pesa 40; el WHC pesa 10. La semana {s29.semana} tuvo el WHC al {s29.whc} % y el Overall en {s29.overall} · {s29.tier}: arreglar solo las horas no salva una semana.</>}>
        Semana {ultima.semana} · {ultima.tier}
      </Titulo>

      <div style={{ marginTop: 26 }}>
        <Etq T={T}>Últimas semanas</Etq>
        <div style={{ marginTop: 12 }}>
          {semanas.map((s) => (
            <Fila key={s.semana} T={T} izq={`Semana ${s.semana}`}
              sub={`WHC ${s.whc} % · DCR ${s.dcr} % · DSC ${s.dsc_dpmo} dpmo · ${s.excepciones} excepciones`}
              medio={<Chip T={T} tono={s.tier === 'Poor' ? T.mal : s.tier === 'Fair' ? T.ojo : T.bien}>{s.tier}</Chip>}
              der={s.overall} derTono={T.tenue} />
          ))}
        </div>
      </div>

      <div style={{ marginTop: 42 }}>
        <Etq T={T}>Dónde se dejan los paquetes · DSC</Etq>
        <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.65, color: T.suave, maxWidth: 560 }}>
          Ordenado por <b style={{ color: T.tinta }}>exceso en paquetes</b>, nunca por porcentaje: un 9 % con 600
          entregas no sobra nada si la flota va al {FLOTA_PCT} %; un 20 % con 150 sobra 18. Hacen falta 80 entregas
          para entrar.
        </p>
        <div style={{ marginTop: 14 }}>
          {dsc.slice(0, 10).map((c) => (
            <Fila key={c.driver_id} T={T} izq={c.nombre}
              sub={`${c.entregas} entregas · ${c.pct} %${c.entregas < 250 ? ' · muestra corta' : ''}`}
              der={`${c.exceso > 0 ? '+' : ''}${c.exceso} paq.`}
              derTono={c.exceso > 0 ? T.mal : T.bien} />
          ))}
        </div>
      </div>

      <div style={{ marginTop: 42 }}>
        <Etq T={T}>Horas · riesgo de excepción</Etq>
        <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.65, color: T.suave, maxWidth: 560 }}>
          {enZona.length === 0
            ? <>Nadie proyecta por encima de {hm(SUELO)}. Todos están demostrablemente fuera de riesgo.</>
            : <>Sólo <b style={{ color: T.tinta }}>{enZona.length} de {whc.conductores.length}</b> proyectan por encima
              de {hm(SUELO)}, que es el máximo visto <i>cumpliendo</i>. Los otros {whc.conductores.length - enZona.length} no
              pueden generar excepción con lo planificado.</>}
        </p>
        <div style={{ marginTop: 14 }}>
          {enZona.map((c) => (
            <Fila key={c.driver_id} T={T} izq={c.nombre} sub={`${hm(c.trabajado)} hechas · ${c.bloques_restantes} bloque(s) por delante`}
              der={hm(c.proyeccion)} derTono={T.mal} />
          ))}
        </div>
      </div>
    </>
  )
}
