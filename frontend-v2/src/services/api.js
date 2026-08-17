import axios from 'axios'
import { API_BASE } from '../lib/apiBase'

export { API_BASE }

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

/* ── DOS SESIONES QUE NO SE PISAN ──────────────────────────────────────────
   El panel y el portal del conductor viven en el mismo navegador y hasta ahora
   compartían la misma llave `flotadsp_token`. Consecuencia real, vista en
   producción: alguien con el panel abierto entraba al portal para probar, el
   login del conductor pisaba el token del admin, las pestañas del panel
   empezaban a dar 401 y el interceptor de abajo BORRABA el token —dejando sin
   sesión también al conductor, que veía "Se requiere autenticación" en mitad
   de una petición de días.

   La sesión del conductor tiene ahora su propia llave. Se elige por la URL:
   /conductor es suyo, el resto es del panel. */
export const DRIVER_TOKEN_KEY = 'flotadsp_driver_token'
export const enPortalConductor = () =>
  typeof window !== 'undefined' && window.location.pathname.startsWith('/conductor')

export function tokenActual() {
  if (enPortalConductor()) {
    // Se acepta el token viejo como respaldo: quien tenga la sesión abierta de
    // antes no se queda fuera al desplegar esto.
    return localStorage.getItem(DRIVER_TOKEN_KEY) || localStorage.getItem('flotadsp_token') || ''
  }
  return localStorage.getItem('flotadsp_token') || ''
}

api.interceptors.request.use((config) => {
  const token = tokenActual()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Sesión expirada/inválida dentro del panel → limpiar y volver al login.
// OJO: change-my-password devuelve 401 cuando la contraseña actual es errónea
// (no es un problema de sesión), por eso se excluye.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status
    const url = error?.config?.url || ''
    const path = window.location.pathname
    if (
      status === 401 &&
      path.startsWith('/panel') &&
      path !== '/panel/login' &&
      // Nunca desde el portal del conductor: un 401 suyo no puede llevarse por
      // delante la sesión del panel (ni al revés). Son dos sesiones distintas.
      !enPortalConductor() &&
      !url.includes('/auth/change-my-password')
    ) {
      localStorage.removeItem('flotadsp_token')
      localStorage.removeItem('flotadsp_admin')
      window.location.replace('/panel/login')
    }
    return Promise.reject(error)
  }
)

/* ── Multi-tenant: el slug del DSP sale de la URL (flotadsp.com/<slug>/conductor) ── */
export function currentSlug() {
  // flotadsp.com/conductor/#<slug>  (hash: robusto, sin líos de enrutado servidor)
  const h = (window.location.hash || '').replace(/^#\/?/, '').trim()
  if (h && /^[a-z0-9-]+$/i.test(h)) return h
  // alternativas: ?slug= o /conductor/<slug> por si acaso
  const m = window.location.pathname.match(/\/conductor\/([a-z0-9-]+)/i)
  if (m) return m[1]
  return new URLSearchParams(window.location.search).get('slug') || undefined
}

/* ── Auth conductor (scoped al DSP por slug) ────────────────────
   Se pregunta SOLO por el email tecleado. Antes el portal se descargaba la
   plantilla entera (nombre, email, centro e id de todos los conductores) sin
   autenticar y buscaba en local: eso filtraba datos personales de toda la
   empresa y permitía pedir un token con el id de cualquiera. */
export const driverLookup = (email) =>
  api.post('/auth/driver-lookup', { email, slug: currentSlug() })

export const getDriverToken = (driverId, email) =>
  api.post('/auth/driver-token', { driver_id: driverId, email, slug: currentSlug() })

/* Info pública del DSP por su slug (para mostrar su nombre en el portal) */
export const getOrgBySlug = (slug) => api.get(`/auth/org/${slug}`)

export const getAssignedVehicle = () => api.get('/auth/me/assigned-vehicle')

/* ── Vehículos / inspecciones ─────────────────────────────── */
export const getPortalVehicles = () => api.get('/vehicles/portal')
/* Turnos del propio conductor: su calendario y sus peticiones de día. */
export const getMyShifts = (desde, hasta) => api.get('/shifts/mine', { params: { desde, hasta } })
/* Pedir días. Admite las dos formas a propósito:
     createShiftRequest({ dates:[...], motivo, note })   ← calendario nuevo
     createShiftRequest('2026-09-23', 'libre', '')       ← pantalla antigua
   La antigua sigue viva en Mis turnos; cambiar la firma a secas la habría
   roto en silencio, porque JavaScript no avisa de un argumento de más. */
export const createShiftRequest = (a, type, note) =>
  api.post('/shift-requests', (a && typeof a === 'object') ? a : { date: a, type, note })
export const marcarRespuestasVistas = (body) => api.post('/shift-requests/vistas', body)
// El conductor se cambia su propia contraseña. Antes tenía que decirle a la
// oficina cuál quería, o sea contársela a otra persona.
export const changeMyPassword = (current_password, new_password) =>
  api.post('/auth/change-my-password', { current_password, new_password })

export const validatePhoto = (vehicleId, expectedZone, file) => {
  const fd = new FormData()
  fd.append('vehicle_id', vehicleId)
  fd.append('expected_zone', expectedZone)
  fd.append('file', file, 'check.jpg')
  return api.post('/inspections/validate-photo', fd, {
    timeout: 40000,
    headers: { 'Content-Type': undefined },
  })
}

export const uploadInspection = (formData) =>
  api.post('/inspections/upload', formData, {
    timeout: 90000,
    headers: { 'Content-Type': undefined },
  })

// Peritaje firmado: el conductor firma su propia inspección con texto-declaración.
export const signInspection = (inspectionId, signatureText) =>
  api.post(`/inspections/${inspectionId}/sign`, { signature_text: signatureText })

/* ── Ofertas patrocinadas del portal conductor (públicas) ── */
/* Avisos de los portales problematicos de la ruta de hoy de este conductor.
   Cierra el bucle de la Libreta de portales: lo que alguien aprendio fallando
   le llega al siguiente ANTES de que vuelva a fallar. */
export const getMisAvisosPortales = () => api.get('/cortex/portales/mi-ruta')
export const getDriverOffers = () => api.get('/driver-offers')
export const clickDriverOffer = (offerId) => api.post(`/driver-offers/${offerId}/click`)

export const readOdometer = (vehicleId, file) => {
  const fd = new FormData()
  fd.append('file', file, 'odometro.jpg')
  return api.post(`/vehicles/${vehicleId}/odometer-photo`, fd, {
    timeout: 60000,
    headers: { 'Content-Type': undefined },
  })
}

export const updateMileage = (vehicleId, km) =>
  api.post(`/vehicles/${vehicleId}/mileage`, { km })
