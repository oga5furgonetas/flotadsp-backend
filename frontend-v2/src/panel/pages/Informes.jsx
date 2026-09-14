import { lazy, Suspense, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, PackageX, Timer, CheckCircle2 } from 'lucide-react'
import { useT } from '../../i18n'
import { canSee } from '../auth'

/* ── INFORMES DE AMAZON — dos pantallas bajo una sola entrada ────────────────
   ═══════════════════════════════════════════════════════════════════════════
   El menú tenía «DNR · Diarios» y «Horas · WHC» como dos entradas sueltas, y
   son la misma cosa vista de dos maneras: las dos salen del MISMO documento
   del portal —el informe semanal de la nave— y desde el 14-09-2026 las dos
   entran solas, sin que nadie pegue nada. Tenerlas separadas obligaba a saber
   de antemano en cuál está lo que buscas.

   POR QUÉ CON PESTAÑAS Y NO UNA PANTALLA CON TODO. Son dos preguntas
   distintas: «¿cuántos paquetes no llegaron?» y «¿alguien se está pasando de
   horas?». Juntarlas en una sola vista sería más ruido, no menos — que es lo
   contrario de lo que se busca. La pestaña te lleva a la que preguntas.

   LA PESTAÑA VIVE EN LA URL (`?t=whc`). Así se puede enlazar, se puede volver
   con el botón de atrás, y recargar no te devuelve a la primera. Una pestaña
   que solo existe en memoria pierde el sitio en cuanto alguien refresca.

   Y CADA UNA CON SU PERMISO. `diarios` y `whc` siguen siendo dos permisos
   distintos en Usuarios, así que quien solo tenga uno ve solo su pestaña — y
   ni siquiera ve la otra existir. Si se hubiera fundido en un permiso único,
   dar acceso a las horas habría dado acceso a los DNR de rebote (gotcha 27). */

/* Las dos pantallas siguen siendo dos ficheros: aquí no se copia ni una línea
   de ellas. Y van en `lazy` para que abrir Informes no cargue las dos —la de
   diarios es de las más pesadas del panel. */
const Diarios = lazy(() => import('./Diarios'))
const WHC = lazy(() => import('./WHC'))

const PESTANAS = [
  { id: 'dnr', permiso: 'diarios', icono: PackageX, titulo: 'DNR y diarios',
    pie: 'Lo que no llegó, y por qué' },
  { id: 'whc', permiso: 'whc', icono: Timer, titulo: 'Horas · WHC',
    pie: 'Quién se acerca al límite' },
]

export default function Informes() {

  const { t } = useT()
  const [params, setParams] = useSearchParams()

  const visibles = PESTANAS.filter((p) => canSee(p.permiso))
  const pedida = params.get('t')
  const activa = visibles.find((p) => p.id === pedida) || visibles[0]

  /* Si llega una pestaña que no existe —un enlace viejo, un permiso que se
     quitó— se corrige la URL en vez de dejarla mintiendo. `replace` para no
     ensuciar el historial con el paso intermedio. */
  useEffect(() => {
    if (activa && pedida !== activa.id) {
      const p = new URLSearchParams(params)
      p.set('t', activa.id)
      setParams(p, { replace: true })
    }
  }, [activa, pedida, params, setParams])

  if (!activa) {
    return (
      <p className="card p-6 text-[13px] text-dark-400">
        No tienes acceso a ninguno de estos informes.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[19px] font-bold text-dark-50">{t('nav.informes')}</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 max-w-[86ch] text-[13px] text-dark-400">
          Los dos salen del informe semanal de la nave.
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <CheckCircle2 size={12} /> Entran solos
          </span>
          — ya no hay que pegar nada.
        </p>
      </div>

      {/* Las pestañas. Solo se pintan si hay más de una: con una sola, una
          pestaña que no lleva a ningún sitio es justo el ruido que sobra. */}
      {visibles.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {visibles.map((p) => {
            const Icono = p.icono
            const on = p.id === activa.id
            return (
              <button
                key={p.id}
                role="tab"
                aria-selected={on}
                onClick={() => setParams({ t: p.id })}
                className={`group flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left transition ${
                  on
                    ? 'border-brand-500/40 bg-brand-500/10'
                    : 'border-dark-800 hover:border-dark-600'}`}
              >
                <Icono size={16} className={on ? 'text-brand-300' : 'text-dark-500'} />
                <span className="leading-tight">
                  <span className={`block text-[13px] font-semibold ${on ? 'text-brand-100' : 'text-dark-200'}`}>
                    {p.titulo}
                  </span>
                  <span className="block text-[11.5px] text-dark-500">{p.pie}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* NO HACE FALTA PASARLES NADA. Las dos leen el centro con
          `useOutletContext`, y el proveedor lo pone el `<Outlet>` del panel:
          como esta pantalla se pinta DENTRO de él, ellas siguen siendo
          descendientes y lo ven igual que cuando eran rutas sueltas. */}
      <Suspense fallback={(
        <div className="flex items-center gap-2 py-10 text-[13px] text-dark-400">
          <Loader2 size={15} className="animate-spin" /> Cargando…
        </div>
      )}>
        {activa.id === 'dnr' ? <Diarios /> : <WHC />}
      </Suspense>
    </div>
  )
}
