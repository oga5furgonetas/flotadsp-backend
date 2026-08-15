import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin, Loader2, ExternalLink, SearchX, ChevronDown, ChevronUp, User, Navigation } from 'lucide-react'
import { useT } from '../../i18n'
import { cortexDireccionesHoy, cortexPortalGeodir } from '../api'
import { lista } from '../../lib/lista'
import { buscarDireccion, fraseVeredicto } from '../../lib/geoDireccion'

/* ────────────────────────────────────────────────────────────────────────────
   "NO PUEDO ENCONTRAR LA DIRECCIÓN" — HOY, EN VIVO
   ---------------------------------------------------------------------------
   Tiene pestaña propia a propósito. No es la Libreta de portales (60 días,
   agrupada por zona, para decidir qué arreglar) ni un bloque perdido entre los
   KPIs: es la lista de HOY, paquete a paquete, mientras la ruta está en marcha.
   Se lee de otra manera y en otro momento, así que va en otro sitio.

   Cada tarjeta se abre y dice las tres cosas que hacen falta para actuar:
     · QUIÉN lo lleva (a quién llamas),
     · qué dirección le dio Cortex,
     · dónde está esa dirección DE VERDAD, contrastada, y a cuántos metros del
       punto al que le mandaron.

   La búsqueda la hace el NAVEGADOR: Nominatim responde 403 al servidor. Se
   busca de una en una, se guarda por celda y no se repite jamás.
   ──────────────────────────────────────────────────────────────────────────── */

const mapa = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`

/* Al ritmo al que la extensión sube capturas. Pedirlo más a menudo gasta
   batería y no trae nada nuevo. */
const REFRESCO_MS = 120000

const hhmm = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function Tarjeta({ p, t, abierta, onAbrir }) {
  const real = p.real
  const frase = fraseVeredicto(real)
  return (
    <div className={`overflow-hidden rounded-xl border transition ${frase?.alarma
      ? 'border-amber-500/40 bg-amber-500/[0.05]'
      : real ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
        : 'border-dark-800 bg-dark-900/50'}`}>
      <button onClick={onAbrir} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <span className="shrink-0 text-[11px] font-semibold text-amber-300">{hhmm(p.hora)}</span>
        <span className="min-w-0 flex-1">
          {/* Lo primero, el conductor: es a quien hay que llamar. */}
          <span className="block truncate text-[12.5px] font-semibold text-dark-100">
            {p.conductor || t('dh.sinConductor')}
            {p.ruta && <span className="ml-1.5 rounded bg-dark-800 px-1.5 py-px text-[10px] font-normal text-dark-400">{p.ruta}</span>}
          </span>
          <span className="block truncate text-[11px] text-dark-400">
            {p.direccion || t('dh.sinDireccion')}
          </span>
        </span>
        {real && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${frase?.alarma
            ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/20 text-emerald-200'}`}>
            {frase?.alarma ? `+${real.metros_amazon} m` : t('dh.ok')}
          </span>
        )}
        {abierta ? <ChevronUp size={14} className="shrink-0 text-dark-500" />
          : <ChevronDown size={14} className="shrink-0 text-dark-500" />}
      </button>

      {abierta && (
        <div className="space-y-2.5 border-t border-dark-800 px-3 py-2.5">
          <Dato icono={User} etiqueta={t('dh.d.conductor')}
            valor={p.conductor || t('dh.sinConductor')} />
          <Dato icono={MapPin} etiqueta={t('dh.d.cortex')}
            valor={p.direccion || t('dh.sinDireccion')}
            extra={<a href={mapa(p.lat, p.lng)} target="_blank" rel="noreferrer"
              className="text-[10.5px] text-dark-500 hover:text-brand-300">
              {t('dh.verPunto')} <ExternalLink size={9} className="inline opacity-60" />
            </a>} />

          {real ? (
            <Dato icono={Navigation} etiqueta={t('dh.d.real')} destacado={frase?.alarma}
              valor={real.display}
              extra={<>
                {frase && (
                  <span className={`block text-[11px] font-semibold ${frase.alarma ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {t(frase.clave).replace('{m}', frase.metros)}
                  </span>
                )}
                <span className="block text-[10px] text-dark-600">
                  {t('lib.dir.conf')
                    .replace('{n}', (real.familias || []).length)
                    .replace('{f}', (real.fuentes || []).join(', '))}
                </span>
                <a href={mapa(real.lat, real.lng)} target="_blank" rel="noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-300">
                  <MapPin size={10} /> {t('av.real.ir')}
                </a>
              </>} />
          ) : (
            <p className="text-[11px] text-dark-500">
              {p.direccion ? t('dh.buscando') : t('dh.sinDireccion')}
            </p>
          )}

          {p.nota && (
            <p className="border-l-2 border-brand-500/40 pl-2 text-[11.5px] text-dark-200">{p.nota}</p>
          )}
          <p className="flex flex-wrap gap-x-3 text-[10px] text-dark-600">
            <span className="font-mono">{p.tba}</span>
            {p.stop_id && <span>{t('dh.parada')} {p.stop_id}</span>}
            {p.center && <span>{p.center}</span>}
            {p.intentos_hoy > 1 && (
              <span className="font-semibold text-red-300">{t('dh.intentos').replace('{n}', p.intentos_hoy)}</span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}

function Dato({ icono: Icono, etiqueta, valor, extra, destacado }) {
  return (
    <div className="flex gap-2">
      <Icono size={13} className={`mt-0.5 shrink-0 ${destacado ? 'text-amber-400' : 'text-dark-600'}`} />
      <div className="min-w-0">
        <p className="text-[9.5px] font-semibold uppercase tracking-wider text-dark-600">{etiqueta}</p>
        <p className={`text-[12.5px] leading-snug ${destacado ? 'font-semibold text-amber-100' : 'text-dark-100'}`}>{valor}</p>
        {extra}
      </div>
    </div>
  )
}

export default function DireccionesHoy({ center, day }) {
  const { t } = useT()
  const [datos, setDatos] = useState(null)
  const [abierta, setAbierta] = useState(null)

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

  /* Uno por tick: Nominatim admite 1 petición/segundo, y sólo una vez por celda
     —salga confirmada o no— para no gastar peticiones repitiendo lo que ya se
     sabe que no se puede confirmar. */
  const enCurso = useRef(false)
  const yaVistos = useRef(new Set())
  useEffect(() => {
    if (!datos) return undefined
    const tic = () => {
      if (enCurso.current || document.hidden) return
      const p = lista(datos.paquetes).find(
        (x) => !x.real && x.direccion && x.celda && !yaVistos.current.has(x.celda))
      if (!p) return
      yaVistos.current.add(p.celda)
      enCurso.current = true
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
        .finally(() => { enCurso.current = false })
    }
    const id = setInterval(tic, 2000)
    return () => clearInterval(id)
  }, [datos, cargar])

  const paquetes = lista(datos?.paquetes)

  if (!datos) {
    return (
      <div className="flex items-center gap-2 text-sm text-dark-400">
        <Loader2 size={14} className="animate-spin" /> {t('lib.cargando')}
      </div>
    )
  }
  if (!paquetes.length) {
    return (
      <div className="rounded-2xl border border-dark-800 bg-dark-900/40 p-6 text-center">
        <SearchX size={22} className="mx-auto mb-2 text-dark-600" />
        <p className="text-[13px] font-semibold text-dark-300">{t('dh.vacio')}</p>
        <p className="mt-0.5 text-[11.5px] text-dark-500">{t('dh.vacio.sub')}</p>
      </div>
    )
  }

  const sinTexto = paquetes.filter((p) => !p.direccion).length
  const resueltos = paquetes.filter((p) => p.real).length

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchX size={16} className="text-red-300" />
        <div>
          <h3 className="text-[13.5px] font-bold text-dark-100">
            {t('dh.titulo').replace('{n}', paquetes.length)}
          </h3>
          <p className="text-[11px] text-dark-500">{t('dh.subtitulo')}</p>
        </div>
        <span className="ml-auto text-[11px] text-dark-500">
          {t('dh.resueltos').replace('{n}', resueltos).replace('{t}', paquetes.length)}
        </span>
      </div>

      {/* Por qué algunos no se pueden buscar. Sin decirlo, parecería que el
          buscador no sabe hacer su trabajo. */}
      {sinTexto > 0 && (
        <p className="mb-2.5 rounded-lg border border-amber-500/30 bg-amber-500/[.07] px-2.5 py-1.5 text-[11px] text-amber-200">
          {t('dh.avisoSinTexto').replace('{n}', sinTexto)}
        </p>
      )}

      <div className="space-y-2">
        {paquetes.map((p) => (
          <Tarjeta key={p.tba} p={p} t={t}
            abierta={abierta === p.tba}
            onAbrir={() => setAbierta(abierta === p.tba ? null : p.tba)} />
        ))}
      </div>
    </div>
  )
}
