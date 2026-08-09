/* ─────────────────────────────────────────────────────────────────────────────
   EL CIERRE DE LAS 22:00 — vista previa de lo que llegaría a Telegram
   ---------------------------------------------------------------------------
   Sustituye al mensaje actual, que sólo dice quién ha subido inspección: eso es
   un parte de asistencia, no un cierre de jornada.

   La pantalla no es el producto — el producto es el mensaje. Esto sirve para
   afinar el texto antes de tocar el backend, porque un mensaje diario que no
   se lee es peor que no mandar nada.

   Datos: LAB/SIMULATED.
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react'
import { Send, Copy, Check } from 'lucide-react'
import { vehiculos, danos, asignaciones, rutas, HOY } from '../app2/datosPlus'
import { generarCierre, comoTexto } from './parte/generar'

/* Extras que hoy no están en las fixtures y que el cierre necesita.
   Cada uno lleva anotado de dónde saldría con datos reales. */
/* La nave. Cualquier fallo registrado AQUÍ a primera hora no es una entrega
   fallida: es un paquete anulado antes de que el repartidor abriera la app. */
const DIRECCIONES_ESTACION = ['Rúa da Cidade do Transporte B, 671, Santiago de Compostela']

/* Fallos del día tal y como llegan de Cortex. Fíjate en la mezcla: los de la
   nave a primera hora son anulaciones; los de calle por la tarde son fallos
   de verdad. La regla mira la DIRECCIÓN, no el motivo. */
const FALLIDOS = [
  { tba: 'ES2583223470', quien: 'Gerardo Porto', motivo: 'Imposible de entregar', at: '2026-08-09T07:00:00Z', stop_address: 'Rúa da Cidade do Transporte B, 671, Santiago de Compostela' },
  { tba: 'ES2584185676', quien: 'Jose Ángel Calvo', motivo: 'Imposible de entregar', at: '2026-08-09T09:29:00Z', stop_address: 'Rúa da Cidade do Transporte B, 671, Santiago de Compostela' },
  { tba: 'ES2586113688', quien: 'Pablo Otero', motivo: 'Imposible de entregar', at: '2026-08-09T09:37:00Z', stop_address: 'Rúa da Cidade do Transporte B, 671, Santiago de Compostela' },
  { tba: 'ES2586181112', quien: 'Luis F. González', motivo: 'Imposible de entregar', at: '2026-08-09T09:44:00Z', stop_address: 'Rúa da Cidade do Transporte B, 671, Santiago de Compostela' },
  { tba: 'ES2585916746', quien: 'Seidy E. Mardeni', motivo: 'Imposible de entregar', at: '2026-08-09T10:06:00Z', stop_address: 'Rúa da Cidade do Transporte B, 671, Santiago de Compostela' },
  { tba: 'ES2582979130', quien: 'Gerson D. Santander', motivo: 'Imposible de entregar', at: '2026-08-09T12:50:00Z', stop_address: 'Urbanización A Gandariña, 31, Rois' },
  { tba: 'ES2585968850', quien: 'Daniel Suárez', motivo: 'El cliente ya no quiere el paquete', at: '2026-08-09T14:11:00Z', stop_address: 'Calle Tras Santa Isabel 10, Santiago de Compostela' },
  { tba: 'ES2586174834', quien: 'Álvaro Flores', motivo: 'El cliente ya no quiere el paquete', at: '2026-08-09T14:45:00Z', stop_address: 'Calle Arcai 47, Bembibre Val do Dubra' },
]

const EXTRA = {
  paquetesFallidos: FALLIDOS,
  direccionesEstacion: DIRECCIONES_ESTACION,
  paquetesSinEstacion: 0,            // sin service_area_id mapeado a un centro
  cancelados: null,                  // se calcula solo desde los fallos de la nave
  flotaPct: 8.31,                    // media de la flota, docs/DSC.md
  cerradoMediodia: { n: 11, enFranja: 6 },   // causa "comercio cerrado" x hora del intento
  retornosSinCausa: 4,               // tabla RTS del reporte diario, motivo vacío
  whcDiasSinMirar: 3,                // días desde el último plan pegado
  reportesEnRiesgo: 2,               // días de reporte sin re-descargar (ventana 1-3 d)
  dscHoy: [
    { nombre: 'Adriana Sixto', entregas: 168, sin_nadie: 31 },
    { nombre: 'Marta Iglesias', entregas: 181, sin_nadie: 14 },
    { nombre: 'Iago Ventoso', entregas: 42, sin_nadie: 9 },   // no entra: muestra corta
  ],
  reincidencia: { matricula: '2834 NGX', n: 3, parte: 'la puerta lateral izquierda', proveedor: 'Kinto One' },
}

export default function ParteTelegram({ center }) {
  const centro = center && center !== 'Todos' ? center : 'DGA1'
  const [copiado, setCopiado] = useState(false)

  const cierre = useMemo(() => {
    /* Se fuerza un daño de hoy para que el bloque no salga vacío en la maqueta */
    const danosHoy = danos.slice(0, 2).map((d, i) => ({
      ...d, first_seen: HOY,
      vehicle_id: asignaciones[0].slots[i * 3]?.vehicle_id || d.vehicle_id,
    }))
    return generarCierre(
      { rutas, vehiculos, asignaciones, danos: danosHoy, ...EXTRA },
      HOY, centro)
  }, [centro])

  const texto = comoTexto(cierre)

  return (
    <div className="animate-fade-in">
      <header className="rise pb-5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-dark-500">
          Cierre de las 22:00 · {centro}
        </p>
        <h1 className="mt-2 font-display text-[clamp(23px,3.2vw,31px)] font-semibold leading-[1.12] tracking-[-0.03em] text-dark-50">
          Lo que llegaría a Telegram
        </h1>
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-dark-400">
          En vez de la lista de quién ha subido inspección. Cada línea lleva su cifra y su origen:
          <b className="font-semibold text-dark-200"> un consejo sin número detrás es un horóscopo</b>, y a la tercera
          semana nadie abre el mensaje.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── El mensaje ── */}
        <div className="rounded-2xl border border-white/[0.07] bg-dark-900/60 p-5">
          <div className="mb-4 flex items-center gap-2 border-b border-white/[0.06] pb-3">
            <Send size={13} className="text-brand-400" />
            <span className="text-[12.5px] font-medium text-dark-300">FlotaDSP · {centro}</span>
            <span className="ml-auto text-[11.5px] text-dark-600">22:00</span>
          </div>

          <Bloque titulo={`DCR de ruta · ${cierre.dcr.dcrRuta} %`}>
            <p className="text-[14px] leading-relaxed text-dark-200">
              <b className="font-semibold text-dark-50">{cierre.dcr.entregados}</b> entregados
              de <b className="font-semibold text-dark-50">{cierre.dcr.salieron}</b> que salieron a reparto.
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-dark-500">
              <b className="text-dark-300">{cierre.dcr.nuncaSalieron} se anularon en la nave</b> antes de que nadie
              abriera la app: figuran como «imposible de entregar» en la propia dirección de la estación, a primera
              hora. No son entregas fallidas, así que salen del denominador.
              Contándolos, el DCR bajaría a {cierre.dcr.dcrBruto} % — {Math.abs(cierre.dcr.diferencia)} puntos de
              castigo por algo que no pasó.
            </p>
            {cierre.dcr.anulados?.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[12px] text-dark-500 transition-colors hover:text-dark-300">
                  Ver los {cierre.dcr.anulados.length} anulados
                </summary>
                <div className="mt-2 space-y-1">
                  {cierre.dcr.anulados.map((p) => (
                    <div key={p.tba} className="flex flex-wrap gap-x-2 text-[11.5px] text-dark-500">
                      <span className="tabular-nums text-dark-600">{String(p.at).slice(11, 16)}</span>
                      <span className="text-dark-300">{p.quien}</span>
                      <span className="text-dark-600">{p.tba}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {cierre.dcr.dudoso && (
              <p className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[12.5px] leading-relaxed text-amber-200">
                {cierre.dcr.sinEstacion} paquetes no tienen estación reconocida. No se reparten entre centros a
                ojo: hasta que la extensión mande el identificador, este DCR no es fiable.
              </p>
            )}
            {cierre.dcr.noEntregados > 0 && (
              <p className="mt-1.5 text-[13px] text-amber-300">
                Se quedaron sin entregar {cierre.dcr.noEntregados}.
              </p>
            )}
          </Bloque>

          <Bloque titulo={cierre.danos.length ? `Daños nuevos · ${cierre.danos.length}` : 'Daños nuevos · ninguno'}>
            {cierre.danos.length === 0 ? (
              <p className="text-[13.5px] text-emerald-400/90">Ninguno hoy.</p>
            ) : cierre.danos.map((d, i) => (
              <div key={i} className="mb-2.5 last:mb-0">
                <p className="text-[14px] text-dark-100">
                  <b className="font-semibold text-dark-50">{d.matricula}</b> — {d.parte}
                  <span className="text-dark-500"> ({d.severidad}, ~{d.tarifa} € de tarifa)</span>
                </p>
                <p className="mt-0.5 text-[12.5px] text-dark-500">
                  La llevaba <span className="text-dark-300">{d.quien || 'nadie según el cuadrante'}</span>
                  {d.quien && ' · el golpe está acotado a ese turno'}
                </p>
              </div>
            ))}
          </Bloque>

          <Bloque titulo="Para mañana">
            {cierre.consejos.map((c, i) => (
              <div key={i} className="mb-3 last:mb-0">
                <p className="text-[14px] leading-relaxed text-dark-100">{c.texto}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-brand-400/90">{c.accion}</p>
              </div>
            ))}
          </Bloque>

          <Bloque titulo="No se te olvide">
            {cierre.recordatorios.map((r, i) => (
              <p key={i} className={`mb-2 text-[13.5px] leading-relaxed last:mb-0 ${
                r.urgencia === 'alta' ? 'text-amber-200' : 'text-dark-300'}`}>
                {r.texto}
              </p>
            ))}
          </Bloque>

          <p className="mt-4 border-t border-white/[0.06] pt-3 text-[11.5px] leading-relaxed text-dark-600">
            {cierre.limites[0]}
          </p>

          <button
            onClick={() => { navigator.clipboard?.writeText(texto).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800) }).catch(() => {}) }}
            className="btn-secondary mt-4 flex items-center gap-1.5 text-[12.5px]">
            {copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar el texto plano</>}
          </button>
        </div>

        {/* ── De dónde sale cada línea ── */}
        <aside className="text-[12.5px] leading-relaxed text-dark-400">
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-dark-500">De dónde sale cada cosa</h3>
          <Fuente k="DCR de ruta" v="cortex_packages: entregados / los que llegaron a estar en la furgoneta." />
          <Fuente k="Los que no salieron" v="Los que nunca pasaron de OBSERVED. Aproximación: el mapa de estados de Cortex no tiene cancelación." alerta />
          <Fuente k="Daños nuevos" v="analysis.new_damages del día, cruzado con daily_assignments para saber quién la llevaba." />
          <Fuente k="Franja del mediodía" v="Causa del intento fallido × hora. El 44 % de los fallos por comercio cerrado caen entre las 14 y las 16 h." />
          <Fuente k="Tiempo parado" v="Hora de la última entrega. Comprobada contra cortex_events, desviación mediana 0 s." />
          <Fuente k="Dónde deja los paquetes" v="timeline.context del último DELIVERED. Mínimo 80 entregas para nombrar a alguien." />
          <Fuente k="Aviso de WHC" v="Días desde el último plan pegado. Una excepción quita el Fantastic de la semana." />
          <Fuente k="Reportes en riesgo" v="Amazon rellena la columna DSC 1-3 días después y luego se cierra. Lo no descargado se pierde." />

          <h3 className="mt-6 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-dark-500">Lo que hace falta tocar</h3>
          <ul className="mt-2 space-y-2">
            <li className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-amber-400" />
              Reconocer en el ingest el estado de <b className="text-dark-300">cancelado antes de salir</b>. Hoy no existe y el denominador queda con el sesgo del +0,25 % que ya documentaste.</li>
            <li className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-dark-600" />
              Guardar la causa del retorno para poder contar los que vuelven sin motivo.</li>
            <li className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-dark-600" />
              Un centro por mensaje: mezclar DGA1 y OGA5 haría el DCR ilegible.</li>
          </ul>
        </aside>
      </div>
    </div>
  )
}

const Bloque = ({ titulo, children }) => (
  <section className="mb-4 border-t border-white/[0.06] pt-3.5 first:border-0 first:pt-0">
    <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-dark-500">{titulo}</h3>
    {children}
  </section>
)

const Fuente = ({ k, v, alerta }) => (
  <div className="mt-3 border-t border-white/[0.05] pt-2.5">
    <div className={`text-[12.5px] font-medium ${alerta ? 'text-amber-300' : 'text-dark-200'}`}>{k}</div>
    <div className="mt-0.5 text-[12px] text-dark-500">{v}</div>
  </div>
)
