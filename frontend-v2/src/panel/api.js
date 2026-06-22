import { api } from '../services/api'

// Capa de API del panel de administración (reusa el axios con token).
// Centro: 'Todos' | 'OGA5' | 'DGA1' | 'DGA2' … (filtro global del panel)
const centerParam = (center) => (center && center !== 'Todos' ? { center } : {})

/* ── Dashboard ── */
export const getDashboardStats = () => api.get('/stats/dashboard')
export const getAttention = () => api.get('/stats/attention')

/* ── Vehículos / Flota ── */
export const getVehicles = (center) => api.get('/vehicles', { params: centerParam(center) })
export const getVehicle = (id) => api.get(`/vehicles/${id}`)
export const getVehicleHistory = (id) => api.get(`/vehicles/${id}/history`)
export const getLastInspections = () => api.get('/vehicles/last-inspections')

/* ── Conductores ── */
export const getDrivers = (center) => api.get('/drivers', { params: centerParam(center) })
export const getDriverRanking = () => api.get('/drivers/ranking')

/* ── Inspecciones ── */
export const getInspections = (params = {}) => api.get('/inspections', { params })
export const getInspection = (id) => api.get(`/inspections/${id}`)
export const getReviewQueue = (center) => api.get('/inspections/review-queue', { params: centerParam(center) })
export const getAiDatasetStats = () => api.get('/ai-dataset/stats')
export const markReviewed = (id) => api.post(`/inspections/${id}/mark-reviewed`)
export const damageFeedback = (id, body) => api.post(`/inspections/${id}/damage-feedback`, body)
export const missedDamage = (id, body) => api.post(`/inspections/${id}/missed-damage`, body)

/* ── Talleres ── */
export const getWorkshops = () => api.get('/workshops')

/* ── Avisos / Alertas ── */
export const getAlerts = () => api.get('/alerts')
export const getItvAlerts = () => api.get('/alerts/itv')
export const getRentingAlerts = () => api.get('/alerts/renting')

/* ── Renting / Casas de alquiler ── */
export const getRentals = () => api.get('/rentals')

/* ── Incidencias ── */
export const getIncidents = () => api.get('/incidents')

/* ── Org / Config ── */
export const getOrgCenters = () => api.get('/org/centers')
export const getMe = () => api.get('/me')
