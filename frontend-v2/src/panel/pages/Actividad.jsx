import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT } from '../../i18n'
import { Loader2, Activity, Camera } from 'lucide-react'
import { getInspections, getVehicles } from '../api'

const SEV_CLS = {
  leve: 'text-amber-300', moderado: 'text-orange-300', grave: 'text-red-300',
  critico: 'text-red-200', sin_danos: 'text-emerald-300',
}

export default function Actividad() {
  const { center } = useOutletContext()
  const { t } = useT()
  const sevLabel = (k) => t(`sev.${k}`) || k
  const [insps, setInsps] = useState(null)
  const [vmap, setVmap] = useState({})
  const [err, setErr] = useState('')

  useEffect(() => {
    Promise.all([getInspections({ limit: 80 }), getVehicles('Todos')])
      .then(([ri, rv]) => {
        const m = {}; (rv.data || []).forEach((v) => { m[v.id] = { plate: v.license_plate, center: v.center || '' } })
        setVmap(m); setInsps(ri.data || [])
      })
      .catch(() => setErr(t('act.load.err')))
  }, [])

  const list = useMemo(() => (insps || []).filter((i) => {
    if (center === 'Todos') return true
    return (vmap[i.vehicle_id]?.center || '').toUpperCase().includes(center.toUpperCase())
  }), [insps, vmap, center])

  if (err) return <p className="text-red-400">{err}</p>
  if (!insps) return <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> {t('ui.loading')}</div>

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold"><Activity size={20} /> {t('act.title')}</h1>
      <div className="card divide-y divide-dark-800">
        {list.map((i) => {
          const v = vmap[i.vehicle_id] || {}
          const sev = i.analysis?.severity || 'sin_analisis'
          return (
            <div key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Camera size={15} className="shrink-0 text-dark-500" />
              <span className="font-semibold">{v.plate || '—'}</span>
              <span className="text-dark-400">{t('act.inspection.label')} · <span className={SEV_CLS[sev] || 'text-dark-400'}>{sevLabel(sev)}</span></span>
              <span className="ml-auto text-xs text-dark-500">{(i.created_at || '').slice(0, 16).replace('T', ' ')}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
