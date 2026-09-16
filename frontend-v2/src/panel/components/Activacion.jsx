import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ArrowRight, Upload, Users, Camera, X } from 'lucide-react'
import { getOnboarding } from '../api'
import { useT } from '../../i18n'

/* ── Guía de activación ────────────────────────────────────────────────────
   Reemplaza al típico asistente modal: ese bloquea, se cierra sin leer y
   esconde el producto. Esto vive DENTRO del panel, se puede ignorar y
   desaparece solo cuando los tres pasos están hechos.

   Regla clave: el estado sale de datos REALES del servidor (cuántas
   furgonetas, conductores y auditorías hay), nunca de una marca guardada.
   Un flag "ya lo hizo" mentiría en cuanto el DSP borrara su flota. */

function Paso({ icon: Icon, n, titulo, hint, hecho, resumen, cta, to, cta2, to2, bloqueado, bloqueadoMsg }) {
  return (
    <li className={`relative flex gap-3.5 rounded-xl border p-3.5 transition ${
      hecho ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
            : bloqueado ? 'border-white/[0.05] bg-white/[0.01] opacity-60'
                        : 'border-white/[0.07] bg-white/[0.02]'}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
        hecho ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.05] text-dark-400'}`}>
        {hecho ? <Check size={15} /> : <Icon size={15} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[13.5px] font-semibold ${hecho ? 'text-emerald-200' : 'text-dark-100'}`}>
          <span className="mr-1.5 font-mono text-[11px] text-dark-500">{n}</span>{titulo}
        </p>
        {hecho ? (
          <p className="mt-0.5 text-[12px] text-emerald-300/80">{resumen}</p>
        ) : (
          <>
            <p className="mt-0.5 text-[12px] leading-relaxed text-dark-400">{hint}</p>
            {bloqueado ? (
              <p className="mt-2 text-[11.5px] font-medium text-dark-500">{bloqueadoMsg}</p>
            ) : (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Link to={to}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110">
                  {cta} <ArrowRight size={12} />
                </Link>
                {cta2 && (
                  <Link to={to2} className="text-[12px] font-medium text-dark-400 transition hover:text-dark-200">
                    {cta2}
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </li>
  )
}

/* ── Cada nave, por separado ───────────────────────────────────────────────
   La guia daba la empresa por lista con una furgoneta, un conductor y una
   auditoria EN TOTAL. El 16-09-2026, con la guia «completa», DGA1 llevaba 20
   dias sin un paquete de Cortex y DGA2 36, y nada lo decia. Cada nave enseña
   lo que tiene medido con sus datos (el backend lo cuenta) y, si le falta
   algo, la accion concreta con su enlace. Lo recomendado se ve, pero no deja
   la guia abierta. */
const PASO_NAVE = {
  vehiculos:   { tit: 'ob.n.vehiculos',   falta: 'ob.n.falta.vehiculos',   to: '/panel/importaciones?t=furgonetas' },
  conductores: { tit: 'ob.n.conductores', falta: 'ob.n.falta.conductores', to: '/panel/importaciones?t=conductores' },
  cortex:      { tit: 'ob.n.cortex',      falta: 'ob.n.cortex.instalar',   to: '/panel/paquetes' },
  objetivos:   { tit: 'ob.n.objetivos',   falta: 'ob.n.falta.objetivos',   to: '/panel/scorecard?t=subir' },
  talleres:    { tit: 'ob.n.talleres',    falta: 'ob.n.falta.talleres',    to: '/panel/talleres' },
  turnos:      { tit: 'ob.n.turnos',      falta: 'ob.n.falta.turnos',      to: '/panel/turnos' },
}

// '2026-08-27' -> '27-08'. Troceando el texto: por fecha local se corre un dia (gotcha 11).
const diaCorto = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}-${d.slice(5, 7)}` : '')

function mensajeCortex(paso, t) {
  if (!paso.extension) return t('ob.n.cortex.instalar')
  if (!paso.area) return t('ob.n.cortex.abrir')
  return t('ob.n.cortex.esperando').replace('{dia}', diaCorto(paso.ultimo_dia) || '—')
}

function Nave({ nave, t, basicosArriba }) {
  // Con los pasos de la empresa aun pendientes, furgonetas y conductores ya
  // se piden arriba: repetirlos en la nave es decir lo mismo dos veces.
  const pasos = (nave.pasos || []).filter((p) => PASO_NAVE[p.id]
    && !(basicosArriba && (p.id === 'vehiculos' || p.id === 'conductores')))
  const pendiente = pasos.find((p) => !p.hecho && !p.opcional) || (nave.completa ? null : pasos.find((p) => !p.hecho))
  return (
    <li className={`rounded-xl border p-3 ${nave.completa ? 'border-emerald-500/15 bg-emerald-500/[0.03]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-mono text-[13px] font-semibold text-dark-100">{nave.centro}</span>
        {nave.completa && (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-300"><Check size={12} />{t('ob.nave.lista')}</span>
        )}
        <div className="flex flex-wrap gap-1.5">
          {pasos.map((p) => (
            <span key={p.id} title={p.opcional ? t('ob.n.recomendado') : undefined}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] ${
                p.hecho ? 'bg-emerald-500/10 text-emerald-200'
                  : p.opcional ? 'bg-white/[0.04] text-dark-400'
                    : 'bg-amber-500/10 text-amber-200'}`}>
              {p.hecho ? <Check size={11} /> : <X size={11} />}
              {t(PASO_NAVE[p.id].tit)}
              {p.hecho && p.n > 0 && p.id !== 'objetivos' && <span className="tabular-nums opacity-70">{p.n}</span>}
            </span>
          ))}
        </div>
      </div>
      {pendiente && (
        <p className="mt-2 text-[12px] leading-relaxed text-dark-300">
          {pendiente.id === 'cortex' ? mensajeCortex(pendiente, t) : t(PASO_NAVE[pendiente.id].falta)}{' '}
          <Link to={PASO_NAVE[pendiente.id].to} className="inline-flex items-center gap-1 font-semibold text-brand-300 hover:text-brand-200">
            {t('ob.n.ir')} <ArrowRight size={11} />
          </Link>
        </p>
      )}
    </li>
  )
}

export default function Activacion() {
  const { t } = useT()
  const [data, setData] = useState(null)
  // Se puede esconder, pero NO se marca nada como hecho: si mañana faltan
  // datos de verdad, la guía vuelve al reabrir sesión en otro equipo.
  const [oculto, setOculto] = useState(() => sessionStorage.getItem('ob_oculto') === '1')

  useEffect(() => {
    let vivo = true
    getOnboarding().then((r) => { if (vivo) setData(r.data) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  // Silencio absoluto si aún no sabemos, si ya está todo hecho o si lo ocultó.
  if (!data || data.completo || oculto) return null

  const paso = (id) => data.pasos.find((x) => x.id === id) || { hecho: false, n: 0 }
  const v = paso('vehiculos'), c = paso('conductores'), i = paso('inspeccion')
  const naves = Array.isArray(data.naves) ? data.naves : []
  const navesListas = naves.filter((n) => n.completa).length
  // Con los tres pasos de la empresa hechos, lo que queda abierto son las naves:
  // la cabecera y la barra pasan a contar naves, no a repetir un 3/3.
  const soloNaves = data.hechos === data.total && naves.length > 0
  const pct = soloNaves
    ? Math.round((navesListas / naves.length) * 100)
    : Math.round((data.hechos / data.total) * 100)
  // Primero las que tienen algo pendiente: es lo que hay que mirar.
  const navesOrden = [...naves].sort((a, b) => Number(a.completa) - Number(b.completa)
    || String(a.centro).localeCompare(String(b.centro), 'es', { sensitivity: 'base' }))
  // "1 furgoneta", no "1 furgonetas": el singular importa en los 6 idiomas.
  const cuenta = (n, clave) => `${n} ${t(n === 1 ? `${clave}1` : clave)}`

  return (
    <section className="rise mb-6 rounded-2xl border border-brand-500/20 bg-brand-500/[0.03] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em] text-dark-50">{t(soloNaves ? 'ob.naves.tit' : 'ob.titulo')}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-dark-400">{t(soloNaves ? 'ob.naves.sub' : 'ob.sub')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-display text-[15px] font-semibold tabular-nums text-brand-300">
              {soloNaves ? `${navesListas}/${naves.length}` : `${data.hechos}/${data.total}`}
            </p>
            <p className="text-[10.5px] text-dark-500">{t(soloNaves ? 'ob.naves.progreso' : 'ob.progreso')}</p>
          </div>
          <button onClick={() => { sessionStorage.setItem('ob_oculto', '1'); setOculto(true) }}
            title={t('ob.ocultar')} aria-label={t('ob.ocultar')}
            className="rounded-lg p-1.5 text-dark-600 transition hover:bg-white/[0.05] hover:text-dark-300">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="mb-4 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-500 transition-[width] duration-700"
          style={{ width: `${pct}%` }} />
      </div>

      {!soloNaves && (
      <ol className="grid gap-2 lg:grid-cols-3">
        <Paso icon={Upload} n="1" hecho={v.hecho}
          titulo={t('ob.v.tit')} hint={t('ob.v.hint')}
          resumen={cuenta(v.n, 'ob.v.ok')}
          cta={t('ob.v.cta')} to="/panel/importaciones?t=furgonetas"
          cta2={t('ob.v.cta2')} to2="/panel/vehiculos" />
        <Paso icon={Users} n="2" hecho={c.hecho}
          titulo={t('ob.c.tit')} hint={t('ob.c.hint')}
          resumen={cuenta(c.n, 'ob.c.ok')}
          // Al asistente de importar, que lee el Excel y deja elegir la nave;
          // el alta a mano sigue a un clic.
          cta={t('ob.c.cta')} to="/panel/importaciones?t=conductores"
          cta2={t('ob.c.cta2')} to2="/panel/conductores" />
        <Paso icon={Camera} n="3" hecho={i.hecho}
          titulo={t('ob.i.tit')} hint={t('ob.i.hint')}
          resumen={cuenta(i.n, 'ob.i.ok')}
          cta={t('ob.i.cta')} to="/panel/inspecciones"
          // Sin furgonetas ni conductores no se puede auditar: en vez de
          // dejar que lo intente y choque, se explica el porqué.
          bloqueado={!v.hecho || !c.hecho} bloqueadoMsg={t('ob.bloqueado')} />
      </ol>
      )}

      {naves.length > 0 && (
        <div className={soloNaves ? '' : 'mt-4'}>
          {!soloNaves && <h3 className="mb-2 text-[13px] font-semibold text-dark-100">{t('ob.naves.tit')}</h3>}
          <ul className="grid gap-2">
            {navesOrden.map((n) => <Nave key={n.centro} nave={n} t={t} basicosArriba={!soloNaves} />)}
          </ul>
        </div>
      )}
    </section>
  )
}
