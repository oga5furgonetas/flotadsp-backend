import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT, LANG_LOCALE } from '../../i18n'
import { lista } from '../../lib/lista'
import {
  Loader2, Search, X, FileText, Image as ImageIcon, ShieldQuestion, User, ChevronDown,
  ShieldCheck, FileSignature, ShieldAlert, RefreshCw, Wrench, Check, Euro, Undo2,
  ClipboardList, ChevronRight,
} from 'lucide-react'
import { getInspections, getInspection, getCoberturaInspecciones, getVehicles, getDrivers, getVehicleInspections, fetchAuthedBlob, getForensicStatus, signInspectionAdmin, recheckFraud, getSuggestedWorkshops, updateDamage } from '../api'

const SEV_CLS = {
  leve: 'bg-amber-500/20 text-amber-300', moderado: 'bg-orange-500/20 text-orange-300',
  grave: 'bg-red-500/20 text-red-300', critico: 'bg-red-600/30 text-red-200',
  sin_danos: 'bg-emerald-500/20 text-emerald-300', sin_analisis: 'bg-dark-700 text-dark-300',
}
const SEV_DOT = { leve: 'bg-amber-400', moderado: 'bg-orange-400', grave: 'bg-red-400', critico: 'bg-red-500', sin_danos: 'bg-emerald-400', sin_analisis: 'bg-dark-500' }
const FILTERS = ['Todas', 'grave', 'critico', 'moderado', 'leve', 'sin_danos']

const eur = (n) => (n ? `${Number(n).toLocaleString('es')} €` : '—')

export default function Inspecciones() {
  const { center } = useOutletContext()
  const { t, lang } = useT()

  const fmt = (s) => { const d = new Date(s); return isNaN(d) ? (s || '') : d.toLocaleString(LANG_LOCALE[lang], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) }
  const fmtDay = (s) => { const d = new Date(s); return isNaN(d) ? (s || '') : d.toLocaleDateString(LANG_LOCALE[lang], { day: '2-digit', month: 'short', year: 'numeric' }) }

  const sevLabel = (k) => t(`sev.${k}`) || k

  const [insps, setInsps] = useState(null)
  const [vmap, setVmap] = useState({})
  const [dmap, setDmap] = useState({})
  const [err, setErr] = useState('')
  const [sev, setSev] = useState('Todas')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [cobertura, setCobertura] = useState(null)
  const [verSinMirar, setVerSinMirar] = useState(false)

  /* El centro va en la PETICIÓN, no solo en el filtro de después.

     Antes se pedían las 100 más recientes de toda la empresa y se descartaban
     en el navegador las de otros centros. Con 3.405 inspecciones eso significa
     que esas 100 cubrían dos días: quien mira DGA2 —que tiene 14 inspecciones,
     ninguna reciente— veía SIEMPRE la lista vacía, y por pantalla no hay
     diferencia entre "no hay ninguna" y "las tuyas no entran en la ventana".

     Y depende de `center`: sin eso, cambiar de centro arriba no volvía a
     pedir nada y se seguía filtrando sobre los mismos 100 de antes. */
  useEffect(() => {
    setErr(''); setInsps(null); setSel(null)
    Promise.all([getInspections({ limit: 200, campos: 'lista', ...(center && center !== 'Todos' ? { center } : {}) }), getVehicles('Todos'), getDrivers('Todos').catch(() => ({ data: [] }))])
      .then(([ri, rv, rd]) => {
        const m = {}; (lista(rv.data)).forEach((v) => { m[v.id] = { plate: v.license_plate, center: v.center || '' } })
        const dm = {}; (lista(rd.data)).forEach((d) => { dm[d.id] = d.name })
        setVmap(m); setDmap(dm); setInsps(lista(ri.data))
      })
      .catch(() => setErr('No se pudieron cargar las inspecciones.'))
    /* Falla en silencio: es informacion de apoyo y la lista de inspecciones
       tiene que seguir funcionando aunque esto no responda. */
    getCoberturaInspecciones(center).then((r) => setCobertura(r.data)).catch(() => {})
  }, [center])

  /* Tras mandar un daño al taller o cerrarlo, recarga SOLO esa inspección:
     el panel abierto y la lista tienen que enseñar el estado nuevo, o parece
     que no se ha guardado nada. */
  const recargarInspeccion = async () => {
    if (!sel) return
    try {
      const r = await getInspections({ limit: 200, campos: 'lista', ...(center && center !== 'Todos' ? { center } : {}) })
      const todas = lista(r.data)
      setInsps(todas)
      const fresca = todas.find((i) => i.id === sel.id)
      if (fresca) setSel(fresca)
    } catch { /* si falla la recarga, el guardado ya se hizo */ }
  }

  const list = useMemo(() => {
    if (!insps) return []
    return insps.filter((i) => {
      const v = vmap[i.vehicle_id] || {}
      if (center !== 'Todos' && !(v.center || '').toUpperCase().includes(center.toUpperCase())) return false
      const s = i.analysis?.severity || 'sin_analisis'
      if (sev !== 'Todas' && s !== sev) return false
      if (q && !(v.plate || '').toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [insps, vmap, center, sev, q])

  async function openForensicPdf(id) {
    try { const url = await fetchAuthedBlob(`/inspections/${id}/forensic-pdf`); window.open(url, '_blank') }
    catch (e) { setErr(e?.response?.data?.detail || 'No se pudo generar el peritaje (debe estar firmado).') }
  }

  if (err) return <p className="text-red-400">{err}</p>
  if (!insps) return <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> {t('ui.loading')}</div>

  return (
    <div>
      <header className="rise mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[clamp(28px,3.4vw,42px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">
          {t('insp.title')} <span className="text-dark-600">· {list.length}</span>
        </h1>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            className="w-64 rounded-xl border border-white/[0.07] bg-white/[0.02] py-2.5 pl-10 pr-3 text-[13.5px] text-dark-50 placeholder:text-dark-600 transition-all duration-300 hover:border-white/[0.12] focus:border-brand-500/50 focus:bg-white/[0.045] focus:outline-none focus:ring-[3px] focus:ring-brand-500/15"
            placeholder={`${t('ui.search')} ${t('veh.plate')}…`} value={q} onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </header>

      {/* ── LO QUE FALTA, NO LO QUE SE HIZO ────────────────────────────────
          Esta pantalla es una lista de inspecciones hechas, así que una
          furgoneta que lleva un mes sin que nadie la abra no sale en ninguna
          parte: no hay fila que enseñar. Medido el 28-08-2026 sobre 113
          activas, 35 llevaban más de una semana sin mirarse y 20 no se habían
          inspeccionado NUNCA. La lista de lo hecho no puede contestar eso, y
          por eso hace falta darle la vuelta. */}
      {cobertura?.total > 0 && (
        <div className="mb-4 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <button onClick={() => setVerSinMirar((v) => !v)}
            className="flex w-full flex-wrap items-center gap-2.5 px-4 py-3 text-left hover:bg-white/[0.03]">
            <ClipboardList size={16} className={cobertura.descuidadas ? 'text-amber-400' : 'text-dark-500'} />
            <h2 className="text-[14.5px] font-bold text-dark-100">Sin mirar</h2>
            {/* TITULA CON LO QUE NO DEPENDE DE LA HORA. Las inspecciones se
                hacen entre las 16 y las 19 (medido: pico de 681 a las 18 h), así
                que a las nueve de la mañana «113 sin inspeccionar hoy» es cierto
                y no sirve para nada — y un número que grita todas las mañanas
                deja de mirarse a la semana. Lo que sí es un problema a cualquier
                hora son las que llevan más de una semana. */}
            <span className="text-[13px] text-dark-400">
              {cobertura.descuidadas > 0 ? (
                <>
                  <b className="text-amber-300">{cobertura.descuidadas} llevan más de una semana</b>
                  {!!cobertura.resumen.nunca && ` · ${cobertura.resumen.nunca} sin inspeccionar nunca`}
                </>
              ) : (
                <>todas revisadas esta semana</>
              )}
              <span className="text-dark-600"> · {cobertura.sin_mirar_hoy} pendientes hoy</span>
            </span>
            <ChevronRight size={15}
              className={`ml-auto text-dark-500 transition-transform ${verSinMirar ? 'rotate-90' : ''}`} />
          </button>
          {verSinMirar && (
            <div className="border-t border-white/[0.06]">
              {cobertura.furgonetas
                .filter((f) => f.cajon !== 'hoy' && f.cajon !== 'en_taller')
                .slice(0, 60)
                .map((f) => (
                  <div key={f.vehicle_id}
                    className="flex flex-wrap items-center gap-2 border-b border-white/[0.04] px-4 py-2 last:border-b-0">
                    <span className="font-mono text-[13px] font-semibold text-dark-100">{f.matricula}</span>
                    <span className={`text-[12.5px] font-semibold ${
                      f.cajon === 'nunca' || f.cajon === 'mas_30' ? 'text-amber-300'
                        : f.cajon === '8_30' ? 'text-dark-300' : 'text-dark-400'}`}>
                      {f.cajon === 'nunca' ? 'nunca se ha inspeccionado'
                        : f.dias === 1 ? 'ayer'
                          : `hace ${f.dias} días`}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-dark-500">{f.center}</span>
                    {f.ultima && (
                      <span className="tabular-nums text-[12px] text-dark-600">última: {f.ultima}</span>
                    )}
                  </div>
                ))}
              {/* Las de taller se dicen y no se reclaman: nadie puede
                  inspeccionar una furgoneta que no está en la nave. */}
              {!!cobertura.resumen.en_taller && (
                <p className="px-4 py-2 text-[12px] text-dark-500">
                  {cobertura.resumen.en_taller} en taller, que no se cuentan: no se puede
                  inspeccionar una furgoneta que no está.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setSev(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ${sev === f ? 'bg-brand-500/20 text-brand-200' : 'bg-dark-800 text-dark-400 hover:text-dark-200'}`}>
            {f === 'Todas' ? t('ui.all') : sevLabel(f)}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card p-10 text-center text-dark-400">{t('insp.empty')}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((i) => {
            const v = vmap[i.vehicle_id] || {}
            const s = i.analysis?.severity || 'sin_analisis'
            return (
              <button key={i.id} onClick={() => { setSel(i); getInspection(i.id).then((r) => setSel((s) => (s && s.id === i.id ? r.data : s))).catch(() => {}) }} className="card-hover overflow-hidden text-left">
                <div className="relative h-36 bg-dark-800">
                  {i.photos?.[0] ? <img src={i.photos[0]} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-dark-600"><ImageIcon size={24} /></div>}
                  <span className={`absolute left-2 top-2 rounded px-2 py-0.5 text-[11px] font-bold ${SEV_CLS[s]}`}>{sevLabel(s)}</span>
                  {i.forensic_signed && <span className="absolute right-2 top-2 flex items-center gap-0.5 rounded bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white" title={t('insp.sign.done')}><ShieldCheck size={10} /> {t('insp.signed')}</span>}
                  {typeof i.fraud_score === 'number' && i.fraud_score >= 70 && (
                    <span className={`absolute left-2 bottom-2 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-amber-950 ${i.fraud_score >= 85 ? 'bg-red-600' : 'bg-amber-500'}`} title={`Score ${i.fraud_score}/100`}>
                      <ShieldAlert size={10} /> {i.fraud_score >= 85 ? t('insp.fraud.high') : t('insp.fraud.mid')}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between"><span className="font-bold">{v.plate || '—'}</span><span className="text-xs text-dark-500">{fmt(i.created_at)}</span></div>
                  <div className="mt-1 flex items-center justify-between text-xs text-dark-400"><span>{i.analysis?.total_damages_count || 0} {t('insp.damages')}</span><span>{eur(i.analysis?.total_estimated_cost)}</span></div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {sel && (
        <Detail insp={sel} plate={vmap[sel.vehicle_id]?.plate} dmap={dmap}
          onClose={() => setSel(null)} onPdf={openForensicPdf} fmt={fmt} fmtDay={fmtDay}
          sevLabel={sevLabel} onDamageSaved={recargarInspeccion} />
      )}
    </div>
  )
}

function Detail({ insp, plate, dmap, onClose, onPdf, fmt, fmtDay, sevLabel, onDamageSaved }) {
  const { t } = useT()
  const [pi, setPi] = useState(0)
  const [tab, setTab] = useState('danos') // 'danos' | 'quien'
  const a = insp.analysis || {}
  const damages = a.damages || []

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-dark-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* cabecera */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-dark-800 bg-dark-900/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{plate || t('insp.title')}</span>
            <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${SEV_CLS[a.severity] || SEV_CLS.sin_analisis}`}>{sevLabel(a.severity) || a.severity || '—'}</span>
          </div>
          <button onClick={onClose} className="btn-ghost p-2"><X size={18} /></button>
        </div>

        <div className="p-5">
          {/* foto + cajas */}
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
                <button key={k} onClick={() => setPi(k)} className={`h-12 w-14 shrink-0 overflow-hidden rounded border-2 ${k === pi ? 'border-brand-400' : 'border-transparent opacity-70'}`}><img src={p} alt="" className="h-full w-full object-cover" /></button>
              ))}
            </div>
          )}

          {/* resumen compacto (chips, no parrafo) */}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-dark-800 px-2.5 py-1">{a.total_damages_count || 0} {t('insp.damages')}</span>
            <span className="rounded-full bg-dark-800 px-2.5 py-1 font-semibold text-dark-200">{eur(a.total_estimated_cost)}</span>
            <span className="rounded-full bg-dark-800 px-2.5 py-1">{fmt(insp.created_at)}</span>
            {insp.driver_id && dmap[insp.driver_id] && <span className="flex items-center gap-1 rounded-full bg-dark-800 px-2.5 py-1"><User size={11} /> {dmap[insp.driver_id]}</span>}
          </div>

          {/* pestañas */}
          <div className="mt-4 flex gap-1 border-b border-dark-800">
            <button onClick={() => setTab('danos')} className={`px-3 py-2 text-sm font-medium ${tab === 'danos' ? 'border-b-2 border-brand-400 text-brand-300' : 'text-dark-400'}`}>{t('insp.tab.damages')}</button>
            <button onClick={() => setTab('quien')} className={`flex items-center gap-1 px-3 py-2 text-sm font-medium ${tab === 'quien' ? 'border-b-2 border-brand-400 text-brand-300' : 'text-dark-400'}`}><ShieldQuestion size={14} /> {t('insp.tab.who')}</button>
          </div>

          {tab === 'danos' ? (
            <div className="mt-3 space-y-2">
              {damages.length === 0 ? <div className="card p-4 text-center text-sm text-dark-500">{t('insp.no.damage')}</div> :
                damages.map((d, k) => (
                  <DamageRow key={k} d={d} inspId={insp.id} idx={k} onSaved={onDamageSaved} />
                ))}
              {a.executive_summary && (
                <details className="mt-2 text-sm text-dark-400">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-dark-500">{t('insp.summary')}</summary>
                  <p className="mt-2 leading-relaxed">{a.executive_summary}</p>
                </details>
              )}
            </div>
          ) : (
            <QuienTimeline vehicleId={insp.vehicle_id} dmap={dmap} currentId={insp.id} fmtDay={fmtDay} />
          )}

          <FraudBlock insp={insp} />
          <ForensicSignBlock inspId={insp.id} onPdf={onPdf} fmt={fmt} />
        </div>
      </div>
    </div>
  )
}

function FraudBlock({ insp }) {
  const { t } = useT()
  const [score, setScore] = useState(typeof insp.fraud_score === 'number' ? insp.fraud_score : null)
  const [reasons, setReasons] = useState(insp.fraud_reasons || [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function recheck() {
    setBusy(true); setErr('')
    try {
      const r = await recheckFraud(insp.id)
      setScore(r.data?.score ?? 0)
      setReasons(r.data?.reasons || [])
    } catch (e) { setErr(e?.response?.data?.detail || 'No se pudo recalcular.') }
    setBusy(false)
  }

  if (score === null) {
    return (
      <div className="mt-4 rounded-lg border border-dark-800 bg-dark-800/30 p-3 text-sm">
        <div className="mb-1.5 flex items-center gap-2 text-dark-300"><ShieldAlert size={14} /> {t('insp.fraud.not.run')}</div>
        <button onClick={recheck} disabled={busy} className="btn-secondary flex items-center gap-1.5 text-xs disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {t('insp.fraud.check')}
        </button>
        {err && <p className="mt-1 text-xs text-red-400">{err}</p>}
      </div>
    )
  }

  const level = score >= 85 ? 'high' : score >= 70 ? 'mid' : 'low'
  const cls = level === 'high' ? 'border-red-500/40 bg-red-500/10 text-red-200'
            : level === 'mid' ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
            : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200'
  const Icon = level === 'low' ? ShieldCheck : ShieldAlert
  const title = level === 'high' ? t('insp.fraud.high') : level === 'mid' ? t('insp.fraud.mid') : t('insp.fraud.none')

  return (
    <div className={`mt-4 rounded-lg border p-3 text-sm ${cls}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold"><Icon size={15} /> {title} <span className="text-xs opacity-70">({score}/100)</span></span>
        <button onClick={recheck} disabled={busy} className="btn-ghost p-1 text-xs disabled:opacity-50" title={t('insp.fraud.recheck')}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </button>
      </div>
      {reasons.length > 0 ? (
        <ul className="ml-1 space-y-1 text-xs">
          {reasons.map((r, i) => (
            <li key={i}>• <b>{r.type === 'plate_mismatch' ? t('insp.fraud.plate') : r.type === 'old_photo' ? t('insp.fraud.old.photo') : r.type === 'reused_photo' ? t('insp.fraud.reused') : r.type}:</b> {r.detail}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs opacity-80">EXIF correcto · pHash único · matrícula coincide.</p>
      )}
      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
    </div>
  )
}

function ForensicSignBlock({ inspId, onPdf, fmt }) {
  const { t } = useT()
  const [status, setStatus] = useState(null)
  const [signing, setSigning] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    getForensicStatus(inspId).then((r) => setStatus(r.data)).catch(() => setStatus({ signed: false }))
  }, [inspId])

  async function sign() {
    setSigning(true); setErr('')
    try {
      const r = await signInspectionAdmin(inspId, 'Firmado por administrador desde panel FlotaDSP.')
      setStatus({ signed: true, hash: r.data.hash, signed_by_name: r.data.signed_by_name, signed_at: r.data.signed_at })
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo firmar.')
    }
    setSigning(false)
  }

  if (!status) {
    return <div className="mt-5 flex items-center gap-2 text-sm text-dark-500"><Loader2 size={14} className="animate-spin" /> {t('insp.sign.checking')}</div>
  }

  if (!status.signed) {
    return (
      <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
          <FileSignature size={16} /> {t('insp.sign.unsigned')}
        </div>
        <p className="mb-3 text-xs text-dark-400">Para generar el peritaje técnico con cadena de custodia hash, esta inspección debe estar firmada. Si el conductor no firmó, puedes firmarla tú como administrador.</p>
        {err && <p className="mb-2 text-xs text-red-400">{err}</p>}
        <button onClick={sign} disabled={signing} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {signing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          {signing ? t('insp.sign.signing') : t('insp.sign.now')}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
        <div className="mb-1 flex items-center gap-2 font-semibold text-emerald-300">
          <ShieldCheck size={15} /> {t('insp.sign.done')}
        </div>
        <div className="text-xs text-dark-400">
          Por <b className="text-dark-200">{status.signed_by_name || '—'}</b> · {fmt(status.signed_at)}
        </div>
        {status.hash && <code className="mt-1 block break-all text-[10px] text-emerald-400">{status.hash}</code>}
      </div>
      <button onClick={() => onPdf(inspId)} className="btn-primary flex w-full items-center justify-center gap-2 py-2.5">
        <FileText size={16} /> {t('insp.pdf.download')}
      </button>
    </div>
  )
}

/* Un daño detectado no vale de nada si ahí se acaba. Esta fila cierra el
   bucle: mandarlo al taller, apuntar lo que ha costado DE VERDAD y darlo por
   reparado. El backend ya lo soportaba; no había forma de llamarlo. */
function DamageRow({ d, inspId, idx, onSaved }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState(false)
  const [talleres, setTalleres] = useState(null)
  const [coste, setCoste] = useState(d.actual_cost != null ? String(d.actual_cost) : '')
  const [guardando, setGuardando] = useState('')
  const [err, setErr] = useState('')

  const estado = d.repair_status || (d.workshop_id ? 'assigned' : 'pending')
  const reparado = estado === 'done'

  const abrirPanel = async () => {
    const abriendo = !panel
    setPanel(abriendo)
    if (!abriendo || talleres) return
    try {
      const r = await getSuggestedWorkshops(inspId, idx)
      setTalleres(lista(r.data?.workshops))
    } catch {
      setTalleres([])
      setErr(t('dmg.workshops.err'))
    }
  }

  const guardar = async (cambios, marca) => {
    setGuardando(marca); setErr('')
    try {
      await updateDamage(inspId, idx, cambios)
      onSaved?.()
    } catch (e) {
      setErr(e?.response?.data?.detail || t('dmg.save.err'))
    } finally { setGuardando('') }
  }

  return (
    <div className={`rounded-lg border p-2.5 ${reparado ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-dark-800 bg-dark-800/40'}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${SEV_DOT[d.severity] || SEV_DOT.sin_analisis}`} />
        <span className="flex-1 truncate text-sm font-medium">{d.part || 'Daño'}</span>
        {reparado
          ? <span className="flex items-center gap-1 text-sm font-semibold text-emerald-300"><Check size={13} /> {eur(d.actual_cost)}</span>
          : <span className="text-sm text-dark-300">{eur(d.estimated_cost)}</span>}
        <button onClick={abrirPanel} title={t('dmg.manage')}
          className={`rounded-md p-1 ${panel ? 'bg-dark-700 text-dark-200' : 'text-dark-200 hover:text-dark-300'}`}>
          <Wrench size={14} />
        </button>
        {d.description && (
          <button onClick={() => setOpen((o) => !o)} className="text-dark-500">
            <ChevronDown size={15} className={open ? 'rotate-180 transition' : 'transition'} />
          </button>
        )}
      </div>

      {open && d.description && <p className="mt-2 pl-4 text-xs leading-relaxed text-dark-400">{d.description}</p>}

      {!panel && estado !== 'pending' && (
        <p className="mt-1.5 pl-4 text-[11px] text-dark-500">
          {reparado ? t('dmg.st.done') : t('dmg.st.assigned')}
        </p>
      )}

      {panel && (
        <div className="mt-2.5 flex flex-col gap-2.5 border-t border-dark-700/60 pt-2.5">
          {err && <p className="text-xs text-red-300">{err}</p>}

          {!reparado && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-dark-500">{t('dmg.step.workshop')}</p>
              {talleres === null ? (
                <span className="flex items-center gap-1.5 text-xs text-dark-400"><Loader2 size={12} className="animate-spin" /> {t('ui.loading')}</span>
              ) : talleres.length === 0 ? (
                <p className="text-xs text-dark-500">{t('dmg.no.workshops')}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {talleres.slice(0, 6).map((w) => (
                    <button key={w.id} disabled={!!guardando}
                      onClick={() => guardar({ workshop_id: w.id }, 'taller')}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50 ${
                        d.workshop_id === w.id
                          ? 'border-brand-500/50 bg-brand-500/15 text-brand-300'
                          : 'border-dark-700 text-dark-300 hover:border-dark-600'}`}>
                      {w.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">{t('dmg.step.cost')}</span>
              <span className="flex items-center gap-1">
                <input type="text" inputMode="decimal" value={coste} placeholder={String(d.estimated_cost ?? '')}
                  onChange={(e) => setCoste(e.target.value)}
                  className="w-24 rounded-lg border border-dark-700 bg-dark-900 px-2 py-1 text-sm text-dark-100" />
                <Euro size={13} className="text-dark-500" />
              </span>
            </label>
            <button disabled={!!guardando || coste === ''}
              onClick={() => guardar({ actual_cost: coste, repair_status: 'done' }, 'cerrar')}
              className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40">
              {guardando === 'cerrar' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {t('dmg.close')}
            </button>
            {reparado && (
              <button disabled={!!guardando}
                onClick={() => guardar({ repair_status: 'assigned' }, 'reabrir')}
                className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs">
                <Undo2 size={13} /> {t('dmg.reopen')}
              </button>
            )}
          </div>
          <p className="text-[11px] text-dark-600">{t('dmg.hint')}</p>
        </div>
      )}
    </div>
  )
}

function QuienTimeline({ vehicleId, dmap, currentId, fmtDay }) {
  const { t } = useT()
  const [insps, setInsps] = useState(null)
  useEffect(() => {
    getVehicleInspections(vehicleId).then((r) => setInsps((lista(r.data)).filter((i) => i.analysis))).catch(() => setInsps([]))
  }, [vehicleId])

  if (!insps) return <div className="mt-3 flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> {t('insp.history.loading')}</div>
  if (insps.length === 0) return <div className="mt-3 card p-4 text-center text-sm text-dark-500">{t('insp.history.empty')}</div>

  return (
    <div className="mt-3">
      <p className="mb-3 text-xs text-dark-500">Cada vez que apareció un <b className="text-dark-300">{t('insp.new.damage')}</b>, el responsable es el conductor que tenía la furgoneta ese día.</p>
      <div className="space-y-3">
        {insps.map((i) => {
          const nuevos = i.analysis?.new_damages || []
          const driver = dmap[i.driver_id] || t('ui.no.driver')
          const isCur = i.id === currentId
          return (
            <div key={i.id} className={`relative rounded-lg border p-3 ${nuevos.length ? 'border-red-500/40 bg-red-500/5' : 'border-dark-800 bg-dark-800/30'} ${isCur ? 'ring-1 ring-brand-500/50' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{fmtDay(i.created_at)}</span>
                <span className="flex items-center gap-1 text-xs text-dark-300"><User size={12} /> {driver}</span>
              </div>
              {nuevos.length > 0 ? (
                <div className="mt-2">
                  <div className="mb-1 text-[11px] font-bold uppercase text-red-300">⚠ {nuevos.length} {t('insp.new.damage.responsible')} {driver}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {nuevos.map((d, k) => <span key={k} className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-200">{d.part || 'daño'}</span>)}
                  </div>
                </div>
              ) : (
                <div className="mt-1 text-xs text-dark-500">{t('insp.no.new.damage')}</div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-dark-600">¿Un golpe no salió como "nuevo"? Márcalo en <b>Revisión rápida → "daño que la IA no vio"</b>: queda registrado y la IA aprende para detectarlo la próxima vez.</p>
    </div>
  )
}
