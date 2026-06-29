import { api } from '../services/api'

// Capa de API del panel de administración (reusa el axios con token).
// Centro: 'Todos' | 'OGA5' | 'DGA1' | 'DGA2' … (filtro global del panel)
const centerParam = (center) => (center && center !== 'Todos' ? { center } : {})

/* ── Peritaje firmado (S1) ── */
export const getForensicStatus = (inspId) => api.get(`/inspections/${inspId}/forensic`)
export const signInspectionAdmin = (inspId, signatureText) =>
  api.post(`/inspections/${inspId}/sign`, { signature_text: signatureText })

/* ── Fraud Guard (S3) ── */
export const recheckFraud = (inspId) => api.post(`/inspections/${inspId}/recheck-fraud`)

/* ── Checklist operativo ── */
export const getChecklist = (center, date) => api.get('/checklist', { params: { center, date } })
export const upsertChecklist = (body) => api.put('/checklist', body)
export const toggleChecklistItem = (body) => api.post('/checklist/toggle', body)

/* ── Chat por centro ── */
export const getChat = (center, since) => api.get(`/chat/${center}`, { params: since ? { since } : {} })
export const postChat = (center, text) => api.post(`/chat/${center}`, { text })
export const chatToChecklist = (center, messageId, body = {}) =>
  api.post(`/chat/${center}/${messageId}/to-checklist`, body)

/* ── Dashboard ── */
export const getDashboardStats = (center) => api.get('/stats/dashboard', { params: centerParam(center) })
export const getAttention = () => api.get('/stats/attention')

/* ── Vehículos / Flota ── */
export const getVehicles = (center) => api.get('/vehicles', { params: centerParam(center) })
export const getVehicle = (id) => api.get(`/vehicles/${id}`)
export const getVehicleHistory = (id) => api.get(`/vehicles/${id}/history`)
export const getLastInspections = (center) => api.get('/vehicles/last-inspections', { params: centerParam(center) })
export const getVehicleDriver = (id) => api.get(`/vehicles/${id}/driver`)
export const getVehicleInspections = (id) => api.get(`/inspections/vehicle/${id}`)
export const updateVehicle = (id, body) => api.patch(`/vehicles/${id}`, body)
export const getVehicleMaintenance = (id) => api.get(`/vehicles/${id}/maintenance`)
export const registerOilChange = (id, body) => api.post(`/vehicles/${id}/oil/change`, body)
export const registerMaintenanceChange = (id, kind, body) => api.post(`/vehicles/${id}/maintenance/${kind}/change`, body)

/* ── Conductores ── */
export const getDrivers = (center) => api.get('/drivers', { params: centerParam(center) })
export const getDriverRanking = () => api.get('/drivers/ranking')
export const getDriverScore = (id) => api.get(`/drivers/${id}/score`)
export const getDriversScoring = (month, year) => api.get('/scoring/drivers', { params: { ...(month ? { month } : {}), ...(year ? { year } : {}) } })
export const getScoringLeaderboard = (month, year) => api.get('/scoring/leaderboard', { params: { ...(month ? { month } : {}), ...(year ? { year } : {}) } })
export const createDriver = (data) => api.post('/drivers', data)
export const updateDriver = (id, data) => api.patch(`/drivers/${id}`, data)
export const deleteDriver = (id) => api.delete(`/drivers/${id}`)
export const uploadDriverPhoto = (id, file) => { const fd = new FormData(); fd.append('file', file); return api.post(`/drivers/${id}/photo`, fd) }

/* ── Cuentas de conductor (acceso con contraseña) ── */
export const getDriverAccounts = () => api.get('/auth/driver-accounts')
export const setDriverPassword = (driverId, password) => api.post('/auth/set-driver-password', { driver_id: driverId, password })
export const deleteDriverAccount = (driverId) => api.delete(`/auth/driver-account/${driverId}`)

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
export const getWorkshopsNearby = (lat, lng, { provider, category, maxKm = 80 } = {}) =>
  api.get('/workshops/nearby', { params: { lat, lng, max_km: maxKm, ...(provider ? { provider } : {}), ...(category ? { category } : {}) } })

/* ── Avisos / Alertas ── */
export const getAlerts = () => api.get('/alerts')
export const getItvAlerts = (center) => api.get('/alerts/itv', { params: centerParam(center) })
export const getMaintenanceAlerts = () => api.get('/alerts/maintenance')
export const getRentingAlerts = () => api.get('/alerts/renting')

/* ── Renting / Casas de alquiler ── */
export const getRentals = () => api.get('/rentals')
export const getRentalsNearby = (lat, lng, maxKm = 80) =>
  api.get('/rentals/nearby', { params: { lat, lng, max_km: maxKm } })

/* ── Bandeja super-admin (inbox append-only + fallback leads) ── */
export const getInbox = () => api.get('/inbox')

/* ── Incidencias ── */
export const getIncidents = (params = {}) => api.get('/incidents', { params })
export const createIncident = (body) => api.post('/incidents', body)
export const updateIncident = (id, body) => api.patch(`/incidents/${id}`, body)
export const deleteIncident = (id) => api.delete(`/incidents/${id}`)
export const resolveIncident = (id) => api.put(`/incidents/${id}/resolve`)
export const reopenIncident = (id) => api.put(`/incidents/${id}/reopen`)

/* ── Scorecard (baremos y subida POR CENTRO) ── */
export const getScorecardTargets = (center) => api.get('/scorecard/targets', { params: { center } })
export const setScorecardTargets = (body) => api.post('/scorecard/targets', body)
export const getScorecardStandings = (center) => api.get('/scorecard/standings', { params: { center } })
export const getScorecardSources = (center, week) => api.get('/scorecard/sources', { params: { center, ...(week ? { week } : {}) } })
export const getScorecardFull = (center, week) => api.get('/scorecard/full', { params: { center, ...(week ? { week } : {}) } })
export const setScorecardValue = (body) => api.post('/scorecard/full', body)   // {center, week, key, value}
export const getScorecardPredict = (center, week) => api.get('/scorecard/predict', { params: { center, ...(week ? { week } : {}) } })
export const getScorecardDailyTrend = (center, week) => api.get('/scorecard/daily-trend', { params: { center, ...(week ? { week } : {}) } })
export const setScorecardThreshold = (body) => api.post('/scorecard/thresholds', body) // {center?, key, fantastic, great, fair}
export const calibrateScorecardThresholds = (center) => api.post('/scorecard/calibrate-thresholds', { center })
export const resetScorecardThresholds = (center) => api.delete('/scorecard/thresholds', { params: { center } })
export const toggleScorecardEstimacion = (body) => api.post('/scorecard/estimacion', body) // {center, week, on}
export const resetScorecardWeek = (body) => api.post('/scorecard/reset', body) // {center, week?}
export const deleteScorecardSource = (center, kind, ref, week) => api.delete('/scorecard/source', { params: { center, kind, ref, ...(week ? { week } : {}) } })
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
export const reanalyzeInspection = (id) => api.post(`/inspections/${id}/reanalyze?silent=true`, {}, { timeout: 120000 })
export const submitAiFeedback = (body) => api.post('/ai-feedback', body)
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

/* ── Historial de plantillas ── */
export const getPlantillas = (center) => api.get('/plantillas', { params: centerParam(center) })
export const downloadPlantilla = (id) => api.get(`/plantillas/${id}/download`, { responseType: 'blob' })
export const deletePlantilla = (id) => api.delete(`/plantillas/${id}`)

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
