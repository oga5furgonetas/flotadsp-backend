import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, Plus, Link2, Copy, Check, X, Wrench, Euro, Clock,
  AlertTriangle, MessageCircle, Package, Search, Eye, EyeOff, PhoneCall,
  Download, CalendarClock, HelpCircle, Images, BarChart3,
} from 'lucide-react'
import {
  getOrdenes, getResumenOrdenes, getOrden, crearOrden, editarOrden, enlaceOrden,
  getVehicles, getWorkshops, crearTaller, exportarOrdenes, ordenesPorTaller,
  getIncidents,
} from '../api'

/* ÓRDENES DE TRABAJO — el lado de la oficina.
   ───────────────────────────────────────────────────────────────────────
   La pantalla contesta tres preguntas, en este orden, porque es el orden en
   que se hacen de verdad: ¿qué furgonetas están fuera?, ¿alguna me está
   esperando a mí?, ¿cuál se está eternizando? Todo lo demás es secundario. */

const COLOR = {
  abierta: 'bg-dark-700/50 text-dark-300 border-dark-600',
  recibido: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  diagnostico: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  esperando_piezas: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  reparando: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  listo: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  entregado: 'bg-dark-700/40 text-dark-400 border-dark-700',
  anulada: 'bg-dark-700/40 text-dark-500 border-dark-700',
}

/* El orden NO es alfabetico: es el camino que recorre una furgoneta por el
   taller. Asi el reparto se lee como un embudo y se ve donde se atasca. */
const OT_ABIERTAS_ORDEN = ['abierta', 'recibido', 'diagnostico', 'esperando_piezas', 'reparando', 'listo']

const BARRA = {
  abierta: 'bg-dark-600',
  recibido: 'bg-sky-500',
  diagnostico: 'bg-violet-500',
  esperando_piezas: 'bg-amber-500',
  reparando: 'bg-blue-500',
  listo: 'bg-emerald-500',
}

const eur = (n) => (n == null ? '—'
  : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n))

const cuando = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/* "hace 2 h" en vez de una fecha: lo que se quiere saber de un vistazo no es
   cuándo fue, es si es reciente. */
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

/* Días que lleva fuera. Con esto se ve de un vistazo la que se ha quedado
   olvidada en un taller, que es el dinero que se va sin que nadie lo mire. */
const diasFuera = (entrada) => {
  if (!entrada) return null
  const d = new Date(entrada + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return null
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000))
}

/* Un desplegable normal con 176 furgonetas dentro es inservible: hay que
   bajar rodando hasta encontrar la matricula. Esto filtra según escribes. */
function Buscador({ etiqueta, valor, opciones, onElegir, placeholder, pie }) {
  const [txt, setTxt] = useState('')
  const [abierto, setAbierto] = useState(false)
  const elegida = opciones.find((o) => o.id === valor)
  const filtradas = txt.trim()
    ? opciones.filter((o) => o.txt.toLowerCase().includes(txt.trim().toLowerCase())).slice(0, 40)
    : opciones.slice(0, 40)

  return (
    <div className="mb-3">
      <label className="mb-1 block text-[12px] font-semibold text-dark-400">{etiqueta}</label>
      {elegida && !abierto ? (
        <button
          onClick={() => { setAbierto(true); setTxt('') }}
          className="flex w-full items-center gap-2 rounded-lg border border-brand-500/60 bg-brand-500/10 px-3 py-2.5 text-left text-[14px] text-dark-100"
        >
          <Check size={14} className="flex-none text-brand-400" />
          <span className="truncate">{elegida.txt}</span>
          <span className="ml-auto text-[12px] text-dark-500">cambiar</span>
        </button>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-900 px-3">
            <Search size={14} className="flex-none text-dark-500" />
            <input
              autoFocus={abierto} value={txt} placeholder={placeholder}
              onChange={(e) => setTxt(e.target.value)}
              className="w-full bg-transparent py-2.5 text-[14px] text-dark-100 outline-none"
            />
          </div>
          <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-dark-800">
            {filtradas.length ? filtradas.map((o) => (
              <button
                key={o.id}
                onClick={() => { onElegir(o.id); setAbierto(false); setTxt('') }}
                className="block w-full px-3 py-2 text-left text-[13.5px] text-dark-200 hover:bg-dark-800"
              >
                {o.txt}
              </button>
            )) : (
              <p className="px-3 py-3 text-[13px] text-dark-500">Nada con ese nombre.</p>
            )}
          </div>
          {pie}
        </>
      )}
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
  const [verComo, setVerComo] = useState(false)
  const [bajando, setBajando] = useState(false)

  const [abierta, setAbierta] = useState(null)      // orden del panel lateral
  const [enlace, setEnlace] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const [guardando, setGuardando] = useState('')

  const [nueva, setNueva] = useState(null)          // formulario de alta
  const [tallerNuevo, setTallerNuevo] = useState(null)  // alta al vuelo
  const [incidencias, setIncidencias] = useState([])
  const [comparativa, setComparativa] = useState(null)
  const [vehiculos, setVehiculos] = useState([])
  const [talleres, setTalleres] = useState([])

  const cargar = useCallback(async () => {
    setCargando(true); setErr('')
    try {
      const params = { ...(center && center !== 'Todos' ? { center } : {}) }
      if (filtro === 'abiertas') params.abiertas = true
      else if (filtro !== 'todas') params.estado = filtro
      if (filtroTaller) params.workshop_id = filtroTaller
      const [l, r] = await Promise.all([getOrdenes(params), getResumenOrdenes(center)])
      setDatos(l.data)
      setResumen(r.data)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudieron cargar las órdenes.')
    } finally { setCargando(false) }
  }, [center, filtro, filtroTaller])

  useEffect(() => { cargar() }, [cargar])

  /* Los talleres se cargan al entrar, no solo al crear una orden: hacen falta
     para el filtro de arriba. */
  useEffect(() => {
    getWorkshops().then((r) => setTalleres(r.data || [])).catch(() => {})
  }, [])

  const estados = datos?.estados || {}

  const abrirFicha = async (id) => {
    setEnlace(null); setCopiado(false)
    try {
      const r = await getOrden(id)
      setAbierta(r.data)
      if (r.data.enlace) setEnlace({ url: r.data.enlace, expira_en: r.data.enlace_expira })
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

  const abrirAlta = async () => {
    setNueva({ vehicle_id: '', workshop_id: '', problema: '', fecha_entrega_estimada: '' })
    if (!vehiculos.length) {
      try {
        const [v, w] = await Promise.all([getVehicles(center), getWorkshops()])
        setVehiculos(v.data || [])
        setTalleres(w.data || [])
      } catch { /* el formulario avisa solo si quedan vacíos */ }
    }
  }

  /* Midas no estaba en la lista y habia que irse a otra pantalla a darlo de
     alta, perdiendo lo escrito. Ahora se crea aqui con lo minimo —nombre y
     telefono— y queda seleccionado. El resto de la ficha se rellena luego en
     Talleres si hace falta. */
  const guardarTallerNuevo = async () => {
    const nombre = (tallerNuevo?.name || '').trim()
    if (!nombre) return
    setGuardando('taller')
    try {
      const r = await crearTaller({
        name: nombre,
        phone: (tallerNuevo.phone || '').trim(),
        ...(center && center !== 'Todos' ? { center } : {}),
      })
      const creado = r.data
      setTalleres((prev) => [creado, ...prev])
      setNueva((n) => ({ ...n, workshop_id: creado.id }))
      setTallerNuevo(null)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo crear el taller.')
    } finally { setGuardando('') }
  }

  /* Las incidencias YA ABIERTAS de esa furgoneta. Casi siempre la orden nace
     de una: el daño ya está descrito y fotografiado, y volver a escribirlo es
     trabajo tirado — además de que el taller acaba sin las fotos. */
  useEffect(() => {
    if (!nueva?.vehicle_id) { setIncidencias([]); return }
    getIncidents({ vehicle_id: nueva.vehicle_id })
      .then((r) => setIncidencias((r.data || []).filter((x) => x.status === 'open')))
      .catch(() => setIncidencias([]))
  }, [nueva?.vehicle_id])

  const verComparativa = async () => {
    if (comparativa) { setComparativa(null); return }
    try {
      const r = await ordenesPorTaller(center)
      setComparativa(r.data?.talleres || [])
    } catch {
      setErr('No se pudo calcular la comparativa.')
    }
  }

  const crear = async () => {
    setGuardando('crear')
    try {
      const r = await crearOrden(nueva)
      setNueva(null)
      await cargar()
      await abrirFicha(r.data.id)
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
      el.download = `ordenes-taller-${new Date().toISOString().slice(0, 10)}.xlsx`
      el.click()
      URL.revokeObjectURL(url)
    } catch {
      setErr('No se pudo generar el Excel.')
    } finally { setBajando(false) }
  }

  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true); setTimeout(() => setCopiado(false), 2500)
    } catch {
      setErr('El navegador no ha dejado copiar. Selecciona el enlace a mano.')
    }
  }

  /* Se cuenta desde `datos` y no desde `ordenes`: `datos?.ordenes || []` crea
     un array nuevo en cada render y useMemo no memorizaria nada. */
  const pendientes = useMemo(
    () => (datos?.ordenes || []).filter((o) => o.presupuesto === 'pendiente').length,
    [datos])
  const ordenes = datos?.ordenes || []

  return (
    <div className="space-y-4">
      {/* ── Cabecera ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-dark-50">Órdenes de trabajo</h1>
          <p className="text-[13px] text-dark-500">
            Lo que está en el taller, sin llamar a nadie.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setVerComo((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-dark-700 px-2.5 py-1.5 text-[12.5px] font-semibold text-dark-400 hover:text-dark-200">
            <HelpCircle size={14} /> Cómo funciona
          </button>
          <button onClick={verComparativa}
            className="flex items-center gap-1.5 rounded-lg border border-dark-700 px-2.5 py-1.5 text-[12.5px] font-semibold text-dark-400 hover:text-dark-200">
            <BarChart3 size={14} /> Comparar talleres
          </button>
          <button onClick={descargar} disabled={bajando}
            className="flex items-center gap-1.5 rounded-lg border border-dark-700 px-2.5 py-1.5 text-[12.5px] font-semibold text-dark-400 hover:text-dark-200 disabled:opacity-50">
            {bajando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Excel
          </button>
          <button onClick={abrirAlta} className="btn-primary flex items-center gap-1.5 text-[13px]">
            <Plus size={15} /> Nueva orden
          </button>
        </div>
      </div>

      {/* Los cinco pasos. Plegado por defecto: sirve la primera vez y para
          enseñárselo a alguien, no todos los días. */}
      {verComo && (
        <div className="card p-4">
          <div className="grid gap-3 md:grid-cols-5">
            {[
              ['1', 'Creas la orden', 'Furgoneta, taller y qué le pasa. La furgoneta se marca en taller sola.'],
              ['2', 'Mandas el enlace', 'Por WhatsApp, con un botón. El taller no se registra ni instala nada.'],
              ['3', 'El taller escribe', 'Estado, fotos, fecha de entrega y presupuesto, desde su móvil.'],
              ['4', 'Te avisa', 'Telegram cuando está lista, falta una pieza o se mueve la fecha.'],
              ['5', 'Se cierra', 'Marcas entregada, la furgoneta vuelve a activa y queda el historial.'],
            ].map(([n, tit, txt]) => (
              <div key={n} className="rounded-lg border border-dark-800 bg-dark-900/60 p-3">
                <span className="text-[11px] font-bold text-brand-400">{n}</span>
                <p className="mt-1 text-[13.5px] font-bold text-dark-100">{tit}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-dark-400">{txt}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">{err}</p>
      )}

      {/* ── Los cuatro números ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { k: 'Órdenes activas', v: resumen?.activas ?? '—', i: Wrench },
          { k: 'Esperando piezas', v: resumen?.esperando_piezas ?? '—', i: Package },
          { k: 'Entregadas hoy', v: resumen?.completadas_hoy ?? '—', i: Check },
          {
            k: 'Días de media',
            /* Sin órdenes entregadas con las dos fechas no hay media que dar.
               Antes de inventar un 0, se dice que no hay dato. */
            v: resumen?.dias_medios ?? 'sin datos',
            i: Clock,
            pie: resumen?.medidas_sobre ? `sobre ${resumen.medidas_sobre} entregadas` : '',
          },
        ].map(({ k, v, i: Icono, pie }) => (
          <div key={k} className="card p-3.5">
            <div className="mb-1 flex items-center gap-1.5 text-dark-500">
              <Icono size={13} />
              <p className="text-[10.5px] font-semibold uppercase tracking-wider">{k}</p>
            </div>
            <p className="text-[26px] font-bold leading-none tabular-nums text-dark-50">{v}</p>
            {pie && <p className="mt-1 text-[11px] text-dark-600">{pie}</p>}
          </div>
        ))}
      </div>

      {/* Lo que de verdad quita llamadas: saber cuál no se mueve y cuál ni
          han abierto. Son dos avisos distintos porque piden cosas distintas
          —una es esperar, la otra es coger el teléfono. */}
      {!!resumen?.sin_abrir && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/[0.08] px-3 py-2.5 text-[13.5px] text-red-200">
          <EyeOff size={16} className="flex-none" />
          {resumen.sin_abrir === 1
            ? 'Hay 1 orden que el taller no ha abierto todavía.'
            : `Hay ${resumen.sin_abrir} órdenes que el taller no ha abierto todavía.`}
          {' '}Comprueba que les llegó el enlace.
        </div>
      )}
      {!!resumen?.paradas && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.08] px-3 py-2.5 text-[13.5px] text-amber-200">
          <Clock size={16} className="flex-none" />
          {resumen.paradas === 1 ? '1 orden lleva' : `${resumen.paradas} órdenes llevan`}
          {' '}más de {resumen.dias_parada} días sin novedades del taller.
        </div>
      )}

      {!!pendientes && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.08] px-3 py-2.5 text-[13.5px] text-amber-200">
          <AlertTriangle size={16} className="flex-none" />
          {pendientes === 1
            ? 'Hay 1 presupuesto esperando tu aprobación.'
            : `Hay ${pendientes} presupuestos esperando tu aprobación.`}
        </div>
      )}

      {/* COMPARATIVA ENTRE TALLERES.
          Hoy se decide de memoria a dónde mandar la siguiente. Aquí se ve
          cuál tarda menos y cuál cobra más, contado solo sobre las ENTREGADAS:
          la media de días de una orden abierta no significa nada. */}
      {comparativa && (
        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 size={16} className="text-brand-400" />
            <h2 className="text-[14px] font-bold text-dark-100">Comparativa de talleres</h2>
            <span className="text-[12px] text-dark-500">solo órdenes ya entregadas</span>
            <button onClick={() => setComparativa(null)} className="ml-auto text-dark-500 hover:text-dark-200">
              <X size={16} />
            </button>
          </div>
          {!comparativa.length ? (
            <p className="py-3 text-[13.5px] text-dark-500">
              Todavía no hay ninguna orden entregada. En cuanto cierres unas cuantas,
              aquí verás cuál tarda menos y cuál cobra más.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-dark-800">
                  <tr className="text-[10.5px] uppercase tracking-wider text-dark-600">
                    <th className="px-2 py-2 font-semibold">Taller</th>
                    <th className="px-2 py-2 text-right font-semibold">Órdenes</th>
                    <th className="px-2 py-2 text-right font-semibold">Días de media</th>
                    <th className="px-2 py-2 text-right font-semibold">Importe medio</th>
                    <th className="px-2 py-2 text-right font-semibold">Gasto total</th>
                    <th className="px-2 py-2 text-right font-semibold">Usan el enlace</th>
                  </tr>
                </thead>
                <tbody>
                  {comparativa.map((x, i) => (
                    <tr key={x.workshop_id} className={`border-t border-dark-800/70 ${i % 2 ? 'bg-dark-800/[0.12]' : ''}`}>
                      <td className="px-2 py-2 text-dark-100">{x.taller}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-dark-300">{x.ordenes}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-dark-200">
                        {/* 'sin datos' y '0 días' no son lo mismo, y confundirlos
                            haría parecer instantáneo al que no hemos medido. */}
                        {x.dias_medios == null
                          ? <span className="text-dark-600">sin datos</span>
                          : <><b>{x.dias_medios}</b>
                              <span className="ml-1 text-[11px] text-dark-600">de {x.medidas_sobre}</span></>}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-dark-300">{eur(x.importe_medio)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-dark-200">{eur(x.gasto_total)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${
                        x.usan_el_enlace >= 80 ? 'text-emerald-400/80'
                          : x.usan_el_enlace >= 40 ? 'text-dark-300' : 'text-red-300'}`}>
                        {x.usan_el_enlace}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[12px] leading-relaxed text-dark-500">
                «Usan el enlace» es cuántas de sus órdenes llegaron a abrir. Por debajo
                del 40 % no es que el taller sea malo: es que a ese hay que seguir
                llamándole, y conviene saberlo.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Reparto por estado y próximas entregas ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-dark-500">
            Órdenes por estado
          </h2>
          {(() => {
            const reparto = OT_ABIERTAS_ORDEN
              .map((id) => ({ id, txt: estados[id] || id, n: resumen?.por_estado?.[id] || 0 }))
              .filter((x) => x.n)
            const total = reparto.reduce((s, x) => s + x.n, 0)
            if (!total) return <p className="py-4 text-[13px] text-dark-500">No hay órdenes abiertas.</p>
            return (
              <div className="space-y-2">
                {reparto.map((x) => (
                  <button key={x.id} onClick={() => setFiltro(x.id)}
                    className="flex w-full items-center gap-3 text-left">
                    <span className="w-36 flex-none truncate text-[13px] text-dark-300">{x.txt}</span>
                    <span className="h-3 flex-1 overflow-hidden rounded-sm bg-dark-800">
                      <span className={`block h-full rounded-sm ${BARRA[x.id] || 'bg-dark-600'}`}
                        style={{ width: `${Math.round((x.n / total) * 100)}%` }} />
                    </span>
                    <span className="w-7 flex-none text-right text-[13px] font-semibold tabular-nums text-dark-200">
                      {x.n}
                    </span>
                  </button>
                ))}
              </div>
            )
          })()}
        </div>

        <div className="card p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-dark-500">
            <CalendarClock size={13} /> Próximas entregas
          </h2>
          {(() => {
            /* Solo abiertas y CON fecha: una lista de "próximas entregas" que
               incluyera las que no tienen fecha estaría mintiendo. */
            const hoy = new Date().toISOString().slice(0, 10)
            const prox = ordenes
              .filter((o) => o.fecha_entrega_estimada && !['entregado', 'anulada'].includes(o.estado))
              .sort((x, y) => x.fecha_entrega_estimada.localeCompare(y.fecha_entrega_estimada))
              .slice(0, 6)
            if (!prox.length) {
              return (
                <p className="py-4 text-[13px] leading-relaxed text-dark-500">
                  Ninguna orden abierta tiene fecha de entrega todavía. Es lo primero
                  que conviene pedirle al taller.
                </p>
              )
            }
            return (
              <ul className="space-y-1.5">
                {prox.map((o) => {
                  const tarde = o.fecha_entrega_estimada < hoy
                  return (
                    <li key={o.id}>
                      <button onClick={() => abrirFicha(o.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-dark-800/40">
                        <span className="text-[13.5px] font-semibold text-dark-100">{o.matricula}</span>
                        <span className="truncate text-[12.5px] text-dark-500">{o.taller_nombre}</span>
                        <span className={`ml-auto flex-none text-[13px] tabular-nums ${
                          tarde ? 'font-bold text-red-300' : 'text-dark-300'}`}>
                          {o.fecha_entrega_estimada === hoy ? 'hoy' : o.fecha_entrega_estimada}
                          {tarde && ' · pasada'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )
          })()}
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap gap-1.5">
        {[['abiertas', 'Abiertas'], ['todas', 'Todas'],
          ...Object.entries(estados)].map(([id, txt]) => (
          <button
            key={id} onClick={() => setFiltro(id)}
            className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition ${
              filtro === id
                ? 'border-brand-500 bg-brand-500/15 text-brand-200'
                : 'border-dark-700 text-dark-400 hover:text-dark-200'}`}
          >
            {txt}
            {resumen?.por_estado?.[id] != null && (
              <span className="ml-1.5 text-dark-500">{resumen.por_estado[id]}</span>
            )}
          </button>
        ))}
      </div>

      {talleres.length > 1 && (
        <select value={filtroTaller} onChange={(e) => setFiltroTaller(e.target.value)}
          className="rounded-lg border border-dark-700 bg-dark-900 px-3 py-1.5 text-[12.5px] text-dark-200">
          <option value="">Todos los talleres</option>
          {talleres.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      )}

      {/* ── Lista ── */}
      <div className="card overflow-hidden">
        {cargando ? (
          <div className="flex justify-center py-14"><Loader2 size={22} className="animate-spin text-brand-400" /></div>
        ) : !ordenes.length ? (
          <p className="py-14 text-center text-[14px] text-dark-500">
            No hay órdenes {filtro === 'abiertas' ? 'abiertas' : 'con ese filtro'}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-dark-800 bg-dark-900/60">
                <tr className="text-[10.5px] uppercase tracking-wider text-dark-600">
                  <th className="px-3 py-2.5 font-semibold">Orden</th>
                  <th className="px-3 py-2.5 font-semibold">Furgoneta</th>
                  <th className="px-3 py-2.5 font-semibold">Taller</th>
                  <th className="px-3 py-2.5 font-semibold">Estado</th>
                  <th className="px-3 py-2.5 font-semibold">Taller</th>
                  <th className="px-3 py-2.5 font-semibold">Entrega</th>
                  <th className="px-3 py-2.5 font-semibold">Actualizada</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Días fuera</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Importe</th>
                </tr>
              </thead>
              <tbody>
                {ordenes.map((o, i) => {
                  const d = diasFuera(o.fecha_entrada)
                  const cerrada = ['entregado', 'anulada'].includes(o.estado)
                  return (
                    <tr
                      key={o.id} onClick={() => abrirFicha(o.id)}
                      className={`cursor-pointer border-t border-dark-800/70 hover:bg-dark-800/30 ${i % 2 ? 'bg-dark-800/[0.12]' : ''}`}
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-dark-200">{o.numero}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-dark-100">{o.matricula}</td>
                      <td className="max-w-[14rem] truncate px-3 py-2.5 text-dark-400">{o.taller_nombre}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[11.5px] font-semibold ${COLOR[o.estado] || COLOR.abierta}`}>
                          {estados[o.estado] || o.estado}
                        </span>
                        {o.presupuesto === 'pendiente' && (
                          <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-300">
                            presupuesto
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {cerrada ? <span className="text-dark-600">—</span>
                          : o.abierto_en
                            ? <span className="flex items-center gap-1 text-[12px] text-emerald-400/80">
                                <Eye size={12} /> lo ve
                              </span>
                            : <span className="flex items-center gap-1 text-[12px] text-red-300">
                                <EyeOff size={12} /> sin abrir
                              </span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-dark-400">
                        {o.fecha_entrega_estimada || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-dark-500">
                        {haceCuanto(o.actualizada_en)}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${!cerrada && d > 10 ? 'font-bold text-amber-300' : 'text-dark-400'}`}>
                        {cerrada ? '—' : (d ?? '—')}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-dark-300">
                        {eur(o.importe_final ?? o.importe_estimado)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══ FICHA ══════════════════════════════════════════════════════ */}
      {abierta && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setAbierta(null)}>
          <div
            className="h-full w-full max-w-xl overflow-y-auto border-l border-dark-800 bg-dark-950 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-400">
                  {abierta.numero}
                </p>
                <h2 className="text-2xl font-bold text-dark-50">{abierta.matricula}</h2>
                <p className="text-[13px] text-dark-400">{abierta.taller_nombre}</p>
              </div>
              <button onClick={() => setAbierta(null)} className="ml-auto text-dark-500 hover:text-dark-200">
                <X size={20} />
              </button>
            </div>

            {/* El enlace: lo que se manda al taller */}
            <section className="card mb-4 p-4">
              <h3 className="mb-1 flex items-center gap-2 text-[14px] font-bold text-dark-100">
                <Link2 size={16} className="text-brand-400" /> Enlace para el taller
              </h3>
              <p className="mb-3 text-[12.5px] leading-relaxed text-dark-500">
                Se abre sin usuario ni contraseña. Desde ahí ponen el estado, suben fotos,
                dicen la fecha y mandan el presupuesto.
              </p>
              {/* Antes de nada: ¿lo han abierto siquiera? */}
              {enlace && (
                <p className={`mb-3 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] ${
                  abierta.abierto_en
                    ? 'border-emerald-600/40 bg-emerald-600/[0.08] text-emerald-200'
                    : 'border-red-500/40 bg-red-500/[0.08] text-red-200'}`}>
                  {abierta.abierto_en ? <Eye size={14} /> : <EyeOff size={14} />}
                  {abierta.abierto_en
                    ? `El taller lo abrió el ${cuando(abierta.abierto_en)}${abierta.visitas > 1 ? ` · ${abierta.visitas} visitas` : ''}`
                    : 'El taller todavía no lo ha abierto.'}
                </p>
              )}
              {enlace && !abierta.abierto_en && abierta.taller_telefono && (
                <a href={`tel:${abierta.taller_telefono}`}
                  className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-dark-700 py-2 text-[13px] font-semibold text-dark-300">
                  <PhoneCall size={14} /> Llamar al taller ({abierta.taller_telefono})
                </a>
              )}
              {enlace ? (
                <>
                  <div className="mb-2 flex gap-2">
                    <input
                      readOnly value={enlace.url}
                      className="flex-1 rounded-lg border border-dark-700 bg-dark-900 px-2.5 py-2 text-[12px] text-dark-300"
                    />
                    <button onClick={() => copiar(enlace.url)}
                      className="rounded-lg border border-dark-700 px-3 text-dark-300 hover:text-dark-100">
                      {copiado ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                    </button>
                  </div>
                  {enlace.texto_whatsapp && (
                    <button
                      onClick={() => window.open(
                        `https://wa.me/${(enlace.telefono_taller || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(enlace.texto_whatsapp)}`,
                        '_blank', 'noopener')}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-600/50 bg-emerald-600/10 py-2.5 text-[13.5px] font-semibold text-emerald-300"
                    >
                      <MessageCircle size={15} /> Mandarlo por WhatsApp
                    </button>
                  )}
                  <button
                    onClick={() => window.open(enlace.url, '_blank', 'noopener')}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dark-700 py-2 text-[13px] font-semibold text-dark-300 hover:text-dark-100"
                  >
                    <Eye size={14} /> Ver lo que verá el taller
                  </button>
                  {enlace.expira_en && (
                    <p className="mt-2 text-[11.5px] text-dark-600">
                      Caduca el {String(enlace.expira_en).slice(0, 10)}
                    </p>
                  )}
                </>
              ) : (
                <button onClick={generarEnlace} disabled={guardando === 'enlace'}
                  className="btn-primary w-full text-[13.5px] disabled:opacity-50">
                  {guardando === 'enlace' ? <Loader2 size={15} className="animate-spin" /> : 'Generar enlace'}
                </button>
              )}
              {enlace && (
                <button onClick={generarEnlace} disabled={guardando === 'enlace'}
                  className="mt-2 w-full text-[12px] text-dark-500 hover:text-dark-300">
                  Rehacer el enlace (el anterior deja de funcionar)
                </button>
              )}
            </section>

            {/* Presupuesto */}
            {abierta.importe_estimado != null && (
              <section className="card mb-4 p-4">
                <h3 className="mb-2 flex items-center gap-2 text-[14px] font-bold text-dark-100">
                  <Euro size={16} className="text-brand-400" /> Presupuesto
                </h3>
                <p className="mb-3 text-[20px] font-bold tabular-nums text-dark-50">
                  {eur(abierta.importe_estimado)}
                  <span className="ml-2 text-[13px] font-semibold text-dark-400">
                    {abierta.presupuesto === 'pendiente' && 'pendiente'}
                    {abierta.presupuesto === 'aprobado' && 'aprobado'}
                    {abierta.presupuesto === 'rechazado' && 'no aprobado'}
                  </span>
                </p>
                {abierta.presupuesto === 'pendiente' && (
                  <div className="flex gap-2">
                    <button onClick={() => cambiar({ presupuesto: 'aprobado' }, 'ap')}
                      disabled={!!guardando}
                      className="btn-primary flex-1 text-[13.5px] disabled:opacity-50">Aprobar</button>
                    <button onClick={() => cambiar({ presupuesto: 'rechazado' }, 're')}
                      disabled={!!guardando}
                      className="flex-1 rounded-lg border border-dark-700 py-2 text-[13.5px] font-semibold text-dark-300 disabled:opacity-50">
                      No aprobar
                    </button>
                  </div>
                )}
                {abierta.importe_final != null && (
                  <p className="mt-2 text-[13px] text-dark-300">
                    Importe final: <b className="text-dark-100">{eur(abierta.importe_final)}</b>
                  </p>
                )}
              </section>
            )}

            {/* Datos y cierre */}
            <section className="card mb-4 p-4">
              <div className="mb-3 grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <p className="text-[10.5px] uppercase tracking-wider text-dark-600">Entrada</p>
                  <p className="text-dark-200">{abierta.fecha_entrada || '—'}</p>
                </div>
                <div>
                  <p className="text-[10.5px] uppercase tracking-wider text-dark-600">Entrega prevista</p>
                  <p className="text-dark-200">{abierta.fecha_entrega_estimada || 'sin fecha'}</p>
                </div>
              </div>
              <div className="mb-3">
                <p className="mb-1 text-[10.5px] uppercase tracking-wider text-dark-600">
                  Descripción del trabajo
                </p>
                <textarea
                  rows={2} defaultValue={abierta.descripcion_trabajo || ''}
                  placeholder="Qué se va a hacer (lo puedes escribir tú o dictártelo el taller)"
                  onBlur={(e) => {
                    if ((e.target.value || '') !== (abierta.descripcion_trabajo || '')) {
                      cambiar({ descripcion_trabajo: e.target.value }, 'desc')
                    }
                  }}
                  className="w-full rounded-lg border border-dark-800 bg-dark-900 px-3 py-2 text-[13.5px] text-dark-200"
                />
              </div>
              {abierta.problema && (
                <p className="mb-3 rounded-lg border border-dark-800 bg-dark-900 px-3 py-2 text-[13.5px] leading-relaxed text-dark-300">
                  {abierta.problema}
                </p>
              )}
              {!['entregado', 'anulada'].includes(abierta.estado) && (
                <div className="flex gap-2">
                  <button onClick={() => cambiar({ estado: 'entregado' }, 'ent')}
                    disabled={!!guardando}
                    className="btn-primary flex-1 text-[13.5px] disabled:opacity-50">
                    {guardando === 'ent' ? <Loader2 size={15} className="animate-spin" /> : 'Marcar entregada'}
                  </button>
                  <button onClick={() => cambiar({ estado: 'anulada' }, 'anu')}
                    disabled={!!guardando}
                    className="rounded-lg border border-dark-700 px-4 text-[13px] font-semibold text-dark-400 disabled:opacity-50">
                    Anular
                  </button>
                </div>
              )}
            </section>

            {!!(abierta.fotos || []).length && (
              <section className="card mb-4 p-4">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-dark-500">
                  Fotos del taller
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {abierta.fotos.map((u, i) => (
                    <a key={u + i} href={u} target="_blank" rel="noreferrer">
                      <img src={u} alt="" loading="lazy"
                        className="aspect-square w-full rounded-lg border border-dark-800 object-cover" />
                    </a>
                  ))}
                </div>
              </section>
            )}

            <section className="card p-4">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-dark-500">
                Historial
              </h3>
              <ol className="space-y-2.5">
                {[...(abierta.historial || [])].reverse().map((h, i) => (
                  <li key={h.cuando + i} className="flex gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-brand-500" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-dark-200">{h.que}</p>
                      {h.detalle && <p className="text-[12.5px] leading-snug text-dark-400">{h.detalle}</p>}
                      <p className="text-[11.5px] text-dark-600">{cuando(h.cuando)} · {h.quien}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}

      {/* ══ ALTA ═══════════════════════════════════════════════════════ */}
      {nueva && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setNueva(null)}>
          <div className="w-full max-w-md rounded-xl border border-dark-800 bg-dark-950 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-lg font-bold text-dark-50">Nueva orden de trabajo</h2>
              <button onClick={() => setNueva(null)} className="ml-auto text-dark-500 hover:text-dark-200">
                <X size={18} />
              </button>
            </div>

            <Buscador
              etiqueta="Furgoneta" valor={nueva.vehicle_id}
              placeholder="Escribe la matrícula…"
              opciones={vehiculos.map((v) => ({ id: v.id, txt: `${v.license_plate} · ${v.model || 'sin modelo'}` }))}
              onElegir={(id) => setNueva({ ...nueva, vehicle_id: id })}
            />

            {tallerNuevo ? (
              <div className="mb-3 rounded-lg border border-brand-500/50 bg-brand-500/[0.07] p-3">
                <p className="mb-2 text-[12px] font-semibold text-brand-200">Taller nuevo</p>
                <input
                  autoFocus value={tallerNuevo.name} placeholder="Nombre (p. ej. Midas Santiago)"
                  onChange={(e) => setTallerNuevo({ ...tallerNuevo, name: e.target.value })}
                  className="mb-2 w-full rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-[14px] text-dark-100"
                />
                <input
                  value={tallerNuevo.phone} placeholder="Teléfono (para mandarle el enlace)"
                  onChange={(e) => setTallerNuevo({ ...tallerNuevo, phone: e.target.value })}
                  className="mb-2 w-full rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-[14px] text-dark-100"
                />
                <div className="flex gap-2">
                  <button onClick={guardarTallerNuevo}
                    disabled={!tallerNuevo.name.trim() || guardando === 'taller'}
                    className="btn-primary flex-1 text-[13px] disabled:opacity-40">
                    {guardando === 'taller' ? <Loader2 size={14} className="animate-spin" /> : 'Guardar taller'}
                  </button>
                  <button onClick={() => setTallerNuevo(null)}
                    className="rounded-lg border border-dark-700 px-3 text-[13px] text-dark-400">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <Buscador
                etiqueta="Taller" valor={nueva.workshop_id}
                placeholder="Escribe el nombre del taller…"
                opciones={talleres.map((w) => ({ id: w.id, txt: w.name }))}
                onElegir={(id) => setNueva({ ...nueva, workshop_id: id })}
                pie={(
                  <button
                    onClick={() => setTallerNuevo({ name: '', phone: '' })}
                    className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-400 hover:text-brand-300"
                  >
                    <Plus size={13} /> No está en la lista, darlo de alta
                  </button>
                )}
              />
            )}

            {!!incidencias.length && !nueva.incident_id && (
              <div className="mb-3 rounded-lg border border-dark-700 bg-dark-900/60 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-dark-300">
                  <Images size={14} className="text-brand-400" />
                  Esta furgoneta tiene {incidencias.length === 1
                    ? '1 incidencia abierta' : `${incidencias.length} incidencias abiertas`}
                </p>
                <div className="space-y-1.5">
                  {incidencias.slice(0, 4).map((inc) => (
                    <button key={inc.id}
                      onClick={() => setNueva({
                        ...nueva, incident_id: inc.id,
                        problema: nueva.problema || inc.description || inc.title || '',
                      })}
                      className="flex w-full items-start gap-2 rounded-lg border border-dark-800 px-2.5 py-2 text-left hover:border-dark-600"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-dark-200">
                          {inc.title || inc.description}
                        </span>
                        {!!(inc.photos || []).length && (
                          <span className="text-[11.5px] text-brand-400">
                            {inc.photos.length} foto{inc.photos.length > 1 ? 's' : ''} — se las lleva la orden
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {nueva.incident_id && (
              <p className="mb-3 flex items-center gap-2 rounded-lg border border-brand-500/50 bg-brand-500/[0.07] px-3 py-2 text-[12.5px] text-brand-200">
                <Check size={14} /> Se creará desde la incidencia, con sus fotos.
                <button onClick={() => setNueva({ ...nueva, incident_id: null })}
                  className="ml-auto text-[12px] text-dark-400 hover:text-dark-200">quitar</button>
              </p>
            )}

            <label className="mb-1 block text-[12px] font-semibold text-dark-400">Qué le pasa</label>
            <textarea
              rows={3} value={nueva.problema}
              onChange={(e) => setNueva({ ...nueva, problema: e.target.value })}
              placeholder="Frenos hacen ruido y testigo ABS encendido"
              className="mb-3 w-full rounded-lg border border-dark-700 bg-dark-900 px-3 py-2.5 text-[14px] text-dark-100"
            />

            <label className="mb-1 block text-[12px] font-semibold text-dark-400">
              Entrega prevista <span className="font-normal text-dark-600">(opcional)</span>
            </label>
            <input
              type="date" value={nueva.fecha_entrega_estimada}
              onChange={(e) => setNueva({ ...nueva, fecha_entrega_estimada: e.target.value })}
              className="mb-4 w-full rounded-lg border border-dark-700 bg-dark-900 px-3 py-2.5 text-[14px] text-dark-100"
            />

            <button
              onClick={crear}
              disabled={!nueva.vehicle_id || !nueva.workshop_id || guardando === 'crear'}
              className="btn-primary flex w-full items-center justify-center gap-2 text-[14px] disabled:opacity-40"
            >
              {guardando === 'crear'
                ? <Loader2 size={15} className="animate-spin" />
                : <><Plus size={15} /> Crear y generar enlace</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
