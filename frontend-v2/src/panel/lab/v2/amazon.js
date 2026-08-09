/* ─────────────────────────────────────────────────────────────────────────────
   LA MÉTRICA QUE TE PENALIZA · datos y lógica
   ---------------------------------------------------------------------------
   Este módulo es el corazón del replanteamiento (ver LAB_PRODUCT_RETHINK.md).

   La tesis: FlotaDSP no vende "gestión de flotas". Vende saber en qué métrica de
   Amazon estás perdiendo puntos, por qué, y quién puede moverla — antes de que
   Amazon te lo diga el martes.

   Los PESOS y las REGLAS de aquí NO son inventados: salen de las 17 scorecards
   reales de OGA5 (semanas 12-31 de 2026) analizadas en docs/DSC.md y
   docs/REPORTES_DIARIOS.md. Los NÚMEROS de operación sí son sintéticos y están
   marcados como tales.
   ───────────────────────────────────────────────────────────────────────────── */

export const SINTETICO = true

/* ── 1 · Dónde te penalizan de verdad ─────────────────────────────────────────
   Extraído de las "Recommended Focus Areas" de las 17 scorecards. Esto es un
   HECHO medido sobre documentos reales, no una opinión de producto.
   docs/DSC.md, tabla de cabecera. */
export const FOCOS = [
  { key: 'dsc',  nombre: 'Delivery Success Conditions', corto: 'DSC', semanas: 14, peso: 40, estado: 'medible' },
  { key: 'lor',  nombre: 'Lost on Road',                corto: 'LoR', semanas: 7,  peso: 14, estado: 'sin_volumen' },
  { key: 'whc',  nombre: 'Working Hours Compliance',    corto: 'WHC', semanas: 5,  peso: 10, estado: 'medible' },
  { key: 'esc',  nombre: 'Customer escalation',         corto: 'ESC', semanas: 5,  peso: 8,  estado: 'sin_dato' },
  { key: 'cc',   nombre: 'Contact Compliance',          corto: 'CC',  semanas: 3,  peso: 6,  estado: 'sin_dato' },
  { key: 'vsa',  nombre: 'Vehicle Audit',               corto: 'VSA', semanas: 2,  peso: 6,  estado: 'parcial' },
  { key: 'men',  nombre: 'Mentor Adoption',             corto: 'MEN', semanas: 1,  peso: 2,  estado: 'sin_dato' },
  { key: 'pod',  nombre: 'Photo-On-Delivery',           corto: 'POD', semanas: 1,  peso: 1,  estado: 'sin_dato' },
  { key: 'dcr',  nombre: 'Delivery Completion Rate',    corto: 'DCR', semanas: 1,  peso: 1,  estado: 'medible' },
]

/* El caso que rompe la intuición y que conviene tener siempre a mano: una
   semana con el WHC perfecto y el Overall en Fair. docs/DSC.md. */
export const CASO_SEMANA_29 = {
  semana: 29, whc: 100, whc_tier: 'Fantastic', overall: 69.49, overall_tier: 'Fair',
  leccion: 'Arreglar el WHC entero no habría salvado esa semana.',
}

/* ── 2 · DSC por conductor ────────────────────────────────────────────────────
   SINTÉTICO, pero con la forma real: en producción el reparto va de 1,3 % a
   21,8 % con cientos de entregas por conductor, y la flota está en 8,31 %.

   Las dos compuertas anti-falso-positivo son las de docs/DSC.md §"La puerta":
     · mínimo 80 entregas para entrar en el ranking
     · se ordena por EXCESO en paquetes, nunca por porcentaje bruto
   Ordenar por tasa castigaría al de poco volumen; el exceso mide daño real. */
export const MIN_ENTREGAS = 80
export const MUESTRA_CORTA = 250
export const FLOTA_PCT = 8.31

export const dscConductores = [
  { driver_id: 'c3', nombre: 'Adriana Sixto',   entregas: 412, sin_nadie: 79 },
  { driver_id: 'c5', nombre: 'Olalla Ferreiro', entregas: 388, sin_nadie: 46 },
  { driver_id: 'c1', nombre: 'Marta Iglesias',  entregas: 501, sin_nadie: 44 },
  { driver_id: 'c4', nombre: 'Héctor Lameiro',  entregas: 197, sin_nadie: 31 },
  { driver_id: 'c2', nombre: 'Nuno Barreiro',   entregas: 464, sin_nadie: 11 },
  { driver_id: 'c9', nombre: 'Iago Ventoso',    entregas: 54,  sin_nadie: 12 },  // no entra: muestra
]

export function rankingDSC() {
  return dscConductores
    .map((c) => {
      const pct = (c.sin_nadie / c.entregas) * 100
      const esperados = (c.entregas * FLOTA_PCT) / 100
      return {
        ...c,
        pct: Math.round(pct * 10) / 10,
        // Exceso en PAQUETES sobre lo que haría la media de la flota con SUS
        // entregas. Es la cifra que se puede convertir en una conversación.
        exceso: Math.round(c.sin_nadie - esperados),
        entra: c.entregas >= MIN_ENTREGAS,
        muestraCorta: c.entregas < MUESTRA_CORTA,
        factor: Math.round((pct / FLOTA_PCT) * 10) / 10,
      }
    })
    .sort((a, b) => b.exceso - a.exceso)
}

/* Factor entre el peor y el mejor de los que SÍ entran en el ranking.
   Se calcula, no se copia: en la flota real medida daba 15× (1,3 % → 21,8 %),
   pero afirmar ese número con otros datos delante sería mentir. */
export function factorExtremos() {
  const dentro = rankingDSC().filter((c) => c.entra && c.pct > 0)
  if (dentro.length < 2) return null
  const pcts = dentro.map((c) => c.pct)
  const alto = Math.max(...pcts), bajo = Math.min(...pcts)
  return {
    factor: Math.round((alto / bajo) * 10) / 10,
    alto, bajo,
    peor: dentro.find((c) => c.pct === alto)?.nombre,
    mejor: dentro.find((c) => c.pct === bajo)?.nombre,
  }
}

/* ── 3 · Causa raíz de los retornos ───────────────────────────────────────────
   Proporciones tomadas de docs/DSC.md (773 retornos medidos en 14 días). Los
   valores absolutos aquí son sintéticos y proporcionales. */
export const causasRetorno = [
  { causa: 'Cliente ausente',            n: 213, accion: null },
  { causa: 'Comercio cerrado',           n: 199, accion: 'Mover esas paradas de franja horaria' },
  { causa: 'Sin causa registrada',       n: 144, accion: 'Formación: no marcan el motivo' },
  { causa: 'Dirección no encontrada',    n: 80,  accion: 'Libreta de portales' },
  { causa: 'Reprogramado por el cliente', n: 39, accion: null },
  { causa: 'Nada entregado en la parada', n: 31, accion: null },
  { causa: 'Acceso imposible',           n: 22,  accion: 'Libreta de portales' },
  { causa: 'Paquete no encontrado',      n: 11,  accion: 'Carga' },
]

/* El hallazgo que hace que alguien pregunte "¿cómo sabe esto?": los fallos por
   comercio cerrado se amontonan en el cierre del mediodía español. */
export const cerradoPorHora = [
  { h: '09', n: 11 }, { h: '10', n: 26 }, { h: '11', n: 24 }, { h: '12', n: 25 },
  { h: '13', n: 17 }, { h: '14', n: 26 }, { h: '15', n: 32 }, { h: '16', n: 29 },
  { h: '17', n: 8 },  { h: '18', n: 1 },
]
export const HORAS_CIERRE = ['14', '15', '16']

export function analisisCierre() {
  const total = cerradoPorHora.reduce((a, x) => a + x.n, 0)
  const enCierre = cerradoPorHora.filter((x) => HORAS_CIERRE.includes(x.h))
    .reduce((a, x) => a + x.n, 0)
  const totalRetornos = causasRetorno.reduce((a, x) => a + x.n, 0)
  const cerrado = causasRetorno.find((x) => x.causa === 'Comercio cerrado')
  return {
    total, enCierre,
    pctCierre: Math.round((enCierre / total) * 100),
    pctSobreRetornos: Math.round((cerrado.n / totalRetornos) * 100),
    totalRetornos,
  }
}

/* ── 4 · El guardián de la ventana DSC ────────────────────────────────────────
   Esto es lo que nadie pediría y lo que sostiene todo lo demás.

   Tres hechos verificados en docs/REPORTES_DIARIOS.md:
     · el reporte de la fecha F trae el bloque DNR de F−2 (131 de 131, sin
       una sola excepción);
     · la columna DSC se rellena DESPUÉS: si lo descargas el día que sale, puede
       venir entera a `N` y contar cero;
     · la ventana se cierra. Se re-descargaron 6 reportes viejos enteros a `N` y
       NINGUNO cambió; cuatro eran byte a byte idénticos. Los flips que sí
       ocurrieron fueron todos con 1-3 días entre descargas.

   Traducción: cada día que pasa sin re-descargar es un día de DSC que se pierde
   PARA SIEMPRE. Y DSC es la métrica número 1. Un sistema que no vigila esto está
   dejando que se evapore justo el dato que más te penaliza.

   La semana de Amazon va de DOMINGO a SÁBADO (derivado del informe de
   off-boarding de la semana 30). */
export const VENTANA_DIAS = 3

/* Estado sintético de los reportes diarios descargados. */
export const reportes = [
  { fecha: '2026-08-08', descargado: '2026-08-08', filas: 9,  clasificadas: 0 },
  { fecha: '2026-08-07', descargado: '2026-08-07', filas: 12, clasificadas: 0 },
  { fecha: '2026-08-06', descargado: '2026-08-06', filas: 7,  clasificadas: 5 },
  { fecha: '2026-08-05', descargado: '2026-08-06', filas: 11, clasificadas: 9 },
  { fecha: '2026-08-04', descargado: '2026-08-04', filas: 6,  clasificadas: 0 },
  { fecha: '2026-08-02', descargado: '2026-08-02', filas: 8,  clasificadas: 0 },
  { fecha: '2026-08-01', descargado: '2026-08-01', filas: 10, clasificadas: 0 },
]

const DIA = 86400000
const dif = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DIA)

export function estadoVentana(hoy) {
  const out = { enRiesgo: [], perdidos: [], ok: [], faltan: [] }
  for (const r of reportes) {
    const edad = dif(r.fecha, hoy)
    const item = { ...r, edad, pendientes: r.filas - r.clasificadas }
    if (r.clasificadas > 0) { out.ok.push(item); continue }
    if (edad <= VENTANA_DIAS) {
      item.diasRestantes = VENTANA_DIAS - edad
      out.enRiesgo.push(item)
    } else {
      out.perdidos.push(item)
    }
  }
  // Días de la semana en curso sin reporte descargado
  const tengo = new Set(reportes.map((r) => r.fecha))
  for (let n = 1; n <= 7; n++) {
    const f = new Date(Date.parse(hoy) - n * DIA).toISOString().slice(0, 10)
    if (!tengo.has(f)) out.faltan.push({ fecha: f, edad: n })
  }
  out.enRiesgo.sort((a, b) => a.diasRestantes - b.diasRestantes)
  return out
}

/* Semana de Amazon: domingo → sábado. No es una convención elegida, se derivó
   del informe "Inactive DA off-boarding" de la semana 30. */
export function semanaAmazon(iso) {
  const d = new Date(iso + 'T12:00:00Z')
  const dom = new Date(d)
  dom.setUTCDate(d.getUTCDate() - d.getUTCDay())
  const sab = new Date(dom)
  sab.setUTCDate(dom.getUTCDate() + 6)
  return { desde: dom.toISOString().slice(0, 10), hasta: sab.toISOString().slice(0, 10) }
}
