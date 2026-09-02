import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LifeBuoy, Phone, Navigation, Loader2, AlertTriangle, CheckCircle2, MapPin } from 'lucide-react'
import { API_BASE } from '../lib/apiBase'

/* LA PÁGINA DEL QUE VA A AYUDAR — mapa y lista de SUS paradas, sin login.
   ═══════════════════════════════════════════════════════════════════════
   Llega por WhatsApp. Se mira de pie, con el móvil, con una mano. Por eso:
   botones grandes, cada parada con su «Ir» que abre el navegador del móvil,
   «Hecha» para ir tachando, y lo que Cortex ya da por entregado aparece
   tachado solo. La oficina puede cambiar las paradas y aquí sale la versión
   nueva sin mandar otro enlace (se recarga sola cada minuto). Cliente HTTP
   propio: sin sesión que meter ni que borrar. */

const http = axios.create({ baseURL: API_BASE })

const ICONO = (n, apagada) => L.divIcon({
  className: '',
  html: `<div style="width:28px;height:28px;border-radius:14px;display:flex;align-items:center;justify-content:center;font:700 13px system-ui;color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);background:${apagada ? '#64748b' : '#0ea5e9'}">${n}</div>`,
  iconSize: [28, 28], iconAnchor: [14, 14],
})

/* La chincheta de la PERSONA a la que se ayuda. Distinta de las paradas a
   proposito: es lo unico del mapa que no es una entrega. */
const ICONO_PERSONA = L.divIcon({
  className: '',
  html: '<div style="width:34px;height:34px;border-radius:17px;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.6);background:#f59e0b;font:700 15px system-ui;color:#1c1917">\u265f</div>',
  iconSize: [34, 34], iconAnchor: [17, 17],
})

const irA = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`
const rutaEntera = (paradas) => {
  const vivas = paradas.filter((p) => p.lat != null && !p.hecha && !p.entregada).slice(0, 10)
  if (!vivas.length) return ''
  const dest = vivas[vivas.length - 1]
  const wp = vivas.slice(0, -1).map((p) => `${p.lat},${p.lng}`).join('|')
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}${wp ? '&waypoints=' + encodeURIComponent(wp) : ''}&travelmode=driving`
}

export default function PortalApoyo() {
  const { token } = useParams()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [ocupada, setOcupada] = useState('')
  const mapaRef = useRef(null)
  const mapRef = useRef(null)
  const capaRef = useRef(null)

  const cargar = useCallback(async () => {
    try { const { data } = await http.get(`/apoyo/t/${encodeURIComponent(token)}`); setDatos(data); setError('') }
    catch (e) { setError(e?.response?.data?.detail || 'No se ha podido abrir este enlace') }
  }, [token])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { const id = setInterval(cargar, 60000); return () => clearInterval(id) }, [cargar])

  useEffect(() => {
    if (!mapaRef.current || mapRef.current || !datos) return
    const m = L.map(mapaRef.current, { zoomControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m)
    m.setView([40.4, -3.7], 6)
    mapRef.current = m; capaRef.current = L.layerGroup().addTo(m)
  }, [datos])
  useEffect(() => {
    const m = mapRef.current, capa = capaRef.current
    if (!m || !capa || !datos) return
    capa.clearLayers()
    const pts = []
    datos.paradas.forEach((p) => {
      if (p.lat == null) return
      const mk = L.marker([p.lat, p.lng], { icon: ICONO(p.stop_id, p.hecha || p.entregada) })
      mk.bindPopup(`<b>Parada ${p.stop_id}</b><br>${p.direccion || ''}<br>${p.n} paquete${p.n === 1 ? '' : 's'}<br><a href="${irA(p)}" target="_blank" rel="noreferrer">Ir con Google Maps</a>`)
      capa.addLayer(mk); pts.push([p.lat, p.lng])
    })
    const pos = datos.de?.posicion
    if (pos) {
      const mk = L.marker([pos.lat, pos.lng], { icon: ICONO_PERSONA, zIndexOffset: 1000 })
      mk.bindPopup(`<b>${datos.de?.nombre || ''}</b><br>Aquí hace ${pos.hace_min} min<br><a href="${irA(pos)}" target="_blank" rel="noreferrer">Ir hacia él</a>`)
      capa.addLayer(mk); pts.push([pos.lat, pos.lng])
    }
    if (pts.length) m.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 15 })
    setTimeout(() => m.invalidateSize(), 50)
  }, [datos])

  const marcar = async (p) => {
    setOcupada(p.stop_id)
    try { const { data } = await http.post(`/apoyo/t/${encodeURIComponent(token)}/parada/${encodeURIComponent(p.stop_id)}`, { hecha: !p.hecha }); setDatos(data) }
    catch (e) { setError(e?.response?.data?.detail || 'No se ha podido marcar') } finally { setOcupada('') }
  }

  if (error && !datos) return (
    <div className="flex min-h-screen items-center justify-center bg-dark-950 p-6 text-center text-dark-200">
      <div><AlertTriangle className="mx-auto mb-3 text-amber-400" size={36} /><p>{error}</p></div>
    </div>
  )
  if (!datos) return <div className="flex min-h-screen items-center justify-center bg-dark-950"><Loader2 className="animate-spin text-sky-400" size={32} /></div>

  const vivas = datos.paradas.filter((p) => !p.hecha && !p.entregada)
  const paquetes = datos.paradas.reduce((s, p) => s + (p.n || 0), 0)
  const cerrado = datos.fase === 'hecho' || datos.fase === 'anulado'
  const ruta = rutaEntera(datos.paradas)

  return (
    <div className="min-h-screen bg-dark-950 text-dark-100">
      <div className="mx-auto max-w-lg space-y-4 p-4 pb-24">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-sky-500/15 p-2.5 text-sky-300"><LifeBuoy size={26} /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight">Apoyo a {datos.de?.nombre}</h1>
            <p className="text-sm text-dark-400">{datos.a?.nombre} · {datos.paradas.length} paradas · {paquetes} paquetes{datos.de?.ruta ? ` · ${datos.de.ruta}` : ''}</p>
          </div>
        </div>

        {cerrado && <div className="rounded-xl bg-dark-800 px-4 py-3 text-center text-sm text-dark-300">{datos.fase === 'hecho' ? 'Este apoyo ya está terminado. Gracias.' : 'Este apoyo se ha anulado.'}</div>}
        {datos.nota && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{datos.nota}</div>}

        <div className="grid grid-cols-2 gap-2">
          {datos.de?.telefono && <a href={`tel:${datos.de.telefono}`} className="flex items-center justify-center gap-2 rounded-xl bg-dark-800 px-3 py-3 text-sm font-semibold text-dark-100 active:bg-dark-700"><Phone size={18} /> Llamar a {datos.de.nombre?.split(' ')[0]}</a>}
          {ruta && !cerrado && <a href={ruta} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-3 text-sm font-semibold text-white active:bg-sky-500"><Navigation size={18} /> Ruta en Maps</a>}
        </div>

        {/* DONDE ESTA EL OTRO. Siempre con el «hace N min» delante: un punto sin
            hora parece que está ahí AHORA, y esto lleva un botón de ir al lado. */}
        {datos.de?.posicion ? (
          <div className={`rounded-2xl border p-3 ${datos.de.posicion.hace_min <= 30 ? 'border-amber-500/40 bg-amber-500/10' : 'border-dark-700 bg-dark-900'}`}>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[15px] text-dark-950">♟</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{datos.de?.nombre?.split(' ')[0]} estaba aquí hace {datos.de.posicion.hace_min} min</div>
                <div className="text-xs text-dark-400">
                  {datos.de.posicion.que === 'intento' ? 'Último intento de entrega' : 'Última entrega'}
                  {datos.de.posicion.stop_id ? ` · parada ${datos.de.posicion.stop_id}` : ''} · lo dice Cortex, no es un GPS
                </div>
              </div>
            </div>
            <a href={irA(datos.de.posicion)} target="_blank" rel="noreferrer"
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white active:bg-amber-500">
              <Navigation size={16} /> Ir hacia {datos.de?.nombre?.split(' ')[0]}
            </a>
          </div>
        ) : (
          <div className="rounded-2xl border border-dark-700 bg-dark-900 px-3 py-2.5 text-xs text-dark-400">
            Cortex no da una posición reciente de {datos.de?.nombre?.split(' ')[0]}: llámale para quedar.
          </div>
        )}

        <div ref={mapaRef} className="h-[300px] w-full overflow-hidden rounded-2xl bg-dark-900" />

        <div className="text-xs text-dark-500">{vivas.length} por hacer · se actualiza sola cada minuto{datos.paradas.some((p) => !p.ubicacion) ? ' · las paradas en ámbar no tienen ubicación en Cortex' : ''}</div>

        <div className="space-y-2">
          {datos.paradas.map((p) => {
            const apagada = p.hecha || p.entregada
            return (
              <div key={p.stop_id} className={`rounded-2xl border p-3 ${apagada ? 'border-dark-800 bg-dark-900/50 opacity-60' : 'border-dark-700 bg-dark-900'}`}>
                <div className="flex items-start gap-3">
                  <div className={`cifra flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${apagada ? 'bg-dark-600' : 'bg-sky-600'}`}>{p.stop_id}</div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${apagada ? 'line-through' : ''}`}>{p.direccion || (p.lat != null ? <span className="text-dark-300"><MapPin size={12} className="mr-1 inline" />{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</span> : <span className="text-amber-300">Cortex no da la ubicación: es la parada {p.stop_id} de {datos.de?.nombre?.split(' ')[0]}, pregúntale</span>)}</div>
                    <div className="mt-0.5 text-xs text-dark-500">{p.n} paquete{p.n === 1 ? '' : 's'}{p.tbas?.length ? ` · ${p.tbas.map((t) => t.slice(-6)).join(', ')}` : ''}{p.entregada ? ' · entregada según Cortex' : ''}</div>
                  </div>
                </div>
                {!cerrado && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {p.lat != null ? <a href={irA(p)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl bg-dark-800 py-2.5 text-sm font-semibold active:bg-dark-700"><Navigation size={16} /> Ir</a> : <span />}
                    <button onClick={() => marcar(p)} disabled={ocupada === p.stop_id}
                      className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold ${p.hecha ? 'bg-dark-800 text-dark-300' : 'bg-emerald-700 text-white active:bg-emerald-600'}`}>
                      {ocupada === p.stop_id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} {p.hecha ? 'Deshacer' : 'Hecha'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="pt-2 text-center text-[11px] text-dark-600">FlotaDSP · enlace válido 3 días</p>
      </div>
    </div>
  )
}
