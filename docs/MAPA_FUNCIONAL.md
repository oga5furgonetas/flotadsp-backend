# Mapa funcional de FlotaDSP — Fase 2 de la auditoría

> Documento **generado desde el código**, no escrito de memoria: las llamadas, los
> endpoints y las colecciones se extraen analizando `frontend-v2/src` y
> `backend/server.py`. Sirve de base para las fases 3 (auditoría) y 4 (pruebas).

**Cifras:** 47 pantallas · 306 botones · 143 campos de formulario · 161 llamadas a API mapeadas · 265 rutas de backend · 157 funciones en los clientes de API.

---

## HOY

### MiDia
`panel/MiDia.jsx` · 142 líneas · 0 botones · 0 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getDailyAssignment` | GET | `/assignments/daily` | `get_daily_assignments` | daily_assignments, inspections |
| `getIncidents` | GET | `/incidents` | `get_incidents` | incidents |
| `getInspections` | GET | `/inspections` | `get_inspections` | inspections |
| `getItvAlerts` | GET | `/alerts/itv` | `get_itv_alerts` | vehicles |

### Dashboard
`panel/Dashboard.jsx` · 595 líneas · 4 botones · 0 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `cortexOverview` | GET | `/cortex/overview` | `cortex_overview` | cortex_packages |
| `cortexRoutes` | GET | `/cortex/routes` | `cortex_routes` | cortex_packages |
| `getDamageCosts` | GET | `/stats/damage-costs` | `get_damage_costs` | ai_feedback, drivers, inspections |
| `getDashboardStats` | GET | `/stats/dashboard` | `stats_dashboard` | alerts, drivers, incidents, inspections, vehicles |
| `getDrivers` | GET | `/drivers` | `get_drivers` | drivers |
| `getItvAlerts` | GET | `/alerts/itv` | `get_itv_alerts` | vehicles |
| `getLastInspections` | GET | `/vehicles/last-inspections` | `vehicles_last_inspections` | inspections |
| `getReviewQueue` | GET | `/inspections/review-queue` | `get_review_queue` | drivers, inspections, vehicles |
| `getVehicles` | GET | `/vehicles` | `get_vehicles` | vehicles |


## OPERACIÓN DIARIA

### PackageIntel
`panel/PackageIntel.jsx` · 625 líneas · 13 botones · 3 campos · 0 formularios · 1 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `cortexAlerts` | GET | `/cortex/alerts` | `cortex_alerts` | cortex_packages |
| `cortexAssignStation` | POST | `/cortex/stations` | `cortex_assign_station` | cortex_packages, cortex_stations |
| `cortexClearDemo` | POST | `/cortex/clear-demo` | `cortex_clear_demo` | cortex_events, cortex_packages |
| `cortexDays` | GET | `/cortex/days` | `cortex_days` | cortex_packages |
| `cortexIngestToken` | GET | `/cortex/ingest-token` | `cortex_ingest_token` | — |
| `cortexOverview` | GET | `/cortex/overview` | `cortex_overview` | cortex_packages |
| `cortexPackage` | GET | `/cortex/package/{tba}` | `cortex_package_detail` | cortex_packages |
| `cortexPackages` | GET | `/cortex/packages` | `cortex_packages` | cortex_packages |
| `cortexReset` | POST | `/cortex/reset` | `cortex_reset` | cortex_events, cortex_packages, parking_layouts |
| `cortexRoutes` | GET | `/cortex/routes` | `cortex_routes` | cortex_packages |
| `cortexSeedDemo` | POST | `/cortex/seed-demo` | `cortex_seed_demo` | cortex_packages |
| `cortexStations` | GET | `/cortex/stations` | `cortex_stations` | cortex_packages, cortex_stations |

### Asignacion
`panel/Asignacion.jsx` · 683 líneas · 11 botones · 4 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getDailyAssignment` | GET | `/assignments/daily` | `get_daily_assignments` | daily_assignments, inspections |
| `getDrivers` | GET | `/drivers` | `get_drivers` | drivers |
| `getInspections` | GET | `/inspections` | `get_inspections` | inspections |
| `getVehicles` | GET | `/vehicles` | `get_vehicles` | vehicles |
| `putDailyAssignment` | PUT | `/assignments/daily` | `upsert_daily_assignment` | daily_assignments |

### ChecklistOperativo
`panel/ChecklistOperativo.jsx` · 201 líneas · 8 botones · 2 campos · 0 formularios · 1 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getChecklist` | GET | `/checklist` | `get_checklist` | daily_checklists |
| `saveChecklistTemplate` | POST | `/checklist/template` | `save_checklist_template` | checklist_templates |
| `toggleChecklistItem` | POST | `/checklist/toggle` | `toggle_checklist_item` | daily_checklists |
| `upsertChecklist` | PUT | `/checklist` | `upsert_checklist` | daily_checklists |

### PlantillaGenerador
`panel/PlantillaGenerador.jsx` · 969 líneas · 25 botones · 7 campos · 0 formularios · 1 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `deletePlantilla` | DELETE | `/plantillas/{plantilla_id}` | `delete_plantilla` | plantillas_diarias |
| `downloadPlantilla` | GET | `/plantillas/{plantilla_id}/download` | `download_plantilla` | plantillas_diarias |
| `getPlantillas` | GET | `/plantillas` | `list_plantillas` | plantillas_diarias |
| `getVehicles` | GET | `/vehicles` | `get_vehicles` | vehicles |

### Chat
`panel/Chat.jsx` · 191 líneas · 4 botones · 1 campos · 1 formularios · 1 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `chatToChecklist` | POST | `/chat/{center}/{message_id}/to-checklist` | `chat_pin_to_checklist` | chat_messages, daily_checklists, inspections, telegram_config, vehicles |
| `deleteChatMessage` | DELETE | `/chat/{center}/{message_id}` | `chat_delete_message` | chat_messages |
| `getChat` | GET | `/chat/{center}` | `chat_get` | chat_messages |
| `postChat` | POST | `/chat/{center}` | `chat_post` | chat_messages |

### Turnos
`panel/Turnos.jsx` · 77 líneas · 0 botones · 0 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getShiftCoverage` | GET | `/shifts/coverage` | `get_coverage` | shifts |


## FLOTA

### Vehiculos
`panel/Vehiculos.jsx` · 1711 líneas · 32 botones · 23 campos · 0 formularios · 3 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `createIncident` | POST | `/incidents` | `create_incident` | daily_assignments, incidents, inspections, vehicles |
| `createVehicle` | POST | `/vehicles` | `create_vehicle` | vehicles |
| `deleteVehicle` | DELETE | `/vehicles/{vehicle_id}` | `delete_vehicle` | vehicles |
| `deleteVehicleDocument` | DELETE | `/vehicles/{vehicle_id}/documents/{doc_id}` | `delete_vehicle_document` | vehicle_documents |
| `getIncidents` | GET | `/incidents` | `get_incidents` | incidents |
| `getLastInspections` | GET | `/vehicles/last-inspections` | `vehicles_last_inspections` | inspections |
| `getVehicleDamageLedger` | GET | `/vehicles/{vehicle_id}/damage-ledger` | `get_vehicle_damage_ledger` | vehicle_damage_ledger |
| `getVehicleDocuments` | GET | `/vehicles/{vehicle_id}/documents` | `list_vehicle_documents` | vehicle_documents |
| `getVehicleDriver` | GET | `/vehicles/{vehicle_id}/driver` | `get_vehicle_driver` | drivers, vehicles |
| `getVehicleInspections` | GET | `/inspections/vehicle/{vehicle_id}` | `get_vehicle_inspections` | drivers, inspections, vehicles |
| `getVehicleMaintenance` | GET | `/vehicles/{vehicle_id}/maintenance` | `get_maintenance_info` | vehicles |
| `getVehicles` | GET | `/vehicles` | `get_vehicles` | vehicles |
| `registerMaintenanceChange` | POST | `/vehicles/{vehicle_id}/maintenance/{kind}/change` | `register_maintenance_change` | vehicles |
| `registerOilChange` | POST | `/vehicles/{vehicle_id}/oil/change` | `register_oil_change` | vehicles |
| `repairVehicleLedger` | POST | `/vehicles/{vehicle_id}/ledger/repair` | `vehicle_ledger_repair` | vehicle_damage_ledger, vehicles |
| `updateVehicle` | PATCH | `/vehicles/{vehicle_id}` | `update_vehicle` | vehicles |
| `uploadVehicleDocument` | POST | `/vehicles/{vehicle_id}/documents` | `upload_vehicle_document` | vehicle_documents, vehicles |

### RevisionRapida
`panel/RevisionRapida.jsx` · 551 líneas · 18 botones · 1 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `damageFeedback` | POST | `/inspections/{inspection_id}/damage-feedback` | `damage_feedback` | ai_feedback, inspections, vehicle_damage_ledger |
| `getAiDatasetStats` | GET | `/ai-dataset/stats` | `ai_dataset_stats` | ai_feedback |
| `getInspection` | GET | `/inspections/{inspection_id}` | `get_inspection` | inspections |
| `getReviewQueue` | GET | `/inspections/review-queue` | `get_review_queue` | drivers, inspections, vehicles |
| `markReviewed` | POST | `/inspections/{inspection_id}/mark-reviewed` | `mark_inspection_reviewed` | inspections |
| `missedDamage` | POST | `/inspections/{inspection_id}/missed-damage` | `missed_damage` | ai_feedback, inspections |
| `submitAiFeedback` | POST | `/ai-feedback` | `ai_feedback_simple` | ai_feedback, inspections |

### Inspecciones
`panel/Inspecciones.jsx` · 372 líneas · 11 botones · 1 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getDrivers` | GET | `/drivers` | `get_drivers` | drivers |
| `getForensicStatus` | GET | `/inspections/{inspection_id}/forensic` | `get_forensic_status` | forensic_signatures, inspection_ai_results, inspections |
| `getInspections` | GET | `/inspections` | `get_inspections` | inspections |
| `getVehicleInspections` | GET | `/inspections/vehicle/{vehicle_id}` | `get_vehicle_inspections` | drivers, inspections, vehicles |
| `getVehicles` | GET | `/vehicles` | `get_vehicles` | vehicles |
| `recheckFraud` | POST | `/inspections/{inspection_id}/recheck-fraud` | `recheck_fraud` | — |
| `signInspectionAdmin` | POST | `/inspections/{inspection_id}/sign` | `sign_inspection` | forensic_index, forensic_signatures, inspections, vehicles |

### Incidencias
`panel/Incidencias.jsx` · 397 líneas · 13 botones · 5 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `createIncident` | POST | `/incidents` | `create_incident` | daily_assignments, incidents, inspections, vehicles |
| `deleteIncident` | DELETE | `/incidents/{incident_id}` | `delete_incident` | incidents |
| `getIncidents` | GET | `/incidents` | `get_incidents` | incidents |
| `getVehicles` | GET | `/vehicles` | `get_vehicles` | vehicles |
| `reopenIncident` | PUT | `/incidents/{incident_id}/reopen` | `reopen_incident` | incidents |
| `resolveIncident` | PUT | `/incidents/{incident_id}/resolve` | `resolve_incident` | incidents |
| `updateIncident` | PATCH | `/incidents/{incident_id}` | `update_incident` | incidents |

### Talleres
`panel/Talleres.jsx` · 600 líneas · 6 botones · 4 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getVehicles` | GET | `/vehicles` | `get_vehicles` | vehicles |
| `getWorkshops` | GET | `/workshops` | `list_workshops` | workshops |
| `getWorkshopsNearby` | GET | `/workshops/nearby` | `workshops_nearby` | workshops |

### Aparcamiento
`panel/Aparcamiento.jsx` · 931 líneas · 20 botones · 5 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getVehicles` | GET | `/vehicles` | `get_vehicles` | vehicles |
| `parkingAssign` | POST | `/parking/assign` | `parking_assign` | parking_assignments |
| `parkingResolve` | POST | `/parking/resolve` | `parking_resolve` | parking_assignments |
| `parkingSaveLayout` | PUT | `/parking/layout` | `parking_layout_save` | parking_layouts |
| `parkingState` | GET | `/parking/state` | `parking_state` | drivers, parking_assignments, vehicles |
| `parkingZoneImage` | POST | `/parking/zone-image` | `parking_zone_image` | parking_layouts |

### Vencimientos
`panel/Vencimientos.jsx` · 51 líneas · 1 botones · 0 campos · 0 formularios · 0 confirmaciones · i18n: sí

_Sin llamadas propias a la API (composición o navegación)._

### AvisosITV
`panel/AvisosITV.jsx` · 9 líneas · 0 botones · 0 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getItvAlerts` | GET | `/alerts/itv` | `get_itv_alerts` | vehicles |

### Renting
`panel/Renting.jsx` · 17 líneas · 0 botones · 0 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getRentingAlerts` | GET | `/alerts/renting` | `get_renting_alerts` | vehicles |

### ExpiryAlerts
`panel/ExpiryAlerts.jsx` · 58 líneas · 0 botones · 0 campos · 0 formularios · 0 confirmaciones · i18n: sí

_Sin llamadas propias a la API (composición o navegación)._

### Importaciones
`panel/Importaciones.jsx` · 44 líneas · 0 botones · 1 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `importVehicles` | POST | `/import/vehicles` | `import_vehicles` | vehicles |

### CasasAlquiler
`panel/CasasAlquiler.jsx` · 461 líneas · 6 botones · 2 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getRentalsNearby` | GET | `/rentals/nearby` | `rentals_nearby` | rental_companies |


## EQUIPO

### Conductores
`panel/Conductores.jsx` · 1018 líneas · 16 botones · 16 campos · 1 formularios · 2 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `createDriver` | POST | `/drivers` | `create_driver` | driver_accounts, drivers |
| `deleteDriver` | DELETE | `/drivers/{driver_id}` | `delete_driver` | drivers |
| `deleteDriverAccount` | DELETE | `/auth/driver-account/${driverId}` | `?` | — |
| `getDriverAccounts` | GET | `/auth/driver-accounts` | `?` | — |
| `getDrivers` | GET | `/drivers` | `get_drivers` | drivers |
| `getDriversScoring` | GET | `/scoring/drivers` | `get_driver_scoring` | ai_feedback, daily_assignments, drivers, inspections |
| `getScoringLeaderboard` | GET | `/scoring/leaderboard` | `get_scoring_leaderboard` | — |
| `setDriverPassword` | POST | `/auth/set-driver-password` | `?` | — |
| `updateDriver` | PATCH | `/drivers/{driver_id}` | `update_driver` | drivers |
| `uploadDriverPhoto` | POST | `/drivers/{driver_id}/photo` | `upload_driver_photo` | drivers |

### Scorecard
`panel/Scorecard.jsx` · 995 líneas · 17 botones · 5 campos · 0 formularios · 1 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `calibrateScorecardThresholds` | POST | `/scorecard/calibrate-thresholds` | `calibrate_thresholds` | scorecard_official, scorecard_thresholds |
| `deleteScorecardSource` | DELETE | `/scorecard/source` | `scorecard_delete_source` | daily_dsp, daily_ratios, scorecard_live, scorecard_obs, scorecard_official, scorecard_weekly |
| `getScorecardDailyTrend` | GET | `/scorecard/daily-trend` | `scorecard_daily_trend` | daily_ratios |
| `getScorecardFull` | GET | `/scorecard/full` | `scorecard_full` | scorecard_live, scorecard_official, scorecard_weekly |
| `getScorecardPredict` | GET | `/scorecard/predict` | `scorecard_predict` | scorecard_live, scorecard_official, scorecard_weekly |
| `getScorecardSources` | GET | `/scorecard/sources` | `scorecard_sources` | daily_dsp, daily_ratios, scorecard_live, scorecard_official, scorecard_weekly |
| `resetScorecardThresholds` | DELETE | `/scorecard/thresholds` | `scorecard_reset_thresholds` | scorecard_thresholds |
| `resetScorecardWeek` | POST | `/scorecard/reset` | `scorecard_reset` | daily_dsp, daily_ratios, scorecard_live, scorecard_obs, scorecard_official |
| `setScorecardThreshold` | POST | `/scorecard/thresholds` | `scorecard_set_thresholds` | scorecard_thresholds |
| `setScorecardValue` | POST | `/scorecard/full` | `scorecard_set_value` | scorecard_live |
| `toggleScorecardEstimacion` | POST | `/scorecard/estimacion` | `scorecard_estimacion` | scorecard_live |
| `uploadScorecard` | POST | `/scorecard/upload` | `scorecard_upload` | daily_dsp, scorecard_obs, scorecard_official |

### Contactos
`panel/Contactos.jsx` · 300 líneas · 9 botones · 7 campos · 0 formularios · 0 confirmaciones · i18n: sí

_Sin llamadas propias a la API (composición o navegación)._

### PortalConductor
`panel/PortalConductor.jsx` · 96 líneas · 1 botones · 1 campos · 0 formularios · 0 confirmaciones · i18n: sí

_Sin llamadas propias a la API (composición o navegación)._

### Directory
`panel/Directory.jsx` · 71 líneas · 0 botones · 1 campos · 0 formularios · 0 confirmaciones · i18n: sí

_Sin llamadas propias a la API (composición o navegación)._


## SISTEMA

### IAPeritaje
`panel/IAPeritaje.jsx` · 524 líneas · 15 botones · 2 campos · 0 formularios · 1 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getHealth` | GET | `/health` | `health` | — |
| `getInspections` | GET | `/inspections` | `get_inspections` | inspections |
| `reanalyzeFailed` | POST | `/inspections/reanalyze-failed` | `reanalyze_all_failed` | inspections |
| `reanalyzeInspection` | POST | `/inspections/{inspection_id}/reanalyze` | `reanalyze_inspection` | drivers, forensic_signatures, inspections, vehicles |
| `rebuildFleetDamages` | POST | `/inspections/rebuild-fleet-damages` | `rebuild_fleet_damages` | inspections, vehicle_damage_ledger, vehicles |
| `rebuildStatus` | GET | `/inspections/{inspection_id}` | `get_inspection` | inspections |
| `submitAiFeedback` | POST | `/ai-feedback` | `ai_feedback_simple` | ai_feedback, inspections |

### Configuracion
`panel/Configuracion.jsx` · 111 líneas · 2 botones · 2 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `addOrgCenter` | POST | `/org/centers` | `add_org_center` | organizations |
| `getOrgBilling` | GET | `/org/billing` | `org_billing` | — |
| `getOrgCenters` | GET | `/org/centers` | `list_org_centers` | — |
| `getTelegramConfig` | GET | `/telegram/config` | `get_telegram_config` | telegram_config |

### Usuarios
`panel/Usuarios.jsx` · 364 líneas · 15 botones · 5 campos · 0 formularios · 1 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `createAdmin` | POST | `/auth/create-admin` | `?` | — |
| `deleteAdmin` | DELETE | `/auth/admins/${id}` | `?` | — |
| `getAdmins` | GET | `/auth/admins` | `?` | — |
| `updateAdmin` | PATCH | `/auth/admins/${id}` | `?` | — |

### Perfil
`panel/Perfil.jsx` · 108 líneas · 2 botones · 4 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `changeMyPassword` | POST | `/auth/change-my-password` | `?` | — |
| `getMe` | GET | `/auth/me` | `?` | — |
| `setMyEmail` | POST | `/auth/my-email` | `?` | — |

### Negocio
`panel/Negocio.jsx` · 325 líneas · 12 botones · 5 campos · 1 formularios · 2 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `adminCreateDriverOffer` | POST | `/admin/driver-offers` | `admin_create_driver_offer` | driver_offers |
| `adminDeleteDriverOffer` | DELETE | `/admin/driver-offers/{offer_id}` | `admin_delete_driver_offer` | cortex_events, cortex_packages, cortex_stations, driver_offers |
| `adminGetDriverOffers` | GET | `/admin/driver-offers` | `admin_list_driver_offers` | driver_offers |
| `adminGetFounderReservations` | GET | `/admin/founder-reservations` | `admin_list_founder_reservations` | founder_reservations |
| `adminToggleDriverOffer` | PATCH | `/admin/driver-offers/{offer_id}` | `admin_toggle_driver_offer` | driver_offers |
| `backupNow` | POST | `/admin/backup-now` | `trigger_backup` | daily_assignments, inspections, telegram_config, vehicles |
| `deleteOrg` | DELETE | `/admin/org/{org_id}` | `admin_delete_org` | admin_users, organizations |
| `getAdminOrgs` | GET | `/admin/orgs` | `admin_list_orgs` | organizations |
| `getAdminOverview` | GET | `/admin/overview` | `admin_overview` | leads, organizations |
| `getLeads` | GET | `/leads` | `list_leads` | leads |
| `impersonateOrg` | POST | `/admin/impersonate` | `admin_impersonate` | — |
| `updateOrg` | POST | `/admin/org` | `admin_update_org` | organizations |

### Bandeja
`panel/Bandeja.jsx` · 100 líneas · 3 botones · 1 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getInbox` | GET | `/inbox` | `list_inbox` | inbox_messages |
| `getLeads` | GET | `/leads` | `list_leads` | leads |

### Actividad
`panel/Actividad.jsx` · 57 líneas · 0 botones · 0 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getInspections` | GET | `/inspections` | `get_inspections` | inspections |
| `getVehicles` | GET | `/vehicles` | `get_vehicles` | vehicles |

### Metricas
`panel/Metricas.jsx` · 39 líneas · 0 botones · 0 campos · 0 formularios · 0 confirmaciones · i18n: sí

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getMetricsReports` | GET | `/metrics/reports` | `list_amazon_reports` | amazon_reports |


## PORTAL DEL CONDUCTOR

### DriverPortal
`conductor/DriverPortal.jsx` · 45 líneas · 0 botones · 0 campos · 0 formularios · 0 confirmaciones · i18n: **NO**

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getPortalVehicles` | GET | `/vehicles/portal` | `get_vehicles_portal` | drivers, vehicles |

### DriverLogin
`conductor/DriverLogin.jsx` · 222 líneas · 4 botones · 3 campos · 0 formularios · 0 confirmaciones · i18n: **NO**

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getConductorList` | GET | `/auth/conductor-list` | `?` | — |
| `getDriverToken` | POST | `/auth/driver-token` | `?` | — |

### InspectionFlow
`conductor/InspectionFlow.jsx` · 746 líneas · 13 botones · 5 campos · 0 formularios · 0 confirmaciones · i18n: **NO**

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `getAssignedVehicle` | GET | `/auth/me/assigned-vehicle` | `?` | — |
| `readOdometer` | POST | `/vehicles/{vehicle_id}/odometer-photo` | `read_odometer_photo` | vehicles |
| `uploadInspection` | POST | `/inspections/upload` | `upload_inspection_photos` | drivers, inspections, vehicles |
| `validatePhoto` | POST | `/inspections/validate-photo` | `validate_inspection_photo` | vehicles |

### InspectionDone
`conductor/InspectionDone.jsx` · 238 líneas · 7 botones · 1 campos · 0 formularios · 0 confirmaciones · i18n: **NO**

| Acción (función) | Método | Endpoint | Handler backend | Colecciones |
|---|---|---|---|---|
| `clickDriverOffer` | POST | `/driver-offers/{offer_id}/click` | `click_driver_offer` | driver_offers |
| `getDriverOffers` | GET | `/driver-offers` | `list_driver_offers` | driver_offers |
| `signInspection` | POST | `/inspections/{inspection_id}/sign` | `sign_inspection` | forensic_index, forensic_signatures, inspections, vehicles |


## PÚBLICO

### Landing
`publico/Landing.jsx` · 756 líneas · 2 botones · 1 campos · 0 formularios · 0 confirmaciones · i18n: sí

_Sin llamadas propias a la API (composición o navegación)._

### Login
`publico/Login.jsx` · 63 líneas · 1 botones · 3 campos · 0 formularios · 0 confirmaciones · i18n: sí

_Sin llamadas propias a la API (composición o navegación)._

### Registro
`publico/Registro.jsx` · 365 líneas · 6 botones · 10 campos · 0 formularios · 0 confirmaciones · i18n: sí

_Sin llamadas propias a la API (composición o navegación)._

### Planes
`publico/Planes.jsx` · 381 líneas · 4 botones · 5 campos · 1 formularios · 0 confirmaciones · i18n: sí

_Sin llamadas propias a la API (composición o navegación)._

### ResetPassword
`publico/ResetPassword.jsx` · 106 líneas · 2 botones · 3 campos · 0 formularios · 0 confirmaciones · i18n: sí

_Sin llamadas propias a la API (composición o navegación)._

### Verify
`publico/Verify.jsx` · 132 líneas · 1 botones · 1 campos · 1 formularios · 0 confirmaciones · i18n: **NO**

_Sin llamadas propias a la API (composición o navegación)._

### PeritajeTecnico
`publico/PeritajeTecnico.jsx` · 161 líneas · 0 botones · 1 campos · 0 formularios · 0 confirmaciones · i18n: sí

_Sin llamadas propias a la API (composición o navegación)._

### Dashboard
`publico/Dashboard.jsx` · 134 líneas · 2 botones · 2 campos · 0 formularios · 0 confirmaciones · i18n: sí

_Sin llamadas propias a la API (composición o navegación)._

### NotFound
`publico/NotFound.jsx` · 31 líneas · 0 botones · 0 campos · 0 formularios · 0 confirmaciones · i18n: sí

_Sin llamadas propias a la API (composición o navegación)._

### Landing3DShowcase
`publico/Landing3DShowcase.jsx` · 88 líneas · 0 botones · 0 campos · 0 formularios · 0 confirmaciones · i18n: **NO**

_Sin llamadas propias a la API (composición o navegación)._


---

## Anexo A — Rutas de backend sin ninguna referencia en los clientes

44 de 264 rutas no aparecen citadas en `frontend-v2`, la extensión Cortex ni la app
móvil. **No son todas código muerto**: unas son llamadas por servicios externos y
otras son herramientas de mantenimiento. Quedan clasificadas para verificar en Fase 3.

### A.1 · Legítimas (llamadas desde fuera o uso manual)
- `POST /billing/lemonsqueezy/webhook` — la invoca Lemon Squeezy. **Crítica, no tocar.**
- `POST /admin/send-weekly-digest`, `POST /telegram/send-daily-summary`,
  `POST /telegram/send-weekly-summary` — disparadores manuales del envío programado.
- `POST /reset-admin-password`, `GET /r2-test`, `POST /vehicles/fix-centers`,
  `POST /admin/backfill-new-damages` — mantenimiento puntual.
- `GET /admin/audit-log` — creada en esta auditoría; aún sin pantalla.

### A.2 · Candidatas a funcionalidad inacabada o abandonada (verificar)
| Ruta | Sospecha |
|---|---|
| `GET/PUT /mery/stickers` | Funcionalidad no identificada en el panel |
| `GET/POST /route-demand` | Sin consumidor |
| `GET/POST /shift-requests` | Turnos: petición de cambio sin interfaz |
| `POST /shifts/bulk`, `POST /shifts/generate-auto` | Generación automática sin botón |
| `POST /scorecard/import-official`, `import-thresholds`, `import-weights` | 3 importadores sin interfaz |
| `POST /metrics/upload-daily`, `upload-report`, `upload-routeplan` | 3 subidas sin interfaz |
| `POST /assignments/import-image`, `import-text` | Importación de cuadrante sin interfaz |
| `POST /inspections/batch-upload` | Subida masiva sin interfaz |
| `POST /drivers/import-ids`, `POST /import/diagnose` | Importadores sin interfaz |
| `GET /inspections/{id}/responsibility`, `/debug-segment`, `/suggested-workshops` | Funciones de IA sin interfaz |
| `GET /metrics/daily-week`, `/driver-history/{id}`, `/routeplan`, `/routeplan-available` | Métricas sin consumidor |
| `GET /scorecard/ratios-raw`, `/week-range` | Sin consumidor |
| `GET /org/upgrade-preview`, `POST /org/change-plan` | Cambio de plan sin interfaz |
| `PUT /alerts/read-all` | Botón "marcar todo leído" ausente |
| `PUT /vehicles/{id}/assign-driver` | Asignación directa sin interfaz |
| `POST /vehicles/{id}/bags/consume` | Sin interfaz |
| `GET /vehicles/plate/{plate}/provider-info` | Sin consumidor |
| `GET /reports/fleet-pdf` | Informe PDF de flota sin botón |

**Lectura:** entre 25 y 30 rutas parecen ser funcionalidad construida en el backend
que nunca llegó a tener interfaz. Cada una es superficie de ataque y mantenimiento
sin retorno. En Fase 3 hay que decidir para cada una: **terminarla o borrarla**.

## Anexo B — Hallazgos de la Fase 2 (sin corregir aún)

| # | Hallazgo | Gravedad |
|---|---|---|
| F2-1 | **El portal del conductor NO tiene i18n** (`DriverPortal`, `DriverLogin`, `InspectionFlow`, `InspectionDone`): 117 usuarios reales solo en español. La cobertura del 100% lograda antes era del *panel*. | Alto |
| F2-2 | `publico/Verify` (verificación de peritaje forense, cara al cliente final) tampoco tiene i18n | Medio |
| F2-3 | 25-30 rutas de backend sin interfaz (ver Anexo A.2) | Medio |
| F2-4 | `Vehiculos.jsx` con 1.711 líneas y 32 botones: la pantalla más compleja con diferencia | Medio |
| F2-5 | `publico/Landing3DShowcase` (88 líneas) no está enrutada: código muerto probable | Bajo |

