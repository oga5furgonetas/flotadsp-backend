/* ─────────────────────────────────────────────────────────────────────────────
   COCKPIT — una FlotaDSP alternativa, entera, para probarla de verdad
   ---------------------------------------------------------------------------
   No es una pantalla suelta: es la aplicación reorganizada desde cero con lo
   aprendido en el laboratorio. Convive con la app actual sin tocarla.

   LA TESIS, en una frase: FlotaDSP tiene 35 pantallas y dos sustantivos
   (furgonetas y personas). El producto no necesita más superficie, necesita
   menos y más profunda.

     HOY      qué necesita atención        ← Dashboard, MiDia, AvisosITV,
                                             Vencimientos, Renting,
                                             ExpiryAlerts, Actividad
     FLOTA    furgonetas y personas        ← Vehiculos, Conductores,
                                             Inspecciones, Incidencias,
                                             Talleres, Scorecard, WHC, Turnos
     CAMBIOS  qué ha pasado desde ayer     ← no existe hoy
     ¿Y SI?   simulación honesta           ← no existe hoy

   Tres decisiones de arquitectura, cada una con su motivo:

   1. NAVEGACIÓN ARRIBA Y PLANA, no un árbol lateral con grupos plegables. Con
      cuatro destinos, un árbol sobra: la barra lateral actual existe porque hay
      35 sitios donde ir. Quitar los sitios es lo que arregla la navegación.

   2. LA PROFUNDIDAD SE ABRE, NO SE NAVEGA. Cualquier entidad se abre en un
      panel lateral encima de donde estés. No pierdes el contexto ni la lista.

   3. BUSCADOR GLOBAL (⌘K / Ctrl+K) que busca ENTIDADES, no pantallas. El
      CommandPalette actual salta a rutas; éste abre la ficha de una matrícula
      o de una persona esté donde esté. Es la diferencia entre navegar y
      preguntar.

   Datos: LAB/SIMULATED. Ver datos.js.
   ───────────────────────────────────────────────────────────────────────────── */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, Search, X, ArrowLeft } from 'lucide-react'
import { DATOS_SINTETICOS } from '../datos'
import { generarSenales } from '../motor'
import { Drawer } from '../Ficha360'
import Hoy from './Hoy'
import Flota from './Flota'
import Cambios from '../Cambios'
import Simulador from '../Simulador'

const SUPERFICIES = [
  { id: 'hoy',       nombre: 'Hoy' },
  { id: 'flota',     nombre: 'Flota' },
  { id: 'cambios',   nombre: 'Cambios' },
  { id: 'simulador', nombre: '¿Y si…?' },
]

export default function Shell() {
  const D = DATOS_SINTETICOS
  const [donde, setDonde] = useState('hoy')
  const [entidad, setEntidad] = useState(null)
  const [buscando, setBuscando] = useState(false)

  const senales = generarSenales(D)
  const senalesDe = (sel) => {
    if (!sel) return []
    if (sel.tipo === 'vehiculo') {
      const v = D.vehiculos.find((x) => x.id === sel.id)
      return v ? senales.filter((s) => s.titulo.includes(v.license_plate) || s.id.includes(sel.id)) : []
    }
    const c = D.conductores.find((x) => x.id === sel.id)
    return c ? senales.filter((s) => s.titulo.includes(c.name) || s.resumen?.includes(c.name)) : []
  }

  // ⌘K / Ctrl+K abre el buscador; Escape cierra lo que esté abierto encima.
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBuscando(true) }
      if (e.key === 'Escape') { setBuscando(false) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const urgentes = senales.filter((s) => s.prioridad >= 84).length

  return (
    <div className="atmosphere min-h-screen">
      {/* ── Barra superior: identidad, destinos, buscador ── */}
      <header className="sticky top-0 z-30 glass border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3 sm:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600">
              <FlaskConical size={13} className="text-white" />
            </div>
            <span className="font-display text-[14px] font-semibold tracking-[-0.01em] text-dark-50">Cockpit</span>
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider text-amber-300">
              Lab
            </span>
          </div>

          <nav className="ml-2 hidden gap-0.5 sm:flex">
            {SUPERFICIES.map((s) => (
              <button
                key={s.id}
                onClick={() => setDonde(s.id)}
                className={`relative rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  donde === s.id ? 'bg-white/[0.07] text-dark-50' : 'text-dark-500 hover:text-dark-200'}`}
              >
                {s.nombre}
                {s.id === 'hoy' && urgentes > 0 && (
                  <span className="ml-1.5 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red-500/85 px-1 text-[9.5px] font-bold text-white">
                    {urgentes}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <button
            onClick={() => setBuscando(true)}
            className="ml-auto flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[12.5px] text-dark-500 transition-colors hover:border-white/[0.12] hover:text-dark-300"
          >
            <Search size={13} />
            <span className="hidden sm:inline">Buscar</span>
            <kbd className="kbd hidden sm:inline">⌘K</kbd>
          </button>

          <Link to="/lab" className="btn-ghost flex items-center gap-1.5 px-2 py-1.5 text-[12px]" title="Volver al índice del laboratorio">
            <ArrowLeft size={13} /><span className="hidden md:inline">Lab</span>
          </Link>
        </div>

        {/* Destinos en móvil */}
        <nav className="flex gap-0.5 overflow-x-auto border-t border-white/[0.05] px-4 py-1.5 sm:hidden">
          {SUPERFICIES.map((s) => (
            <button
              key={s.id}
              onClick={() => setDonde(s.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                donde === s.id ? 'bg-white/[0.07] text-dark-50' : 'text-dark-500'}`}
            >
              {s.nombre}
            </button>
          ))}
        </nav>
      </header>

      {/* Aviso permanente. En una app entera hace más falta que nunca. */}
      <div className="border-b border-amber-500/15 bg-amber-500/[0.05] px-6 py-1.5 text-center sm:px-8">
        <span className="text-[11.5px] text-amber-200/80">
          Prototipo del laboratorio · datos inventados (matrículas «LAB») · no toca producción
        </span>
      </div>

      <main key={donde} className="animate-fade-in">
        {donde === 'hoy' && <Hoy D={D} onAbrirEntidad={setEntidad} />}
        {donde === 'flota' && <Flota D={D} onAbrirEntidad={setEntidad} />}
        {donde === 'cambios' && <div className="mx-auto max-w-3xl px-6 py-10 sm:px-8"><Cambios datos={D} /></div>}
        {donde === 'simulador' && <div className="mx-auto max-w-3xl px-6 py-10 sm:px-8"><Simulador datos={D} /></div>}
      </main>

      {entidad && (
        <Drawer D={D} sel={entidad} senales={senalesDe(entidad)} onCerrar={() => setEntidad(null)} />
      )}

      {buscando && (
        <Buscador
          D={D}
          onElegir={(sel) => { setEntidad(sel); setBuscando(false) }}
          onCerrar={() => setBuscando(false)}
        />
      )}
    </div>
  )
}

/* Buscador de ENTIDADES. La diferencia con el CommandPalette actual es que
   aquél te lleva a una pantalla y éste te trae la cosa. */
function Buscador({ D, onElegir, onCerrar }) {
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])

  const t = q.trim().toLowerCase()
  const res = [
    ...D.vehiculos
      .filter((v) => !t || `${v.license_plate} ${v.brand} ${v.model}`.toLowerCase().includes(t))
      .map((v) => ({ tipo: 'vehiculo', id: v.id, txt: v.license_plate, sub: `${v.brand} ${v.model}` })),
    ...D.conductores
      .filter((c) => !t || c.name.toLowerCase().includes(t))
      .map((c) => ({ tipo: 'conductor', id: c.id, txt: c.name, sub: `${c.nivel || '—'} · ${c.contrato || '—'}` })),
  ].slice(0, 8)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" onClick={onCerrar} />
      <div className="animate-pop relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.09] bg-dark-900 shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4">
          <Search size={15} className="shrink-0 text-dark-600" />
          <input
            ref={ref}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && res[0]) onElegir(res[0]) }}
            placeholder="Una matrícula o un nombre…"
            className="w-full bg-transparent py-3.5 text-[14px] text-dark-50 placeholder:text-dark-600 focus:outline-none"
          />
          <button onClick={onCerrar} className="btn-ghost shrink-0 p-1"><X size={15} /></button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {res.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-dark-500">Nada coincide.</p>
          ) : res.map((r) => (
            <button
              key={r.tipo + r.id}
              onClick={() => onElegir({ tipo: r.tipo, id: r.id })}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]"
            >
              <span className="font-mono text-[9px] uppercase tracking-wider text-dark-600">
                {r.tipo === 'vehiculo' ? 'FUR' : 'EQU'}
              </span>
              <span className="text-[14px] font-medium text-dark-50">{r.txt}</span>
              <span className="ml-auto truncate text-[12px] text-dark-600">{r.sub}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-white/[0.06] px-4 py-2">
          <span className="text-[11px] text-dark-600">Abre la ficha completa sin salir de donde estás</span>
        </div>
      </div>
    </div>
  )
}
