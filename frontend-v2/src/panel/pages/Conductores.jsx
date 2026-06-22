import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Search, Mail, Phone, Trophy } from 'lucide-react'
import { getDrivers, getDriverRanking } from '../api'

function scoreCls(s) {
  if (s == null) return 'bg-dark-700 text-dark-300'
  if (s >= 85) return 'bg-emerald-500/20 text-emerald-300'
  if (s >= 70) return 'bg-amber-500/20 text-amber-300'
  return 'bg-red-500/20 text-red-300'
}

export default function Conductores() {
  const { center } = useOutletContext()
  const [drivers, setDrivers] = useState(null)
  const [scores, setScores] = useState({})
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    setDrivers(null); setErr('')
    Promise.all([getDrivers(center), getDriverRanking().catch(() => ({ data: [] }))])
      .then(([rd, rr]) => {
        const m = {}
        ;(rr.data || []).forEach((x) => { m[x.driver_id] = { score: x.score, total: x.total_inspections } })
        setScores(m)
        setDrivers(rd.data || [])
      })
      .catch(() => setErr('No se pudieron cargar los conductores.'))
  }, [center])

  const list = useMemo(() => {
    const l = (drivers || []).filter((d) => !q || (d.name || '').toLowerCase().includes(q.toLowerCase()) || (d.email || '').toLowerCase().includes(q.toLowerCase()))
    return l.sort((a, b) => (scores[b.id]?.score ?? -1) - (scores[a.id]?.score ?? -1))
  }, [drivers, scores, q])

  if (err) return <p className="text-red-400">{err}</p>
  if (!drivers) return <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> Cargando…</div>

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Conductores <span className="text-dark-500">· {list.length}</span></h1>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input className="input w-56 pl-9" placeholder="Buscar nombre o email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-800 text-left text-xs uppercase tracking-wide text-dark-500">
              <th className="px-4 py-2.5">Conductor</th>
              <th className="px-4 py-2.5">Centro</th>
              <th className="px-4 py-2.5">Contacto</th>
              <th className="px-4 py-2.5">Tipo</th>
              <th className="px-4 py-2.5 text-center">Inspecciones</th>
              <th className="px-4 py-2.5 text-center">Score</th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => {
              const sc = scores[d.id]
              return (
                <tr key={d.id} className="border-b border-dark-800/60 hover:bg-dark-800/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {d.photo_url
                        ? <img src={d.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                        : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dark-700 text-xs font-bold text-dark-300">{(d.name || '?').slice(0, 1).toUpperCase()}</div>}
                      <span className="font-medium">{d.name || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-dark-400">{d.center || '—'}</td>
                  <td className="px-4 py-2.5 text-dark-400">
                    <div className="flex flex-col gap-0.5 text-xs">
                      {d.email && <span className="flex items-center gap-1"><Mail size={11} /> {d.email}</span>}
                      {d.phone && <span className="flex items-center gap-1"><Phone size={11} /> {d.phone}</span>}
                      {!d.email && !d.phone && '—'}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {d.contrato && <span className="rounded bg-dark-700 px-1.5 py-0.5 text-[10px] uppercase text-dark-300">{d.contrato}</span>}
                      {d.nivel && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300">{d.nivel}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center text-dark-400">{sc?.total ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${scoreCls(sc?.score)}`}>
                      {sc?.score >= 85 && <Trophy size={11} />}{sc?.score ?? '—'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
