import { api } from '../services/api'

// Capa de API del panel de administración (reusa el axios con token).
// Centro: 'Todos' | 'OGA5' | 'DGA1' | 'DGA2' … (filtro global del panel)
const centerParam = (center) => (center && center !== 'Todos' ? { center } : {})

/* ── Peritaje firmado (S1) ── */
export const getForensicStatus = (inspId) => api.get(`/inspections/${inspId}/forensic`)
export const signInspectionAdmin = (inspId, signatureText) =>
  api.post(`/inspections/${inspId}/sign`, { signature_text: signatureText })

/* ── Dashboard ── */
export const getDashboardStats = () => api.get('/stats/dashboard')
export const getAttention = () => api.get('/stats/attention')

/* ── Vehículos / Flota ── */
export const getVehicles = (center) => api.get('/vehicles', { params: centerParam(center) })
export const getVehicle = (id) => api.get(`/vehicles/${id}`)
export const getVehicleHistory = (id) => api.get(`/vehicles/${id}/history`)
export const getLastInspections = () => api.get('/vehicles/last-inspections')
export const getVehicleDriver = (id) => api.get(`/vehicles/${id}/driver`)
export const getVehicleInspections = (id) => api.get(`/inspections/vehicle/${id}`)
export const updateVehicle = (id, body) => api.patch(`/vehicles/${id}`, body)

/* ── Conductores ── */
export const getDrivers = (center) => api.get('/drivers', { params: centerParam(center) })
export const getDriverRanking = () => api.get('/drivers/ranking')
export const getDriverScore = (id) => api.get(`/drivers/${id}/score`)

/* ── Inspecciones ── */
export const getInspections = (params = {}) => api.get('/inspections', { params })
export const getInspection = (id) => api.get(`/inspections/${id}`)
export const getReviewQueue = (center) => api.get('/inspections/review-queue', { params: centerParam(center) })
export const getAiDatasetStats = () => api.get('/ai-dataset/stats')
export const markReviewed = (id) => api.post(`/inspections/${id}/mark-reviewed`)
export const damageFeedback = (id, body) => api.post(`/inspections/${id}/damage-feedback`, body)
export const missedDamage = (id, body) => api.post(`/inspections/${id}/missed-damage`, body)

// Descarga autenticada (PDF/anotada): el endpoint exige Bearer, un <a href> no lo envía.
export const fetchAuthedBlob = async (path) => {
  const res = await api.get(path, { responseType: 'blob' })
  return URL.createObjectURL(res.data)
}

/* ── Talleres ── */
export const getWorkshops = () => api.get('/workshops')

/* ── Avisos / Alertas ── */
export const getAlerts = () => api.get('/alerts')
export const getItvAlerts = () => api.get('/alerts/itv')
export const getRentingAlerts = () => api.get('/alerts/renting')

/* ── Renting / Casas de alquiler ── */
export const getRentals = () => api.get('/rentals')

/* ── Bandeja super-admin (inbox append-only + fallback leads) ── */
export const getInbox = () => api.get('/inbox')

/* ── Incidencias ── */
export const getIncidents = () => api.get('/incidents')

/* ── Scorecard (baremos y subida POR CENTRO) ── */
export const getScorecardTargets = (center) => api.get('/scorecard/targets', { params: { center } })
export const setScorecardTargets = (body) => api.post('/scorecard/targets', body) // {center, dcr, dnr_dpmo, pod, cc, rts_pct, fdds}
export const getScorecardStandings = (center) => api.get('/scorecard/standings', { params: { center } })
export const getScorecardSources = (center, week) => api.get('/scorecard/sources', { params: { center, ...(week ? { week } : {}) } })
export const uploadScorecard = (file, center) => {
  const fd = new FormData()
  fd.append('file', file, file.name)
  if (center && center !== 'Todos') fd.append('center', center)
  return api.post('/scorecard/upload', fd, { timeout: 120000, headers: { 'Content-Type': undefined } })
}

/* ── Org / Config ── */
export const getOrgCenters = () => api.get('/org/centers')
export const addOrgCenter = (name) => api.post('/org/centers', { name })
export const getTelegramConfig = () => api.get('/telegram/config')
export const getOrgBilling = () => api.get('/org/billing')
export const getMe = () => api.get('/auth/me')

/* ── IA Peritaje / Métricas / Importaciones ── */
export const getHealth = () => api.get('/health')
export const reanalyzeFailed = () => api.post('/inspections/reanalyze-failed')
export const reanalyzeInspection = (id) => api.post(`/inspections/${id}/reanalyze`)
export const getMetricsReports = (center) => api.get('/metrics/reports', { params: centerParam(center) })
export const importVehicles = (file, center) => {
  const fd = new FormData()
  fd.append('file', file, file.name)
  if (center && center !== 'Todos') fd.append('center_filter', center)
  return api.post('/import/vehicles', fd, { timeout: 120000, headers: { 'Content-Type': undefined } })
}

/* ── Turnos ── */
export const getShifts = (center, desde, hasta) => api.get('/shifts', { params: { center, desde, hasta } })
export const getShiftCoverage = (center, desde, hasta) => api.get('/shifts/coverage', { params: { center, desde, hasta } })

/* ── Asignación diaria (qué conductor lleva qué furgo) ── */
export const getDailyAssignment = (center, date) => api.get('/assignments/daily', { params: { center, date } })
export const putDailyAssignment = (body) => api.put('/assignments/daily', body) // {center, date, slots:[{vehicle_id,vehicle_plate,driver_id,driver_name}]}

/* ── Negocio (super-admin) ── */
export const getAdminOverview = () => api.get('/admin/overview')
export const getAdminOrgs = () => api.get('/admin/orgs')
export const updateOrg = (body) => api.post('/admin/org', body) // {id, status?, plan?, extend_trial_days?, add_center?, max_centers?}
export const impersonateOrg = (id) => api.post('/admin/impersonate', { id })
export const deleteOrg = (id) => api.delete(`/admin/org/${id}`)
export const getLeads = () => api.get('/leads')
export const getBillingConfig = () => api.get('/billing/config')
export const backupNow = () => api.post('/admin/backup-now')

/* ── Usuarios (RBAC) ── */
export const getAdmins = () => api.get('/auth/admins')
export const createAdmin = (body) => api.post('/auth/create-admin', body) // {username, password, name, permissions:[]}
export const updateAdmin = (id, body) => api.patch(`/auth/admins/${id}`, body) // {permissions?, name?}
export const deleteAdmin = (id) => api.delete(`/auth/admins/${id}`)

/* ── Perfil / cuenta ── */
export const changeMyPassword = (current_password, new_password) =>
  api.post('/auth/change-my-password', { current_password, new_password })
