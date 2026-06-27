import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Trophy, Users, CalendarClock, BarChart3, Activity,
  CheckCircle2, ClipboardList, ClipboardCheck, Truck, Wrench, BellRing, KeyRound,
  Building2, BrainCircuit, FileUp, Settings, Shield, LogOut, Zap, Inbox,
  ChevronRight, ExternalLink, FileSpreadsheet,
} from 'lucide-react'
import { getAdmin, isAuthed, isSuperAdmin, isCenterManager, logout, canSee } from './auth'
import TrialBanner from './TrialBanner'

const keyOf = (to) => (to === '/panel' ? 'dashboard' : to.split('/').pop())

// Menú real (3 pestañas: operacional, equipo, furgonetas)
const TABS = {
  operacional: {
    label: 'Operacional',
    items: [
      { to: '/panel', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/panel/scorecard', label: 'Scorecard', icon: Trophy },
      { to: '/panel/conductores', label: 'Conductores', icon: Users },
      { to: '/panel/actividad', label: 'Actividad', icon: Activity },
    ],
  },
  equipo: {
    label: 'Equipo',
    items: [
      { to: '/panel/asignacion', label: 'Asignación diaria', icon: ClipboardCheck },
      { to: '/panel/checklist-operativo', label: 'Checklist turno', icon: CheckCircle2 },
      { to: '/panel/chat', label: 'Chat interno', icon: BellRing },
      { to: '/panel/plantilla', label: 'Plantilla turno', icon: FileSpreadsheet },
    ],
  },
  furgonetas: {
    label: 'Furgonetas',
    items: [
      { to: '/panel/revision', label: 'Revisión rápida', icon: CheckCircle2 },
      { to: '/panel/inspecciones', label: 'Inspecciones', icon: ClipboardList },
      { to: '/panel/vehiculos', label: 'Vehículos', icon: Truck },
      { to: '/panel/talleres', label: 'Talleres', icon: Wrench },
      { to: '/panel/avisos-itv', label: 'Avisos ITV', icon: BellRing },
      { to: '/panel/renting', label: 'Renting', icon: KeyRound },
      { to: '/panel/casas-alquiler', label: 'Casas de alquiler', icon: Building2 },
      { to: '/panel/ia-peritaje', label: 'IA Peritaje', icon: BrainCircuit },
      { to: '/panel/importaciones', label: 'Importaciones', icon: FileUp },
      { to: '/panel/configuracion', label: 'Configuración', icon: Settings },
    ],
  },
}

export default function PanelLayout() {
  const nav = useNavigate()
  const loc = useLocation()
  const admin = getAdmin()
  const [tab, setTab] = useState(() => localStorage.getItem('panel_tab') || 'furgonetas')
  const [center, setCenter] = useState(() => localStorage.getItem('panel_center') || 'Todos')

  // Centros DINÁMICOS de este DSP (multi-tenant: nunca hardcodeado)
  // Centros visibles: si allowed_centers es una lista, filtra; si no, todos los de la org.
  const allCenters = Array.isArray(admin?.centers) ? admin.centers : []
  const allowed = Array.isArray(admin?.allowed_centers) ? admin.allowed_centers : null
  const centers = allowed ? allCenters.filter((c) => allowed.includes(c)) : allCenters

  // Si el usuario tiene exactamente 1 centro asignado, forzamos ese centro automáticamente
  const singleCenter = centers.length === 1 ? centers[0] : null

  useEffect(() => {
    if (singleCenter && center !== singleCenter) setCenter(singleCenter)
  }, [singleCenter]) // eslint-disable-line

  useEffect(() => { localStorage.setItem('panel_tab', tab) }, [tab])
  useEffect(() => { localStorage.setItem('panel_center', center) }, [center])

  if (!isAuthed()) return <Navigate to="/panel/login" replace />

  // Guard de ruta: impide acceder por URL a un módulo no permitido.
  const curKey = keyOf(loc.pathname.replace(/\/+$/, '') || '/panel')
  const sa = isSuperAdmin()
  const cm = isCenterManager()
  const routeAllowed = (k) => {
    if (k === 'perfil' || k === 'login' || k === 'portal-conductor' || k === 'checklist-operativo' || k === 'chat' || k === 'plantilla') return true
    if (k === 'admin' || k === 'bandeja') return sa
    if (k === 'usuarios') return sa || cm
    return canSee(k)
  }
  if (!routeAllowed(curKey)) {
    const firstAllowed = [...TABS.operacional.items, ...TABS.furgonetas.items].find((it) => canSee(keyOf(it.to)))
    return <Navigate to={firstAllowed ? firstAllowed.to : '/panel/perfil'} replace />
  }

  // Portal Conductor ahora es una página interna del panel: /panel/portal-conductor

  const EQUIPO_KEYS = new Set(['asignacion', 'checklist-operativo', 'chat', 'plantilla'])
  const items = TABS[tab].items.filter((it) => {
    const k = keyOf(it.to)
    return EQUIPO_KEYS.has(k) || canSee(k)
  })
  const showAdmin = sa

  function doLogout() {
    logout()
    nav('/panel/login', { replace: true })
  }

  const impersonating = !!localStorage.getItem('flotadsp_token_super')
  function backToSuper() {
    const superTok = localStorage.getItem('flotadsp_token_super')
    if (superTok) {
      localStorage.setItem('flotadsp_token', superTok)
      localStorage.removeItem('flotadsp_token_super')
      localStorage.removeItem('flotadsp_admin')
    }
    window.location.href = '/panel/admin'
  }

  return (
    <div className="flex min-h-screen bg-dark-950 text-dark-50">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-dark-800 bg-dark-900 md:flex">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600">
            <Zap size={18} className="text-white" />
          </div>
          <b className="text-base">FlotaDSP</b>
        </div>

        {/* Pestañas Operacional / Furgonetas */}
        <div className="mx-3 mb-2 grid grid-cols-3 gap-1 rounded-lg bg-dark-800/60 p-1">
          {Object.entries(TABS).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                tab === k ? 'bg-brand-500/20 text-brand-300' : 'text-dark-400 hover:text-dark-200'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  isActive ? 'bg-brand-500/15 text-brand-300' : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100'
                }`
              }
            >
              <it.icon size={16} />
              {it.label}
            </NavLink>
          ))}
          {showAdmin && (
            <NavLink
              to="/panel/admin"
              className={({ isActive }) =>
                `mt-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  isActive ? 'bg-brand-500/15 text-brand-300' : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100'
                }`
              }
            >
              <Shield size={16} /> Negocio (super-admin)
            </NavLink>
          )}
          {(showAdmin || cm) && (
            <NavLink
              to="/panel/usuarios"
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  isActive ? 'bg-brand-500/15 text-brand-300' : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100'
                }`
              }
            >
              <Users size={16} /> Usuarios
            </NavLink>
          )}
          {showAdmin && (
            <NavLink
              to="/panel/bandeja"
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  isActive ? 'bg-brand-500/15 text-brand-300' : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100'
                }`
              }
            >
              <Inbox size={16} /> Bandeja
            </NavLink>
          )}
        </nav>

        {/* Portal Conductor — página interna del panel (multi-tenant, sin exponer token) */}
        <div className="border-t border-dark-800 p-3">
          <NavLink
            to="/panel/portal-conductor"
            className={({ isActive }) => `flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${isActive ? 'border-brand-500 bg-brand-500/20 text-brand-200' : 'border-brand-500/40 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20'}`}
          >
            <span className="flex items-center gap-2"><Shield size={15} /> Portal Conductor</span>
            <ChevronRight size={14} />
          </NavLink>
          <div className="mt-2 flex items-center justify-between">
            <NavLink to="/panel/perfil" className="min-w-0 rounded-lg px-1 hover:bg-dark-800">
              <div className="truncate text-sm font-medium text-dark-100">{admin?.name || 'Admin'}</div>
              <div className="text-[11px] text-dark-500">{showAdmin ? 'Super-admin · ver perfil' : 'Administrador · ver perfil'}</div>
            </NavLink>
            <button onClick={doLogout} className="btn-ghost p-2" title="Salir"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {impersonating && (
          <div className="flex items-center justify-between gap-2 bg-amber-500/15 px-4 py-2 text-sm text-amber-200">
            <span>Estás viendo como <b>{admin?.name}</b> (cliente).</span>
            <button onClick={backToSuper} className="rounded-md bg-amber-500/30 px-3 py-1 text-xs font-semibold hover:bg-amber-500/40">← Volver a super-admin</button>
          </div>
        )}
        <TrialBanner />
        <header className="flex items-center justify-between gap-3 border-b border-dark-800 bg-dark-900/60 px-4 py-2.5">
          {/* selector de pestaña en móvil (sin sidebar) */}
          <div className="flex items-center gap-2 md:hidden">
            <select className="select w-auto py-1.5 text-sm" value={tab} onChange={(e) => setTab(e.target.value)}>
              {Object.entries(TABS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="hidden text-sm text-dark-400 md:block">{TABS[tab].label}</div>

          {/* Filtro de CENTRO — si solo tiene 1 centro asignado se muestra fijo */}
          <div className="ml-auto flex items-center gap-1 rounded-lg bg-dark-800/60 p-1">
            {singleCenter ? (
              <span className="rounded-md bg-brand-500/20 px-3 py-1 text-xs font-semibold text-brand-300">
                {singleCenter}
              </span>
            ) : (
              ['Todos', ...centers].map((c) => (
                <button
                  key={c}
                  onClick={() => setCenter(c)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    center === c ? 'bg-brand-500/20 text-brand-300' : 'text-dark-400 hover:text-dark-200'
                  }`}
                >
                  {c}
                </button>
              ))
            )}
          </div>
        </header>

        {/* navegación móvil rápida */}
        <div className="flex gap-1 overflow-x-auto border-b border-dark-800 px-3 py-2 md:hidden">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-3 py-1 text-xs ${
                  isActive ? 'bg-brand-500/20 text-brand-300' : 'bg-dark-800 text-dark-300'
                }`
              }
            >
              {it.label}
            </NavLink>
          ))}
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-5">
          <Outlet context={{ center, centers, admin }} />
        </main>
      </div>
    </div>
  )
}
