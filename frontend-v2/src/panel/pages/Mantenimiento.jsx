/* ─────────────────────────────────────────────────────────────────────────────
   PRÓXIMOS CAMBIOS — el mantenimiento de la flota como cola de trabajo
   ---------------------------------------------------------------------------
   LO QUE YA EXISTÍA Y NO SE DUPLICA
   El backend lleva tiempo calculando bien esto: `_build_maint_item` sabe cuántos
   km faltan para cada cambio y `_km_por_dia` mide el ritmo real del vehículo con
   su histórico de cuentakilómetros. Lo que faltaba no era cálculo, era la vista
   de FLOTA: con 81 furgonetas nadie entra ficha por ficha, y por eso los cambios
   se hacen tarde. /alerts/maintenance existía desde hace meses sin que ninguna
   pantalla lo llamara.

   TRES REGLAS PARA QUE NO MIENTA
   1 · Solo aparece lo que el backend marca vencido o en aviso. Esta pantalla no
       inventa su propio umbral.
   2 · SIN RITMO MEDIDO NO HAY FECHA. Si no hay dos apuntes de cuentakilómetros
       separados una semana, se dice cuántos km faltan y la fila se va a su
       propio bloque. Poner un día a ojo sería inventarlo.
   3 · El km de la ficha puede llevar semanas parado, y entonces la furgoneta ya
       ha rodado más de lo que dice la cuenta. Cada fila lleva de cuándo es el
       apunte, y si está rancio se avisa en la propia fila.
   ───────────────────────────────────────────────────────────────────────────── */
import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Droplets, CircleDot, Disc, Loader2, Check, Wrench, AlertTriangle } from 'lucide-react'
import { useT, LANG_LOCALE } from '../../i18n'
import { useToast } from '../../lib/toast'
import { getMaintenanceAlerts, registerOilChange, registerMaintenanceChange } from '../api'
import { PageSkeleton } from '../components/Skeleton'

const TIPOS = {
  oil:       { Icon: Droplets,  labelKey: 'mant.oil' },
  ruedas:    { Icon: CircleDot, labelKey: 'mant.tyres' },
  pastillas: { Icon: Disc,      labelKey: 'mant.pads' },
}
const ORDEN = ['oil', 'ruedas', 'pastillas']
// Por encima de esto el apunte de km es viejo y la cuenta atrás va adelantada.
const KM_RANCIO_DIAS = 21
const DIA = 86400000

const nkm = (n) => Math.round(Math.abs(n)).toLocaleString('es-ES')

export default function Mantenimiento() {
  // Va montada como pestaña de Vencimientos, no como ruta propia: el contexto
  // del Outlet llega igual por React context, pero se lee a la defensiva.
  const { center } = useOutletContext() || {}
  const { t, lang } = useT()
  const toast = useToast()
  const [alerts, setAlerts] = useState(null)
  const [err, setErr] = useState('')
  const [vista, setVista] = useState('trabajo')   // 'trabajo' | 'urgencia'
  const [abierto, setAbierto] = useState(null)    // fila con el registro desplegado
  const [km, setKm] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = () => {
    setAlerts(null); setErr('')
    getMaintenanceAlerts()
      .then((r) => setAlerts(Array.isArray(r.data) ? r.data : []))
      .catch(() => setErr(t('mant.err')))
  }
  useEffect(cargar, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const hoyMs = Date.now()

  const filas = useMemo(() => {
    // El centro viene sucio en la BD ('OGA5', 'oga5 ', 'AMZL OGA5 …'): se
    // compara por contención del código, nunca por igualdad.
    const c = (center || '').trim().toUpperCase()
    return (alerts || [])
      .filter((a) => !c || c === 'TODOS' || (a.center || '').toUpperCase().includes(c.slice(0, 4)))
      .map((a) => {
        const apunte = a.mileage_last_at ? Date.parse(`${a.mileage_last_at}T12:00:00Z`) : null
        const diasApunte = apunte ? Math.round((hoyMs - apunte) / DIA) : null
        return {
          ...a,
          id: `${a.vehicle_id}-${a.kind}`,
          dias: typeof a.days_left_estimate === 'number' ? a.days_left_estimate : null,
          diasApunte,
          rancio: diasApunte != null && diasApunte > KM_RANCIO_DIAS,
          // Cuánto queda del intervalo completo: permite comparar de un vistazo
          // un aceite (15.000 km) con unas ruedas (40.000 km).
          vida: a.interval_km > 0
            ? Math.max(0, Math.min(1, a.km_until_change / a.interval_km))
            : 0,
        }
      })
  }, [alerts, center, hoyMs])

  const conFecha = filas.filter((f) => f.dias !== null)
  const sinFecha = filas.filter((f) => f.dias === null)
  const pasados = filas.filter((f) => f.overdue)
  const semana = conFecha.filter((f) => !f.overdue && f.dias <= 7)
  const resto = conFecha.filter((f) => !f.overdue && f.dias > 7)

  const porTrabajo = ORDEN
    .map((k) => ({ kind: k, filas: conFecha.filter((f) => f.kind === k) }))
    .filter((g) => g.filas.length)

  async function registrar(f) {
    const n = Number(km)
    if (!(n > 0)) return toast.error(t('mant.km.req'))
    setGuardando(true)
    try {
      // El aceite tiene su propia ruta histórica; ruedas y pastillas van por la
      // genérica. Se respeta el intervalo que ya tenía configurado la furgoneta.
      if (f.kind === 'oil') await registerOilChange(f.vehicle_id, { km: n })
      else await registerMaintenanceChange(f.vehicle_id, f.kind, { km: n })
      toast.success(`${f.license_plate} · ${t(TIPOS[f.kind].labelKey)} ✓`)
      setAbierto(null); setKm('')
      cargar()
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('mant.err.save'))
    } finally { setGuardando(false) }
  }

  if (err) return <p className="text-red-400">{err}</p>

  return (
    <div>
      <header className="rise mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2">
          <Cifra n={pasados.length} txt={t('mant.overdue')} tono={pasados.length ? 'text-red-300' : 'text-dark-600'} grande />
          <Cifra n={semana.length} txt={t('mant.week')} tono={semana.length ? 'text-amber-300' : 'text-dark-600'} />
          <Cifra n={resto.length} txt={t('mant.soon')} tono="text-dark-200" />
          <Cifra n={sinFecha.length} txt={t('mant.nodate')} tono={sinFecha.length ? 'text-amber-300/80' : 'text-dark-600'} />
        </div>
        <div className="flex gap-1 rounded-lg bg-dark-900 p-1 ring-1 ring-dark-700">
          {[['trabajo', t('mant.by.job')], ['urgencia', t('mant.by.urgency')]].map(([id, label]) => (
            <button key={id} onClick={() => setVista(id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                vista === id ? 'bg-brand-500/20 text-brand-300' : 'text-dark-400 hover:text-dark-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {!alerts ? <PageSkeleton kpis={0} rows={8} /> : filas.length === 0 ? (
        <div className="card p-10 text-center">
          <Check size={26} className="mx-auto mb-3 text-emerald-400/60" />
          <p className="text-sm text-dark-300">{t('mant.empty')}</p>
        </div>
      ) : (
        <>
          {vista === 'trabajo' ? porTrabajo.map((g) => {
            const { Icon, labelKey } = TIPOS[g.kind]
            return (
              <section key={g.kind} className="card rise mb-3 px-1 py-3">
                <div className="mb-1 flex items-center gap-2.5 px-4">
                  <Icon size={13} className="text-brand-400" />
                  <span className="text-[13.5px] font-semibold text-dark-100">{t(labelKey)}</span>
                  <span className="text-[11.5px] text-dark-500">
                    {g.filas.length === 1 ? t('mant.one.van') : `${g.filas.length} · ${t('mant.one.trip')}`}
                  </span>
                </div>
                {g.filas.map((f) => (
                  <Fila key={f.id} f={f} t={t} lang={lang} abierto={abierto} setAbierto={setAbierto}
                    km={km} setKm={setKm} guardando={guardando} registrar={registrar} />
                ))}
              </section>
            )
          }) : (
            <section className="card rise mb-3 px-1 py-2">
              {conFecha.map((f) => (
                <Fila key={f.id} f={f} t={t} lang={lang} conTipo abierto={abierto} setAbierto={setAbierto}
                  km={km} setKm={setKm} guardando={guardando} registrar={registrar} />
              ))}
            </section>
          )}

          {/* ── Sin ritmo medible: km sí, fecha no ── */}
          {sinFecha.length > 0 && (
            <section className="card rise mb-3 px-1 py-3">
              <div className="px-4">
                <div className="flex items-center gap-2 text-[13.5px] font-semibold text-amber-300">
                  <AlertTriangle size={13} /> {t('mant.nodate')}
                </div>
                <p className="mt-1.5 max-w-[560px] text-[12px] leading-relaxed text-dark-500">
                  {t('mant.nodate.why')}
                </p>
              </div>
              <div className="mt-2">
                {sinFecha.map((f) => (
                  <Fila key={f.id} f={f} t={t} lang={lang} conTipo abierto={abierto} setAbierto={setAbierto}
                    km={km} setKm={setKm} guardando={guardando} registrar={registrar} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <p className="mt-5 max-w-[640px] text-[11.5px] leading-relaxed text-dark-600">{t('mant.foot')}</p>
    </div>
  )
}

function Cifra({ n, txt, tono, grande }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={`font-semibold tabular-nums ${grande ? 'text-[30px]' : 'text-[19px]'} ${tono}`}>{n}</span>
      <span className="text-[12.5px] text-dark-500">{txt}</span>
    </div>
  )
}

function Fila({ f, t, lang, conTipo, abierto, setAbierto, km, setKm, guardando, registrar }) {
  const { Icon, labelKey } = TIPOS[f.kind] || TIPOS.oil
  const abierta = abierto === f.id
  const tono = f.overdue ? 'text-red-300' : f.dias != null && f.dias <= 7 ? 'text-amber-300' : 'text-dark-200'
  const barra = f.overdue ? 'bg-red-400/70' : f.dias != null && f.dias <= 7 ? 'bg-amber-400/70' : 'bg-emerald-400/60'
  const apunte = f.mileage_last_at
    ? new Date(`${f.mileage_last_at}T12:00:00Z`).toLocaleDateString(LANG_LOCALE[lang] || 'es-ES')
    : null

  return (
    <div className={`rounded-xl px-4 py-2.5 transition ${abierta ? 'bg-white/[0.04]' : 'hover:bg-white/[0.025]'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-[86px] font-mono text-[13px] font-semibold text-dark-100">{f.license_plate}</span>
        {conTipo && (
          <span className="flex items-center gap-1.5 text-[12px] text-dark-400">
            <Icon size={11} className="text-brand-400/70" /> {t(labelKey)}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-dark-600">
          {[f.brand, f.model].filter(Boolean).join(' ')}
          {f.vehicle_status === 'taller' && ` · ${t('veh.workshop')}`}
        </span>

        {/* Los km SIEMPRE. Es el único dato medido de la fila. */}
        <span className={`shrink-0 text-[12.5px] font-semibold tabular-nums ${tono}`}>
          {f.overdue ? `${t('mant.past')} ${nkm(f.km_until_change)} km` : `${nkm(f.km_until_change)} km`}
        </span>
        {/* Los días SOLO si hay ritmo medido */}
        <span className="w-[74px] shrink-0 text-right text-[12px] tabular-nums text-dark-500">
          {f.dias != null ? `≈ ${f.dias} ${t('mant.days')}` : '—'}
        </span>

        <button
          onClick={() => { setAbierto(abierta ? null : f.id); setKm(String(f.mileage || '')) }}
          className="shrink-0 rounded-lg border border-dark-700 px-2.5 py-1 text-[11px] font-semibold text-dark-400 transition hover:border-brand-500/40 hover:text-brand-400"
        >
          <Wrench size={10} className="mr-1 inline" />{t('mant.done')}
        </button>
      </div>

      <div className="mt-1.5 flex items-center gap-2.5">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div className={`h-full rounded-full ${barra}`} style={{ width: `${Math.round(f.vida * 100)}%` }} />
        </div>
        {apunte && (
          <span className={`shrink-0 text-[10.5px] tabular-nums ${f.rancio ? 'text-amber-400/80' : 'text-dark-600'}`}>
            {t('mant.km.at')} {apunte}{f.rancio ? ` · ${t('mant.km.stale')}` : ''}
          </span>
        )}
      </div>

      {abierta && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-2.5">
          <span className="text-[11.5px] text-dark-500">{t('mant.km.now')}</span>
          <input
            type="number" value={km} onChange={(e) => setKm(e.target.value)}
            className="w-32 rounded-lg border border-dark-700 bg-dark-900 px-2.5 py-1 text-[12.5px] tabular-nums text-dark-100 focus:border-brand-500/50 focus:outline-none"
          />
          <button onClick={() => registrar(f)} disabled={guardando}
            className="btn-primary flex items-center gap-1.5 px-3 py-1 text-[12px] disabled:opacity-60">
            {guardando ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            {t('mant.confirm')}
          </button>
          <span className="text-[11px] text-dark-600">{t('mant.km.hint')}</span>
        </div>
      )}
    </div>
  )
}
