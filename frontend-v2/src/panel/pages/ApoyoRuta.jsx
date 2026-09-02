import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LifeBuoy, RefreshCw, MessageCircle, Copy, Check, Loader2, MapPin, Phone, AlertTriangle, ChevronRight, Pencil, XCircle, CheckCircle2 } from 'lucide-react'
import { useT } from '../../i18n'
import { hoyLocal } from '../../lib/fecha'
import { getApoyoSituacion, getApoyoParadas, crearApoyo, cambiarApoyo, getApoyos } from '../api'

/* APOYO EN RUTA — quién le quita paradas a quién, con mapa por WhatsApp.
   ═══════════════════════════════════════════════════════════════════════
   Antes: una llamada, una foto del mapa de Cortex y nadie sabía después quién
   había quitado qué. Aquí se elige al conductor que va tarde, se marcan en el
   mapa las paradas que se le quitan, se elige quién va (el backup del día sale
   el primero) y salen dos WhatsApp ya escritos: al que ayuda, con el mapa y la
   lista de SUS paradas; al que recibe la ayuda, con lo que le quitan. Queda
   registrado y se puede cambiar; el enlace enseña siempre la última versión.
   Cero falsos positivos: las paradas salen de Cortex tal como está AHORA y el
   banner dice hace cuántos minutos se bajó. */

const NUM_ICON = (n, sel, hecha) => L.divIcon({
  className: '',
  html: `<div style="width:26px;height:26px;border-radius:13px;display:flex;align-items:center;justify-content:center;font:700 12px system-ui;color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);background:${hecha ? '#64748b' : sel ? '#0ea5e9' : '#f97316'}">${n}</div>`,
  iconSize: [26, 26], iconAnchor: [13, 13],
})

function useMapa(ref, paradas, seleccion, onToggle) {
  const mapRef = useRef(null)
  const capaRef = useRef(null)
  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const m = L.map(ref.current, { zoomControl: true, attributionControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m)
    m.setView([40.4, -3.7], 6)
    mapRef.current = m
    capaRef.current = L.layerGroup().addTo(m)
    return () => { m.remove(); mapRef.current = null }
  }, [ref])
  useEffect(() => {
    const m = mapRef.current, capa = capaRef.current
    if (!m || !capa) return
    capa.clearLayers()
    const puntos = []
    paradas.forEach((p) => {
      if (p.lat == null || p.lng == null) return
      const sel = seleccion.has(p.stop_id)
      const mk = L.marker([p.lat, p.lng], { icon: NUM_ICON(p.stop_id, sel, p.hecha || p.entregada) })
      mk.on('click', () => onToggle(p.stop_id))
      mk.bindTooltip(`${p.stop_id} · ${p.n} ${p.n === 1 ? 'paquete' : 'paquetes'}${p.direccion ? ' · ' + p.direccion : ''}`)
      capa.addLayer(mk)
      puntos.push([p.lat, p.lng])
    })
    if (puntos.length) m.fitBounds(L.latLngBounds(puntos).pad(0.2), { maxZoom: 15 })
    setTimeout(() => m.invalidateSize(), 50)
  }, [paradas, seleccion, onToggle])
}

export default function ApoyoRuta() {
  const { center } = useOutletContext()
  const { t } = useT()
  const dia = hoyLocal()
  const [sit, setSit] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [driver, setDriver] = useState(null)         // conductor que recibe ayuda
  const [paradas, setParadas] = useState([])
  const [infoParadas, setInfoParadas] = useState(null)
  const [sel, setSel] = useState(() => new Set())
  const [ayudante, setAyudante] = useState('')
  const [nota, setNota] = useState('')
  const [editando, setEditando] = useState(null)     // apoyo en edición
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [apoyos, setApoyos] = useState([])
  const [copiado, setCopiado] = useState('')
  const mapaRef = useRef(null)

  const cargarSit = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([getApoyoSituacion({ center, day: dia }), getApoyos({ center, day: dia })])
      setSit(s.data); setApoyos(a.data?.apoyos || []); setError('')
    } catch (e) { setError(e?.response?.data?.detail || 'No se ha podido cargar') } finally { setCargando(false) }
  }, [center, dia])

  useEffect(() => { setCargando(true); cargarSit() }, [cargarSit])
  useEffect(() => { const id = setInterval(cargarSit, 60000); return () => clearInterval(id) }, [cargarSit])

  const elegirConductor = useCallback(async (c, apoyo = null) => {
    setDriver(c); setResultado(null); setEditando(apoyo)
    setSel(new Set(apoyo ? apoyo.paradas.map((p) => p.stop_id) : []))
    setAyudante(apoyo ? apoyo.a.driver_id : '')
    setNota(apoyo ? apoyo.nota || '' : '')
    setParadas([]); setInfoParadas(null)
    try {
      const { data } = await getApoyoParadas({ driver_id: c.driver_id, day: dia })
      const hechas = new Set((apoyo?.paradas || []).filter((p) => p.hecha).map((p) => p.stop_id))
      setParadas((data.paradas || []).map((p) => ({ ...p, hecha: hechas.has(p.stop_id) })))
      setInfoParadas(data)
    } catch (e) { setError(e?.response?.data?.detail || 'No se han podido cargar las paradas') }
  }, [dia])

  const toggle = useCallback((id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }), [])
  useMapa(mapaRef, paradas, sel, toggle)

  const ultimas = (n) => setSel(new Set(paradas.slice(-n).map((p) => p.stop_id)))

  const enviar = async () => {
    if (!driver || !ayudante || sel.size === 0) return
    const sinUbic = paradas.filter((p) => sel.has(p.stop_id) && !p.ubicacion).length
    if (sinUbic && !window.confirm(t('apoyo.confirmarSinUbic').replace('{n}', sinUbic).replace('{total}', sel.size))) return
    setEnviando(true); setError('')
    try {
      const body = { day: dia, de_driver_id: driver.driver_id, a_driver_id: ayudante, stop_ids: [...sel], nota }
      const { data } = editando ? await cambiarApoyo(editando.id, { stop_ids: body.stop_ids, a_driver_id: ayudante, nota }) : await crearApoyo(body)
      setResultado(data); setEditando(null)
      cargarSit()
    } catch (e) { setError(e?.response?.data?.detail || 'No se ha podido crear el apoyo') } finally { setEnviando(false) }
  }

  const cerrar = async (a, estado) => {
    try { await cambiarApoyo(a.id, { fase: estado }); cargarSit(); if (resultado?.id === a.id) setResultado(null) }
    catch (e) { setError(e?.response?.data?.detail || 'No se ha podido') }
  }

  const copiar = async (texto, clave) => {
    try { await navigator.clipboard.writeText(texto); setCopiado(clave); setTimeout(() => setCopiado(''), 1500) } catch { /* sin portapapeles */ }
  }

  const ayudantes = sit?.ayudantes || []
  const conductores = sit?.conductores || []
  const ayudanteSel = ayudantes.find((a) => a.driver_id === ayudante)
  const paquetesSel = useMemo(() => paradas.filter((p) => sel.has(p.stop_id)).reduce((s, p) => s + (p.n || 0), 0), [paradas, sel])
  const viejo = sit?.bajado_hace_min != null && sit.bajado_hace_min > 10

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-dark-50"><LifeBuoy className="text-sky-400" size={24} /> {t('apoyo.title')}</h1>
          <p className="mt-1 text-sm text-dark-400">{t('apoyo.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {sit && (
            <span className={`rounded-lg px-2.5 py-1.5 ${viejo ? 'bg-amber-500/15 text-amber-300' : 'bg-dark-800 text-dark-300'}`}>
              {sit.bajado_hace_min == null ? t('apoyo.sinDatos') : t('apoyo.bajado').replace('{n}', sit.bajado_hace_min)}
            </span>
          )}
          <button onClick={cargarSit} className="rounded-lg border border-dark-700 p-1.5 text-dark-400 hover:text-dark-100" title={t('common.refresh')}><RefreshCw size={14} /></button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"><AlertTriangle size={16} /> {error}</div>}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* Conductores con paradas pendientes */}
        <div className="card overflow-hidden">
          <div className="border-b border-dark-800 px-4 py-3 text-sm font-semibold text-dark-200">{t('apoyo.conductores')} <span className="text-dark-500">· {conductores.length}</span></div>
          {cargando && <div className="p-6 text-center text-dark-500"><Loader2 className="mx-auto animate-spin" /></div>}
          {!cargando && conductores.length === 0 && <div className="p-6 text-center text-sm text-dark-500">{t('apoyo.vacio')}</div>}
          <div className="max-h-[70vh] divide-y divide-dark-800 overflow-y-auto">
            {conductores.map((c) => (
              <button key={c.driver_id} onClick={() => elegirConductor(c)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-dark-800/60 ${driver?.driver_id === c.driver_id ? 'bg-sky-500/10' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-dark-100">{c.nombre}</div>
                  <div className="text-xs text-dark-500">{c.ruta || '—'} · {c.entregados}/{c.paquetes} {t('apoyo.entregados')}</div>
                </div>
                <div className="text-right">
                  <div className={`cifra text-base font-bold ${c.pendientes > 40 ? 'text-orange-400' : 'text-dark-200'}`}>{c.pendientes}</div>
                  <div className="text-[10px] uppercase text-dark-500">{c.paradas} {t('apoyo.paradas')}{c.con_destino != null && c.con_destino < c.paradas ? ` · ${c.con_destino} ${t('apoyo.conDestino')}` : ''}</div>
                </div>
                {c.apoyo_id && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300">{t('apoyo.enApoyo')}</span>}
                <ChevronRight size={14} className="text-dark-600" />
              </button>
            ))}
          </div>
        </div>

        {/* Mapa + selección */}
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dark-800 px-4 py-3">
              <div className="text-sm font-semibold text-dark-200">
                {driver ? <>{driver.nombre} <span className="text-dark-500">· {infoParadas?.ruta || driver.ruta || ''}</span></> : t('apoyo.elegir')}
              </div>
              {driver && paradas.length > 0 && (
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-dark-500">{t('apoyo.ultimas')}:</span>
                  {[5, 10, 15].map((n) => <button key={n} onClick={() => ultimas(n)} className="rounded border border-dark-700 px-2 py-0.5 text-dark-300 hover:text-dark-50">{n}</button>)}
                  <button onClick={() => setSel(new Set(paradas.map((p) => p.stop_id)))} className="rounded border border-dark-700 px-2 py-0.5 text-dark-300 hover:text-dark-50">{t('apoyo.todas')}</button>
                  <button onClick={() => setSel(new Set())} className="rounded border border-dark-700 px-2 py-0.5 text-dark-300 hover:text-dark-50">{t('apoyo.ninguna')}</button>
                </div>
              )}
            </div>
            <div ref={mapaRef} className="h-[380px] w-full bg-dark-900" />
            {driver && infoParadas && (
              <div className="flex flex-wrap items-center gap-3 border-t border-dark-800 px-4 py-2 text-xs text-dark-400">
                <span><MapPin size={12} className="mr-1 inline" />{paradas.length} {t('apoyo.paradas')} · {infoParadas.paquetes} {t('apoyo.paquetes')}</span>
                {infoParadas.sin_ubicacion > 0 && <span className="text-amber-300">{t('apoyo.sinCoord').replace('{n}', infoParadas.sin_ubicacion)}</span>}
                <span className="ml-auto font-medium text-sky-300">{sel.size} {t('apoyo.elegidas')} · {paquetesSel} {t('apoyo.paquetes')}</span>
              </div>
            )}
          </div>

          {driver && (
            <div className="grid gap-4 md:grid-cols-[1fr_320px]">
              {/* Lista de paradas */}
              <div className="card max-h-[360px] overflow-y-auto">
                {paradas.length === 0 && <div className="p-6 text-center text-sm text-dark-500">{infoParadas ? t('apoyo.sinPendientes') : <Loader2 className="mx-auto animate-spin" />}</div>}
                {paradas.map((p) => (
                  <label key={p.stop_id} className={`flex cursor-pointer items-start gap-3 border-b border-dark-800 px-4 py-2 hover:bg-dark-800/50 ${sel.has(p.stop_id) ? 'bg-sky-500/5' : ''}`}>
                    <input type="checkbox" className="mt-1" checked={sel.has(p.stop_id)} onChange={() => toggle(p.stop_id)} />
                    <span className={`cifra mt-0.5 w-8 shrink-0 text-center text-xs font-bold ${p.hecha ? 'text-dark-500 line-through' : 'text-orange-300'}`}>{p.stop_id}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${p.ubicacion ? 'text-dark-200' : 'text-amber-300/80'}`}>{p.direccion || (p.lat != null ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : t('apoyo.sinCoordUna'))}</span>
                      <span className="block text-[11px] text-dark-500">{p.n} {p.n === 1 ? t('apoyo.paquete') : t('apoyo.paquetes')} · {(p.estados || []).join(', ')}{p.hecha ? ` · ${t('apoyo.hecha')}` : ''}</span>
                    </span>
                  </label>
                ))}
              </div>

              {/* Quién va */}
              <div className="card space-y-3 p-4">
                <div className="text-sm font-semibold text-dark-200">{editando ? t('apoyo.cambiarTitulo') : t('apoyo.quienVa')}</div>
                <select className="input w-full" value={ayudante} onChange={(e) => setAyudante(e.target.value)}>
                  <option value="">{t('apoyo.ayudante')}…</option>
                  {ayudantes.filter((a) => a.driver_id && a.driver_id !== driver.driver_id).map((a) => (
                    <option key={a.ficha_id} value={a.driver_id} disabled={!a.telefono}>
                      {a.es_backup ? '★ ' : ''}{a.nombre}{a.es_backup ? ` (${t('apoyo.backup')})` : ''}{a.pendientes ? ` · ${a.pendientes} ${t('apoyo.pendientesCortas')}` : ''}{!a.telefono ? ` · ${t('apoyo.sinTel')}` : ''}
                    </option>
                  ))}
                </select>
                {ayudanteSel && <div className="text-xs text-dark-400"><Phone size={12} className="mr-1 inline" />{ayudanteSel.telefono}</div>}
                <textarea className="input w-full" rows={2} placeholder={t('apoyo.nota')} value={nota} onChange={(e) => setNota(e.target.value.slice(0, 300))} />
                <button onClick={enviar} disabled={enviando || !ayudante || sel.size === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 disabled:opacity-40">
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
                  {editando ? t('apoyo.guardarCambios') : t('apoyo.crear').replace('{n}', sel.size)}
                </button>
                {editando && <button onClick={() => { setEditando(null); setSel(new Set()); setAyudante(''); setNota('') }} className="w-full text-xs text-dark-500 hover:text-dark-200">{t('common.cancel')}</button>}
              </div>
            </div>
          )}

          {resultado && (
            <div className="card space-y-3 border-sky-500/30 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-sky-300"><CheckCircle2 size={16} /> {t('apoyo.listo').replace('{a}', resultado.a?.nombre).replace('{de}', resultado.de?.nombre).replace('{n}', resultado.paradas?.length)}</div>
              {resultado.ya_entregadas?.length > 0 && <div className="text-xs text-amber-300">{t('apoyo.yaEntregadas').replace('{n}', resultado.ya_entregadas.length)}: {resultado.ya_entregadas.join(', ')}</div>}
              <div className="flex flex-wrap gap-2">
                {resultado.wa_ayudante && <a href={resultado.wa_ayudante} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"><MessageCircle size={16} /> {t('apoyo.waAyudante').replace('{a}', resultado.a?.nombre?.split(' ')[0])}</a>}
                {resultado.wa_conductor ? <a href={resultado.wa_conductor} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-emerald-600/60 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-600/10"><MessageCircle size={16} /> {t('apoyo.waConductor').replace('{de}', resultado.de?.nombre?.split(' ')[0])}</a>
                  : <span className="self-center text-xs text-amber-300">{t('apoyo.conductorSinTel')}</span>}
                <button onClick={() => copiar(resultado.url, 'url')} className="flex items-center gap-2 rounded-xl border border-dark-700 px-4 py-2 text-sm text-dark-300 hover:text-dark-50">{copiado === 'url' ? <Check size={16} /> : <Copy size={16} />} {t('apoyo.copiar')}</button>
              </div>
              <a href={resultado.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-dark-500 hover:text-sky-300">{resultado.url}</a>
            </div>
          )}
        </div>
      </div>

      {/* Apoyos de hoy */}
      <div className="card overflow-hidden">
        <div className="border-b border-dark-800 px-4 py-3 text-sm font-semibold text-dark-200">{t('apoyo.hoy')} <span className="text-dark-500">· {apoyos.length}</span></div>
        {apoyos.length === 0 && <div className="p-6 text-center text-sm text-dark-500">{t('apoyo.hoyVacio')}</div>}
        <div className="divide-y divide-dark-800">
          {apoyos.map((a) => {
            const hechas = (a.paradas || []).filter((p) => p.hecha).length
            const cerrado = a.fase === 'hecho' || a.fase === 'anulado'
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-dark-100"><span className="font-semibold">{a.a?.nombre}</span> → {a.de?.nombre} <span className="text-dark-500">· {a.de?.ruta}</span></div>
                  <div className="text-xs text-dark-500">{a.paradas?.length} {t('apoyo.paradas')} · {hechas} {t('apoyo.hechas')} · {new Date(a.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · {a.historial?.[0]?.por}</div>
                </div>
                <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${a.fase === 'hecho' ? 'bg-emerald-500/15 text-emerald-300' : a.fase === 'anulado' ? 'bg-dark-700 text-dark-400' : 'bg-sky-500/15 text-sky-300'}`}>{({ enviado: t('apoyo.estado.enviado'), hecho: t('apoyo.estado.hecho'), anulado: t('apoyo.estado.anulado') })[a.fase] || a.fase}</span>
                {!cerrado && (
                  <div className="flex items-center gap-1">
                    {a.wa_ayudante && <a href={a.wa_ayudante} target="_blank" rel="noreferrer" title={t('apoyo.waAyudante').replace('{a}', '')} className="rounded-lg p-1.5 text-emerald-400 hover:bg-emerald-500/10"><MessageCircle size={16} /></a>}
                    <button onClick={() => elegirConductor({ driver_id: a.de.driver_id, nombre: a.de.nombre, ruta: a.de.ruta }, a)} title={t('apoyo.cambiar')} className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-800 hover:text-dark-100"><Pencil size={16} /></button>
                    <button onClick={() => cerrar(a, 'hecho')} title={t('apoyo.hecho')} className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-800 hover:text-emerald-300"><CheckCircle2 size={16} /></button>
                    <button onClick={() => cerrar(a, 'anulado')} title={t('apoyo.anular')} className="rounded-lg p-1.5 text-dark-400 hover:bg-dark-800 hover:text-red-300"><XCircle size={16} /></button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
