/* ─────────────────────────────────────────────────────────────────────────────
   LAB · E06 — FICHA 360 (Intelligence como capa, no como página)
   ---------------------------------------------------------------------------
   PROBLEMA MEDIDO: para entender a UN conductor hoy hay que pasar por
   Conductores → Scorecard → WHC → Turnos → Inspecciones → Incidencias →
   PackageIntel. Siete pantallas, y ninguna enlaza con la siguiente por esa
   persona: el gestor sostiene el hilo en su cabeza.

   HIPÓTESIS: la inteligencia no debe ser una página a la que se va, sino una
   capa que se abre SOBRE la lista donde ya estás. El gestor no quiere navegar,
   quiere mirar una fila y entenderla.

   POR QUÉ UN DRAWER Y NO UNA PÁGINA: mantener la lista detrás preserva el
   contexto (dónde estabas, qué comparabas) y hace el coste de mirar casi cero.
   Una página nueva rompe la tarea; un drawer la acompaña. Además obliga a
   elegir: en 420 px sólo cabe lo que de verdad importa.

   Todo lo de aquí es LAB/SIMULATED (ver datos.js).
   ───────────────────────────────────────────────────────────────────────────── */
import { useEffect, useState } from 'react'
import { X, ChevronRight, AlertTriangle } from 'lucide-react'
import { DATOS_SINTETICOS } from './datos'
import { generarSenales, memoriaVehiculo, hm, fecha, REPETICION_MINIMA } from './motor'
import { BandaSintetica, Cabecera, Clase, PorQue, Frescura } from './ui'

const TIER = {
  Fantastic: '#34d399', Great: '#38bdf8', Fair: '#fbbf24', Poor: '#f87171',
}

export default function Ficha360({ datos = DATOS_SINTETICOS }) {
  const D = datos
  const [abierta, setAbierta] = useState(null)   // {tipo:'conductor'|'vehiculo', id}

  // Cerrar con Escape: un drawer que sólo se cierra con el ratón se odia rápido.
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setAbierta(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const senales = generarSenales(D)
  const senalesDe = (tipo, id) => senales.filter((s) => {
    if (tipo === 'vehiculo') {
      const v = D.vehiculos.find((x) => x.id === id)
      return v && (s.id.includes(id) || s.titulo.includes(v.license_plate))
    }
    const c = D.conductores.find((x) => x.id === id)
    return c && (s.titulo.includes(c.name) || s.resumen?.includes(c.name))
  })

  return (
    <div className="mx-auto max-w-5xl">
      <Cabecera
        titulo="Ficha 360"
        bajada="La misma lista de siempre, pero cada fila se abre y cuenta todo lo que hay que saber de esa persona o esa furgoneta. Sin salir de aquí."
      />
      <BandaSintetica />

      <p className="mb-6 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[13px] leading-relaxed text-dark-400">
        <b className="font-semibold text-dark-200">Qué se está probando:</b> que la inteligencia sea una capa que se
        abre sobre la lista, y no una pantalla aparte. Hoy entender a un conductor cuesta siete pantallas.
        Pulsa cualquier fila.
      </p>

      <div className="grid gap-x-10 lg:grid-cols-2">
        <Lista
          titulo="Conductores"
          filas={D.conductores.map((c) => {
            const sc = (D.scorecardConductores || []).find((s) => s.driver_id === c.id)
            const w = (D.whc?.conductores || []).find((x) => x.driver_id === c.id)
            return {
              id: c.id, principal: c.name,
              secundario: `${c.nivel || '—'} · ${c.contrato || '—'}`,
              chip: sc?.tier, chipColor: TIER[sc?.tier],
              aviso: w && D.whc && (w.proyeccion > D.whc.limite_min),
              n: senalesDe('conductor', c.id).length,
            }
          })}
          onAbrir={(id) => setAbierta({ tipo: 'conductor', id })}
        />
        <Lista
          titulo="Vehículos"
          filas={D.vehiculos.map((v) => ({
            id: v.id, principal: v.license_plate,
            secundario: `${v.brand} ${v.model}`,
            chip: v.status === 'taller' ? 'taller' : null, chipColor: '#fbbf24',
            aviso: memoriaVehiculo(D, v.id).repeticiones.length > 0,
            n: senalesDe('vehiculo', v.id).length,
          }))}
          onAbrir={(id) => setAbierta({ tipo: 'vehiculo', id })}
        />
      </div>

      {abierta && (
        <Drawer D={D} sel={abierta} senales={senalesDe(abierta.tipo, abierta.id)} onCerrar={() => setAbierta(null)} />
      )}
    </div>
  )
}

function Lista({ titulo, filas, onAbrir }) {
  return (
    <section className="rise mb-8">
      <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">{titulo}</h2>
      <div className="divide-y divide-white/[0.05]">
        {filas.map((f) => (
          <button
            key={f.id}
            onClick={() => onAbrir(f.id)}
            className="float-row group -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-3 rounded-xl px-3 py-3 text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14.5px] font-semibold text-dark-50">{f.principal}</span>
                {f.chip && (
                  <span className="rounded-full px-1.5 py-0 text-[9.5px] font-bold uppercase tracking-wider"
                    style={{ color: f.chipColor, background: (f.chipColor || '#888') + '18' }}>{f.chip}</span>
                )}
                {f.aviso && <AlertTriangle size={12.5} className="text-amber-400" />}
              </div>
              <div className="mt-0.5 truncate text-[11.5px] text-dark-600">{f.secundario}</div>
            </div>
            {f.n > 0 && <span className="shrink-0 text-[11.5px] tabular-nums text-dark-500">{f.n} señal{f.n > 1 ? 'es' : ''}</span>}
            <ChevronRight size={14} className="shrink-0 text-dark-700 transition-transform group-hover:translate-x-0.5 group-hover:text-dark-400" />
          </button>
        ))}
      </div>
    </section>
  )
}

function Drawer({ D, sel, senales, onCerrar }) {
  const esCond = sel.tipo === 'conductor'
  const c = esCond ? D.conductores.find((x) => x.id === sel.id) : null
  const v = !esCond ? D.vehiculos.find((x) => x.id === sel.id) : null
  const sc = esCond ? (D.scorecardConductores || []).find((s) => s.driver_id === sel.id) : null
  const w = esCond ? (D.whc?.conductores || []).find((x) => x.driver_id === sel.id) : null
  const mem = !esCond ? memoriaVehiculo(D, sel.id) : null
  const incsCond = esCond ? (D.incidencias || []).filter((i) => i.driver_id === sel.id) : []
  const inspecciones = (D.inspecciones || []).filter((i) =>
    esCond ? i.driver_id === sel.id : i.vehicle_id === sel.id)
  const rutaHoy = esCond ? (D.rutas || []).find((r) => r.driver_id === sel.id) : null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onCerrar} />
      <aside className="animate-pop relative flex h-full w-full max-w-[440px] flex-col overflow-y-auto border-l border-white/[0.08] bg-dark-950 shadow-2xl">
        <header className="sticky top-0 z-10 glass border-b px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] text-dark-600">
                {esCond ? 'Conductor' : 'Vehículo'}
              </p>
              <h2 className="mt-0.5 truncate font-display text-[22px] font-semibold tracking-[-0.02em] text-dark-50">
                {esCond ? c.name : v.license_plate}
              </h2>
              <p className="mt-0.5 text-[12px] text-dark-500">
                {esCond ? `${c.nivel || '—'} · ${c.contrato || '—'} · ${c.center || '—'}` : `${v.brand} ${v.model} · ${v.provider || '—'}`}
              </p>
            </div>
            <button onClick={onCerrar} className="btn-ghost shrink-0 p-1.5" aria-label="Cerrar">
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="flex-1 divide-y divide-white/[0.05] px-5">
          {/* AHORA — lo primero, porque es lo único accionable en caliente */}
          <Bloque titulo="Ahora">
            {esCond ? (
              rutaHoy ? (
                <Dato k={rutaHoy.route_code}
                  v={`${rutaHoy.delivered}/${rutaHoy.total} entregados · ${rutaHoy.pendientes} pendientes`}
                  extra={rutaHoy.min_sin_entregar != null ? `${rutaHoy.min_sin_entregar} min sin entregar` : null}
                  alerta={rutaHoy.min_sin_entregar >= 120} clase="hecho" />
              ) : <Vacio txt="Hoy no tiene ruta en Cortex." />
            ) : (
              <Dato k="Estado" v={v.status === 'taller' ? `En taller · ${v.workshop_reason || ''}` : 'En servicio'}
                alerta={v.status === 'taller'} clase="hecho" />
            )}
          </Bloque>

          {/* HORAS — sólo conductor. Aritmética, no profecía. */}
          {esCond && (
            <Bloque titulo="Horas de la semana">
              {w ? (
                <>
                  <Dato k="Trabajado" v={hm(w.trabajado)} clase="hecho" />
                  <Dato k="Proyección si completa" v={hm(w.proyeccion)}
                    extra={`tu límite ${hm(D.whc.limite_min)}`}
                    alerta={w.proyeccion > D.whc.limite_min} clase="aritmetica" />
                </>
              ) : <Vacio txt="No hay plan de horas pegado para esta semana." />}
            </Bloque>
          )}

          {/* SCORECARD — dato medido, tal cual lo publica Amazon */}
          {esCond && (
            <Bloque titulo="Scorecard">
              {sc ? (
                <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                  <Mini k="Tier" v={sc.tier} color={TIER[sc.tier]} />
                  <Mini k="DCR" v={`${sc.dcr} %`} />
                  <Mini k="DNR" v={`${sc.dnr_dpmo} dpmo`} />
                  <Mini k="POD" v={`${sc.pod} %`} />
                </div>
              ) : <Vacio txt="Sin scorecard de esta semana. Si la ficha no tiene el ID de Amazon, no se puede cruzar." />}
            </Bloque>
          )}

          {/* MEMORIA — sólo vehículo. Repetición contable, nunca "patrón". */}
          {!esCond && (
            <Bloque titulo={`Memoria · últimos ${mem.meses} meses`}>
              {mem.incidencias.length === 0 ? (
                <Vacio txt="Sin incidencias registradas en el periodo." />
              ) : (
                <>
                  {mem.repeticiones.map((r) => (
                    <div key={r.tipo} className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-amber-200">
                          {r.n} incidencias de {r.tipo} en {mem.meses} meses
                        </span>
                        <Clase id="hecho" mini />
                      </div>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-amber-200/70">
                        Con {r.conductores.length} conductor{r.conductores.length > 1 ? 'es' : ''} distinto{r.conductores.length > 1 ? 's' : ''}.
                      </p>
                      {/* La línea que separa esto de la charlatanería */}
                      <p className="mt-2 text-[11.5px] leading-relaxed text-dark-500">
                        Es un <b className="text-dark-300">recuento</b>, no un patrón demostrado: {REPETICION_MINIMA} casos
                        no bastan para afirmar que esta furgoneta se desvía del resto de la flota. Sirve para mirarla, no
                        para concluir.
                      </p>
                    </div>
                  ))}
                  {mem.incidencias.map((i) => (
                    <Dato key={i.id} k={fecha(i.created_at)} v={i.description}
                      extra={i.status === 'resolved' ? 'resuelta' : 'abierta'}
                      alerta={i.status !== 'resolved'} clase="hecho" />
                  ))}
                </>
              )}
            </Bloque>
          )}

          {esCond && incsCond.length > 0 && (
            <Bloque titulo="Incidencias en las que estuvo">
              {incsCond.map((i) => (
                <Dato key={i.id} k={fecha(i.created_at)} v={i.description}
                  extra={i.status === 'resolved' ? 'resuelta' : 'abierta'} clase="hecho" />
              ))}
              <p className="mt-2 text-[11.5px] leading-relaxed text-dark-600">
                Estar implicado no es ser responsable: la ficha lo enumera, no lo juzga.
              </p>
            </Bloque>
          )}

          <Bloque titulo="Inspecciones">
            {inspecciones.length === 0 ? <Vacio txt="Ninguna registrada." /> : inspecciones.slice(0, 5).map((i) => (
              <Dato key={i.id} k={fecha(i.created_at)}
                v={i.analysis_status !== 'ok' ? 'sin analizar' : (i.severity || '—')}
                extra={i.new_damages ? `${i.new_damages} daño nuevo` : null}
                alerta={i.severity === 'grave' || i.analysis_status !== 'ok'}
                clase={i.analysis_status !== 'ok' ? 'hecho' : 'estimacion'} />
            ))}
          </Bloque>

          {senales.length > 0 && (
            <Bloque titulo="Señales abiertas">
              {senales.map((s) => (
                <div key={s.id} className="mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Clase id={s.clase} mini />
                    <span className="text-[13.5px] font-medium leading-snug text-dark-100">{s.titulo}</span>
                  </div>
                  <PorQue senal={s} fuentes={D.fuentes} />
                </div>
              ))}
            </Bloque>
          )}

          <div className="py-5">
            <Frescura fuente="inspecciones" fuentes={D.fuentes} />
          </div>
        </div>
      </aside>
    </div>
  )
}

function Bloque({ titulo, children }) {
  return (
    <section className="py-5">
      <h3 className="mb-2.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] text-dark-600">{titulo}</h3>
      {children}
    </section>
  )
}

function Dato({ k, v, extra, alerta, clase }) {
  return (
    <div className="mb-2 flex items-baseline gap-2.5">
      <span className="shrink-0 text-[12px] tabular-nums text-dark-600">{k}</span>
      <span className={`flex-1 text-[13.5px] leading-snug ${alerta ? 'text-amber-200' : 'text-dark-100'}`}>{v}</span>
      {extra && <span className="shrink-0 text-[11.5px] text-dark-500">{extra}</span>}
      {clase && <Clase id={clase} mini />}
    </div>
  )
}

function Mini({ k, v, color }) {
  return (
    <div>
      <div className="font-mono text-[9.5px] uppercase tracking-wider text-dark-600">{k}</div>
      <div className="text-[15px] font-semibold tabular-nums" style={{ color: color || 'rgb(var(--dk-50))' }}>{v}</div>
    </div>
  )
}

function Vacio({ txt }) {
  return <p className="text-[12.5px] leading-relaxed text-dark-500">{txt}</p>
}
