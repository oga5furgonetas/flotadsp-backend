import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Truck, Users, ScanSearch, Bell, AlertTriangle,
  Trophy, BarChart3, CalendarClock, KeyRound, Wrench, FileUp,
  FileText, Settings, Shield, LogOut, Zap,
} from 'lucide-react'
import { getAdmin, isAuthed, isSuperAdmin, logout } from './auth'

const NAV = [
  { group: 'Operación', items: [
    { to: '/panel', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/panel/flota', label: 'Flota', icon: Truck },
    { to: '/panel/conductores', label: 'Conductores', icon: Users },
    { to: '/panel/inspecciones', label: 'Inspecciones · IA', icon: ScanSearch },
  ]},
  { group: 'Alertas', items: [
    { to: '/panel/alertas', label: 'Alertas', icon: Bell },
    { to: '/panel/incidencias', label: 'Incidencias', icon: AlertTriangle },
  ]},
  { group: 'Rendimiento', items: [
    { to: '/panel/scorecard', label: 'Scorecard', icon: Trophy },
    { to: '/panel/metricas', label: 'Métricas · Reportes', icon: BarChart3 },
  ]},
  { group: 'Gestión', items: [
    { to: '/panel/turnos', label: 'Turnos', icon: CalendarClock },
    { to: '/panel/renting', label: 'Renting', icon: KeyRound },
    { to: '/panel/talleres', label: 'Talleres', icon: Wrench },
  ]},
  { group: 'Datos', items: [
    { to: '/panel/import-export', label: 'Import / Export', icon: FileUp },
    { to: '/panel/documentos', label: 'Documentos', icon: FileText },
  ]},
  { group: 'Cuenta', items: [
    { to: '/panel/ajustes', label: 'Ajustes', icon: Settings },
  ]},
]

export default function PanelLayout() {
  const nav = useNavigate()
  if (!isAuthed()) return <Navigate to="/panel/login" replace />
  const admin = getAdmin()

  const groups = NAV.map((g) => g)
  if (isSuperAdmin()) {
    groups[groups.length - 1] = {
      ...groups[groups.length - 1],
      items: [
        ...groups[groups.length - 1].items,
        { to: '/panel/admin', label: 'Admin', icon: Shield },
      ],
    }
  }

  function doLogout() {
    logout()
    nav('/panel/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-dark-950 text-dark-50">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-dark-800 bg-dark-900 md:flex">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600">
            <Zap size={18} className="text-white" />
          </div>
          <b className="text-base">FlotaDSP</b>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-dark-500">
                {g.group}
              </div>
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.end}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-brand-500/15 text-brand-300'
                        : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100'
                    }`
                  }
                >
                  <it.icon size={16} />
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-dark-800 bg-dark-900/60 px-5 py-3">
          <div className="text-sm text-dark-400">
            {admin?.name ? `Hola, ${admin.name}` : 'Panel'}
            {isSuperAdmin() && <span className="badge-orange ml-2">super-admin</span>}
          </div>
          <button onClick={doLogout} className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-sm">
            <LogOut size={15} /> Salir
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
