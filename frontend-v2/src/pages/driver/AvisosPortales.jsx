import { useEffect, useState } from 'react'
import { MapPin, ChevronDown, ChevronUp } from 'lucide-react'
import { useT } from '../../i18n'
import { getMisAvisosPortales } from '../../services/api'
import { lista } from '../../lib/lista'

/* ────────────────────────────────────────────────────────────────────────────
   Los avisos de portal de la ruta de HOY de este conductor.

   Esto es lo que convierte la Libreta de portales en dinero. Sin esta pantalla
   la libreta es un informe bonito que mira el gestor; con ella, el conductor se
   entera del código del portal ANTES de plantarse delante, en vez de
   descubrirlo fallando la entrega.

   Funciona porque en cuanto la furgoneta carga, los paquetes ya traen driver_id
   y coordenadas: se sabe a qué portales va antes de que salga de la estación.

   Si no hay avisos no se pinta NADA. Un bloque vacío que dice "no hay avisos"
   todos los días entrena al conductor a ignorar esta zona de la pantalla, y el
   día que sí haya algo tampoco lo leerá.
   ──────────────────────────────────────────────────────────────────────────── */

export default function AvisosPortales() {
  const { t } = useT()
  const [avisos, setAvisos] = useState([])
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    let vivo = true
    getMisAvisosPortales()
      .then((r) => { if (vivo) setAvisos(lista(r.data?.avisos)) })
      .catch(() => { /* sin avisos no se molesta al conductor con un error */ })
    return () => { vivo = false }
  }, [])

  if (!avisos.length) return null

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-amber-500/25 bg-amber-500/[0.06]">
      <button onClick={() => setAbierto((a) => !a)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        <MapPin size={16} className="shrink-0 text-amber-400" />
        <span className="flex-1 text-[13px] font-semibold text-amber-200">
          {avisos.length === 1
            ? t('av.uno')
            : t('av.varios').replace('{n}', avisos.length)}
        </span>
        {abierto ? <ChevronUp size={15} className="text-amber-400/70" />
          : <ChevronDown size={15} className="text-amber-400/70" />}
      </button>

      {abierto && (
        <div className="space-y-2 px-4 pb-3">
          {avisos.map((a, i) => (
            <div key={i} className="rounded-xl bg-dark-950/40 p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-amber-400/80">
                {a.stop && <span>{t('av.parada')} {a.stop}</span>}
                <span className="text-dark-600">
                  {t('av.paquetes').replace('{n}', a.paquetes)}
                </span>
              </div>
              {a.nota && <p className="text-[13px] leading-relaxed text-dark-100">{a.nota}</p>}
              {/* La dirección del mapa va SIEMPRE con su precisión: el conductor
                  tiene que poder ver que es "la calle" y no "el portal exacto",
                  o se plantará delante del número equivocado confiado. */}
              {a.direccion && (
                <p className={`text-[12px] leading-relaxed text-dark-300 ${a.nota ? 'mt-1' : ''}`}>
                  {a.direccion}
                  {a.precision && a.precision !== 'portal' && (
                    <span className="ml-1 text-[10px] text-amber-400/70">({t(`lib.geo.p.${a.precision}`)})</span>
                  )}
                </p>
              )}
              {/* ── DÓNDE ESTÁ DE VERDAD ────────────────────────────────────
                  Sólo llega aquí lo que confirmaron dos fuentes independientes
                  entre sí; lo dudoso se queda en el panel del gestor. Lo que el
                  conductor necesita en la calle no es la dirección, que ya la
                  tiene: es CUÁNTO se ha desplazado respecto al punto al que le
                  manda la app, y un enlace para ir al bueno. */}
              {a.real && (
                <div className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] p-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/80">
                    {t('av.real.tit')}
                  </p>
                  <p className="text-[12.5px] leading-relaxed text-dark-100">{a.real.display}</p>
                  {a.real.metros != null && (
                    <p className="text-[11px] font-semibold text-emerald-300">
                      {t('av.real.dist').replace('{m}', a.real.metros)}
                    </p>
                  )}
                  {a.real.precision_acuerdo === 'zona' ? (
                    <p className="text-[10px] text-amber-400/70">{t('lib.dir.solozona')}</p>
                  ) : a.real.precision_acuerdo !== 'portal' ? (
                    <p className="text-[10px] text-amber-400/70">{t('lib.dir.solocalle')}</p>
                  ) : null}
                  <a href={`https://www.google.com/maps?q=${a.real.lat},${a.real.lng}`}
                    target="_blank" rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                    <MapPin size={11} /> {t('av.real.ir')}
                  </a>
                </div>
              )}
              <a href={`https://www.google.com/maps?q=${a.lat},${a.lng}`}
                target="_blank" rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-300">
                <MapPin size={11} /> {t('av.ver.mapa')}
              </a>
            </div>
          ))}
          <p className="pt-1 text-[10px] leading-relaxed text-dark-600">{t('av.pie')}</p>
        </div>
      )}
    </div>
  )
}
