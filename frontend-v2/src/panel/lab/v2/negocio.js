/* ─────────────────────────────────────────────────────────────────────────────
   LA CAPA QUE FALTABA: el negocio, no la operación
   ---------------------------------------------------------------------------
   Todo lo que llevaba construido estaba organizado por SUSTANTIVOS —furgonetas,
   conductores, inspecciones— y eso es un panel de operaciones. Un dueño de DSP
   no abre la aplicación pensando "voy a mirar la lista de vehículos". Abre
   pensando en tres cosas, y son siempre las mismas:

     1. ¿Sigo siendo Fantastic?      El tier decide cuántas rutas te dan.
     2. ¿Qué me está costando esto?  El daño no reclamado sale de su bolsillo.
     3. ¿Cubro mañana?               Una ruta sin furgoneta es ingreso perdido.

   Este módulo calcula esas tres respuestas. Nada más. Y cada una lleva pegado
   de qué evidencia sale y qué NO se puede afirmar.
   ───────────────────────────────────────────────────────────────────────────── */

import { diasHasta, hm } from '../motor'

/* ═══════════════════════════════════════════════════════════════════════════
   1 · EL TIER
   ---------------------------------------------------------------------------
   Aquí está la idea que más me ha costado ver y la que más valor tiene.

   La tentación es avisar con TU límite de 55 h. Es un error: 55 h es un límite
   contractual tuyo, y marcar a alguien por pasarlo no dice nada sobre Amazon.

   Lo que sí está demostrado, sobre 17 semanas reales (docs/WHC.md §6.2):
   un conductor hizo 56 h 30 m y Amazon NO generó excepción semanal. O sea, el
   umbral real de Amazon está POR ENCIMA de 56 h 30 m.

   Consecuencia práctica, y es fuerte: cualquiera que proyecte por debajo de
   56 h 30 m es DEMOSTRABLEMENTE seguro. No "probablemente": en 17 semanas
   nunca ha saltado una excepción ahí. Así que el cribado no se hace con 55 h,
   se hace con el suelo observado, y el resultado es una lista corta de verdad
   en vez de media plantilla marcada.

   Y la otra mitad de la regla, también demostrada (docs/WHC.md §5): UNA sola
   excepción te quita el Fantastic de la semana. No hay término medio.
   ═══════════════════════════════════════════════════════════════════════════ */

export const SUELO_AMAZON_OBSERVADO = 56 * 60 + 30    // 56h 30m, visto CUMPLIENDO

export function estadoTier(D) {
  const w = D.whc
  const sem = D.semanaEnCurso
  if (!w?.conductores || !sem) return null

  const nombreDe = (c) => c.nombre || c.name || '—'
  const conProyeccion = w.conductores
    .map((c) => ({
      id: c.driver_id || nombreDe(c),
      nombre: nombreDe(c),
      trabajado: c.trabajado,
      proyeccion: c.proyeccion ?? c.trabajado,
      bloques_restantes: c.bloques_restantes ?? 0,
    }))

  // Los ÚNICOS que pueden generar una excepción: los que proyectan por encima
  // del suelo observado. El resto está fuera de la zona donde jamás ha pasado.
  const enZona = conProyeccion
    .filter((c) => c.proyeccion > SUELO_AMAZON_OBSERVADO)
    .sort((a, b) => b.proyeccion - a.proyeccion)

  const fuera = conProyeccion.length - enZona.length
  const intacto = sem.excepciones_hasta_ahora === 0

  return {
    semana: sem.semana,
    intacto,
    excepciones: sem.excepciones_hasta_ahora,
    // Tier que saldría HOY con lo reportado hasta ahora. No es predicción:
    // es la regla aplicada al recuento actual.
    tier_si_acaba_ahora: intacto ? 'Fantastic' : 'Great o peor',
    enZona,
    fuera,
    total: conProyeccion.length,
    suelo: SUELO_AMAZON_OBSERVADO,
    // Coste de una excepción, en puntos de WHC. Aritmética pura.
    coste_una_excepcion: sem.conductores > 0
      ? Math.round((100 / sem.conductores) * 10) / 10
      : null,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   2 · EL DINERO
   ---------------------------------------------------------------------------
   Tres cubos, y el tercero es el que hace sentarse recto a un dueño:

     GASTADO      repair_status 'done' con actual_cost. Es una factura. HECHO.
     COMPROMETIDO taller asignado, importe todavía sin meter.
     SIN GESTIONAR daño abierto, sin taller y sin coste. NADIE lo está tocando.

   El tercer cubo no es una métrica: es una lista de trabajo. Cada línea es
   dinero que aún no se ha decidido si lo paga el DSP, el seguro, el renting o
   nadie. Hoy esa lista no existe en ninguna pantalla.

   Sobre los euros del estimado: salen de `_PANEL_BAREMO` (tarifa por panel y
   severidad), no de una alucinación del modelo. Es una TARIFA. Sigue sin ser
   una factura, y se enseña con ese peso.
   ═══════════════════════════════════════════════════════════════════════════ */

export function estadoDinero(D) {
  const danos = D.danos || []
  const plate = (id) => (D.vehiculos || []).find((v) => v.id === id)?.license_plate || id

  const gastado = danos.filter((x) => x.repair_status === 'done' && x.actual_cost > 0)
  const comprometido = danos.filter((x) => x.repair_status !== 'done' && x.workshop_id)
  const sinGestionar = danos.filter((x) => x.repair_status !== 'done' && !x.workshop_id)

  const suma = (xs, campo) => xs.reduce((a, x) => a + (Number(x[campo]) || 0), 0)

  // Desviación tarifa vs factura: sólo se puede calcular donde existen las dos.
  // Es la única forma honesta de saber si el baremo se parece a la realidad.
  const conAmbos = gastado.filter((x) => x.estimated_cost > 0)
  const desviacion = conAmbos.length
    ? Math.round(((suma(conAmbos, 'actual_cost') - suma(conAmbos, 'estimated_cost')) /
                  suma(conAmbos, 'estimated_cost')) * 100)
    : null

  const enriquecer = (xs) => xs.map((x) => ({
    ...x,
    matricula: plate(x.vehicle_id),
    dias: Math.abs(diasHasta(x.first_seen, D.hoy)),
  })).sort((a, b) => b.dias - a.dias)

  return {
    gastado: { n: gastado.length, eur: suma(gastado, 'actual_cost'), lista: enriquecer(gastado) },
    comprometido: { n: comprometido.length, eur: suma(comprometido, 'estimated_cost'), lista: enriquecer(comprometido) },
    sinGestionar: { n: sinGestionar.length, eur: suma(sinGestionar, 'estimated_cost'), lista: enriquecer(sinGestionar) },
    desviacion,
    muestraDesviacion: conAmbos.length,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   3 · MAÑANA
   ---------------------------------------------------------------------------
   Una ruta sin furgoneta utilizable es ingreso perdido y un golpe al scorecard.
   Esto es un cruce de tres listas, todo hechos: cuadrante × estado del vehículo
   × caducidad de la ITV.

   Lo que NO se hace: predecir absentismo. No hay datos de asistencia.
   ═══════════════════════════════════════════════════════════════════════════ */

export function estadoManana(D) {
  const m = D.manana
  if (!m?.slots?.length) {
    return { hay: false, motivo: 'No hay cuadrante cargado para mañana. Sin él no se puede comprobar la cobertura.' }
  }
  const problemas = []
  for (const s of m.slots) {
    const v = (D.vehiculos || []).find((x) => x.id === s.vehicle_id)
    const c = (D.conductores || []).find((x) => x.id === s.driver_id)
    if (!v) { problemas.push({ tipo: 'sin_vehiculo', txt: 'Ruta sin furgoneta asignada', quien: c?.name || '—' }); continue }
    if (v.status === 'taller') {
      problemas.push({ tipo: 'taller', txt: `${v.license_plate} está en taller`, detalle: v.workshop_reason || '', quien: c?.name || '—' })
    }
    const d = v.itv_date ? diasHasta(v.itv_date, D.hoy) : null
    if (d !== null && d <= 1) {
      problemas.push({ tipo: 'itv', txt: `${v.license_plate} ${d < 0 ? 'tiene la ITV caducada' : 'caduca la ITV'}`, quien: c?.name || '—' })
    }
  }
  const libres = (D.vehiculos || []).filter(
    (v) => v.status !== 'taller' && !m.slots.some((s) => s.vehicle_id === v.id))

  return {
    hay: true,
    fecha: m.fecha,
    rutas: m.rutas_previstas ?? m.slots.length,
    slots: m.slots.length,
    problemas,
    reservas: libres.map((v) => v.license_plate),
    cubierto: problemas.length === 0,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   4 · LO QUE NO SÉ (y cómo dejar de no saberlo)
   ---------------------------------------------------------------------------
   El truco de producto: los huecos de datos no son un fallo que esconder, son
   la lista de tareas que hace que el sistema responda mejor. Cada línea dice
   qué se desbloquea al rellenarla — que es lo que convierte una queja en una
   funcionalidad.
   ═══════════════════════════════════════════════════════════════════════════ */

export function huecos(D) {
  const out = []

  const sinID = (D.conductores || []).filter((c) => c.active !== false && !c.driver_id)
  if (sinID.length) {
    out.push({
      que: `${sinID.length} conductor(es) sin ID de Amazon`,
      desbloquea: 'Cruzar el informe de excepciones del scorecard con la ficha. Sin esto, quien falla se queda sin nombre.',
      quien: sinID.map((c) => c.name).join(', '),
      donde: 'Scorecard · emparejado',
    })
  }

  const sinCoste = (D.danos || []).filter((x) => x.repair_status === 'done' && !(x.actual_cost > 0))
  if (sinCoste.length) {
    out.push({
      que: `${sinCoste.length} reparación(es) cerradas sin importe`,
      desbloquea: 'Saber lo que cuesta de verdad un daño y calibrar la tarifa contra facturas.',
      donde: 'Ficha del daño',
    })
  }

  // Cadencia de inspección: lo que decide si un daño se puede atribuir.
  const insp = D.inspecciones || []
  const vehs = D.vehiculos || []
  if (insp.length && vehs.length) {
    const dias = 30
    const recientes = insp.filter((i) => Math.abs(diasHasta(i.created_at.slice(0, 10), D.hoy)) <= dias)
    const porVeh = recientes.length / vehs.length
    if (porVeh < dias / 2) {           // menos de una inspección cada 2 días
      out.push({
        que: `Cadencia de inspección: ${porVeh.toFixed(1)} por furgoneta en ${dias} días`,
        desbloquea: 'Atribuir un golpe a un turno concreto. Con una inspección por turno la ventana se cierra a una persona; con una por semana no señala a nadie.',
        donde: 'Operación diaria',
      })
    }
  }

  if (!D.whc) {
    out.push({
      que: 'Sin plan de horas pegado esta semana',
      desbloquea: 'Saber quién se acerca al umbral que puede costarte el Fantastic.',
      donde: 'WHC',
    })
  }

  return out
}

export { hm }
