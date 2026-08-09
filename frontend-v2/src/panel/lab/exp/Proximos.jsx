/* ─────────────────────────────────────────────────────────────────────────────
   PRÓXIMOS CAMBIOS — el mantenimiento de toda la flota en una cola de trabajo
   ---------------------------------------------------------------------------
   LO QUE YA EXISTE Y NO SE DUPLICA
   `get_maintenance_info` (server.py:13247) ya calcula, POR VEHÍCULO, los km/día
   reales del histórico de los últimos 60 días y con eso estima los días que
   faltan para cada cambio. Y exige un mínimo de 2 registros separados 7+ días
   "para no extrapolar ruido" — o sea, la defensa contra el falso positivo ya
   está puesta donde toca. `register_maintenance_change` ya admite aceite,
   ruedas y pastillas con su intervalo y su aviso.

   LO QUE FALTA, Y ES ESTO
   Una vista de FLOTA. Hoy el dato existe pero hay que entrar furgoneta por
   furgoneta: con 81, nadie lo hace. Así que nadie planifica el taller y los
   cambios se hacen tarde o por sorpresa.

   TRES REGLAS PARA QUE ESTO NO MIENTA

   1. Sólo salen los CERCANOS. Una lista con los 81 × 3 mantenimientos es un
      listado, no una cola de trabajo. Por defecto, lo que entra en los
      próximos 30 días o ya está pasado.

   2. Sin ritmo medido NO hay fecha. Si una furgoneta no tiene histórico
      suficiente, se dice "faltan X km" y punto — nunca se inventa un día. Van
      en su propio grupo, porque son las que necesitan que alguien apunte el
      cuentakilómetros.

   3. El km de la ficha manda, y puede estar viejo. Si el último registro es de
      hace semanas, el vehículo ya ha rodado más de lo que dice la cuenta. Se
      avisa con la antigüedad del dato al lado.

   AGRUPADO POR TALLER, no por furgoneta: si tres van a ruedas la misma semana,
   es una sola llamada y una sola entrada al taller.

   Datos: LAB/SIMULATED.
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react'
import { Wrench, CircleDot, Droplet, Disc, AlertTriangle, Check } from 'lucide-react'
import { vehiculos, HOY } from '../app2/datosPlus'

/* Los tipos son los que ya admite el backend. Los intervalos, los suyos. */
const TIPOS = [
  { kind: 'aceite', label: 'Aceite', ic: Droplet, intervalo: 15000, aviso: 2500 },
  { kind: 'pastillas', label: 'Pastillas de freno', ic: Disc, intervalo: 45000, aviso: 5000 },
  { kind: 'ruedas', label: 'Ruedas', ic: CircleDot, intervalo: 60000, aviso: 7000 },
]
const DIAS_HORIZONTE = 30
const km = (n) => `${Math.round(n).toLocaleString('es-ES')} km`

/* Ritmo real por vehículo. Sintético aquí, pero con la misma regla que el
   backend: sin histórico suficiente devuelve null y no se estima nada. */
function ritmoDe(v, i) {
  if (i % 7 === 3) return null                 // sin histórico suficiente
  return 38 + ((i * 13) % 42)                  // km/día
}
/* Antigüedad del último apunte de kilómetros: si es viejo, la cuenta va corta */
const antiguedadKm = (i) => (i % 5 === 0 ? 21 : i % 3 === 0 ? 9 : 2)

function calcular() {
  const filas = []
  vehiculos.forEach((v, i) => {
    const ritmo = ritmoDe(v, i)
    const kmViejo = antiguedadKm(i)
    TIPOS.forEach((t, j) => {
      /* Km del último cambio: el aceite lo trae la ficha; los otros se simulan
         con la misma forma que tendría el campo `${kind}_last_change_km`. */
      const ultimo = t.kind === 'aceite'
        ? v.oil_last_change_km
        : v.mileage - ((i * 3200 + j * 9100) % t.intervalo)
      const recorrido = v.mileage - ultimo
      const restanKm = t.intervalo - recorrido
      const dias = ritmo ? Math.round(restanKm / ritmo) : null
      filas.push({
        id: `${v.id}-${t.kind}`,
        matricula: v.license_plate, modelo: `${v.brand} ${v.model}`,
        centro: v.center, vehiculo: v.id,
        tipo: t, restanKm, dias, ritmo, kmViejo,
        pasado: restanKm <= 0,
        /* Sólo entra si está cerca. Con ritmo, por días; sin ritmo, por km. */
        cerca: ritmo ? dias <= DIAS_HORIZONTE : restanKm <= t.aviso,
      })
    })
  })
  return filas.filter((f) => f.cerca)
    .sort((a, b) => (a.dias ?? 9999) - (b.dias ?? 9999) || a.restanKm - b.restanKm)
}

export default function Proximos({ center }) {
  const [hechos, setHechos] = useState({})
  const [agrupar, setAgrupar] = useState('taller')

  const filas = useMemo(() => calcular()
    .filter((f) => !center || center === 'Todos' || f.centro === center), [center])

  const conRitmo = filas.filter((f) => f.dias !== null)
  const sinRitmo = filas.filter((f) => f.dias === null)
  const pasados = filas.filter((f) => f.pasado)

  /* Agrupado por tipo: una entrada al taller para varias furgonetas */
  const porTipo = TIPOS.map((t) => ({
    ...t, filas: conRitmo.filter((f) => f.tipo.kind === t.kind),
  })).filter((g) => g.filas.length)

  return (
    <div className="animate-fade-in">
      <header className="rise pb-5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-dark-500">
          Próximos cambios{center && center !== 'Todos' ? ` · ${center}` : ''}
        </p>
        <h1 className="mt-2 font-display text-[clamp(23px,3.2vw,32px)] font-semibold leading-[1.12] tracking-[-0.03em] text-dark-50">
          {pasados.length > 0
            ? <><span className="text-red-400">{pasados.length}</span> ya pasados y {conRitmo.length - pasados.length} en los próximos {DIAS_HORIZONTE} días</>
            : <>{conRitmo.length} cambios en los próximos {DIAS_HORIZONTE} días</>}
        </h1>
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-dark-400">
          Los días salen del <b className="font-semibold text-dark-200">ritmo real de cada furgoneta</b>, no de una
          media. No están las 81: sólo lo que toca pronto, agrupado por tipo para que sea
          <b className="font-semibold text-dark-200"> una llamada al taller y no seis</b>.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {[['taller', 'Agrupado por taller'], ['fecha', 'Por urgencia']].map(([id, txt]) => (
          <button key={id} onClick={() => setAgrupar(id)}
            className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
              agrupar === id ? 'bg-white/[0.1] text-dark-50' : 'text-dark-500 hover:bg-white/[0.04] hover:text-dark-300'}`}>
            {txt}
          </button>
        ))}
      </div>

      {agrupar === 'taller' ? porTipo.map((g) => {
        const I = g.ic
        return (
          <section key={g.kind} className="mb-7">
            <div className="mb-2 flex items-center gap-2">
              <I size={14} className="text-brand-400" />
              <h2 className="text-[15px] font-semibold text-dark-100">{g.label}</h2>
              <span className="text-[12px] text-dark-600">
                {g.filas.length} {g.filas.length === 1 ? 'furgoneta' : 'furgonetas'}
                {g.filas.length > 1 && ' · una sola entrada al taller'}
              </span>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {g.filas.map((f) => <Fila key={f.id} f={f} hechos={hechos} setHechos={setHechos} />)}
            </div>
          </section>
        )
      }) : (
        <div className="divide-y divide-white/[0.05]">
          {conRitmo.map((f) => <Fila key={f.id} f={f} hechos={hechos} setHechos={setHechos} conTipo />)}
        </div>
      )}

      {/* ── Las que no se pueden estimar. Su propio sitio, sin fecha inventada ── */}
      {sinRitmo.length > 0 && (
        <section className="mt-8 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-400" />
            <h2 className="text-[14.5px] font-semibold text-amber-200">
              {sinRitmo.length} sin fecha: no hay kilómetros suficientes para estimarla
            </h2>
          </div>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-amber-200/70">
            Hacen falta al menos dos apuntes de cuentakilómetros separados una semana. Sin eso se sabe cuántos km
            faltan, pero no cuándo — y poner una fecha a ojo sería inventarla.
          </p>
          <div className="mt-3 divide-y divide-white/[0.06]">
            {sinRitmo.map((f) => (
              <div key={f.id} className="flex flex-wrap items-baseline gap-3 py-2.5">
                <span className="text-[13.5px] font-semibold text-dark-100">{f.matricula}</span>
                <span className="text-[12px] text-dark-500">{f.tipo.label}</span>
                <span className="ml-auto text-[13px] font-semibold tabular-nums text-amber-200">
                  {f.restanKm <= 0 ? `pasado en ${km(Math.abs(f.restanKm))}` : `faltan ${km(f.restanKm)}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-6 text-[12px] leading-relaxed text-dark-600">
        El cálculo parte del kilometraje de la ficha, que se actualiza con la foto del cuentakilómetros. Si ese
        apunte es viejo, la furgoneta ya ha rodado más de lo que dice esta cuenta: por eso cada fila lleva
        <b className="text-dark-500"> cuándo se apuntó por última vez</b>.
      </p>
    </div>
  )
}

function Fila({ f, hechos, setHechos, conTipo }) {
  const hecho = hechos[f.id]
  const I = f.tipo.ic
  const urgente = f.pasado || (f.dias !== null && f.dias <= 7)
  return (
    <div className="float-row -mx-3 flex flex-wrap items-center gap-3 rounded-xl px-3 py-3">
      <div className="min-w-0 flex-[1.3]">
        <div className="flex flex-wrap items-center gap-2">
          {conTipo && <I size={12.5} className="text-dark-600" />}
          <span className="text-[14px] font-semibold text-dark-50">{f.matricula}</span>
          {conTipo && <span className="text-[12px] text-dark-500">{f.tipo.label}</span>}
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-dark-600">
          {f.modelo} · km apuntados hace {f.kmViejo} días
          {f.kmViejo > 14 && <span className="text-amber-400/80"> · la cuenta va corta</span>}
        </div>
      </div>

      <div className="w-[104px] shrink-0 text-right">
        <div className={`text-[14px] font-semibold tabular-nums ${urgente ? 'text-red-400' : 'text-dark-100'}`}>
          {f.pasado ? 'pasado' : `${f.dias} días`}
        </div>
        <div className="text-[10.5px] text-dark-600">
          {f.pasado ? `en ${km(Math.abs(f.restanKm))}` : km(f.restanKm)}
        </div>
      </div>

      <div className="hidden w-[86px] shrink-0 text-right text-[11px] text-dark-600 sm:block">
        {f.ritmo} km/día
      </div>

      <button onClick={() => setHechos({ ...hechos, [f.id]: !hecho })}
        title="Prototipo: no escribe en ninguna base"
        className={`shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
          hecho ? 'bg-emerald-500/20 text-emerald-300' : 'border border-dark-700 text-dark-200 hover:bg-white/[0.05]'}`}>
        {hecho ? <><Check size={12} className="mr-1 inline align-[-1px]" />Registrado</> : <><Wrench size={12} className="mr-1 inline align-[-1px]" />Registrar cambio</>}
      </button>
    </div>
  )
}
