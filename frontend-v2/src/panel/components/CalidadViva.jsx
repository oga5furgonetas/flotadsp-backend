import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../i18n'
import {
  Loader2, Activity, Target, TrendingDown, Users, Info, ChevronDown, ChevronUp,
  CircleAlert, CircleCheck, Wand2,
} from 'lucide-react'
import { cortexCalidad, cortexSimular } from '../api'
import { lista } from '../../lib/lista'
import Emparejar from './Emparejar'

/* ────────────────────────────────────────────────────────────────────────────
   Calidad de entrega EN VIVO, calculada desde Cortex.

   Amazon publica el scorecard el viernes de la semana que cerró el sábado: el
   DSP se entera seis días tarde de algo que ya no puede corregir. Aquí el dato
   entra solo, cada día, y la semana sigue abierta.

   La pieza que de verdad cambia el comportamiento no es el porcentaje: es el
   MARGEN. "DCR 98,7 %" no dice qué hacer. "Te quedan 39 fallos de margen" es
   una cuenta atrás, se entiende sin formación y se vigila cada tarde.

   El margen cuenta los fallos de TODOS los días del rango, cerrados o no: si
   se permite el cupo de una semana entera hay que contar la semana entera. El
   DCR, en cambio, solo usa días cerrados. Son dos preguntas distintas.
   ──────────────────────────────────────────────────────────────────────────── */

const pct = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} %`)
const num = (v) => Number(v || 0).toLocaleString('es-ES')

function Barra({ valor, objetivo }) {
  // La barra arranca en un suelo visual: la diferencia entre 97 % y 99,5 % es
  // lo único que importa aquí, y con escala 0-100 no se distingue nada.
  const suelo = Math.min(objetivo - 2, valor - 1, 96)
  const norm = (x) => Math.max(0, Math.min(100, ((x - suelo) / (100 - suelo)) * 100))
  const ok = valor >= objetivo
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-dark-800">
      <div className={`h-full rounded-full transition-all ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`}
        style={{ width: `${norm(valor)}%` }} />
      <div className="absolute top-0 h-full w-0.5 bg-dark-100/70"
        style={{ left: `${norm(objetivo)}%` }} title={`Objetivo ${objetivo} %`} />
    </div>
  )
}

/* El número que vende: cuántos fallos más aguanta la semana sin caer de tier. */
function Margen({ m, t }) {
  if (!m) return null
  const quedan = m.margen_restante
  const critico = quedan <= 0
  const justo = !critico && quedan <= Math.max(5, m.fallos_permitidos * 0.15)
  const cls = critico ? 'text-red-300' : justo ? 'text-amber-300' : 'text-emerald-300'
  const usado = Math.min(100, (m.fallos_hasta_ahora / Math.max(m.fallos_permitidos, 1)) * 100)
  return (
    <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-dark-500">
        <Target size={13} /> {t('cal.margen.titulo')}
      </div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${cls}`}>
        {critico ? `−${Math.abs(quedan)}` : quedan}
      </div>
      <p className="text-xs text-dark-400">
        {critico ? t('cal.margen.pasado') : t('cal.margen.restante')}
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-dark-800">
        <div className={`h-full rounded-full ${critico ? 'bg-red-400' : justo ? 'bg-amber-400' : 'bg-emerald-400'}`}
          style={{ width: `${usado}%` }} />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-dark-600">
        {t('cal.margen.explica')
          .replace('{usados}', num(m.fallos_hasta_ahora))
          .replace('{tope}', num(m.fallos_permitidos))
          .replace('{dcr}', m.objetivo_dcr)
          .replace('{prev}', num(m.prevision_paquetes))}
      </p>
    </div>
  )
}

/* Quién se está comiendo el margen. No es el ranking de peores: es el exceso
   sobre lo que haría la media de la flota con SUS paquetes, que es lo único
   imputable de verdad. Al de zona rural con 200 paquetes no se le castiga por
   llevar zona rural. */
function Impacto({ datos, center, t }) {
  const [sel, setSel] = useState([])
  const [sim, setSim] = useState(null)
  const [cargando, setCargando] = useState(false)
  const filas = lista(datos.impacto)

  const alternar = (id) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  useEffect(() => { setSel([]); setSim(null) }, [center, datos.desde])

  const simular = async () => {
    setCargando(true)
    try {
      const r = await cortexSimular({
        desde: datos.desde, hasta: datos.hasta, center,
        conductores: sel.join(','),
      })
      setSim(r.data)
    } catch { setSim(null) } finally { setCargando(false) }
  }

  if (!filas.length) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-2 text-sm text-emerald-300">
          <CircleCheck size={15} /> {t('cal.impacto.nadie')}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-dark-500">
        <TrendingDown size={13} /> {t('cal.impacto.titulo')}
      </div>
      <p className="mb-3 text-[11px] text-dark-600">{t('cal.impacto.explica')}</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-dark-500">
              <th className="w-8 pb-2" />
              <th className="pb-2 text-left font-semibold">{t('cal.col.conductor')}</th>
              <th className="pb-2 text-right font-semibold">{t('cal.col.paquetes')}</th>
              <th className="pb-2 text-right font-semibold">{t('cal.col.dcr')}</th>
              <th className="pb-2 text-right font-semibold">{t('cal.col.exceso')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-800">
            {filas.map((c) => (
              <tr key={c.driver_id} className="hover:bg-dark-800/40">
                <td className="py-2">
                  <input type="checkbox" checked={sel.includes(c.driver_id)}
                    onChange={() => alternar(c.driver_id)}
                    className="h-3.5 w-3.5 accent-brand-500" />
                </td>
                <td className="py-2 pr-3">
                  <div className="font-medium text-dark-100">
                    {c.nombre || <span className="text-dark-500">{c.driver_id}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-dark-600">
                    {c.muestra_corta && (
                      <span className="rounded bg-dark-800 px-1 py-px text-dark-500">
                        {t('cal.muestra.corta')}
                      </span>
                    )}
                    {c.origen_nombre === 'historico' && (
                      <span className="rounded bg-amber-500/10 px-1 py-px text-amber-400/80">
                        {t('cal.sin.ficha')}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 text-right tabular-nums text-dark-400">{num(c.despachados)}</td>
                <td className="py-2 text-right tabular-nums text-dark-300">{pct(c.dcr)}</td>
                <td className="py-2 text-right tabular-nums font-semibold text-amber-300">
                  +{Math.round(c.exceso)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={simular} disabled={cargando}
          className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50">
          {cargando ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
          {sel.length ? t('cal.simular.sel').replace('{n}', sel.length) : t('cal.simular.top')}
        </button>
        {sim && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-dark-400">
              {pct(sim.dcr_actual)} <span className="text-dark-600">→</span>{' '}
              <b className={sim.alcanza_objetivo ? 'text-emerald-300' : 'text-amber-300'}>
                {pct(sim.dcr_simulado)}
              </b>
            </span>
            <span className="text-dark-500">
              {t('cal.simular.recupera').replace('{n}', num(sim.paquetes_recuperables))}
            </span>
            {sim.alcanza_objetivo && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                {t('cal.simular.llega')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CalidadViva({ center }) {
  const { t } = useT()
  const [datos, setDatos] = useState(null)
  const [err, setErr] = useState('')
  const [verDias, setVerDias] = useState(false)

  const cargar = useCallback(() => {
    setDatos(null); setErr('')
    cortexCalidad({ center: center && center !== 'Todos' ? center : '' })
      .then((r) => setDatos(r.data))
      .catch((e) => setErr(e?.response?.data?.detail || t('cal.error')))
  }, [center, t])

  useEffect(() => { cargar() }, [cargar])

  if (err) {
    return (
      <div className="card mb-6 p-4">
        <p className="text-sm text-red-300">{err}</p>
      </div>
    )
  }
  if (!datos) {
    return (
      <div className="card mb-6 flex items-center gap-2 p-4 text-sm text-dark-400">
        <Loader2 size={14} className="animate-spin" /> {t('cal.cargando')}
      </div>
    )
  }

  /* Sin datos de Cortex no se inventa nada: se dice qué falta y cómo se arregla.
     Un scorecard que se muestra al 100 % porque no hay datos es el peor engaño
     posible — el DSP se cree a salvo justo cuando no lo está. */
  if (!datos.hay_datos) {
    return (
      <div className="card mb-6 p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-dark-100">
          <Activity size={16} /> {t('cal.titulo')}
        </div>
        <p className="mt-2 text-sm text-dark-400">{t('cal.vacio')}</p>
      </div>
    )
  }

  const tot = datos.total
  const obj = Number(datos.objetivos?.dcr ?? 99)
  const cumple = tot?.dcr !== null && tot?.dcr >= obj
  const dias = Object.entries(datos.dias || {}).sort(([a], [b]) => a.localeCompare(b))
  const noPuntuan = dias.filter(([, v]) => !v.cerrado)

  return (
    <div className="card mb-6 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-dark-100">
            <Activity size={16} className="text-brand-400" /> {t('cal.titulo')}
            <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-300">
              {t('cal.badge')}
            </span>
          </h2>
          <p className="mt-0.5 text-[11px] text-dark-600">
            {datos.desde} → {datos.hasta} · {t('cal.dias.cerrados')
              .replace('{c}', tot?.dias_cerrados ?? 0).replace('{t}', tot?.dias_totales ?? 0)}
          </p>
        </div>
        <button onClick={cargar} className="text-[11px] text-dark-500 hover:text-dark-300">
          {t('cal.recargar')}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-dark-500">
            {cumple ? <CircleCheck size={13} className="text-emerald-400" />
              : <CircleAlert size={13} className="text-amber-400" />}
            {t('cal.dcr')}
          </div>
          <div className={`mt-1 text-3xl font-bold tabular-nums ${cumple ? 'text-emerald-300' : 'text-amber-300'}`}>
            {pct(tot?.dcr)}
          </div>
          <p className="mb-3 text-xs text-dark-400">
            {t('cal.objetivo')} {obj} %
            {/* Que nadie apruebe con una vara mas blanda que la de Amazon sin
                saberlo: el objetivo se puede bajar, pero a conciencia. */}
            {datos.objetivo_blando && (
              <span className="ml-1.5 text-amber-400/90">
                {t('cal.objetivo.blando').replace('{r}', datos.referencia_fantastic?.dcr)}
              </span>
            )}
          </p>
          {tot?.dcr !== null && <Barra valor={tot.dcr} objetivo={obj} />}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[[num(tot?.despachados), t('cal.despachados')],
              [num(tot?.fallos), t('cal.fallos')],
              [pct(tot?.rts_pct), t('cal.rts')]].map(([v, l]) => (
              <div key={l}>
                <div className="text-sm font-semibold tabular-nums text-dark-200">{v}</div>
                <div className="text-[10px] uppercase tracking-wide text-dark-600">{l}</div>
              </div>
            ))}
          </div>
        </div>

        <Margen m={datos.margen} t={t} />

        <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-dark-500">
            <Users size={13} /> {t('cal.hoy')}
          </div>
          {datos.en_curso ? (
            <>
              <div className="mt-1 text-3xl font-bold tabular-nums text-dark-100">
                {num(datos.en_curso.entregados)}
              </div>
              <p className="text-xs text-dark-400">
                {t('cal.hoy.de').replace('{t}', num(datos.en_curso.total))}
              </p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-dark-800">
                <div className="h-full rounded-full bg-brand-400"
                  style={{ width: `${datos.en_curso.avance_pct}%` }} />
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-dark-600">
                <Info size={12} className="mt-px shrink-0" />
                {t('cal.hoy.nota').replace('{v}', num(datos.en_curso.en_vuelo))}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-dark-500">{t('cal.hoy.sin')}</p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <Impacto datos={datos} center={center && center !== 'Todos' ? center : ''} t={t} />
      </div>

      {/* Va aqui y no en un menu aparte: es justo donde se ve el sintoma
          (conductores marcados "sin ficha" en la tabla de arriba). Se esconde
          solo cuando no queda ninguno pendiente. */}
      <Emparejar />

      <button onClick={() => setVerDias((v) => !v)}
        className="mt-3 flex items-center gap-1 text-[11px] text-dark-500 hover:text-dark-300">
        {verDias ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {t('cal.ver.dias')}
        {noPuntuan.length > 0 && (
          <span className="ml-1 rounded bg-amber-500/10 px-1.5 py-px text-amber-400/90">
            {t('cal.dias.fuera').replace('{n}', noPuntuan.length)}
          </span>
        )}
      </button>

      {verDias && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-dark-800">
          <table className="w-full text-xs">
            <thead className="bg-dark-900/60">
              <tr className="text-[10px] uppercase tracking-wide text-dark-500">
                <th className="px-3 py-2 text-left font-semibold">{t('cal.col.dia')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('cal.col.paquetes')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('cal.col.envuelo')}</th>
                <th className="px-3 py-2 text-left font-semibold">{t('cal.col.estado')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {dias.map(([dia, v]) => (
                <tr key={dia}>
                  <td className="px-3 py-1.5 text-dark-300">{dia}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-dark-400">{num(v.total)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-dark-500">{v.en_vuelo_pct} %</td>
                  <td className="px-3 py-1.5">
                    {v.cerrado
                      ? <span className="text-emerald-400/80">{t('cal.dia.puntua')}</span>
                      : <span className="text-amber-400/80">{t('cal.dia.nopuntua')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-dark-800 px-3 py-2 text-[10px] leading-relaxed text-dark-600">
            {t('cal.dias.explica')}
          </p>
        </div>
      )}
    </div>
  )
}
