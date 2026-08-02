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
  analysis: { severity: 'sin_danos', damages: [], summary: 'Sin daños' },
}

/* Respuesta por defecto según el final de la ruta. Cualquier endpoint no
   contemplado devuelve algo inofensivo en vez de romper la pantalla. */
function respuesta(ruta, escenario) {
  const lleno = escenario === 'lleno'
  const t = {
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
    '/metrics/reports': [],
    '/chat': { messages: [] },
    '/shifts': { shifts: [] },
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

export async function entrarComoAdmin(page, { superAdmin = false } = {}) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  await page.addInitScript(
    ({ token }) => {
      localStorage.setItem('flotadsp_token', token)
      localStorage.setItem('flotadsp_admin', JSON.stringify({
        id: 'a1', name: 'Admin Test', role: 'admin',
        centers: ['OGA5', 'DGA1'], super_admin: false,
      }))
      localStorage.setItem('flota_lang', 'es')
      localStorage.setItem('cookies_ok', '1')
    },
    {
      token: jwtDePrueba({
        sub: 'a1', role: 'admin', name: 'Admin Test', exp,
        org_id: 'org1', db_name: 'test_db', ...(superAdmin ? { sa: true } : {}),
      }),
    },
  )
}
