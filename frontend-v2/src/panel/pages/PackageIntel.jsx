import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, RefreshCw, PackageSearch, ShieldAlert, Activity, Radar,
  MapPin, User, Route as RouteIcon, Box, Clock, Zap, Copy, Check, Loader2, X,
} from 'lucide-react'
import {
  cortexOverview, cortexPackages, cortexPackage, cortexAlerts,
  cortexIngestToken, cortexSeedDemo,
} from '../api'

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
  const st = STATE[s] || STATE.OBSERVED
  return <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-wide ring-1 ${pillCls(st.c)} ${sm ? 'text-[9.5px]' : ''}`}>{st.l}</span>
}

/* ── KPI ── */
function Kpi({ icon: Icon, label, value, sub, accent = 'dark' }) {
  return (
    <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4">
      <div className="flex items-center gap-2 text-dark-500">
        <Icon size={14} className={accent === 'red' ? 'text-red-400' : accent === 'emerald' ? 'text-emerald-400' : 'text-dark-500'} />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-black tabular-nums text-dark-50">{value ?? '—'}</span>
        {sub && <span className="text-xs text-dark-500">{sub}</span>}
      </div>
    </div>
  )
}

/* ── Timeline vertical gráfico ── */
function Timeline({ events }) {
  if (!events?.length) return <div className="text-sm text-dark-500">Sin eventos registrados.</div>
  return (
    <ol className="relative ml-1 border-l border-dark-700">
      {events.map((e, i) => {
        const st = STATE[e.state] || STATE.OBSERVED
        const last = i === events.length - 1
        return (
          <li key={i} className="ml-4 pb-4 last:pb-0">
            <span className={`absolute -left-[7px] mt-1 h-3.5 w-3.5 rounded-full ring-4 ring-dark-950 ${dotCls[st.c] || 'bg-zinc-500'} ${last ? 'animate-pulse' : ''}`} />
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-dark-100">{st.l}</span>
              <span className="text-[11px] tabular-nums text-dark-500">{fmtTime(e.at)}</span>
            </div>
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
    <div className="animate-[fadeIn_.2s_ease] rounded-2xl border border-dark-800 bg-dark-900/60 p-5">
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
      </div>
    </div>
  )
}

/* ── Setup / instalación de la extensión ── */
function SetupCard({ onSeed, seeding }) {
  const [tok, setTok] = useState(null)
  const [copied, setCopied] = useState('')
  const load = () => cortexIngestToken().then(r => setTok(r.data)).catch(() => {})
  useEffect(() => { load() }, [])
  const copy = (txt, key) => { navigator.clipboard?.writeText(txt); setCopied(key); setTimeout(() => setCopied(''), 1500) }
  return (
    <div className="rounded-2xl border border-dark-800 bg-dark-900/60 p-5">
      <div className="flex items-center gap-2 text-dark-100"><Radar size={16} className="text-sky-400" /><span className="text-[15px] font-bold">Conecta Cortex</span></div>
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
      <button onClick={onSeed} disabled={seeding} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-800 px-3 py-2 text-[12.5px] font-semibold text-dark-200 hover:border-dark-600 disabled:opacity-60">
        {seeding ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} className="text-amber-400" />} Ver con datos de demostración
      </button>
    </div>
  )
}

export default function PackageIntel() {
  const [ov, setOv] = useState(null)
  const [pkgs, setPkgs] = useState([])
  const [alerts, setAlerts] = useState([])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('') // '', MISSING, ATTEMPTED, RECOVERED
  const [sel, setSel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const qRef = useRef('')

  const load = useCallback(async () => {
    try {
      const [o, p, a] = await Promise.all([
        cortexOverview(), cortexPackages({ q: qRef.current, state: filter, limit: 300 }), cortexAlerts(),
      ])
      setOv(o.data); setPkgs(p.data.packages || []); setAlerts(a.data.alerts || [])
    } catch { /* red */ }
    setLoading(false)
  }, [filter])

  useEffect(() => { qRef.current = q }, [q])
  useEffect(() => { load() }, [load])
  // Búsqueda con debounce + auto-refresh en vivo cada 30 s
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [q]) // eslint-disable-line
  useEffect(() => { const iv = setInterval(load, 30000); return () => clearInterval(iv) }, [load])

  const seed = async () => { setSeeding(true); try { await cortexSeedDemo(); await load() } finally { setSeeding(false) } }
  const empty = !loading && pkgs.length === 0

  const filters = [['', 'Todos'], ['MISSING', 'Missing'], ['ATTEMPTED', 'Intentados'], ['RECOVERED', 'Recuperados'], ['DELIVERED', 'Entregados']]

  return (
    <div className="min-h-full bg-dark-950 px-4 py-5 sm:px-6">
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}`}</style>

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-dark-500">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Package Intelligence · en vivo
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight text-dark-50">
            <PackageSearch size={22} className="text-sky-400" /> Centro de Investigación de Paquetes
          </h1>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-[13px] font-semibold text-dark-200 hover:border-dark-600">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Activity} label="Health" value={ov ? `${ov.health}` : '—'} sub="/100" accent={ov && ov.health < 70 ? 'red' : 'emerald'} />
        <Kpi icon={PackageSearch} label="Rastreados" value={ov?.tracked?.toLocaleString('es-ES')} sub="paquetes" />
        <Kpi icon={ShieldAlert} label="Missing ahora" value={ov?.missing_now} sub={ov?.missing_today != null ? `${ov.missing_today} hoy` : ''} accent={ov?.missing_now ? 'red' : 'emerald'} />
        <Kpi icon={RefreshCw} label="Recuperación" value={ov?.recovery_pct != null ? `${ov.recovery_pct}%` : '—'} sub={ov?.avg_recovery_min != null ? `~${ov.avg_recovery_min} min` : ''} accent="emerald" />
      </div>

      {empty ? (
        <div className="mx-auto max-w-xl"><SetupCard onSeed={seed} seeding={seeding} /></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
          {/* Columna izquierda: buscador + lista */}
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="TBA, ruta, conductor, dirección, stop…"
                  className="w-full rounded-lg border border-dark-700 bg-dark-900 py-2 pl-9 pr-3 text-[13px] text-dark-100 placeholder-dark-500 outline-none focus:border-sky-500/50" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {filters.map(([v, l]) => (
                  <button key={v} onClick={() => setFilter(v)} className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ring-1 ${filter === v ? 'bg-sky-500/15 text-sky-300 ring-sky-500/30' : 'bg-dark-900 text-dark-400 ring-dark-700 hover:text-dark-200'}`}>{l}</button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-dark-800">
              <div className="hidden grid-cols-[1.4fr_.8fr_1.2fr_.6fr] gap-2 border-b border-dark-800 bg-dark-900/60 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-dark-500 sm:grid">
                <span>Paquete</span><span>Estado</span><span>Ruta / conductor</span><span className="text-right">Hora</span>
              </div>
              <div className="max-h-[62vh] divide-y divide-dark-800 overflow-y-auto">
                {pkgs.map(p => {
                  const active = sel === p.tba
                  const mins = p.state === 'MISSING' ? sinceMin(p.updated_at) : null
                  return (
                    <button key={p.tba} onClick={() => setSel(p.tba)}
                      className={`grid w-full grid-cols-2 items-center gap-2 px-4 py-3 text-left transition sm:grid-cols-[1.4fr_.8fr_1.2fr_.6fr] ${active ? 'bg-sky-500/[.07]' : 'hover:bg-dark-900/60'}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 truncate font-semibold text-dark-50">{p.tba}
                          {p.priority === 'critical' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
                        </div>
                        <div className="truncate text-[11px] text-dark-500">{p.reference_id}</div>
                      </div>
                      <div><Statecap s={p.state} sm /></div>
                      <div className="hidden min-w-0 sm:block">
                        <div className="truncate text-[12.5px] text-dark-200">{p.route_code || '—'}</div>
                        <div className="truncate text-[11px] text-dark-500">{p.driver_name || '—'}</div>
                      </div>
                      <div className="hidden text-right text-[12px] tabular-nums text-dark-400 sm:block">
                        {fmtTime(p.updated_at)}{mins != null && <div className="text-[10px] text-red-400/80">{mins}m</div>}
                      </div>
                    </button>
                  )
                })}
                {pkgs.length === 0 && <div className="px-4 py-8 text-center text-sm text-dark-500">Sin paquetes para este filtro.</div>}
              </div>
            </div>
          </div>

          {/* Columna derecha: alertas + investigador */}
          <div className="space-y-4">
            {alerts.length > 0 && (
              <div className="rounded-2xl border border-dark-800 bg-dark-900/60 p-4">
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
            {sel ? <Investigator tba={sel} onClose={() => setSel(null)} />
              : <div className="rounded-2xl border border-dashed border-dark-800 p-8 text-center text-[13px] text-dark-500">Selecciona un paquete para ver su historia completa y la conclusión del investigador.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
