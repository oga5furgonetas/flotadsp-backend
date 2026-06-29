import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, BarChart3, FileText } from 'lucide-react'
import { getMetricsReports } from '../api'
import { useT } from '../../i18n'

export default function Metricas() {
  const { center } = useOutletContext()
  const { t } = useT()
  const [reports, setReports] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    setReports(null); setErr('')
    getMetricsReports(center).then((r) => setReports(r.data || [])).catch(() => setErr(t('metrics.load.err')))
  }, [center])

  if (err) return <p className="text-red-400">{err}</p>

  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold"><BarChart3 size={20} /> {t('metrics.title')} {reports && <span className="text-dark-500">· {reports.length}</span>}</h1>
      {!reports ? <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> {t('ui.loading')}</div> :
        reports.length === 0 ? <div className="card p-10 text-center text-dark-400">{t('metrics.no.reports')} {center !== 'Todos' && `en ${center}`}.</div> : (
          <div className="card divide-y divide-dark-800">
            {reports.map((r, i) => (
              <div key={r.id || i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="flex items-center gap-2 font-medium"><FileText size={14} className="text-dark-500" /> {r.name || r.tipo || r.type || t('metrics.report')}</span>
                {r.center && <span className="badge-orange">{r.center}</span>}
                <span className="text-dark-400">{r.week || r.semana || r.period || ''}</span>
                <span className="text-xs text-dark-500">{(r.created_at || r.uploaded_at || '').slice(0, 10)}</span>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
