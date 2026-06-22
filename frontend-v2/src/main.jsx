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
              <Route index element={<Placeholder title="Dashboard" />} />
              <Route path="flota" element={<Placeholder title="Flota" />} />
              <Route path="conductores" element={<Placeholder title="Conductores" />} />
              <Route path="inspecciones" element={<Placeholder title="Inspecciones · IA" />} />
              <Route path="alertas" element={<Placeholder title="Alertas" />} />
              <Route path="incidencias" element={<Placeholder title="Incidencias" />} />
              <Route path="scorecard" element={<Placeholder title="Scorecard" />} />
              <Route path="metricas" element={<Placeholder title="Métricas · Reportes" />} />
              <Route path="turnos" element={<Placeholder title="Turnos" />} />
              <Route path="renting" element={<Placeholder title="Renting" />} />
              <Route path="talleres" element={<Placeholder title="Talleres" />} />
              <Route path="import-export" element={<Placeholder title="Import / Export" />} />
              <Route path="documentos" element={<Placeholder title="Documentos" />} />
              <Route path="ajustes" element={<Placeholder title="Ajustes" />} />
              <Route path="admin" element={<Placeholder title="Admin" />} />
            </Route>

            <Route path="*" element={<Landing />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </LangProvider>
  </React.StrictMode>,
)
