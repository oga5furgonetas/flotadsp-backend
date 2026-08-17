import { useEffect, useState } from 'react'
import { ClipboardCheck, CalendarDays, CalendarClock, LogOut, Lock, Ban } from 'lucide-react'
import { getPortalVehicles, getMyShifts, DRIVER_TOKEN_KEY } from '../../services/api'
import { lista } from '../../lib/lista'
import DriverLogin from './DriverLogin'
import InspectionFlow from './InspectionFlow'
import InspectionDone from './InspectionDone'
import MisTurnos from './MisTurnos'
import MiClave from './MiClave'
import PedirDias from './PedirDias'

const DRIVER_KEY = 'flotadsp_driver'

/* ────────────────────────────────────────────────────────────────────────────
   PORTAL DEL CONDUCTOR
   ---------------------------------------------------------------------------
   Antes esto no existía: al entrar caías directamente en la auditoría, y para
   ver el cuadrante había un botón escondido dentro. Pedir días no se podía
   hacer desde ningún sitio, así que se pedía hablando — y de ahí venían los
   "a mí me dijeron que sí" que nadie podía comprobar.

   La auditoría sigue siendo lo primero y lo más gordo, porque es lo que se
   hace todos los días antes de salir. Lo demás está debajo, a un toque.
   ──────────────────────────────────────────────────────────────────────────── */

function Opcion({ icono: Icono, titulo, sub, onClick, principal, bloqueado, pronto, aviso }) {
  const off = bloqueado || pronto
  return (
    <button
      onClick={off ? undefined : onClick}
      disabled={off}
      className={`relative w-full rounded-2xl border p-4 text-left transition-all ${
        off
          ? 'cursor-not-allowed border-dark-800 bg-dark-900/40 opacity-60'
          : principal
            ? 'border-brand-400/60 bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-900/30 active:scale-[.99]'
            : 'border-dark-700 bg-dark-900 active:scale-[.99]'
      }`}
    >
      {/* "Pronto" en vez de esconderlo: si la opción no está, la gente pregunta
          si existe; si está y dice cuándo, no pregunta nadie. */}
      {pronto && (
        <span className="absolute right-3 top-3 rounded-full border border-dark-600 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-dark-400">
          Pronto
        </span>
      )}
      {/* Respuestas sin leer. El aviso al móvil puede no llegar nunca —avisos
          desactivados, iOS, el móvil apagado—, así que la señal que de verdad
          se ve es esta, dentro de la app. */}
      {aviso > 0 && (
        <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
          {aviso}
        </span>
      )}
      <Icono size={22} className={principal && !off ? 'text-white' : 'text-dark-300'} />
      <span className={`mt-2 block text-[16px] font-bold tracking-[-.01em] ${
        principal && !off ? 'text-white' : 'text-dark-100'}`}>
        {titulo}
      </span>
      <span className={`mt-0.5 block text-[12.5px] leading-snug ${
        principal && !off ? 'text-white/80' : 'text-dark-500'}`}>
        {sub}
      </span>
    </button>
  )
}

export default function DriverPortal() {
  const [driver, setDriver] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(DRIVER_KEY)) || null
    } catch {
      return null
    }
  })
  const [portal, setPortal] = useState(null)   // {vehicles, puede_auditar, motivo}
  const [result, setResult] = useState(null)
  const [sinVer, setSinVer] = useState(0)      // respuestas que aún no ha leído
  const [vista, setVista] = useState('inicio') // inicio | auditoria | dias | turnos | clave

  useEffect(() => {
    if (!driver) return
    getPortalVehicles()
      .then((r) => {
        const d = r.data
        // La respuesta pasó de lista a objeto (hacía falta poder decir "hoy no
        // te toca" aparte de "no hay furgonetas"). Se aceptan las dos formas
        // por si queda algún cliente viejo abierto.
        setPortal(Array.isArray(d)
          ? { vehicles: d, puede_auditar: true, motivo: null }
          : { vehicles: lista(d?.vehicles), puede_auditar: d?.puede_auditar !== false, motivo: d?.motivo || null })
      })
      .catch(() => setPortal({ vehicles: [], puede_auditar: true, motivo: null }))
  }, [driver])

  // Cuántas respuestas tiene sin leer. Se recarga al volver al inicio para que
  // el aviso desaparezca en cuanto las lee, sin tener que refrescar la página.
  useEffect(() => {
    if (!driver || vista !== 'inicio') return
    getMyShifts()
      .then((r) => setSinVer(lista(r.data?.sin_ver).length))
      .catch(() => setSinVer(0))
  }, [driver, vista])

  const login = (d) => {
    localStorage.setItem(DRIVER_KEY, JSON.stringify(d))
    setDriver(d)
  }
  const logout = () => {
    localStorage.removeItem(DRIVER_KEY)
    localStorage.removeItem(DRIVER_TOKEN_KEY)
    setDriver(null)
    setResult(null)
    setVista('inicio')
  }

  if (!driver) return <DriverLogin onLogin={login} />
  if (vista === 'dias') return <PedirDias onBack={() => setVista('inicio')} />
  if (vista === 'turnos') return <MisTurnos onBack={() => setVista('inicio')} />
  if (vista === 'clave') return <MiClave onBack={() => setVista('inicio')} />
  if (result) {
    return <InspectionDone result={result} onNew={() => { setResult(null); setVista('inicio') }} onLogout={logout} />
  }
  if (vista === 'auditoria') {
    return (
      <InspectionFlow driver={driver} vehicles={portal?.vehicles || []}
        onComplete={setResult} onLogout={logout} onShifts={() => setVista('turnos')}
        onBack={() => setVista('inicio')} />
    )
  }

  const noLeToca = portal && portal.puede_auditar === false
  const hoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="min-h-screen bg-dark-950 px-4 py-6">
      <div className="mx-auto max-w-md">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[24px] font-bold leading-tight tracking-[-.02em] text-dark-50">
              Hola, {String(driver?.name || '').split(' ')[0] || 'buenas'}
            </h1>
            <p className="mt-0.5 text-[12.5px] capitalize text-dark-500">{hoy}</p>
          </div>
          <button onClick={logout} className="shrink-0 rounded-lg border border-dark-700 p-2 text-dark-500"
            aria-label="Salir">
            <LogOut size={15} />
          </button>
        </header>

        <div className="flex flex-col gap-2.5">
          <Opcion
            icono={ClipboardCheck}
            titulo="Hacer la auditoría"
            sub={noLeToca ? 'Hoy no sales a ruta' : 'Antes de salir a ruta'}
            principal
            bloqueado={noLeToca}
            onClick={() => setVista('auditoria')}
          />

          {/* Decirle POR QUÉ no puede. Un botón gris sin explicación acaba en
              una llamada a la oficina, que es lo que se quiere evitar. */}
          {noLeToca && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-3">
              <Ban size={15} className="mt-0.5 shrink-0 text-amber-400" />
              <p className="text-[12.5px] leading-relaxed text-amber-200/90">
                En el cuadrante de hoy no tienes furgoneta asignada, así que no puedes hacer la
                auditoría. Si crees que es un error, habla con tu coordinador antes de salir.
              </p>
            </div>
          )}

          <Opcion
            icono={CalendarDays}
            titulo="Pedir días libres"
            sub={sinVer > 0
              ? `Tienes ${sinVer} respuesta${sinVer > 1 ? 's' : ''} sin leer`
              : 'Marca los días y di para qué'}
            aviso={sinVer}
            onClick={() => setVista('dias')}
          />
          {/* Se deja a la vista y apagado a propósito: el cuadrante todavía no
              se publica a los conductores, y una opción que no está genera más
              preguntas que una que dice cuándo llegará. */}
          <Opcion
            icono={CalendarClock}
            titulo="Mis turnos"
            sub="Aquí verás qué días trabajas"
            pronto
          />
          <Opcion
            icono={Lock}
            titulo="Cambiar mi contraseña"
            sub="Ponte la que quieras"
            onClick={() => setVista('clave')}
          />
        </div>
      </div>
    </div>
  )
}
