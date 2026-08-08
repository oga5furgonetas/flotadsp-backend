/* ─────────────────────────────────────────────────────────────────────────────
   LAB · EXPERIMENTO SOBRE UNA PANTALLA REAL — la portada
   ---------------------------------------------------------------------------
   Esto NO es una maqueta aparte: es la portada del panel, en su sitio, con el
   menu y el centro, y un interruptor para ver la de AHORA y la del EXPERIMENTO
   con los mismos datos. Sin poder comparar no hay forma de decidir si merece
   la pena llevarlo a la app real.

   "Actual" no es una imitacion: importa el componente Dashboard de produccion
   tal cual, sin tocarlo. Lo que ves en esa pestaña es literalmente la pantalla
   que hay hoy.

   Qué cambia el experimento, y por qué:

     AHORA    "4 vencimientos ITV" -> te lleva a una pantalla a buscar cuáles
     EXPERIM. "1002 LAB circula con la ITV caducada" + evidencia + acciones

   O sea: la portada deja de ser un indice de contadores y pasa a decir qué
   pasa, por qué lo sabemos y qué se puede hacer. La estructura editorial
   (saludo, secciones, columna derecha) se respeta a proposito: el objetivo es
   evaluar UN cambio, no rediseñarlo todo de golpe.
   ───────────────────────────────────────────────────────────────────────────── */
import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, RefreshCw, FlaskConical, CheckCircle2 } from 'lucide-react'
import DashboardReal from '../pages/Dashboard'
import { cargarDatosReales } from './apiLab'
import { generarSenales } from './motor'
import { Clase, PorQue, Acciones, Frescura } from './ui'

const saludo = () => {
  const h = new Date().getHours()
  return h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
}

export default function PortadaExp() {
  const ctx = useOutletContext?.() || {}
  const [modo, setModo] = useState('experimento')

  return (
    <div>
      {/* Barra del laboratorio. Fija arriba para que nunca se confunda con la app. */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-sky-500/25 bg-sky-500/[0.07] px-4 py-2.5">
        <FlaskConical size={15} className="shrink-0 text-sky-400" />
        <span className="text-[12.5px] font-bold uppercase tracking-wider text-sky-300">Experimento · portada</span>
        <span className="hidden text-[12.5px] text-sky-200/70 sm:inline">Mismos datos en las dos pestañas</span>
        <div className="ml-auto flex gap-1 rounded-lg bg-black/25 p-0.5">
          {[['actual', 'Como está hoy'], ['experimento', 'Experimento']].map(([id, txt]) => (
            <button
              key={id}
              onClick={() => setModo(id)}
              className={`rounded-md px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                modo === id ? 'bg-white/[0.12] text-dark-50' : 'text-dark-400 hover:text-dark-200'}`}
            >
              {txt}
            </button>
          ))}
        </div>
      </div>

      {/* La pantalla de produccion, importada sin modificar */}
      {modo === 'actual' ? <DashboardReal /> : <Experimento ctx={ctx} />}
    </div>
  )
}

function Experimento({ ctx }) {
  const { center, admin } = ctx
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)

  const cargar = () => {
    setCargando(true)
    cargarDatosReales(center).then(setDatos).finally(() => setCargando(false))
  }
  useEffect(cargar, [center])

  const senales = useMemo(() => (datos ? generarSenales(datos) : []), [datos])
  const urgentes = senales.filter((s) => s.prioridad >= 84)
  const resto = senales.filter((s) => s.prioridad < 84 && s.clase !== 'nodem')
  const nombre = (admin?.name || '').trim().split(/\s+/)[0] || ''
  const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  if (cargando) {
    return (
      <p className="flex items-center gap-2 py-16 text-[14px] text-dark-400">
        <Loader2 size={15} className="animate-spin" /> Leyendo la base del LAB…
      </p>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Mismo héroe editorial que la portada de hoy: se cambia el CONTENIDO,
          no el lenguaje visual. Así el experimento aísla una sola variable. */}
      <header className="rise pb-8 pt-1">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-dark-500">
          {fecha}{center && center !== 'Todos' ? ` · ${center}` : ''}
        </p>
        <h1 className="mt-2 font-display text-[clamp(30px,4.2vw,48px)] font-semibold leading-[1.05] tracking-[-0.03em] text-dark-50">
          {saludo()}{nombre ? `, ${nombre}` : ''}.
        </h1>
        <p className="mt-3 max-w-xl text-[16.5px] leading-relaxed text-dark-400">
          {urgentes.length > 0 ? (
            <>Hay <b className="font-semibold text-dark-50">{urgentes.length}</b> cosas que no pueden esperar.</>
          ) : (
            <>Nada urgente ahora mismo.</>
          )}{' '}
          {datos?.vehiculos?.length > 0 && (
            <>Flota de <b className="font-semibold text-dark-50">{datos.vehiculos.length}</b> vehículos.</>
          )}
        </p>
      </header>

      {/* Aviso de datos que faltan. En la portada de hoy no existe: un cero por
          falta de dato se ve igual que un cero por estar todo bien. */}
      {datos?.meta?.errores?.length > 0 && (
        <div className="mb-7 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3">
          <p className="text-[13px] leading-relaxed text-amber-200/90">
            <b className="font-semibold">Ojo:</b> {datos.meta.errores.join(' · ')}. Lo que no aparezca abajo puede
            ser por esto, no porque vaya bien.
          </p>
        </div>
      )}

      <div className="grid gap-x-14 lg:grid-cols-12">
        <div className="divide-y divide-white/[0.05] lg:col-span-7">
          <section className="rise py-7">
            <h2 className="flex items-baseline gap-2 text-[15px] font-semibold text-dark-100">
              <span className="text-red-400">●</span> Requieren atención
              <span className="text-[13px] font-normal tabular-nums text-dark-500">({urgentes.length})</span>
            </h2>

            {urgentes.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-[14px] text-emerald-400/90">
                <CheckCircle2 size={15} /> Nada urgente con los datos que hay.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {urgentes.map((s) => (
                  <article key={s.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Clase id={s.clase} />
                      <span className="ml-auto"><Frescura fuente={s.fuente} fuentes={datos.fuentes} /></span>
                    </div>
                    <h3 className="text-[15px] font-semibold leading-snug text-dark-50">{s.titulo}</h3>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-dark-400">{s.resumen}</p>
                    <Acciones acciones={s.acciones} />
                    <PorQue senal={s} fuentes={datos.fuentes} />
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rise py-7">
            <h2 className="text-[15px] font-semibold text-dark-100">Puede esperar</h2>
            <div className="mt-2 space-y-1">
              {resto.length === 0 ? (
                <p className="py-1 text-[14px] text-dark-500">Nada más.</p>
              ) : resto.map((s) => (
                <div key={s.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                  <span className="text-[14px] text-dark-200">{s.titulo}</span>
                  <Clase id={s.clase} mini />
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Columna derecha: donde hoy va el "pulso", aquí va la CONFIANZA.
            Es el cambio que más discutiría: ocupa un sitio caro de la pantalla.
            La alternativa es meterlo en cada señal y quitarlo de aquí. */}
        <div className="mt-8 lg:col-span-5 lg:mt-0 lg:border-l lg:border-white/[0.05] lg:pl-12">
          <section className="rise py-7">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-dark-500">
              De cuándo son estos datos
            </h2>
            <div className="mt-4 space-y-2.5">
              {Object.keys(datos?.fuentes || {}).map((k) => (
                <div key={k}><Frescura fuente={k} fuentes={datos.fuentes} /></div>
              ))}
            </div>
            <p className="mt-5 text-[12px] leading-relaxed text-dark-600">
              {datos?.meta?.peticiones} peticiones al backend del LAB · centro {datos?.meta?.centro}
            </p>
            <button
              onClick={cargar}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-semibold text-dark-400 transition-colors hover:bg-white/[0.06] hover:text-dark-100"
            >
              <RefreshCw size={12.5} /> Recargar
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
