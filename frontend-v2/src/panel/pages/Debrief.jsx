import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, PackageX, AlertTriangle, EyeOff, Search,
  Check, X, ChevronRight, CalendarDays, Ban, UserCheck, Clock, Undo2,
  RotateCcw, RefreshCw, CheckCircle2, AlertCircle,
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

const CAJONES = ['perdidos', 'no_entrega', 'no_recogido', 'reintento', 'sin_cerrar']
/* La clave es la PERSONA. Con `${driver_id}|${ruta}` dentro, un support
   que ayuda en dos rutas cambiaba de clave en cuanto se le añadia la
   segunda, y la fusion lo trataba como una fila nueva: se le movia el sitio
   justo mientras alguien le marcaba paquetes. */
const clave = (c) => String(c.driver_id)

/* Fusiona lo que llega del servidor sobre lo que ya se ve, SIN mover nada.
   Cada paquete que ya estaba conserva su sitio y solo se le refrescan los
   datos; los nuevos van al final de su grupo; los que el servidor ya no
   manda (cambiaron de estado) desaparecen, que es correcto. */
function fusionarLista(viejos, nuevos) {
  const porTba = new Map((nuevos || []).map((f) => [f.tba, f]))
  const salida = []
  for (const v of viejos || []) {
    const n = porTba.get(v.tba)
    if (n) { salida.push(n); porTba.delete(v.tba) }
  }
  for (const n of porTba.values()) salida.push(n)
  return salida
}

function fusionar(anterior, fresco) {
  if (!anterior?.conductores?.length) return fresco
  const nuevos = new Map((fresco.conductores || []).map((c) => [clave(c), c]))
  const conductores = []
  /* El orden de los conductores es el que ya estaba en pantalla. Reordenar
     mientras alguien marca hace que la fila en la que trabaja se le escape. */
  for (const a of anterior.conductores) {
    const n = nuevos.get(clave(a))
    if (!n) continue
    const mezcla = { ...n }
    for (const k of CAJONES) mezcla[k] = fusionarLista(a[k], n[k])
    conductores.push(mezcla)
    nuevos.delete(clave(a))
  }
  for (const n of nuevos.values()) conductores.push(n)
  return { ...fresco, conductores }
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

/* EL RESUMEN DEL FINAL.
   Tres tramos, no dos: lo recogido, lo que no aparece, y lo que nadie ha
   mirado. Ese tercer tramo es el que impide que la pantalla mienta. */
function Recuento({ r }) {
  const total = r.a_comprobar || 0
  if (!total) return null
  const rec = r.recogidos || 0
  const fal = r.no_aparecen || 0
  const sin = r.sin_comprobar || 0
  const pc = (n) => `${(100 * n / total).toFixed(1)}%`

  const V = {
    todo_recogido: {
      cls: 'border-emerald-300 bg-emerald-50', ico: CheckCircle2, col: 'text-emerald-700',
      tit: 'Lo has recogido todo',
      txt: `Los ${total} paquetes que había que reclamar están comprobados y aparecieron todos.`,
    },
    faltan: {
      cls: 'border-rose-300 bg-rose-50', ico: AlertCircle, col: 'text-rose-700',
      tit: fal === 1 ? 'Falta 1 paquete' : `Faltan ${fal} paquetes`,
      txt: `Comprobados los ${total}. ${fal === 1 ? 'Uno no apareció' : `${fal} no aparecieron`} con el conductor delante — eso es una pérdida real, días antes de que Amazon la declare.`,
    },
    a_medias: {
      cls: 'border-slate-300 bg-white', ico: Clock, col: 'text-slate-600',
      tit: `Quedan ${sin} por comprobar`,
      txt: `De ${total} que hay que reclamar, ${rec + fal} están mirados. Hasta terminar no se puede decir si falta algo.`,
    },
  }[r.veredicto] || null
  if (!V) return null
  const Ico = V.ico

  return (
    <div className={`mb-4 rounded-xl border ${V.cls} p-4`}>
      <div className="flex items-start gap-2.5">
        <Ico size={19} className={`mt-0.5 shrink-0 ${V.col}`} />
        <div className="min-w-0 flex-1">
          <div className={`text-[15px] font-bold ${V.col}`}>{V.tit}</div>
          <p className="mt-0.5 text-[13px] text-slate-600">{V.txt}</p>

          <div className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="bg-emerald-500" style={{ width: pc(rec) }} title={`${rec} recogidos`} />
            <div className="bg-rose-500" style={{ width: pc(fal) }} title={`${fal} no aparecen`} />
            <div className="bg-slate-300" style={{ width: pc(sin) }} title={`${sin} sin comprobar`} />
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-emerald-500" />
              <b className="tabular-nums text-slate-700">{rec}</b>
              <span className="text-slate-500">recogidos</span>
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-rose-500" />
              <b className="tabular-nums text-slate-700">{fal}</b>
              <span className="text-slate-500">no aparecen</span>
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-slate-300" />
              <b className="tabular-nums text-slate-700">{sin}</b>
              <span className="text-slate-500">sin comprobar</span>
            </span>
            <span className="ml-auto tabular-nums text-slate-400">
              {r.rutas_comprobadas ?? 0}/{r.cuadran_de ?? r.conductores ?? 0} conductores terminados
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Paquete({ f, dia, alMarcar }) {
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState(null)
  const marca = f.marca

  const pulsar = async (m) => {
    setOcupado(true)
    try {
      const { data } = await marcarDebrief(f.tba, { marca: marca === m ? '' : m }, dia)
      /* Si Cortex ya lo daba por entregado, el backend lo dice. Se enseña
         AQUI, en la propia fila y en el momento: un aviso que sale arriba o
         en un toast pasajero no lo asocia nadie con la linea que acaba de
         pulsar, y este avisa justo de eso. */
      setAviso(data?.aviso || null)
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
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
              parada {f.stop_id}
            </span>
          )}
        </div>
        <div className="truncate text-[12.5px] text-slate-600">{f.motivo}</div>
        {f.direccion && <div className="truncate text-[11.5px] text-slate-400">{f.direccion}</div>}
        {aviso && (
          <div className="mt-1 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11.5px] leading-snug text-amber-900">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {aviso}
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          disabled={ocupado} onClick={() => pulsar('devuelto')}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-40 ${
            marca === 'devuelto'
              ? 'border-emerald-500 bg-emerald-700 text-white'
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
  /* Cerrada de entrada, aunque tenga cosas pendientes. Abiertas ocupan la fila
     entera, así que con siete rutas por reclamar la rejilla se convertía otra
     vez en la lista larga de antes. La tarjeta ya dice cuántas quedan sin
     mirar; se abre la que se está haciendo. */
  const [abierto, setAbierto] = useState(false)
  const [verTodo, setVerTodo] = useState(false)
  /* El orden importa y es el de urgencia, no el alfabetico ni el del backend. */
  const grupos = [
    ['perdidos', c.perdidos], ['no_entrega', c.no_entrega],
    ['no_recogido', c.no_recogido], ['reintento', c.reintento],
  ].filter(([, l]) => (l || []).length)
  const inventario = c.sin_cerrar || []

  /* SEPARAR LO SUYO DE LO QUE TRAE POR HABER IDO A AYUDAR.
     Solo cuando hay mas de una ruta: para el 80 % de los conductores, que
     hacen una sola, meter una cabecera de ruta seria ruido puro. El orden es
     la suya primero —es lo que espera ver— y despues las de apoyo. */
  const porRuta = (() => {
    if (!c.es_apoyo) return null
    const m = new Map()
    for (const [k, lista] of grupos) {
      for (const f of lista) {
        const r = f.ruta || 'Sin ruta'
        if (!m.has(r)) m.set(r, [])
        m.get(r).push([k, f])
      }
    }
    if (m.size < 2) return null   // todo lo que trae viene de una sola ruta
    const orden = [...m.keys()].sort((a, b) => {
      if (a === c.ruta_propia) return -1
      if (b === c.ruta_propia) return 1
      return a.localeCompare(b)
    })
    return orden.map((r) => ({
      ruta: r,
      propia: r === c.ruta_propia,
      // Cuantos paquetes lleva de esa ruta en total, no solo a reclamar:
      // es lo que explica por que trae tres de una ruta que no es la suya.
      total: (c.paquetes_por_ruta || {})[r],
      items: m.get(r),
    }))
  })()

  const noCuentan = NO_CUENTAN
    .map(([k, et, ex]) => [k, et, ex, c[k] || []])
    .filter(([, , , l]) => l.length)

  return (
    /* La tarjeta abierta ocupa la fila entera: dentro van los TBA con su
       dirección y los botones de marcar, y eso en un tercio de ancho se parte
       en cuatro líneas y deja de leerse. Cerrada, una de cada tres. */
    <div className={`overflow-hidden rounded-xl border bg-white ${
      abierto ? 'border-slate-300 shadow-sm sm:col-span-2 xl:col-span-3'
        : c.pendientes ? 'border-amber-300' : 'border-slate-200'}`}>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-start gap-2.5 px-3.5 py-3 text-left hover:bg-slate-50">
        <ChevronRight size={16}
          className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${abierto ? 'rotate-90' : ''}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {/* La RUTA es lo que se busca con la vista, así que va grande y
                sola en su renglón visual. El nombre debajo: se necesita para
                dirigirse a la persona, pero no para encontrar la tarjeta. */}
            <span className="text-[15px] font-bold tracking-tight text-slate-900">{c.ruta || 'Sin ruta'}</span>
            {/* Quien ha tocado mas de una ruta es un apoyo, y conviene que se
                vea: sus paquetes vienen de sitios distintos. */}
            {c.es_apoyo && (
              /* Dice DONDE fue a ayudar, no solo que ayudo: "+ CA_A43" se
                 entiende de un vistazo y "apoyo · 2 rutas" obliga a abrir. */
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                {c.ruta_propia
                  ? `+ ayudó en ${(c.rutas_apoyo || []).map((x) => x.ruta).join(', ')}`
                  : `${c.rutas.length} rutas`}
              </span>
            )}
            {/* Sin ficha se enseña el Transporter ID, no un "Sin identificar"
                que no dice que hacer. Cortex no manda nombres (0 de 7.171
                paquetes), asi que la unica forma de poner cara a alguien es
                rellenar su ID en Conductores — y para eso hay que saber cual. */}
            <span className={`truncate text-[13px] ${c.sin_ficha ? 'font-mono text-[11.5px] text-slate-400' : 'text-slate-500'}`}>
              {c.conductor}
            </span>
            {/* slate-700 y no slate-500: el checker de contraste midio slate-500
                sobre este relleno en 4,34:1, por debajo del 4,5 de la WCAG. */}
            {c.sin_ficha && c.transporter_id && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                sin ficha
              </span>
            )}
          </div>
          {/* CERRADA, SOLO LO QUE SE MIRA DE UN VISTAZO. Antes iban aquí seis
              datos seguidos —entregados, en la furgoneta, arrastrados, sin
              observar, último movimiento y la frescura— y en una tarjeta de un
              tercio de ancho eso son tres renglones de texto gris que nadie
              lee. El resto se ve al abrir, que es cuando importa. */}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-slate-500">
            <span className="tabular-nums">{c.entregados}/{c.total} entregados</span>
            {/* La frescura solo cuando es mala: si el dato está al día no hace
                falta decirlo, y un aviso que sale siempre deja de leerse. Pero
                cuando la ruta lleva una hora sin bajarse hay que verlo ANTES de
                reclamarle nada a nadie, porque lo que se ve puede ser de antes. */}
            {c.capturado_hace_min > 45 && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-amber-800"
                title="Hace tanto que no bajamos esta ruta que lo que se ve puede haber cambiado ya">
                dato de hace {c.capturado_hace_min} min
              </span>
            )}
          </div>
        </div>
        {/* El contador de la ruta: cuantos van de los que hay que comprobar.
            Un "3/7" dice mucho mas que "4 pendientes" cuando estas en medio. */}
        {c.a_comprobar > 0 && (
          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-slate-500">
            {c.recogidos + c.no_aparecen}/{c.a_comprobar}
          </span>
        )}
        {c.pendientes > 0 ? (
          <span className="shrink-0 rounded-lg bg-amber-500 px-2.5 py-1 text-[12px] font-bold text-amber-950 tabular-nums">
            {c.pendientes} sin mirar
          </span>
        ) : c.no_aparecen > 0 ? (
          <span className="flex shrink-0 items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[12px] font-semibold text-rose-700">
            <AlertCircle size={13} /> Faltan {c.no_aparecen}
          </span>
        ) : c.a_comprobar > 0 ? (
          <span className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700">
            <UserCheck size={13} /> Todo recogido
          </span>
        ) : (
          <span className="shrink-0 text-[12px] text-slate-400">nada que comprobar</span>
        )}
      </button>

      {abierto && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          {/* Lo que se quitó de la tarjeta cerrada aparece aquí, que es cuando
              hace falta: el inventario, lo que arrastra y desde cuándo vale lo
              que se está viendo. */}
          <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-slate-500">
            {!!(c.sin_cerrar || []).length && (
              <span>{c.sin_cerrar.length} aún en la furgoneta</span>
            )}
            {c.arrastrados > 0 && <span>· {c.arrastrados} arrastran de otro día</span>}
            {c.no_observado > 0 && <span>· {c.no_observado} sin observar</span>}
            {/* DOS COSAS DISTINTAS, Y ANTES SE ENSEÑABA UNA CON EL NOMBRE DE LA
                OTRA. `ultima_captura` es la hora del último MOVIMIENTO en Cortex:
                una ruta que terminó a las 19:00 se queda ahí para siempre por
                mucho que la sigamos bajando. Los minutos salen de `seen_at`, que
                lo escribe la ingesta cada vez que baja la ruta, y esa es la
                pregunta que hay que contestar antes de reclamarle nada a nadie:
                ¿esto vale? */}
            <span className="tabular-nums">· último movimiento {fmtHora(c.ultima_captura)}</span>
            {c.capturado_hace_min != null && (
              <span className={`tabular-nums ${c.capturado_hace_min > 45 ? 'font-semibold text-amber-700' : ''}`}>
                · {c.capturado_hace_min <= 1 ? 'al día' : `bajado hace ${c.capturado_hace_min} min`}
              </span>
            )}
          </div>
          {!grupos.length && !noCuentan.length && (
            <p className="text-[13px] text-slate-500">
              Entregó todo. No trae nada de vuelta.
            </p>
          )}

          {/* Cuando alguien fue a ayudar, sus paquetes se separan por ruta:
              primero los suyos y despues los de la ruta que fue a cubrir. Sin
              esto salian los siete mezclados y habia que preguntar de donde
              venia cada uno — justo lo que la pantalla viene a evitar. */}
          {porRuta && (
            <div className="mb-3 grid gap-3">
              {porRuta.map((g) => (
                <div key={g.ruta}>
                  <div className={`mb-1.5 flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
                    g.propia ? 'border-slate-300 bg-white' : 'border-sky-300 bg-sky-50'}`}>
                    <span className="font-semibold text-slate-900">{g.ruta}</span>
                    <span className={`text-[11.5px] font-semibold ${
                      g.propia ? 'text-slate-500' : 'text-sky-700'}`}>
                      {g.propia ? 'su ruta' : 'fue a ayudar aquí'}
                    </span>
                    {g.total != null && (
                      <span className="text-[11.5px] text-slate-400">{g.total} paquetes en total</span>
                    )}
                    <span className="ml-auto text-[12px] font-bold tabular-nums text-slate-700">
                      {g.items.length} que dar
                    </span>
                  </div>
                  <div className="grid gap-1.5">
                    {g.items.map(([k, f]) => (
                      <div key={f.tba}>
                        <span className={`mb-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${T[k].cls}`}>
                          {T[k].et}
                        </span>
                        <Paquete f={f} dia={dia} alMarcar={alMarcar} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {c.reparto_dudoso && (
                <p className="text-[11.5px] leading-snug text-slate-400">
                  Lleva parecido de cada ruta, así que no se puede decir cuál es la suya.
                  Se enseñan las dos sin etiquetar.
                </p>
              )}
            </div>
          )}

          {!porRuta && grupos.map(([k, lista]) => {
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
  const [refrescado, setRefrescado] = useState(null)
  /* Momento de la ultima pulsacion. Mientras este fresco, el reloj no toca
     la pantalla: si el conductor esta delante y estas marcando, nada se
     mueve. */
  const tocadoRef = useRef(0)
  const cargandoRef = useRef(false)

  /* `silencioso` = lo pide el reloj, no la persona: no se enseña el
     cargando, no se borra el error visible y se FUSIONA en vez de
     reemplazar, para que no se mueva nada de sitio. */
  const cargar = useCallback(async (silencioso = false) => {
    /* El cerrojo se pone y se comprueba ANTES de cualquier `await`, en el
       mismo turno síncrono. Si se leyera después, dos llamadas seguidas —el
       reloj y una pulsación— podrían pasar las dos y pedir el día dos veces.
       eslint avisa de `require-atomic-updates` aquí; en este orden no puede
       darse, pero conviene que se lea el motivo antes de moverlo. */
    if (cargandoRef.current) return
    cargandoRef.current = true
    if (!silencioso) { setCargando(true); setError('') }
    try {
      const { data } = await getDebrief({ day: dia, center })
      setDatos((prev) => (silencioso ? fusionar(prev, data) : data))
      setRefrescado(Date.now())
    } catch (e) {
      if (!silencioso) setError(e?.response?.data?.detail || 'No se pudo cargar el cuadre')
    } finally {
      /* eslint-disable-next-line require-atomic-updates --
         Falso positivo de la regla, y conviene dejarlo escrito. La regla avisa
         de asignar a algo compartido DESPUÉS de un `await`, por si otra
         ejecución lo cambió en medio. Aquí no puede pasar: la comprobación y
         la puesta del cerrojo son síncronas y van juntas antes del primer
         `await`, así que solo una llamada entra y solo esa lo suelta. */
      cargandoRef.current = false
      if (!silencioso) setCargando(false)
    }
  }, [dia, center])

  useEffect(() => { cargar(false) }, [cargar])

  /* EL RELOJ. Cada 45 s, y solo si se puede sin estorbar:
       · la pestaña tiene que estar a la vista (nadie mira una oculta);
       · tienen que haber pasado 15 s desde la ultima pulsacion.
     Al volver a la pestaña se refresca en el momento, que es cuando la
     persona vuelve a mirar los numeros. */
  useEffect(() => {
    const puede = () => !document.hidden && Date.now() - tocadoRef.current > 15000
    const tic = () => { if (puede()) cargar(true) }
    const alVolver = () => { if (!document.hidden) tic() }
    const reloj = setInterval(tic, 45000)
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    return () => {
      clearInterval(reloj)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }, [cargar])

  const alMarcar = useCallback((tba, marca) => {
    tocadoRef.current = Date.now()
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
        const comprobar = [...reintento, ...noEntrega, ...noRecogido, ...perdidos]
        const pend = comprobar.filter((f) => !f.marca).length
        const recog = comprobar.filter((f) => f.marca === 'devuelto').length
        const noAp = comprobar.filter((f) => f.marca === 'no_aparece').length
        return { ...c, reintento, no_entrega: noEntrega, no_recogido: noRecogido,
          perdidos, sin_cerrar: sinCerrar,
          a_comprobar: comprobar.length, recogidos: recog, no_aparecen: noAp,
          pendientes: pend, comprobada: pend === 0, cuadra: pend === 0 && noAp === 0 }
      })
      /* El resumen se recalcula aqui mismo. Esperar al siguiente refresco
         haria que el contador fuera por detras de lo que la persona acaba de
         pulsar, y eso se lee como que el boton no ha funcionado. */
      const suma = (f) => conductores.reduce((n, c) => n + f(c), 0)
      const sinComprobar = suma((c) => c.pendientes || 0)
      const noAparecen = suma((c) => c.no_aparecen || 0)
      const aComprobar = suma((c) => c.a_comprobar || 0)
      const resumen = {
        ...d.resumen,
        a_comprobar: aComprobar,
        recogidos: suma((c) => c.recogidos || 0),
        no_aparecen: noAparecen,
        sin_comprobar: sinComprobar,
        rutas_comprobadas: conductores.filter((c) => c.comprobada).length,
        cuadran: conductores.filter((c) => c.cuadra).length,
        veredicto: aComprobar === 0 ? 'nada_que_comprobar'
          : sinComprobar > 0 ? 'a_medias'
            : noAparecen > 0 ? 'faltan' : 'todo_recogido',
      }
      return { ...d, conductores, resumen }
    })
  }, [])

  const r = datos?.resumen || {}
  /* ── LO TERMINADO SE QUITA DE EN MEDIO ──────────────────────────────────
     Con 42 rutas en pantalla y 35 ya cerradas, las 7 que faltan se pierden
     entre las demás: hay que ir leyendo tarjeta por tarjeta para encontrar
     cuál queda. Una ruta cerrada no tiene nada que hacer ahí — lo único que
     hace es alargar la lista.

     Se ocultan, NO se borran: el contador de arriba las sigue contando y un
     botón las trae de vuelta. Desaparecer del todo haría dudar de si se
     perdieron, y esa duda obliga a comprobarlo por otro lado. */
  const [verTerminadas, setVerTerminadas] = useState(false)

  const [lista, terminadas] = useMemo(() => {
    let l = datos?.conductores || []
    const t = q.trim().toLowerCase()
    if (t) {
      l = l.filter((c) =>
        (c.ruta || '').toLowerCase().includes(t) ||
        (c.conductor || '').toLowerCase().includes(t) ||
        [...(c.reintento || []), ...(c.no_entrega || []), ...(c.no_recogido || []),
          ...(c.perdidos || []), ...(c.sin_cerrar || [])]
          .some((f) => (f.tba || '').toLowerCase().includes(t)))
    }
    // Terminada = no queda nada por comprobar. Es lo que marca la oficina al
    // ir dando los paquetes por recogidos, y también la ruta que nunca tuvo
    // nada que reclamar.
    const fin = l.filter((c) => !(c.pendientes > 0))
    if (soloPend || !verTerminadas) l = l.filter((c) => c.pendientes > 0)
    return [l, fin]
  }, [datos, q, soloPend, verTerminadas])

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
            Solo sin mirar
          </button>
          {/* Actualizar a mano ADEMAS reordena la lista, que el reloj no hace
              a proposito. Es la forma de decir "ya he terminado, recolócamelo". */}
          <button
            onClick={() => cargar(false)}
            title="Actualizar y reordenar"
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600">
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
            {refrescado ? fmtHora(new Date(refrescado).toISOString()) : 'Actualizar'}
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
            <Recuento r={r} />

            {/* Los cuatro de Cortex, en el orden en que hay que atenderlos. */}
            <div className="mb-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Kpi n={r.perdidos ?? 0} et="Falta" tono="rosa" sub="llamar hoy" />
              <Kpi n={r.no_entrega ?? 0} et="No se puede entregar" tono="ambar" />
              <Kpi n={r.no_recogido ?? 0} et="No se ha podido recoger" tono="ambar" />
              <Kpi n={r.reintento ?? 0} et="Se puede volver a intentar" tono="ambar" sub="vuelve a salir mañana" />
            </div>
            {/* Y el resto, mas pequeño: contexto, no tarea. */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi n={`${r.cuadran ?? 0}/${r.cuadran_de ?? r.conductores ?? 0}`}
                   et="Conductores que cuadran" tono="verde"
                   sub={`${r.rutas ?? 0} rutas${r.apoyos ? ` · ${r.apoyos} de apoyo` : ''}`} />
              {/* MEDIODÍA Y FINAL DE DÍA NO SON LO MISMO, y llamarlos igual
                  asusta para nada. A las 14:37, con 45 rutas en la calle, casi
                  todo está sin entregar todavía: eso es la jornada, no un
                  problema. Al cerrar, ese mismo número sí es lo que queda en
                  las furgonetas. El dato es el mismo; el nombre, no. */}
              <Kpi n={r.sin_cerrar ?? 0}
                   et={datos?.en_curso ? 'Aún en reparto' : 'Sigue en la furgoneta'}
                   tono="gris"
                   sub={datos?.en_curso
                     ? `${r.entregados ?? 0} de ${r.paquetes ?? 0} ya entregados`
                     : 'inventario al cerrar'} />
              {/* Se enseña aunque sea cero: si desapareciera sin mas, alguien
                  echaria en falta esos paquetes y desconfiaria de la cuenta. */}
              <Kpi n={r.arrastrados ?? 0} et="De días anteriores" tono="gris"
                   sub="no los lleva hoy nadie" />
              <Kpi n={r.no_observado ?? 0} et="Sin observar" tono="gris" sub="no es fallo de nadie" />
            </div>

            {/* ── REJILLA, NO LISTA ────────────────────────────────────────
                Una fila por ruta a lo ancho de la pantalla desperdicia el
                espacio y obliga a bajar mucho: con 42 rutas eran cinco
                pantallazos de scroll para ver cuáles quedan. En tarjetas
                caben tres por fila y se abarca todo de una vez.

                La abierta ocupa la fila entera: dentro van los TBA con su
                dirección y los botones, y eso en un tercio de ancho se parte
                en cuatro líneas y no se lee. */}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {lista.map((c) => (
                <Conductor key={c.driver_id} c={c} dia={dia} alMarcar={alMarcar} />
              ))}
              {!lista.length && (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-[14px] text-slate-500 sm:col-span-2 xl:col-span-3">
                  {terminadas.length && !verTerminadas
                    ? 'Todas las rutas están cerradas. Buen trabajo.'
                    : 'Nada que enseñar con este filtro.'}
                </div>
              )}
            </div>

            {/* Las terminadas no desaparecen del todo: se dice cuántas son y
                se pueden traer de vuelta. Que se esfumen sin decir nada haría
                dudar de si se han perdido, y esa duda obliga a comprobarlo
                por otro lado — que es justo lo que esta pantalla evita. */}
            {terminadas.length > 0 && !soloPend && (
              <button onClick={() => setVerTerminadas((v) => !v)}
                className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13.5px] font-semibold text-slate-600 hover:bg-slate-50">
                {verTerminadas
                  ? `Ocultar las ${terminadas.length} rutas ya cerradas`
                  : `${terminadas.length} rutas cerradas · verlas`}
              </button>
            )}

            <div className="mt-4 grid gap-1.5 text-[12px] leading-relaxed text-slate-400">
              <p className="flex items-start gap-1.5">
                <Clock size={13} className="mt-0.5 shrink-0" />
                Un paquete solo se reclama si se vio <b className="mx-1 font-semibold">después</b> de
                salir la ruta. Si la última captura es anterior, va a «sin observar» y no
                cuenta contra nadie.
              </p>
              <p className="flex items-start gap-1.5">
                <RefreshCw size={13} className="mt-0.5 shrink-0" />
                Se actualiza solo cada 45 s, pero <b className="mx-1 font-semibold">nunca mientras marcas</b>:
                espera 15 s desde tu última pulsación y no mueve de sitio nada que ya estés viendo.
                El orden se recoloca solo cuando pulsas Actualizar.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
