import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Trophy, Users, CalendarClock, BarChart3, Activity,
  CheckCircle2, ClipboardList, ClipboardCheck, Truck, Wrench, BellRing, KeyRound,
  Building2, BrainCircuit, FileUp, Settings, Shield, LogOut, Zap, Inbox,
  ChevronRight, ExternalLink, FileSpreadsheet, AlertTriangle, BookUser, Search, Sun,
  PackageSearch,
} from 'lucide-react'
import { getAdmin, isAuthed, isSuperAdmin, isCenterManager, logout, canSee, decodeToken } from './auth'
import TrialBanner from './TrialBanner'
import CommandPalette from './CommandPalette'
import LiveNotifier from './LiveNotifier'
import { useT, LANGS } from '../i18n'
import { usePlan } from '../lib/usePlan'

const keyOf = (to) => (to === '/panel' ? 'dashboard' : to.split('/').pop())

// Qué feature del plan requiere cada ruta (undefined = siempre visible)
const ROUTE_FEATURE = {
  scorecard: 'scorecard',
  chat: 'chat',
  asignacion: 'assignments',
  plantilla: 'assignments',
  'ia-peritaje': 'forensics',
  importaciones: 'export',
}

// Menú ÚNICO agrupado por intención (sin pestañas: todo el mapa visible siempre).
// Vencimientos fusiona en una página ITV + Renting + Casas de alquiler; las rutas
// antiguas siguen vivas (deep-links, paleta ⌘K) — solo cambia la navegación.
const NAV_DEF = [
  { g: 'nav.g.today', items: [
    { to: '/panel', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
    { to: '/panel/mi-dia', labelKey: 'nav.miDia', icon: Sun },
    { to: '/panel/actividad', labelKey: 'nav.activity', icon: Activity },
  ]},
  { g: 'nav.g.dailyops', items: [
    { to: '/panel/paquetes', labelKey: 'nav.pkgintel', icon: PackageSearch },
    { to: '/panel/asignacion', labelKey: 'nav.assign', icon: ClipboardCheck },
    { to: '/panel/checklist-operativo', labelKey: 'nav.checklist', icon: CheckCircle2 },
    { to: '/panel/plantilla', labelKey: 'nav.template', icon: FileSpreadsheet },
    { to: '/panel/chat', labelKey: 'nav.chat', icon: BellRing },
  ]},
  { g: 'nav.g.fleet', items: [
    { to: '/panel/vehiculos', labelKey: 'nav.vehicles', icon: Truck },
    { to: '/panel/revision', labelKey: 'nav.revision', icon: CheckCircle2 },
    { to: '/panel/inspecciones', labelKey: 'nav.inspections', icon: ClipboardList },
    { to: '/panel/incidencias', labelKey: 'nav.incidents', icon: AlertTriangle },
    { to: '/panel/talleres', labelKey: 'nav.workshops', icon: Wrench },
    { to: '/panel/vencimientos', labelKey: 'nav.grp.expiry', icon: CalendarClock },
    { to: '/panel/importaciones', labelKey: 'nav.imports', icon: FileUp },
  ]},
  { g: 'nav.g.team', items: [
    { to: '/panel/conductores', labelKey: 'nav.drivers', icon: Users },
    { to: '/panel/scorecard', labelKey: 'nav.scorecard', icon: Trophy },
    { to: '/panel/contactos', labelKey: 'nav.contacts', icon: BookUser },
  ]},
  { g: 'nav.g.system', items: [
    { to: '/panel/ia-peritaje', labelKey: 'nav.ai', icon: BrainCircuit },
    { to: '/panel/configuracion', labelKey: 'nav.settings', icon: Settings },
  ]},
]
// Rutas que ya no están en el menú pero siguen accesibles vía paleta/URL
const PALETTE_EXTRA = [
  { to: '/panel/avisos-itv', labelKey: 'nav.itvalerts', icon: BellRing, key: 'avisos-itv' },
  { to: '/panel/renting', labelKey: 'nav.renting', icon: KeyRound, key: 'renting' },
  { to: '/panel/casas-alquiler', labelKey: 'nav.rental', icon: Building2, key: 'casas-alquiler' },
]
const EXPIRY_KEYS = ['avisos-itv', 'renting', 'casas-alquiler']

export default function PanelLayout() {
  const nav = useNavigate()
  const loc = useLocation()
  const admin = getAdmin()
  const { lang, setLang, t } = useT()
  const { limits } = usePlan()
  const [center, setCenter] = useState(() => localStorage.getItem('panel_center') || 'Todos')
  const [cmdOpen, setCmdOpen] = useState(false)

  // Paleta de comandos global: Ctrl/Cmd+K
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

  // (El menú se calcula más abajo, tras conocer permisos y plan)

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

  useEffect(() => { localStorage.setItem('panel_center', center) }, [center])

  if (!isAuthed()) return <Navigate to="/panel/login" replace />

  const sa = isSuperAdmin()
  const cm = isCenterManager()
  const EQUIPO_KEYS = new Set(['asignacion', 'checklist-operativo', 'chat', 'plantilla'])

  // ¿Es visible este item con los permisos + plan actuales?
  const itemVisible = (it) => {
    const k = keyOf(it.to)
    if (k === 'vencimientos') return EXPIRY_KEYS.some((ek) => canSee(ek))
    if (!EQUIPO_KEYS.has(k) && !canSee(k)) return false
    const feat = ROUTE_FEATURE[k]
    if (feat && limits && limits[feat] === false) return false
    return true
  }
  // Menú agrupado (traducido) + lista plana para guard/paleta/móvil
  const groups = NAV_DEF
    .map((g) => ({ g: t(g.g), items: g.items.filter(itemVisible).map((it) => ({ ...it, label: t(it.labelKey) })) }))
    .filter((g) => g.items.length > 0)
  const flatItems = groups.flatMap((g) => g.items)

  // Guard de ruta: impide acceder por URL a un módulo no permitido.
  const curKey = keyOf(loc.pathname.replace(/\/+$/, '') || '/panel')
  const routeAllowed = (k) => {
    if (k === 'perfil' || k === 'login' || k === 'portal-conductor' || k === 'checklist-operativo' || k === 'chat' || k === 'plantilla' || k === 'mi-dia') return true
    if (k === 'vencimientos') return EXPIRY_KEYS.some((ek) => canSee(ek))
    if (k === 'admin' || k === 'bandeja') return sa
    if (k === 'usuarios') return sa || cm
    return canSee(k)
  }
  if (!routeAllowed(curKey)) {
    return <Navigate to={flatItems[0] ? flatItems[0].to : '/panel/perfil'} replace />
  }

  const showAdmin = sa

  function doLogout() {
    logout()
    nav('/panel/login', { replace: true })
  }

  // Paleta ⌘K: menú + rutas fusionadas (ITV/Renting/Alquiler directas) + admin
  const paletteBase = [
    ...flatItems,
    ...PALETTE_EXTRA.filter((p) => canSee(p.key)).map((p) => ({ ...p, label: t(p.labelKey) })),
  ]
  const palettePages = showAdmin
    ? [...paletteBase, { to: '/panel/admin', label: t('nav.business'), icon: Shield }, { to: '/panel/bandeja', label: t('nav.inbox'), icon: Inbox }]
    : paletteBase

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
      <aside className="hidden w-64 shrink-0 flex-col border-r border-dark-800/80 bg-gradient-to-b from-dark-900 to-dark-950 md:flex">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30">
            <Zap size={18} className="text-white" />
          </div>
          <b className="font-display text-base font-bold tracking-tight">FlotaDSP</b>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1">
          {groups.map((g) => (
            <div key={g.g}>
              <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-dark-600">
                {g.g}
              </div>
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.end}
                  className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
                >
                  <it.icon size={16} />
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
          {showAdmin && (
            <NavLink
              to="/panel/admin"
              className={({ isActive }) => `nav-item mt-1 ${isActive ? 'nav-item-active' : ''}`}
            >
              <Shield size={16} /> {t('nav.business')}
            </NavLink>
          )}
          {(showAdmin || cm) && (
            <NavLink
              to="/panel/usuarios"
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
            >
              <Users size={16} /> {t('nav.users')}
            </NavLink>
          )}
          {showAdmin && (
            <NavLink
              to="/panel/bandeja"
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
            >
              <Inbox size={16} /> {t('nav.inbox')}
            </NavLink>
          )}
        </nav>

        {/* Badge Fundador */}
        <div className="mx-3 mb-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">⭐</span>
            <span className="text-xs font-bold text-amber-400">{t('nav.founder')}</span>
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-amber-600">{t('nav.founder.sub')}</p>
        </div>

        {/* Portal Conductor */}
        <div className="border-t border-dark-800 p-3">
          <NavLink
            to="/panel/portal-conductor"
            className={({ isActive }) => `flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${isActive ? 'border-brand-500 bg-brand-500/20 text-brand-200' : 'border-brand-500/40 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20'}`}
          >
            <span className="flex items-center gap-2"><Shield size={15} /> {t('nav.portal')}</span>
            <ChevronRight size={14} />
          </NavLink>
          <div className="mt-2 flex items-center justify-between">
            <NavLink to="/panel/perfil" className="min-w-0 rounded-lg px-1 hover:bg-dark-800">
              <div className="truncate text-sm font-medium text-dark-100">{admin?.name || 'Admin'}</div>
              <div className="text-[11px] text-dark-500">{showAdmin ? `Super-admin · ${t('nav.profile')}` : `${t('nav.admin')} · ${t('nav.profile')}`}</div>
            </NavLink>
            <button onClick={doLogout} className="btn-ghost p-2" title={t('nav.logout')}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {impersonating && (
          <div className="flex items-center justify-between gap-2 bg-amber-500/15 px-4 py-2 text-sm text-amber-200">
            <span>{t('nav.impersonate')} <b>{admin?.name}</b> ({t('nav.client')}).</span>
            <button onClick={backToSuper} className="rounded-md bg-amber-500/30 px-3 py-1 text-xs font-semibold hover:bg-amber-500/40">{t('nav.back.super')}</button>
          </div>
        )}
        {decodeToken()?.demo && (
          <div className="flex items-center justify-between gap-2 bg-purple-500/15 px-4 py-2 text-sm text-purple-200">
            <span>▶ {t('demo.banner')}</span>
            <a href="/registro" className="rounded-md bg-purple-500/30 px-3 py-1 text-xs font-semibold hover:bg-purple-500/40">{t('demo.banner.cta')}</a>
          </div>
        )}
        <TrialBanner />
        <header className="glass flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <div className="hidden text-sm text-dark-400 md:block">
            {flatItems.find((it) => (it.end ? loc.pathname === it.to : loc.pathname.startsWith(it.to)))?.label || ''}
          </div>

          {/* Paleta de comandos (Ctrl+K) */}
          <button
            onClick={() => setCmdOpen(true)}
            className="ml-auto flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-800/70 px-3 py-1.5 text-xs text-dark-400 transition-colors hover:border-dark-600 hover:text-dark-200"
            title="Ctrl+K"
          >
            <Search size={13} />
            <span className="hidden sm:inline">{t('cmdk.hint')}…</span>
            <kbd className="kbd hidden sm:inline-flex">Ctrl K</kbd>
          </button>

          {/* Selector de idioma */}
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="rounded-lg border border-dark-700 bg-dark-800 px-2 py-1 text-xs font-semibold text-dark-300 focus:outline-none"
            title="Idioma"
          >
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          {/* Filtro de CENTRO — si solo tiene 1 centro asignado se muestra fijo */}
          <div className="flex items-center gap-1 rounded-lg bg-dark-800/60 p-1">
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
                  {c === 'Todos' ? t('nav.all') : c}
                </button>
              ))
            )}
          </div>
        </header>

        {/* navegación móvil rápida */}
        <div className="flex gap-1 overflow-x-auto border-b border-dark-800 px-3 py-2 md:hidden">
          {flatItems.map((it) => (
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

        <main key={loc.pathname} className="animate-fade-in flex-1 overflow-y-auto p-4 pb-24 md:p-5 md:pb-5">
          <Outlet context={{ center, centers, admin }} />
        </main>
      </div>

      {/* Barra de navegación inferior — solo móvil (sensación de app nativa) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-dark-800 bg-dark-900/95 backdrop-blur-md md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {[
          { to: '/panel', label: t('nav.dashboard'), icon: LayoutDashboard, end: true },
          { to: '/panel/revision', label: t('nav.revision'), icon: CheckCircle2 },
          { to: '/panel/asignacion', label: t('nav.assign'), icon: ClipboardCheck },
          { to: '/panel/chat', label: t('nav.chat'), icon: BellRing },
          { to: '/panel/vehiculos', label: t('nav.vehicles'), icon: Truck },
        ].map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${
                isActive ? 'text-brand-400' : 'text-dark-500'
              }`}>
            <it.icon size={19} />
            <span className="max-w-full truncate px-1">{it.label}</span>
          </NavLink>
        ))}
      </nav>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} pages={palettePages} />
      <LiveNotifier center={center} centers={centers} />
    </div>
  )
}
