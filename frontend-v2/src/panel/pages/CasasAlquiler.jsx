import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Building2, ChevronDown, Clock, ExternalLink, Globe, Info,
  Loader2, Mail, MapPin, Navigation, Phone, Search,
} from 'lucide-react'
import { getRentalsNearby } from '../api'
import { useT } from '../../i18n'

// ── Logo helpers ──────────────────────────────────────────────────────────────

const LOGO_FILES = {
  'hertz.com':        '/logos/hertz.svg',
  'europcar.com':     '/logos/europcar.svg',
  'sixt.com':         '/logos/sixt.svg',
  'avis.com':         '/logos/avis.svg',
  'budget.com':       '/logos/budget.svg',
  'iberfurgo.com':    '/logos/iberfurgo.svg',
  'onefurgo.com':     '/logos/onefurgo.svg',
  'hellorentacar.es': '/logos/hellorentacar.svg',
  'gorental.es':      '/logos/gorental.svg',
  'record-go.com':    '/logos/record-go.svg',
}

const BRAND_META = {
  'hertz.com':        { bg: '#FFD100', text: '#1a1a1a', initials: 'HZ' },
  'europcar.com':     { bg: '#009A44', text: '#fff',    initials: 'EC' },
  'sixt.com':         { bg: '#FF5F00', text: '#fff',    initials: 'SX' },
  'avis.com':         { bg: '#C8102E', text: '#fff',    initials: 'AV' },
  'budget.com':       { bg: '#E4002B', text: '#fff',    initials: 'BU' },
  'iberfurgo.com':    { bg: '#E84023', text: '#fff',    initials: 'IF' },
  'onefurgo.com':     { bg: '#FF6B00', text: '#fff',    initials: 'OF' },
  'hellorentacar.es': { bg: '#00B140', text: '#fff',    initials: 'HR' },
  'gorental.es':      { bg: '#0073CF', text: '#fff',    initials: 'GR' },
  'record-go.com':    { bg: '#E30613', text: '#fff',    initials: 'RG' },
}

function CompanyLogo({ domain, name, brandColor, size = 52 }) {
  const [err, setErr] = useState(false)
  const src = LOGO_FILES[domain]
  const meta = BRAND_META[domain]
  const bg = brandColor || meta?.bg || '#334155'

  if (src && !err) {
    return (
      <div
        className="shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/10 shadow-sm"
        style={{ width: size, height: size, background: bg }}
      >
        <img
          src={src}
          alt={name}
          onError={() => setErr(true)}
          className="h-full w-full object-contain"
        />
      </div>
    )
  }

  const initials = meta?.initials || (name || '??').slice(0, 2).toUpperCase()
  return (
    <div
      className="shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/10 shadow-sm flex items-center justify-center"
      style={{ width: size, height: size, background: bg }}
    >
      <span className="text-sm font-black tracking-tight" style={{ color: meta?.text || '#fff' }}>
        {initials}
      </span>
    </div>
  )
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function directionsUrl(r, userCoords) {
  if (r.latitude && r.longitude) {
    const dest = `${r.latitude},${r.longitude}`
    const origin = userCoords ? `${userCoords.lat},${userCoords.lng}` : ''
    return origin
      ? `https://www.google.com/maps/dir/${origin}/${dest}/`
      : `https://www.google.com/maps/dir//${dest}/`
  }
  const addr = [r.address, r.city].filter(Boolean).join(', ')
  if (!addr) return null
  const enc = encodeURIComponent(addr)
  return userCoords
    ? `https://www.google.com/maps/dir/${userCoords.lat},${userCoords.lng}/${enc}/`
    : `https://www.google.com/maps/dir//${enc}/`
}

function DistBadge({ km }) {
  if (km == null) return null
  const label = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
  const cls = km < 3
    ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/25'
    : km < 10
    ? 'bg-sky-500/15 text-sky-300 ring-sky-500/25'
    : 'bg-dark-700 text-dark-400 ring-dark-600'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${cls}`}>
      <Navigation size={8} /> {label}
    </span>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────
function RentalCard({ r, userCoords, rank }) {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)
  const mapsHref = directionsUrl(r, userCoords)

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-dark-700/60 bg-dark-800/70 shadow-sm transition-all hover:border-dark-600 hover:shadow-lg hover:shadow-black/20">
      {/* Rank ribbon for top 3 */}
      {rank <= 3 && (
        <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-dark-700 text-[10px] font-bold text-dark-400">
          {rank}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <CompanyLogo domain={r.logo_domain} name={r.name} brandColor={r.brand_color} size={52} />
        <div className="flex-1 min-w-0 pt-0.5">
          <h3 className="truncate text-sm font-bold text-dark-50 leading-snug">{r.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <DistBadge km={r.distance_km} />
            {r.city && (
              <span className="flex items-center gap-0.5 text-[11px] text-dark-500">
                <MapPin size={9} /> {r.city}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Address preview */}
      {r.address && (
        <div className="mx-4 mb-3 flex items-start gap-1.5 text-[11px] text-dark-500">
          <MapPin size={10} className="mt-0.5 shrink-0 text-dark-700" />
          <span className="line-clamp-1">{r.address}</span>
        </div>
      )}

      {/* Notes preview */}
      {r.notes && !expanded && (
        <div className="mx-4 mb-3 flex items-start gap-1.5 text-[11px] text-dark-600 italic">
          <Info size={9} className="mt-0.5 shrink-0" />
          <span className="line-clamp-2">{r.notes}</span>
        </div>
      )}

      {/* Action bar */}
      <div className="mt-auto border-t border-dark-700/50">
        <div className="grid grid-cols-3 divide-x divide-dark-700/50">
          {r.phone ? (
            <a
              href={`tel:${r.phone.replace(/\s/g, '')}`}
              className="flex items-center justify-center gap-1.5 py-3 text-xs font-medium text-dark-400 transition hover:bg-dark-700/40 hover:text-dark-100"
            >
              <Phone size={12} /> {t('rental.call')}
            </a>
          ) : (
            <div className="flex items-center justify-center py-3 text-xs text-dark-700">{t('rental.no.phone')}</div>
          )}

          {mapsHref ? (
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 py-3 text-xs font-medium text-dark-400 transition hover:bg-dark-700/40 hover:text-blue-400"
            >
              <Navigation size={12} /> {t('rental.directions')}
            </a>
          ) : (
            <div className="flex items-center justify-center py-3 text-xs text-dark-700">{t('rental.no.map')}</div>
          )}

          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center justify-center gap-1 py-3 text-xs text-dark-500 transition hover:bg-dark-700/40 hover:text-dark-300"
          >
            {expanded ? t('rental.less') : t('rental.more')}
            <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-dark-700/40 bg-dark-900/50 px-4 py-3 space-y-2 text-[12px] text-dark-400">
          {r.hours   && <div className="flex gap-1.5"><Clock size={11} className="mt-0.5 shrink-0 text-dark-600" />{r.hours}</div>}
          {r.email   && <a href={`mailto:${r.email}`} className="flex items-center gap-1.5 hover:text-dark-200"><Mail size={11} />{r.email}</a>}
          {r.website && (
            <a href={r.website} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-sky-400 hover:underline">
              <Globe size={11} /> Web oficial <ExternalLink size={9} />
            </a>
          )}
          {r.notes   && <div className="flex gap-1.5 italic text-dark-600"><Info size={11} className="mt-0.5 shrink-0" />{r.notes}</div>}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
const MAX_KM = 20

export default function CasasAlquiler() {
  const { t } = useT()
  const [geoState, setGeoState]               = useState('idle')
  const [coords, setCoords]                   = useState(null)
  const [locationLabel, setLocationLabel]     = useState('')
  const watchIdRef                            = useRef(null)

  const [rentals, setRentals]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [err, setErr]             = useState('')

  const [q, setQ]                         = useState('')
  const [manualAddr, setManualAddr]       = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [manualErr, setManualErr]         = useState('')

  useEffect(() => () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
  }, [])

  const fetchNearby = useCallback(async (lat, lng) => {
    setLoading(true); setErr('')
    try {
      const r = await getRentalsNearby(lat, lng, MAX_KM)
      setRentals(r.data?.rentals || [])
    } catch { setErr(t('rental.load.err')) }
    finally { setLoading(false) }
  }, [])

  async function reverseGeocode(lat, lng) {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'Accept-Language': 'es' } }
      )
      const d = await r.json()
      if (d.display_name) setLocationLabel(d.display_name.split(',').slice(0, 2).join(',').trim())
    } catch {}
  }

  async function geocodeManual() {
    if (!manualAddr.trim()) return
    setManualLoading(true); setManualErr('')
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(manualAddr)}&format=json&limit=1&countrycodes=es`
      const r = await fetch(url, { headers: { 'Accept-Language': 'es' } })
      const data = await r.json()
      if (!data.length) { setManualErr(t('rental.addr.notfound')); return }
      const { lat, lon, display_name } = data[0]
      const c = { lat: parseFloat(lat), lng: parseFloat(lon) }
      setCoords(c)
      setLocationLabel(display_name.split(',').slice(0, 2).join(',').trim())
      setGeoState('ok')
      fetchNearby(c.lat, c.lng)
    } catch { setManualErr(t('rental.addr.error')) }
    finally { setManualLoading(false) }
  }

  function requestGeo() {
    if (!navigator.geolocation) { setGeoState('error'); return }
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
    setGeoState('loading')

    let bestPos = null
    const deadline = Date.now() + 12000

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        bestPos = pos
        const { latitude, longitude, accuracy } = pos.coords
        if (accuracy <= 50 || Date.now() >= deadline) {
          navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null
          setCoords({ lat: latitude, lng: longitude })
          setGeoState('ok')
          reverseGeocode(latitude, longitude)
          fetchNearby(latitude, longitude)
        }
      },
      () => {
        navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null
        if (bestPos) {
          const { latitude, longitude } = bestPos.coords
          setCoords({ lat: latitude, lng: longitude })
          setGeoState('ok')
          fetchNearby(latitude, longitude)
        } else { setGeoState('error'); setErr(t('rental.gps.error')) }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )

    setTimeout(() => {
      if (watchIdRef.current == null) return
      navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null
      if (bestPos) {
        const { latitude, longitude } = bestPos.coords
        setCoords({ lat: latitude, lng: longitude })
        setGeoState('ok')
        fetchNearby(latitude, longitude)
      } else { setGeoState('error'); setErr(t('rental.timeout')) }
    }, 13000)
  }

  const filtered = rentals.filter(r => {
    if (!q) return true
    const s = q.toLowerCase()
    return [r.name, r.city, r.address].some(x => (x || '').toLowerCase().includes(s))
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('rental.title')}</h1>
          <p className="mt-0.5 text-xs text-dark-500">
            {t('rental.subtitle').replace('{n}', MAX_KM)}
          </p>
        </div>
        {geoState === 'ok' && (
          <button
            onClick={() => { setGeoState('idle'); setCoords(null); setRentals([]); setLocationLabel(''); setManualAddr('') }}
            className="flex items-center gap-1.5 rounded-xl border border-dark-700 px-3 py-2 text-xs text-dark-400 transition hover:border-dark-500 hover:text-dark-200"
          >
            <MapPin size={11} className="text-blue-400" />
            {locationLabel || t('rental.current.loc')}
            <span className="text-dark-700">{t('rental.change')}</span>
          </button>
        )}
      </div>

      {/* ── Idle: dirección manual ──────────────────────────────── */}
      {geoState === 'idle' && (
        <div className="relative overflow-hidden rounded-2xl border border-dark-700/60 bg-gradient-to-br from-dark-800/80 to-dark-900/60 p-6 shadow-sm">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/5 blur-2xl" />
          <div className="relative max-w-lg">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 ring-1 ring-blue-500/20">
                <Building2 size={20} className="text-blue-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-dark-100">{t('rental.where')}</div>
                <div className="text-xs text-dark-500">{t('rental.addr.hint')}</div>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-600" />
                <input
                  className="input w-full pl-9 text-sm"
                  placeholder={t('rental.search.ph')}
                  value={manualAddr}
                  onChange={e => { setManualAddr(e.target.value); setManualErr('') }}
                  onKeyDown={e => e.key === 'Enter' && geocodeManual()}
                  autoFocus
                />
              </div>
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

            <div className="mt-4 flex items-center gap-2">
              <div className="h-px flex-1 bg-dark-700/60" />
              <span className="text-[11px] text-dark-700">o</span>
              <div className="h-px flex-1 bg-dark-700/60" />
            </div>

            <button
              onClick={requestGeo}
              className="mt-3 flex items-center gap-2 text-xs text-dark-600 transition hover:text-dark-400"
            >
              <Navigation size={11} />
              {t('rental.gps')}
              <span className="text-dark-800">{t('rental.gps.hint')}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── GPS loading ─────────────────────────────────────────── */}
      {geoState === 'loading' && (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-dark-700 bg-dark-800/50 py-14">
          <Loader2 size={20} className="animate-spin text-blue-400" />
          <span className="text-sm text-dark-400">{t('rental.gps.loading')}</span>
        </div>
      )}

      {/* ── GPS error ────────────────────────────────────────────── */}
      {geoState === 'error' && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          {err || t('rental.gps.error')}
          <button onClick={() => setGeoState('idle')} className="ml-3 underline">{t('rental.back')}</button>
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────── */}
      {geoState === 'ok' && (
        <>
          {/* Search filter */}
          <div className="relative">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              className="input w-full pl-9 text-sm"
              placeholder={t('rental.filter.ph')}
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-dark-400">
              <Loader2 size={18} className="animate-spin" /> {t('rental.searching')}
            </div>
          ) : err ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">{err}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dark-700 bg-dark-800/40 py-16 text-center">
              <Building2 size={32} className="text-dark-700" />
              <div className="text-sm font-medium text-dark-500">{t('rental.none.km').replace('{n}', MAX_KM)}</div>
              <div className="text-xs text-dark-700">{t('rental.none.hint')}</div>
              <button
                onClick={() => { setGeoState('idle'); setCoords(null); setRentals([]); setLocationLabel(''); setManualAddr('') }}
                className="mt-1 rounded-xl border border-dark-700 px-4 py-2 text-xs text-dark-400 hover:border-dark-500 hover:text-dark-200 transition"
              >
                {t('rental.change.loc')}
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-dark-600">
                {t('rental.count').replace('{n}', filtered.length).replace('{s}', filtered.length !== 1 ? 'es' : '').replace('{km}', MAX_KM)}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((r, i) => (
                  <RentalCard key={r.id || r.name} r={r} userCoords={coords} rank={i + 1} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
