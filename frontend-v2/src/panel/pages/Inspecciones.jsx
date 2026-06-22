import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Search, X, FileText, Image as ImageIcon } from 'lucide-react'
import { getInspections, getVehicles, fetchAuthedBlob } from '../api'

const SEV_LABEL = { sin_danos: 'Sin daños', sin_analisis: 'Sin análisis', leve: 'Leve', moderado: 'Moderado', grave: 'Grave', critico: 'Crítico' }
const SEV_CLS = {
  leve: 'bg-amber-500/20 text-amber-300', moderado: 'bg-orange-500/20 text-orange-300',
  grave: 'bg-red-500/20 text-red-300', critico: 'bg-red-600/30 text-red-200',
  sin_danos: 'bg-emerald-500/20 text-emerald-300', sin_analisis: 'bg-dark-700 text-dark-300',
}
const FILTERS = ['Todas', 'grave', 'critico', 'moderado', 'leve', 'sin_danos']

function fmt(s) { const d = new Date(s); return isNaN(d) ? (s || '') : d.toLocaleString('es', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) }
function eur(n) { return n ? `${Number(n).toLocaleString('es')} €` : '—' }

export default function Inspecciones() {
  const { center } = useOutletContext()
  const [insps, setInsps] = useState(null)
  const [vmap, setVmap] = useState({})
  const [err, setErr] = useState('')
  const [sev, setSev] = useState('Todas')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)

  useEffect(() => {
    setErr('')
    Promise.all([getInspections({ limit: 300 }), getVehicles('Todos')])
      .then(([ri, rv]) => {
        const m = {}
        ;(rv.data || []).forEach((v) => { m[v.id] = { plate: v.license_plate, center: v.center || '' } })
        setVmap(m)
        setInsps(ri.data || [])
      })
      .catch(() => setErr('No se pudieron cargar las inspecciones.'))
  }, [])

  const list = useMemo(() => {
    if (!insps) return []
    return insps.filter((i) => {
      const v = vmap[i.vehicle_id] || {}
      if (center !== 'Todos' && !(v.center || '').toUpperCase().includes(center.toUpperCase())) return false
      const s = (i.analysis?.severity) || 'sin_analisis'
      if (sev !== 'Todas' && s !== sev) return false
      if (q && !(v.plate || '').toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [insps, vmap, center, sev, q])

  async function openPdf(id) {
    try { const url = await fetchAuthedBlob(`/inspections/${id}/pdf?boxes=1`); window.open(url, '_blank') }
    catch { setErr('No se pudo generar el PDF.') }
  }

  if (err) return <p className="text-red-400">{err}</p>
  if (!insps) return <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> Cargando…</div>

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Inspecciones <span className="text-dark-500">· {list.length}</span></h1>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input className="input w-56 pl-9" placeholder="Buscar matrícula…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setSev(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${sev === f ? 'bg-brand-500/20 text-brand-300' : 'bg-dark-800 text-dark-400 hover:text-dark-200'}`}>
            {f === 'Todas' ? 'Todas' : SEV_LABEL[f]}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card p-10 text-center text-dark-400">Sin inspecciones con estos filtros.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((i) => {
            const v = vmap[i.vehicle_id] || {}
            const s = i.analysis?.severity || 'sin_analisis'
            return (
              <button key={i.id} onClick={() => setSel(i)} className="card-hover overflow-hidden text-left">
                <div className="relative h-36 bg-dark-800">
                  {i.photos?.[0] ? <img src={i.photos[0]} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-dark-600"><ImageIcon size={24} /></div>}
                  <span className={`absolute left-2 top-2 rounded px-2 py-0.5 text-[11px] font-bold ${SEV_CLS[s]}`}>{SEV_LABEL[s] || s}</span>
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{v.plate || '—'}</span>
                    <span className="text-xs text-dark-500">{fmt(i.created_at)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-dark-400">
                    <span>{i.analysis?.total_damages_count || 0} daños</span>
                    <span>{eur(i.analysis?.total_estimated_cost)}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {sel && <Detail insp={sel} plate={vmap[sel.vehicle_id]?.plate} onClose={() => setSel(null)} onPdf={openPdf} />}
    </div>
  )
}

function Detail({ insp, plate, onClose, onPdf }) {
  const [pi, setPi] = useState(0)
  const a = insp.analysis || {}
  const damages = a.damages || []
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-dark-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{plate || 'Inspección'}</h2>
          <button onClick={onClose} className="btn-ghost p-2"><X size={18} /></button>
        </div>

        <div className="relative overflow-hidden rounded-lg bg-black">
          {insp.photos?.[pi] && <img src={insp.photos[pi]} alt="" className="w-full" />}
          {damages.filter((d) => Array.isArray(d.box_2d) && d.box_2d.length === 4 && (!d.photo_index || d.photo_index - 1 === pi) && d.box_2d.some((n) => n > 0)).map((d, k) => {
            const [y, x, y2, x2] = d.box_2d
            return <div key={k} className="pointer-events-none absolute rounded border-2 border-orange-400" style={{ left: `${x / 10}%`, top: `${y / 10}%`, width: `${(x2 - x) / 10}%`, height: `${(y2 - y) / 10}%` }} />
          })}
        </div>
        {insp.photos?.length > 1 && (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {insp.photos.map((p, k) => (
              <button key={k} onClick={() => setPi(k)} className={`h-12 w-14 shrink-0 overflow-hidden rounded border-2 ${k === pi ? 'border-brand-400' : 'border-transparent opacity-70'}`}>
                <img src={p} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-dark-400">
          <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${SEV_CLS[a.severity] || SEV_CLS.sin_analisis}`}>{SEV_LABEL[a.severity] || a.severity || '—'}</span>
          <span>{a.total_damages_count || 0} daños</span>
          <span>· {eur(a.total_estimated_cost)}</span>
          <span>· {fmt(insp.created_at)}</span>
        </div>

        {a.executive_summary && <p className="mt-3 border-l-2 border-brand-500/50 pl-3 text-sm leading-relaxed text-dark-300">{a.executive_summary}</p>}

        {damages.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-dark-500">Daños</div>
            {damages.map((d, k) => (
              <div key={k} className="rounded-lg border border-dark-800 bg-dark-800/40 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{d.part || 'Daño'}</span>
                  <span className="text-sm text-dark-300">{eur(d.estimated_cost)}</span>
                </div>
                {d.severity && <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] ${SEV_CLS[d.severity] || SEV_CLS.sin_analisis}`}>{SEV_LABEL[d.severity] || d.severity}</span>}
                {d.description && <p className="mt-1 text-xs text-dark-400">{d.description}</p>}
              </div>
            ))}
          </div>
        )}

        <button onClick={() => onPdf(insp.id)} className="btn-primary mt-4 flex w-full items-center justify-center gap-2 py-2.5">
          <FileText size={16} /> Descargar PDF del peritaje
        </button>
      </div>
    </div>
  )
}
