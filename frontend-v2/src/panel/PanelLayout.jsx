import { useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Trophy, Users, CalendarClock, CalendarCheck, BarChart3, Activity,
  CheckCircle2, ClipboardList, ClipboardCheck, Truck, Wrench, BellRing, KeyRound,
  Building2, BrainCircuit, FileUp, Settings, Shield, LogOut, Zap, Inbox,
  ChevronRight, ChevronDown, ExternalLink, FileSpreadsheet, AlertTriangle, BookUser, Search, Sun, Moon, Contrast,
  PackageX,
  PackageSearch, PackageCheck, MapPin, Timer, MapPinned, UserCircle2, Languages, ShieldAlert, LifeBuoy, Menu, CircleHelp,
} from 'lucide-react'
import { getAdmin, isAuthed, isSuperAdmin, isCenterManager, logout, canSee, decodeToken, getVisibleCenters, SIEMPRE_VISIBLES, guardarAccesoFresco } from './auth'
import { getMe, contarPeticionesPendientes } from './api'
import TrialBanner from './TrialBanner'
import CommandPalette from './CommandPalette'
import { BotonAyuda, PanelAyuda, PrimerosPasos } from './Ayuda'
import LiveNotifier from './LiveNotifier'
import MenuMovil from './components/MenuMovil'
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
// Cada grupo tiene identidad propia: icono en chip de color + etiqueta grande.
/* ── AVISOS DEL MENU ───────────────────────────────────────────────────────
   Ruta -> cuantas cosas hay esperando respuesta en ella. Se pinta en rojo al
   lado del nombre. Vive aparte del menu para que anadir un aviso nuevo sea una
   linea y no haya que tocar el render. */
const AVISOS = {
  '/panel/turnos': ({ peticionesPend }) => peticionesPend,
}

const NAV_DEF = [
  { g: 'nav.g.today', gIcon: Sun, iconCls: 'text-amber-400', iconBg: 'bg-amber-500/10', items: [
    { to: '/panel', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
    { to: '/panel/mi-dia', labelKey: 'nav.miDia', icon: Sun },
    { to: '/panel/actividad', labelKey: 'nav.activity', icon: Activity },
  ]},
  // Nada mas: aqui solo va lo que hay que CONTESTAR, no lo que hay que hacer.
  // Un numero rojo permanente en el menu deja de mirarse a los dos dias.
  { g: 'nav.g.dailyops', gIcon: Zap, iconCls: 'text-sky-400', iconBg: 'bg-sky-500/10', items: [
    { to: '/panel/paquetes', labelKey: 'nav.pkgintel', icon: PackageSearch },
    { to: '/panel/apoyo', labelKey: 'nav.apoyo', icon: LifeBuoy },
    { to: '/panel/debrief', labelKey: 'nav.debrief', icon: PackageCheck },
    { to: '/panel/asignacion', labelKey: 'nav.assign', icon: ClipboardCheck },
    // El cuadrante y las peticiones de días llevaban meses construidos y sin
    // entrada en el menú: la ruta existía, la página también, y sólo se
    // llegaba escribiendo la URL. Una pantalla que no está en el menú no
    // existe para quien la necesita.
    { to: '/panel/turnos', labelKey: 'nav.shifts', icon: CalendarCheck },
    { to: '/panel/checklist-operativo', labelKey: 'nav.checklist', icon: CheckCircle2 },
    { to: '/panel/plantilla', labelKey: 'nav.template', icon: FileSpreadsheet },
    /* El chat interno sale del menú: 8 mensajes desde que existe y 0 en los
       últimos 30 días. No es un fallo, es una respuesta — ese trabajo se hace
       por WhatsApp. La página y la ruta siguen vivas y se llega por ⌘K, así
       que no se pierde nada; lo que se quita es una entrada permanente que
       nadie pulsa. Descomentar si algún día se usa de verdad.
    { to: '/panel/chat', labelKey: 'nav.chat', icon: BellRing }, */
  ]},
  { g: 'nav.g.fleet', gIcon: Truck, iconCls: 'text-emerald-400', iconBg: 'bg-emerald-500/10', items: [
    { to: '/panel/vehiculos', labelKey: 'nav.vehicles', icon: Truck },
    { to: '/panel/revision', labelKey: 'nav.revision', icon: CheckCircle2 },
    { to: '/panel/inspecciones', labelKey: 'nav.inspections', icon: ClipboardList },
    { to: '/panel/incidencias', labelKey: 'nav.incidents', icon: AlertTriangle },
    { to: '/panel/talleres', labelKey: 'nav.workshops', icon: Wrench },
    { to: '/panel/ordenes', labelKey: 'nav.ordenes', icon: Wrench },
    { to: '/panel/aparcamiento', labelKey: 'nav.parking', icon: MapPin },
    { to: '/panel/vencimientos', labelKey: 'nav.grp.expiry', icon: CalendarClock },
    { to: '/panel/importaciones', labelKey: 'nav.imports', icon: FileUp },
  ]},
  { g: 'nav.g.team', gIcon: Users, iconCls: 'text-violet-400', iconBg: 'bg-violet-500/10', items: [
    { to: '/panel/conductores', labelKey: 'nav.drivers', icon: Users },
    { to: '/panel/scorecard', labelKey: 'nav.scorecard', icon: Trophy },
    { to: '/panel/diarios', labelKey: 'nav.diarios', icon: PackageX },
    { to: '/panel/whc', labelKey: 'nav.whc', icon: Timer },
    { to: '/panel/dsc', labelKey: 'nav.dsc', icon: MapPinned },
    { to: '/panel/contactos', labelKey: 'nav.contacts', icon: BookUser },
  ]},
  { g: 'nav.g.system', gIcon: Settings, iconCls: 'text-dark-300', iconBg: 'bg-white/[0.07]', items: [
    { to: '/panel/origen-danos', labelKey: 'nav.origen', icon: ShieldAlert },
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

/* ── MENU DE USUARIO ───────────────────────────────────────────────────────
   Arriba a la derecha, que es donde lo busca todo el mundo. Antes vivia al
   FONDO del sidebar, debajo de treinta entradas de menu: para cerrar sesion o
   cambiar de idioma habia que bajar toda la barra.

   Se cierra al pulsar fuera y con Escape. Sin lo segundo, en un portatil con
   el trackpad ocupado hay que buscar un hueco vacio de la pantalla para
   cerrarlo, y en esta app casi no hay huecos vacios. */
function MenuUsuario({ admin, showAdmin, lang, setLang, langs, onLogout, t }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false) }
    const esc = (e) => { if (e.key === 'Escape') setAbierto(false) }
    // `pointerdown` y no `mousedown`: en un movil, tocar fuera de un menu no
    // siempre dispara los eventos de raton, y el desplegable se quedaba
    // abierto sin forma de cerrarlo mas que recargando.
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  // Iniciales del nombre. Con una sola palabra se cogen sus dos primeras
  // letras: 'D' solo en un circulo no identifica a nadie.
  const nombre = admin?.name || 'Admin'
  const trozos = nombre.trim().split(/\s+/).filter(Boolean)
  const iniciales = (trozos.length > 1
    ? trozos[0][0] + trozos[1][0]
    : nombre.slice(0, 2)).toUpperCase()

  return (
    <div className="relative" ref={caja}>
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className={`flex items-center gap-2 rounded-lg border px-1.5 py-1 transition-colors ${
          abierto ? 'border-dark-600 bg-dark-800' : 'border-transparent hover:bg-dark-800/70'}`}
      >
        <span className="grid h-7 w-7 flex-none place-items-center rounded-md bg-brand-400 text-[11px] font-bold"
              style={{ color: 'rgb(var(--brand-tinta))' }}>
          {iniciales}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[130px] truncate text-[12.5px] font-semibold text-dark-100">{nombre}</span>
          <span className="block text-[10.5px] text-dark-500">
            {showAdmin ? 'Super-admin' : t('nav.admin')}
          </span>
        </span>
        <ChevronDown size={13} className={`flex-none text-dark-400 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div role="menu"
             className="absolute right-0 z-50 mt-1.5 w-[min(15rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-dark-700 bg-dark-900 shadow-xl shadow-black/40">
          <div className="border-b border-dark-800 px-3 py-2.5">
            <p className="truncate text-[13px] font-semibold text-dark-100">{nombre}</p>
            <p className="truncate text-[11px] text-dark-500">
              {showAdmin ? 'Super-admin' : t('nav.admin')}
            </p>
          </div>

          <NavLink to="/panel/perfil" onClick={() => setAbierto(false)} role="menuitem"
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-dark-200 hover:bg-dark-800">
            <UserCircle2 size={15} className="text-dark-400" /> {t('nav.profile')}
          </NavLink>
          <NavLink to="/panel/portal-conductor" onClick={() => setAbierto(false)} role="menuitem"
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-dark-200 hover:bg-dark-800">
            <Shield size={15} className="text-dark-400" /> {t('nav.portal')}
          </NavLink>

          {/* El idioma vive aqui y no suelto en la barra: se cambia una vez y
              ocupaba sitio fijo en una cabecera que ya iba llena. */}
          <div className="flex items-center gap-2.5 border-t border-dark-800 px-3 py-2">
            <Languages size={15} className="flex-none text-dark-400" />
            <select value={lang} onChange={(e) => setLang(e.target.value)}
              className="w-full rounded-md border border-dark-700 bg-dark-800 px-2 py-1 text-[12.5px] font-medium text-dark-200 focus:outline-none">
              {Object.entries(langs).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <button onClick={() => { setAbierto(false); onLogout() }} role="menuitem"
            className="flex w-full items-center gap-2.5 border-t border-dark-800 px-3 py-2 text-left text-[13px] text-dark-200 hover:bg-dark-800">
            <LogOut size={15} className="text-dark-400" /> {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  )
}


export default function PanelLayout() {
  const nav = useNavigate()
  const loc = useLocation()
  const admin = getAdmin()
  const { lang, setLang, t } = useT()
  const { limits } = usePlan()
  const [center, setCenter] = useState(() => localStorage.getItem('panel_center') || 'Todos')
  const [cmdOpen, setCmdOpen] = useState(false)
  const [ayudaOpen, setAyudaOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  /* La tecla `?` abre la ficha de la pantalla actual. Se ignora si el foco
     esta en un campo de texto: en un buscador, `?` es un caracter, no un
     atajo, y robarselo hace que la app parezca rota. */
  useEffect(() => {
    const h = (e) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return
      const el = document.activeElement
      const tag = (el?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return
      e.preventDefault()
      setAyudaOpen(true)
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

  /* Tres temas, y la rampa vive en variables CSS:
       hibrido — raíl y cabecera en negro, contenido en claro (por defecto)
       dark    — todo oscuro
       light   — todo claro, raíl incluido
     El híbrido es el que se pidió al ver el cuadre del debrief, y es el que
     mejor separa "dónde estoy" (el raíl) de "qué estoy mirando" (el papel). */
  const [theme, setTheme] = useState(() => {
    /* MIGRACION DE UNA SOLA VEZ, Y HACE FALTA.
       El codigo anterior guardaba 'dark' en localStorage AL MONTAR, sin que
       nadie eligiera nada. Asi que todo el mundo tiene un tema guardado
       aunque nunca haya tocado el boton, y un simple `|| 'hibrido'` como
       defecto no lo habria visto NADIE: el valor guardado gana siempre.
       Se distingue lo elegido a mano —que se respeta— de lo que se escribio
       solo, con una marca aparte que solo pone el boton. */
    try {
      const elegido = localStorage.getItem('panel_theme_elegido')
      const guardado = localStorage.getItem('panel_theme')
      if (elegido) return guardado || 'hibrido'
      return 'hibrido'
    } catch { return 'hibrido' }
  })
  useEffect(() => {
    document.documentElement.setAttribute('data-panel-theme', theme)
    localStorage.setItem('panel_theme', theme)
  }, [theme])

  // Grupos del menú plegables (persisten cerrados entre sesiones)
  const [closedGroups, setClosedGroups] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('nav_closed') || '[]')) } catch { return new Set() }
  })
  function toggleGroup(key) {
    setClosedGroups((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      localStorage.setItem('nav_closed', JSON.stringify([...next]))
      return next
    })
  }

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

  // Centros DINÁMICOS de este DSP (multi-tenant: nunca hardcodeado).
  // El cálculo vive en auth.js porque tiene que salir del JWT: el blob de
  // localStorage se puede haber quedado a medias y aquí eso se traducía en un
  // panel con un solo botón "Todos" y sin datos.
  const centers = getVisibleCenters()

  // Si el usuario tiene exactamente 1 centro asignado, forzamos ese centro automáticamente
  const singleCenter = centers.length === 1 ? centers[0] : null

  useEffect(() => {
    if (singleCenter && center !== singleCenter) setCenter(singleCenter)
  }, [singleCenter]) // eslint-disable-line

  // Un centro guardado que ya no se puede ver (otro usuario en el mismo
  // ordenador, o permisos recortados) dejaba al panel pidiendo un centro
  // prohibido: 403 en todo y pantallas vacías, sin forma de arreglarlo desde la
  // interfaz porque ese centro ni siquiera aparecía como botón.
  useEffect(() => {
    if (center !== 'Todos' && centers.length && !centers.includes(center)) setCenter('Todos')
  }, [center, centers.join('|')]) // eslint-disable-line

  useEffect(() => { localStorage.setItem('panel_center', center) }, [center])

  /* ── PETICIONES DE DIAS SIN CONTESTAR, EN EL MENU ────────────────────────
     Dani: "si tengo 1 persona por contestar pon 1, si tengo 2 personas pero 3
     solicitudes pon 3, en rojo, para que nunca se me pase".

     Se cuentan PETICIONES y no personas: hay que contestar tres veces. El aviso
     tiene que verse desde CUALQUIER pantalla —por eso vive aqui y no en la
     pagina de Días libres, donde solo lo veria quien ya ha entrado a mirar, que
     es justo el que no lo necesita.

     Se vuelve a preguntar cada 2 minutos y al volver a la pestana, con el mismo
     patron que los permisos. Si la peticion falla NO se pone a cero: se deja el
     ultimo numero bueno, porque un cero falso es la unica respuesta que hace
     que alguien deje de mirar. */
  const [peticionesPend, setPeticionesPend] = useState(0)
  useEffect(() => {
    if (!isAuthed()) return
    let vivo = true
    const mirar = () => {
      if (!vivo || !isAuthed() || document.hidden) return
      contarPeticionesPendientes(center)
        .then((r) => { if (vivo) setPeticionesPend(r.data?.pendientes || 0) })
        .catch(() => {})
    }
    mirar()
    const id = setInterval(mirar, 120000)
    document.addEventListener('visibilitychange', mirar)
    return () => {
      vivo = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', mirar)
    }
  }, [center])

  /* Permisos frescos al abrir el panel.

     El JWT dura 72 h y lleva dentro los permisos del momento del login, asi que
     quitarle un modulo a alguien no se le notaba hasta que cerraba sesion: la
     pantalla de Usuarios decia "guardado" y el menu del otro seguia igual.
     Aqui se le pregunta al servidor y se re-pinta solo si algo ha cambiado.
     Un 401 aqui ya lo trata el interceptor de axios (cierra sesion). */
  const [, setAccesoTick] = useState(0)
  useEffect(() => {
    if (!isAuthed()) return
    let vivo = true
    const mirar = () => {
      if (!vivo || !isAuthed() || document.hidden) return
      getMe()
        .then((r) => { if (vivo && guardarAccesoFresco(r.data)) setAccesoTick((n) => n + 1) })
        .catch(() => {})
    }
    mirar()
    /* NO SOLO AL ABRIR. Antes esto corria una vez al montar el panel, asi que
       quien tuviera la pestaña abierta seguia con los permisos viejos hasta
       recargar: se le daba acceso a un modulo, no le aparecia, y parecia que
       el guardado no habia funcionado.

       Dos disparadores baratos y suficientes:
        · al volver a la pestaña, que es cuando la gente mira despues de que
          le digan "ya te lo he puesto";
        · y cada 2 minutos de fondo, para el que la deja abierta todo el dia.
       Solo se re-pinta si algo CAMBIA de verdad (`guardarAccesoFresco`
       devuelve false si la respuesta es identica), asi que no parpadea. */
    const alVolver = () => { if (!document.hidden) mirar() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    const reloj = setInterval(mirar, 120000)
    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
      clearInterval(reloj)
    }
  }, [])

  if (!isAuthed()) return <Navigate to="/panel/login" replace />

  const sa = isSuperAdmin()
  const cm = isCenterManager()

  // ¿Es visible este item con los permisos + plan actuales?
  const itemVisible = (it) => {
    const k = keyOf(it.to)
    if (k === 'vencimientos') return EXPIRY_KEYS.some((ek) => canSee(ek))
    // Las órdenes de taller van con Talleres: quien puede ver los talleres
    // puede ver lo que está en ellos. Sin esto, `canSee('ordenes')` es false
    // para todo el que tenga permisos definidos —el permiso no existe en
    // ninguna lista— y la entrada desaparecía del menú sin ningún error.
    if (k === 'ordenes') return canSee('talleres')
    if (!SIEMPRE_VISIBLES.has(k) && !canSee(k)) return false
    const feat = ROUTE_FEATURE[k]
    if (feat && limits && limits[feat] === false) return false
    return true
  }
  // Menú agrupado (traducido) + lista plana para guard/paleta/móvil
  const groups = NAV_DEF
    .map((g) => ({ ...g, key: g.g, g: t(g.g), items: g.items.filter(itemVisible).map((it) => ({
      ...it, label: t(it.labelKey),
      // El aviso se cuelga aqui, del sitio donde ya se traduce el menu, para
      // que cualquier entrada futura solo tenga que anadir su clave a AVISOS.
      aviso: AVISOS[it.to] ? AVISOS[it.to]({ peticionesPend }) : 0,
    })) }))
    .filter((g) => g.items.length > 0)
  const flatItems = groups.flatMap((g) => g.items)

  // Guard de ruta: impide acceder por URL a un módulo no permitido.
  const curKey = keyOf(loc.pathname.replace(/\/+$/, '') || '/panel')
  const routeAllowed = (k) => {
    // Pantallas propias del usuario, sin permiso que valga.
    if (k === 'perfil' || k === 'login' || k === 'portal-conductor') return true
    // Y las de la operación diaria, de la MISMA lista que usa el menú: si el
    // menú la enseña, la ruta abre; si el menú la esconde, la ruta no abre.
    if (SIEMPRE_VISIBLES.has(k)) return true
    if (k === 'vencimientos') return EXPIRY_KEYS.some((ek) => canSee(ek))
    if (k === 'ordenes') return canSee('talleres')
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
    <div className="atmosphere flex min-h-screen text-dark-50">
      {/* Sidebar — raíl flotante de vidrio */}
      <aside className="hidden w-[248px] shrink-0 flex-col p-3 pr-0 md:flex">
      <div className="rail flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 pb-3 pt-5">
          {/* El monograma FD de la marca, en vez del rayo genérico. */}
          <img
            src="/logo-fd-marca.png" alt="" width="28" height="28"
            className="h-7 w-7 shrink-0 rounded-lg object-cover"
          />
          <b className="font-display text-[15px] font-semibold tracking-tight">FlotaDSP</b>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1">
          {groups.map((g) => {
            const isClosed = closedGroups.has(g.key)
            // Si el grupo cerrado contiene la ruta activa, se marca con un punto
            const holdsActive = isClosed && g.items.some((it) =>
              it.end ? loc.pathname === it.to : loc.pathname.startsWith(it.to))
            return (
              <div key={g.key} className="pt-1.5 first:pt-0">
                <button onClick={() => toggleGroup(g.key)} className="nav-ghead group">
                  <span className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg ${g.iconBg}`}>
                    <g.gIcon size={14} className={g.iconCls} />
                  </span>
                  <span className={`text-[13px] font-semibold tracking-tight transition-colors ${isClosed ? 'text-dark-400 group-hover:text-dark-200' : 'text-dark-100'}`}>
                    {g.g}
                  </span>
                  {holdsActive && <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />}
                  <ChevronDown
                    size={14}
                    className={`ml-auto shrink-0 text-dark-500 transition-transform duration-300 group-hover:text-dark-300 ${isClosed ? '-rotate-90' : ''}`}
                    style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1.15, 0.32, 1)' }}
                  />
                </button>
                {/* Plegado con física vía max-height (grid-template-rows no
                    anima en todos los Chromium): nada aparece de golpe */}
                <div
                  className="overflow-hidden transition-[max-height,opacity] duration-300"
                  style={{
                    maxHeight: isClosed ? 0 : g.items.length * 40 + 12,
                    opacity: isClosed ? 0 : 1,
                    transitionTimingFunction: 'cubic-bezier(0.22, 1.15, 0.32, 1)',
                  }}
                >
                  {/* Línea guía: los ítems cuelgan del grupo, como un árbol */}
                  <div className="ml-[14px] space-y-0.5 border-l border-white/[0.06] pb-1 pl-2.5">
                    {g.items.map((it) => (
                      <NavLink
                        key={it.to}
                        to={it.to}
                        end={it.end}
                        className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
                      >
                        <it.icon size={16} />
                        {it.label}
                        {/* En rojo y no en ambar a proposito: esto es trabajo
                            parado esperando una respuesta, no un aviso de que
                            algo va justo. `ml-auto` lo manda al borde derecho
                            para que la columna de numeros se lea de un vistazo
                            sin tener que buscarlos entre los nombres.
                            Y red-600, no red-500: el checker de contraste midio
                            el blanco sobre red-500 en 3,76:1, por debajo del 4,5
                            de la WCAG, y a 11 px eso se lee mal de verdad. */}
                        {it.aviso > 0 && (
                          <span className="ml-auto min-w-[20px] rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white"
                            title={`${it.aviso} ${it.aviso === 1 ? 'petición sin contestar' : 'peticiones sin contestar'}`}>
                            {it.aviso > 99 ? '99+' : it.aviso}
                          </span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
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
        {/* MEDIDA A 375 px EL 02-09-2026: esta cabecera medía 479 y no tenía
            scroll, asi que los 104 px que sobraban se quedaban FUERA de la
            pantalla — y ahi vivia el avatar, con «Perfil» y «Cerrar sesion»
            dentro. En un movil no habia forma de llegar a ellos.
            Reparto nuevo: el boton de menu y el avatar no se mueven nunca
            (`flex-none`), el selector de centro se queda con lo que sobra y
            hace scroll el solo (`min-w-0`), y buscar/ayuda/tema se van al menu,
            que es donde se busca lo que se usa poco. */}
        {/* `relative z-30` NO es decoracion: sin el, el desplegable del avatar se
            pintaba DEBAJO del contenido de la pagina y no se podia pulsar.
            El motivo es de CSS puro y no se ve leyendo el JSX: `backdrop-blur`
            convierte la cabecera en un contexto de apilado propio, asi que el
            `z-50` de dentro solo compite con sus hermanos DE DENTRO; fuera, la
            cabecera valia `auto` y `main`, que va despues en el DOM, ganaba.
            Medido en un movil el 02-09-2026 con `elementFromPoint` sobre el
            boton «Salir»: devolvia el titular de la pagina, no el boton. Se
            veian las dos cosas superpuestas y no habia forma de cerrar sesion. */}
        <header className="relative z-30 flex items-center gap-2 border-b border-white/[0.05] bg-transparent px-3 py-2.5 backdrop-blur-md md:gap-3 md:px-4">
          {/* La puerta del menu tambien arriba: en iOS la barra de abajo se
              queda debajo del navegador y no siempre se ve. */}
          <button
            onClick={() => setMenuOpen(true)}
            aria-label={t('nav.menu')}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-dark-700 bg-dark-800/70 text-dark-300 active:bg-dark-800 md:hidden">
            <Menu size={18} />
          </button>

          <div className="hidden text-sm text-dark-400 md:block">
            {flatItems.find((it) => (it.end ? loc.pathname === it.to : loc.pathname.startsWith(it.to)))?.label || ''}
          </div>

          {/* Paleta de comandos (Ctrl+K) */}
          <button
            onClick={() => setCmdOpen(true)}
            className="ml-auto hidden items-center gap-2 rounded-lg border border-dark-700 bg-dark-800/70 px-3 py-1.5 text-xs text-dark-400 transition-colors hover:border-dark-600 hover:text-dark-200 md:flex"
            title="Ctrl+K"
          >
            <Search size={13} />
            <span className="hidden sm:inline">{t('cmdk.hint')}…</span>
            <kbd className="kbd hidden sm:inline-flex">Ctrl K</kbd>
          </button>

          <span className="hidden md:inline-flex"><BotonAyuda abrir={() => setAyudaOpen(true)} /></span>

          {/* Tema: híbrido → noche → día → híbrido.
              Tres estados en un botón necesitan que el título diga a dónde
              vas, no dónde estás: si no, hay que pulsar para averiguarlo. */}
          <button
            onClick={() => {
              // A partir de aqui la eleccion es SUYA y se respeta siempre.
              try { localStorage.setItem('panel_theme_elegido', '1') } catch { /* incognito */ }
              setTheme((th) => (th === 'hibrido' ? 'dark' : th === 'dark' ? 'light' : 'hibrido'))
            }}
            className="hidden md:flex items-center gap-1.5 rounded-lg border border-dark-700 bg-dark-800/70 px-2 py-1.5 text-dark-400 transition-colors hover:border-dark-600 hover:text-dark-200"
            title={theme === 'hibrido' ? 'Cambiar a modo noche'
              : theme === 'dark' ? 'Cambiar a modo día' : 'Volver al modo mixto'}
          >
            {theme === 'dark' ? <Moon size={14} />
              : theme === 'light' ? <Sun size={14} /> : <Contrast size={14} />}
            <span className="hidden text-[11px] font-medium lg:inline">
              {theme === 'hibrido' ? 'Mixto' : theme === 'dark' ? 'Noche' : 'Día'}
            </span>
          </button>

          {/* Filtro de CENTRO — si solo tiene 1 centro asignado se muestra fijo */}
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-lg bg-dark-800/60 p-1 md:flex-none">
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

          <span className="flex-none">
          <MenuUsuario admin={admin} showAdmin={showAdmin} lang={lang} setLang={setLang}
            langs={LANGS} onLogout={doLogout} t={t} />
          </span>
        </header>

        {/* En el móvil la navegación va en la barra de abajo y en el botón
            «Menú». Aquí había una fila horizontal con las 40 pantallas en
            pastillas: para llegar a una había que barrer a ciegas, y era lo
            que más se usaba en el móvil (02-09-2026). */}

        <main key={loc.pathname} className="animate-fade-in flex-1 overflow-y-auto p-4 pb-24 md:p-5 md:pb-5">
          <Outlet context={{ center, centers, admin }} />
        </main>
      </div>

      {/* Barra de navegación inferior — solo móvil (sensación de app nativa) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-dark-800 bg-dark-900/95 backdrop-blur-md md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {/* Cuatro destinos + el menú. El sitio que ocupaba «Chat interno» se
            lo lleva el menú: el chat tenía 8 mensajes desde el 16 de julio
            (medido), y desde aquí no se llegaba a ninguna otra pantalla sin
            barrer la tira de pastillas. */}
        {[
          { to: '/panel', label: t('nav.dashboard'), icon: LayoutDashboard, end: true },
          { to: '/panel/revision', label: t('nav.revision'), icon: CheckCircle2 },
          { to: '/panel/asignacion', label: t('nav.assign'), icon: ClipboardCheck },
          { to: '/panel/vehiculos', label: t('nav.vehicles'), icon: Truck },
        ].map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end}
            className={({ isActive }) =>
              `flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${
                isActive ? 'text-brand-400' : 'text-dark-500'
              }`}>
            <it.icon size={19} />
            <span className="max-w-full truncate px-1">{it.label}</span>
          </NavLink>
        ))}
        <button onClick={() => setMenuOpen(true)}
          className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${
            menuOpen ? 'text-brand-400' : 'text-dark-500'}`}>
          <Menu size={19} />
          <span className="max-w-full truncate px-1">{t('nav.menu')}</span>
        </button>
      </nav>

      <MenuMovil abierto={menuOpen} cerrar={() => setMenuOpen(false)}
        groups={groups} showAdmin={showAdmin} cm={cm} t={t}
        acciones={[
          { clave: 'buscar', icono: Search, texto: t('cmdk.hint'), hacer: () => setCmdOpen(true) },
          { clave: 'ayuda', icono: CircleHelp, texto: t('nav.help'), hacer: () => setAyudaOpen(true) },
          {
            clave: 'tema',
            icono: theme === 'dark' ? Moon : theme === 'light' ? Sun : Contrast,
            texto: theme === 'hibrido' ? 'Mixto' : theme === 'dark' ? 'Noche' : 'Día',
            hacer: () => {
              try { localStorage.setItem('panel_theme_elegido', '1') } catch { /* incognito */ }
              setTheme((th) => (th === 'hibrido' ? 'dark' : th === 'dark' ? 'light' : 'hibrido'))
            },
          },
        ]} />

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} pages={palettePages} />
      <PanelAyuda
        abierto={ayudaOpen} cerrar={() => setAyudaOpen(false)}
        titulo={t(NAV_DEF.flatMap((g) => g.items)
          .find((it) => keyOf(it.to) === keyOf(loc.pathname))?.labelKey || 'nav.dashboard')} />
      {/* Los primeros pasos se filtran con el MISMO `itemVisible` que el menu:
          asi nadie ve un paso que luego no puede abrir, que es la forma mas
          rapida de que la bienvenida parezca rota. */}
      <PrimerosPasos
        puedeVer={(k) => itemVisible({ to: k === 'dashboard' ? '/panel' : `/panel/${k}` })}
        idUsuario={admin?.id || admin?.sub} />
      <LiveNotifier center={center} centers={centers} />
    </div>
  )
}
