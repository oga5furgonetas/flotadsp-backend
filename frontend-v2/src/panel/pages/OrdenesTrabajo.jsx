import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, Plus, Link2, Copy, Check, X, Wrench, Euro, Clock, Search,
  AlertTriangle, MessageCircle, Package, Eye, EyeOff, PhoneCall,
  Download, CalendarClock, HelpCircle, Images, BarChart3, ChevronRight, Truck,
} from 'lucide-react'
import {
  getOrdenes, getResumenOrdenes, getOrden, crearOrden, editarOrden, enlaceOrden,
  getVehicles, getWorkshops, crearTaller, exportarOrdenes, ordenesPorTaller,
  getIncidents, getDanosPendientes, getFurgonetasParadas,
} from '../api'

/* ÓRDENES DE TALLER
   ═══════════════════════════════════════════════════════════════════════
   Esta pantalla va en CLARO mientras el resto del panel va en oscuro, y es
   deliberado: es la única que se mira al lado de un taller —a veces
   enseñándole el móvil a alguien— y en la que hay que leer seguidas fotos,
   importes y fechas. Sobre fondo oscuro todo eso queda gris sobre gris.

   Tres zonas y ninguna más: la lista a la izquierda, la orden abierta a la
   derecha y los números abajo. Se ve todo sin abrir ni cerrar cajones. */

/* Los estados llevan color propio porque son el dato que se busca de un
   vistazo; el resto de la pantalla es deliberadamente neutro para que
   destaquen. Fondo suave + texto saturado: legible en una pantalla de nave. */
const CHIP = {
  abierta: 'bg-slate-100 text-slate-700 ring-slate-200',
  recibido: 'bg-sky-50 text-sky-700 ring-sky-200',
  diagnostico: 'bg-violet-50 text-violet-700 ring-violet-200',
  esperando_piezas: 'bg-orange-50 text-orange-700 ring-orange-200',
  reparando: 'bg-blue-50 text-blue-700 ring-blue-200',
  listo: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  entregado: 'bg-slate-100 text-slate-500 ring-slate-200',
  anulada: 'bg-slate-100 text-slate-400 ring-slate-200',
}
const PUNTO = {
  abierta: '#94A3B8', recibido: '#0EA5E9', diagnostico: '#8B5CF6',
  esperando_piezas: '#F97316', reparando: '#3B82F6', listo: '#10B981',
}
const ORDEN_ESTADOS = ['abierta', 'recibido', 'diagnostico', 'esperando_piezas', 'reparando', 'listo']

const eur = (n) => (n == null ? '—'
  : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n))

const cuando = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const haceCuanto = (iso) => {
  if (!iso) return 'nunca'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

const hoyIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* Días que lleva fuera: la furgoneta olvidada en un taller es dinero parado. */
const diasFuera = (entrada) => {
  if (!entrada) return null
  const d = new Date(String(entrada).slice(0, 10) + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return null
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000))
}

/* ── Rosco de estados ─────────────────────────────────────────────────────
   Un donut y no barras porque la pregunta aquí es de reparto ("¿dónde se
   acumula?"), no de comparación exacta. Un solo círculo con dash-offset: sin
   librería de gráficos y sin 200 KB de más en el bundle. */
function Rosco({ datos, total }) {
  const R = 54
  const C = 2 * Math.PI * R
  let acumulado = 0
  return (
    <svg viewBox="0 0 140 140" className="h-[132px] w-[132px] flex-none">
      <circle cx="70" cy="70" r={R} fill="none" stroke="#EEF2F6" strokeWidth="18" />
      {datos.map((d) => {
        const frac = d.n / total
        const el = (
          <circle key={d.id} cx="70" cy="70" r={R} fill="none"
            stroke={PUNTO[d.id] || '#CBD5E1'} strokeWidth="18"
            strokeDasharray={`${frac * C} ${C}`}
            strokeDashoffset={-acumulado * C}
            transform="rotate(-90 70 70)" />
        )
        acumulado += frac
        return el
      })}
      <text x="70" y="66" textAnchor="middle" className="fill-slate-900"
        style={{ fontSize: 26, fontWeight: 700 }}>{total}</text>
      <text x="70" y="84" textAnchor="middle" className="fill-slate-400"
        style={{ fontSize: 10, letterSpacing: '0.08em' }}>ABIERTAS</text>
    </svg>
  )
}

/* Selector con buscador: un desplegable con 176 matrículas no lo usa nadie. */
function Buscador({ etiqueta, valor, opciones, onElegir, placeholder, pie }) {
  const [txt, setTxt] = useState('')
  const [abierto, setAbierto] = useState(false)
  const elegida = opciones.find((o) => o.id === valor)
  const filtradas = txt.trim()
    ? opciones.filter((o) => o.txt.toLowerCase().includes(txt.trim().toLowerCase())).slice(0, 40)
    : opciones.slice(0, 40)

  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">{etiqueta}</label>
      {elegida && !abierto ? (
        <button onClick={() => { setAbierto(true); setTxt('') }}
          className="flex w-full items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2.5 text-left text-[14px] text-slate-900">
          <Check size={15} className="flex-none text-blue-600" />
          <span className="truncate">{elegida.txt}</span>
          <span className="ml-auto text-[12.5px] text-slate-500">cambiar</span>
        </button>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
            <Search size={15} className="flex-none text-slate-400" />
            <input autoFocus={abierto} value={txt} placeholder={placeholder}
              onChange={(e) => setTxt(e.target.value)}
              className="w-full bg-transparent py-2.5 text-[14px] text-slate-900 outline-none placeholder:text-slate-400" />
          </div>
          <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
            {filtradas.length ? filtradas.map((o) => (
              <button key={o.id} onClick={() => { onElegir(o.id); setAbierto(false); setTxt('') }}
                className="block w-full px-3 py-2 text-left text-[13.5px] text-slate-700 hover:bg-slate-50">
                {o.txt}
              </button>
            )) : <p className="px-3 py-3 text-[13px] text-slate-400">Nada con ese nombre.</p>}
          </div>
          {pie}
        </>
      )}
    </div>
  )
}

function Kpi({ etiqueta, valor, pie, icono: Icono, tono = 'slate' }) {
  const color = { slate: 'text-slate-400', blue: 'text-blue-500',
    orange: 'text-orange-500', emerald: 'text-emerald-500' }[tono]
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className={`mb-1.5 flex items-center gap-1.5 ${color}`}>
        <Icono size={14} />
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{etiqueta}</p>
      </div>
      <p className="text-[28px] font-bold leading-none tabular-nums text-slate-900">{valor}</p>
      {pie && <p className="mt-1.5 text-[11.5px] text-slate-400">{pie}</p>}
    </div>
  )
}

export default function OrdenesTrabajo() {
  const { center } = useOutletContext()
  const [datos, setDatos] = useState(null)
  const [resumen, setResumen] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [err, setErr] = useState('')
  const [filtro, setFiltro] = useState('abiertas')
  const [filtroTaller, setFiltroTaller] = useState('')

  const [abierta, setAbierta] = useState(null)
  const [enlace, setEnlace] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const [guardando, setGuardando] = useState('')
  const [bajando, setBajando] = useState(false)
  const [danos, setDanos] = useState(null)
  const [paradas, setParadas] = useState(null)
  const [verParadas, setVerParadas] = useState(true)
  const [furgAbierta, setFurgAbierta] = useState(null)   // qué furgoneta está desplegada en la lista de daños
  const [verDanos, setVerDanos] = useState(false)
  const [verComo, setVerComo] = useState(false)
  const [comparativa, setComparativa] = useState(null)

  const [nueva, setNueva] = useState(null)
  const [tallerNuevo, setTallerNuevo] = useState(null)
  const [vehiculos, setVehiculos] = useState([])
  const [talleres, setTalleres] = useState([])
  const [incidencias, setIncidencias] = useState([])
  const panelRef = useRef(null)

  const cargar = useCallback(async () => {
    setCargando(true); setErr('')
    try {
      const params = { ...(center && center !== 'Todos' ? { center } : {}) }
      if (filtro === 'abiertas') params.abiertas = true
      else if (filtro !== 'todas') params.estado = filtro
      if (filtroTaller) params.workshop_id = filtroTaller
      const [l, r] = await Promise.all([getOrdenes(params), getResumenOrdenes(center)])
      setDatos(l.data); setResumen(r.data)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudieron cargar las órdenes.')
    } finally { setCargando(false) }
  }, [center, filtro, filtroTaller])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    getWorkshops().then((r) => setTalleres(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!nueva?.vehicle_id) { setIncidencias([]); return }
    getIncidents({ vehicle_id: nueva.vehicle_id })
      .then((r) => setIncidencias((r.data || []).filter((x) => x.status === 'open')))
      .catch(() => setIncidencias([]))
  }, [nueva?.vehicle_id])

  const estados = datos?.estados || {}
  const ordenes = datos?.ordenes || []
  const pendientes = useMemo(
    () => (datos?.ordenes || []).filter((o) => o.presupuesto === 'pendiente').length, [datos])

  const abrirFicha = async (id) => {
    setEnlace(null); setCopiado(false)
    try {
      const r = await getOrden(id)
      setAbierta(r.data)
      if (r.data.enlace) setEnlace({ url: r.data.enlace, expira_en: r.data.enlace_expira })
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo abrir la orden.')
    }
  }

  const generarEnlace = async () => {
    setGuardando('enlace')
    try {
      const r = await enlaceOrden(abierta.id)
      setEnlace(r.data); setCopiado(false)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo generar el enlace.')
    } finally { setGuardando('') }
  }

  const cambiar = async (campos, clave) => {
    setGuardando(clave)
    try {
      const r = await editarOrden(abierta.id, campos)
      setAbierta({ ...r.data.orden, enlace: abierta.enlace, enlace_expira: abierta.enlace_expira })
      await cargar()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo guardar.')
    } finally { setGuardando('') }
  }

  /* Los daños abiertos sin orden. Falla en silencio a proposito: es
     informacion de apoyo, y si el endpoint no responde, la pantalla de
     ordenes tiene que seguir funcionando igual que antes. */
  useEffect(() => {
    let vivo = true
    getDanosPendientes({ ...(center && center !== 'Todos' ? { center } : {}) })
      .then((r) => { if (vivo) setDanos(r.data) })
      .catch(() => {})
    getFurgonetasParadas(center)
      .then((r) => { if (vivo) setParadas(r.data) })
      .catch(() => {})
    return () => { vivo = false }
  }, [center])

  /* Desde una furgoneta entera: el parte se abre con TODOS sus daños escritos.
     Antes se creaba uno por daño y eso son cinco viajes de la misma furgoneta
     al taller — o peor, arreglar el golpe leve y devolverla con el grave
     puesto. `ledger_id` sigue siendo el peor de los suyos, que es el que se
     marca como enviado; los demás se enseñan en el texto para que el taller
     los vea todos. */
  const desdeFurgoneta = (g) => {
    const peor = g.danos[0]
    setNueva({
      vehicle_id: g.vehicle_id, workshop_id: '',
      problema: g.problema || '', fecha_entrega_estimada: '',
      ledger_id: peor?.ledger_id,
    })
    if (!vehiculos.length) {
      getVehicles(center).then((r) => setVehiculos(r.data || [])).catch(() => {})
    }
  }

  const abrirAlta = async () => {
    setNueva({ vehicle_id: '', workshop_id: '', problema: '', fecha_entrega_estimada: '' })
    if (!vehiculos.length) {
      try { setVehiculos((await getVehicles(center)).data || []) } catch { /* lo avisa el formulario */ }
    }
  }

  const guardarTallerNuevo = async () => {
    const nombre = (tallerNuevo?.name || '').trim()
    if (!nombre) return
    setGuardando('taller')
    try {
      const r = await crearTaller({ name: nombre, phone: (tallerNuevo.phone || '').trim(),
        ...(center && center !== 'Todos' ? { center } : {}) })
      setTalleres((p) => [r.data, ...p])
      setNueva((n) => ({ ...n, workshop_id: r.data.id }))
      setTallerNuevo(null)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo crear el taller.')
    } finally { setGuardando('') }
  }

  const crear = async () => {
    setGuardando('crear')
    try {
      const r = await crearOrden(nueva)
      setNueva(null); await cargar(); await abrirFicha(r.data.id)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo crear la orden.')
    } finally { setGuardando('') }
  }

  const descargar = async () => {
    setBajando(true); setErr('')
    try {
      const params = { ...(center && center !== 'Todos' ? { center } : {}) }
      if (filtro === 'abiertas') params.abiertas = true
      else if (filtro !== 'todas') params.estado = filtro
      if (filtroTaller) params.workshop_id = filtroTaller
      const r = await exportarOrdenes(params)
      const url = URL.createObjectURL(r.data)
      const el = document.createElement('a')
      el.href = url
      el.download = `ordenes-taller-${hoyIso()}.xlsx`
      el.click(); URL.revokeObjectURL(url)
    } catch { setErr('No se pudo generar el Excel.') } finally { setBajando(false) }
  }

  const verComparativa = async () => {
    if (comparativa) { setComparativa(null); return }
    try { setComparativa((await ordenesPorTaller(center)).data?.talleres || []) }
    catch { setErr('No se pudo calcular la comparativa.') }
  }

  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true); setTimeout(() => setCopiado(false), 2500)
    } catch { setErr('El navegador no ha dejado copiar. Selecciona el enlace a mano.') }
  }

  const reparto = ORDEN_ESTADOS
    .map((id) => ({ id, txt: estados[id] || id, n: resumen?.por_estado?.[id] || 0 }))
    .filter((x) => x.n)
  const totalAbiertas = reparto.reduce((s, x) => s + x.n, 0)

  const proximas = ordenes
    .filter((o) => o.fecha_entrega_estimada && !['entregado', 'anulada'].includes(o.estado))
    .sort((a, b) => a.fecha_entrega_estimada.localeCompare(b.fecha_entrega_estimada))
    .slice(0, 5)

  /* El panel oscuro mete su propio padding: se anula para que el lienzo claro
     llegue a los bordes, como un producto de verdad y no como una tarjeta
     flotando en mitad de la nada. */
  return (
    <div className="-m-4 -mb-24 min-h-full bg-[#F2F4F7] p-4 text-slate-900 md:-m-5 md:mb-[-1.25rem] md:p-6">

      {/* ── Cabecera ───────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">Órdenes de trabajo</h1>
          <p className="text-[13.5px] text-slate-500">Lo que está en el taller, sin llamar a nadie.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {talleres.length > 1 && (
            <select value={filtroTaller} onChange={(e) => setFiltroTaller(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-700">
              <option value="">Todos los talleres</option>
              {talleres.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
          <button onClick={() => setVerComo((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-50">
            <HelpCircle size={15} /> Cómo funciona
          </button>
          <button onClick={verComparativa}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-50">
            <BarChart3 size={15} /> Comparar talleres
          </button>
          <button onClick={descargar} disabled={bajando}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {bajando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Excel
          </button>
          <button onClick={abrirAlta}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-blue-700">
            <Plus size={15} /> Nueva orden
          </button>
        </div>
      </div>

      {err && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13.5px] text-red-700">{err}</p>
      )}

      {/* ── Los cinco pasos ────────────────────────────────────────── */}
      {verComo && (
        <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-5">
          {[
            ['1', 'Creas la orden', 'Furgoneta, taller y qué le pasa. La furgoneta se marca en taller sola.'],
            ['2', 'Mandas el enlace', 'Por WhatsApp, con un botón. El taller no se registra ni instala nada.'],
            ['3', 'El taller escribe', 'Estado, fotos, fecha de entrega y presupuesto, desde su móvil.'],
            ['4', 'Te avisa', 'Telegram cuando está lista, falta una pieza o se mueve la fecha.'],
            ['5', 'Se cierra', 'Marcas entregada, la furgoneta vuelve a activa y queda el historial.'],
          ].map(([n, tit, txt]) => (
            <div key={n} className="rounded-lg bg-slate-50 p-3">
              <span className="text-[11px] font-bold text-blue-600">{n}</span>
              <p className="mt-1 text-[13.5px] font-bold">{tit}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500">{txt}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Avisos que piden acción ────────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-2 empty:mb-0">
        {!!resumen?.sin_abrir && (
          <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13.5px] text-red-700">
            <EyeOff size={16} className="flex-none" />
            {resumen.sin_abrir === 1 ? 'Hay 1 orden que el taller no ha abierto todavía.'
              : `Hay ${resumen.sin_abrir} órdenes que el taller no ha abierto todavía.`} Comprueba que les llegó el enlace.
          </p>
        )}
        {!!resumen?.paradas && (
          <p className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3.5 py-2.5 text-[13.5px] text-orange-800">
            <Clock size={16} className="flex-none" />
            {resumen.paradas === 1 ? '1 orden lleva' : `${resumen.paradas} órdenes llevan`} más de {resumen.dias_parada} días sin novedades del taller.
          </p>
        )}
        {!!pendientes && (
          <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13.5px] text-amber-800">
            <AlertTriangle size={16} className="flex-none" />
            {pendientes === 1 ? 'Hay 1 presupuesto esperando tu aprobación.'
              : `Hay ${pendientes} presupuestos esperando tu aprobación.`}
          </p>
        )}
      </div>

      {/* ── Daños esperando taller ──────────────────────────────────
          El puente que faltaba. Sin esto, ver un daño y crear la orden son
          dos pantallas distintas y el daño se queda ahi: 203 abiertos y 2
          ordenes. El boton no crea nada solo — abre el alta con la matricula
          y la pieza puestas, y quien decide sigue siendo una persona. */}
      {/* ── FURGONETAS PARADAS ─────────────────────────────────────────
          Va lo primero porque es lo que cuesta dinero ahora mismo. `status:
          "taller"` era una etiqueta sin fecha: nadie sabía desde cuándo estaba
          parada una furgoneta ni quién la estaba gestionando. Medido el
          28-08-2026: 14 paradas, tres desde hacía 52 días, 319 días-furgoneta
          acumulados y trece SIN NINGÚN PARTE ABIERTO — no es que tardaran, es
          que nadie las llevaba. */}
      {!!paradas?.total && (
        <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <button onClick={() => setVerParadas((v) => !v)}
            className="flex w-full flex-wrap items-center gap-2.5 px-4 py-3 text-left hover:bg-slate-50">
            <Truck size={17} className={paradas.mas_de_30 ? 'text-red-600' : 'text-slate-500'} />
            <h2 className="text-[15px] font-bold">Furgonetas paradas</h2>
            <span className="text-[13px] text-slate-500">
              {paradas.total} sin trabajar · <b className="tabular-nums text-slate-700">{paradas.dias_acumulados} días</b> acumulados
              {!!paradas.sin_orden && <b className="text-red-600"> · {paradas.sin_orden} sin parte abierto</b>}
            </span>
            <ChevronRight size={16}
              className={`ml-auto text-slate-400 transition-transform ${verParadas ? 'rotate-90' : ''}`} />
          </button>
          {verParadas && (
            <div className="border-t border-slate-100">
              {paradas.paradas.map((v) => (
                <div key={v.vehicle_id}
                  className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5 last:border-b-0">
                  <span className="font-mono text-[13px] font-semibold">{v.matricula}</span>
                  {/* Los días son el dato, así que van grandes y en rojo pasados
                      treinta. Un número pequeño y gris no mueve a nadie a
                      llamar al taller. */}
                  <span className={`tabular-nums text-[14px] font-bold ${
                    v.dias > 30 ? 'text-red-600' : v.dias > 14 ? 'text-amber-600' : 'text-slate-600'}`}>
                    {v.dias} día{v.dias === 1 ? '' : 's'}
                  </span>
                  <span className="text-[12.5px] text-slate-400">
                    desde el {v.desde}{v.fecha_estimada ? ' (aprox.)' : ''}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-500">{v.center}</span>
                  {/* slate-700 y no slate-600: sobre este relleno el checker de
                      contraste lo midió en 4,28:1, por debajo del 4,5 de la WCAG. */}
                  {v.orden ? (
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-[12px] font-semibold text-slate-700">
                      {v.orden}{v.taller ? ` · ${v.taller}` : ''}
                    </span>
                  ) : (
                    <span className="rounded-lg bg-red-50 px-2 py-1 text-[12px] font-semibold text-red-700"
                      title="Está parada y no hay ningún parte abierto: nadie la está gestionando">
                      sin parte
                    </span>
                  )}
                </div>
              ))}
              <p className="px-4 py-2 text-[12.5px] text-slate-400">
                Las que ponen «aprox.» entraron antes de que se guardara la fecha de
                entrada, y se calcula con el último cambio de su ficha. Las que entren a
                partir de ahora llevan la fecha exacta.
              </p>
            </div>
          )}
        </div>
      )}

      {!!danos?.total && (
        <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <button
            onClick={() => setVerDanos((v) => !v)}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-slate-50">
            <AlertTriangle size={17} className={danos.graves ? 'text-red-600' : 'text-amber-500'} />
            <h2 className="text-[15px] font-bold">Daños esperando taller</h2>
            <span className="text-[13px] text-slate-500">
              {danos.furgonetas ?? danos.total} furgoneta{(danos.furgonetas ?? danos.total) === 1 ? '' : 's'}
              {' · '}{danos.total} daño{danos.total === 1 ? '' : 's'}
              {!!danos.furgonetas_graves && <b className="text-red-600"> · {danos.furgonetas_graves} con algo grave</b>}
            </span>
            <ChevronRight size={16}
              className={`ml-auto text-slate-400 transition-transform ${verDanos ? 'rotate-90' : ''}`} />
          </button>
          {/* UNA FILA POR FURGONETA, NO POR DAÑO. Una furgoneta va al taller
                UNA vez y le arreglan todo lo que lleva encima. La lista suelta
                tenía 170 líneas y por eso no la vaciaba nadie; agrupada son 83
                furgonetas, y solo 30 llevan algo grave: eso sí se puede
                terminar. Y evita el fallo caro de mandarla, arreglarle el
                rasguño y devolverla con el golpe grave todavía puesto. */}
          {verDanos && (
            <div className="border-t border-slate-100">
              {(danos.por_furgoneta || []).slice(0, 40).map((g) => (
                <div key={g.vehicle_id} className="border-b border-slate-100 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <span className={`h-2 w-2 flex-none rounded-full ${
                      g.peor === 'critico' ? 'bg-red-600'
                        : g.peor === 'grave' ? 'bg-red-500'
                          : g.peor === 'moderado' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                    <span className="font-mono text-[13px] font-semibold">{g.matricula}</span>
                    <button onClick={() => setFurgAbierta((x) => (x === g.vehicle_id ? null : g.vehicle_id))}
                      className="min-w-0 flex-1 truncate text-left text-[13.5px] text-slate-700 hover:text-slate-900">
                      {g.n} daño{g.n === 1 ? '' : 's'}
                      {!!g.graves && <b className="text-red-600"> · {g.graves} grave{g.graves === 1 ? '' : 's'}</b>}
                      {!!g.confirmados && <span className="text-slate-400"> · {g.confirmados} confirmado{g.confirmados === 1 ? '' : 's'} por una persona</span>}
                      <ChevronRight size={13} className={`ml-1 inline text-slate-400 transition-transform ${furgAbierta === g.vehicle_id ? 'rotate-90' : ''}`} />
                    </button>
                    {g.dias > 0 && (
                      <span className={`text-[12px] tabular-nums ${
                        g.dias > 30 ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                        {g.dias} día{g.dias === 1 ? '' : 's'}
                      </span>
                    )}
                    <button
                      onClick={() => desdeFurgoneta(g)}
                      className="flex-none rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-[12.5px] font-semibold text-blue-700 hover:bg-blue-100">
                      Un parte con todo
                    </button>
                  </div>
                  {furgAbierta === g.vehicle_id && (
                    <div className="bg-slate-50 px-4 pb-2.5">
                      {g.danos.map((d) => (
                        <div key={d.ledger_id} className="flex flex-wrap items-center gap-2 py-1 text-[13px]">
                          <span className={`h-1.5 w-1.5 flex-none rounded-full ${
                            d.severidad === 'critico' ? 'bg-red-600'
                              : d.severidad === 'grave' ? 'bg-red-500'
                                : d.severidad === 'moderado' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                          <span className="min-w-0 flex-1 truncate text-slate-700">
                            {d.pieza}
                            <span className="text-slate-400"> · {d.severidad}</span>
                            <span className="text-slate-400">
                              {d.origen === 'ai' ? ' · lo vio la IA' : ' · lo confirmó una persona'}
                            </span>
                          </span>
                          <span className="tabular-nums text-[12px] text-slate-400">{d.dias} d</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {(danos.furgonetas || 0) > 40 && (
                <p className="px-4 py-2 text-[12.5px] text-slate-400">
                  y {danos.furgonetas - 40} furgonetas más. Se enseñan primero las que
                  llevan algo grave y las que llevan más tiempo esperando.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Comparativa ────────────────────────────────────────────── */}
      {comparativa && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 size={17} className="text-blue-600" />
            <h2 className="text-[15px] font-bold">Comparativa de talleres</h2>
            <span className="text-[12.5px] text-slate-400">solo órdenes ya entregadas</span>
            <button onClick={() => setComparativa(null)} className="ml-auto text-slate-400 hover:text-slate-700"><X size={17} /></button>
          </div>
          {!comparativa.length ? (
            <p className="py-3 text-[13.5px] text-slate-500">
              Todavía no hay ninguna orden entregada. En cuanto cierres unas cuantas,
              aquí verás cuál tarda menos y cuál cobra más.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13.5px]">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wider text-slate-400">
                    <th className="pb-2 font-semibold">Taller</th>
                    <th className="pb-2 text-right font-semibold">Órdenes</th>
                    <th className="pb-2 text-right font-semibold">Días de media</th>
                    <th className="pb-2 text-right font-semibold">Importe medio</th>
                    <th className="pb-2 text-right font-semibold">Gasto total</th>
                    <th className="pb-2 text-right font-semibold">Usan el enlace</th>
                  </tr>
                </thead>
                <tbody>
                  {comparativa.map((x) => (
                    <tr key={x.workshop_id} className="border-t border-slate-100">
                      <td className="py-2.5 font-medium">{x.taller}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-600">{x.ordenes}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {x.dias_medios == null ? <span className="text-slate-400">sin datos</span>
                          : <><b>{x.dias_medios}</b><span className="ml-1 text-[11px] text-slate-400">de {x.medidas_sobre}</span></>}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-slate-600">{eur(x.importe_medio)}</td>
                      <td className="py-2.5 text-right tabular-nums font-medium">{eur(x.gasto_total)}</td>
                      <td className={`py-2.5 text-right tabular-nums ${
                        x.usan_el_enlace >= 80 ? 'text-emerald-600'
                          : x.usan_el_enlace >= 40 ? 'text-slate-600' : 'text-red-600'}`}>{x.usan_el_enlace}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[12px] text-slate-500">
                «Usan el enlace» es cuántas de sus órdenes llegaron a abrir. Por debajo del 40 %
                no es que el taller sea malo: es que a ese hay que seguir llamándole.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══ LISTA + DETALLE ════════════════════════════════════════ */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap gap-1.5 border-b border-slate-200 px-4 py-3">
            {[['abiertas', 'Abiertas'], ['todas', 'Todas'], ...Object.entries(estados)].map(([id, txt]) => (
              <button key={id} onClick={() => setFiltro(id)}
                className={`rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition ${
                  filtro === id ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
                {txt}
                {resumen?.por_estado?.[id] != null && (
                  <span className={filtro === id ? 'ml-1.5 text-blue-100' : 'ml-1.5 text-slate-400'}>
                    {resumen.por_estado[id]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {cargando ? (
            <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-blue-500" /></div>
          ) : !ordenes.length ? (
            <div className="px-6 py-16 text-center">
              <Wrench size={30} className="mx-auto mb-3 text-slate-300" />
              <p className="text-[14.5px] font-semibold text-slate-600">
                No hay órdenes {filtro === 'abiertas' ? 'abiertas' : 'con ese filtro'}.
              </p>
              <p className="mt-1 text-[13px] text-slate-400">
                Cuando dejes una furgoneta en un taller, créala aquí y mándales el enlace.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13.5px]">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-2.5 font-semibold">Orden</th>
                    <th className="px-3 py-2.5 font-semibold">Furgoneta</th>
                    <th className="px-3 py-2.5 font-semibold">Taller</th>
                    <th className="px-3 py-2.5 font-semibold">Estado</th>
                    <th className="px-3 py-2.5 font-semibold">Actualizada</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Días</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {ordenes.map((o) => {
                    const d = diasFuera(o.fecha_entrada)
                    const cerrada = ['entregado', 'anulada'].includes(o.estado)
                    const sel = abierta?.id === o.id
                    return (
                      <tr key={o.id} onClick={() => abrirFicha(o.id)}
                        className={`cursor-pointer border-t border-slate-100 transition ${
                          sel ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-500">{o.numero}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-[14.5px] font-bold tracking-tight">{o.matricula}</td>
                        <td className="max-w-[13rem] truncate px-3 py-3 text-slate-500">{o.taller_nombre}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-inset ${CHIP[o.estado] || CHIP.abierta}`}>
                            {estados[o.estado] || o.estado}
                          </span>
                          {o.presupuesto === 'pendiente' && (
                            <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                              presupuesto
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-[12.5px] text-slate-400">
                          {haceCuanto(o.actualizada_en)}
                          {!cerrada && (o.abierto_en
                            ? <span className="ml-1.5 text-emerald-600" title="El taller ha abierto el enlace">·&nbsp;lo&nbsp;ve</span>
                            : <span className="ml-1.5 font-semibold text-red-500" title="El taller no ha abierto el enlace">·&nbsp;sin&nbsp;abrir</span>)}
                        </td>
                        <td className={`px-3 py-3 text-right tabular-nums ${
                          !cerrada && d > 10 ? 'font-bold text-orange-600' : 'text-slate-500'}`}>
                          {cerrada ? '—' : (d ?? '—')}
                        </td>
                        <td className="px-3 py-3 text-slate-300"><ChevronRight size={16} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div ref={panelRef}>
          {!abierta ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
              <Eye size={26} className="mx-auto mb-3 text-slate-300" />
              <p className="text-[13.5px] text-slate-500">Pulsa una orden de la lista para verla aquí.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">{abierta.numero}</p>
                    <h2 className="text-[26px] font-bold leading-tight tracking-tight">{abierta.matricula}</h2>
                    <p className="truncate text-[13.5px] text-slate-500">{abierta.taller_nombre}</p>
                  </div>
                  <span className={`ml-auto flex-none rounded-full px-3 py-1 text-[12px] font-semibold ring-1 ring-inset ${CHIP[abierta.estado] || CHIP.abierta}`}>
                    {estados[abierta.estado] || abierta.estado}
                  </span>
                  <button onClick={() => setAbierta(null)} className="flex-none text-slate-300 hover:text-slate-600">
                    <X size={18} />
                  </button>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-3">
                  {[['Entrada', abierta.fecha_entrada || '—'],
                    ['Entrega prevista', abierta.fecha_entrega_estimada || 'sin fecha']].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-slate-50 px-3 py-2.5">
                      <p className="text-[10.5px] uppercase tracking-wider text-slate-400">{k}</p>
                      <p className="text-[14px] font-semibold tabular-nums">{v}</p>
                    </div>
                  ))}
                </div>

                {abierta.problema && (
                  <div className="mb-4">
                    <p className="mb-1 text-[10.5px] uppercase tracking-wider text-slate-400">Problema reportado</p>
                    <p className="text-[14px] leading-relaxed text-slate-700">{abierta.problema}</p>
                  </div>
                )}

                <div className="mb-4">
                  <p className="mb-1 text-[10.5px] uppercase tracking-wider text-slate-400">Descripción del trabajo</p>
                  <textarea rows={2} defaultValue={abierta.descripcion_trabajo || ''}
                    placeholder="Qué se va a hacer"
                    onBlur={(e) => {
                      if ((e.target.value || '') !== (abierta.descripcion_trabajo || '')) {
                        cambiar({ descripcion_trabajo: e.target.value }, 'desc')
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13.5px] text-slate-800 outline-none focus:border-blue-400" />
                </div>

                {!['entregado', 'anulada'].includes(abierta.estado) && (
                  <div className="flex gap-2">
                    <button onClick={() => cambiar({ estado: 'entregado' }, 'ent')} disabled={!!guardando}
                      className="flex-1 rounded-lg bg-blue-600 py-2.5 text-[13.5px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                      {guardando === 'ent' ? <Loader2 size={15} className="mx-auto animate-spin" /> : 'Marcar entregada'}
                    </button>
                    <button onClick={() => cambiar({ estado: 'anulada' }, 'anu')} disabled={!!guardando}
                      className="rounded-lg border border-slate-300 px-4 text-[13px] font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                      Anular
                    </button>
                  </div>
                )}
              </div>

              {abierta.importe_estimado != null && (
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="mb-1 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-slate-400">
                    <Euro size={13} /> Presupuesto
                  </p>
                  <p className="text-[30px] font-bold leading-none tabular-nums">{eur(abierta.importe_estimado)}</p>
                  <p className="mt-1 text-[13px] font-semibold text-slate-500">
                    {abierta.presupuesto === 'pendiente' && 'Pendiente de tu aprobación'}
                    {abierta.presupuesto === 'aprobado' && 'Aprobado'}
                    {abierta.presupuesto === 'rechazado' && 'No aprobado'}
                  </p>
                  {abierta.presupuesto === 'pendiente' && (
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => cambiar({ presupuesto: 'aprobado' }, 'ap')} disabled={!!guardando}
                        className="flex-1 rounded-lg bg-emerald-700 py-2.5 text-[13.5px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                        Aprobar
                      </button>
                      <button onClick={() => cambiar({ presupuesto: 'rechazado' }, 're')} disabled={!!guardando}
                        className="flex-1 rounded-lg border border-slate-300 py-2.5 text-[13.5px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                        No aprobar
                      </button>
                    </div>
                  )}
                  {abierta.importe_final != null && (
                    <p className="mt-3 text-[13.5px] text-slate-600">Importe final: <b>{eur(abierta.importe_final)}</b></p>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="mb-1 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-slate-400">
                  <Link2 size={13} /> Enlace para el taller
                </p>
                <p className="mb-3 text-[12.5px] leading-relaxed text-slate-500">
                  Se abre sin usuario ni contraseña. Desde ahí ponen el estado, suben fotos,
                  dicen la fecha y mandan el presupuesto.
                </p>

                {enlace && (
                  <p className={`mb-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] ${
                    abierta.abierto_en ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {abierta.abierto_en ? <Eye size={14} /> : <EyeOff size={14} />}
                    {abierta.abierto_en
                      ? `Lo abrió el ${cuando(abierta.abierto_en)}${abierta.visitas > 1 ? ` · ${abierta.visitas} visitas` : ''}`
                      : 'El taller todavía no lo ha abierto.'}
                  </p>
                )}
                {enlace && !abierta.abierto_en && abierta.taller_telefono && (
                  <a href={`tel:${abierta.taller_telefono}`}
                    className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-slate-300 py-2 text-[13px] font-semibold text-slate-600">
                    <PhoneCall size={14} /> Llamar ({abierta.taller_telefono})
                  </a>
                )}

                {enlace ? (
                  <>
                    <div className="mb-2 flex gap-2">
                      <input readOnly value={enlace.url}
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-[12px] text-slate-500" />
                      <button onClick={() => copiar(enlace.url)}
                        className="rounded-lg border border-slate-300 px-3 text-slate-500 hover:bg-slate-50">
                        {copiado ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                      </button>
                    </div>
                    {enlace.texto_whatsapp && (
                      <button onClick={() => window.open(
                        `https://wa.me/${(enlace.telefono_taller || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(enlace.texto_whatsapp)}`,
                        '_blank', 'noopener')}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 py-2.5 text-[13.5px] font-semibold text-white hover:bg-emerald-700">
                        <MessageCircle size={15} /> Mandarlo por WhatsApp
                      </button>
                    )}
                    <button onClick={() => window.open(enlace.url, '_blank', 'noopener')}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-50">
                      <Eye size={14} /> Ver lo que verá el taller
                    </button>
                    <button onClick={generarEnlace} disabled={guardando === 'enlace'}
                      className="mt-2 w-full text-[12px] text-slate-400 hover:text-slate-600">
                      Rehacer el enlace (el anterior deja de funcionar)
                    </button>
                  </>
                ) : (
                  <button onClick={generarEnlace} disabled={guardando === 'enlace'}
                    className="w-full rounded-lg bg-blue-600 py-2.5 text-[13.5px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    {guardando === 'enlace' ? <Loader2 size={15} className="mx-auto animate-spin" /> : 'Generar enlace'}
                  </button>
                )}
              </div>

              {!!(abierta.fotos || []).length && (
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="mb-2.5 text-[10.5px] uppercase tracking-wider text-slate-400">Fotos y evidencias</p>
                  <div className="grid grid-cols-3 gap-2">
                    {abierta.fotos.map((u, i) => (
                      <a key={u + i} href={u} target="_blank" rel="noreferrer">
                        <img src={u} alt="" loading="lazy"
                          className="aspect-square w-full rounded-lg border border-slate-200 object-cover transition hover:opacity-90" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="mb-3 text-[10.5px] uppercase tracking-wider text-slate-400">Actualizaciones</p>
                <ol className="space-y-3">
                  {[...(abierta.historial || [])].reverse().map((h, i) => (
                    <li key={h.cuando + i} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-blue-500" />
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold text-slate-800">{h.que}</p>
                        {h.detalle && <p className="text-[13px] leading-snug text-slate-500">{h.detalle}</p>}
                        <p className="text-[11.5px] text-slate-400">{cuando(h.cuando)} · {h.quien}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ NÚMEROS ═══════════════════════════════════════════════ */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-3 text-[10.5px] uppercase tracking-wider text-slate-400">Resumen del taller</p>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi etiqueta="Órdenes activas" valor={resumen?.activas ?? '—'} icono={Wrench} tono="blue" />
            <Kpi etiqueta="Esperando piezas" valor={resumen?.esperando_piezas ?? '—'} icono={Package} tono="orange" />
            <Kpi etiqueta="Entregadas hoy" valor={resumen?.completadas_hoy ?? '—'} icono={Check} tono="emerald" />
            <Kpi etiqueta="Días de media" valor={resumen?.dias_medios ?? 'sin datos'} icono={Clock}
              pie={resumen?.medidas_sobre ? `sobre ${resumen.medidas_sobre} entregadas` : ''} />
          </div>

          <div className="flex flex-wrap items-center gap-5 border-t border-slate-100 pt-4">
            {totalAbiertas ? (
              <>
                <Rosco datos={reparto} total={totalAbiertas} />
                <ul className="min-w-[11rem] flex-1 space-y-1.5">
                  {reparto.map((x) => (
                    <li key={x.id}>
                      <button onClick={() => setFiltro(x.id)}
                        className="flex w-full items-center gap-2.5 rounded px-1 py-1 text-left hover:bg-slate-50">
                        <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: PUNTO[x.id] }} />
                        <span className="text-[13.5px] text-slate-600">{x.txt}</span>
                        <span className="ml-auto text-[13.5px] font-semibold tabular-nums">{x.n}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="py-4 text-[13.5px] text-slate-400">No hay órdenes abiertas ahora mismo.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-3 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-slate-400">
            <CalendarClock size={13} /> Próximas entregas
          </p>
          {!proximas.length ? (
            <p className="py-4 text-[13.5px] leading-relaxed text-slate-400">
              Ninguna orden abierta tiene fecha de entrega todavía. Es lo primero que
              conviene pedirle al taller.
            </p>
          ) : (
            <ul className="space-y-1">
              {proximas.map((o) => {
                const tarde = o.fecha_entrega_estimada < hoyIso()
                return (
                  <li key={o.id}>
                    <button onClick={() => abrirFicha(o.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
                      <span className="text-[14px] font-bold tracking-tight">{o.matricula}</span>
                      <span className="truncate text-[12.5px] text-slate-400">{o.taller_nombre}</span>
                      <span className={`ml-auto flex-none text-[13px] tabular-nums ${
                        tarde ? 'font-bold text-red-600' : 'text-slate-600'}`}>
                        {o.fecha_entrega_estimada === hoyIso() ? 'hoy' : o.fecha_entrega_estimada}
                        {tarde && ' · pasada'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ══ ALTA ══════════════════════════════════════════════════ */}
      {nueva && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setNueva(null)}>
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center gap-2">
              <h2 className="text-[19px] font-bold">Nueva orden de trabajo</h2>
              <button onClick={() => setNueva(null)} className="ml-auto text-slate-400 hover:text-slate-700"><X size={19} /></button>
            </div>

            <Buscador etiqueta="Furgoneta" valor={nueva.vehicle_id} placeholder="Escribe la matrícula…"
              opciones={vehiculos.map((v) => ({ id: v.id, txt: `${v.license_plate} · ${v.model || 'sin modelo'}` }))}
              onElegir={(id) => setNueva({ ...nueva, vehicle_id: id })} />

            {tallerNuevo ? (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="mb-2 text-[12.5px] font-semibold text-blue-700">Taller nuevo</p>
                <input autoFocus value={tallerNuevo.name} placeholder="Nombre (p. ej. Midas Santiago)"
                  onChange={(e) => setTallerNuevo({ ...tallerNuevo, name: e.target.value })}
                  className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px]" />
                <input value={tallerNuevo.phone} placeholder="Teléfono (para mandarle el enlace)"
                  onChange={(e) => setTallerNuevo({ ...tallerNuevo, phone: e.target.value })}
                  className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px]" />
                <div className="flex gap-2">
                  <button onClick={guardarTallerNuevo} disabled={!tallerNuevo.name.trim() || guardando === 'taller'}
                    className="flex-1 rounded-lg bg-blue-600 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
                    {guardando === 'taller' ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'Guardar taller'}
                  </button>
                  <button onClick={() => setTallerNuevo(null)}
                    className="rounded-lg border border-slate-300 px-3 text-[13px] text-slate-500">Cancelar</button>
                </div>
              </div>
            ) : (
              <Buscador etiqueta="Taller" valor={nueva.workshop_id} placeholder="Escribe el nombre del taller…"
                opciones={talleres.map((w) => ({ id: w.id, txt: w.name }))}
                onElegir={(id) => setNueva({ ...nueva, workshop_id: id })}
                pie={(
                  <button onClick={() => setTallerNuevo({ name: '', phone: '' })}
                    className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-600 hover:text-blue-700">
                    <Plus size={13} /> No está en la lista, darlo de alta
                  </button>
                )} />
            )}

            {!!incidencias.length && !nueva.incident_id && (
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-600">
                  <Images size={14} className="text-blue-600" />
                  Esta furgoneta tiene {incidencias.length === 1 ? '1 incidencia abierta' : `${incidencias.length} incidencias abiertas`}
                </p>
                <div className="space-y-1.5">
                  {incidencias.slice(0, 4).map((inc) => (
                    <button key={inc.id}
                      onClick={() => setNueva({ ...nueva, incident_id: inc.id,
                        problema: nueva.problema || inc.description || inc.title || '' })}
                      className="block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left hover:border-blue-300">
                      <span className="block truncate text-[13px] text-slate-700">{inc.title || inc.description}</span>
                      {!!(inc.photos || []).length && (
                        <span className="text-[11.5px] text-blue-600">
                          {inc.photos.length} foto{inc.photos.length > 1 ? 's' : ''} — se las lleva la orden
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {nueva.incident_id && (
              <p className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12.5px] text-blue-700">
                <Check size={14} /> Se creará desde la incidencia, con sus fotos.
                <button onClick={() => setNueva({ ...nueva, incident_id: null })}
                  className="ml-auto text-[12px] text-slate-500 hover:text-slate-700">quitar</button>
              </p>
            )}

            <label className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">Qué le pasa</label>
            <textarea rows={3} value={nueva.problema}
              onChange={(e) => setNueva({ ...nueva, problema: e.target.value })}
              placeholder="Frenos hacen ruido y testigo ABS encendido"
              className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[14px]" />

            <label className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">
              Entrega prevista <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input type="date" min={hoyIso()} value={nueva.fecha_entrega_estimada}
              onChange={(e) => setNueva({ ...nueva, fecha_entrega_estimada: e.target.value })}
              className="mb-5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[14px]" />

            <button onClick={crear}
              disabled={!nueva.vehicle_id || !nueva.workshop_id || guardando === 'crear'}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-[14.5px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
              {guardando === 'crear' ? <Loader2 size={16} className="animate-spin" /> : <><Plus size={16} /> Crear y generar enlace</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
