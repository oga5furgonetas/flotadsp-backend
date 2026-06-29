import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { Loader2, CalendarClock } from 'lucide-react'

const ST = {
  caducada: 'bg-red-600/30 text-red-200', vencido: 'bg-red-600/30 text-red-200',
  urgente: 'bg-red-500/20 text-red-300',
  proxima: 'bg-amber-500/20 text-amber-300', proximo: 'bg-amber-500/20 text-amber-300',
}

// Lista de vencimientos (ITV o Renting) — misma estructura, distinta fecha.
export default function ExpiryAlerts({ title, fetcher, dateField, dateLabel, extraCol }) {
  const { t } = useT()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetcher().then((r) => setRows(r.data || [])).catch(() => setErr(t('ui.error')))
  }, [fetcher])

  if (err) return <p className="text-red-400">{err}</p>
  if (!rows) return <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> {t('ui.loading')}</div>

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">{title} <span className="text-dark-500">· {rows.length}</span></h1>
      {rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center text-dark-400">
          <CalendarClock size={28} /> {t('itv.empty')}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-dark-800 text-left text-xs uppercase tracking-wide text-dark-500">
              <th className="px-4 py-2.5">{t('veh.plate')}</th><th className="px-4 py-2.5">{t('ui.vehicle')}</th><th className="px-4 py-2.5">{t('ui.center')}</th>
              {extraCol && <th className="px-4 py-2.5">{extraCol.label}</th>}
              <th className="px-4 py-2.5">{dateLabel}</th><th className="px-4 py-2.5 text-center">{t('itv.days.left')}</th><th className="px-4 py-2.5">{t('ui.status')}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.vehicle_id} className="border-b border-dark-800/60 hover:bg-dark-800/30">
                  <td className="px-4 py-2.5 font-semibold">{r.license_plate}</td>
                  <td className="px-4 py-2.5 text-dark-300">{[r.brand, r.model].filter(Boolean).join(' ') || '—'}</td>
                  <td className="px-4 py-2.5 text-dark-400">{r.center || '—'}</td>
                  {extraCol && <td className="px-4 py-2.5 text-dark-400">{r[extraCol.field] || '—'}</td>}
                  <td className="px-4 py-2.5 text-dark-300">{r[dateField]}</td>
                  <td className="px-4 py-2.5 text-center font-semibold">{r.days_left < 0 ? `${r.days_left}` : `+${r.days_left}`}</td>
                  <td className="px-4 py-2.5"><span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${ST[r.status] || 'bg-dark-700 text-dark-300'}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
