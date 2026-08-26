import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, PackageX, AlertTriangle, EyeOff, Search,
  Check, X, ChevronRight, CalendarDays, Ban, UserCheck, Clock, Undo2,
  RotateCcw,
} from 'lucide-react'
import { getDebrief, marcarDebrief } from '../api'

/* EL CUADRE DEL DEBRIEF
   ═══════════════════════════════════════════════════════════════════════
   Para qué existe: "me tiene que dar 7, me da 6 y se va". Tres días después
   ese paquete sale MISSING y ya no hay a quién preguntar. Aquí se ve, con el
   conductor delante, exactamente qué trae en la furgoneta.

   LAS DOS REGLAS QUE HACEN QUE ESTO NO MIENTA
   ───────────────────────────────────────────
   1. Lo que NO se le puede reclamar va SEPARADO y en gris, nunca mezclado
      con lo que sí. Son cuatro cosas distintas y las cuatro se confundían
      antes de medirlas: lo que nunca salió de la nave, lo que canceló
      Amazon, lo que aplazó el cliente y lo que el cliente ya recogió él
      mismo. Reclamarle a alguien un paquete que se llevó el cliente es la
      forma más rápida de que deje de fiarse de la pantalla.

   2. Si la captura de Cortex se paró, la pantalla LO DICE ARRIBA y no
      finge que cuadra. Un cuadre hecho con media mañana de datos es peor
      que no tener cuadre: da tranquilidad falsa.

   Por eso la cabecera enseña el % de ciego antes que ningún número bueno. */

/* LOS NOMBRES SON LOS DE CORTEX, NO LOS MIOS.
   Quien usa esta pantalla lee la de Amazon todos los dias. Inventar
   sinonimos ("no entregado", "pendiente") obliga a traducir mentalmente cada
   linea y a dudar de si es lo mismo. El orden tambien es el de urgencia real:
   un "falta" es una llamada ahora, un "se puede volver a intentar" sale
   mañana solo. */
const T = {
  perdidos: {
    et: 'Falta', icono: Ban,
    cls: 'border-rose-400 bg-rose-100 text-rose-950',
    ayuda: 'Cortex dice que el paquete no aparece. Es lo único que hay que resolver hoy.',
  },
  no_entrega: {
    et: 'No se puede entregar', icono: PackageX,
    cls: 'border-orange-300 bg-orange-50 text-orange-900',
    ayuda: 'Vuelve a la nave. Dirección mala, cliente ausente o sitio inaccesible.',
  },
  no_recogido: {
    et: 'No se ha podido recoger', icono: Undo2,
    cls: 'border-violet-300 bg-violet-50 text-violet-900',
    ayuda: 'Era una recogida y no salió.',
  },
  reintento: {
    et: 'Se puede volver a intentar', icono: RotateCcw,
    cls: 'border-amber-300 bg-amber-50 text-amber-900',
    ayuda: 'Sale otra vez mañana. Solo hay que asegurarse de que vuelve a la nave.',
  },
}
/* El inventario va aparte y con otro peso visual: es "todo lo que deberia
   traer", no una lista de problemas. */
const INVENTARIO = {
  et: 'Todo lo que sigue en la furgoneta', icono: AlertTriangle,
  cls: 'border-slate-300 bg-slate-100 text-slate-700',
}

/* Los cajones que NO cuentan. Se enseñan para que se vea que se han tenido
   en cuenta —si no aparecen, alguien los echa en falta y desconfía— pero
   nunca suman al pendiente de nadie. */
const NO_CUENTAN = [
  ['cancelados', 'Cancelados por Amazon', 'No salen en su cuenta y sí en Cortex'],
  ['reprogramados', 'Aplazados por el cliente', 'Vuelven, pero no es fallo suyo'],
  ['cliente', 'Los recogió el cliente', 'No los lleva en la furgoneta'],
]

const fmtHora = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

const hoyISO = () => {
  const d = new Date()
  // A mano, no por toISOString: en UTC+2 la medianoche local cae en el día
  // anterior y el debrief se abriría en el día que no es (gotcha 11).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Kpi({ n, et, sub, tono = 'slate' }) {
  const tonos = {
    slate: 'text-slate-900', ambar: 'text-amber-600',
    rosa: 'text-rose-600', verde: 'text-emerald-600', gris: 'text-slate-400',
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className={`text-2xl font-bold tabular-nums leading-none ${tonos[tono]}`}>{n}</div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">{et}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  )
}

function Paquete({ f, dia, alMarcar }) {
  const [ocupado, setOcupado] = useState(false)
  const marca = f.marca

  const pulsar = async (m) => {
    setOcupado(true)
    try {
      await marcarDebrief(f.tba, { marca: marca === m ? '' : m }, dia)
      alMarcar(f.tba, marca === m ? null : m)
    } finally { setOcupado(false) }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
      marca === 'devuelto' ? 'border-emerald-300 bg-emerald-50'
        : marca === 'no_aparece' ? 'border-rose-300 bg-rose-50'
          : 'border-slate-200 bg-white'}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] font-semibold tabular-nums text-slate-900">{f.tba}</span>
          {f.stop_id != null && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              parada {f.stop_id}
            </span>
          )}
        </div>
        <div className="truncate text-[12.5px] text-slate-600">{f.motivo}</div>
        {f.direccion && <div className="truncate text-[11.5px] text-slate-400">{f.direccion}</div>}
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          disabled={ocupado} onClick={() => pulsar('devuelto')}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-40 ${
            marca === 'devuelto'
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-slate-300 text-slate-600 hover:border-emerald-400 hover:text-emerald-700'}`}>
          <Check size={14} /> Lo trae
        </button>
        <button
          disabled={ocupado} onClick={() => pulsar('no_aparece')}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-40 ${
            marca === 'no_aparece'
              ? 'border-rose-500 bg-rose-500 text-white'
              : 'border-slate-300 text-slate-600 hover:border-rose-400 hover:text-rose-700'}`}>
          <X size={14} /> No aparece
        </button>
      </div>
    </div>
  )
}

function Conductor({ c, dia, alMarcar }) {
  const [abierto, setAbierto] = useState(c.pendientes > 0)
  const [verTodo, setVerTodo] = useState(false)
  /* El orden importa y es el de urgencia, no el alfabetico ni el del backend. */
  const grupos = [
    ['perdidos', c.perdidos], ['no_entrega', c.no_entrega],
    ['no_recogido', c.no_recogido], ['reintento', c.reintento],
  ].filter(([, l]) => (l || []).length)
  const inventario = c.sin_cerrar || []

  const noCuentan = NO_CUENTAN
    .map(([k, et, ex]) => [k, et, ex, c[k] || []])
    .filter(([, , , l]) => l.length)

  return (
    <div className={`overflow-hidden rounded-xl border ${
      c.pendientes ? 'border-amber-300' : 'border-slate-200'} bg-white`}>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
        <ChevronRight size={16}
          className={`shrink-0 text-slate-400 transition-transform ${abierto ? 'rotate-90' : ''}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">{c.ruta || 'Sin ruta'}</span>
            <span className="truncate text-[13px] text-slate-500">{c.conductor}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-slate-500">
            <span className="tabular-nums">{c.entregados}/{c.total} entregados</span>
            {!!(c.sin_cerrar || []).length && (
              <span className="text-slate-400">· {c.sin_cerrar.length} aún en la furgoneta</span>
            )}
            {c.no_salio > 0 && <span className="text-slate-400">· {c.no_salio} no salieron de la nave</span>}
            {c.no_observado > 0 && <span className="text-slate-400">· {c.no_observado} sin observar</span>}
            <span className="tabular-nums text-slate-400">· última captura {fmtHora(c.ultima_captura)}</span>
          </div>
        </div>
        {c.pendientes > 0 ? (
          <span className="shrink-0 rounded-lg bg-amber-500 px-2.5 py-1 text-[12px] font-bold text-white tabular-nums">
            {c.pendientes} pendiente{c.pendientes === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700">
            <UserCheck size={13} /> Cuadra
          </span>
        )}
      </button>

      {abierto && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          {!grupos.length && !noCuentan.length && (
            <p className="text-[13px] text-slate-500">
              Entregó todo. No trae nada de vuelta.
            </p>
          )}

          {grupos.map(([k, lista]) => {
            const cfg = T[k]
            const Ico = cfg.icono
            return (
              <div key={k} className="mb-3.5 last:mb-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-semibold ${cfg.cls}`}>
                    <Ico size={13} /> {cfg.et} · {lista.length}
                  </span>
                  <span className="text-[11.5px] text-slate-400">{cfg.ayuda}</span>
                </div>
                <div className="grid gap-1.5">
                  {lista.map((f) => (
                    <Paquete key={f.tba} f={f} dia={dia} alMarcar={alMarcar} />
                  ))}
                </div>
              </div>
            )
          })}

          {/* EL INVENTARIO, PLEGADO.
              Son los paquetes que siguen cargados. Sirve para cuadrar del
              todo al final del dia, pero abierto de golpe entierra los cuatro
              de arriba: una ruta normal trae dos problemas y cuarenta
              paquetes en reparto, y si se pintan igual, no se ve ninguno. */}
          {inventario.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setVerTodo((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-semibold ${INVENTARIO.cls}`}>
                <ChevronRight size={12} className={`transition-transform ${verTodo ? 'rotate-90' : ''}`} />
                {INVENTARIO.et} · {inventario.length}
              </button>
              {verTodo && (
                <div className="mt-1.5 grid gap-1.5">
                  {inventario.slice(0, 60).map((f) => (
                    <Paquete key={f.tba} f={f} dia={dia} alMarcar={alMarcar} />
                  ))}
                  {inventario.length > 60 && (
                    <p className="px-1 text-[12px] text-slate-400">
                      y {inventario.length - 60} más.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* LO QUE NO SE LE PUEDE PEDIR. Va aparte, en gris y con la razón
              escrita: si no aparece, alguien lo echa en falta y deja de
              fiarse; si aparece mezclado, se lo reclaman sin motivo. */}
          {noCuentan.length > 0 && (
            <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white/60 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Ban size={12} /> No se le pide — y por qué
              </div>
              <div className="grid gap-2">
                {noCuentan.map(([k, et, ex, lista]) => (
                  <div key={k} className="text-[12.5px]">
                    <span className="font-semibold text-slate-700">{et}</span>
                    <span className="tabular-nums text-slate-500"> · {lista.length}</span>
                    <span className="text-slate-400"> — {ex}</span>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                      {lista.slice(0, 6).map((f) => f.tba).join('  ')}
                      {lista.length > 6 && ` +${lista.length - 6}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Debrief() {
  const { center } = useOutletContext() || {}
  const [dia, setDia] = useState(hoyISO())
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [soloPend, setSoloPend] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    try {
      const { data } = await getDebrief({ day: dia, center })
      setDatos(data)
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo cargar el cuadre')
    } finally { setCargando(false) }
  }, [dia, center])

  useEffect(() => { cargar() }, [cargar])

  const alMarcar = useCallback((tba, marca) => {
    setDatos((d) => {
      if (!d) return d
      const conductores = d.conductores.map((c) => {
        let tocado = false
        const mapa = (l) => (l || []).map((f) => {
          if (f.tba !== tba) return f
          tocado = true
          return { ...f, marca }
        })
        const reintento = mapa(c.reintento)
        const noEntrega = mapa(c.no_entrega)
        const noRecogido = mapa(c.no_recogido)
        const perdidos = mapa(c.perdidos)
        const sinCerrar = mapa(c.sin_cerrar)
        if (!tocado) return c
        /* Lo pendiente son los cuatro, igual que en el backend. El inventario
           se puede marcar pero no cuenta: si contara, ninguna ruta cuadraria
           nunca hasta escanear 140 paquetes. */
        const pend = [...reintento, ...noEntrega, ...noRecogido, ...perdidos]
          .filter((f) => !f.marca).length
        return { ...c, reintento, no_entrega: noEntrega, no_recogido: noRecogido,
          perdidos, sin_cerrar: sinCerrar, pendientes: pend, cuadra: pend === 0 }
      })
      return { ...d, conductores }
    })
  }, [])

  const r = datos?.resumen || {}
  const lista = useMemo(() => {
    let l = datos?.conductores || []
    if (soloPend) l = l.filter((c) => c.pendientes > 0)
    const t = q.trim().toLowerCase()
    if (t) {
      l = l.filter((c) =>
        (c.ruta || '').toLowerCase().includes(t) ||
        (c.conductor || '').toLowerCase().includes(t) ||
        [...(c.reintento || []), ...(c.no_entrega || []), ...(c.no_recogido || []),
          ...(c.perdidos || []), ...(c.sin_cerrar || [])]
          .some((f) => (f.tba || '').toLowerCase().includes(t)))
    }
    return l
  }, [datos, q, soloPend])

  return (
    <div className="-m-4 -mb-24 min-h-full bg-[#F2F4F7] p-4 text-slate-900 md:-m-5 md:mb-[-1.25rem] md:p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Cuadre del debrief</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-slate-500">
            Qué trae cada conductor en la furgoneta, antes de que se vaya.
          </p>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <CalendarDays size={15} className="text-slate-400" />
            <input
              type="date" value={dia} onChange={(e) => setDia(e.target.value)}
              className="bg-transparent text-[14px] font-medium outline-none" />
          </div>
          <div className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Search size={15} className="text-slate-400" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Ruta, conductor o TBA"
              className="w-full bg-transparent text-[14px] outline-none placeholder:text-slate-400" />
          </div>
          <button
            onClick={() => setSoloPend((v) => !v)}
            className={`rounded-xl border px-3 py-2 text-[13px] font-semibold ${
              soloPend ? 'border-amber-400 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-white text-slate-600'}`}>
            Solo con pendientes
          </button>
        </div>

        {/* EL AVISO VA ANTES QUE LOS NÚMEROS BUENOS. Si la captura se paró,
            el cuadre de ese día no vale y hay que decirlo, no dejar que se
            deduzca de un porcentaje escondido abajo. */}
        {/* EL DIA DE HOY NO SE PUEDE CUADRAR TODAVIA, y hay que decirlo:
            si no, alguien mira a las 11h, ve 40 paquetes en la furgoneta y
            cree que hay un problema. */}
        {datos?.en_curso && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
            <Clock size={17} className="mt-0.5 shrink-0 text-sky-600" />
            <div className="text-[13.5px] text-sky-900">
              <b>El día está en curso.</b> Lo que sigue cargado en la furgoneta es
              reparto normal, no un problema. Los cuatro de arriba sí valen ya:
              esos los dice Cortex en el momento.
            </div>
          </div>
        )}

        {datos && !r.fiable && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
            <EyeOff size={17} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="text-[13.5px] text-amber-900">
              <b>El cuadre de este día no es fiable.</b> El {r.ciego_pct}% de los paquetes
              se quedó sin observar porque la captura de Cortex se paró antes de que
              terminaran las rutas. Lo que salga aquí está incompleto:{' '}
              <b>no se lo reclames a nadie</b> sin mirarlo por otro sitio.
            </div>
          </div>
        )}

        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
            <Loader2 className="animate-spin" size={18} /> Cargando el día…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[14px] text-rose-800">{error}</div>
        ) : !datos?.conductores?.length ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-500">
            No hay paquetes de Cortex ese día.
          </div>
        ) : (
          <>
            {/* Los cuatro de Cortex, en el orden en que hay que atenderlos. */}
            <div className="mb-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Kpi n={r.perdidos ?? 0} et="Falta" tono="rosa" sub="llamar hoy" />
              <Kpi n={r.no_entrega ?? 0} et="No se puede entregar" tono="ambar" />
              <Kpi n={r.no_recogido ?? 0} et="No se ha podido recoger" tono="ambar" />
              <Kpi n={r.reintento ?? 0} et="Se puede volver a intentar" tono="ambar" sub="vuelve a salir mañana" />
            </div>
            {/* Y el resto, mas pequeño: contexto, no tarea. */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi n={`${r.cuadran ?? 0}/${r.rutas ?? 0}`} et="Rutas que cuadran" tono="verde" />
              <Kpi n={r.sin_cerrar ?? 0} et="Sigue en la furgoneta" tono="gris"
                   sub={datos?.en_curso ? 'el día no ha terminado' : 'inventario'} />
              <Kpi n={r.no_salio ?? 0} et="No salieron" tono="gris" sub="se quedaron en nave" />
              <Kpi n={r.no_observado ?? 0} et="Sin observar" tono="gris" sub="no es fallo de nadie" />
            </div>

            <div className="grid gap-2">
              {lista.map((c) => (
                <Conductor key={`${c.driver_id}-${c.ruta}`} c={c} dia={dia} alMarcar={alMarcar} />
              ))}
              {!lista.length && (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-[14px] text-slate-500">
                  Nada que enseñar con este filtro.
                </div>
              )}
            </div>

            <p className="mt-4 flex items-start gap-1.5 text-[12px] leading-relaxed text-slate-400">
              <Clock size={13} className="mt-0.5 shrink-0" />
              Un paquete solo se reclama si se vio <b className="mx-1 font-semibold">después</b> de
              salir la ruta. Si la última captura es anterior, va a «sin observar» y no
              cuenta contra nadie.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
