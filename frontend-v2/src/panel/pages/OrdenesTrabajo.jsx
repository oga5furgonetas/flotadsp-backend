import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, Plus, Link2, Copy, Check, X, Wrench, Euro, Clock,
  AlertTriangle, MessageCircle, Package, Search, Eye, EyeOff, PhoneCall,
} from 'lucide-react'
import {
  getOrdenes, getResumenOrdenes, getOrden, crearOrden, editarOrden, enlaceOrden,
  getVehicles, getWorkshops, crearTaller,
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

const eur = (n) => (n == null ? '—'
  : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n))

const cuando = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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

  const [abierta, setAbierta] = useState(null)      // orden del panel lateral
  const [enlace, setEnlace] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const [guardando, setGuardando] = useState('')

  const [nueva, setNueva] = useState(null)          // formulario de alta
  const [tallerNuevo, setTallerNuevo] = useState(null)  // alta al vuelo
  const [vehiculos, setVehiculos] = useState([])
  const [talleres, setTalleres] = useState([])

  const cargar = useCallback(async () => {
    setCargando(true); setErr('')
    try {
      const params = { ...(center && center !== 'Todos' ? { center } : {}) }
      if (filtro === 'abiertas') params.abiertas = true
      else if (filtro !== 'todas') params.estado = filtro
      const [l, r] = await Promise.all([getOrdenes(params), getResumenOrdenes(center)])
      setDatos(l.data)
      setResumen(r.data)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudieron cargar las órdenes.')
    } finally { setCargando(false) }
  }, [center, filtro])

  useEffect(() => { cargar() }, [cargar])

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
        <button onClick={abrirAlta} className="btn-primary ml-auto flex items-center gap-1.5 text-[13px]">
          <Plus size={15} /> Nueva orden
        </button>
      </div>

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
