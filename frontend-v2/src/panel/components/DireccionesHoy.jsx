import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin, Loader2, ExternalLink, SearchX } from 'lucide-react'
import { useT } from '../../i18n'
import { cortexDireccionesHoy, cortexPortalGeodir } from '../api'
import { lista } from '../../lib/lista'
import { buscarDireccion, fraseVeredicto } from '../../lib/geoDireccion'

/* ────────────────────────────────────────────────────────────────────────────
   "NO PUEDO ENCONTRAR LA DIRECCIÓN" — HOY, EN VIVO
   ---------------------------------------------------------------------------
   Esto NO es la Libreta de portales. La Libreta mira 60 días atrás y agrupa por
   zona: sirve para decidir qué arreglar, y se lee una vez a la semana. Aquí se
   quiere lo contrario: los paquetes de HOY, uno a uno, con su TBA y su hora,
   mientras la ruta sigue en marcha y todavía se puede hacer algo.

   Se refresca solo cada 2 minutos, al ritmo al que la extensión va mandando.

   ── DÓNDE SE BUSCA LA DIRECCIÓN Y POR QUÉ AQUÍ ───────────────────────────────
   La geolocalización la hace el NAVEGADOR, no el servidor: Nominatim responde
   403 a las peticiones del backend. Se busca de una en una y se guarda por
   celda, así que un portal que ya se resolvió no se vuelve a pedir nunca.
   ──────────────────────────────────────────────────────────────────────────── */

const mapa = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`

/* Cada cuánto se vuelve a preguntar al servidor. Dos minutos es el ritmo al que
   la extensión sube capturas: pedirlo más a menudo sólo gasta batería y no
   trae nada nuevo. */
const REFRESCO_MS = 120000

const hhmm = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function Paquete({ p, t }) {
  const real = p.real
  const frase = fraseVeredicto(real)
  return (
    <div className="rounded-lg border border-dark-800 bg-dark-950/40 p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
        <span className="font-mono font-semibold text-dark-100">{p.tba}</span>
        {p.hora && <span className="text-amber-300">{hhmm(p.hora)}</span>}
        {p.ruta && <span className="rounded bg-dark-800 px-1.5 py-px text-[10px] text-dark-400">{p.ruta}</span>}
        {p.conductor && <span className="text-dark-400">{p.conductor}</span>}
        {p.stop_id && <span className="text-dark-600">{t('dh.parada')} {p.stop_id}</span>}
        {p.intentos_hoy > 1 && (
          <span className="rounded bg-red-500/15 px-1.5 py-px text-[10px] font-bold text-red-300">
            {t('dh.intentos').replace('{n}', p.intentos_hoy)}
          </span>
        )}
      </div>

      {/* La dirección que dio Amazon. Puede no venir: Cortex no la manda en la
          captura de ruta, sólo en el informe de faltas. Se dice en claro en vez
          de dejar el hueco, porque es LA razón de que no se pueda buscar. */}
      <p className="mt-1 text-[11.5px] leading-snug text-dark-300">
        {p.direccion || <span className="text-dark-600">{t('dh.sinDireccion')}</span>}
      </p>

      {/* El borde dice de un vistazo si hay que actuar: ámbar si la dirección
          está desplazada, verde si la coordenada era correcta. */}
      {real ? (
        <div className={`mt-1.5 rounded-md border px-2 py-1.5 ${frase?.alarma
          ? 'border-amber-500/40 bg-amber-500/[0.07]' : 'border-emerald-500/25 bg-emerald-500/[0.06]'}`}>
          <p className="text-[9.5px] font-semibold uppercase tracking-wider text-dark-500">
            {t('lib.dir.tit')}
          </p>
          <a href={mapa(real.lat, real.lng)} target="_blank" rel="noreferrer"
            className="text-[11.5px] text-brand-300 hover:underline">
            {real.display} <ExternalLink size={9} className="inline opacity-60" />
          </a>
          {/* La frase la elige la librería, no esta pantalla: el conductor lee
              exactamente la misma en su móvil. */}
          {frase && (
            <p className={`text-[11px] font-semibold ${frase.alarma ? 'text-amber-300' : 'text-emerald-300'}`}>
              {t(frase.clave).replace('{m}', frase.metros)}
            </p>
          )}
          <p className="text-[10px] text-dark-600">
            {t('lib.dir.conf')
              .replace('{n}', (real.familias || []).length)
              .replace('{f}', (real.fuentes || []).join(', '))}
          </p>
        </div>
      ) : (
        <a href={mapa(p.lat, p.lng)} target="_blank" rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-dark-500 hover:text-brand-300">
          <MapPin size={10} /> {t('dh.verPunto')}
        </a>
      )}
      {p.nota && (
        <p className="mt-1 border-l-2 border-brand-500/40 pl-2 text-[11px] text-dark-200">{p.nota}</p>
      )}
    </div>
  )
}

export default function DireccionesHoy({ center, day }) {
  const { t } = useT()
  const [datos, setDatos] = useState(null)

  const cargar = useCallback(() => {
    cortexDireccionesHoy({ day: day || '', center: center && center !== 'Todos' ? center : '' })
      .then((r) => setDatos(r.data))
      .catch(() => { /* el bloque simplemente no aparece: no se molesta con un error */ })
  }, [center, day])

  useEffect(() => { cargar() }, [cargar])
  // Refresco en vivo: la gracia de esta pantalla es enterarse mientras la ruta
  // está en marcha. Se para si la pestaña no se está viendo.
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) cargar() }, REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargar])

  /* Busca la dirección de UNO por tick. De uno en uno y con 2 s de separación
     porque Nominatim exige como máximo 1 petición/segundo; y sólo una vez por
     celda, coincida o no, para no gastar peticiones repitiendo lo que ya se
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
        .catch(() => { /* la red falla: se sigue con el siguiente */ })
        .finally(() => { enCurso.current = false })
    }
    const id = setInterval(tic, 2000)
    return () => clearInterval(id)
  }, [datos, cargar])

  const paquetes = lista(datos?.paquetes)
  // Sin fallos de dirección hoy no se pinta NADA. Un bloque vacío todos los
  // días enseña a no mirar esta zona de la pantalla.
  if (!datos || !paquetes.length) return null

  // Cortex manda la coordenada pero no el texto de la dirección en la captura
  // de ruta. Sin ese texto no hay nada que buscar, y hay que decir por qué.
  const sinTexto = paquetes.filter((p) => !p.direccion).length

  return (
    <div className="mb-5 rounded-2xl border border-red-500/25 bg-red-500/[.05] p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <SearchX size={15} className="text-red-300" />
        <span className="text-[13px] font-bold text-red-200">
          {t('dh.titulo').replace('{n}', paquetes.length)}
        </span>
        {datos.sin_resolver > 0 && (
          <span className="flex items-center gap-1 text-[10.5px] text-dark-500">
            <Loader2 size={10} className="animate-spin" /> {t('dh.buscando')}
          </span>
        )}
      </div>
      <p className="mb-2.5 text-[11.5px] text-dark-400">{t('dh.subtitulo')}</p>
      {sinTexto > 0 && (
        <p className="mb-2.5 rounded-lg border border-amber-500/30 bg-amber-500/[.07] px-2.5 py-1.5 text-[11px] text-amber-200">
          {t('dh.avisoSinTexto').replace('{n}', sinTexto)}
        </p>
      )}
      <div className="space-y-2">
        {paquetes.map((p) => <Paquete key={p.tba} p={p} t={t} />)}
      </div>
    </div>
  )
}
