/* ─────────────────────────────────────────────────────────────────────────────
   LAB · el laboratorio DENTRO del panel, con datos REALES del LAB
   ---------------------------------------------------------------------------
   Misma capa de señales que /lab, pero alimentada por el backend del
   laboratorio en vez de por fixtures. Vive en /panel/lab: hereda el menú, el
   selector de centro y la sesión.

   Todo lo que hace es LEER. Ni un POST que escriba, ni un borrado.

   Y hay una regla que se respeta aunque duela: si una fuente no trae datos,
   NO se rellena con los sintéticos. Se dice que está vacía. Mezclar reales y
   ficticios en la misma pantalla es la forma más rápida de que alguien tome
   una decisión sobre una furgoneta que no existe.
   ───────────────────────────────────────────────────────────────────────────── */
import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { FlaskConical, RefreshCw, Loader2 } from 'lucide-react'
import { cargarDatosReales } from './apiLab'
import { generarSenales } from './motor'
import Senales from './Senales'
import Vehiculo from './Vehiculo'
import Confianza from './Confianza'

const VISTAS = [
  { id: 'senales',   nombre: 'Señales' },
  { id: 'vehiculo',  nombre: 'Memoria del vehículo' },
  { id: 'confianza', nombre: 'Confianza' },
]

export default function PanelLab() {
  const { center } = useOutletContext?.() || {}
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [fallo, setFallo] = useState('')
  const [vista, setVista] = useState('senales')

  const cargar = () => {
    setCargando(true); setFallo('')
    cargarDatosReales(center)
      .then(setDatos)
      .catch((e) => setFallo(e?.message || 'No se pudieron cargar los datos del LAB'))
      .finally(() => setCargando(false))
  }
  useEffect(cargar, [center])

  const senales = datos ? generarSenales(datos) : []
  const meta = datos?.meta

  return (
    <div className="mx-auto max-w-5xl">
      <header className="rise pb-6 pt-3">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-500/25 bg-sky-500/[0.08] px-3 py-1">
          <FlaskConical size={13} className="text-sky-400" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
            Experimental · datos reales del LAB
          </span>
        </div>
        <h1 className="font-display text-[clamp(26px,3.6vw,40px)] font-semibold leading-[1.06] tracking-[-0.03em] text-dark-50">
          Capa de señales
        </h1>
        <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-dark-400">
          El mismo motor que en <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[13px]">/lab</code>, pero
          leyendo la base del laboratorio. Aquí se ve lo que las maquetas no pueden enseñar:
          <b className="font-semibold text-dark-200"> cuántas señales salen de verdad</b>.
        </p>
      </header>

      {/* Estado de la carga: peticiones y lo que NO se pudo traer. Un panel que
          calla lo que le falta acaba enseñando ceros con cara de buena noticia. */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        {cargando ? (
          <span className="flex items-center gap-2 text-[13px] text-dark-400">
            <Loader2 size={14} className="animate-spin" /> Leyendo el backend del LAB…
          </span>
        ) : (
          <>
            <span className="text-[13px] text-dark-300">
              <b className="font-semibold text-dark-50">{senales.length}</b> señales
              {' · '}{datos?.vehiculos?.length ?? 0} vehículos
              {' · '}{datos?.inspecciones?.length ?? 0} inspecciones
            </span>
            {meta && (
              <span className="text-[12px] text-dark-600">
                {meta.peticiones} peticiones · centro {meta.centro}
              </span>
            )}
            <button
              onClick={cargar}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-semibold text-dark-400 transition-colors hover:bg-white/[0.06] hover:text-dark-100"
            >
              <RefreshCw size={12.5} /> Recargar
            </button>
          </>
        )}
      </div>

      {fallo && (
        <p className="mb-6 rounded-xl border border-red-500/25 bg-red-500/[0.07] p-4 text-[14px] text-red-200">{fallo}</p>
      )}

      {/* Lo que falta, dicho en voz alta y antes de las señales */}
      {!cargando && meta?.errores?.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
          <h2 className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-amber-300">
            Lo que no se ha podido leer
          </h2>
          <ul className="mt-2 space-y-1.5">
            {meta.errores.map((e, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-amber-200/85">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-amber-400/60" />{e}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[12px] leading-relaxed text-amber-200/60">
            Estas señales no salen porque falta el dato, no porque todo vaya bien. No se rellena con datos
            sintéticos a propósito.
          </p>
        </div>
      )}

      {!cargando && datos && (
        <>
          <div className="mb-6 flex flex-wrap gap-1.5">
            {VISTAS.map((v) => (
              <button
                key={v.id}
                onClick={() => setVista(v.id)}
                className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
                  vista === v.id ? 'bg-white/[0.1] text-dark-50' : 'text-dark-500 hover:bg-white/[0.04] hover:text-dark-300'}`}
              >
                {v.nombre}
              </button>
            ))}
          </div>

          {vista === 'senales' && (
            senales.length === 0 ? (
              <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5 text-[14px] leading-relaxed text-emerald-200">
                Cero señales con los datos del LAB. Puede significar dos cosas muy distintas:
                que no hay nada fuera de lo normal, o que la base del laboratorio está casi vacía.
                Mira arriba el número de vehículos e inspecciones antes de sacar conclusiones.
              </p>
            ) : <Senales datos={datos} cabecera={false} />
          )}
          {vista === 'vehiculo'  && <Vehiculo datos={datos} cabecera={false} />}
          {vista === 'confianza' && <Confianza datos={datos} cabecera={false} />}
        </>
      )}
    </div>
  )
}
