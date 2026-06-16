import axios from 'axios'

export const API_BASE = 'https://flotadsp-backend.fly.dev/api'

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
