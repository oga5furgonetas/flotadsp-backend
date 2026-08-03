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
