import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Search, RefreshCw, PackageSearch, ShieldAlert, Activity, Radar,
  MapPin, User, Route as RouteIcon, Box, Clock, Zap, Copy, Check, Loader2, X, Calendar,
} from 'lucide-react'
import {
  cortexOverview, cortexPackages, cortexPackage, cortexAlerts, cortexRoutes,
  cortexIngestToken, cortexSeedDemo, cortexClearDemo, cortexDays, cortexReset,
  cortexStations, cortexAssignStation,
} from '../api'

const todayISO = () => new Date().toISOString().slice(0, 10)
const fmtDay = (d) => {
  const dt = d && new Date(d + 'T00:00:00')
  if (!dt || isNaN(dt)) return d
  const t = todayISO()
  if (d === t) return 'Hoy'
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
  if (d === y) return 'Ayer'
  return dt.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' })
}

/* ── Estados de paquete: color + etiqueta ── */
const STATE = {
  LOADED:     { c: 'sky',     l: 'Cargado' },
  ARRIVED:    { c: 'violet',  l: 'En parada' },
  ATTEMPTED:  { c: 'amber',   l: 'Intentado' },
  MISSING:    { c: 'red',     l: 'Missing' },
  RECOVERED:  { c: 'emerald', l: 'Recuperado' },
  DELIVERED:  { c: 'emerald', l: 'Entregado' },
  RETURNED:   { c: 'zinc',    l: 'Devuelto' },
  LOST:       { c: 'red',     l: 'Perdido' },
  UNCOLLECTED:{ c: 'amber',   l: 'Sin recoger' },
  OBSERVED:   { c: 'zinc',    l: 'Observado' },
}
const PRIO = {
  critical: { c: 'red',     l: 'Crítico' },
  high:     { c: 'orange',  l: 'Alto' },
  medium:   { c: 'amber',   l: 'Medio' },
  low:      { c: 'emerald', l: 'Bajo' },
}
const dotCls = { sky: 'bg-sky-400', violet: 'bg-violet-400', amber: 'bg-amber-400', red: 'bg-red-400', emerald: 'bg-emerald-400', zinc: 'bg-zinc-500', orange: 'bg-orange-400' }
const pillCls = (c) => ({
  sky: 'bg-sky-500/12 text-sky-300 ring-sky-500/25', violet: 'bg-violet-500/12 text-violet-300 ring-violet-500/25',
  amber: 'bg-amber-500/12 text-amber-300 ring-amber-500/25', red: 'bg-red-500/12 text-red-300 ring-red-500/25',
  emerald: 'bg-emerald-500/12 text-emerald-300 ring-emerald-500/25', zinc: 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/25',
  orange: 'bg-orange-500/12 text-orange-300 ring-orange-500/25',
}[c] || 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/25')

const fmtTime = (iso) => { const d = iso && new Date(iso); return d && !isNaN(d) ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—' }
const sinceMin = (iso) => { const d = iso && new Date(iso); if (!d || isNaN(d)) return null; return Math.floor((Date.now() - d.getTime()) / 60000) }

function Statecap({ s, sm }) {
  const st = STATE[s] || (s ? { c: 'zinc', l: String(s).replace(/_/g, ' ').toLowerCase() } : STATE.OBSERVED)
  return <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-wide ring-1 ${pillCls(st.c)} ${sm ? 'text-[9.5px]' : ''}`}>{st.l}</span>
}

/* ── KPI ── */
function Kpi({ icon: Icon, label, value, sub, accent = 'dark' }) {
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-dark-500">
        <Icon size={14} className={accent === 'red' ? 'text-red-400' : accent === 'emerald' ? 'text-emerald-400' : 'text-dark-500'} />
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em]">{label}</span>
      </div>
      <div className="mt-2.5 flex items-baseline gap-2">
        <span className="font-display text-[27px] font-semibold tabular-nums text-dark-50">{value ?? '—'}</span>
        {sub && <span className="text-xs text-dark-500">{sub}</span>}
      </div>
    </div>
  )
}

/* ── Timeline vertical gráfico ── */
const humanCtx = (c) => c ? String(c).replace(/_/g, ' ').toLowerCase().replace(/^\w/, m => m.toUpperCase()) : ''
function Timeline({ events }) {
  if (!events?.length) return <div className="text-sm text-dark-500">Sin eventos registrados.</div>
  return (
    <ol className="relative ml-1 border-l border-dark-700">
      {events.map((e, i) => {
        const st = STATE[e.state] || (e.state ? { c: 'zinc', l: humanCtx(e.state) } : STATE.OBSERVED)
        const last = i === events.length - 1
        return (
          <li key={i} className="ml-4 pb-4 last:pb-0">
            <span className={`absolute -left-[7px] mt-1 h-3.5 w-3.5 rounded-full ring-4 ring-dark-950 ${dotCls[st.c] || 'bg-zinc-500'} ${last ? 'animate-pulse' : ''}`} />
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-dark-100">{st.l}</span>
              <span className="text-[11px] tabular-nums text-dark-500">{fmtTime(e.at)}</span>
            </div>
            {e.context && e.context !== 'NONE' && <div className="mt-0.5 text-[11px] text-amber-300/80">{humanCtx(e.context)}</div>}
            {e.container_id && <div className="mt-0.5 text-[11px] text-dark-500">Contenedor {e.container_id}</div>}
          </li>
        )
      })}
    </ol>
  )
}

/* ── Investigador (panel derecho) ── */
function Investigator({ tba, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    setLoading(true)
    cortexPackage(tba).then(r => { if (alive) { setData(r.data); setLoading(false) } }).catch(() => setLoading(false))
    return () => { alive = false }
  }, [tba])

  if (loading) return <div className="flex h-40 items-center justify-center text-dark-500"><Loader2 className="animate-spin" size={18} /></div>
  if (!data?.package) return <div className="p-4 text-sm text-dark-500">No se pudo cargar el paquete.</div>
  const p = data.package, ev = data.evaluation, inv = ev?.investigator
  const prio = PRIO[ev?.priority] || PRIO.low
  const deliveredSameStop = (data.same_stop || []).filter(x => ['DELIVERED', 'RECOVERED'].includes(x.state)).length

  return (
    <div className="animate-[fadeIn_.2s_ease] rounded-2xl border border-white/[0.05] bg-white/[0.02] p-5">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-dark-500">Package Investigator</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-lg font-black tracking-tight text-dark-50">{p.tba}</span>
            <Statecap s={p.state} />
          </div>
          {p.reference_id && <div className="text-xs text-dark-500">{p.reference_id}</div>}
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-dark-500 hover:bg-dark-800 hover:text-dark-200"><X size={16} /></button>
      </div>

      {/* Ficha de datos */}
      <div className="grid grid-cols-2 gap-2">
        {[[RouteIcon, 'Ruta', p.route_code], [User, 'Conductor', p.driver_name], [MapPin, 'Stop', p.stop_id], [Box, 'Contenedor', p.container_id]].map(([Ic, k, v]) => (
          <div key={k} className="rounded-lg border border-dark-800 bg-dark-950/40 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-dark-500"><Ic size={11} /> {k}</div>
            <div className="mt-0.5 truncate text-[13px] font-semibold text-dark-100">{v || '—'}</div>
          </div>
        ))}
      </div>
      {p.stop_address && <div className="mt-2 flex items-center gap-1.5 text-[12px] text-dark-400"><MapPin size={12} className="text-dark-500" /> {p.stop_address}</div>}

      {/* Conclusión operativa */}
      {inv && (
        <div className={`mt-4 rounded-xl border p-4 ${prio.c === 'red' ? 'border-red-500/25 bg-red-500/[.06]' : 'border-dark-800 bg-dark-950/40'}`}>
          <div className="mb-1.5 flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${pillCls(prio.c === 'orange' ? 'orange' : prio.c)}`}>{prio.l}</span>
            <span className="text-[13px] font-bold text-dark-100">Conclusión operativa</span>
          </div>
          <p className="text-[13px] leading-relaxed text-dark-300">{inv.text}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <span className="font-bold text-emerald-400">{Math.round((inv.confidence || 0) * 100)}% de confianza</span>
            <span className="font-mono text-dark-500">{inv.type}</span>
            {deliveredSameStop > 0 && <span className="text-dark-400">{deliveredSameStop} paquete(s) del mismo stop entregados</span>}
            {inv.mins_since_missing != null && <span className="text-dark-400">Missing hace {inv.mins_since_missing} min</span>}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-dark-100"><Clock size={13} className="text-dark-500" /> Timeline</div>
        <Timeline events={p.timeline} />
        {/* Procedencia: de dónde sale la traza y cuánta evidencia la respalda */}
        <div className="mt-3 border-t border-white/[0.06] pt-2 text-[11px] leading-relaxed text-dark-500">
          Traza construida por la extensión Cortex
          {p.captures_n ? <> · <b className="text-dark-300">{p.captures_n}</b> capturas</> : null}
          {p.first_seen && <> · primera {fmtTime(p.first_seen)}</>}
          {p.updated_at && <> · última {fmtTime(p.updated_at)}</>}
        </div>
        {(p.timeline || []).length <= 1 && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-dark-600">
            El paquete ya estaba en este estado en su primera captura: Cortex no expone el
            historial previo a que la extensión empezara a verlo. Los estados nuevos desde
            ahora sí quedarán registrados con su hora.
          </p>
        )}
      </div>
    </div>
  )
}

/* ── Setup / instalación de la extensión ── */
function SetupCard({ onSeed, onReset, seeding }) {
  const [tok, setTok] = useState(null)
  const [copied, setCopied] = useState('')
  const load = () => cortexIngestToken().then(r => setTok(r.data)).catch(() => {})
  useEffect(() => { load() }, [])
  const copy = (txt, key) => { navigator.clipboard?.writeText(txt); setCopied(key); setTimeout(() => setCopied(''), 1500) }
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 text-dark-100"><Radar size={16} className="text-brand-400" /><span className="text-[15px] font-bold">Conecta Cortex</span></div>
      <p className="mt-1 text-[13px] leading-relaxed text-dark-400">
        Instala la extensión de navegador. Lee la API real de Cortex con tu sesión (nunca la pantalla) y envía los datos aquí cada 2 minutos.
      </p>
      <ol className="mt-3 space-y-1.5 text-[12.5px] text-dark-400">
        <li>1. Descomprime <code className="rounded bg-dark-800 px-1 text-dark-200">FlotaDSP-Cortex.zip</code> (te lo paso).</li>
        <li>2. Chrome → <code className="rounded bg-dark-800 px-1 text-dark-200">chrome://extensions</code> → Modo desarrollador → Cargar descomprimida.</li>
        <li>3. Pega abajo tu token de ingesta en la extensión y abre Cortex.</li>
      </ol>
      {tok && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <input readOnly value={tok.token} className="min-w-0 flex-1 truncate rounded-lg border border-dark-700 bg-dark-950 px-3 py-2 font-mono text-[11px] text-dark-300" />
            <button onClick={() => copy(tok.token, 'tok')} className="flex items-center gap-1 rounded-lg border border-dark-700 bg-dark-800 px-3 py-2 text-[12px] font-semibold text-dark-200 hover:border-dark-600">
              {copied === 'tok' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />} Token
            </button>
          </div>
          <div className="text-[11px] text-dark-500">El token dura 1 año y solo permite enviar datos de paquetes a tu DSP.</div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onSeed} disabled={seeding} className="inline-flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-800 px-3 py-2 text-[12.5px] font-semibold text-dark-200 hover:border-dark-600 disabled:opacity-60">
          {seeding ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} className="text-amber-400" />} Datos de demostración
        </button>
        {onReset && (
          <button onClick={onReset} disabled={seeding} title="Borra todos los paquetes y empieza de cero"
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] font-semibold text-red-300 hover:border-red-500/50 disabled:opacity-60">
            <X size={13} /> Borrar todo y empezar limpio
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Tarjeta de ruta (vista principal con miles de paquetes) ── */
function RouteCard({ r, onOpen }) {
  const done = r.total ? Math.round(100 * r.delivered / r.total) : 0
  const chip = (n, cls, label) => n > 0 && (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>{n} {label}</span>
  )
  return (
    <button onClick={onOpen}
      className="float-row group flex flex-col rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 text-left hover:border-white/[0.1]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[15px] font-bold text-dark-50">
          <RouteIcon size={15} className="text-brand-400" /> {r.route_code}
          {r.critical > 0 && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
        </div>
        <span className="font-mono text-[11px] font-bold tabular-nums text-dark-400">{r.total}</span>
      </div>
      <div className="mt-1 truncate text-[12px] text-dark-500">{r.driver_name || 'Sin conductor'}</div>
      {/* Barra de progreso de entregas */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-dark-800">
        <div className="h-full rounded-full bg-emerald-500/80" style={{ width: `${done}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold text-emerald-400">{done}%</span>
        {chip(r.missing, 'bg-red-500/15 text-red-300', 'missing')}
        {chip(r.attempted, 'bg-amber-500/15 text-amber-300', 'intent.')}
        {chip(r.loaded, 'bg-sky-500/15 text-sky-300', 'en ruta')}
      </div>
    </button>
  )
}

export default function PackageIntel() {
  const { center, centers } = useOutletContext()
  const [stations, setStations] = useState([])
  const [ov, setOv] = useState(null)
  const [pkgs, setPkgs] = useState([])
  const [alerts, setAlerts] = useState([])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('') // '', MISSING, ATTEMPTED, RECOVERED
  const [sel, setSel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [day, setDay] = useState(todayISO())
  const [days, setDays] = useState([])
  const [showSetup, setShowSetup] = useState(false)
  const [routes, setRoutes] = useState([])
  const [activeRoute, setActiveRoute] = useState(null) // ruta abierta (o null = vista de rutas)
  const qRef = useRef('')

  const [err, setErr] = useState('')             // error de carga SIEMPRE visible (nada silencioso)
  const [toast, setToast] = useState(null)       // feedback de acciones { ok, msg }
  const [pkgsLoading, setPkgsLoading] = useState(false)
  const [assigning, setAssigning] = useState('') // service_area_id en curso
  const invRef = useRef(null)
  const flash = (ok, msg) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 4000) }

  // Marco (KPIs + rutas + alertas), SEPARADO de los paquetes: la petición
  // pesada nunca vuelve a bloquear el entrar en una ruta.
  const loadCore = useCallback(async () => {
    try {
      const [o, r, a] = await Promise.all([cortexOverview(day, center), cortexRoutes(day, center), cortexAlerts(day, center)])
      setOv(o.data); setRoutes(r.data.routes || []); setAlerts(a.data.alerts || [])
      setErr('')
    } catch {
      setErr('No se pudieron cargar los datos de Cortex. Reintento automático en 30 s — o pulsa Actualizar.')
    }
    setLoading(false)
  }, [day, center])

  // Paquetes (dentro de ruta o buscando), con su propio estado de carga.
  const loadPkgs = useCallback(async () => {
    const searching = (qRef.current || '').trim().length > 0
    if (!searching && !activeRoute) { setPkgs([]); return }
    setPkgsLoading(true)
    try {
      const p = await cortexPackages({ q: qRef.current, state: filter, day, center, route: activeRoute || '', limit: activeRoute ? 6000 : 300 })
      setPkgs(p.data.packages || [])
    } catch {
      setErr('No se pudo cargar la lista de paquetes. Pulsa Actualizar.')
    }
    setPkgsLoading(false)
  }, [filter, day, activeRoute, center])

  const load = useCallback(() => { loadCore(); loadPkgs() }, [loadCore, loadPkgs])

  // Cambiar de centro arriba: volver a la vista de rutas de ese centro.
  useEffect(() => { setActiveRoute(null); setSel(null) }, [center])
  // Al abrir un paquete, el investigador entra en pantalla (antes quedaba
  // por debajo de las alertas y parecía que el clic no hacía nada).
  useEffect(() => {
    if (sel) setTimeout(() => invRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60)
  }, [sel])

  // Si el día actual no tiene datos pero otro sí (p. ej. fin de semana sin
  // capturas), salta SOLO al día más reciente con datos — nunca a un vacío.
  const dayPickedRef = useRef(false)
  useEffect(() => {
    cortexDays(center).then(r => {
      const ds = r.data.days || []
      setDays(ds)
      if (!dayPickedRef.current && ds.length > 0 && !ds.some(d => d.day === day)) {
        setDay(ds[0].day)
      }
    }).catch(() => {})
  }, [routes.length, center]) // eslint-disable-line
  const loadStations = useCallback(() => { cortexStations().then(r => setStations(r.data.stations || [])).catch(() => {}) }, [])
  useEffect(() => { loadStations() }, [routes.length, loadStations])
  const unmapped = stations.filter(s => !s.center)
  const assignStation = async (sid, c) => {
    setAssigning(sid)
    try {
      const r = await cortexAssignStation(sid, c)
      flash(true, `Estación asignada a ${c} · ${r.data?.updated ?? 0} paquetes re-etiquetados`)
      loadStations(); loadCore(); loadPkgs()
    } catch (e) {
      flash(false, e?.response?.data?.detail || 'No se pudo asignar la estación. Revisa tu conexión y reintenta.')
    }
    setAssigning('')
  }

  useEffect(() => { qRef.current = q }, [q])
  useEffect(() => { loadCore() }, [loadCore])
  useEffect(() => { loadPkgs() }, [loadPkgs])   // entrar en una ruta = fetch inmediato
  // Búsqueda con debounce + auto-refresh en vivo cada 30 s
  useEffect(() => { const t = setTimeout(loadPkgs, 300); return () => clearTimeout(t) }, [q]) // eslint-disable-line
  useEffect(() => { const iv = setInterval(load, 30000); return () => clearInterval(iv) }, [load])

  const actionErr = (e, fb) => flash(false, e?.response?.data?.detail || fb)
  const seed = async () => { setSeeding(true); try { await cortexSeedDemo(); await load() } catch (e) { actionErr(e, 'No se pudieron crear los datos de demostración') } finally { setSeeding(false) } }
  const clearDemo = async () => { setSeeding(true); try { await cortexClearDemo(); setSel(null); await load() } catch (e) { actionErr(e, 'No se pudo limpiar la demo') } finally { setSeeding(false) } }
  const reset = async () => {
    if (!window.confirm('¿Borrar TODOS los paquetes de Cortex y empezar de cero?\nLa extensión los volverá a cargar solos al capturar las rutas.')) return
    setSeeding(true); try { await cortexReset(); setSel(null); await load() } catch (e) { actionErr(e, 'No se pudo borrar') } finally { setSeeding(false) }
  }

  // Frescura de la captura: LA señal de confianza. Verde = extensión viva.
  const freshMin = ov?.last_capture_at ? Math.max(0, Math.floor((Date.now() - new Date(ov.last_capture_at)) / 60000)) : null
  const fresh = freshMin == null
    ? { c: 'bg-dark-600', txt: 'sin capturas todavía', ping: false, warn: false }
    : freshMin <= 6
      ? { c: 'bg-emerald-400', txt: `en vivo · captura hace ${freshMin} min`, ping: true, warn: false }
      : freshMin <= 20
        ? { c: 'bg-amber-400', txt: `última captura hace ${freshMin} min`, ping: false, warn: false }
        : { c: 'bg-red-400', txt: `sin datos desde hace ${freshMin >= 120 ? Math.floor(freshMin / 60) + ' h' : freshMin + ' min'}`, ping: false, warn: true }
  const searching = (q || '').trim().length > 0
  const empty = !loading && routes.length === 0 && days.length === 0
  const hasDemo = alerts.some(a => (a.tba || '').startsWith('TBADEMO')) ||
    pkgs.some(p => (p.tba || '').startsWith('TBADEMO'))

  const filters = [['', 'Todos'], ['MISSING', 'Missing'], ['ATTEMPTED', 'Intentados'], ['RECOVERED', 'Recuperados'], ['DELIVERED', 'Entregados']]

  return (
    <div className="min-h-full px-4 py-6 sm:px-6">
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}`}</style>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className={`flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] ${fresh.warn ? 'text-red-300' : 'text-dark-500'}`}>
            <span className="relative flex h-1.5 w-1.5">
              {fresh.ping && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${fresh.c}`} />
            </span>
            Package Intelligence · {fresh.txt}
          </div>
          <h1 className="mt-2 font-display text-[clamp(24px,3vw,34px)] font-semibold tracking-[-0.03em] text-dark-50">
            Centro de investigación de paquetes
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
            <select value={day} onChange={e => { dayPickedRef.current = true; setDay(e.target.value); setSel(null) }}
              className="appearance-none rounded-lg border border-dark-700 bg-dark-900 py-2 pl-8 pr-8 text-[13px] font-semibold text-dark-200 outline-none hover:border-dark-600 focus:border-brand-500/50">
              {(days.some(d => d.day === day) ? days : [{ day, n: 0 }, ...days]).map(d => (
                <option key={d.day} value={d.day}>{fmtDay(d.day)}{d.n ? ` · ${d.n}` : ''}</option>
              ))}
            </select>
          </div>
          {hasDemo && (
            <button onClick={clearDemo} disabled={seeding} title="Borra los paquetes de demostración (TBADEMO*)"
              className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] font-semibold text-amber-300 hover:border-amber-500/50 disabled:opacity-60">
              {seeding ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Limpiar demo
            </button>
          )}
          <button onClick={() => setShowSetup(s => !s)} title="Token e instalación de la extensión"
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold ${showSetup ? 'border-brand-500/40 bg-brand-500/10 text-brand-300' : 'border-dark-700 bg-dark-900 text-dark-200 hover:border-dark-600'}`}>
            <Radar size={14} /> Extensión
          </button>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-[13px] font-semibold text-dark-200 hover:border-dark-600">
            <RefreshCw size={14} className={loading || pkgsLoading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      {/* Nada falla en silencio: errores de carga y resultado de acciones, siempre visibles */}
      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-2.5 text-[13px] text-red-300">
          <ShieldAlert size={14} className="shrink-0" /> {err}
        </div>
      )}
      {toast && (
        <div className={`mb-4 rounded-xl border px-4 py-2.5 text-[13px] ${toast.ok ? 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-300' : 'border-red-500/25 bg-red-500/[0.07] text-red-300'}`}>
          {toast.msg}
        </div>
      )}
      {fresh.warn && !empty && (
        <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-2.5 text-[13px] text-red-300">
          ⚠ La extensión Cortex lleva {fresh.txt.replace('sin datos desde hace ', '')} sin enviar datos: lo que ves puede estar desactualizado.
          Abre Cortex en Chrome y comprueba que la extensión está activa.
        </div>
      )}

      {showSetup && (
        <div className="mb-5 mx-auto max-w-xl"><SetupCard onSeed={seed} onReset={reset} seeding={seeding} /></div>
      )}

      {/* Estaciones → centro. Mapeo duro por serviceAreaId (infalible). */}
      {stations.length > 0 && (centers?.length > 1) && (unmapped.length > 0 || stations.length > 1) && (
        <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/[.06] p-4">
          <div className="mb-1 text-[13px] font-bold text-amber-300">Asigna cada estación de Cortex a su centro</div>
          <p className="mb-3 text-[12px] text-dark-400">Mira las rutas de ejemplo y pulsa el centro correcto. Se separa al instante (una vez por estación).</p>
          <div className="space-y-2">
            {stations.map(s => (
              <div key={s.service_area_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-dark-800 bg-dark-950/40 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-dark-100">
                    Estación {s.station_code || s.service_area_id.slice(0, 10)} · {s.n} paq.
                    {s.center && <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">{s.center}</span>}
                  </div>
                  {s.sample_routes?.length > 0 && <div className="truncate font-mono text-[11px] text-dark-500">rutas: {s.sample_routes.join(', ')}…</div>}
                </div>
                <span className="ml-auto flex flex-wrap items-center gap-1.5">
                  {assigning === s.service_area_id && <Loader2 size={13} className="animate-spin text-brand-400" />}
                  {centers.filter(c => c !== 'Todos').map(c => (
                    <button key={c} disabled={!!assigning} onClick={() => assignStation(s.service_area_id, c)}
                      className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold transition disabled:opacity-50 ${s.center === c ? 'bg-emerald-500/25 text-emerald-200' : 'bg-brand-500/20 text-brand-300 hover:bg-brand-500/40'}`}>{c}</button>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Activity} label="Health" value={ov ? `${ov.health}` : '—'} sub="/100" accent={ov && ov.health < 70 ? 'red' : 'emerald'} />
        <Kpi icon={PackageSearch} label="Rastreados" value={ov?.tracked?.toLocaleString('es-ES')} sub="paquetes" />
        <Kpi icon={ShieldAlert} label="Missing ahora" value={ov?.missing_now} sub={ov?.missing_today != null ? `${ov.missing_today} hoy` : ''} accent={ov?.missing_now ? 'red' : 'emerald'} />
        <Kpi icon={RefreshCw} label="Recuperación" value={ov?.recovery_pct != null ? `${ov.recovery_pct}%` : '—'} sub={ov?.avg_recovery_min != null ? `~${ov.avg_recovery_min} min` : ''} accent="emerald" />
      </div>

      {empty ? (
        <div className="mx-auto max-w-xl"><SetupCard onSeed={seed} onReset={reset} seeding={seeding} /></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
          {/* Columna izquierda */}
          <div className="min-w-0">
            {/* Buscador + navegación */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {activeRoute && !searching && (
                <button onClick={() => { setActiveRoute(null); setSel(null) }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-[13px] font-semibold text-dark-200 hover:border-dark-600">
                  ← Rutas
                </button>
              )}
              <div className="relative min-w-[200px] flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar TBA, conductor, dirección, stop…"
                  className="w-full rounded-lg border border-dark-700 bg-dark-900 py-2 pl-9 pr-3 text-[13px] text-dark-100 placeholder-dark-500 outline-none focus:border-brand-500/50" />
              </div>
              {(activeRoute || searching) && (
                <div className="flex flex-wrap gap-1.5">
                  {filters.map(([v, l]) => (
                    <button key={v} onClick={() => setFilter(v)} className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ring-1 ${filter === v ? 'bg-brand-500/15 text-brand-300 ring-brand-500/30' : 'bg-dark-900 text-dark-400 ring-dark-700 hover:text-dark-200'}`}>{l}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Vista de RUTAS (sin ruta abierta y sin buscar) */}
            {!activeRoute && !searching ? (
              <div>
                <div className="mb-2 flex items-center justify-between text-[12px] text-dark-500">
                  <span>{routes.length} rutas · {ov?.tracked?.toLocaleString('es-ES') || 0} paquetes</span>
                  {loading && <Loader2 size={13} className="animate-spin" />}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {routes.map(r => <RouteCard key={r.route_code} r={r} onOpen={() => { setActiveRoute(r.route_code); setSel(null); setFilter('') }} />)}
                </div>
                {routes.length === 0 && (
                  <div className="rounded-2xl border border-dark-800 bg-dark-900/40 px-4 py-10 text-center text-sm text-dark-500">
                    Aún no hay rutas para este día. Abre Cortex en la pantalla de rutas y espera unos minutos.
                  </div>
                )}
              </div>
            ) : (
              /* Vista de PAQUETES (dentro de ruta o buscando) */
              <div className="overflow-hidden rounded-2xl border border-dark-800">
                <div className="flex items-center justify-between border-b border-dark-800 bg-dark-900/60 px-4 py-2.5">
                  <span className="text-[12px] font-bold text-dark-100">{activeRoute ? `Ruta ${activeRoute}` : `Búsqueda: “${q}”`}</span>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-dark-400">
                    {pkgsLoading && <Loader2 size={11} className="animate-spin" />} {pkgs.length} paq.
                  </span>
                </div>
                <div className="max-h-[64vh] divide-y divide-dark-800 overflow-y-auto">
                  {pkgs.map(p => {
                    const active = sel === p.tba
                    const mins = p.state === 'MISSING' ? sinceMin(p.updated_at) : null
                    return (
                      <button key={p.tba} onClick={() => setSel(p.tba)}
                        className={`grid w-full grid-cols-[1.7fr_.8fr_.5fr] items-center gap-2 px-4 py-2.5 text-left transition ${active ? 'bg-brand-500/[.08]' : 'hover:bg-white/[0.025]'}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 truncate font-semibold text-dark-50">
                            {p.stop_id && <span className="shrink-0 rounded bg-dark-800 px-1.5 py-0.5 font-mono text-[10px] text-dark-400">#{p.stop_id}</span>}
                            {p.tba}
                            {p.priority === 'critical' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
                          </div>
                          <div className="truncate text-[11px] text-dark-500">{searching && p.route_code ? `${p.route_code} · ` : ''}{p.stop_address || p.reference_id}</div>
                        </div>
                        <div><Statecap s={p.state} sm /></div>
                        <div className="text-right text-[12px] tabular-nums text-dark-400">
                          {fmtTime(p.updated_at)}{mins != null && <div className="text-[10px] text-red-400/80">{mins}m</div>}
                        </div>
                      </button>
                    )
                  })}
                  {pkgs.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-dark-500">
                      {pkgsLoading
                        ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando paquetes…</span>
                        : 'Sin paquetes con este filtro.'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Columna derecha: investigador PRIMERO (visible al clicar), alertas debajo */}
          <div className="space-y-4">
            <div ref={invRef}>
              {sel ? <Investigator tba={sel} onClose={() => setSel(null)} />
                : <div className="rounded-2xl border border-dashed border-dark-800 p-8 text-center text-[13px] text-dark-500">Selecciona un paquete o una alerta para ver su historia completa y la conclusión del investigador.</div>}
            </div>
            {alerts.length > 0 && (
              <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
                <div className="mb-3 flex items-center gap-2 text-[14px] font-bold text-dark-100"><ShieldAlert size={15} className="text-red-400" /> Alertas con evidencia</div>
                <div className="space-y-2.5">
                  {alerts.slice(0, 6).map(a => {
                    const prio = PRIO[a.priority] || PRIO.high
                    return (
                      <button key={a.tba} onClick={() => setSel(a.tba)} className="block w-full rounded-xl border border-dark-800 bg-dark-950/40 p-3 text-left hover:border-dark-700">
                        <div className="mb-1 flex items-center justify-between">
                          <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase ring-1 ${pillCls(prio.c === 'orange' ? 'orange' : prio.c)}`}>{prio.l}</span>
                          <span className="font-mono text-[11px] text-dark-500">{a.tba}</span>
                        </div>
                        <p className="text-[12.5px] leading-snug text-dark-300">{a.recommendation || a.reason}</p>
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-dark-500">
                          {a.confidence != null && <span className="font-bold text-emerald-400">{Math.round(a.confidence * 100)}%</span>}
                          <span>{a.route_code} · {a.driver_name}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
