/* API simulada para las pruebas de humo.

   Devuelve respuestas con la MISMA forma que el backend real. La gracia de
   simularla es poder probar dos escenarios que en producción no se pueden
   forzar a voluntad:
     · "vacio"   — DSP recién registrado, todo a cero (donde más se rompen las
                   pantallas: divisiones por cero, listas indefinidas…)
     · "lleno"   — flota con datos, para que se pinten tablas y tarjetas
*/

const HOY = new Date().toISOString().slice(0, 10)

const VEHICULO = {
  id: 'v1', license_plate: '1234 ABC', brand: 'Toyota', model: 'Proace',
  center: 'OGA5', status: 'active', mileage: 45000, fuel_type: 'Diésel',
  vehicle_type: 'Furgoneta', itv_date: '2027-03-15', renting_end_date: '2027-12-01',
}
const CONDUCTOR = {
  id: 'd1', name: 'Ana López', email: 'ana@dsp.com', center: 'OGA5',
  active: true, phone: '600111222',
}
const INSPECCION = {
  id: 'i1', vehicle_id: 'v1', driver_id: 'd1', created_at: `${HOY}T08:30:00Z`,
  photos: [], analysis_status: 'ok', deleted: false,
  analysis: {
    severity: 'moderado', summary: 'Dos daños', total_damages_count: 2,
    total_estimated_cost: 760,
    // Uno por gestionar y otro ya cerrado: el barrido prueba los dos estados
    damages: [
      { part: 'Puerta lateral izquierda', severity: 'moderado', estimated_cost: 420,
        description: 'Bollo con arañazo de unos 15 cm' },
      { part: 'Paragolpes trasero', severity: 'leve', estimated_cost: 340,
        actual_cost: 298, repair_status: 'done', workshop_id: 'w1' },
    ],
  },
}

/* Respuesta por defecto según el final de la ruta. Cualquier endpoint no
   contemplado devuelve algo inofensivo en vez de romper la pantalla. */
const dentroDe = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)

function respuesta(ruta, escenario) {
  const lleno = escenario === 'lleno'
  const t = {
    /* Cortex: calidad en vivo, portales y rutas. Las cifras son las REALES de
       la operacion de OGA5 (DCR 99,06 %, 41.889 despachados, 392 fallos en la
       semana 26/07-01/08) para que la captura de la landing sea a la vez
       realista y cierta, no un numero inventado que quede bonito. */
    '/cortex/calidad': lleno ? {
      desde: '2026-07-26', hasta: '2026-08-01', center: 'OGA5', hay_datos: true,
      total: { despachados: 41889, entregados: 41497, fallos: 392, rts: 322,
               dcr: 99.06, rts_pct: 0.77, no_despachados: 82,
               dias_cerrados: 6, dias_totales: 7 },
      dias: {
        '2026-07-26': { ok: 5560, vuelo: 0, nodesp: 4, fallo: 10, total: 5574, en_vuelo_pct: 0, cerrado: true },
        '2026-07-27': { ok: 9440, vuelo: 306, nodesp: 12, fallo: 54, total: 9812, en_vuelo_pct: 3.12, cerrado: false },
        '2026-07-28': { ok: 7080, vuelo: 1, nodesp: 21, fallo: 108, total: 7210, en_vuelo_pct: 0.01, cerrado: true },
        '2026-07-29': { ok: 5554, vuelo: 0, nodesp: 7, fallo: 32, total: 5593, en_vuelo_pct: 0, cerrado: true },
        '2026-07-30': { ok: 5771, vuelo: 1, nodesp: 5, fallo: 15, total: 5792, en_vuelo_pct: 0.02, cerrado: true },
        '2026-07-31': { ok: 9777, vuelo: 0, nodesp: 20, fallo: 22, total: 9819, en_vuelo_pct: 0, cerrado: true },
        '2026-08-01': { ok: 7940, vuelo: 1, nodesp: 13, fallo: 23, total: 7977, en_vuelo_pct: 0.01, cerrado: true },
      },
      conductores: [],
      impacto: [
        { driver_id: 'A1ENSMMQ', nombre: 'Ximena Seoane García', despachados: 276, dcr: 92.75, rts_pct: 4.3, fallos: 20, exceso: 17.4, muestra_corta: false },
        { driver_id: 'A1OS1FR5', nombre: 'Ismael García Gómez', despachados: 361, dcr: 94.74, rts_pct: 3.6, fallos: 19, exceso: 15.6, muestra_corta: false },
        { driver_id: 'A3KMJ51V', nombre: 'Jonnathan A. Fernández', despachados: 258, dcr: 93.8, rts_pct: 3.1, fallos: 16, exceso: 13.6, muestra_corta: false },
        { driver_id: 'A2PQ8LMN', nombre: 'Geann C. Pereira', despachados: 272, dcr: 95.22, rts_pct: 2.6, fallos: 13, exceso: 10.5, muestra_corta: false },
      ],
      en_curso: null, dias_incompletos: ['2026-07-27'],
      objetivos: { dcr: 99, dnr_dpmo: 950, pod: 97, cc: 98, rts_pct: 1.5, fdds: 98.5 },
      referencia_fantastic: { dcr: 99, dnr_dpmo: 950, pod: 97, cc: 98 },
      objetivo_blando: false,
      margen: { objetivo_dcr: 99, fallos_hasta_ahora: 449, fallos_en_dias_cerrados: 392,
                fallos_permitidos: 488, margen_restante: 39, prevision_paquetes: 48870,
                dias_previstos: 7, en_objetivo: true },
      sin_ficha: [],
    } : { hay_datos: false, dias: {}, total: null, conductores: [], impacto: [], en_curso: null, objetivos: {}, margen: null },
    '/cortex/portales': lleno ? {
      resumen: { reincidentes: 38, fallos: 124, sin_nota: 36 },
      portales: [
        { celda: '107280:-17027', celdas: ['107280:-17027'], lat: 42.91191, lng: -8.5133, center: 'OGA5',
          fallos: 16, dias_distintos: 9, no_recogidos: 28, ultimo_fallo: '2026-08-03', entregas_ok: 227,
          tasa_fallo: 6.6, estados: ['ATTEMPTED', 'BACK_TO_ORIGIN'],
          nota: 'Código de portal 1432#. El timbre del 3ºB no suena: llamar al móvil que consta en el pedido.', nota_autor: 'Laura', resuelto: false },
        { celda: '108352:-16825', celdas: ['108352:-16825'], lat: 43.34074, lng: -8.41259, center: 'OGA5',
          fallos: 10, dias_distintos: 3, no_recogidos: 0, ultimo_fallo: '2026-08-02', entregas_ok: 16,
          tasa_fallo: 38.5, estados: ['ATTEMPTED', 'BACK_TO_ORIGIN'], nota: null, resuelto: false },
        { celda: '108264:-16592', celdas: ['108264:-16592', '108265:-16592'], lat: 43.30555, lng: -8.29584, center: 'OGA5',
          fallos: 8, dias_distintos: 4, no_recogidos: 15, ultimo_fallo: '2026-07-31', entregas_ok: 70,
          tasa_fallo: 10.3, estados: ['BACK_TO_ORIGIN'], nota: null, resuelto: false },
      ],
    } : { portales: [], resumen: { reincidentes: 0, fallos: 0, sin_nota: 0 } },
    '/cortex/emparejar': { pendientes: [], libres: [], resumen: { activos: 0, con_ficha: 0, sin_ficha: 0, con_nombre_conocido: 0, paquetes_sin_atribuir: 0 } },
    '/admin/cobros': {
      mes: '2026-08',
      resumen: { facturado: 732.05, cobrado: 387.2, pendiente: 344.85, en_prueba: 0 },
      cobros: [
        { id: 'c1', org_nombre: 'Transportes Ruiz SL', plan: 'completo', vehiculos: 40, base: 320, total: 387.2, estado: 'cobrado' },
        { id: 'c2', org_nombre: 'Logística Vega', plan: 'operacion', vehiculos: 25, base: 125, total: 151.25, estado: 'pendiente' },
        { id: 'c3', org_nombre: 'DSP Nuevo', plan: 'completo', vehiculos: 30, base: 240, total: 290.4, estado: 'en_prueba' },
      ],
    },
    '/admin/planes': {
      moneda: 'EUR', descuento_anual_meses: 2, iva_pct: 21,
      planes: [
        { clave: 'operacion', nombre: 'Operación', para: 'Un centro', por_vehiculo: 5, minimo_vehiculos: 20 },
        { clave: 'completo', nombre: 'Completo', para: 'Varios centros', por_vehiculo: 8, minimo_vehiculos: 20, recomendado: true },
        { clave: 'holding', nombre: 'Holding', para: 'Cinco estaciones o más', por_vehiculo: 0, minimo_vehiculos: 0 },
      ],
    },
    '/suggested-workshops': {
      workshops: [{ id: 'w1', name: 'Toyota Compostela' },
                  { id: 'w2', name: 'Chapistería Riazor' },
                  { id: 'w3', name: 'Carglass Santiago' }],
      total_matched: 3,
    },
    '/vehicles': lleno ? [VEHICULO] : [],
    '/drivers': lleno ? [CONDUCTOR] : [],
    '/inspections': lleno ? [INSPECCION] : [],
    '/incidents': [],
    '/alerts/itv': [],
    '/alerts/renting': [],
    '/workshops': [],
    '/contacts': [],
    '/rentals': [],
    '/plantillas': [],
    '/onboarding': {
      pasos: [
        { id: 'vehiculos', hecho: lleno, n: lleno ? 1 : 0 },
        { id: 'conductores', hecho: lleno, n: lleno ? 1 : 0 },
        { id: 'inspeccion', hecho: lleno, n: lleno ? 1 : 0 },
      ],
      hechos: lleno ? 3 : 0, total: 3, completo: lleno,
    },
    '/stats/dashboard': {
      vehicles: lleno ? 1 : 0, drivers: lleno ? 1 : 0,
      inspections_today: 0, open_incidents: 0, itv_alerts: 0,
    },
    '/stats/damage-costs': { total_eur: 0, por_conductor: [] },
    '/vehicles/last-inspections': [],
    '/inspections/review-queue': [],
    '/cortex/overview': { health: 100, tracked: 0, missing_now: 0, recovery_pct: null },
    '/cortex/routes': { routes: [] },
    '/cortex/alerts': { alerts: [] },
    '/cortex/packages': { packages: [] },
    '/cortex/days': { days: [] },
    '/cortex/stations': { stations: [] },
    '/parking/state': { layout: { zones: [] }, day: HOY, assignments: [] },
    '/assignments/daily': { date: HOY, slots: [] },
    '/checklist': { items: [], date: HOY },
    '/scorecard': { weeks: [], drivers: [] },
    '/metrics/daily-week': lleno ? {
      center: 'OGA5', dias: [dentroDe(-2), dentroDe(-1), HOY],
      totals: { rts: 4, dnr: 2, pod: 7, cc: 1 },
      ranking: [{ transporter_id: 'A1', name: 'Ana Lopez', rts: 2, dnr: 1, pod: 3, cc: 0 }],
      pod_reasons: [['Sin foto', 4], ['Foto borrosa', 3]], cc_reasons: [],
    } : { center: 'OGA5', dias: [], totals: {}, ranking: [], pod_reasons: [], cc_reasons: [] },
    '/metrics/routeplan-available': { date: HOY, routes: lleno ? { CX1: { stops: 120 } } : {} },
    '/metrics/upload-routeplan': { success: true, routes: 3, stops: 340, date: HOY },
    '/metrics/upload-daily': { success: true, center: 'OGA5', date: HOY, conductores: 12, totales: {} },
    '/metrics/upload-report': { success: true, report: { id: 'r9', name: 'Scorecard wk31' } },
    '/metrics/reports': [],
    '/chat': { messages: [] },
    '/shifts/mine': {
      shifts: [0, 1, 2, 4, 5].map((i) => ({ date: dentroDe(i), type: i === 4 ? 'extra' : 'trabaja' })),
      requests: [{ id: 'r1', date: dentroDe(3), type: 'libre', status: 'pendiente' }],
    },
    '/shifts/coverage': { coverage: {}, min: 2 },
    '/shifts/generate-auto': { success: true, assignments: [], resumen: 'Cuadrante de prueba', coverage: {} },
    '/shifts/import': { success: true, saved: 0 },
    '/shifts/bulk': { success: true, saved: 0 },
    '/shifts': { shifts: [] },
    '/shift-requests': { requests: [] },
    '/route-demand': { demand: {} },
    '/me': { id: 'a1', name: 'Admin Test', role: 'admin' },
  }
  for (const [clave, valor] of Object.entries(t)) {
    if (ruta.includes(clave)) return valor
  }
  return {}   // nada explota por un endpoint no contemplado
}

export async function simularApi(page, escenario = 'vacio') {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(respuesta(url.pathname, escenario)),
    })
  })
}

/* Sesión de administrador ya iniciada.

   OJO: el token TIENE que ser un JWT con la forma correcta. La app lee su
   payload para saber si la sesión sigue viva (isAuthed) y si es super-admin.
   Con una cadena cualquiera, el panel redirige a /panel/login... y como esa
   pantalla también tiene texto, las pruebas pasarían sin haber entrado nunca.
   Ya pasó: 30 pruebas en verde que en realidad no probaban nada. */
function jwtDePrueba(payload) {
  const b64 = (o) => btoa(JSON.stringify(o))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  // La firma no importa: la valida el backend, y aquí el backend está simulado.
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.firma-de-prueba`
}

export async function entrarComoAdmin(page, { superAdmin = false, centros = ['OGA5'] } = {}) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  await page.addInitScript(
    ({ token, centros, superAdmin }) => {
      localStorage.setItem('flotadsp_token', token)
      localStorage.setItem('flotadsp_admin', JSON.stringify({
        id: 'a1', name: 'Admin Test', role: 'admin',
        centers: centros, super_admin: superAdmin,
      }))
      // UN SOLO centro a proposito: con varios, el selector se queda en
      // "Todos" y media docena de pantallas solo dicen "elige un centro",
      // asi que el barrido no probaria nada de su contenido real.
      localStorage.setItem('panel_center', centros[0])
      localStorage.setItem('flota_lang', 'es')
      localStorage.setItem('cookies_ok', '1')
    },
    {
      centros,
      superAdmin,
      token: jwtDePrueba({
        sub: 'a1', role: 'admin', name: 'Admin Test', exp,
        org_id: 'org1', db_name: 'test_db', centers: centros,
        ...(superAdmin ? { sa: true } : {}),
      }),
    },
  )
}
