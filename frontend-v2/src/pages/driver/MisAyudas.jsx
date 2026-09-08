import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2, LifeBuoy, HeartHandshake, Users } from 'lucide-react'
import { getMisAyudas } from '../../services/api'

/* AYUDAS DE ESTE MES — las veces que ha sacado de un apuro a un compañero.
   ═══════════════════════════════════════════════════════════════════════
   Es el único número del portal que no se puede mejorar escondiendo un
   problema: para que suba hay que ir y entregar el paquete.

   EL NÚMERO SALE DE CORTEX, no de lo que alguien apunte. Antes se contaba
   sobre `apoyos` —lo que la oficina registra a mano al pasar paradas por
   WhatsApp— y por eso a gente que ayuda a diario le salía un CERO: en
   septiembre de 2026 había 18 apuntes en toda la empresa mientras Cortex
   enseñaba 30 de 48 rutas con más de un transportista solo el día 7. Ahora se
   cuentan los paquetes de una ruta cuyo titular es otro que ha cargado él, que
   es lo que Cortex responde y además cuadra con su pantalla.

   Y se cuenta lo CARGADO, no lo entregado. Christian Gallego llevaba el
   08-09-2026 cincuenta y un paquetes de la ruta de Miguel Oscar Rojas —48
   recogidos, 2 entregados— y la pantalla le decía cero: se contaban entregas y
   a media mañana aún no las había. Esto se mira A MEDIA RUTA, no al acabar.
   Y se enseña también lo que a él le ayudaron, para que echar una mano no
   acabe pareciendo la lista de los tontos. */

const FECHA = (iso) => {
  const [y, m, d] = String(iso || '').split('-').map(Number)
  if (!y) return ''
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })
}
const INICIALES = (n) => String(n || '').trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase()

export default function MisAyudas({ onBack }) {
  const [datos, setDatos] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    getMisAyudas()
      .then((r) => setDatos(r.data))
      .catch((e) => setErr(e?.response?.data?.detail || 'No se han podido cargar tus ayudas'))
  }, [])

  const g = datos?.gracias || []
  const pendientesDeMarcar = datos ? datos.asignadas - datos.hechas : 0

  return (
    <div className="min-h-screen bg-dark-950 text-dark-100">
      <div className="mx-auto max-w-lg space-y-4 p-4 pb-16">

        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-xl border border-dark-700 p-2 text-dark-400 active:bg-dark-800" aria-label="Volver">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-display text-[22px] font-bold tracking-[-.02em]">Ayudas de este mes</h1>
            <p className="text-[12.5px] text-dark-400">Las paradas que le has quitado a un compañero</p>
          </div>
        </div>

        {!datos && !err && <div className="py-16 text-center"><Loader2 className="mx-auto animate-spin text-brand-400" size={28} /></div>}
        {err && <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13.5px] text-red-300">{err}</p>}

        {datos && (
          <>
            <div className="rounded-2xl border border-dark-700/60 bg-dark-900/70 px-4 py-6 text-center">
              <LifeBuoy size={22} className="mx-auto mb-2 text-brand-400" />
              <div className="cifra text-[58px] font-extrabold leading-none text-brand-400">{datos.paquetes ?? datos.hechas}</div>
              <p className="mt-1.5 text-[15px] font-bold">
                {(datos.paquetes ?? datos.hechas) === 1 ? 'paquete salvado' : 'paquetes salvados'} este mes
              </p>
              <p className="mt-1 text-[12.5px] text-dark-400">
                {datos.veces === 0
                  ? 'Este mes no has entrado en la ruta de nadie'
                  : <>en {datos.veces} {datos.veces === 1 ? 'salida' : 'salidas'} a rutas de otros</>}
              </p>
              {/* CUENTA LO QUE TE ECHAS A LA FURGONETA, no lo que ya llegó:
                  quien mira esto lo mira a media ruta. Si aún te quedan por
                  entregar se dice, para que el número grande no parezca que
                  cuenta entregas. */}
              {datos.veces > 0 && datos.entregados < datos.paquetes && (
                <p className="mt-1 text-[11.5px] text-dark-500">
                  {datos.entregados} entregados · {datos.paquetes - datos.entregados} aún en la furgoneta
                </p>
              )}
            </div>

            {/* UN CERO NO ES UNA NOTA, y por eso se dice de dónde sale el
                número. Esto ya no depende de que nadie lo apunte: se cuenta
                de Cortex —paquetes de una ruta cuyo titular es otro que has
                cargado tú—, así que un cero aquí sí significa algo. */}
            {datos.veces === 0 && (
              <div className="rounded-2xl border border-dark-700/60 bg-dark-900/70 px-4 py-3.5 text-[12.5px] leading-relaxed text-dark-400">
                Cuentan los paquetes que cargas de la ruta de otro, y sale de Cortex:
                no hace falta que nadie lo apunte, y se ven en cuanto los recoges
                {datos.equipo_veces > 0 && <> — este mes ha habido <b className="text-dark-200">{datos.equipo_veces}</b> salidas así en la empresa</>}.
              </div>
            )}

            {pendientesDeMarcar > 0 && (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3.5 text-[12.5px] leading-relaxed text-amber-200/90">
                Tienes {pendientesDeMarcar} {pendientesDeMarcar === 1 ? 'parada' : 'paradas'} sin marcar en el enlace que
                te llegó por WhatsApp. Márcalas al hacerlas: así la oficina sabe cómo vas
                sin tener que llamarte. Lo de arriba lo cuenta Cortex solo.
              </div>
            )}

            {g.length > 0 && (
              <div className="rounded-2xl border border-dark-700/60 bg-dark-900/70 p-4">
                <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[.16em] text-dark-500">
                  Quién te lo debe
                </div>
                <div className="flex flex-col">
                  {g.map((x, i) => (
                    <div key={`${x.dia}-${i}`} className={`flex items-center gap-3 py-2.5 ${i ? 'border-t border-dark-800/80' : ''}`}>
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[12px] font-bold text-dark-950">
                        {INICIALES(x.nombre)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold">{x.nombre}</div>
                        <div className="text-[11px] capitalize text-dark-500">
                          {FECHA(x.dia)}{x.ruta ? ` · ${x.ruta}` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <b className="cifra text-[15px] font-bold">{x.paquetes ?? x.hechas}</b>
                        <span className="block text-[9.5px] uppercase tracking-wider text-dark-500">
                          {x.entregados != null && x.entregados < x.paquetes
                            ? `${x.entregados} entregados`
                            : ((x.paquetes ?? x.hechas) === 1 ? 'paquete' : 'paquetes')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {datos.me_ayudaron?.veces > 0 && (
              <div className="rounded-2xl border border-dark-700/60 bg-dark-900/70 px-4 py-3.5">
                <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.16em] text-dark-500">
                  <HeartHandshake size={12} /> Y a ti
                </div>
                <p className="text-[13px] text-dark-300">
                  Te echaron una mano <b className="text-dark-50">{datos.me_ayudaron.veces}</b> {datos.me_ayudaron.veces === 1 ? 'vez' : 'veces'}
                  {datos.me_ayudaron.paquetes > 0 && <>, <b className="cifra text-dark-50">{datos.me_ayudaron.paquetes}</b> paquetes</>}
                  {datos.me_ayudaron.quien?.length > 0 && <>: {datos.me_ayudaron.quien.map((q) => q.nombre.split(' ')[0]).join(', ')}</>}.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-dark-700/60 bg-dark-900/70 px-4 py-3.5">
              <div>
                <div className="mb-0.5 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.16em] text-dark-500">
                  <Users size={12} /> Entre todos{datos.centro ? `, en ${datos.centro}` : ''}
                </div>
                <span className="cifra text-[26px] font-bold leading-none">{datos.equipo}</span>
                <span className="ml-1.5 text-[13px] text-dark-400">paradas rescatadas</span>
              </div>
            </div>

            <p className="px-1 text-[11.5px] leading-relaxed text-dark-600">
              Cuentan los paquetes que constan entregados en Cortex, más los que marcas tú a mano. Los apoyos anulados no cuentan.
              Para que este número suba hay que ir y entregarlas.
            </p>
          </>
        )}

      </div>
    </div>
  )
}
