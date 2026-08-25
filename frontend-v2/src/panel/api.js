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
export const deleteChatMessage = (center, messageId) => api.delete(`/chat/${center}/${messageId}`)
export const saveChecklistTemplate = (body) => api.post('/checklist/template', body) // {center, shift, items}
// Cierre de turno: sale solo a su hora, esto lo dispara ahora para probarlo.
export const enviarResumenTurno = (body) => api.post('/checklist/enviar-resumen', body)

/* ── Quién recibe el resumen de cada centro ──
   Los teléfonos viven en la BD, nunca en el código: son datos de personas
   reales y el repositorio acaba en GitHub. */
export const listarDestinatarios = () => api.get('/avisos/destinatarios')
export const guardarDestinatario = (body) => api.post('/avisos/destinatarios', body)
export const borrarDestinatario = (id) => api.delete(`/avisos/destinatarios/${id}`)
export const enviarResumenDiario = (body) => api.post('/avisos/enviar-resumen-diario', body)
export const getHorariosAvisos = () => api.get('/avisos/horarios')
export const setHorariosAvisos = (body) => api.put('/avisos/horarios', body)
export const chatToChecklist = (center, messageId, body = {}) =>
  api.post(`/chat/${center}/${messageId}/to-checklist`, body)

/* ── Dashboard ── */
export const getDashboardStats = (center) => api.get('/stats/dashboard', { params: centerParam(center) })
export const getDamageCosts = (center) => api.get('/stats/damage-costs', { params: centerParam(center) })
export const getAttention = () => api.get('/stats/attention')

/* ── Vehículos / Flota ── */
export const getOnboarding = () => api.get('/onboarding')
// `estado: 'baja'` es la ÚNICA forma de ver las furgonetas devueltas: por
// defecto no salen ni cuentan en ninguna parte (están fuera de la operación).
export const getVehicles = (center, estado) =>
  api.get('/vehicles', { params: { ...centerParam(center), ...(estado ? { estado } : {}) } })
export const createVehicle = (body) => api.post('/vehicles', body)
export const getVehicle = (id) => api.get(`/vehicles/${id}`)
export const getVehicleHistory = (id) => api.get(`/vehicles/${id}/history`)
export const getLastInspections = (center) => api.get('/vehicles/last-inspections', { params: centerParam(center) })
export const getSpareWheels = () => api.get('/vehicles/spare-wheel')
export const getVehicleDriver = (id) => api.get(`/vehicles/${id}/driver`)
export const getVehicleInspections = (id) => api.get(`/inspections/vehicle/${id}`)
export const getVehicleDamageLedger = (id) => api.get(`/vehicles/${id}/damage-ledger`)
export const repairVehicleLedger = (id, body) => api.post(`/vehicles/${id}/ledger/repair`, body)
export const resolveVehicleModel = (brand, model, year, version) =>
  api.get('/vehicle-models/resolve', { params: { brand: brand || '', model: model || '', ...(year ? { year } : {}), ...(version ? { version } : {}) } })
export const identifyVehicleModel = (id) => api.post(`/vehicles/${id}/identify-model`)
export const updateVehicle = (id, body) => api.patch(`/vehicles/${id}`, body)
export const getVehicleMaintenance = (id) => api.get(`/vehicles/${id}/maintenance`)
export const registerOilChange = (id, body) => api.post(`/vehicles/${id}/oil/change`, body)
export const registerMaintenanceChange = (id, kind, body) => api.post(`/vehicles/${id}/maintenance/${kind}/change`, body)
export const getVehicleDocuments = (id) => api.get(`/vehicles/${id}/documents`)
export const uploadVehicleDocument = (id, formData) => api.post(`/vehicles/${id}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const deleteVehicleDocument = (vehicleId, docId) => api.delete(`/vehicles/${vehicleId}/documents/${docId}`)
// Toda la documentacion subida alguna vez, este como este la furgoneta. La
// pantalla de una furgoneta devuelta ya no se abre, y su papeleo se sigue
// necesitando meses despues.
export const getAllDocuments = (q = '') => api.get('/documents', { params: q ? { q } : {} })
export const deleteVehicle = (vehicleId) => api.delete(`/vehicles/${vehicleId}`)

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
/* Bucle del daño: mandar a taller, apuntar el coste real y cerrarlo.
   El backend ya lo soportaba; lo que faltaba era llamarlo desde algún sitio. */
export const getSuggestedWorkshops = (inspectionId, damageIndex) =>
  api.get(`/inspections/${inspectionId}/damages/${damageIndex}/suggested-workshops`)
export const updateDamage = (inspectionId, damageIndex, body) =>
  api.patch(`/inspections/${inspectionId}/damages/${damageIndex}`, body)
export const getWorkshopsNearby = (lat, lng, { provider, category, maxKm = 80 } = {}) =>
  api.get('/workshops/nearby', { params: { lat, lng, max_km: maxKm, ...(provider ? { provider } : {}), ...(category ? { category } : {}) } })

/* ── Avisos / Alertas ── */
export const getAlerts = () => api.get('/alerts')
export const getItvAlerts = (center) => api.get('/alerts/itv', { params: centerParam(center) })
/* Todo lo que vence en un mes (ITV, renting y los cambios previstos por km),
   ya filtrado por centro en el servidor. */
export const fleetCalendar = (params) => api.get('/fleet/calendar', { params })
export const crearCitaFlota = (body) => api.post('/fleet/calendar/citas', body)
export const editarCitaFlota = (id, body) => api.patch(`/fleet/calendar/citas/${id}`, body)
export const borrarCitaFlota = (id) => api.delete(`/fleet/calendar/citas/${id}`)
// Resolver ≠ marcar hecho: además de cerrar la cita, pone a cero el contador de
// km de ese cambio y lo apunta en el historial de la furgoneta.
export const resolverCitaFlota = (id, body) => api.post(`/fleet/calendar/citas/${id}/resolver`, body)
export const getMaintenanceLog = (id) => api.get(`/vehicles/${id}/maintenance-log`)
// Borrar un apunte DESHACE lo que hizo (devuelve el contador de km a como
// estaba y la cita a pendiente); si no, sería peor que no poder borrarlo.
export const borrarApunteMantenimiento = (id, entryId) =>
  api.delete(`/vehicles/${id}/maintenance-log/${entryId}`)
export const getMaintenanceAlerts = () => api.get('/alerts/maintenance')
export const getRentingAlerts = () => api.get('/alerts/renting')

/* ── Renting / Casas de alquiler ── */
export const getRentals = () => api.get('/rentals')
export const getRentalsNearby = (lat, lng, maxKm = 80) =>
  api.get('/rentals/nearby', { params: { lat, lng, max_km: maxKm } })

/* ── Bandeja super-admin (inbox append-only + fallback leads) ── */
export const getInbox = () => api.get('/inbox')

/* ── Asistente: pregúntale a tu flota (Gemini sobre datos reales de la org) ── */
export const askAssistant = (question) => api.post('/assistant/ask', { question }, { timeout: 45000 })

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
// De dónde salen los umbrales de esta nave: si el DSP no ha subido ninguna
// scorecard suya, los tiers son orientativos y hay que decírselo.
export const getScorecardUmbrales = (center, week) => api.get('/scorecard/umbrales', { params: { center, ...(week ? { week } : {}) } })
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
export const getBillingUso = () => api.get('/billing/uso')
export const revisarFacturacion = () => api.post('/billing/revisar')
// Cuánto sitio queda antes de que algo se rompa. Atlas M0 y una máquina de 1 GB
// no avisan: se ponen lentos primero y dejan de aceptar escrituras después.
export const getSaludSistema = () => api.get('/admin/salud')
export const getMe = () => api.get('/auth/me')

/* ── IA Peritaje / Métricas / Importaciones ── */
export const getHealth = () => api.get('/health')
export const reanalyzeFailed = () => api.post('/inspections/reanalyze-failed')
export const rebuildFleetDamages = () => api.post('/inspections/rebuild-fleet-damages')
export const rebuildStatus = () => api.get('/inspections/rebuild-status')
export const reanalyzeInspection = (id) => api.post(`/inspections/${id}/reanalyze?silent=true`, {}, { timeout: 120000 })
export const submitAiFeedback = (body) => api.post('/ai-feedback', body)
export const getMetricsReports = (center) => api.get('/metrics/reports', { params: centerParam(center) })
/* Informes de Amazon: subida (plan de rutas de la mañana, report, daily de
   Cortex) y el acumulado semanal que sale de ellos. */
const _subir = (ruta, file, extra = {}) => {
  const fd = new FormData()
  fd.append('file', file)
  for (const [k, v] of Object.entries(extra)) fd.append(k, v)
  return api.post(ruta, fd, { timeout: 180000, headers: { 'Content-Type': undefined } })
}
export const uploadRoutePlan = (file, center) => _subir('/metrics/upload-routeplan', file, { center })
export const uploadAmazonReport = (file, center) => _subir('/metrics/upload-report', file, { center })
export const uploadDailyReport = (file) => _subir('/metrics/upload-daily', file)
export const getDailyWeek = (center, desde, hasta) => api.get('/metrics/daily-week', { params: { center, desde, hasta } })
export const getRoutePlanAvailable = (center) => api.get('/metrics/routeplan-available', { params: { center } })
export const getDriverRouteHistory = (tid) => api.get(`/metrics/driver-history/${encodeURIComponent(tid)}`)
export const importVehicles = (file, center) => {
  const fd = new FormData()
  fd.append('file', file, file.name)
  if (center && center !== 'Todos') fd.append('center_filter', center)
  return api.post('/import/vehicles', fd, { timeout: 120000, headers: { 'Content-Type': undefined } })
}

/* ── Turnos ── */
export const getShifts = (center, desde, hasta) => api.get('/shifts', { params: { center, desde, hasta } })
export const getShiftCoverage = (center, desde, hasta) => api.get('/shifts/coverage', { params: { center, desde, hasta } })
export const saveShiftsBulk = (items) => api.post('/shifts/bulk', { items })
export const setShiftSettings = (center, min_cobertura) => api.post('/shifts/settings', { center, min_cobertura })
// Cuadrante pegado desde Sheets: mas fiable que el Excel porque lo que se ve es
// lo que entra, sin depender de donde este cada cosa en el fichero.
export const importShiftsPegado = (body) => api.post('/shifts/import-pegado', body, { timeout: 120000 })
export const getAliasNombres = () => api.get('/shifts/alias-nombres')
export const setAliasNombres = (mapa) => api.put('/shifts/alias-nombres', { mapa })

// Bloqueos: dias en los que no se pueden pedir libres.
export const getShiftBlocks = (center) => api.get('/shift-blocks', { params: { center } })
export const createShiftBlock = (body) => api.post('/shift-blocks', body)
export const deleteShiftBlock = (id) => api.delete(`/shift-blocks/${id}`)

export const generateShiftsAuto = (center, desde, hasta) => api.post('/shifts/generate-auto', { center, desde, hasta }, { timeout: 120000 })
export const getRouteDemand = (center, desde, hasta) => api.get('/route-demand', { params: { center, desde, hasta } })
export const setRouteDemand = (center, items) => api.post('/route-demand', { center, items })
export const getShiftRequests = (center, status, extra = {}) =>
  api.get('/shift-requests', { params: { ...centerParam(center), ...(status ? { status } : {}), ...extra } })
// Rechazar exige motivo: lo lee el conductor tal cual.
export const resolveShiftRequest = (id, action, motivo) =>
  api.post(`/shift-requests/${id}/resolve`, { action, motivo })
/* Importar el cuadrante mensual. El MES lo pone quien importa, no el fichero:
   el Excel de Amazon arrastra en la cabecera el texto del mes anterior cuando
   se reutiliza la plantilla. Sin `confirmar` sólo devuelve el resumen. */
export function importShifts(file, center, mes, confirmar) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('center', center)
  fd.append('mes', mes)
  if (confirmar) fd.append('confirmar', '1')
  return api.post('/shifts/import', fd, { timeout: 120000, headers: { 'Content-Type': undefined } })
}
/* El cuadrante en .xlsx. Se pide como blob porque el endpoint exige Bearer:
   un <a href> normal no manda la cabecera y devolveria un 401. */
/* ── Reportes diarios de Cortex (DNR, RTS, POD, CC) ── */
/* Sube los .html tal cual se descargan de Cortex. Multipart porque son
   ficheros de verdad; con `confirmar` en falso solo se enseña lo que entraría. */
export const subirDiarios = (files, center, confirmar) => {
  const fd = new FormData()
  for (const f of files) fd.append('files', f)
  if (center && center !== 'Todos') fd.append('center', center)
  if (confirmar) fd.append('confirmar', '1')
  return api.post('/diarios/subir', fd, { timeout: 180000 })
}
/* ── Órdenes de trabajo ── */
// Alta rapida desde el formulario de la orden: el taller nuevo aparece
// cuando hace falta, que es justo cuando descubres que no estaba.
export const exportarOrdenes = (params) =>
  api.get('/work-orders/export', { params, responseType: 'blob' })
export const crearTaller = (body) => api.post('/workshops', body)
export const getOrdenes = (params) => api.get('/work-orders', { params })
export const getResumenOrdenes = (center) =>
  api.get('/work-orders/resumen', { params: centerParam(center) })
export const getOrden = (id) => api.get(`/work-orders/${id}`)
export const crearOrden = (body) => api.post('/work-orders', body)
export const editarOrden = (id, body) => api.patch(`/work-orders/${id}`, body)
// Rehace el enlace y REVOCA el anterior: es la forma de arreglar un envío
// al taller equivocado.
export const enlaceOrden = (id, dias) =>
  api.post(`/work-orders/${id}/enlace`, null, { params: dias ? { dias } : {} })

export const pegarDiario = (body) => api.post('/diarios/pegar', body)
export const diariosPorConductor = (center, desde, hasta) =>
  api.get('/diarios/conductores', { params: { center, desde, hasta } })
export const asignarIdConductor = (body) => api.post('/diarios/id-conductor', body)
export const vincularTransporterIds = (body) => api.post('/diarios/ids', body)

export const exportarCuadrante = (center, desde, hasta) =>
  api.get('/shifts/export', { params: { center, desde, hasta }, responseType: 'blob' })

export const getCodigosCuadrante = () => api.get('/shifts/codigos')
export const setCodigosCuadrante = (codigos) => api.put('/shifts/codigos', { codigos })

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
/* Catálogo de planes: editable sin desplegar. */
export const adminGetPlanes = () => api.get('/admin/planes')
export const adminSetPlanes = (body) => api.put('/admin/planes', body)
/* Cobros: qué facturar cada mes y quién ha pagado. Sin pasarela. */
/* Datos de quien emite las facturas. */
export const adminGetEmisor = () => api.get('/admin/emisor')
export const adminSetEmisor = (body) => api.put('/admin/emisor', body)
export const adminGetCobros = (mes) => api.get('/admin/cobros', { params: mes ? { mes } : {} })
export const adminMarcarCobro = (id, estado, referencia) =>
  api.post(`/admin/cobros/${id}`, { estado, ...(referencia ? { referencia } : {}) })
export function adminConciliar(file, mes) {
  const fd = new FormData()
  fd.append('file', file)
  if (mes) fd.append('mes', mes)
  return api.post('/admin/cobros/conciliar', fd, { timeout: 120000, headers: { 'Content-Type': undefined } })
}
export const backupNow = () => api.post('/admin/backup-now')
/* Monetización: ofertas del portal conductor + reservas fundador */
export const adminGetDriverOffers = () => api.get('/admin/driver-offers')
export const adminCreateDriverOffer = (body) => api.post('/admin/driver-offers', body)
export const adminToggleDriverOffer = (id, active) => api.patch(`/admin/driver-offers/${id}`, { active })
export const adminDeleteDriverOffer = (id) => api.delete(`/admin/driver-offers/${id}`)
export const adminGetFounderReservations = () => api.get('/admin/founder-reservations')

/* ── Usuarios (RBAC) ── */
export const getAdmins = () => api.get('/auth/admins')
export const createAdmin = (body) => api.post('/auth/create-admin', body) // {username, password, name, permissions:[]}
export const updateAdmin = (id, body) => api.patch(`/auth/admins/${id}`, body) // {permissions?, name?}
export const deleteAdmin = (id) => api.delete(`/auth/admins/${id}`)

/* ── Perfil / cuenta ── */
export const changeMyPassword = (current_password, new_password) =>
  api.post('/auth/change-my-password', { current_password, new_password })
export const setMyEmail = (email) => api.post('/auth/my-email', { email })
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email })

/* ── Package Intelligence Center (Cortex) ── */
export const cortexOverview = (day, center) => api.get('/cortex/overview', { params: { day, center } })
export const cortexPackages = (params) => api.get('/cortex/packages', { params })
export const cortexRoutes = (day, center) => api.get('/cortex/routes', { params: { day, center } })
export const cortexPackage = (tba) => api.get(`/cortex/package/${tba}`)
export const cortexAlerts = (day, center) => api.get('/cortex/alerts', { params: { day, center } })
export const cortexHeatmap = (day, center) => api.get('/cortex/heatmap', { params: { day, center } })
export const cortexDays = (center) => api.get('/cortex/days', { params: { center } })
// Que hay en una coordenada. Para los paquetes en los que Cortex manda el punto
// pero no el texto de la direccion: sin esto la pantalla se rendia teniendo un
// dato en la mano.
export const getGeoInverso = (lat, lng) => api.get('/cortex/geo/inverso', { params: { lat, lng } })
export const cortexStations = () => api.get('/cortex/stations')
export const cortexAssignStation = (service_area_id, center) => api.post('/cortex/stations', { service_area_id, center })
// Reparto automático por geografía. Sin `aplicar` solo propone: se puede mirar
// antes de que toque nada.
export const cortexStationsAuto = (aplicar = false) => api.post(`/cortex/stations/auto?aplicar=${aplicar ? 'true' : 'false'}`)
export const cortexIngestToken = () => api.get('/cortex/ingest-token')
export const cortexSeedDemo = () => api.post('/cortex/seed-demo')
export const cortexClearDemo = () => api.post('/cortex/clear-demo')
export const cortexReset = () => api.post('/cortex/reset')

/* Calidad de entrega en vivo: el scorecard calculado desde Cortex, sin subir
   nada y sin esperar al viernes de Amazon. */
export const cortexCalidad = (params) => api.get('/cortex/calidad', { params })
export const cortexDsc = (params) => api.get('/cortex/dsc', { params })
export const cortexSimular = (params) => api.get('/cortex/simular', { params })
/* Libreta de portales: direcciones que fallan una y otra vez. */
export const cortexPortales = (params) => api.get('/cortex/portales', { params })
export const cortexPortalNota = (body) => api.post('/cortex/portales', body)
export const cortexPortalGeo = (body) => api.post('/cortex/portales/geo', body)
/* Dónde está DE VERDAD la dirección, buscada por texto en varios geocodificadores
   a la vez. Guarda sólo lo confirmado por dos familias de fuentes distintas. */
export const cortexPortalGeodir = (body) => api.post('/cortex/portales/geodir', body)
/* Los "no puedo encontrar la dirección" de HOY, uno a uno y en vivo. */
export const cortexDireccionesHoy = (params) => api.get('/cortex/direcciones-hoy', { params })
/* Los MISSING de hoy, con el conductor ya resuelto. Pestaña propia: un paquete
   perdido se atiende llamando a alguien, no buscando en un mapa. */
export const cortexMissingHoy = (params) => api.get('/cortex/missing-hoy', { params })
export const cortexDiagnostico = () => api.get('/cortex/diagnostico')
/* IDs de Amazon que reparten sin ficha de conductor, con sugerencia de a quien
   corresponden. La asignacion reutiliza updateDriver: driver_id ya esta en la
   whitelist del PATCH. */
export const cortexEmparejar = () => api.get('/cortex/emparejar')

/* WHC: horas de trabajo. Se pega el plan del portal y devuelve el margen que le
   queda a cada conductor antes del limite semanal. */
export const whcAnalizar = (body) => api.post('/whc/analizar', body)
// El plan pegado se guarda por (centro, semana) para no tener que repegarlo.
export const getWhcPlan = (center) => api.get('/whc/plan', { params: { center } })
export const deleteWhcPlan = (center) => api.delete('/whc/plan', { params: { center } })

// ── Aparcamiento: plano por centro + trazabilidad diaria ──
export const parkingLayout = (center) => api.get('/parking/layout', { params: { center } })
export const parkingSaveLayout = (body) => api.put('/parking/layout', body)
export const parkingState = (center, day) => api.get('/parking/state', { params: { center, day } })
export const parkingAssign = (body) => api.post('/parking/assign', body)
export const parkingReport = (body) => api.post('/parking/report', body)
export const parkingResolve = (body) => api.post('/parking/resolve', body)
export const parkingLastKnown = (center) => api.get('/parking/last-known', { params: { center } })
export const parkingZoneImage = (formData) => api.post('/parking/zone-image', formData)
