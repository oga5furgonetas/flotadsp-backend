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

/* La app de gestión completa (Conductores, Flota, HistorialIA, PeritoIA…) vive en
   app.flotadsp.com. flotadsp.com = landing + registro + pagos + portal conductor.
   Login/registro y cualquier ruta /app llevan a la app completa. */
function AppRedirect() {
  window.location.replace('https://app.flotadsp.com')
  return null
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LangProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/registro" element={<Registro />} />
            <Route path="/planes" element={<Planes />} />
            <Route path="/app" element={<AppRedirect />} />
            <Route path="/conductor" element={<DriverPortal />} />
            <Route path="/conductor/:slug" element={<DriverPortal />} />

            {/* Panel de administración nuevo (modelo v2). En construcción por módulos.
                NO afecta a las rutas actuales ni al login en vivo. */}
            <Route path="/panel/login" element={<PanelLogin />} />
            <Route path="/panel" element={<PanelLayout />}>
              {/* Operacional */}
              <Route index element={<PanelDashboard />} />
              <Route path="scorecard" element={<Placeholder title="Scorecard" />} />
              <Route path="conductores" element={<Placeholder title="Conductores" />} />
              <Route path="turnos" element={<Placeholder title="Turnos" />} />
              <Route path="metricas" element={<Placeholder title="Métricas" />} />
              <Route path="actividad" element={<Placeholder title="Actividad" />} />
              {/* Furgonetas */}
              <Route path="revision" element={<PanelRevision />} />
              <Route path="inspecciones" element={<PanelInspecciones />} />
              <Route path="vehiculos" element={<PanelVehiculos />} />
              <Route path="talleres" element={<Placeholder title="Talleres" />} />
              <Route path="avisos-itv" element={<Placeholder title="Avisos ITV" />} />
              <Route path="renting" element={<Placeholder title="Renting" />} />
              <Route path="casas-alquiler" element={<Placeholder title="Casas de alquiler" />} />
              <Route path="ia-peritaje" element={<Placeholder title="IA Peritaje" />} />
              <Route path="importaciones" element={<Placeholder title="Importaciones" />} />
              <Route path="configuracion" element={<Placeholder title="Configuración" />} />
              <Route path="admin" element={<PanelNegocio />} />
              <Route path="perfil" element={<PanelPerfil />} />
            </Route>

            <Route path="*" element={<Landing />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </LangProvider>
  </React.StrictMode>,
)
