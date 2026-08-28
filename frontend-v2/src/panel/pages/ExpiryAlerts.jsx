import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { lista } from '../../lib/lista'
import { Loader2, CalendarClock, HelpCircle } from 'lucide-react'

const ST = {
  caducada: 'bg-red-600/30 text-red-200', vencido: 'bg-red-600/30 text-red-200',
  urgente: 'bg-red-500/20 text-red-300',
  proxima: 'bg-amber-500/20 text-amber-300', proximo: 'bg-amber-500/20 text-amber-300',
  // "No se sabe" NO es un estado tranquilo: se pinta con el mismo peso que un
  // aviso, porque hasta comprobarlo hay que tratarlo igual.
  sin_fecha: 'bg-violet-500/20 text-violet-300',
}

const ETIQUETA = {
  caducada: 'caducada', urgente: 'urgente', proxima: 'próxima',
  sin_fecha: 'sin fecha',
}

// Lista de vencimientos (ITV o Renting) — misma estructura, distinta fecha.
export default function ExpiryAlerts({ title, fetcher, dateField, dateLabel, extraCol }) {
  const { t } = useT()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetcher().then((r) => setRows(lista(r.data))).catch(() => setErr(t('ui.error')))
  }, [fetcher])

  if (err) return <p className="text-red-400">{err}</p>
  if (!rows) return <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> {t('ui.loading')}</div>

  const cuenta = (k) => rows.filter((r) => r.status === k).length
  const caducadas = cuenta('caducada')
  const sinFecha = cuenta('sin_fecha')

  return (
    <div>
      <h1 className="mb-3 text-xl font-bold">{title} <span className="text-dark-500">· {rows.length}</span></h1>

      {/* ── EL RESUMEN, ANTES DE LA TABLA ──────────────────────────────────
          Una tabla de 90 filas no dice si hay que salir corriendo. Estas tres
          cifras sí, y separan lo que está mal de lo que no se sabe, que es
          justo la distinción que faltaba. */}
      {rows.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {caducadas > 0 && (
            <span className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[13px] font-semibold text-red-300">
              {caducadas} {caducadas === 1 ? 'caducada' : 'caducadas'} · circular así son 200 € y el vehículo inmovilizado
            </span>
          )}
          {sinFecha > 0 && (
            <span className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[13px] font-semibold text-violet-300">
              {sinFecha} sin fecha · no se sabe si están en regla
            </span>
          )}
          {cuenta('urgente') + cuenta('proxima') > 0 && (
            <span className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[13px] font-semibold text-amber-300">
              {cuenta('urgente') + cuenta('proxima')} por vencer
            </span>
          )}
        </div>
      )}

      {sinFecha > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-dark-700 bg-dark-900/60 px-3 py-2 text-[12.5px] leading-snug text-dark-400">
          <HelpCircle size={15} className="mt-0.5 flex-none text-violet-400" />
          Las de <b className="text-dark-200">sin fecha</b> no aparecían en esta pantalla: se
          saltaban el cálculo por no tener con qué compararse, y por eso parecían correctas.
          No saber si una ITV está en regla no es lo mismo que estarlo.
        </p>
      )}

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
                  {/* Sin fecha se dice con palabras, no con un guion: un '—' en
                      una columna de fechas se lee como "no aplica". */}
                  <td className="px-4 py-2.5 text-dark-300">
                    {r[dateField] || <span className="text-violet-300">sin registrar</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center font-semibold tabular-nums">
                    {r.days_left == null ? <span className="text-dark-500">?</span>
                      : r.days_left < 0 ? `${r.days_left}` : `+${r.days_left}`}
                  </td>
                  <td className="px-4 py-2.5"><span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${ST[r.status] || 'bg-dark-700 text-dark-300'}`}>{ETIQUETA[r.status] || r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
