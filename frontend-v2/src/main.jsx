import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
/* Tipografía self-hosted (la CSP bloquea Google Fonts): Inter para texto,
   Space Grotesk para titulares. Vite las sirve desde el propio dominio. */
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'

// Tema del panel ANTES del primer render: sin destello oscuro→claro
if (localStorage.getItem('panel_theme') === 'light') {
  document.documentElement.setAttribute('data-panel-theme', 'light')
}
import './index.css'
import { ToastProvider } from './lib/toast'
import { LangProvider } from './i18n'
import { API_BASE } from './lib/apiBase'
import Landing from './pages/Landing'
import CookieBanner from './legal/CookieBanner'

/* ── Auto-recuperación tras deploy: si una pestaña abierta pide un chunk viejo
   (invalidado por un despliegue), Vite emite vite:preloadError. Recargamos UNA
   vez para coger la versión nueva — sin pantalla rota y sin alertas de ruido. ── */
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  const k = 'chunk_reload_at'
  const last = Number(sessionStorage.getItem(k) || 0)
  if (Date.now() - last > 30_000) {           // guarda anti-bucle de recargas
    sessionStorage.setItem(k, String(Date.now()))
    window.location.reload()
  }
})

/* ── Monitorización: errores JS → backend → Telegram (máx 5/sesión, dedupe) ── */
// Ruido que NO merece alerta: chunks viejos tras deploy, cortes de red del móvil,
// errores opacos de extensiones/scripts externos, ResizeObserver…
const _NOISE = [
  'dynamically imported module', 'Importing a module script failed', 'ChunkLoadError',
  'Failed to fetch', 'NetworkError', 'Load failed', 'network error',
  'Script error', 'ResizeObserver loop',
  // Navegadores viejos sin 'wasm-unsafe-eval' en CSP: el 3D degrada solo, no es accionable.
  'WebAssembly.instantiate', 'WebAssembly.compile',
]
const _reported = new Set()
function reportError(message, stack) {
  try {
    const msg = String(message || '').slice(0, 500)
    if (!msg || _reported.size >= 5 || _reported.has(msg)) return
    if (_NOISE.some((n) => msg.includes(n))) return
    _reported.add(msg)
    fetch(`${API_BASE}/client-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, stack: String(stack || '').slice(0, 800), url: window.location.href }),
    }).catch(() => {})
  } catch { /* reportar nunca debe romper la app */ }
}
window.addEventListener('error', (e) => reportError(e.message, e.error?.stack))
window.addEventListener('unhandledrejection', (e) => reportError(e.reason?.message || String(e.reason), e.reason?.stack))

/* Un error de render no debe dejar la pantalla en blanco */
// ¿Es el fallo típico de "chunk viejo tras un deploy"? (index cacheado pide un
// JS con hash antiguo; el fallback SPA devuelve HTML → módulo undefined)
const isStaleChunkError = (msg = '') =>
  /reading 'default'|dynamically imported module|Importing a module script failed|Loading chunk/i.test(msg)

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { broken: false } }
  static getDerivedStateFromError() { return { broken: true } }
  componentDidCatch(error, info) {
    // Auto-curación: si el fallo es un chunk desactualizado, recarga UNA vez
    // (trae el index nuevo con los nombres de chunk correctos) sin molestar.
    if (isStaleChunkError(error?.message) && !sessionStorage.getItem('chunk_reloaded')) {
      sessionStorage.setItem('chunk_reloaded', String(Date.now()))
      window.location.reload()
      return
    }
    reportError(error?.message, (error?.stack || '') + (info?.componentStack || ''))
  }
  render() {
    if (!this.state.broken) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#0b0d10', color: '#eef1f6', fontFamily: 'Inter Variable,Inter,system-ui,sans-serif', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 34 }}>⚠️</div>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Algo ha ido mal</h1>
        <p style={{ margin: 0, color: '#8b94a3', fontSize: 14 }}>El error se ha reportado automáticamente. Recarga la página para continuar.</p>
        <button onClick={() => window.location.reload()} style={{ marginTop: 8, padding: '11px 22px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#fb923c,#ea6800)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
          Recargar
        </button>
      </div>
    )
  }
}

// Tras 15 s sanos, se rearma la auto-curación para el próximo deploy.
setTimeout(() => { try { sessionStorage.removeItem('chunk_reloaded') } catch { /* privado */ } }, 15000)

/* Code-splitting: la landing carga al instante; el resto de rutas se descargan
   solo cuando se visitan (panel, portal conductor, legal…). */
const Login = lazy(() => import('./pages/Login'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Registro = lazy(() => import('./pages/Registro'))
const Planes = lazy(() => import('./pages/Planes'))
const DriverPortal = lazy(() => import('./pages/driver/DriverPortal'))
const PanelLogin = lazy(() => import('./panel/PanelLogin'))
const PanelLayout = lazy(() => import('./panel/PanelLayout'))
const PanelDashboard = lazy(() => import('./panel/pages/Dashboard'))
const PanelMiDia = lazy(() => import('./panel/pages/MiDia'))
const PanelVehiculos = lazy(() => import('./panel/pages/Vehiculos'))
const PanelVencimientos = lazy(() => import('./panel/pages/Vencimientos'))
const PanelRevision = lazy(() => import('./panel/pages/RevisionRapida'))
const PanelNegocio = lazy(() => import('./panel/pages/Negocio'))
const PanelPerfil = lazy(() => import('./panel/pages/Perfil'))
const PanelInspecciones = lazy(() => import('./panel/pages/Inspecciones'))
const PanelConductores = lazy(() => import('./panel/pages/Conductores'))
const PanelAvisosITV = lazy(() => import('./panel/pages/AvisosITV'))
const PanelRenting = lazy(() => import('./panel/pages/Renting'))
const PanelTalleres = lazy(() => import('./panel/pages/Talleres'))
const PanelCasasAlquiler = lazy(() => import('./panel/pages/CasasAlquiler'))
const PanelScorecard = lazy(() => import('./panel/pages/Scorecard'))
const PanelConfiguracion = lazy(() => import('./panel/pages/Configuracion'))
const PanelTurnos = lazy(() => import('./panel/pages/Turnos'))
const PanelUsuarios = lazy(() => import('./panel/pages/Usuarios'))
const PanelIAPeritaje = lazy(() => import('./panel/pages/IAPeritaje'))
const PanelMetricas = lazy(() => import('./panel/pages/Metricas'))
const PanelImportaciones = lazy(() => import('./panel/pages/Importaciones'))
const PanelActividad = lazy(() => import('./panel/pages/Actividad'))
const PanelPortalConductor = lazy(() => import('./panel/pages/PortalConductor'))
const PanelAsignacion = lazy(() => import('./panel/pages/Asignacion'))
const PanelChecklistOp = lazy(() => import('./panel/pages/ChecklistOperativo'))
const PanelChat = lazy(() => import('./panel/pages/Chat'))
const PanelPlantilla = lazy(() => import('./panel/pages/PlantillaGenerador'))
const PanelBandeja = lazy(() => import('./panel/pages/Bandeja'))
const PanelIncidencias = lazy(() => import('./panel/pages/Incidencias'))
const PanelContactos = lazy(() => import('./panel/pages/Contactos'))
const PanelPaquetes = lazy(() => import('./panel/pages/PackageIntel'))
const Privacidad = lazy(() => import('./legal/Privacidad'))
const Terminos = lazy(() => import('./legal/Terminos'))
const CookiesPage = lazy(() => import('./legal/Cookies'))
const AvisoLegal = lazy(() => import('./legal/AvisoLegal'))
const Contacto = lazy(() => import('./legal/Contacto'))
const PeritajeTecnico = lazy(() => import('./pages/PeritajeTecnico'))
const Verify = lazy(() => import('./pages/Verify'))
const NotFound = lazy(() => import('./pages/NotFound'))

/* Toda la app vive en /panel. /app es un alias legado que redirige al panel nuevo. */
function AppRedirect() {
  window.location.replace('/panel')
  return null
}

/* Fallback mínimo mientras se descarga el chunk de la ruta (mismo fondo oscuro de la app) */
function RouteLoader() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0b0f' }}>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,.1)', borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
    <LangProvider>
      <ToastProvider>
        <BrowserRouter>
          <CookieBanner />
          <Suspense fallback={<RouteLoader />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
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
                <Route path="mi-dia" element={<PanelMiDia />} />
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
                <Route path="vencimientos" element={<PanelVencimientos />} />
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
                <Route path="paquetes" element={<PanelPaquetes />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </LangProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
