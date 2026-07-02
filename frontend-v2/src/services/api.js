import axios from 'axios'
import { API_BASE } from '../lib/apiBase'

export { API_BASE }

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

// Token en cada petición (mismo storage que la app actual para convivir durante la migración)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('flotadsp_token')
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

/* ── Auth conductor (scoped al DSP por slug) ──────────────────── */
export const getConductorList = (center) =>
  api.get('/auth/conductor-list', { params: { slug: currentSlug(), ...(center ? { center } : {}) } })

export const getDriverToken = (driverId) =>
  api.post('/auth/driver-token', { driver_id: driverId, slug: currentSlug() })

/* Info pública del DSP por su slug (para mostrar su nombre en el portal) */
export const getOrgBySlug = (slug) => api.get(`/auth/org/${slug}`)

export const getAssignedVehicle = () => api.get('/auth/me/assigned-vehicle')

/* ── Vehículos / inspecciones ─────────────────────────────── */
export const getPortalVehicles = () => api.get('/vehicles/portal')

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
