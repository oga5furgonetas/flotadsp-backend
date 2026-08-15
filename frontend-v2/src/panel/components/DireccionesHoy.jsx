import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MapPin, Loader2, ExternalLink, SearchX, ChevronDown, User, Navigation, CheckCircle2, HelpCircle,
} from 'lucide-react'
import { useT } from '../../i18n'
import { cortexDireccionesHoy, cortexPortalGeodir } from '../api'
import { lista } from '../../lib/lista'
import { buscarDireccion, fraseVeredicto } from '../../lib/geoDireccion'

/* ────────────────────────────────────────────────────────────────────────────
   "NO PUEDO ENCONTRAR LA DIRECCIÓN" — HOY, EN VIVO
   ---------------------------------------------------------------------------
   Pestaña propia. No es la Libreta de portales (60 días, agrupada por zona,
   para decidir qué arreglar) sino la lista de HOY, paquete a paquete, mientras
   la ruta está en marcha y todavía se puede llamar al conductor.

   ── POR QUÉ CADA TARJETA DICE EN QUÉ ESTADO ESTÁ ─────────────────────────────
   La búsqueda tarda: va de una en una porque Nominatim admite una petición por
   segundo. Sin decirlo, una lista donde unos tienen dirección y otros no parece
   rota — "no sé si está buscando o no". Así que cada paquete lleva su estado a
   la vista: buscando / bien geolocalizada / desplazada / no se ha podido / sin
   dirección que buscar. Cinco estados, y ninguno es un hueco en blanco.

   La búsqueda la hace el NAVEGADOR: Nominatim responde 403 al servidor.
   Se guarda por celda y no se repite jamás.
   ──────────────────────────────────────────────────────────────────────────── */

const mapa = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`
const REFRESCO_MS = 120000

const hhmm = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/* Estado de cada paquete, en un solo sitio. La tarjeta entera (color, píldora,
   icono) sale de aquí, para que no puedan contarse dos cosas distintas. */
function estadoDe(p, buscandoAhora) {
  const real = p.real
  if (real) {
    const f = fraseVeredicto(real)
    if (f?.alarma) {
      return { k: 'desplazada', pill: `${real.metros_amazon} m`, tono: 'amber',
        Icono: Navigation, frase: f }
    }
    return { k: 'bien', pill: null, tono: 'emerald', Icono: CheckCircle2, frase: f }
  }
  if (!p.direccion) return { k: 'sintexto', pill: null, tono: 'dark', Icono: HelpCircle }
  if (buscandoAhora) return { k: 'buscando', pill: null, tono: 'brand', Icono: Loader2 }
  return { k: 'nose', pill: null, tono: 'dark', Icono: HelpCircle }
}

const TONO = {
  amber:   { borde: 'border-amber-500/40',   fondo: 'bg-amber-500/[0.055]', txt: 'text-amber-300',   pill: 'bg-amber-500/20 text-amber-100' },
  emerald: { borde: 'border-emerald-500/30', fondo: 'bg-emerald-500/[0.04]', txt: 'text-emerald-300', pill: 'bg-emerald-500/20 text-emerald-100' },
  brand:   { borde: 'border-brand-500/30',   fondo: 'bg-brand-500/[0.04]',  txt: 'text-brand-300',   pill: 'bg-brand-500/20 text-brand-100' },
  dark:    { borde: 'border-dark-800',       fondo: 'bg-dark-900/40',       txt: 'text-dark-500',    pill: 'bg-dark-800 text-dark-400' },
}

function Tarjeta({ p, t, abierta, onAbrir, buscandoAhora }) {
  const e = estadoDe(p, buscandoAhora)
  const c = TONO[e.tono]
  const real = p.real

  return (
    <div className={`overflow-hidden rounded-2xl border ${c.borde} ${c.fondo} transition-colors`}>
      <button onClick={onAbrir} className="flex w-full items-center gap-4 px-4 py-3.5 text-left">
        {/* La hora, grande: en una ruta en marcha lo primero es cuándo pasó. */}
        <div className="w-12 shrink-0 text-center">
          <div className="font-display text-[15px] font-semibold leading-none text-dark-100">{hhmm(p.hora)}</div>
          {p.ruta && <div className="mt-1 text-[9.5px] font-medium uppercase tracking-wider text-dark-600">{p.ruta}</div>}
        </div>

        <div className={`h-9 w-px shrink-0 ${c.borde} border-l`} />

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-dark-50">
            {p.conductor || t('dh.sinConductor')}
          </div>
          <div className="mt-0.5 truncate text-[11.5px] text-dark-400">
            {p.direccion || t('dh.sinDireccion')}
          </div>
        </div>

        {/* El estado, siempre visible, nunca un hueco. */}
        <div className="flex shrink-0 items-center gap-2">
          <e.Icono size={14} className={`${c.txt} ${e.k === 'buscando' ? 'animate-spin' : ''}`} />
          <span className={`hidden whitespace-nowrap text-[11px] font-semibold sm:inline ${c.txt}`}>
            {t(`dh.e.${e.k}`)}
          </span>
          {e.pill && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.pill}`}>{e.pill}</span>
          )}
          <ChevronDown size={15} className={`text-dark-600 transition-transform ${abierta ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {abierta && (
        <div className="grid gap-4 border-t border-dark-800/80 px-4 py-4 sm:grid-cols-2">
          <Bloque icono={User} etiqueta={t('dh.d.conductor')}
            valor={p.conductor || t('dh.sinConductor')}
            pie={[p.ruta, p.stop_id && `${t('dh.parada')} ${p.stop_id}`, p.center].filter(Boolean).join(' · ')} />

          <Bloque icono={MapPin} etiqueta={t('dh.d.cortex')}
            valor={p.direccion || t('dh.sinDireccion')}
            enlace={{ href: mapa(p.lat, p.lng), txt: t('dh.verPunto') }} />

          <div className="sm:col-span-2">
            {real ? (
              <div className={`rounded-xl border ${c.borde} ${c.fondo} p-3.5`}>
                <Bloque icono={Navigation} etiqueta={t('dh.d.real')} destacado={e.tono === 'amber'}
                  valor={real.display}
                  enlace={{ href: mapa(real.lat, real.lng), txt: t('av.real.ir') }} />
                {e.frase && (
                  <p className={`mt-2 text-[12.5px] font-semibold leading-snug ${c.txt}`}>
                    {t(e.frase.clave).replace('{m}', e.frase.metros)}
                  </p>
                )}
                <p className="mt-1.5 text-[10.5px] text-dark-600">
                  {t('lib.dir.conf')
                    .replace('{n}', (real.familias || []).length)
                    .replace('{f}', (real.fuentes || []).join(', '))}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-dark-800 bg-dark-950/40 p-3.5">
                <p className={`flex items-center gap-2 text-[12.5px] font-semibold ${c.txt}`}>
                  <e.Icono size={14} className={e.k === 'buscando' ? 'animate-spin' : ''} />
                  {t(`dh.e.${e.k}`)}
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-dark-500">{t(`dh.exp.${e.k}`)}</p>
              </div>
            )}
          </div>

          {p.nota && (
            <p className="border-l-2 border-brand-500/50 pl-3 text-[12px] text-dark-200 sm:col-span-2">{p.nota}</p>
          )}
          <p className="font-mono text-[10px] text-dark-700 sm:col-span-2">{p.tba}</p>
        </div>
      )}
    </div>
  )
}

function Bloque({ icono: Icono, etiqueta, valor, pie, enlace, destacado }) {
  return (
    <div className="flex gap-2.5">
      <Icono size={14} className={`mt-0.5 shrink-0 ${destacado ? 'text-amber-400' : 'text-dark-600'}`} />
      <div className="min-w-0">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-dark-600">{etiqueta}</p>
        <p className={`mt-0.5 text-[13px] leading-snug ${destacado ? 'font-semibold text-amber-100' : 'text-dark-100'}`}>{valor}</p>
        {pie && <p className="mt-0.5 text-[10.5px] text-dark-600">{pie}</p>}
        {enlace && (
          <a href={enlace.href} target="_blank" rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-300 hover:underline">
            <MapPin size={10} /> {enlace.txt} <ExternalLink size={9} className="opacity-60" />
          </a>
        )}
      </div>
    </div>
  )
}

export default function DireccionesHoy({ center, day }) {
  const { t } = useT()
  const [datos, setDatos] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const [buscando, setBuscando] = useState(null)   // celda que se está buscando AHORA

  const cargar = useCallback(() => {
    cortexDireccionesHoy({ day: day || '', center: center && center !== 'Todos' ? center : '' })
      .then((r) => setDatos(r.data))
      .catch(() => {})
  }, [center, day])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) cargar() }, REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargar])

  const enCurso = useRef(false)
  const yaVistos = useRef(new Set())
  useEffect(() => {
    if (!datos) return undefined
    const tic = () => {
      if (enCurso.current || document.hidden) return
      const p = lista(datos.paquetes).find(
        (x) => !x.real && x.direccion && x.celda && !yaVistos.current.has(x.celda))
      if (!p) { setBuscando(null); return }
      yaVistos.current.add(p.celda)
      enCurso.current = true
      setBuscando(p.celda)          // para que la tarjeta lo diga
      buscarDireccion(p.direccion, { lat: p.lat, lng: p.lng })
        .then(async (r) => {
          if ((!['confirmada', 'zona', 'oficial'].includes(r.estado)) || !r.punto) return
          await cortexPortalGeodir({
            celdas: [p.celda],
            geodir: {
              display: r.punto.display, lat: r.punto.lat, lng: r.punto.lng,
              direccion_amazon: p.direccion, familias: r.familias,
              fuentes: r.resultados.map((v) => v.fuente),
              precision: r.punto.precision, precision_acuerdo: r.precision_acuerdo,
              veredicto: r.veredicto, dispersion_m: r.dispersion_m,
            },
          })
          cargar()
        })
        .catch(() => {})
        .finally(() => { enCurso.current = false; setBuscando(null) })
    }
    const id = setInterval(tic, 2000)
    return () => clearInterval(id)
  }, [datos, cargar])

  const paquetes = lista(datos?.paquetes)

  if (!datos) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-dark-400">
        <Loader2 size={15} className="animate-spin" /> {t('lib.cargando')}
      </div>
    )
  }
  if (!paquetes.length) {
    return (
      <div className="py-16 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
          <CheckCircle2 size={22} className="text-emerald-400/80" />
        </div>
        <p className="text-[14px] font-semibold text-dark-200">{t('dh.vacio')}</p>
        <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-dark-500">{t('dh.vacio.sub')}</p>
      </div>
    )
  }

  const sinTexto = paquetes.filter((p) => !p.direccion).length
  const buscables = paquetes.filter((p) => p.direccion)
  const resueltos = paquetes.filter((p) => p.real).length
  const pendientes = buscables.length - resueltos
  const pct = buscables.length ? Math.round((resueltos / buscables.length) * 100) : 0

  return (
    <div>
      {/* ── CABECERA CON PROGRESO ────────────────────────────────────────────
          El contador y la barra existen por una razón concreta: la búsqueda va
          de una en una y tarda, y sin verla parece que no hace nada. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10">
            <SearchX size={17} className="text-red-300" />
          </div>
          <div>
            <h3 className="font-display text-[16px] font-semibold leading-tight text-dark-50">
              {t('dh.titulo').replace('{n}', paquetes.length)}
            </h3>
            <p className="text-[11.5px] text-dark-500">{t('dh.subtitulo')}</p>
          </div>
        </div>

        <div className="ml-auto min-w-[180px]">
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="font-semibold text-dark-300">
              {pendientes > 0
                ? <span className="inline-flex items-center gap-1.5 text-brand-300">
                    <Loader2 size={11} className="animate-spin" /> {t('dh.buscando')}
                  </span>
                : t('dh.listo')}
            </span>
            <span className="text-dark-500">{t('dh.resueltos').replace('{n}', resueltos).replace('{t}', buscables.length)}</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-dark-800">
            <div className="h-full rounded-full bg-emerald-500/70 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {sinTexto > 0 && (
        <p className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/[.06] px-3 py-2 text-[11.5px] leading-relaxed text-amber-200/90">
          {t('dh.avisoSinTexto').replace('{n}', sinTexto)}
        </p>
      )}

      <div className="space-y-2.5">
        {paquetes.map((p) => (
          <Tarjeta key={p.tba} p={p} t={t}
            abierta={abierta === p.tba}
            buscandoAhora={buscando === p.celda}
            onAbrir={() => setAbierta(abierta === p.tba ? null : p.tba)} />
        ))}
      </div>
    </div>
  )
}
