import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../i18n'
import {
  Loader2, MapPin, NotebookPen, Check, ExternalLink, Save, X, Search,
} from 'lucide-react'
import { cortexPortales, cortexPortalNota, cortexPortalGeo } from '../api'
import { lista } from '../../lib/lista'
import { resolverCoordenada, compararDirecciones } from '../../lib/geoPortal'

/* ────────────────────────────────────────────────────────────────────────────
   Libreta de portales.

   Medido en producción (60 días, verificado contra Mongo): 38 portales fallan
   en 2 o más días distintos y acumulan 124 fallos de entrega. El peor lleva
   16 fallos en 9 días… y en ese mismo punto se entregaron 227 paquetes bien.

   Que se entreguen 227 bien descarta que la dirección sea mala: es un piso o un
   negocio concreto con un problema concreto — un código de portal, un timbre
   que no suena, una empresa que cierra a las 14:00.

   Aquí solo entran fallos donde el conductor LLEGÓ y no pudo entregar. Los
   UNCOLLECTED (nunca se recogieron en la estación) se cuentan aparte: son un
   problema de carga, no de portal, y mezclarlos falseaba el ranking entero —
   antes salían 47 portales y 204 fallos, y el que parecía peor era casi todo
   estación.

   Ese conocimiento existe: lo tiene el conductor que lo resolvió. Y se va con
   él cuando deja la empresa. Esta pantalla lo convierte en algo que se queda.
   ──────────────────────────────────────────────────────────────────────────── */

const mapa = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`

/* Veredicto del contraste entre las dos fuentes. Ninguno de los cuatro dice
   cuál es la buena: sólo si están de acuerdo. */
const VEREDICTO = {
  coincide:      { k: 'lib.geo.match',  cls: 'text-emerald-300/90' },
  otro_numero:   { k: 'lib.geo.num',    cls: 'text-amber-300' },
  discrepa:      { k: 'lib.geo.diff',   cls: 'text-red-300' },
  no_comparable: { k: 'lib.geo.nocmp',  cls: 'text-dark-500' },
}

function Fila({ p, onGuardar, onGeo, t }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(p.nota || '')
  const [guardando, setGuardando] = useState(false)
  const [resolviendo, setResolviendo] = useState(false)
  const [falloGeo, setFalloGeo] = useState(false)

  const guardar = async (resuelto = p.resuelto) => {
    setGuardando(true)
    try {
      await onGuardar({ celdas: p.celdas, nota: texto, resuelto })
      setEditando(false)
    } finally { setGuardando(false) }
  }

  /* Se pregunta al mapa por la coordenada REAL del portal, no por el centro de
     la celda: la celda son ~25 m y su centro puede caer en la acera de
     enfrente, que es justo el error que esto intenta detectar. */
  const resolver = async () => {
    setResolviendo(true); setFalloGeo(false)
    try {
      const g = await resolverCoordenada(p.lat, p.lng)
      if (!g) { setFalloGeo(true); return }
      await onGeo({ celdas: p.celdas, geo: g })
    } finally { setResolviendo(false) }
  }

  const amazon = (p.direcciones || [])[0] || ''
  const veredicto = p.geo ? compararDirecciones(amazon, p.geo) : null
  const grave = p.dias_distintos >= 4
  return (
    <div className={`rounded-lg border p-3 ${p.resuelto ? 'border-dark-800 bg-dark-900/30 opacity-60'
      : grave ? 'border-amber-500/25 bg-amber-500/[0.03]' : 'border-dark-800 bg-dark-900/50'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a href={mapa(p.lat, p.lng)} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-sm font-semibold text-brand-300 hover:underline">
              <MapPin size={13} /> {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
              <ExternalLink size={11} className="opacity-60" />
            </a>
            {p.center && (
              <span className="rounded bg-dark-800 px-1.5 py-px text-[10px] text-dark-400">{p.center}</span>
            )}
            {p.resuelto && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                <Check size={10} /> {t('lib.resuelto')}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
            <span className={grave ? 'font-semibold text-amber-300' : 'text-dark-300'}>
              {t('lib.fallos').replace('{n}', p.fallos).replace('{d}', p.dias_distintos)}
            </span>
            {/* Este contraste es la clave del diagnóstico: muchas entregas bien
                en el mismo punto significa que el portal no es el problema, lo
                es un destinatario concreto. */}
            {p.entregas_ok > 0 && (
              <span className="text-dark-500">
                {t('lib.ok').replace('{n}', p.entregas_ok)}
              </span>
            )}
            {/* Distinta bestia: estos ni salieron de la estacion. No es culpa
                del portal, pero el DSP lo quiere saber igual. */}
            {p.no_recogidos > 0 && (
              <span className="text-dark-600">
                {t('lib.norecogidos').replace('{n}', p.no_recogidos)}
              </span>
            )}
            <span className="text-dark-600">{t('lib.ultimo')} {p.ultimo_fallo}</span>
            {p.celdas?.length > 1 && (
              <span className="text-dark-700">{t('lib.unido').replace('{n}', p.celdas.length)}</span>
            )}
          </div>

          {/* ── LAS DOS DIRECCIONES, UNA ENFRENTE DE OTRA ──────────────────
              Arriba la que da Amazon; debajo lo que el mapa dice que hay en esa
              coordenada. Ninguna de las dos se presenta como "la correcta":
              lo que importa es si están de acuerdo, y ese veredicto es lo único
              que aquí se afirma. */}
          {(amazon || p.geo) && (
            <div className="mt-2 space-y-1 rounded-md border border-dark-800 bg-dark-900/60 px-2.5 py-1.5">
              {amazon && (
                <div className="flex gap-2 text-[11px] leading-snug">
                  <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-wider text-dark-600">{t('lib.geo.amz')}</span>
                  <span className="min-w-0 text-dark-300">{amazon}</span>
                </div>
              )}
              {p.geo ? (
                <>
                  <div className="flex gap-2 text-[11px] leading-snug">
                    <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-wider text-dark-600">{t('lib.geo.osm')}</span>
                    <span className="min-w-0 text-dark-300">
                      {p.geo.display}
                      <span className="ml-1 text-[10px] text-dark-600">
                        ({t(`lib.geo.p.${p.geo.precision}`)})
                      </span>
                    </span>
                  </div>
                  {veredicto && (
                    <p className={`text-[10.5px] ${VEREDICTO[veredicto].cls}`}>
                      {t(VEREDICTO[veredicto].k)}
                    </p>
                  )}
                </>
              ) : (
                <button onClick={resolver} disabled={resolviendo}
                  className="flex items-center gap-1 text-[11px] font-semibold text-brand-300 hover:underline disabled:opacity-50">
                  {resolviendo ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                  {t('lib.geo.ask')}
                </button>
              )}
              {falloGeo && <p className="text-[10.5px] text-dark-500">{t('lib.geo.fail')}</p>}
            </div>
          )}

          {!editando && p.nota && (
            <p className="mt-2 rounded-md border-l-2 border-brand-500/40 bg-dark-900 px-2.5 py-1.5 text-xs leading-relaxed text-dark-200">
              {p.nota}
              {p.nota_autor && (
                <span className="ml-1 text-[10px] text-dark-600">— {p.nota_autor}</span>
              )}
            </p>
          )}
        </div>

        {!editando && (
          <div className="flex shrink-0 gap-1.5">
            <button onClick={() => { setTexto(p.nota || ''); setEditando(true) }}
              className="flex items-center gap-1 rounded-lg bg-dark-800 px-2.5 py-1 text-[11px] font-semibold text-dark-200 hover:bg-dark-700">
              <NotebookPen size={12} /> {p.nota ? t('lib.editar') : t('lib.anotar')}
            </button>
            {p.nota && !p.resuelto && (
              <button onClick={() => guardar(true)} disabled={guardando}
                className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 disabled:opacity-50">
                <Check size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {editando && (
        <div className="mt-2">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2}
            placeholder={t('lib.placeholder')} maxLength={600} autoFocus
            className="w-full rounded-lg border border-dark-700 bg-dark-900 px-2.5 py-1.5 text-xs text-dark-100 placeholder:text-dark-600" />
          <div className="mt-1.5 flex items-center gap-2">
            <button onClick={() => guardar()} disabled={guardando}
              className="btn-primary flex items-center gap-1 px-2.5 py-1 text-[11px] disabled:opacity-50">
              {guardando ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              {t('lib.guardar')}
            </button>
            <button onClick={() => setEditando(false)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-dark-500 hover:text-dark-300">
              <X size={11} /> {t('lib.cancelar')}
            </button>
            <span className="ml-auto text-[10px] text-dark-700">{texto.length}/600</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LibretaPortales({ center }) {
  const { t } = useT()
  const [datos, setDatos] = useState(null)
  const [err, setErr] = useState('')
  const [soloSinNota, setSoloSinNota] = useState(false)
  const [q, setQ] = useState('')

  const cargar = useCallback(() => {
    setDatos(null); setErr('')
    cortexPortales({ center: center && center !== 'Todos' ? center : '', dias: 60 })
      .then((r) => setDatos(r.data))
      .catch((e) => setErr(e?.response?.data?.detail || t('lib.error')))
  }, [center, t])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async (body) => {
    await cortexPortalNota(body)
    cargar()
  }

  const guardarGeo = async (body) => {
    await cortexPortalGeo(body)
    cargar()
  }

  if (err) return <p className="text-sm text-red-300">{err}</p>
  if (!datos) {
    return (
      <div className="flex items-center gap-2 text-sm text-dark-400">
        <Loader2 size={14} className="animate-spin" /> {t('lib.cargando')}
      </div>
    )
  }

  let portales = lista(datos.portales)
  if (soloSinNota) portales = portales.filter((p) => !p.nota)
  if (q.trim()) {
    const s = q.trim().toLowerCase()
    portales = portales.filter((p) =>
      (p.nota || '').toLowerCase().includes(s) || (p.center || '').toLowerCase().includes(s))
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-dark-100">
            <NotebookPen size={15} className="text-brand-400" /> {t('lib.titulo')}
          </h3>
          <p className="text-[11px] text-dark-600">{t('lib.subtitulo')}</p>
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-dark-600" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('lib.buscar')}
            className="w-40 rounded-lg border border-dark-700 bg-dark-900 py-1 pl-7 pr-2 text-xs text-dark-100 placeholder:text-dark-600" />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-dark-400">
          <input type="checkbox" checked={soloSinNota} onChange={(e) => setSoloSinNota(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand-500" />
          {t('lib.solo.sin.nota')}
        </label>
      </div>

      {datos.resumen?.reincidentes > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-dark-900/60 px-3 py-2 text-[11px]">
          <span className="text-dark-400">
            {t('lib.res.portales')} <b className="text-dark-100">{datos.resumen.reincidentes}</b>
          </span>
          <span className="text-dark-400">
            {t('lib.res.fallos')} <b className="text-amber-300">{datos.resumen.fallos}</b>
          </span>
          <span className="text-dark-400">
            {t('lib.res.sinnota')} <b className="text-dark-200">{datos.resumen.sin_nota}</b>
          </span>
        </div>
      )}

      {portales.length === 0 ? (
        <p className="py-6 text-center text-sm text-dark-500">
          {datos.resumen?.reincidentes ? t('lib.sin.filtro') : t('lib.vacio')}
        </p>
      ) : (
        <div className="space-y-2">
          {portales.map((p) => (
            <Fila key={p.celda} p={p} onGuardar={guardar} onGeo={guardarGeo} t={t} />
          ))}
        </div>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-dark-600">{t('lib.pie')}</p>
    </div>
  )
}
