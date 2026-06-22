import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Search, MapPin, Phone, Mail, Globe, BadgeCheck } from 'lucide-react'

// Directorio de contactos (talleres / casas de alquiler). Renderiza los campos que existan.
export default function Directory({ title, fetcher, icon: Icon }) {
  const ctx = useOutletContext?.() || {}
  const center = ctx.center || 'Todos'
  const [items, setItems] = useState(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    fetcher().then((r) => setItems(r.data || [])).catch(() => setErr('No se pudo cargar.'))
  }, [fetcher])

  const list = useMemo(() => (items || []).filter((it) => {
    if (center !== 'Todos' && (it.center || '').toUpperCase() !== center.toUpperCase()) return false
    if (q && !`${it.name} ${it.city || ''} ${it.address || ''}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [items, center, q])

  if (err) return <p className="text-red-400">{err}</p>
  if (!items) return <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> Cargando…</div>

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{title} <span className="text-dark-500">· {list.length}</span></h1>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input className="input w-56 pl-9" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card p-10 text-center text-dark-400">Sin resultados.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((it) => (
            <div key={it.id} className="card p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {Icon && <Icon size={16} className="text-brand-400" />}
                  <span className="font-semibold">{it.name}</span>
                </div>
                {it.is_official && <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"><BadgeCheck size={11} /> Oficial</span>}
              </div>
              {it.center && <div className="mb-2 text-[11px] text-dark-500">{it.center}</div>}
              <div className="space-y-1 text-sm text-dark-400">
                {(it.address || it.city) && <div className="flex items-start gap-1.5"><MapPin size={13} className="mt-0.5 shrink-0" /> {[it.address, it.city].filter(Boolean).join(', ')}</div>}
                {it.phone && <a href={`tel:${it.phone}`} className="flex items-center gap-1.5 hover:text-dark-200"><Phone size={13} /> {it.phone}</a>}
                {it.email && <a href={`mailto:${it.email}`} className="flex items-center gap-1.5 hover:text-dark-200"><Mail size={13} /> {it.email}</a>}
                {it.website && <a href={it.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sky-400 hover:underline"><Globe size={13} /> Web</a>}
                {it.maps_url && <a href={it.maps_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sky-400 hover:underline"><MapPin size={13} /> Cómo llegar</a>}
              </div>
              {Array.isArray(it.categories) && it.categories.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {it.categories.slice(0, 4).map((c) => <span key={c} className="rounded bg-dark-700 px-1.5 py-0.5 text-[10px] text-dark-300">{c}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
