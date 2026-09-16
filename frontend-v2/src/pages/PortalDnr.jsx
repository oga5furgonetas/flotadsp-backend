import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Loader2, AlertTriangle, CheckCircle2, MapPin, PackageSearch } from 'lucide-react'
import { API_BASE } from '../lib/apiBase'
import { normalizarDetalle } from '../services/api'

/* LA PÁGINA DEL CONDUCTOR — «¿dónde dejaste este paquete?»
   ═══════════════════════════════════════════════════════════════════════
   Amazon abre una investigación cuando un cliente dice que no recibió su
   paquete, y hay 24 horas para contestar dónde se entregó. La respuesta la
   tiene una sola persona: quien lo llevó.

   Hasta ahora eso era una llamada: buscar el teléfono, explicar qué paquete,
   que se acuerde, apuntar lo que diga y traducirlo a los desplegables de
   Amazon. Aquí le llega un enlace por WhatsApp, lo abre, ve DÓNDE iba y DÓNDE
   marcó él la entrega, toca un botón y ya está.

   POR QUÉ UN ENLACE Y NO UNA CAPTURA. Una imagen no se puede contestar.
   Volvería un audio o un «en la puerta de la izquierda», y alguien tendría que
   traducir eso a las casillas de Amazon — que es el trabajo que se venía a
   quitar, más la posibilidad de traducirlo mal. Los botones de aquí SON el
   catálogo de Amazon, así que lo que toque entra ya en su formato exacto.

   SE MIRA DE PIE, CON UNA MANO Y CON PRISA. Por eso: el mapa primero (es lo que
   le hace acordarse), botones grandes de una línea, y una sola pantalla. Nada
   de login: quien reparte no va a instalar nada.

   LA DIRECCIÓN Y LOS DOS PUNTOS, JUNTOS. El azul es a qué portal iba el
   paquete; el verde, dónde estaba él cuando marcó la entrega.

   (Aquí llegué a escribir que Cortex no traía la dirección de estos paquetes y
   que por eso solo había mapa. Era falso: la consulta pedía `address` y el
   campo se llama `stop_address`. Un campo mal escrito no falla — devuelve
   vacío, y vacío parece un hallazgo. Lo corrigió Dani pidiendo lo obvio:
   «añádele la dirección».) */

const http = axios.create({ baseURL: API_BASE })
// El mensaje de error llega siempre como texto (ver normalizarDetalle).
http.interceptors.response.use((r) => r, (e) => {
  if (e?.response?.data) e.response.data = normalizarDetalle(e.response.data)
  return Promise.reject(e)
})

const CHINCHETA = (color, letra) => L.divIcon({
  className: '',
  html: `<div style="width:30px;height:30px;border-radius:15px;display:flex;align-items:center;justify-content:center;font:700 13px system-ui;color:#fff;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.5);background:${color}">${letra}</div>`,
  iconSize: [30, 30], iconAnchor: [15, 15],
})

export default function PortalDnr() {
  const { token } = useParams()
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [elegida, setElegida] = useState('')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState(false)
  const cajaRef = useRef(null)
  const mapRef = useRef(null)

  const cargar = useCallback(async () => {
    try {
      const { data } = await http.get(`/dnr/p/${encodeURIComponent(token)}`)
      setD(data); setError('')
      if (data.ya_contesto) setHecho(true)
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se ha podido abrir este enlace')
    }
  }, [token])
  useEffect(() => { cargar() }, [cargar])

  /* El mapa se monta una sola vez y solo si hay algún punto. Sin coordenadas no
     se pinta un mapa vacío: un recuadro gris no ayuda a nadie a acordarse, y
     ocupa la mitad de la pantalla de un móvil. */
  useEffect(() => {
    if (!d || !cajaRef.current || mapRef.current) return
    const dest = d.dest && d.dest.lat != null ? [d.dest.lat, d.dest.lng] : null
    const esc = d.escaneo && d.escaneo.lat != null ? [d.escaneo.lat, d.escaneo.lng] : null
    if (!dest && !esc) return
    const map = L.map(cajaRef.current, { zoomControl: true, attributionControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    const puntos = []
    if (dest) { L.marker(dest, { icon: CHINCHETA('#0ea5e9', 'A') }).addTo(map); puntos.push(dest) }
    if (esc) { L.marker(esc, { icon: CHINCHETA('#10b981', 'B') }).addTo(map); puntos.push(esc) }
    if (dest && esc) L.polyline([dest, esc], { color: '#64748b', weight: 2, dashArray: '4 4' }).addTo(map)
    if (puntos.length > 1) map.fitBounds(L.latLngBounds(puntos).pad(0.5))
    else map.setView(puntos[0], 18)
    mapRef.current = map
  }, [d])

  const enviar = async () => {
    setEnviando(true); setError('')
    try {
      await http.post(`/dnr/p/${encodeURIComponent(token)}`, { opcion: elegida, nota })
      setHecho(true)
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se ha podido enviar. Prueba otra vez.')
    } finally { setEnviando(false) }
  }

  if (error && !d) {
    return (
      <Marco>
        <p className="flex items-center gap-2 text-[14px] text-red-600">
          <AlertTriangle size={18} /> {error}
        </p>
      </Marco>
    )
  }
  if (!d) {
    return (
      <Marco>
        <p className="flex items-center gap-2 text-[14px] text-slate-500">
          <Loader2 size={18} className="animate-spin" /> Cargando…
        </p>
      </Marco>
    )
  }

  if (hecho) {
    return (
      <Marco>
        <div className="py-10 text-center">
          <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
          <p className="mt-3 text-[17px] font-semibold text-slate-800">¡Gracias!</p>
          <p className="mt-1 text-[14px] text-slate-500">
            Ya está. No hace falta que hagas nada más.
          </p>
          {d.lo_que_dijo && (
            <p className="mt-4 text-[13px] text-slate-400">Dijiste: «{d.lo_que_dijo}»</p>
          )}
        </div>
      </Marco>
    )
  }

  return (
    <Marco>
      <div className="flex items-start gap-2">
        <PackageSearch size={20} className="mt-0.5 shrink-0 text-sky-600" />
        <div>
          <h1 className="text-[17px] font-bold leading-tight text-slate-800">
            ¿Dónde dejaste este paquete?
          </h1>
          <p className="mt-0.5 text-[13.5px] text-slate-500">
            El cliente dice que no lo recibió y Amazon nos lo pregunta.
          </p>
        </div>
      </div>

      {/* LA DIRECCION PRIMERO Y GRANDE. Es lo que le hace acordarse antes que
          nada: si le suena la calle, ya está recordando el portal. Debajo, la
          ruta y la hora, que es lo que lo sitúa en el día. */}
      <div className="mt-3 rounded-xl bg-slate-100 px-3.5 py-3 text-[13.5px] text-slate-600">
        {d.direccion ? (
          <p className="flex items-start gap-1.5 text-[15.5px] font-semibold leading-snug text-slate-800">
            <MapPin size={16} className="mt-0.5 shrink-0 text-sky-600" />
            {d.direccion}
          </p>
        ) : (
          /* Sin dirección se dice, no se deja el hueco: así sabe que tiene que
             mirar el mapa para situarse. */
          <p className="text-[13.5px] italic text-slate-500">
            De este paquete no tenemos la dirección escrita — mira el mapa.
          </p>
        )}
        <p className="mt-1.5">
          {d.dia && <>Ruta <b>{d.ruta}</b> del <b>{d.dia}</b>. </>}
          {d.entregado_en && <>Lo marcaste entregado a las <b>{d.entregado_en.slice(11, 16)}</b>.</>}
        </p>
        {/* SU PROPIO ESCANEO, escrito. Es lo que más le hace acordarse: «ah,
            sí, ese se lo di a la señora». No preselecciona ningún botón a
            propósito — la pregunta de Amazon es DÓNDE exactamente, y el escaneo
            muchas veces no llega a eso; ponerle la respuesta hecha sería
            ponérsela en la boca. */}
        {d.marcaste && (
          <p className="mt-2 rounded-lg bg-white px-2.5 py-2 text-[13.5px] text-slate-700 ring-1 ring-slate-200">
            Tú lo marcaste como <b className="text-slate-900">«{d.marcaste}»</b>.
            {' '}¿Dónde fue exactamente?
          </p>
        )}
      </div>

      {/* El mapa antes que los botones: es lo que le hace acordarse. */}
      <div ref={cajaRef} className="mt-3 h-52 w-full overflow-hidden rounded-xl bg-slate-200" />
      {(d.dest?.lat != null || d.escaneo?.lat != null) && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500" /> A: a dónde iba
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> B: dónde lo marcaste
          </span>
          {d.metros != null && <span>· {d.metros} m entre los dos</span>}
        </p>
      )}

      <p className="mt-4 text-[14px] font-semibold text-slate-700">Toca lo que hiciste:</p>
      <div className="mt-2 space-y-1.5">
        {(d.opciones || []).map((o) => (
          <button key={o.clave} onClick={() => setElegida(o.clave)}
            className={`flex w-full items-center gap-2 rounded-xl border px-3.5 py-3 text-left text-[14.5px] transition ${
              elegida === o.clave
                ? 'border-sky-500 bg-sky-50 font-semibold text-sky-800'
                : 'border-slate-200 bg-white text-slate-700 active:bg-slate-50'}`}>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
              elegida === o.clave ? 'border-sky-500 bg-sky-500' : 'border-slate-300'}`}>
              {elegida === o.clave && <CheckCircle2 size={12} className="text-white" />}
            </span>
            {o.texto}
          </button>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="text-[13px] text-slate-500">¿Algo más que recuerdes? (opcional)</span>
        <textarea value={nota} onChange={(e) => setNota(e.target.value)}
          placeholder="Avisé por teléfono antes, me abrió una señora, estaba lloviendo…"
          className="mt-1 h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px] text-slate-700 outline-none focus:border-sky-400" />
      </label>

      {error && <p className="mt-2 text-[13.5px] text-red-600">{error}</p>}

      {/* Fijo abajo: la lista es larga y en un móvil el botón quedaría fuera de
          pantalla justo cuando ya ha elegido. */}
      <div className="sticky bottom-0 -mx-4 mt-4 border-t border-slate-200 bg-white px-4 py-3">
        <button onClick={enviar} disabled={!elegida || enviando}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3.5 text-[15.5px] font-semibold text-white disabled:opacity-40">
          {enviando ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
          Enviar
        </button>
        <p className="mt-2 text-center text-[12px] text-slate-400">
          Si no te acuerdas, dilo — es mejor que adivinar.
        </p>
      </div>
    </Marco>
  )
}

/* Marco claro y fijo, sin tema oscuro: esto no es el panel. Lo abre alguien en
   la calle, con sol, en el móvil que tenga. */
function Marco({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md px-4 py-5">
        {children}
        <p className="mt-6 flex items-center justify-center gap-1 text-[11.5px] text-slate-400">
          <MapPin size={11} /> FlotaDSP
        </p>
      </div>
    </div>
  )
}
