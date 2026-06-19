import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { ToastProvider } from './lib/toast'
import { LangProvider } from './i18n'
import Landing from './pages/Landing'
import DriverPortal from './pages/driver/DriverPortal'

/* App v2 (staging, en paralelo). La web actual NO se toca hasta el lanzamiento. */

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LangProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/conductor" element={<DriverPortal />} />
            <Route path="/conductor/:slug" element={<DriverPortal />} />
            <Route path="*" element={<Landing />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </LangProvider>
  </React.StrictMode>,
)
