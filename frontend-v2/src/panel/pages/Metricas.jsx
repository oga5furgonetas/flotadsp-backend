import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, BarChart3, FileText, Upload, Route, CalendarRange,
  TrendingDown, MapPin, AlertCircle,
} from 'lucide-react'
import {
  getMetricsReports, uploadRoutePlan, uploadAmazonReport, uploadDailyReport,
  getDailyWeek, getRoutePlanAvailable,
} from '../api'
import { useT } from '../../i18n'
import { lista } from '../../lib/lista'
import { isoLocal } from '../../lib/fecha'

/* Los tres ficheros que un DSP maneja cada día. Cada uno alimenta algo:
   el plan de rutas da el ritmo real de cada conductor (lo usa el generador de
   cuadrantes), el daily da los fallos del día, y el report general se analiza
   con IA. */
const SUBIDAS = [
  { id: 'routeplan', icono: Route,        k: 'met.up.routeplan', acepta: '.xlsx,.xls,.csv', fn: uploadRoutePlan,    porCentro: true },
  { id: 'daily',     icono: CalendarRange, k: 'met.up.daily',    acepta: '.html,.htm',      fn: uploadDailyReport,  porCentro: false },
  { id: 'report',    icono: FileText,      k: 'met.up.report',   acepta: '.pdf,.xlsx,.xls,.csv,.html', fn: uploadAmazonReport, porCentro: true },
]

function Cifra({ n, etiqueta, alerta }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dark-800 bg-dark-900/50 px-4 py-3">
      <span className={`text-2xl font-extrabold ${alerta && n > 0 ? 'text-red-400' : 'text-dark-100'}`}>{n}</span>
      <span className="text-[11px] uppercase tracking-wide text-dark-500">{etiqueta}</span>
    </div>
  )
}

export default function Metricas() {
  const { center } = useOutletContext()
  const { t } = useT()
  const noCenter = center === 'Todos'

  const [reports, setReports] = useState(null)
  const [semana, setSemana] = useState(null)
  const [rutasHoy, setRutasHoy] = useState(null)
  const [err, setErr] = useState('')
  const [aviso, setAviso] = useState('')
  const [subiendo, setSubiendo] = useState('')
  const refs = useRef({})

  const rango = useMemo(() => {
    const hasta = new Date()
    const desde = new Date(); desde.setDate(desde.getDate() - 6)
    return { desde: isoLocal(desde), hasta: isoLocal(hasta) }
  }, [])

  const cargar = useCallback(async () => {
    setErr('')
    try {
      const r = await getMetricsReports(center)
      setReports(lista(r.data))
    } catch { setErr(t('metrics.load.err')); setReports([]) }
    if (noCenter) { setSemana(null); setRutasHoy(null); return }
    // Estos dos son por centro: sin centro elegido no tienen sentido.
    getDailyWeek(center, rango.desde, rango.hasta)
      .then((r) => setSemana(r.data)).catch(() => setSemana(null))
    getRoutePlanAvailable(center)
      .then((r) => setRutasHoy(r.data)).catch(() => setRutasHoy(null))
  }, [center, noCenter, rango.desde, rango.hasta])

  useEffect(() => { setReports(null); cargar() }, [cargar])

  const subir = async (tipo, e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setSubiendo(tipo.id); setErr(''); setAviso('')
    try {
      const r = tipo.porCentro ? await tipo.fn(f, center) : await tipo.fn(f)
      const d = r.data || {}
      setAviso(
        d.routes != null ? t('met.ok.routeplan').replace('{r}', d.routes).replace('{s}', d.stops ?? 0)
        : d.conductores != null ? t('met.ok.daily').replace('{n}', d.conductores).replace('{d}', d.date || '')
        : t('met.ok.report'),
      )
      await cargar()
    } catch (e2) {
      setErr(e2?.response?.data?.detail || t('met.err.upload'))
    } finally { setSubiendo('') }
  }

  const tot = semana?.totals || {}
  const ranking = lista(semana?.ranking).slice(0, 8)
  const motivosPod = lista(semana?.pod_reasons).slice(0, 5)
  const nRutas = Object.keys(rutasHoy?.routes || {}).length

  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <BarChart3 size={20} /> {t('metrics.title')}
        {reports && <span className="text-dark-500">· {reports.length}</span>}
      </h1>

      {/* Subidas: lo que faltaba para que esta pantalla sirviera de algo */}
      <div className="grid gap-3 sm:grid-cols-3">
        {SUBIDAS.map((s) => {
          const Icono = s.icono
          const bloqueado = s.porCentro && noCenter
          return (
            <div key={s.id} className="card flex flex-col gap-2 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-dark-100">
                <Icono size={16} className="text-brand-400" /> {t(s.k)}
              </div>
              <p className="flex-1 text-[11.5px] leading-relaxed text-dark-500">{t(`${s.k}.desc`)}</p>
              <input
                ref={(el) => { refs.current[s.id] = el }}
                type="file" accept={s.acepta} className="hidden"
                onChange={(e) => subir(s, e)}
              />
              <button
                onClick={() => refs.current[s.id]?.click()}
                disabled={!!subiendo || bloqueado}
                title={bloqueado ? t('met.pick.center') : undefined}
                className="btn-ghost flex items-center justify-center gap-2 text-xs disabled:opacity-40"
              >
                {subiendo === s.id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {t('met.upload')}
              </button>
            </div>
          )
        })}
      </div>

      {err && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}
      {aviso && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{aviso}</p>}

      {nRutas > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-dark-400">
          <MapPin size={13} className="text-emerald-400" />
          {t('met.routes.today').replace('{n}', nRutas)}
        </p>
      )}

      {/* Acumulado de la semana: sale de los daily subidos */}
      {semana && semana.dias?.length > 0 && (
        <div className="card flex flex-col gap-4 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-dark-100">
            <TrendingDown size={16} /> {t('met.week.title').replace('{n}', semana.dias.length)}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cifra n={tot.rts || 0} etiqueta="RTS" alerta />
            <Cifra n={tot.dnr || 0} etiqueta="DNR" alerta />
            <Cifra n={tot.pod || 0} etiqueta="POD" alerta />
            <Cifra n={tot.cc || 0} etiqueta="CC" alerta />
          </div>

          {ranking.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-dark-500">
                {t('met.week.worst')}
              </h3>
              <div className="divide-y divide-dark-800">
                {ranking.map((d) => (
                  <div key={d.transporter_id} className="flex items-center gap-3 py-1.5 text-sm">
                    <span className="flex-1 truncate text-dark-200">{d.name || d.transporter_id}</span>
                    <span className="font-mono text-[11px] text-dark-500">
                      RTS {d.rts} · DNR {d.dnr} · POD {d.pod} · CC {d.cc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {motivosPod.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-dark-500">
                {t('met.week.pod')}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {motivosPod.map(([motivo, n]) => (
                  <span key={motivo} className="rounded-full border border-dark-700 bg-dark-800/60 px-2.5 py-1 text-[11px] text-dark-300">
                    {motivo} <span className="font-bold text-dark-100">{n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Informes ya subidos */}
      {!reports ? (
        <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> {t('ui.loading')}</div>
      ) : reports.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <AlertCircle size={24} className="text-dark-600" />
          <p className="text-dark-300">{t('metrics.no.reports')}</p>
          <p className="text-xs text-dark-600">{t('met.empty.hint')}</p>
        </div>
      ) : (
        <div className="card divide-y divide-dark-800">
          {reports.map((r, i) => (
            <div key={r.id || i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <FileText size={14} className="text-dark-500" />
                {r.name || r.tipo || r.type || t('metrics.report')}
              </span>
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
