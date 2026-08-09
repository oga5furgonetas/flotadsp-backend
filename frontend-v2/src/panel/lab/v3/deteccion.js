/* ─────────────────────────────────────────────────────────────────────────────
   GEN 2 · CASOS — el producto deja de observar y empieza a cerrar el círculo
   ---------------------------------------------------------------------------
   AUTOCRÍTICA QUE ORIGINA ESTO

   Todo lo anterior del laboratorio se LEE. Ningún botón hace nada. El manager
   lee "mueve esas paradas de franja" y se queda solo con el problema. Además,
   "el 44 % cae entre las 14 y las 16 h" se aprende UNA vez: como suscripción es
   un informe de consultoría, no un producto.

   Lo que falta no es una pantalla. Falta una PRIMITIVA:

        CASO = problema + veredicto + acción + responsable + MEDICIÓN POSTERIOR

   Una señal que no se puede cerrar es papel pintado. Un caso tiene estado,
   dueño y, sobre todo, un resultado medido semanas después. Eso es lo que hace
   que el producto siga valiendo el mes 6, y es lo que construye una memoria
   real de la operación: "qué funcionó de verdad en MI flota".

   LA PREGUNTA QUE NADIE SE HABÍA HECHO: ¿ES LA PERSONA O ES EL SITIO?

   Es la relación más valiosa del dataset y estaba sin tocar. Con
   `stop_address` / `stop_id`, `driver_id` y el resultado de cada intento se
   puede separar:

     SITIO    varios conductores distintos fallan en la misma dirección
              → no es formación, es la libreta de portales o el acceso
     PERSONA  un conductor falla en direcciones donde los demás entregan bien
              → sí es formación
     FRANJA   los fallos se concentran en una ventana horaria
              → es secuencia de ruta, no gente
     SIN DISTINGUIR  no hay suficientes cruces para separar una cosa de otra

   Cambia con quién hablas el lunes. Y el cuarto veredicto existe porque
   afirmar "es culpa de Fulano" sin poder distinguirlo es el falso positivo más
   caro que puede cometer este producto: se paga con una persona.

   Datos: LAB/SIMULATED. La lógica está escrita contra los campos reales.
   ───────────────────────────────────────────────────────────────────────────── */

/* ── Umbrales de evidencia. Explícitos y a la vista en la interfaz. ────────── */
export const UMBRALES = {
  // Para culpar al SITIO: al menos 3 fallos y 2 conductores distintos.
  sitio_fallos: 3,
  sitio_conductores: 2,
  // Para señalar a una PERSONA: al menos 4 fallos suyos y que en esas mismas
  // direcciones otros hayan entregado bien al menos 4 veces.
  persona_fallos: 4,
  persona_exitos_otros: 4,
  // Para la FRANJA no basta con que los fallos se concentren: hay que superar
  // la LÍNEA BASE de cuándo se reparte. Si el 80 % de los intentos son de 10 a
  // 13, que los fallos también lo sean no dice nada. Se exige que la
  // concentración de fallos supere a la de intentos en 25 puntos.
  // (Sin esto el motor llamaba "franja" a cualquier cosa en horario laboral:
  //  falso positivo propio, cazado probándolo.)
  franja_pct: 50,
  franja_exceso_pp: 25,
  // Medición posterior: sin esto no se puede decir si funcionó.
  medicion_min_intentos: 20,
}

/* ── Intentos sintéticos: cada uno es un paquete que se intentó entregar ──────
   Campos con los nombres reales: stop_id, stop_address, driver_id, at, ok, causa. */
const D = (n, h) => `2026-0${n < 10 ? '7' : '8'}-${String(n <= 31 ? n : n - 31).padStart(2, '0')}T${String(h).padStart(2, '0')}:20:00Z`

function gen() {
  const out = []
  const push = (stop_id, dir, driver_id, dia, hora, ok, causa) =>
    out.push({ stop_id, stop_address: dir, driver_id, at: D(dia, hora), ok, causa })

  // ── Caso SITIO: el portal 41 falla con todo el mundo ──────────────────────
  // Horas repartidas por todo el día a propósito: así la ÚNICA variable que
  // explica el fallo es la dirección, y el motor no puede escaparse por la
  // franja horaria.
  const portal = 'Rúa do Loureiro 41 · LAB'
  push('S41', portal, 'c1', 12, 9,  false, 'Acceso imposible')
  push('S41', portal, 'c3', 19, 13, false, 'Acceso imposible')
  push('S41', portal, 'c4', 26, 17, false, 'Dirección no encontrada')
  push('S41', portal, 'c2', 33, 11, false, 'Acceso imposible')
  push('S41', portal, 'c5', 36, 18, true, null)

  // ── Caso FRANJA: la farmacia sólo falla en el cierre del mediodía ─────────
  const comercio = 'Farmacia Ponte · LAB'
  for (const [dia, hora, ok] of [[14, 15, false], [17, 14, false], [21, 16, false],
    [24, 15, false], [28, 10, true], [30, 11, true], [34, 15, false], [37, 9, true]]) {
    push('S77', comercio, ['c1', 'c2', 'c3', 'c4'][dia % 4], dia, hora, ok, ok ? null : 'Comercio cerrado')
  }

  // ── Caso PERSONA: c3 falla en portales que los demás sacan sin problema ───
  const dirs = [['S10', 'Avenida da Marina 8 · LAB'], ['S11', 'Praza Nova 3 · LAB'],
                ['S12', 'Rúa Alta 22 · LAB'], ['S13', 'Camiño Vello 5 · LAB']]
  dirs.forEach(([sid, dir], i) => {
    push(sid, dir, 'c3', 15 + i, 12, false, 'Cliente ausente')
    push(sid, dir, 'c1', 20 + i, 12, true, null)
    push(sid, dir, 'c2', 25 + i, 13, true, null)
  })

  // ── Ruido: fallos sueltos que NO deben generar caso ──────────────────────
  push('S90', 'Rúa Nova 1 · LAB', 'c5', 22, 12, false, 'Cliente ausente')
  push('S91', 'Rúa Nova 2 · LAB', 'c4', 29, 11, false, 'Cliente ausente')

  return out
}
export const intentos = gen()

/* ═══════════════════════════════════════════════════════════════════════════
   EL MOTOR DE DESAMBIGUACIÓN
   ═══════════════════════════════════════════════════════════════════════════ */

const hora = (at) => at.slice(11, 13)

export function detectarCasos(nombreDe) {
  const casos = []
  const porStop = {}
  for (const i of intentos) (porStop[i.stop_id] ||= []).push(i)

  /* ── 1 · SITIO ─────────────────────────────────────────────────────────── */
  for (const [sid, xs] of Object.entries(porStop)) {
    const fallos = xs.filter((x) => !x.ok)
    const conductores = [...new Set(fallos.map((x) => x.driver_id))]
    if (fallos.length < UMBRALES.sitio_fallos || conductores.length < UMBRALES.sitio_conductores) continue

    // ¿Se explica mejor por la FRANJA horaria que por el sitio?
    const horas = fallos.map((x) => Number(hora(x.at)))
    const ventana = mejorVentana(horas)
    const pctFallos = (ventana.dentro / fallos.length) * 100
    // Línea base: qué porcentaje de TODOS los intentos de la flota cae en esa
    // misma ventana. Sin esto, cualquier hora laboral parece una franja mala.
    const todos = intentos.map((x) => Number(hora(x.at)))
    const pctBase = (todos.filter((h) => h >= ventana.desde && h < ventana.hasta).length / todos.length) * 100
    const exceso = Math.round(pctFallos - pctBase)
    const esFranja = pctFallos >= UMBRALES.franja_pct
      && ventana.dentro >= 3
      && exceso >= UMBRALES.franja_exceso_pp
    ventana.pctFallos = Math.round(pctFallos)
    ventana.pctBase = Math.round(pctBase)
    ventana.exceso = exceso

    casos.push({
      id: `caso-${sid}`,
      veredicto: esFranja ? 'franja' : 'sitio',
      titulo: esFranja
        ? `${xs[0].stop_address} sólo falla entre las ${ventana.desde}:00 y las ${ventana.hasta}:00`
        : `${xs[0].stop_address} falla con todos los conductores`,
      stop_address: xs[0].stop_address,
      fallos: fallos.length,
      conductores: conductores.map(nombreDe),
      ventana: esFranja ? ventana : null,
      causas: [...new Set(fallos.map((x) => x.causa).filter(Boolean))],
      evidencia: fallos.map((x) => ({
        fecha: x.at.slice(0, 10), hora: hora(x.at), quien: nombreDe(x.driver_id), causa: x.causa,
      })),
      accion: esFranja
        ? { txt: 'Mover esta parada fuera de la franja de cierre', destino: 'Secuencia de ruta' }
        : { txt: 'Añadir a la libreta de portales con instrucciones de acceso', destino: 'Libreta de portales' },
      porque: esFranja
        ? `${ventana.dentro} de los ${fallos.length} fallos caen ahí (${ventana.pctFallos} %), cuando en esa ventana sólo se hace el ${ventana.pctBase} % de los intentos: ${ventana.exceso} puntos por encima de lo normal. Con ${conductores.length} conductores distintos implicados, lo que explica el fallo es la hora, no la persona.`
        : `${conductores.length} conductores distintos han fallado aquí. Si fallan todos, no es formación: es la dirección. Los fallos no se concentran en ninguna franja más de lo que ya se reparte a esas horas.`,
    })
  }

  /* ── 2 · PERSONA ───────────────────────────────────────────────────────── */
  const porDriver = {}
  for (const i of intentos) (porDriver[i.driver_id] ||= []).push(i)

  for (const [did, xs] of Object.entries(porDriver)) {
    const fallos = xs.filter((x) => !x.ok)
    if (fallos.length < UMBRALES.persona_fallos) continue

    // Sólo cuentan los fallos en paradas donde OTROS sí entregaron. Si nadie
    // más ha pasado por ahí, no hay con qué comparar y no se afirma nada.
    const comparables = fallos.filter((f) => {
      const otros = (porStop[f.stop_id] || []).filter((y) => y.driver_id !== did && y.ok)
      return otros.length > 0
    })
    const exitosOtros = comparables.reduce((a, f) =>
      a + (porStop[f.stop_id] || []).filter((y) => y.driver_id !== did && y.ok).length, 0)

    if (comparables.length < UMBRALES.persona_fallos || exitosOtros < UMBRALES.persona_exitos_otros) {
      // Hay fallos, pero no se puede separar de la dirección: se dice.
      if (fallos.length >= UMBRALES.persona_fallos) {
        casos.push({
          id: `caso-nd-${did}`,
          veredicto: 'sin_distinguir',
          titulo: `${nombreDe(did)} acumula ${fallos.length} fallos, pero no se puede separar de las direcciones`,
          fallos: fallos.length,
          conductores: [nombreDe(did)],
          causas: [...new Set(fallos.map((x) => x.causa).filter(Boolean))],
          evidencia: fallos.map((x) => ({ fecha: x.at.slice(0, 10), hora: hora(x.at), quien: x.stop_address, causa: x.causa })),
          accion: { txt: 'No hacer nada todavía', destino: null },
          porque: `Para señalar a una persona hace falta que otros hayan entregado bien en esas mismas direcciones. Aquí sólo hay ${exitosOtros} entrega(s) de comparación, y el mínimo es ${UMBRALES.persona_exitos_otros}. Podría ser la persona o podrían ser las direcciones: con estos datos no se distingue.`,
        })
      }
      continue
    }

    casos.push({
      id: `caso-p-${did}`,
      veredicto: 'persona',
      titulo: `${nombreDe(did)} falla en direcciones donde los demás entregan`,
      fallos: comparables.length,
      conductores: [nombreDe(did)],
      causas: [...new Set(comparables.map((x) => x.causa).filter(Boolean))],
      evidencia: comparables.map((x) => ({ fecha: x.at.slice(0, 10), hora: hora(x.at), quien: x.stop_address, causa: x.causa })),
      accion: { txt: 'Preparar conversación con evidencia', destino: 'Conductor' },
      porque: `${comparables.length} fallos suyos en paradas donde otros conductores han entregado ${exitosOtros} veces sin problema. La dirección no explica el fallo; por eso aquí sí se puede hablar de formación.`,
    })
  }

  const orden = { sitio: 0, franja: 1, persona: 2, sin_distinguir: 3 }
  return casos.sort((a, b) => orden[a.veredicto] - orden[b.veredicto] || b.fallos - a.fallos)
}

/* Mejor ventana de 3 horas: la que concentra más fallos. */
function mejorVentana(horas) {
  let mejor = { desde: 0, hasta: 0, dentro: 0 }
  for (let h = 8; h <= 19; h++) {
    const dentro = horas.filter((x) => x >= h && x < h + 3).length
    if (dentro > mejor.dentro) mejor = { desde: h, hasta: h + 3, dentro }
  }
  return mejor
}

/* ═══════════════════════════════════════════════════════════════════════════
   EL CICLO DE VIDA — lo que convierte un informe en un producto
   ---------------------------------------------------------------------------
   propuesto → aceptado (con responsable y fecha) → midiendo → resultado

   La medición posterior es la clave y también donde es fácil mentir. Regla:
   sin `medicion_min_intentos` intentos después de la fecha de la acción, el
   resultado es "todavía no se puede decir". Nunca "funcionó" por defecto.
   ═══════════════════════════════════════════════════════════════════════════ */

export const ESTADOS = {
  propuesto: { txt: 'Propuesto', color: 'ojo' },
  aceptado:  { txt: 'En marcha', color: 'acento' },
  midiendo:  { txt: 'Midiendo',  color: 'suave' },
  funciono:  { txt: 'Funcionó',  color: 'bien' },
  no_funciono: { txt: 'No funcionó', color: 'mal' },
  sin_datos: { txt: 'Sin datos suficientes', color: 'tenue' },
}

/* Casos ya cerrados, para que el manager vea que esto acumula conocimiento.
   Es la parte que hace que el producto valga el mes 6 y no sólo el mes 1. */
export const historial = [
  {
    id: 'h1', veredicto: 'franja', estado: 'funciono',
    titulo: 'Panadería Rosalía · LAB movida fuera de la franja de cierre',
    accion: 'Se resecuenció la parada a la mañana', responsable: 'Dani', fecha: '2026-07-04',
    antes: { intentos: 34, fallos: 9 }, despues: { intentos: 41, fallos: 1 },
  },
  {
    id: 'h2', veredicto: 'sitio', estado: 'funciono',
    titulo: 'Rúa do Vento 12 · LAB añadida a la libreta de portales',
    accion: 'Instrucciones de acceso: timbre del bajo, portal trasero', responsable: 'Dani', fecha: '2026-06-20',
    antes: { intentos: 22, fallos: 6 }, despues: { intentos: 28, fallos: 0 },
  },
  {
    id: 'h3', veredicto: 'persona', estado: 'no_funciono',
    titulo: 'Conversación con un conductor sobre entregas en mano',
    accion: 'Conversación con evidencia el 12/07', responsable: 'Dani', fecha: '2026-07-12',
    antes: { intentos: 180, fallos: 31 }, despues: { intentos: 165, fallos: 29 },
  },
  {
    id: 'h4', veredicto: 'sitio', estado: 'sin_datos',
    titulo: 'Praza do Mar 4 · LAB añadida a la libreta',
    accion: 'Instrucciones de acceso', responsable: 'Dani', fecha: '2026-08-05',
    antes: { intentos: 15, fallos: 5 }, despues: { intentos: 6, fallos: 1 },
  },
]

export function resultado(h) {
  if (h.despues.intentos < UMBRALES.medicion_min_intentos) {
    return { estado: 'sin_datos', delta: null,
      nota: `Sólo ${h.despues.intentos} intentos desde el cambio. Hacen falta ${UMBRALES.medicion_min_intentos} para poder decir algo.` }
  }
  const a = (h.antes.fallos / h.antes.intentos) * 100
  const d = (h.despues.fallos / h.despues.intentos) * 100
  const delta = Math.round((d - a) * 10) / 10
  return {
    estado: delta < -1 ? 'funciono' : delta > 1 ? 'no_funciono' : 'sin_datos',
    antes: Math.round(a * 10) / 10, despues: Math.round(d * 10) / 10, delta,
    nota: delta < -1 ? `Bajó ${Math.abs(delta)} puntos` : delta > 1 ? `Subió ${delta} puntos` : 'Sin cambio apreciable',
  }
}

/* ── El dinero, por el camino honesto ─────────────────────────────────────────
   No inventamos el valor de una ruta: se lo preguntamos al manager. La
   aritmética es suya, el dato es suyo, y por eso la cifra es defendible.
   Nosotros sólo multiplicamos y lo etiquetamos como lo que es. */
export function impacto(fallosEvitados, valorParada) {
  if (!valorParada) return null
  return { eur: Math.round(fallosEvitados * valorParada), base: valorParada }
}
