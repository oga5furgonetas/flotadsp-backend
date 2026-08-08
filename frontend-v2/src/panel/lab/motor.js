/* ─────────────────────────────────────────────────────────────────────────────
   LAB · MOTOR DE SEÑALES
   ---------------------------------------------------------------------------
   Convierte datos en SEÑALES. Una señal no es un número: es una frase que
   afirma algo, dice de qué clase de afirmación se trata, enseña la evidencia
   que la sostiene y admite qué la invalidaría.

   LAS CUATRO CLASES (nunca se mezclan):

     HECHO        Está escrito en un campo de la base de datos. Se lee, no se
                  calcula. "La ITV caduca el 19/08" es un hecho.

     ARITMÉTICA   Suma o resta de hechos. Determinista y reproducible a mano.
                  "48h trabajadas + 9h del bloque que queda = 57h" es
                  aritmética, no una profecía: si el bloque se hace, sale ese
                  número. Se muestra con el cálculo a la vista.

     ESTIMACIÓN   Sale de un modelo (Gemini, el baremo de costes, la severidad).
                  Puede estar mal. Lleva siempre la confianza del modelo y
                  nunca se presenta con la misma cara que un hecho.

     NO DEMOSTRABLE  Cosas que el producto PODRÍA fingir que sabe y no sabe.
                  No generan señal: generan una entrada en la lista de lo que
                  no se puede afirmar (ver NO_DEMOSTRABLE, abajo).

   Regla que ordena todo: una señal sólo existe si alguien puede HACER algo con
   ella hoy. Un número que no cambia ninguna decisión es ruido con estilo.
   ───────────────────────────────────────────────────────────────────────────── */

import {
  HOY, vehiculos, conductores, ledger, inspecciones, asignaciones,
  rutas, cortexOverview, whc, contadores, conductorPorId, vehiculoPorId,
} from './datos'

export const CLASES = {
  hecho:      { id: 'hecho',      etiqueta: 'HECHO',          color: '#34d399', ayuda: 'Leído de un campo de la base de datos. No se calcula nada.' },
  aritmetica: { id: 'aritmetica', etiqueta: 'ARITMÉTICA',     color: '#38bdf8', ayuda: 'Suma o resta de hechos. Determinista: se puede rehacer a mano.' },
  estimacion: { id: 'estimacion', etiqueta: 'ESTIMACIÓN',     color: '#fbbf24', ayuda: 'Sale de un modelo. Puede estar equivocada. Lleva su confianza.' },
  nodem:      { id: 'nodem',      etiqueta: 'NO DEMOSTRABLE', color: '#f87171', ayuda: 'No se puede sostener con los datos actuales. No se afirma.' },
}

const dias = (iso) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(HOY + 'T12:00:00Z')) / 86400000)
const hm = (min) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`
const fecha = (iso) => new Date(iso.length > 10 ? iso : iso + 'T12:00:00Z')
  .toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

/* ═══════════════════════════════════════════════════════════════════════════
   LO QUE NO SE PUEDE AFIRMAR
   Está en el producto a propósito, y en primer plano. Cada entrada tiene una
   prueba detrás — no es modestia decorativa, son resultados negativos.
   ═══════════════════════════════════════════════════════════════════════════ */
export const NO_DEMOSTRABLE = [
  {
    pregunta: '¿Qué rutas van a acabar tarde?',
    veredicto: 'No se puede saber a media mañana.',
    prueba: 'Validado sobre 702 rutas de 25 días. Las rutas que acabaron muy tarde iban al 60 % a las 14:00; las que acabaron bien, al 62 %. Son indistinguibles.',
    fuente: 'docs/PREDICTOR_RESCATES.md',
    quefaltaria: 'Posición GPS de la furgoneta en tiempo real y la secuencia planificada de paradas. Cortex no da ninguna de las dos.',
    encambio: 'Se muestran los minutos sin entregar y los paquetes pendientes como HECHO, con la ruta delante, y decide el gestor.',
  },
  {
    pregunta: '¿Quién va a incumplir el límite DIARIO de horas?',
    veredicto: 'No hay ningún umbral de duración de bloque que lo reproduzca.',
    prueba: 'Contra una semana con 2 excepciones reales conocidas: >10 h marca 42 conductores, >11 h marca 5, >11,5 h marca 1 — y no es el que falló. El bloque más largo del que sí falló era de 10h 05m, con 41 bloques más largos de gente que no falló.',
    fuente: 'docs/WHC.md §3',
    quefaltaria: 'Las horas FICHADAS por día. El plan da la hora PLANIFICADA, y Amazon calcula la excepción sobre la fichada.',
    encambio: 'Los bloques de 10 h o más se marcan como RIESGO, nunca como incumplimiento.',
  },
  {
    pregunta: '¿Cuál es el tier de WHC con un 99 %?',
    veredicto: 'Se devuelve "sin confirmar". No se adivina.',
    prueba: '17 semanas reales sólo demuestran tres puntos: 100 % = Fantastic, 97,1–98,2 % = Great, 81,5 % = Poor. Entre 98,2 y 100 no hay ni un dato.',
    fuente: 'docs/WHC.md §6.1',
    quefaltaria: 'Que Amazon publique los cortes, o más semanas en esa franja.',
    encambio: 'Lo accionable sí está demostrado: 0 excepciones ⇒ Fantastic; ≥1 ⇒ Great o peor.',
  },
  {
    pregunta: '¿Cuánto dinero cuesta este daño?',
    veredicto: 'El € de la IA es una estimación, no una factura.',
    prueba: 'estimated_cost lo produce el modelo. El coste real (actual_cost) sólo existe cuando alguien lo mete tras la reparación.',
    fuente: 'backend/server.py · get_damage_costs',
    quefaltaria: 'Un baremo calibrado contra facturas reales, o integración con un tasador (GT Motive / Audatex).',
    encambio: 'Se enseñan los dos por separado y con distinto peso visual: el estimado sirve para priorizar, el real para cobrar.',
  },
]

/* ═══════════════════════════════════════════════════════════════════════════
   REGLAS
   Cada regla devuelve 0..n señales. Una regla es una función pura de los datos.
   ═══════════════════════════════════════════════════════════════════════════ */

/* R1 · WHC — proyección semanal.
   Clase: ARITMÉTICA. Lo trabajado lo da el portal (hecho); el bloque que queda
   dura ~9 h (mediana medida: 8h59m sobre 7 bloques sin hora). Sumarlos no es
   predecir: es decir qué pasa SI se completa lo planificado.
   OJO: el límite es el PROPIO (55 h), nunca "incumplimiento de Amazon". */
function reglaWHC() {
  const out = []
  for (const c of whc.conductores) {
    const margen = whc.limite_min - c.trabajado
    const pasaYa = margen < 0
    const proyPasa = c.proyeccion > whc.limite_min
    if (!pasaYa && !proyPasa) continue
    out.push({
      id: `whc-${c.driver_id}`,
      clase: pasaYa ? 'hecho' : 'aritmetica',
      prioridad: pasaYa ? 95 : 80,
      area: 'Horas',
      titulo: pasaYa
        ? `${c.nombre} ya ha pasado tu límite semanal`
        : `${c.nombre} pasa tu límite semanal si completa lo planificado`,
      resumen: pasaYa
        ? `${hm(c.trabajado)} trabajadas · ${hm(-margen)} por encima de las ${hm(whc.limite_min)}`
        : `${hm(c.trabajado)} + ${hm(c.proyeccion - c.trabajado)} del bloque que queda = ${hm(c.proyeccion)}`,
      calculo: pasaYa
        ? `${hm(c.trabajado)} − ${hm(whc.limite_min)} = ${hm(-margen)} de exceso`
        : `${hm(c.trabajado)} (trabajado, dato del portal) + ${hm(c.proyeccion - c.trabajado)} (${c.bloques_restantes} bloque restante × 9 h de mediana) = ${hm(c.proyeccion)} · límite ${hm(whc.limite_min)}`,
      evidencia: [
        { k: 'Trabajado (lo da el portal)', v: hm(c.trabajado), clase: 'hecho' },
        { k: 'Planificado', v: hm(c.planificado), clase: 'hecho' },
        { k: 'Bloques que quedan', v: String(c.bloques_restantes), clase: 'hecho' },
        { k: 'Duración implícita de bloque', v: '9h 00m (mediana medida)', clase: 'estimacion' },
        { k: 'Tu límite (editable)', v: hm(whc.limite_min), clase: 'hecho' },
      ],
      invalidadores: [
        'Si el conductor no hace el bloque que queda, la proyección no ocurre.',
        'El límite de 55 h es TUYO, no el de Amazon: se ha visto a alguien con 56h 30m sin generar excepción semanal (docs/WHC.md §6.2).',
        `El plan se pegó a mano el ${fecha(whc.pegado_el)}. Si la semana ha cambiado desde entonces, estos números son viejos.`,
      ],
      fuente: 'whc',
      acciones: [{ txt: 'Ver el desglose de bloques' }, { txt: 'Reasignar el último bloque' }, { txt: 'Ignorar esta semana' }],
    })
  }
  return out
}

/* R2 · Ruta parada.
   Clase: HECHO. min_sin_entregar sale de la hora de la última entrega, que se
   comprobó contra cortex_events sobre 400 paquetes con desviación mediana 0 s.
   NO dice "va a acabar tarde" — eso está demostrado que no se puede (§ NO_DEMOSTRABLE).
   Dice: lleva X minutos sin entregar y le quedan Y. Y ya. */
const PARON_MIN = 120
function reglaParon() {
  return rutas
    .filter((r) => (r.min_sin_entregar ?? 0) >= PARON_MIN && r.pendientes > 0)
    .map((r) => ({
      id: `paron-${r.route_code}`,
      clase: 'hecho',
      prioridad: 88,
      area: 'Reparto',
      titulo: `${r.route_code} lleva ${Math.floor(r.min_sin_entregar / 60)}h ${r.min_sin_entregar % 60}m sin entregar un paquete`,
      resumen: `${r.pendientes} pendientes de ${r.total} · ${r.driver_name}`,
      calculo: `Última entrega registrada: ${new Date(r.ultima_entrega).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}. Ahora menos esa hora = ${r.min_sin_entregar} min.`,
      evidencia: [
        { k: 'Entregados', v: `${r.delivered} de ${r.total}`, clase: 'hecho' },
        { k: 'Pendientes', v: String(r.pendientes), clase: 'hecho' },
        { k: 'Intentados sin entregar', v: String(r.attempted), clase: 'hecho' },
        { k: 'Minutos sin entregar', v: String(r.min_sin_entregar), clase: 'hecho' },
      ],
      invalidadores: [
        'Una parada larga puede ser una comida, una zona sin cobertura o un edificio grande con muchas entregas seguidas que se registran juntas.',
        'El parón caza el 70 % de las rutas que acaban mal, pero acierta sólo el 41 % de las veces: más de la mitad de los avisos serían rutas sanas. Por eso esto NO es una alerta automática (docs/PREDICTOR_RESCATES.md).',
        `Cortex capturó por última vez hace ${Math.round((Date.now() - Date.parse(cortexOverview.last_capture_at)) / 60000)} min. Si la extensión se ha parado, el contador sigue subiendo solo.`,
      ],
      fuente: 'cortex',
      acciones: [{ txt: 'Llamar al conductor' }, { txt: 'Ver los paquetes pendientes' }, { txt: 'Marcar como revisado' }],
    }))
}

/* R3 · Vencimientos (ITV / renting).
   Clase: HECHO. Es una resta de fechas contra un campo de la ficha. */
function reglaVencimientos() {
  const out = []
  for (const v of vehiculos) {
    // dias() ya devuelve "días que faltan" (negativo = pasado). Invertirlo aquí
    // hacía que una ITV a 11 días vista se anunciara como caducada.
    const dITV = v.itv_date ? dias(v.itv_date) : null
    if (dITV !== null && dITV <= 30) {
      out.push({
        id: `itv-${v.id}`,
        clase: 'hecho',
        prioridad: dITV <= 0 ? 99 : 84,
        area: 'Flota',
        titulo: dITV <= 0
          ? `${v.license_plate} circula con la ITV caducada`
          : `${v.license_plate} tiene la ITV a ${dITV} días`,
        resumen: `${v.brand} ${v.model} · caduca el ${fecha(v.itv_date)}`,
        calculo: `itv_date = ${v.itv_date}. Hoy = ${HOY}. Diferencia = ${dITV} días.`,
        evidencia: [
          { k: 'Matrícula', v: v.license_plate, clase: 'hecho' },
          { k: 'Caducidad ITV', v: v.itv_date, clase: 'hecho' },
          { k: 'Estado del vehículo', v: v.status, clase: 'hecho' },
        ],
        invalidadores: [
          'La fecha se mete a mano en la ficha. Si nadie la actualizó tras pasar la ITV, esto es un falso positivo.',
          'No hay comprobación contra ningún registro oficial: el sistema sólo sabe lo que alguien escribió.',
        ],
        fuente: 'flota',
        acciones: [{ txt: 'Reservar cita' }, { txt: 'Actualizar la fecha' }, { txt: 'Sacar de circulación' }],
      })
    }
  }
  return out
}

/* R4 · Aceite.
   Clase: ARITMÉTICA con una advertencia grande: el km de la ficha no se
   actualiza solo. Si el cuentakilómetros es viejo, el cálculo es viejo. */
function reglaAceite() {
  const out = []
  for (const v of vehiculos) {
    if (!v.oil_last_change_km || !v.mileage) continue
    const recorrido = v.mileage - v.oil_last_change_km
    const restante = v.oil_interval_km - recorrido
    if (restante > v.oil_warning_before_km) continue
    out.push({
      id: `aceite-${v.id}`,
      clase: 'aritmetica',
      prioridad: restante <= 0 ? 70 : 55,
      area: 'Flota',
      titulo: restante <= 0
        ? `${v.license_plate} ha pasado el cambio de aceite en ${Math.abs(restante).toLocaleString('es-ES')} km`
        : `${v.license_plate} llega al cambio de aceite en ${restante.toLocaleString('es-ES')} km`,
      resumen: `${recorrido.toLocaleString('es-ES')} km desde el último cambio · intervalo ${v.oil_interval_km.toLocaleString('es-ES')} km`,
      calculo: `${v.mileage.toLocaleString('es-ES')} (km actuales) − ${v.oil_last_change_km.toLocaleString('es-ES')} (km del último cambio) = ${recorrido.toLocaleString('es-ES')} km. Intervalo ${v.oil_interval_km.toLocaleString('es-ES')} → quedan ${restante.toLocaleString('es-ES')}.`,
      evidencia: [
        { k: 'Km actuales (ficha)', v: v.mileage.toLocaleString('es-ES'), clase: 'hecho' },
        { k: 'Km del último cambio', v: v.oil_last_change_km.toLocaleString('es-ES'), clase: 'hecho' },
        { k: 'Intervalo configurado', v: v.oil_interval_km.toLocaleString('es-ES'), clase: 'hecho' },
      ],
      invalidadores: [
        'Los km salen de la ficha, que se actualiza con la foto del cuentakilómetros o a mano. Si lleva días sin actualizarse, el vehículo ya ha recorrido más de lo que dice esta cuenta.',
        'Un cambio de aceite hecho en taller y no registrado deja esta señal encendida para siempre.',
      ],
      fuente: 'flota',
      acciones: [{ txt: 'Registrar cambio' }, { txt: 'Pedir cita al taller' }, { txt: 'Actualizar km' }],
    })
  }
  return out
}

/* R5 · Daño nuevo con ventana de atribución.
   Ésta es la señal más interesante del laboratorio y la que más cuidado pide.

   Clase: la EXISTENCIA del daño es ESTIMACIÓN (lo dijo un modelo, con su
   confianza). La VENTANA es HECHO: entre la inspección donde se vio por
   primera vez y la inspección limpia anterior sólo hubo unos turnos concretos,
   y daily_assignments dice quién los hizo.

   Lo que NO se hace: nombrar un culpable. Se enseña la ventana y quién estuvo
   dentro. Si la ventana tiene tres turnos, se dice que tiene tres. */
function reglaAtribucion() {
  const out = []
  const abiertos = ledger.filter((l) => l.status === 'open')
  for (const l of abiertos) {
    const dAntig = -dias(l.first_seen)
    if (dAntig > 7) continue                        // sólo lo reciente es accionable
    const v = vehiculoPorId(l.vehicle_id)
    const insp = inspecciones.find((i) => i.id === l.first_seen_inspection)
    // Inspección anterior del mismo vehículo: cierra la ventana por abajo.
    const previas = inspecciones
      .filter((i) => i.vehicle_id === l.vehicle_id && Date.parse(i.created_at) < Date.parse(insp?.created_at || HOY))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    const anterior = previas[0] || null
    const desde = anterior ? anterior.created_at.slice(0, 10) : null
    const hasta = insp ? insp.created_at.slice(0, 10) : l.first_seen
    // Turnos dentro de la ventana → quién llevó la furgoneta
    const dentro = asignaciones
      .filter((a) => (!desde || a.date > desde) && a.date <= hasta)
      .map((a) => ({ date: a.date, slot: a.slots.find((s) => s.vehicle_id === l.vehicle_id) }))
      .filter((x) => x.slot)
      .sort((a, b) => a.date.localeCompare(b.date))
    const nombres = [...new Set(dentro.map((x) => x.slot.driver_name))]
    const cerrada = nombres.length === 1
    /* Sin inspección anterior la ventana no tiene suelo: se abre hasta el
       principio del histórico. Pintar esos turnos sería teatro — con 57 turnos
       y 3 conductores no se atribuye nada. Se dice, y punto.
       (Lo descubrí construyéndolo: la primera versión dibujaba las 57 fichas.) */
    const acotada = !!desde
    const ANCHA = 4                                 // más de esto ya no señala a nadie

    out.push({
      id: `dano-${l.vehicle_id}-${l.panel}`,
      clase: 'estimacion',
      prioridad: l.rank >= 3 ? 90 : 65,
      area: 'Daños',
      titulo: `Daño ${l.severity} nuevo en ${v?.license_plate}: ${l.part}`,
      resumen: !acotada
        ? 'No atribuible: no hay ninguna inspección anterior de este vehículo'
        : cerrada
          ? `Apareció en un único turno — ${nombres[0]}, ${fecha(hasta)}`
          : `Ventana de ${dentro.length} turnos · ${nombres.length} conductores posibles`,
      calculo: `El registro de daños no tenía nada en "${l.panel}" hasta la inspección del ${fecha(hasta)}${desde ? `, y la inspección anterior del ${fecha(desde)} salió sin ese daño` : ''}. La ventana son ${dentro.length} turno(s).`,
      evidencia: [
        { k: 'Panel', v: l.panel, clase: 'hecho' },
        { k: 'Severidad (la dijo el modelo)', v: l.severity, clase: 'estimacion' },
        { k: 'Confianza del análisis', v: insp ? `${Math.round(insp.confidence * 100)} %` : '—', clase: 'estimacion' },
        { k: 'Visto por primera vez', v: `${fecha(hasta)} (inspección ${l.first_seen_inspection})`, clase: 'hecho' },
        { k: 'Inspección limpia anterior', v: desde ? fecha(desde) : 'no hay — el vehículo es nuevo en el sistema', clase: 'hecho' },
        { k: 'Turnos en la ventana',
          v: !acotada ? `sin acotar (${dentro.length} turnos, ${nombres.length} conductores)`
            : dentro.length <= ANCHA ? dentro.map((x) => `${fecha(x.date)} · ${x.slot.driver_name}`).join(' · ')
            : `${dentro.length} turnos entre el ${fecha(dentro[0].date)} y el ${fecha(dentro[dentro.length - 1].date)}`,
          clase: 'hecho' },
        { k: 'Coste estimado', v: insp?.estimated_cost ? `${insp.estimated_cost} €` : '—', clase: 'estimacion' },
      ],
      invalidadores: [
        'El daño lo detecta un modelo. Puede ser un reflejo, barro o una sombra: hasta que un humano lo valide en Revisión Rápida es una sospecha.',
        !acotada && 'No hay inspección anterior de este vehículo, así que la ventana no tiene principio: el daño pudo aparecer en cualquier momento. Esto NO señala a nadie.',
        acotada && !cerrada && `La ventana tiene ${dentro.length} turnos, así que NO identifica a nadie. Sólo con una inspección por turno la ventana se cierra a una persona.`,
        'El coste en € es una estimación del modelo, no un presupuesto.',
        'Si el vehículo pasó por chapa y no se registró, un daño viejo puede reaparecer como nuevo.',
      ].filter(Boolean),
      fuente: 'inspecciones',
      acciones: [{ txt: 'Validar en Revisión Rápida' }, { txt: 'Ver las dos fotos' }, { txt: 'Abrir parte con el renting' }],
      atribucion: { desde, hasta, turnos: dentro, cerrada, nombres, acotada, ancha: dentro.length > ANCHA },
    })
  }
  return out
}

/* R6 · Anomalía por concentración.
   Clase: ARITMÉTICA (es un recuento y una comparación con la mediana), pero
   con una compuerta dura: por debajo de N mínimo NO se emite. Una "anomalía"
   sobre 3 inspecciones es una casualidad con gráfico.  */
const N_MINIMO = 8
function reglaConcentracion() {
  const porVehiculo = {}
  for (const i of inspecciones) {
    const e = (porVehiculo[i.vehicle_id] ||= { n: 0, nuevos: 0 })
    e.n += 1
    e.nuevos += i.new_damages
  }
  const total = Object.values(porVehiculo).reduce((a, e) => a + e.n, 0)
  if (total < N_MINIMO) {
    return [{
      id: 'anomalia-sin-datos',
      clase: 'nodem',
      prioridad: 20,
      area: 'Daños',
      titulo: 'Todavía no hay datos suficientes para detectar concentraciones de daños',
      resumen: `${total} inspecciones en el periodo · hacen falta al menos ${N_MINIMO}`,
      calculo: `Con ${total} inspecciones, cualquier vehículo que destaque destaca por azar. La compuerta está en ${N_MINIMO}.`,
      evidencia: [{ k: 'Inspecciones en el periodo', v: String(total), clase: 'hecho' },
                  { k: 'Mínimo exigido', v: String(N_MINIMO), clase: 'hecho' }],
      invalidadores: ['Esta señal desaparece sola en cuanto haya muestra. No hace falta hacer nada.'],
      fuente: 'inspecciones',
      acciones: [],
    }]
  }
  return []
}

/* R7 · Salud del propio sistema.
   Nadie mira si la tubería está viva hasta que lleva tres días muerta. Un
   número viejo presentado como fresco es la peor mentira que puede contar un
   panel, así que esto va como señal, no como pie de página. */
function reglaSalud() {
  const out = []
  const minCortex = Math.round((Date.now() - Date.parse(cortexOverview.last_capture_at)) / 60000)
  if (minCortex > 45) {
    out.push({
      id: 'salud-cortex', clase: 'hecho', prioridad: 92, area: 'Sistema',
      titulo: `Cortex lleva ${minCortex} minutos sin capturar`,
      resumen: 'Todo lo de la pantalla de reparto está congelado a esa hora',
      calculo: `last_capture_at = ${cortexOverview.last_capture_at}. Ahora menos eso = ${minCortex} min.`,
      evidencia: [{ k: 'Última captura', v: new Date(cortexOverview.last_capture_at).toLocaleTimeString('es-ES'), clase: 'hecho' },
                  { k: 'Paquetes seguidos', v: String(cortexOverview.tracked), clase: 'hecho' }],
      invalidadores: ['Si la jornada ha terminado, es normal que no haya capturas nuevas.'],
      fuente: 'cortex',
      acciones: [{ txt: 'Comprobar la extensión' }],
    })
  }
  if (contadores.inspecciones_fallidas > 0) {
    out.push({
      id: 'salud-ia', clase: 'hecho', prioridad: 60, area: 'Sistema',
      titulo: `${contadores.inspecciones_fallidas} inspección sin analizar`,
      resumen: 'El análisis de IA falló — esas furgonetas no tienen parte de daños de hoy',
      calculo: 'Inspecciones con analysis_status distinto de "ok".',
      evidencia: inspecciones.filter((i) => i.analysis_status !== 'ok').map((i) => ({
        k: vehiculoPorId(i.vehicle_id)?.license_plate || i.vehicle_id, v: i.analysis_status, clase: 'hecho',
      })),
      invalidadores: ['La causa más habitual es el cupo diario de Gemini agotado, no un fallo del vehículo ni del conductor.'],
      fuente: 'inspecciones',
      acciones: [{ txt: 'Reintentar el análisis' }],
    })
  }
  return out
}

/* R8 · Conductor sin ID de Amazon.
   Pequeña, aburrida y con consecuencia real: sin driver_id no se puede cruzar
   el informe de excepciones del scorecard con la ficha, y la persona que falló
   se queda sin nombre (pasó de verdad — docs/WHC.md §4). */
function reglaSinID() {
  const sin = conductores.filter((c) => !c.driver_id)
  if (!sin.length) return []
  return [{
    id: 'sin-id', clase: 'hecho', prioridad: 40, area: 'Equipo',
    titulo: `${sin.length} conductor sin ID de Amazon en la ficha`,
    resumen: sin.map((c) => c.name).join(', '),
    calculo: 'Fichas de conductor con el campo driver_id vacío.',
    evidencia: sin.map((c) => ({ k: c.name, v: 'driver_id vacío', clase: 'hecho' })),
    invalidadores: ['Ninguno: o el campo está relleno o no lo está.'],
    fuente: 'flota',
    acciones: [{ txt: 'Emparejar desde Scorecard' }],
  }]
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export function generarSenales() {
  return [
    ...reglaWHC(), ...reglaParon(), ...reglaVencimientos(), ...reglaAceite(),
    ...reglaAtribucion(), ...reglaConcentracion(), ...reglaSalud(), ...reglaSinID(),
  ].sort((a, b) => b.prioridad - a.prioridad)
}

/* Línea de tiempo de un vehículo: ledger + inspecciones + vencimientos, todo
   sobre un mismo eje. Sin inferencia: es un ordenamiento de hechos que hoy
   viven repartidos en cuatro pantallas distintas. */
export function lineaVehiculo(vehicleId) {
  const v = vehiculoPorId(vehicleId)
  if (!v) return []
  const ev = []
  for (const i of inspecciones.filter((x) => x.vehicle_id === vehicleId)) {
    const cond = conductorPorId(i.driver_id)
    ev.push({
      fecha: i.created_at.slice(0, 10), tipo: 'inspeccion',
      titulo: i.analysis_status !== 'ok' ? 'Inspección sin analizar' : `Inspección · ${i.severity}`,
      detalle: `${cond?.name || 'sin conductor'}${i.new_damages ? ` · ${i.new_damages} daño nuevo` : ''}`,
      clase: i.analysis_status !== 'ok' ? 'hecho' : 'estimacion',
      grave: i.severity === 'grave' || i.severity === 'critico',
    })
  }
  for (const l of ledger.filter((x) => x.vehicle_id === vehicleId)) {
    ev.push({
      fecha: l.first_seen, tipo: 'dano',
      titulo: `Daño registrado · ${l.part}`,
      detalle: `severidad ${l.severity} · panel ${l.panel}`,
      clase: 'estimacion', grave: l.rank >= 3,
    })
    if (l.status === 'repaired' && l.repaired_at) {
      ev.push({
        fecha: l.repaired_at, tipo: 'reparacion',
        titulo: `Reparado · ${l.part}`, detalle: l.repaired_note || '', clase: 'hecho', grave: false,
      })
    }
  }
  if (v.itv_date) {
    ev.push({ fecha: v.itv_date, tipo: 'itv', titulo: 'Caducidad de la ITV', detalle: '', clase: 'hecho', grave: dias(v.itv_date) <= 0, futuro: dias(v.itv_date) > 0 })
  }
  return ev.sort((a, b) => b.fecha.localeCompare(a.fecha))
}

export { hm, fecha, dias }
