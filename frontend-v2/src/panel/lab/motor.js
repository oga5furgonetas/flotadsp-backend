/* ─────────────────────────────────────────────────────────────────────────────
   LAB · MOTOR DE SEÑALES
   ---------------------------------------------------------------------------
   Convierte datos en SEÑALES. Una señal no es un número: es una frase que
   afirma algo, dice de qué clase de afirmación se trata, enseña la evidencia
   que la sostiene y admite qué la invalidaría.

   El motor NO sabe de dónde vienen los datos. Recibe un paquete `D` y ya está.
   Eso es lo que permite ejecutarlo contra fixtures sintéticos (datos.js) o
   contra la API del LAB (apiLab.js) sin tocar una sola regla.

   Forma del paquete D (los nombres son los del backend real):
     { hoy, origen, vehiculos, conductores, ledger, inspecciones, asignaciones,
       rutas, cortexOverview, whc, contadores, fuentes }

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

export const CLASES = {
  hecho:      { id: 'hecho',      etiqueta: 'HECHO',          color: '#34d399', ayuda: 'Leído de un campo de la base de datos. No se calcula nada.' },
  aritmetica: { id: 'aritmetica', etiqueta: 'ARITMÉTICA',     color: '#38bdf8', ayuda: 'Suma o resta de hechos. Determinista: se puede rehacer a mano.' },
  estimacion: { id: 'estimacion', etiqueta: 'ESTIMACIÓN',     color: '#fbbf24', ayuda: 'Sale de un modelo. Puede estar equivocada. Lleva su confianza.' },
  nodem:      { id: 'nodem',      etiqueta: 'NO DEMOSTRABLE', color: '#f87171', ayuda: 'No se puede sostener con los datos actuales. No se afirma.' },
}

const DIA = 86400000
export const hm = (min) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`
export const fecha = (iso) => {
  if (!iso) return '—'
  const d = new Date(String(iso).length > 10 ? iso : iso + 'T12:00:00Z')
  return isNaN(d) ? '—' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}
/* Días que FALTAN hasta `iso` (negativo = ya pasó). Ojo con el signo: tenerlo
   invertido hacía anunciar como caducada una ITV a 11 días vista. */
export const diasHasta = (iso, hoy) =>
  Math.round((Date.parse(String(iso).slice(0, 10) + 'T12:00:00Z') - Date.parse(hoy + 'T12:00:00Z')) / DIA)
const minDesde = (iso) => (iso ? Math.round((Date.now() - Date.parse(iso)) / 60000) : null)
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null)

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
   REGLAS · cada una es función pura de D y devuelve 0..n señales
   ═══════════════════════════════════════════════════════════════════════════ */

/* R1 · WHC — proyección semanal.
   ARITMÉTICA: lo trabajado lo da el portal (hecho); el bloque que queda dura
   ~9 h (mediana medida: 8h59m). Sumarlos no es predecir, es decir qué pasa SI
   se completa lo planificado.
   El límite es el PROPIO (55 h), NUNCA "incumplimiento de Amazon": está
   demostrado que el de Amazon está por encima de 56h30m y no se conoce. */
function reglaWHC(D) {
  const w = D.whc
  if (!w || !Array.isArray(w.conductores) || !w.limite_min) return []
  const out = []
  for (const c of w.conductores) {
    const trabajado = num(c.trabajado)
    const proyeccion = num(c.proyeccion)
    if (trabajado === null) continue
    const margen = w.limite_min - trabajado
    const pasaYa = margen < 0
    const proyPasa = proyeccion !== null && proyeccion > w.limite_min
    if (!pasaYa && !proyPasa) continue
    const nombre = c.nombre || c.name || c.conductor || 'Conductor sin nombre'
    const extra = proyeccion !== null ? proyeccion - trabajado : 0
    out.push({
      id: `whc-${c.driver_id || nombre}`,
      clase: pasaYa ? 'hecho' : 'aritmetica',
      prioridad: pasaYa ? 95 : 80,
      area: 'Horas',
      titulo: pasaYa
        ? `${nombre} ya ha pasado tu límite semanal`
        : `${nombre} pasa tu límite semanal si completa lo planificado`,
      resumen: pasaYa
        ? `${hm(trabajado)} trabajadas · ${hm(-margen)} por encima de las ${hm(w.limite_min)}`
        : `${hm(trabajado)} + ${hm(extra)} del bloque que queda = ${hm(proyeccion)}`,
      calculo: pasaYa
        ? `${hm(trabajado)} − ${hm(w.limite_min)} = ${hm(-margen)} de exceso`
        : `${hm(trabajado)} (trabajado, dato del portal) + ${hm(extra)} (${c.bloques_restantes ?? '?'} bloque(s) restante(s) × 9 h de mediana) = ${hm(proyeccion)} · límite ${hm(w.limite_min)}`,
      evidencia: [
        { k: 'Trabajado (lo da el portal)', v: hm(trabajado), clase: 'hecho' },
        c.planificado != null && { k: 'Planificado', v: hm(c.planificado), clase: 'hecho' },
        { k: 'Bloques que quedan', v: String(c.bloques_restantes ?? '—'), clase: 'hecho' },
        { k: 'Duración implícita de bloque', v: '9h 00m (mediana medida)', clase: 'estimacion' },
        { k: 'Tu límite (editable)', v: hm(w.limite_min), clase: 'hecho' },
      ].filter(Boolean),
      invalidadores: [
        'Si el conductor no hace el bloque que queda, la proyección no ocurre.',
        'El límite es TUYO, no el de Amazon: se ha visto a alguien con 56h 30m sin generar excepción semanal (docs/WHC.md §6.2).',
        w.pegado_el
          ? `El plan se pegó a mano el ${fecha(w.pegado_el)}. Si la semana ha cambiado desde entonces, estos números son viejos.`
          : 'El plan se pega a mano: comprueba que el de esta semana está puesto.',
      ],
      fuente: 'whc',
      acciones: [{ txt: 'Ver el desglose de bloques' }, { txt: 'Reasignar el último bloque' }, { txt: 'Ignorar esta semana' }],
    })
  }
  return out
}

/* R2 · Ruta parada. HECHO.
   min_sin_entregar sale de la hora de la última entrega, comprobada contra
   cortex_events sobre 400 paquetes con desviación mediana 0 s.
   NO dice "va a acabar tarde": eso está demostrado que no se puede. */
const PARON_MIN = 120
function reglaParon(D) {
  return (D.rutas || [])
    .filter((r) => (r.min_sin_entregar ?? 0) >= PARON_MIN && (r.pendientes ?? 0) > 0)
    .map((r) => ({
      id: `paron-${r.route_code}`,
      clase: 'hecho',
      prioridad: 88,
      area: 'Reparto',
      titulo: `${r.route_code} lleva ${Math.floor(r.min_sin_entregar / 60)}h ${String(r.min_sin_entregar % 60).padStart(2, '0')}m sin entregar un paquete`,
      resumen: `${r.pendientes} pendientes de ${r.total} · ${r.driver_name || 'sin conductor emparejado'}`,
      calculo: `Última entrega registrada: ${r.ultima_entrega ? new Date(r.ultima_entrega).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'}. Ahora menos esa hora = ${r.min_sin_entregar} min.`,
      evidencia: [
        { k: 'Entregados', v: `${r.delivered} de ${r.total}`, clase: 'hecho' },
        { k: 'Pendientes', v: String(r.pendientes), clase: 'hecho' },
        { k: 'Intentados sin entregar', v: String(r.attempted ?? 0), clase: 'hecho' },
        { k: 'Minutos sin entregar', v: String(r.min_sin_entregar), clase: 'hecho' },
      ],
      invalidadores: [
        'Una parada larga puede ser una comida, una zona sin cobertura o un edificio grande con muchas entregas seguidas que se registran juntas.',
        'El parón caza el 70 % de las rutas que acaban mal, pero acierta sólo el 41 % de las veces: más de la mitad de los avisos serían rutas sanas. Por eso esto NO es una alerta automática (docs/PREDICTOR_RESCATES.md).',
        'Si la extensión de Cortex se ha parado, el contador sigue subiendo solo.',
      ],
      fuente: 'cortex',
      acciones: [{ txt: 'Llamar al conductor' }, { txt: 'Ver los paquetes pendientes' }, { txt: 'Marcar como revisado' }],
    }))
}

/* R3 · Vencimientos (ITV). HECHO: resta de fechas contra un campo de la ficha. */
function reglaVencimientos(D) {
  const out = []
  for (const v of D.vehiculos || []) {
    if (!v.itv_date) continue
    const d = diasHasta(v.itv_date, D.hoy)
    if (!isFinite(d) || d > 30) continue
    out.push({
      id: `itv-${v.id}`,
      clase: 'hecho',
      prioridad: d <= 0 ? 99 : 84,
      area: 'Flota',
      titulo: d <= 0
        ? `${v.license_plate} circula con la ITV caducada`
        : `${v.license_plate} tiene la ITV a ${d} días`,
      resumen: `${v.brand || ''} ${v.model || ''} · caduca el ${fecha(v.itv_date)}`.trim(),
      calculo: `itv_date = ${String(v.itv_date).slice(0, 10)}. Hoy = ${D.hoy}. Diferencia = ${d} días.`,
      evidencia: [
        { k: 'Matrícula', v: v.license_plate, clase: 'hecho' },
        { k: 'Caducidad ITV', v: String(v.itv_date).slice(0, 10), clase: 'hecho' },
        { k: 'Estado del vehículo', v: v.status || '—', clase: 'hecho' },
      ],
      invalidadores: [
        'La fecha se mete a mano en la ficha. Si nadie la actualizó tras pasar la ITV, esto es un falso positivo.',
        'No hay comprobación contra ningún registro oficial: el sistema sólo sabe lo que alguien escribió.',
      ],
      fuente: 'flota',
      acciones: [{ txt: 'Reservar cita' }, { txt: 'Actualizar la fecha' }, { txt: 'Sacar de circulación' }],
    })
  }
  return out
}

/* R4 · Aceite. ARITMÉTICA, con una advertencia grande: el km de la ficha no se
   actualiza solo. Si el cuentakilómetros es viejo, el cálculo es viejo. */
function reglaAceite(D) {
  const out = []
  for (const v of D.vehiculos || []) {
    const km = num(v.mileage), base = num(v.oil_last_change_km)
    if (km === null || base === null) continue
    const intervalo = num(v.oil_interval_km) ?? 15000
    const aviso = num(v.oil_warning_before_km) ?? 2500
    const recorrido = km - base
    const restante = intervalo - recorrido
    if (restante > aviso) continue
    const n = (x) => x.toLocaleString('es-ES')
    out.push({
      id: `aceite-${v.id}`,
      clase: 'aritmetica',
      prioridad: restante <= 0 ? 70 : 55,
      area: 'Flota',
      titulo: restante <= 0
        ? `${v.license_plate} ha pasado el cambio de aceite en ${n(Math.abs(restante))} km`
        : `${v.license_plate} llega al cambio de aceite en ${n(restante)} km`,
      resumen: `${n(recorrido)} km desde el último cambio · intervalo ${n(intervalo)} km`,
      calculo: `${n(km)} (km actuales) − ${n(base)} (km del último cambio) = ${n(recorrido)} km. Intervalo ${n(intervalo)} → quedan ${n(restante)}.`,
      evidencia: [
        { k: 'Km actuales (ficha)', v: n(km), clase: 'hecho' },
        { k: 'Km del último cambio', v: n(base), clase: 'hecho' },
        { k: 'Intervalo configurado', v: n(intervalo), clase: 'hecho' },
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
   La señal más interesante del laboratorio y la que más cuidado pide.

   La EXISTENCIA del daño es ESTIMACIÓN (lo dijo un modelo, con su confianza).
   La VENTANA es HECHO: entre la inspección que lo vio y la anterior que no lo
   vio sólo hubo unos turnos, y daily_assignments dice quién los hizo.

   Lo que NO se hace: nombrar un culpable. Se enseña la ventana. Si tiene tres
   turnos, tiene tres. Si no tiene principio, se dice que no atribuye nada. */
const ANCHA = 4          // más turnos que esto ya no señalan a nadie
function reglaAtribucion(D) {
  const out = []
  const vPorId = new Map((D.vehiculos || []).map((v) => [v.id, v]))
  for (const l of (D.ledger || []).filter((x) => x.status === 'open')) {
    if (!l.first_seen) continue
    const antig = -diasHasta(l.first_seen, D.hoy)
    if (!isFinite(antig) || antig > 7 || antig < 0) continue     // sólo lo reciente es accionable
    const v = vPorId.get(l.vehicle_id)
    const insp = (D.inspecciones || []).find((i) => i.id === l.first_seen_inspection)
    const refT = insp ? Date.parse(insp.created_at) : Date.parse(l.first_seen + 'T12:00:00Z')
    const anterior = (D.inspecciones || [])
      .filter((i) => i.vehicle_id === l.vehicle_id && Date.parse(i.created_at) < refT)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null
    const desde = anterior ? anterior.created_at.slice(0, 10) : null
    const hasta = insp ? insp.created_at.slice(0, 10) : String(l.first_seen).slice(0, 10)
    const dentro = (D.asignaciones || [])
      .filter((a) => (!desde || a.date > desde) && a.date <= hasta)
      .map((a) => ({ date: a.date, slot: (a.slots || []).find((s) => s.vehicle_id === l.vehicle_id) }))
      .filter((x) => x.slot)
      .sort((a, b) => a.date.localeCompare(b.date))
    const nombres = [...new Set(dentro.map((x) => x.slot.driver_name).filter(Boolean))]
    const acotada = !!desde && dentro.length > 0
    const cerrada = acotada && nombres.length === 1
    const ancha = dentro.length > ANCHA

    out.push({
      id: `dano-${l.vehicle_id}-${l.panel}`,
      clase: 'estimacion',
      prioridad: (l.rank ?? 1) >= 3 ? 90 : 65,
      area: 'Daños',
      titulo: `Daño ${l.severity} nuevo en ${v?.license_plate || l.vehicle_id}: ${l.part || l.panel}`,
      resumen: !acotada
        ? 'No atribuible: no hay inspección anterior con la que acotar la ventana'
        : cerrada
          ? `Apareció en un único turno — ${nombres[0]}, ${fecha(hasta)}`
          : `Ventana de ${dentro.length} turnos · ${nombres.length} conductores posibles`,
      calculo: `El registro de daños no tenía nada en "${l.panel}" hasta la inspección del ${fecha(hasta)}${desde ? `, y la anterior del ${fecha(desde)} salió sin ese daño` : ''}. Turnos en la ventana: ${dentro.length}.`,
      evidencia: [
        { k: 'Panel', v: l.panel, clase: 'hecho' },
        { k: 'Severidad (la dijo el modelo)', v: l.severity, clase: 'estimacion' },
        insp && { k: 'Confianza del análisis', v: `${Math.round((insp.confidence || 0) * 100)} %`, clase: 'estimacion' },
        { k: 'Visto por primera vez', v: `${fecha(hasta)}${l.first_seen_inspection ? ` (inspección ${l.first_seen_inspection})` : ''}`, clase: 'hecho' },
        { k: 'Inspección limpia anterior', v: desde ? fecha(desde) : 'no hay', clase: 'hecho' },
        { k: 'Turnos en la ventana',
          v: !acotada ? 'sin acotar'
            : dentro.length <= ANCHA ? dentro.map((x) => `${fecha(x.date)} · ${x.slot.driver_name}`).join(' · ')
            : `${dentro.length} turnos entre el ${fecha(dentro[0].date)} y el ${fecha(dentro[dentro.length - 1].date)}`,
          clase: 'hecho' },
        insp?.estimated_cost ? { k: 'Coste estimado', v: `${insp.estimated_cost} €`, clase: 'estimacion' } : null,
      ].filter(Boolean),
      invalidadores: [
        'El daño lo detecta un modelo. Puede ser un reflejo, barro o una sombra: hasta que un humano lo valide en Revisión Rápida es una sospecha.',
        !acotada && 'Sin inspección anterior la ventana no tiene principio: el daño pudo aparecer en cualquier momento. Esto NO señala a nadie.',
        acotada && !cerrada && `La ventana tiene ${dentro.length} turnos, así que NO identifica a nadie. Sólo con una inspección por turno se cierra a una persona.`,
        'El coste en € es una estimación del modelo, no un presupuesto.',
        'Si el vehículo pasó por chapa y no se registró, un daño viejo puede reaparecer como nuevo.',
      ].filter(Boolean),
      fuente: 'inspecciones',
      acciones: [{ txt: 'Validar en Revisión Rápida' }, { txt: 'Ver las dos fotos' }, { txt: 'Abrir parte con el renting' }],
      atribucion: { desde, hasta, turnos: dentro, cerrada, nombres, acotada, ancha },
    })
  }
  return out
}

/* R6 · Compuerta de muestra. Una "anomalía" sobre 3 inspecciones es una
   casualidad con gráfico. Por debajo del mínimo NO se emite nada. */
const N_MINIMO = 8
function reglaConcentracion(D) {
  const total = (D.inspecciones || []).length
  if (total >= N_MINIMO) return []
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

/* R7 · Salud del propio sistema.
   Nadie mira si la tubería está viva hasta que lleva tres días muerta. Un
   número viejo presentado como fresco es la peor mentira de un panel. */
function reglaSalud(D) {
  const out = []
  const min = minDesde(D.cortexOverview?.last_capture_at)
  if (min !== null && min > 45) {
    out.push({
      id: 'salud-cortex', clase: 'hecho', prioridad: 92, area: 'Sistema',
      titulo: min > 1440
        ? `Cortex lleva ${Math.round(min / 1440)} días sin capturar`
        : `Cortex lleva ${min} minutos sin capturar`,
      resumen: 'Todo lo de la pantalla de reparto está congelado a esa hora',
      calculo: `last_capture_at = ${D.cortexOverview.last_capture_at}. Ahora menos eso = ${min} min.`,
      evidencia: [
        { k: 'Última captura', v: new Date(D.cortexOverview.last_capture_at).toLocaleString('es-ES'), clase: 'hecho' },
        { k: 'Paquetes seguidos', v: String(D.cortexOverview.tracked ?? '—'), clase: 'hecho' },
      ],
      invalidadores: ['Si la jornada ha terminado, es normal que no haya capturas nuevas.'],
      fuente: 'cortex',
      acciones: [{ txt: 'Comprobar la extensión' }],
    })
  }
  const fallidas = (D.inspecciones || []).filter((i) => i.analysis_status && i.analysis_status !== 'ok')
  if (fallidas.length) {
    out.push({
      id: 'salud-ia', clase: 'hecho', prioridad: 60, area: 'Sistema',
      titulo: `${fallidas.length} inspección(es) sin analizar`,
      resumen: 'El análisis de IA falló — esas furgonetas no tienen parte de daños',
      calculo: 'Inspecciones con analysis_status distinto de "ok".',
      evidencia: fallidas.slice(0, 8).map((i) => ({
        k: (D.vehiculos || []).find((v) => v.id === i.vehicle_id)?.license_plate || i.vehicle_id,
        v: i.analysis_status, clase: 'hecho',
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
   el informe de excepciones del scorecard con la ficha, y quien falló se queda
   sin nombre (pasó de verdad — docs/WHC.md §4). */
function reglaSinID(D) {
  const sin = (D.conductores || []).filter((c) => c.active !== false && !c.driver_id)
  if (!sin.length) return []
  return [{
    id: 'sin-id', clase: 'hecho', prioridad: 40, area: 'Equipo',
    titulo: `${sin.length} conductor(es) sin ID de Amazon en la ficha`,
    resumen: sin.slice(0, 6).map((c) => c.name).join(', ') + (sin.length > 6 ? `, y ${sin.length - 6} más` : ''),
    calculo: 'Fichas de conductor activas con el campo driver_id vacío.',
    evidencia: sin.slice(0, 10).map((c) => ({ k: c.name, v: 'driver_id vacío', clase: 'hecho' })),
    invalidadores: ['Ninguno: o el campo está relleno o no lo está.'],
    fuente: 'flota',
    acciones: [{ txt: 'Emparejar desde Scorecard' }],
  }]
}

/* R9 · Furgonetas asignadas hoy que siguen sin inspeccionar. HECHO.
   Cruce entre el cuadrante del día y las inspecciones de hoy. Es la señal más
   accionable de todas porque tiene ventana corta: a las 20:00 ya no sirve.

   Y es la mejor prueba de la tesis del laboratorio: esto YA lo calcula el
   backend en GET /stats/attention, que se escribió para la app antigua y que
   frontend-v2 no llama desde ninguna pantalla. El cálculo estaba hecho; lo que
   faltaba era decirlo. */
function reglaSinInspeccion(D) {
  const c = D.contadores || {}
  const n = c.sin_inspeccion_hoy_total
  if (!n) return []
  const faltan = c.sin_inspeccion_hoy || []
  return [{
    id: 'sin-inspeccion-hoy', clase: 'hecho', prioridad: 86, area: 'Flota',
    titulo: `${n} furgoneta(s) asignada(s) hoy sin inspección`,
    resumen: faltan.slice(0, 4).map((f) => f.plate).join(', ') + (n > 4 ? `, y ${n - 4} más` : ''),
    calculo: `Del cuadrante de hoy (${c.asignadas_hoy ?? '?'} asignaciones), estas ${n} no tienen ninguna inspección con fecha de hoy.`,
    evidencia: faltan.slice(0, 10).map((f) => ({ k: f.plate, v: f.driver || 'sin conductor', clase: 'hecho' })),
    invalidadores: [
      'Si la jornada acaba de empezar, es normal: todavía no han salido.',
      'Una furgoneta del cuadrante que al final no salió aparece aquí igualmente.',
    ],
    fuente: 'inspecciones',
    acciones: [{ txt: 'Avisar a los conductores' }, { txt: 'Ver el cuadrante' }],
  }]
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export function generarSenales(D) {
  if (!D) return []
  const reglas = [reglaWHC, reglaParon, reglaVencimientos, reglaAceite,
                  reglaAtribucion, reglaConcentracion, reglaSalud, reglaSinID,
                  reglaSinInspeccion]
  const out = []
  for (const r of reglas) {
    // Una regla que reviente por un dato raro no debe tumbar el resto del
    // motor: con datos reales siempre aparece un documento que no cuadra.
    try { out.push(...r(D)) } catch (e) { console.warn('[lab] regla fallida:', r.name, e) }
  }
  return out.sort((a, b) => b.prioridad - a.prioridad)
}

/* Línea de tiempo de un vehículo: ledger + inspecciones + vencimientos sobre un
   mismo eje. Sin inferencia: es un ordenamiento de hechos que hoy viven
   repartidos en cuatro pantallas distintas. */
export function lineaVehiculo(D, vehicleId) {
  const v = (D.vehiculos || []).find((x) => x.id === vehicleId)
  if (!v) return []
  const ev = []
  for (const i of (D.inspecciones || []).filter((x) => x.vehicle_id === vehicleId)) {
    const cond = (D.conductores || []).find((c) => c.id === i.driver_id)
    ev.push({
      fecha: i.created_at.slice(0, 10), tipo: 'inspeccion',
      titulo: i.analysis_status && i.analysis_status !== 'ok' ? 'Inspección sin analizar' : `Inspección · ${i.severity || 'sin datos'}`,
      detalle: `${cond?.name || 'sin conductor'}${i.new_damages ? ` · ${i.new_damages} daño nuevo` : ''}`,
      clase: i.analysis_status && i.analysis_status !== 'ok' ? 'hecho' : 'estimacion',
      grave: i.severity === 'grave' || i.severity === 'critico',
    })
  }
  for (const l of (D.ledger || []).filter((x) => x.vehicle_id === vehicleId)) {
    if (l.first_seen) {
      ev.push({ fecha: String(l.first_seen).slice(0, 10), tipo: 'dano',
        titulo: `Daño registrado · ${l.part || l.panel}`,
        detalle: `severidad ${l.severity} · panel ${l.panel}`, clase: 'estimacion', grave: (l.rank ?? 1) >= 3 })
    }
    if (l.status === 'repaired' && l.repaired_at) {
      ev.push({ fecha: String(l.repaired_at).slice(0, 10), tipo: 'reparacion',
        titulo: `Reparado · ${l.part || l.panel}`, detalle: l.repaired_note || '', clase: 'hecho', grave: false })
    }
  }
  if (v.itv_date) {
    const d = diasHasta(v.itv_date, D.hoy)
    ev.push({ fecha: String(v.itv_date).slice(0, 10), tipo: 'itv', titulo: 'Caducidad de la ITV',
      detalle: '', clase: 'hecho', grave: d <= 0, futuro: d > 0 })
  }
  return ev.sort((a, b) => b.fecha.localeCompare(a.fecha))
}
