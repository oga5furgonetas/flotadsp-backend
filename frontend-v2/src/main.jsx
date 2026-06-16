import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { ToastProvider } from './lib/toast'
import DriverPortal from './pages/driver/DriverPortal'

/* Fase 1 de la reconstrucción: solo el Portal Conductor.
   El resto de rutas redirigen a la app actual hasta que se migren. */

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <BrowserRouter basename="/conductor">
        <Routes>
          {/* flotadsp.com/conductor/<slug> → portal del conductor de ESE DSP */}
          <Route path="/:slug" element={<DriverPortal />} />
          <Route path="*" element={<DriverPortal />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </React.StrictMode>,
)
