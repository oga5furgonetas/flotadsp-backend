import { useCallback, useEffect, useState } from 'react'
import {
  MapPin, Loader2, ExternalLink, ChevronDown, User, Navigation, ShieldAlert, CheckCircle2, Clock,
} from 'lucide-react'
import { useT } from '../../i18n'
import { cortexMissingHoy } from '../api'
import { lista } from '../../lib/lista'
import { fraseVeredicto } from '../../lib/geoDireccion'

/* ────────────────────────────────────────────────────────────────────────────
   MISSING DE HOY — pestaña propia
   ---------------------------------------------------------------------------
   Aparte de los "no puedo encontrar la dirección" a propósito: son dos
   problemas distintos y se atienden distinto. Un MISSING es un paquete que no
   aparece —hay que llamar al conductor y que mire la furgoneta— y una dirección
   que no se encuentra es un problema de mapa. En una lista mezclada hay que
   leer cada línea para saber de cuál se trata.

   Lo primero es SIEMPRE quién lo lleva y cuánto tiempo lleva perdido: con un
   missing, el tiempo es la mitad de la información.
   ──────────────────────────────────────────────────────────────────────────── */

const mapa = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`
const REFRESCO_MS = 120000

const hhmm = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Cuánto lleva perdido. Un "hace 3 h" mueve a actuar; una hora suelta, no. */
function desde(iso, t) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const min = Math.round(ms / 60000)
  if (min < 60) return t('mh.hace.min').replace('{n}', min)
  return t('mh.hace.h').replace('{n}', Math.round(min / 60))
}

const TONO = {
  critical: { borde: 'border-red-500/40',   fondo: 'bg-red-500/[0.055]', txt: 'text-red-300',   pill: 'bg-red-500/20 text-red-100' },
  high:     { borde: 'border-amber-500/35', fondo: 'bg-amber-500/[0.05]', txt: 'text-amber-300', pill: 'bg-amber-500/20 text-amber-100' },
  normal:   { borde: 'border-dark-800',     fondo: 'bg-dark-900/40',      txt: 'text-dark-400',  pill: 'bg-dark-800 text-dark-300' },
}

function Tarjeta({ p, t, abierta, onAbrir }) {
  const c = TONO[p.prioridad] || TONO.normal
  const real = p.real
  const frase = fraseVeredicto(real)

  return (
    <div className={`overflow-hidden rounded-2xl border ${c.borde} ${c.fondo} transition-colors`}>
      <button onClick={onAbrir} className="flex w-full items-center gap-4 px-4 py-3.5 text-left">
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
            {p.direccion || t('mh.sinDireccion')}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1 text-[11px] text-dark-500 sm:inline-flex">
            <Clock size={11} /> {desde(p.hora, t)}
          </span>
          {p.prioridad === 'critical' && (
            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${c.pill}`}>
              {t('mh.critico')}
            </span>
          )}
          <ChevronDown size={15} className={`text-dark-600 transition-transform ${abierta ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {abierta && (
        <div className="grid gap-4 border-t border-dark-800/80 px-4 py-4 sm:grid-cols-2">
          <Bloque icono={User} etiqueta={t('dh.d.conductor')}
            valor={p.conductor || t('dh.sinConductor')}
            pie={[p.ruta, p.stop_id && `${t('dh.parada')} ${p.stop_id}`, p.center].filter(Boolean).join(' · ')} />

          <Bloque icono={MapPin} etiqueta={t('mh.d.entrega')}
            valor={p.direccion || t('mh.sinDireccion')}
            enlace={p.lat ? { href: mapa(p.lat, p.lng), txt: t('dh.verPunto') } : null} />

          {/* Por qué el sistema lo ha marcado como perdido. Sin esto, un
              "missing" es una etiqueta y no una pista. */}
          {p.motivo && (
            <div className="sm:col-span-2">
              <div className={`rounded-xl border ${c.borde} ${c.fondo} p-3.5`}>
                <Bloque icono={ShieldAlert} etiqueta={t('mh.d.motivo')} valor={p.motivo} destacado />
              </div>
            </div>
          )}

          {/* Si además ese portal está mal geolocalizado, explica bastante de
              por qué se perdió: se enseña aquí en vez de hacer buscarlo. */}
          {real && (
            <div className="sm:col-span-2">
              <div className="rounded-xl border border-dark-800 bg-dark-950/40 p-3.5">
                <Bloque icono={Navigation} etiqueta={t('dh.d.real')} valor={real.display}
                  enlace={{ href: mapa(real.lat, real.lng), txt: t('av.real.ir') }} />
                {frase && (
                  <p className={`mt-2 text-[12.5px] font-semibold ${frase.alarma ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {t(frase.clave).replace('{m}', frase.metros)}
                  </p>
                )}
              </div>
            </div>
          )}

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
      <Icono size={14} className={`mt-0.5 shrink-0 ${destacado ? 'text-red-400' : 'text-dark-600'}`} />
      <div className="min-w-0">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-dark-600">{etiqueta}</p>
        <p className={`mt-0.5 text-[13px] leading-snug ${destacado ? 'font-semibold text-red-100' : 'text-dark-100'}`}>{valor}</p>
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

export default function MissingHoy({ center, day }) {
  const { t } = useT()
  const [datos, setDatos] = useState(null)
  const [abierta, setAbierta] = useState(null)

  const cargar = useCallback(() => {
    cortexMissingHoy({ day: day || '', center: center && center !== 'Todos' ? center : '' })
      .then((r) => setDatos(r.data))
      .catch(() => {})
  }, [center, day])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) cargar() }, REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargar])

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
        <p className="text-[14px] font-semibold text-dark-200">{t('mh.vacio')}</p>
        <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-dark-500">{t('mh.vacio.sub')}</p>
      </div>
    )
  }

  const criticos = paquetes.filter((p) => p.prioridad === 'critical').length

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10">
            <ShieldAlert size={17} className="text-red-300" />
          </div>
          <div>
            <h3 className="font-display text-[16px] font-semibold leading-tight text-dark-50">
              {t('mh.titulo').replace('{n}', paquetes.length)}
            </h3>
            <p className="text-[11.5px] text-dark-500">{t('mh.subtitulo')}</p>
          </div>
        </div>
        {criticos > 0 && (
          <span className="ml-auto rounded-full bg-red-500/15 px-3 py-1 text-[11.5px] font-bold text-red-200">
            {t('mh.ncriticos').replace('{n}', criticos)}
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        {paquetes.map((p) => (
          <Tarjeta key={p.tba} p={p} t={t}
            abierta={abierta === p.tba}
            onAbrir={() => setAbierta(abierta === p.tba ? null : p.tba)} />
        ))}
      </div>
    </div>
  )
}
