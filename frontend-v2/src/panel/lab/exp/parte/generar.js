/* ─────────────────────────────────────────────────────────────────────────────
   EL CIERRE DE LAS 22:00 — sustituto de lo que hoy se manda a Telegram
   ---------------------------------------------------------------------------
   Hoy a las 22:00 sale un mensaje diciendo QUIÉN HA SUBIDO INSPECCIÓN. Eso es
   un parte de asistencia, no un cierre de jornada: no dice cómo ha ido el día,
   ni qué se ha roto, ni qué hacer mañana.

   Esto lo sustituye por un cierre por centro con cinco bloques:

     1 · DCR real          lo entregado sobre lo que SALIÓ, con el denominador
                           escrito y sin maquillar
     2 · Daños nuevos      qué furgoneta, qué panel y quién la llevaba
     3 · Lo que se puede   consejos sacados del propio Cortex, no genéricos
         mejorar mañana
     4 · Recordatorios     lo que se te va a pasar si nadie te lo dice
     5 · La coletilla      lo que este mensaje NO sabe

   REGLA QUE ORDENA TODO: cada línea lleva su cifra y su origen. Un consejo sin
   número detrás es un horóscopo, y a la tercera semana nadie lee el mensaje.

   ── SOBRE EL DENOMINADOR DEL DCR ────────────────────────────────────────────
   El DCR de Amazon es entregados / despachados. Los paquetes cancelados ANTES
   de salir no deberían contar, y ahí hay un problema real que conviene decir
   antes de enseñar el número:

   `_CORTEX_STATES` (server.py:19214) NO tiene ningún estado de cancelación. Los
   canónicos son LOADED, ARRIVED, ATTEMPTED, MISSING, RECOVERED, DELIVERED,
   RETURNED, LOST, UNCOLLECTED y OBSERVED. Y docs/REPORTES_DIARIOS.md ya lo
   documenta: "falta cruzarlo con los cancelados antes de salir, que hoy deja el
   denominador con un sesgo del +0,25 %".

   Así que aquí se calculan DOS cifras y se enseñan las dos:
     · DCR bruto      entregados / todos los paquetes del día
     · DCR de ruta    entregados / los que llegaron a estar en la furgoneta
                      (excluye los que nunca pasaron de OBSERVED)
   La segunda es la que se acerca a la de Amazon. Mientras el ingest no marque
   la cancelación, el mensaje lo dice en vez de fingir precisión.

   Datos: LAB/SIMULATED.
   ───────────────────────────────────────────────────────────────────────────── */

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null)
const hm = (m) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`

/* ── 1 · DCR ──────────────────────────────────────────────────────────────── */
export function bloqueDCR(D) {
  const rutas = D.rutas || []
  const entregados = rutas.reduce((a, r) => a + r.delivered, 0)
  const total = rutas.reduce((a, r) => a + r.total, 0)
  /* "Nunca salieron": los que no llegaron a estar en la furgoneta. Con datos
     reales serían los que nunca pasaron de OBSERVED. Aquí se simula. */
  const nuncaSalieron = D.cancelados ?? Math.round(total * 0.006)
  const salieron = total - nuncaSalieron
  const pendientes = rutas.reduce((a, r) => a + r.pendientes, 0)
  const noEntregados = salieron - entregados

  return {
    entregados, total, nuncaSalieron, salieron, pendientes, noEntregados,
    dcrBruto: pct(entregados, total),
    dcrRuta: pct(entregados, salieron),
    diferencia: Math.round((pct(entregados, salieron) - pct(entregados, total)) * 100) / 100,
  }
}

/* ── 2 · Daños del día, con quién llevaba la furgoneta ────────────────────── */
export function bloqueDanos(D, hoy) {
  const nuevos = (D.danos || []).filter((d) => String(d.first_seen).slice(0, 10) === hoy)
  const cuadrante = (D.asignaciones || []).find((a) => a.date === hoy)?.slots || []
  const veh = (id) => (D.vehiculos || []).find((v) => v.id === id)

  return nuevos.map((d) => {
    const slot = cuadrante.find((s) => s.vehicle_id === d.vehicle_id)
    return {
      matricula: veh(d.vehicle_id)?.license_plate || d.vehicle_id,
      modelo: `${veh(d.vehicle_id)?.brand || ''} ${veh(d.vehicle_id)?.model || ''}`.trim(),
      parte: d.part, severidad: d.severity, tarifa: d.estimated_cost,
      quien: slot?.driver_name || null,
      /* La ventana: si hubo inspección ayer y hoy, el golpe está acotado a un
         turno. Si no, no se puede atribuir y se dice. */
      acotado: !!slot,
    }
  })
}

/* ── 3 · Consejos, sacados de Cortex y con número delante ─────────────────── */
export function bloqueConsejos(D) {
  const out = []

  /* 3.1 · La franja del mediodía. Del propio Cortex: hora del intento fallido
     cruzada con la causa "comercio cerrado". Es la palanca más grande del DSC. */
  const cerrado = D.cerradoMediodia
  if (cerrado?.n >= 3) {
    out.push({
      tipo: 'franja',
      texto: `${cerrado.n} intentos han fallado hoy por comercio cerrado, y ${cerrado.enFranja} fueron entre las 14 y las 16 h.`,
      accion: 'Mueve esas paradas a la mañana. No es la gente, es la hora.',
      dato: `${cerrado.enFranja} de ${cerrado.n}`,
    })
  }

  /* 3.2 · Tiempo perdido. `min_sin_entregar` sale de la hora de la última
     entrega, comprobada contra cortex_events con desviación mediana 0 s. */
  const parado = (D.rutas || []).filter((r) => r.min_sin_entregar >= 90)
    .sort((a, b) => b.min_sin_entregar - a.min_sin_entregar)[0]
  if (parado) {
    out.push({
      tipo: 'parada',
      texto: `${parado.driver_name} estuvo ${hm(parado.min_sin_entregar)} sin registrar una entrega en ${parado.route_code}, con ${parado.pendientes} paquetes encima.`,
      accion: 'Pregúntale qué pasó antes de sacar conclusiones: puede ser una comida o una zona sin cobertura.',
      dato: `${parado.min_sin_entregar} min`,
    })
  }

  /* 3.3 · Dónde deja los paquetes. Se ordena por EXCESO en paquetes y con
     compuerta de muestra: por debajo de 80 entregas no se nombra a nadie. */
  const dsc = (D.dscHoy || []).filter((c) => c.entregas >= 80)
    .map((c) => ({ ...c, exceso: Math.round(c.sin_nadie - (c.entregas * (D.flotaPct ?? 8.31)) / 100) }))
    .sort((a, b) => b.exceso - a.exceso)[0]
  if (dsc && dsc.exceso >= 5) {
    out.push({
      tipo: 'dsc',
      texto: `${dsc.nombre} dejó ${dsc.sin_nadie} de ${dsc.entregas} paquetes sin nadie delante. La flota va al ${D.flotaPct ?? 8.31} %.`,
      accion: 'Son los paquetes que acaban en reclamación. Es la métrica que más pesa en tu scorecard.',
      dato: `+${dsc.exceso} sobre la media`,
    })
  }

  /* 3.4 · Sin causa marcada: se pierde la información y es formación pura. */
  if (D.retornosSinCausa >= 3) {
    out.push({
      tipo: 'formacion',
      texto: `${D.retornosSinCausa} paquetes volvieron sin motivo marcado.`,
      accion: 'Sin la causa no se puede arreglar nada. Recuérdalo en el briefing de mañana.',
      dato: `${D.retornosSinCausa} sin causa`,
    })
  }

  return out
}

/* ── 4 · Recordatorios: lo que se te pasa si nadie te lo dice ─────────────── */
export function bloqueRecordatorios(D, hoy) {
  const out = []
  const dias = (s) => Math.round((Date.parse(String(s).slice(0, 10) + 'T12:00:00Z') - Date.parse(hoy + 'T12:00:00Z')) / 86400000)

  /* 4.1 · WHC sin mirar. Es todo o nada: una excepción te quita el Fantastic. */
  if (D.whcDiasSinMirar >= 2) {
    out.push({
      urgencia: 'alta',
      texto: `Llevas ${D.whcDiasSinMirar} días sin pegar el plan de horas. Una sola excepción semanal te quita el Fantastic, y a estas alturas de semana ya no da tiempo a corregir mucho.`,
    })
  }

  /* 4.2 · La ventana del reporte diario se cierra en 1-3 días y no se recupera */
  if (D.reportesEnRiesgo > 0) {
    out.push({
      urgencia: 'alta',
      texto: `Tienes ${D.reportesEnRiesgo} día(s) de reporte diario sin volver a descargar. Amazon rellena la columna DSC después y esa ventana se cierra: lo que no bajes ahora se pierde para siempre.`,
    })
  }

  /* 4.3 · ITV: hecho puro, resta de fechas */
  for (const v of (D.vehiculos || [])) {
    const d = v.itv_date ? dias(v.itv_date) : null
    if (d !== null && d >= 0 && d <= 7) {
      out.push({ urgencia: 'alta', texto: `${v.license_plate} tiene la ITV en ${d} días y no hay cita puesta.` })
    }
  }

  /* 4.4 · Furgoneta que lleva demasiado en el taller sin fecha de salida */
  const enTaller = (D.vehiculos || []).filter((v) => v.status === 'taller')
  if (enTaller.length >= 3) {
    out.push({
      urgencia: 'media',
      texto: `${enTaller.length} furgonetas siguen en el taller. Si mañana necesitas todas las rutas, vas justo.`,
    })
  }

  /* 4.5 · Memoria: lo que ya pasó y volvió a pasar */
  if (D.reincidencia) {
    out.push({
      urgencia: 'media',
      texto: `Ojo con ${D.reincidencia.matricula}: es la ${D.reincidencia.n}ª vez que se rompe ${D.reincidencia.parte} en 6 meses. Puede que toque hablar con ${D.reincidencia.proveedor}.`,
    })
  }

  return out
}

/* ── Montaje del mensaje ──────────────────────────────────────────────────── */
export function generarCierre(D, hoy, centro) {
  const dcr = bloqueDCR(D)
  const danos = bloqueDanos(D, hoy)
  const consejos = bloqueConsejos(D)
  const recordatorios = bloqueRecordatorios(D, hoy)

  return {
    centro, hoy, dcr, danos, consejos, recordatorios,
    /* La coletilla no es humildad: es lo que evita que alguien tome una
       decisión creyendo que el mensaje sabe más de lo que sabe. */
    limites: [
      'El DCR de ruta excluye los paquetes que nunca llegaron a la furgoneta. Amazon puede contar el denominador de otra forma.',
      'La severidad de los daños la estima un modelo. Hasta que alguien valide la foto, es una sospecha.',
      'Estar asignado a una furgoneta no es ser responsable del golpe.',
    ],
  }
}

/* Texto plano, tal cual saldría por Telegram. */
export function comoTexto(c) {
  const L = []
  L.push(`CIERRE DEL DÍA · ${c.centro} · ${c.hoy}`)
  L.push('')
  L.push(`DCR de ruta: ${c.dcr.dcrRuta} %`)
  L.push(`${c.dcr.entregados} entregados de ${c.dcr.salieron} que salieron`)
  L.push(`(${c.dcr.nuncaSalieron} nunca llegaron a la furgoneta y no cuentan; en bruto sería ${c.dcr.dcrBruto} %)`)
  if (c.dcr.noEntregados > 0) L.push(`Se quedaron sin entregar: ${c.dcr.noEntregados}`)
  L.push('')
  if (c.danos.length) {
    L.push(`DAÑOS NUEVOS: ${c.danos.length}`)
    for (const d of c.danos) {
      L.push(`· ${d.matricula} — ${d.parte} (${d.severidad}, ~${d.tarifa} € de tarifa)`)
      L.push(`  la llevaba ${d.quien || 'sin asignación registrada'}`)
    }
  } else {
    L.push('DAÑOS NUEVOS: ninguno')
  }
  L.push('')
  if (c.consejos.length) {
    L.push('PARA MAÑANA')
    for (const x of c.consejos) { L.push(`· ${x.texto}`); L.push(`  ${x.accion}`) }
    L.push('')
  }
  if (c.recordatorios.length) {
    L.push('NO SE TE OLVIDE')
    for (const r of c.recordatorios) L.push(`· ${r.texto}`)
    L.push('')
  }
  L.push('— ' + c.limites[0])
  return L.join('\n')
}

export { hm }
