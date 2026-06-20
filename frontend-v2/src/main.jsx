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
            <Route path="*" element={<Landing />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </LangProvider>
  </React.StrictMode>,
)
