import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { ToastProvider } from './lib/toast'
import { LangProvider } from './i18n'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Registro from './pages/Registro'
import Planes from './pages/Planes'
import DriverPortal from './pages/driver/DriverPortal'
import PanelLogin from './panel/PanelLogin'
import PanelLayout from './panel/PanelLayout'
import Placeholder from './panel/Placeholder'
import PanelDashboard from './panel/pages/Dashboard'
import PanelVehiculos from './panel/pages/Vehiculos'
import PanelRevision from './panel/pages/RevisionRapida'
import PanelNegocio from './panel/pages/Negocio'
import PanelPerfil from './panel/pages/Perfil'
import PanelInspecciones from './panel/pages/Inspecciones'
import PanelConductores from './panel/pages/Conductores'
import PanelAvisosITV from './panel/pages/AvisosITV'
import PanelRenting from './panel/pages/Renting'
import PanelTalleres from './panel/pages/Talleres'
import PanelCasasAlquiler from './panel/pages/CasasAlquiler'
import PanelScorecard from './panel/pages/Scorecard'
import PanelConfiguracion from './panel/pages/Configuracion'
import PanelTurnos from './panel/pages/Turnos'
import PanelUsuarios from './panel/pages/Usuarios'
import PanelIAPeritaje from './panel/pages/IAPeritaje'
import PanelMetricas from './panel/pages/Metricas'
import PanelImportaciones from './panel/pages/Importaciones'
import PanelActividad from './panel/pages/Actividad'
import PanelPortalConductor from './panel/pages/PortalConductor'
import PanelAsignacion from './panel/pages/Asignacion'
import PanelChecklistOp from './panel/pages/ChecklistOperativo'
import PanelChat from './panel/pages/Chat'
import PanelPlantilla from './panel/pages/PlantillaGenerador'
import PanelBandeja from './panel/pages/Bandeja'
import PanelIncidencias from './panel/pages/Incidencias'
import PanelContactos from './panel/pages/Contactos'
import Privacidad from './legal/Privacidad'
import Terminos from './legal/Terminos'
import CookiesPage from './legal/Cookies'
import AvisoLegal from './legal/AvisoLegal'
import Contacto from './legal/Contacto'
import CookieBanner from './legal/CookieBanner'
import PeritajeTecnico from './pages/PeritajeTecnico'
import Verify from './pages/Verify'

/* Toda la app vive en /panel. /app es un alias legado que redirige al panel nuevo. */
function AppRedirect() {
  window.location.replace('/panel')
  return null
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LangProvider>
      <ToastProvider>
        <BrowserRouter>
          <CookieBanner />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/registro" element={<Registro />} />
            <Route path="/planes" element={<Planes />} />
            <Route path="/privacidad" element={<Privacidad />} />
            <Route path="/terminos" element={<Terminos />} />
            <Route path="/cookies" element={<CookiesPage />} />
            <Route path="/aviso-legal" element={<AvisoLegal />} />
            <Route path="/contacto" element={<Contacto />} />
            <Route path="/peritaje-tecnico" element={<PeritajeTecnico />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/verify/:hash" element={<Verify />} />
            <Route path="/app" element={<AppRedirect />} />
            <Route path="/conductor" element={<DriverPortal />} />
            <Route path="/conductor/:slug" element={<DriverPortal />} />

            {/* Panel de administración nuevo (modelo v2). En construcción por módulos.
                NO afecta a las rutas actuales ni al login en vivo. */}
            <Route path="/panel/login" element={<PanelLogin />} />
            <Route path="/panel" element={<PanelLayout />}>
              {/* Operacional */}
              <Route index element={<PanelDashboard />} />
              <Route path="scorecard" element={<PanelScorecard />} />
              <Route path="conductores" element={<PanelConductores />} />
              <Route path="turnos" element={<PanelTurnos />} />
              <Route path="asignacion" element={<PanelAsignacion />} />
              <Route path="checklist-operativo" element={<PanelChecklistOp />} />
              <Route path="chat" element={<PanelChat />} />
              <Route path="plantilla" element={<PanelPlantilla />} />
              <Route path="metricas" element={<PanelMetricas />} />
              <Route path="actividad" element={<PanelActividad />} />
              {/* Furgonetas */}
              <Route path="revision" element={<PanelRevision />} />
              <Route path="inspecciones" element={<PanelInspecciones />} />
              <Route path="vehiculos" element={<PanelVehiculos />} />
              <Route path="talleres" element={<PanelTalleres />} />
              <Route path="avisos-itv" element={<PanelAvisosITV />} />
              <Route path="renting" element={<PanelRenting />} />
              <Route path="casas-alquiler" element={<PanelCasasAlquiler />} />
              <Route path="ia-peritaje" element={<PanelIAPeritaje />} />
              <Route path="importaciones" element={<PanelImportaciones />} />
              <Route path="configuracion" element={<PanelConfiguracion />} />
              <Route path="admin" element={<PanelNegocio />} />
              <Route path="usuarios" element={<PanelUsuarios />} />
              <Route path="perfil" element={<PanelPerfil />} />
              <Route path="portal-conductor" element={<PanelPortalConductor />} />
              <Route path="bandeja" element={<PanelBandeja />} />
              <Route path="incidencias" element={<PanelIncidencias />} />
              <Route path="contactos" element={<PanelContactos />} />
            </Route>

            <Route path="*" element={<Landing />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </LangProvider>
  </React.StrictMode>,
)
