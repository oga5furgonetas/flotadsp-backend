/* ─────────────────────────────────────────────────────────────────────────────
   PRODUCTO 4 · EL SISTEMA NERVIOSO — feed de señales
   ─────────────────────────────────────────────────────────────────────────────
   QUÉ ES  El producto entero reducido a un solo concepto: las señales.
            Una señal es una excepción, un riesgo o una oportunidad, con
            veredicto, evidencia, acción e invalidadores.

   QUÉ PROBLEMA RESUELVE
            Hoy el gestor abre 35 pantallas y ninguna le dice "qué hacer".
            Este feed le dice, en orden de prioridad, qué necesita atención,
            por qué, y qué acción recomendada tiene — con la evidencia delante.

   CÓMO FUNCIONA
            Carga el paquete de datos reales (o sintéticos) y ejecuta el
            motor de señales (motor.js). Cada señal tiene:
              · clase: HECHO / ARITMÉTICA / ESTIMACIÓN / NO DEMOSTRABLE
              · área: Horas / Reparto / Flota / Daños / Sistema / Equipo
              · prioridad: 0-100
              · título, resumen, cálculo, evidencia, invalidadores, acciones

   DATOS REALES
            Se alimenta de cargarDatosReales(center) (apiLab.js), que llama
            a los endpoints reales del backend del LAB.

   REGLA DE ORO
            Si no hay datos suficientes para una regla, el motor emite una
            señal NO DEMOSTRABLE que lo dice explícitamente. No se inventa.
   ───────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState, useMemo } from 'react'
import { Zap, Clock, Wrench, AlertTriangle, Camera, ShieldAlert, Users, SearchCheck, HelpCircle, ChevronDown, ChevronUp, FlaskConical, RefreshCw } from 'lucide-react'
import { cargarDatosReales } from '../apiLab'
import { generarSenales, CLASES } from '../motor'
import { centros } from '../app2/datosPlus'

const AREA_ICON = {
  Horas: Clock, Reparto: SearchCheck, Flota: Wrench, Daños: AlertTriangle,
  Sistema: ShieldAlert, Equipo: Users,
}

const CLASE_CFG = {
  hecho:      { bg: 'bg-emerald-500/10', text: 'text-emerald-300', ring: 'ring-emerald-500/20', border: 'border-emerald-500/20' },
  aritmetica: { bg: 'bg-sky-500/10',    text: 'text-sky-300',    ring: 'ring-sky-500/20',    border: 'border-sky-500/20' },
  estimacion: { bg: 'bg-amber-500/10',  text: 'text-amber-300',  ring: 'ring-amber-500/20',  border: 'border-amber-500/20' },
  nodem:      { bg: 'bg-red-500/8',     text: 'text-red-300',    ring: 'ring-red-500/20',    border: 'border-red-500/20' },
}

export default function Senales({ center }) {
  const [cualCenter, setCualCenter] = useState(center || 'Todos')
  const [datos, setDatos] = useState(null)
  const [senalAbierta, setSenalAbierta] = useState(null)
  const [filtroArea, setFiltroArea] = useState('todas')
  const [filtroClase, setFiltroClase] = useState('todas')
  const [orden, setOrden] = useState('prioridad')
  const [cargando, setCargando] = useState(true)
  const [meta, setMeta] = useState(null)

  useEffect(() => {
    if (center && center !== 'Todos' && center !== cualCenter) setCualCenter(center)
  }, [center])

  const cargar = async () => {
    setCargando(true)
    setDatos(null)
    setMeta(null)
    try {
      const d = await cargarDatosReales(cualCenter)
      setDatos(d)
      setMeta(d.meta || null)
    } catch (e) {
      setMeta({ errores: [String(e)] })
    }
    setCargando(false)
  }

  useEffect(() => { cargar() }, [cualCenter])

  const senales = useMemo(() => {
    if (!datos) return []
    const todas = generarSenales(datos)
    let out = todas
    if (filtroArea !== 'todas') out = out.filter(s => s.area === filtroArea)
    if (filtroClase !== 'todas') out = out.filter(s => s.clase === filtroClase)
    if (orden === 'prioridad') out = [...out].sort((a, b) => b.prioridad - a.prioridad)
    else if (orden === 'area') out = [...out].sort((a, b) => a.area.localeCompare(b.area) || b.prioridad - a.prioridad)
    else if (orden === 'clase') out = [...out].sort((a, b) => a.clase.localeCompare(b.clase) || b.prioridad - a.prioridad)
    return out
  }, [datos, filtroArea, filtroClase, orden])

  const areas = useMemo(() => {
    if (!datos) return []
    const todas = generarSenales(datos)
    const map = new Map()
    for (const s of todas) { map.set(s.area, (map.get(s.area) || 0) + 1) }
    return [{ id: 'todas', label: 'Todas', n: todas.length }, ...Array.from(map.entries()).sort().map(([id, n]) => ({ id, label: id, n }))]
  }, [datos])

  const clases = useMemo(() => {
    if (!datos) return []
    const todas = generarSenales(datos)
    const map = new Map()
    for (const s of todas) { map.set(s.clase, (map.get(s.clase) || 0) + 1) }
    return [
      { id: 'todas', label: 'Todas', n: todas.length },
      ...Array.from(map.entries()).sort((a, b) => {
        const o = Object.keys(CLASES).indexOf(a[0]) - Object.keys(CLASES).indexOf(b[0])
        return o || a[1] - b[1]
      }).map(([id, n]) => ({ id, label: CLASES[id]?.etiqueta || id, n }))
    ]
  }, [datos])

  const stats = useMemo(() => {
    if (!datos) return null
    const todas = generarSenales(datos)
    return {
      total: todas.length,
      hecho: todas.filter(s => s.clase === 'hecho').length,
      aritmetica: todas.filter(s => s.clase === 'aritmetica').length,
      estimacion: todas.filter(s => s.clase === 'estimacion').length,
      nodem: todas.filter(s => s.clase === 'nodem').length,
    }
  }, [datos])

  return (
    <div className="animate-fade-in">
      <header className="rise pb-6">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-dark-500">
          Sistema nervioso{cualCenter && cualCenter !== 'Todos' ? ` · ${cualCenter}` : ''}
        </p>
        <h1 className="mt-2 font-display text-[clamp(24px,3.4vw,34px)] font-semibold leading-[1.1] tracking-[-0.03em] text-dark-50">
          {stats ? (
            <>Lo que necesita atención hoy:<br />
            <span className="text-brand-400">{stats.total} señales</span> detectadas</>
          ) : (
            'Cargando señales…'
          )}
        </h1>
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-dark-400">
          Cada señal es una excepción, un riesgo o una oportunidad, con evidencia y acción.
          El sistema se niega a afirmar lo que no puede demostrar.
        </p>
      </header>

      {/* ── Frescura + recargar ── */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button onClick={cargar} disabled={cargando}
          className="btn-secondary flex items-center gap-1.5 text-[12.5px]">
          <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} />
          {cargando ? 'Cargando…' : 'Recargar datos reales'}
        </button>
        {meta && (
          <span className="text-[11.5px] text-dark-600">
            {meta.peticiones ?? '?'} peticiones · {meta.errores?.length || 0} errores
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-1.5">
          {(datos?.fuentes || meta?.fuentes || []).map((f, i) => (
            <span key={i} className="text-[10.5px] text-dark-600">
              {f.etiqueta || f.label}: {f.actualizado ? new Date(f.actualizado).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'}
              {f.modo === 'manual' && ' (manual)'}
            </span>
          ))}
        </div>
      </div>

      {/* ── Errores de carga ── */}
      {meta?.errores?.length > 0 && (
        <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/[0.05] p-4">
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-red-300">Problemas de datos</h3>
          <ul className="mt-2 list-disc pl-4 text-[12.5px] text-red-200/80">
            {meta.errores.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* ── Stats chips ── */}
      {stats && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Chip label="Total" n={stats.total} activo />
          <Chip label="Hecho" n={stats.hecho} color="text-emerald-300" />
          <Chip label="Aritmética" n={stats.aritmetica} color="text-sky-300" />
          <Chip label="Estimación" n={stats.estimacion} color="text-amber-300" />
          <Chip label="No demostrable" n={stats.nodem} color="text-red-300" />
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-dark-600">Área:</span>
        {areas.map(a => (
          <button key={a.id} onClick={() => setFiltroArea(a.id)}
            className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
              filtroArea === a.id ? 'bg-white/[0.1] text-dark-50' : 'text-dark-500 hover:bg-white/[0.04] hover:text-dark-300'}`}>
            {a.label} <span className="tabular-nums opacity-50">{a.n}</span>
          </button>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-dark-600">Clase:</span>
        {clases.map(c => (
          <button key={c.id} onClick={() => setFiltroClase(c.id)}
            className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
              filtroClase === c.id ? 'bg-white/[0.1] text-dark-50' : 'text-dark-500 hover:bg-white/[0.04] hover:text-dark-300'}`}>
            {c.label} <span className="tabular-nums opacity-50">{c.n}</span>
          </button>
        ))}
        <span className="ml-auto text-[11px] text-dark-600">Orden:</span>
        {[['prioridad', 'Prioridad'], ['area', 'Área'], ['clase', 'Clase']].map(([id, lbl]) => (
          <button key={id} onClick={() => setOrden(id)}
            className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
              orden === id ? 'bg-white/[0.1] text-dark-50' : 'text-dark-500 hover:bg-white/[0.04] hover:text-dark-300'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── Selector de centro ── */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {['Todos', ...centros].map(c => (
          <button key={c} onClick={() => setCualCenter(c)}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              cualCenter === c ? 'bg-brand-500/20 text-brand-300' : 'text-dark-400 hover:text-dark-200'}`}>
            {c}
          </button>
        ))}
      </div>

      {/* ── Feed de señales ── */}
      {cargando && <p className="text-[13px] text-dark-500">Cargando datos reales…</p>}
      {!cargando && !datos && <p className="text-red-400">No se pudieron cargar los datos.</p>}
      {!cargando && datos && senales.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-dark-600">
          <CheckCircle2 size={24} />
          <span className="text-sm">No hay señales con estos filtros.</span>
        </div>
      )}
      {!cargando && datos && senales.length > 0 && (
        <div className="space-y-2.5">
          {senales.map((s, i) => {
            const cls = CLASE_CFG[s.clase] || CLASE_CFG.nodem
            const Ic = AREA_ICON[s.area] || HelpCircle
            const abierto = senalAbierta === s.id
            return (
              <article key={s.id}
                className="rise card overflow-hidden"
                style={{ animationDelay: `${Math.min(i * 35, 300)}ms` }}>
                <button onClick={() => setSenalAbierta(abierto ? null : s.id)}
                  className="float-row flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left">
                  <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cls.bg}`}>
                    <Ic size={15} className={cls.text} />
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${cls.bg} ${cls.text} ${cls.ring}`}>
                    {CLASES[s.clase]?.etiqueta || s.clase}
                  </span>
                  <span className="text-[11px] font-medium text-dark-600">{s.area}</span>
                  <span className="ml-auto text-[11px] tabular-nums text-dark-600">#{s.prioridad}</span>
                  <ChevronDown size={14} className={`shrink-0 text-dark-600 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`} />
                </button>

                <div className={`overflow-hidden transition-all duration-300 ${abierto ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="border-t border-white/[0.05] px-5 py-4">
                    <h3 className="text-[16px] font-semibold leading-snug text-dark-50">{s.titulo}</h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-dark-400">{s.resumen}</p>

                    {s.calculo && (
                      <div className="mt-3 rounded-lg bg-white/[0.03] p-3">
                        <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-dark-600">Cálculo</p>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-dark-300">{s.calculo}</p>
                      </div>
                    )}

                    {s.evidencia?.length > 0 && (
                      <div className="mt-3">
                        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark-600">Evidencia</p>
                        <div className="mt-1.5 space-y-1">
                          {s.evidencia.map((e, k) => (
                            <div key={k} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12.5px]">
                              <span className="min-w-[120px] text-dark-500">{e.k}</span>
                              <span className={`font-medium ${CLASE_CFG[e.clase]?.text || 'text-dark-100'}`}>{e.v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {s.invalidadores?.length > 0 && (
                      <div className="mt-3">
                        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark-600">Invalidadores</p>
                        <ul className="mt-1 list-disc pl-4 text-[12px] text-dark-500">
                          {s.invalidadores.map((inv, k) => <li key={k}>{inv}</li>)}
                        </ul>
                      </div>
                    )}

                    {s.acciones?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {s.acciones.map((a, k) => (
                          <button key={k} className="btn-primary text-[12px]" title="Prototipo: no ejecuta nada">
                            {a.txt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <footer className="mt-10 border-t border-white/[0.05] pt-5 text-[11.5px] leading-relaxed text-dark-600">
        <p>
          Las señales se generan con el motor de reglas del laboratorio contra datos reales del backend del LAB.
          Cada señal indica su clase: <b className="text-emerald-400">HECHO</b> (leído de un campo),
          <b className="text-sky-400"> ARITMÉTICA</b> (suma/resta de hechos),
          <b className="text-amber-400"> ESTIMACIÓN</b> (sale de un modelo),
          <b className="text-red-400"> NO DEMOSTRABLE</b> (no se puede sostener con estos datos).
        </p>
        {datos?.fuentes && (
          <p className="mt-2">
            Frescura de fuentes: {Object.entries(datos.fuentes).map(([k, f]) => (
              <span key={k} className="mr-3">{f.etiqueta}: {f.modo === 'manual' ? 'manual' : 'automático'}</span>
            ))}
          </p>
        )}
      </footer>
    </div>
  )
}

function Chip({ label, n, activo, color }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${activo ? 'bg-white/[0.1] text-dark-50' : 'bg-white/[0.04] text-dark-400'}`}>
      {!activo && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />}
      {label}: <span className={color || 'text-dark-100'}>{n}</span>
    </span>
  )
}

function CheckCircle2(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}
