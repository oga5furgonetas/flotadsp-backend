import { useEffect, useRef, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT } from '../../i18n'
import {
  Wrench, MapPin, Phone, Globe, BadgeCheck, Loader2, Navigation,
  AlertTriangle, Search, Filter, Star, Clock, ChevronDown, X,
  ExternalLink, PhoneCall, Zap, Car, RefreshCw, Info,
} from 'lucide-react'
import { getWorkshopsNearby, getWorkshops, getVehicles } from '../api'

const CATEGORIES = [
  { id: 'chapa',          label: 'Chapa'       },
  { id: 'pintura',        label: 'Pintura'     },
  { id: 'mecanica',       label: 'Mecánica'    },
  { id: 'lunas',          label: 'Lunas'       },
  { id: 'neumaticos',     label: 'Neumáticos'  },
  { id: 'oficial_toyota', label: 'Of. Toyota'  },
]

const PROVIDER_COLORS = {
  BANSACAR:          'text-blue-300   bg-blue-500/10   ring-blue-500/20',
  'SANTANDER RENTING':'text-blue-300  bg-blue-500/10   ring-blue-500/20',
  AYVENS:            'text-violet-300 bg-violet-500/10 ring-violet-500/20',
  ALD:               'text-violet-300 bg-violet-500/10 ring-violet-500/20',
  VAYVANS:           'text-cyan-300   bg-cyan-500/10   ring-cyan-500/20',
  KINTO:             'text-red-300    bg-red-500/10    ring-red-500/20',
  'ONE FURGO':       'text-emerald-300 bg-emerald-500/10 ring-emerald-500/20',
}

function providerTag(name) {
  if (!name) return null
  const up = name.toUpperCase()
  for (const [key, cls] of Object.entries(PROVIDER_COLORS)) {
    if (up.includes(key) || key.includes(up.split('_')[0])) return cls
  }
  return 'text-dark-300 bg-dark-700 ring-dark-600'
}

/* Distancia formateada */
function fmtDist(km) {
  if (km == null) return null
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

/* Badge de distancia con color según cercanía */
function DistBadge({ km }) {
  if (km == null) return null
  const color = km < 5 ? 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/20'
    : km < 20 ? 'text-amber-300 bg-amber-500/10 ring-amber-500/20'
    : 'text-dark-400 bg-dark-800 ring-dark-700'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${color}`}>
      <Navigation size={8} /> {fmtDist(km)}
    </span>
  )
}

/* Banner de asistencia en carretera */
function RoadsideBanner({ roadside, provider }) {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)
  if (!roadside) return null

  const hasPhone = !!roadside.phone

  return (
    <div className={`mb-4 overflow-hidden rounded-2xl border ${hasPhone ? 'border-orange-500/25 bg-gradient-to-r from-orange-500/8 to-amber-500/5' : 'border-dark-700 bg-dark-800/50'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${hasPhone ? 'bg-orange-500/15' : 'bg-dark-700'}`}>
          <PhoneCall size={16} className={hasPhone ? 'text-orange-400' : 'text-dark-500'} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-dark-400">{t('ws.roadside')}</span>
            {provider && <span className="rounded-full bg-dark-700 px-1.5 py-0.5 text-[9px] text-dark-400">{provider.split('_')[0]}</span>}
          </div>
          <div className={`mt-0.5 text-sm font-semibold ${hasPhone ? 'text-orange-200' : 'text-dark-500'}`}>
            {roadside.label}
          </div>
        </div>
        {hasPhone && (
          <a
            href={`tel:${roadside.phone.replace(/\s/g, '')}`}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-400 active:scale-95"
          >
            <Phone size={14} /> {roadside.phone}
          </a>
        )}
      </div>
      {roadside.app && (
        <div className="border-t border-white/5 px-4 py-2 text-xs text-dark-500">
          <Zap size={10} className="mr-1 inline text-amber-400" />
          También puedes gestionar la avería desde la app <b className="text-dark-300">{roadside.app}</b>
        </div>
      )}
    </div>
  )
}

/* Tarjeta de taller */
function directionsUrl(w, userCoords) {
  // Formato /dir/ORIGEN/DESTINO/ — el más fiable para abrir navegación directa en Google Maps
  if (w.latitude && w.longitude) {
    const dest = `${w.latitude},${w.longitude}`
    const origin = userCoords ? `${userCoords.lat},${userCoords.lng}` : ''
    return origin
      ? `https://www.google.com/maps/dir/${origin}/${dest}/`
      : `https://www.google.com/maps/dir//${dest}/`
  }
  // Sin coordenadas: dirección como texto con origen desde mi ubicación
  const addr = [w.address, w.city].filter(Boolean).join(', ')
  if (!addr) return null
  const destEnc = encodeURIComponent(addr)
  return userCoords
    ? `https://www.google.com/maps/dir/${userCoords.lat},${userCoords.lng}/${destEnc}/`
    : `https://www.google.com/maps/dir//${destEnc}/`
}

function WorkshopCard({ w, userCoords }) {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)
  const cats = (w.categories || []).slice(0, 4)

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-dark-700/50 bg-dark-800/60 transition hover:border-dark-600 hover:bg-dark-800">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-dark-700 group-hover:bg-dark-600 transition">
          <Wrench size={16} className="text-dark-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start gap-1.5">
            <h3 className="text-sm font-semibold text-dark-50 leading-tight">{w.name}</h3>
            {w.is_official && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
                <BadgeCheck size={9} /> {t('ws.official')}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <DistBadge km={w.distance_km} />
            {w.city && (
              <span className="flex items-center gap-1 text-[11px] text-dark-500">
                <MapPin size={9} /> {w.city}
              </span>
            )}
            {w.rating != null && (
              <span className="flex items-center gap-0.5 text-[11px] text-amber-400">
                <Star size={9} fill="currentColor" /> {w.rating.toFixed(1)}
                {w.rating_count && <span className="text-dark-600 ml-0.5">({w.rating_count})</span>}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Categorías */}
      {cats.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-3">
          {cats.map(c => (
            <span key={c} className="rounded-full bg-dark-700 px-2 py-0.5 text-[10px] text-dark-400">{c}</span>
          ))}
        </div>
      )}

      {/* Convenios */}
      {(w.convenios || []).length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-3">
          {(w.convenios || []).map(c => {
            const cls = providerTag(c) || 'text-dark-400 bg-dark-700 ring-dark-600'
            return <span key={c} className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 ${cls}`}>{c}</span>
          })}
        </div>
      )}

      {/* Acciones */}
      <div className="mt-auto border-t border-dark-700/50 grid grid-cols-3 divide-x divide-dark-700/50">
        {w.phone ? (
          <a href={`tel:${w.phone.replace(/\s/g, '')}`}
            className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-dark-400 transition hover:bg-dark-700/40 hover:text-dark-100"
          >
            <Phone size={12} /> {t('ws.call')}
          </a>
        ) : <div className="flex items-center justify-center py-2.5 text-xs text-dark-700">{t('ws.no.phone')}</div>}

        {directionsUrl(w, userCoords) ? (
          <a
            href={directionsUrl(w, userCoords)}
            target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-dark-400 transition hover:bg-dark-700/40 hover:text-blue-400"
          >
            <Navigation size={12} /> {t('ws.directions')}
          </a>
        ) : <div className="flex items-center justify-center py-2.5 text-xs text-dark-700">{t('ws.no.map')}</div>}

        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center justify-center gap-1 py-2.5 text-xs text-dark-500 transition hover:bg-dark-700/40 hover:text-dark-300"
        >
          {expanded ? t('ws.less') : t('ws.more')}
          <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Detalle expandible */}
      {expanded && (
        <div className="border-t border-dark-700/40 bg-dark-900/50 px-4 py-3 space-y-1.5 text-xs text-dark-400">
          {w.address && <div className="flex gap-1.5"><MapPin size={11} className="mt-0.5 shrink-0 text-dark-600" />{w.address}</div>}
          {w.hours && <div className="flex gap-1.5"><Clock size={11} className="mt-0.5 shrink-0 text-dark-600" />{w.hours}</div>}
          {w.website && (
            <a href={w.website} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-sky-400 hover:underline">
              <Globe size={11} /> Web oficial <ExternalLink size={10} />
            </a>
          )}
          {w.notes && <div className="flex gap-1.5 text-dark-600 italic"><Info size={11} className="mt-0.5 shrink-0" />{w.notes}</div>}
        </div>
      )}
    </div>
  )
}

/* Componente principal */
export default function Talleres() {
  const { center } = useOutletContext?.() || {}
  const { t } = useT()

  // Geolocalización
  const [geoState, setGeoState] = useState('idle') // idle | loading | ok | error | denied | manual
  const [coords, setCoords] = useState(null)
  const [locationLabel, setLocationLabel] = useState('')  // nombre legible de la ubicación actual
  const [accuracy, setAccuracy] = useState(null)
  const watchIdRef = useRef(null)

  // Entrada manual de dirección
  const [manualAddr, setManualAddr] = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [manualErr, setManualErr] = useState('')

  // Datos
  const [result, setResult] = useState(null)  // { workshops, roadside, provider }
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  // Filtros
  const [providerFilter, setProviderFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [q, setQ] = useState('')
  const [providers, setProviders] = useState([]) // proveedores únicos en la flota

  // Cargar proveedores de la flota para el selector
  useEffect(() => {
    getVehicles(center).then(r => {
      const pvs = [...new Set(
        (r.data || [])
          .map(v => (v.provider || '').split('_')[0].trim().toUpperCase())
          .filter(Boolean)
      )].sort()
      setProviders(pvs)
    }).catch(() => {})
  }, [center])

  const fetchNearby = useCallback(async (lat, lng, provider, category) => {
    setLoading(true); setErr('')
    try {
      const r = await getWorkshopsNearby(lat, lng, { provider, category })
      setResult(r.data)
    } catch (e) {
      setErr(t('ws.load.err'))
    } finally { setLoading(false) }
  }, [])

  function requestGeo() {
    if (!navigator.geolocation) {
      setGeoState('error')
      setErr('Tu navegador no soporta geolocalización.')
      return
    }
    // Cancelar watch previo si existía
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }
    setGeoState('loading')
    setAccuracy(null)

    // Usamos watchPosition para refinar la posición hasta GPS real.
    // En cuanto tengamos < 50 m de precisión (GPS), paramos y buscamos.
    // Si en 12 s no llegamos a esa precisión, aceptamos lo mejor que tengamos.
    let bestPos = null
    const deadline = Date.now() + 12000

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy: acc } = pos.coords
        bestPos = pos
        setAccuracy(Math.round(acc))

        const goodEnough = acc <= 50 || Date.now() >= deadline
        if (goodEnough) {
          navigator.geolocation.clearWatch(watchIdRef.current)
          watchIdRef.current = null
          setCoords({ lat: latitude, lng: longitude })
          setGeoState('ok')
          reverseGeocode(latitude, longitude)
          fetchNearby(latitude, longitude, providerFilter || undefined, categoryFilter || undefined)
        }
      },
      (err) => {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
        // Si ya teníamos algo, lo usamos igualmente
        if (bestPos) {
          const { latitude, longitude } = bestPos.coords
          setCoords({ lat: latitude, lng: longitude })
          setGeoState('ok')
          fetchNearby(latitude, longitude, providerFilter || undefined, categoryFilter || undefined)
          return
        }
        setGeoState(err.code === 1 ? 'denied' : 'error')
        setErr(err.code === 1 ? t('ws.denied') : t('ws.geo.error'))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )

    // Fallback: si en 13 s no disparó nada, usamos bestPos o mostramos error
    setTimeout(() => {
      if (watchIdRef.current == null) return // ya resolvió
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
      if (bestPos) {
        const { latitude, longitude } = bestPos.coords
        setCoords({ lat: latitude, lng: longitude })
        setGeoState('ok')
        fetchNearby(latitude, longitude, providerFilter || undefined, categoryFilter || undefined)
      } else {
        setGeoState('error')
        setErr(t('ws.geo.timeout'))
      }
    }, 13000)
  }

  // Limpiar watch al desmontar
  useEffect(() => () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
  }, [])

  // Geocodificación manual con Nominatim (OpenStreetMap, gratuito, sin API key)
  async function geocodeManual() {
    if (!manualAddr.trim()) return
    setManualLoading(true); setManualErr('')
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(manualAddr)}&format=json&limit=1&countrycodes=es`
      const r = await fetch(url, { headers: { 'Accept-Language': 'es' } })
      const data = await r.json()
      if (!data.length) { setManualErr(t('ws.addr.notfound')); return }
      const { lat, lon, display_name } = data[0]
      const c = { lat: parseFloat(lat), lng: parseFloat(lon) }
      setCoords(c)
      setLocationLabel(display_name.split(',').slice(0, 2).join(',').trim())
      setGeoState('ok')
      setAccuracy(null)
      fetchNearby(c.lat, c.lng, providerFilter || undefined, categoryFilter || undefined)
    } catch { setManualErr(t('ws.addr.err')) }
    finally { setManualLoading(false) }
  }

  // Reverse geocode para mostrar nombre legible al usar GPS
  async function reverseGeocode(lat, lng) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { headers: { 'Accept-Language': 'es' } })
      const d = await r.json()
      if (d.display_name) setLocationLabel(d.display_name.split(',').slice(0, 2).join(',').trim())
    } catch {}
  }

  // Re-buscar al cambiar filtros si ya tenemos coords
  useEffect(() => {
    if (coords && geoState === 'ok') {
      fetchNearby(coords.lat, coords.lng, providerFilter || undefined, categoryFilter || undefined)
    }
  }, [providerFilter, categoryFilter])

  const workshops = (result?.workshops || []).filter(w => {
    if (!q) return true
    const s = q.toLowerCase()
    return [w.name, w.city, w.address, ...(w.categories || []), ...(w.convenios || [])]
      .some(x => (x || '').toLowerCase().includes(s))
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="rise">
          <h1 className="font-display text-[clamp(28px,3.4vw,42px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">{t('ws.title')}</h1>
          <p className="mt-3 text-[13.5px] text-dark-500">
            {t('ws.concerted')}
          </p>
        </div>
        {geoState === 'ok' && coords && (
          <div className="flex flex-wrap items-center gap-2">
            {locationLabel && (
              <span className="flex items-center gap-1 text-[11px] text-dark-500">
                <MapPin size={10} className="text-blue-400" /> {locationLabel}
              </span>
            )}
            {accuracy != null && (
              <span className={`text-[11px] ${accuracy <= 50 ? 'text-emerald-500' : accuracy <= 200 ? 'text-amber-500' : 'text-red-400'}`}>
                ± {accuracy} m
              </span>
            )}
            <button
              onClick={() => { setGeoState('idle'); setCoords(null); setResult(null); setLocationLabel(''); setManualAddr('') }}
              className="flex items-center gap-1.5 rounded-xl border border-dark-700 px-3 py-2 text-xs text-dark-400 hover:border-dark-500 hover:text-dark-200 transition"
            >
              <MapPin size={12} /> {t('ws.change.loc')}
            </button>
          </div>
        )}
      </div>

      {/* Panel de geolocalización — estado inicial */}
      {geoState === 'idle' && (
        <div className="relative overflow-hidden rounded-2xl border border-dark-700/60 bg-dark-800/50 p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-500/5" />
          <div className="relative max-w-lg">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 ring-1 ring-blue-500/20">
                <MapPin size={18} className="text-blue-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-dark-100">{t('ws.where.now')}</div>
                <div className="text-xs text-dark-500">{t('ws.addr.hint')}</div>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm"
                placeholder="Ej: Polígono Tambre, Santiago de Compostela"
                value={manualAddr}
                onChange={e => { setManualAddr(e.target.value); setManualErr('') }}
                onKeyDown={e => e.key === 'Enter' && geocodeManual()}
                autoFocus
              />
              <button
                onClick={geocodeManual}
                disabled={manualLoading || !manualAddr.trim()}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500 disabled:opacity-40"
              >
                {manualLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                {t('rental.search')}
              </button>
            </div>
            {manualErr && <p className="mt-2 text-xs text-red-400">{manualErr}</p>}

            <div className="mt-3 flex items-center gap-2">
              <div className="h-px flex-1 bg-dark-700" />
              <span className="text-[11px] text-dark-600">o</span>
              <div className="h-px flex-1 bg-dark-700" />
            </div>
            <button
              onClick={requestGeo}
              className="mt-3 flex items-center gap-2 text-xs text-dark-500 transition hover:text-dark-300"
            >
              <Navigation size={11} /> {t('ws.gps.try')}
              <span className="text-dark-700">{t('ws.gps.hint')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Loading geo */}
      {geoState === 'loading' && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dark-700 bg-dark-800/50 py-12">
          <div className="flex items-center gap-3">
            <Loader2 size={20} className="animate-spin text-blue-400" />
            <span className="text-sm text-dark-400">
              {accuracy == null
                ? t('ws.gps.loading')
                : accuracy <= 50
                  ? `${t('ws.gps.ready')} · ± ${accuracy} m`
                  : `${t('ws.gps.refining')} ± ${accuracy} m`
              }
            </span>
          </div>
          {accuracy != null && accuracy > 50 && (
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-dark-700">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.max(5, Math.min(100, (1 - accuracy / 500) * 100))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Error geo */}
      {(geoState === 'denied' || geoState === 'error') && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
            <div>
              <div className="text-sm font-semibold text-red-300">{geoState === 'denied' ? t('ws.denied') : t('ws.geo.error')}</div>
              <div className="mt-0.5 text-xs text-red-400/80">{err}</div>
            </div>
            <button onClick={requestGeo} className="ml-auto shrink-0 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 transition">
              {t('ws.retry')}
            </button>
          </div>
        </div>
      )}

      {/* Contenido una vez tenemos ubicación */}
      {geoState === 'ok' && (
        <>
          {/* Asistencia en carretera */}
          <RoadsideBanner roadside={result?.roadside} provider={providerFilter} />

          {/* Filtros */}
          <div className="flex flex-wrap gap-2">
            {/* Buscador */}
            <div className="relative flex-1 min-w-[160px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                className="input w-full pl-9 text-sm"
                placeholder={t('ws.search.ph')}
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>

            {/* Filtro proveedor */}
            <div className="relative">
              <Car size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <select
                className="select pl-8 pr-8 text-sm appearance-none"
                value={providerFilter}
                onChange={e => setProviderFilter(e.target.value)}
              >
                <option value="">{t('ws.all.providers')}</option>
                {providers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
            </div>

            {/* Filtro categoría */}
            <div className="relative">
              <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <select
                className="select pl-8 pr-8 text-sm appearance-none"
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
              >
                <option value="">{t('ws.all.cats')}</option>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
            </div>
          </div>

          {/* Resultados */}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-dark-400">
              <Loader2 size={18} className="animate-spin" /> {t('ui.loading')}
            </div>
          ) : err ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">{err}</div>
          ) : workshops.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dark-700 bg-dark-800/40 py-14 text-center">
              <Wrench size={28} className="text-dark-700" />
              <div className="text-sm text-dark-500">
                {providerFilter
                  ? t('ws.none.km').replace('{p}', providerFilter)
                  : t('ws.empty')}
              </div>
              {providerFilter && (
                <button onClick={() => setProviderFilter('')} className="text-xs text-blue-400 hover:underline">
                  {t('ws.see.all.prov')}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-dark-500">
                <span className="font-semibold text-dark-300">{workshops.length}</span> {t('ws.found').replace('{n}', workshops.length).replace(/^\d+ /, '')}
                {providerFilter && <span>{t('ws.filtered.by')} <b className="text-dark-300">{providerFilter}</b></span>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {workshops.map(w => <WorkshopCard key={w.id} w={w} userCoords={coords} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
