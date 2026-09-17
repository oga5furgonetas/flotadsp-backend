import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT } from '../../i18n'
import { lista } from '../../lib/lista'
import { verMatricula } from '../../lib/matricula'
import { Loader2, Activity, Camera } from 'lucide-react'
import { getInspections, getVehicles } from '../api'
import GuidedEmpty from '../components/GuidedEmpty'

function cuando(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const hoy = new Date(); const ayer = new Date(); ayer.setDate(hoy.getDate() - 1)
  if (d.toDateString() === hoy.toDateString()) return `hoy ${hora}`
  if (d.toDateString() === ayer.toDateString()) return `ayer ${hora}`
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} ${hora}`
}

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
        const m = {}; (lista(rv.data)).forEach((v) => { m[v.id] = { plate: verMatricula(v.license_plate), center: v.center || '' } })
        setVmap(m); setInsps(lista(ri.data))
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
      <h1 className="rise mb-6 font-display text-[clamp(28px,3.4vw,42px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">{t('act.title')}</h1>
      {/* Vacia, la pantalla era solo el titulo: no decia de donde sale lo que
          aqui aparece ni como empezar. */}
      {list.length === 0 && (
        <GuidedEmpty emoji="📷" title={t('act.empty.tit')} hint={t('act.empty.hint')}
          actionLabel={t('empty.portal.cta')} to="/panel/portal-conductor" />
      )}
      {list.length > 0 && <div className="card divide-y divide-dark-800">
        {list.map((i) => {
          const v = vmap[i.vehicle_id] || {}
          const sev = i.analysis?.severity || 'sin_analisis'
          return (
            <div key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Camera size={15} className="shrink-0 text-dark-500" />
              <span className="font-semibold">{v.plate || '—'}</span>
              <span className="text-dark-400">{t('act.inspection.label')} · <span className={SEV_CLS[sev] || 'text-dark-400'}>{sevLabel(sev)}</span></span>
              {/* Hora LOCAL: cortando el texto ISO salía la de UTC, dos horas menos. */}
              <span className="cifra ml-auto whitespace-nowrap text-xs text-dark-500">{cuando(i.created_at)}</span>
            </div>
          )
        })}
      </div>}
    </div>
  )
}
