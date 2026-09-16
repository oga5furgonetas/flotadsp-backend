import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, Search, UserPlus, ClipboardPaste, Send, Check, MessageSquare,
  AlertTriangle, X, Archive, Clock, Pencil, Inbox, Hourglass, Eye, CheckCircle2,
  AtSign, Copy, EyeOff, GraduationCap, FileQuestion, Table2, List, Download,
  CalendarClock, Flame, ShieldCheck, ChevronDown, ChevronRight, SkipForward, Zap,
  MoreHorizontal,
  GraduationCap as Birrete,
} from 'lucide-react'
import {
  getIncorporaciones, altaIncorporacion, importarIncorporaciones, editarIncorporacion,
  mensajeIncorporacion, marcarAvisoIncorporacion, guardarPlantillaIncorporaciones,
  exportarIncorporaciones, getAsociados,
} from '../api'

/* ── INCORPORACIONES — a quién le falta algo, y decírselo en un clic ─────────
   ═══════════════════════════════════════════════════════════════════════════
   Una persona que empieza en Amazon no puede subirse a una furgoneta hasta que
   no tiene todos los papeles. La foto del carnet borrosa, el alta en la
   Seguridad Social que no llegó, la formación sin hacer. Hoy eso vive en una
   pestaña de otro sistema que el centro solo puede CONSULTAR, y avisar a cada
   uno es abrir WhatsApp, buscar el número, acordarse de qué le faltaba y
   escribir el mismo mensaje por enésima vez. Por eso no se avisa, y por eso la
   gente tarda semanas en empezar.

   Aquí son tres clics: se marca qué le falta, se ve el mensaje, se envía.

   LAS CONTRASEÑAS. El listado trae la del correo y la del Rabbit de cada
   persona. Se guardan porque la oficina entra con ellas a revisar el
   expediente, pero se enseñan OCULTAS (hay que pulsar para verlas) y nunca
   salen de esta pantalla: ni en el WhatsApp ni en el CSV. Lo vigila
   `test_incorporaciones.py`.

   EL MENSAJE Y EL ENLACE LOS ESCRIBE EL SERVIDOR. Montar el `wa.me` aquí es el
   gotcha 47: 61 de 114 teléfonos están guardados sin prefijo y `wa.me/6xx…`
   abre un número que no existe. Si el enlace viene vacío se DICE, no se pinta
   un botón que abre WhatsApp sin destinatario.

   Y ABRIR WHATSAPP NO ES HABER ENVIADO: eso lo confirma quien lo manda. Si se
   marcara solo, quedaría gente dada por avisada a la que no le llegó nada. */

/* ── EL EMBUDO: LOS CINCO PASOS DEL PROCESO ────────────────────────────────
   En que punto esta cada persona, del primero al ultimo. El servidor calcula
   el camino (`p.camino`) y dice cual es el SIGUIENTE paso de cada uno; esto
   solo los agrupa y les pone nombre y color.

   Es la estructura de la pantalla. Antes habia tres bloques sueltos —formacion,
   urgencias, cuentas de Amazon— cada uno con su propio boton, y la lista de
   abajo repetia a la misma gente: para saber por donde empezar habia que leerlo
   todo. Ahora se pincha un paso y abajo sale SOLO esa gente. */
const EMBUDO = [
  { id: 'papeles', titulo: 'Esperando papeles', tono: 'text-amber-300',
    borde: 'border-amber-500/40', fondo: 'bg-amber-500/[0.08]', accion: true },
  { id: 'acceso', titulo: 'Mandar la formación', tono: 'text-brand-300',
    borde: 'border-brand-500/40', fondo: 'bg-brand-500/[0.08]', accion: true },
  { id: 'cuenta', titulo: 'Esperando a Amazon', tono: 'text-sky-300',
    borde: 'border-sky-500/40', fondo: 'bg-sky-500/[0.08]' },
  { id: 'dentro', titulo: 'Acabando en Amazon', tono: 'text-violet-300',
    borde: 'border-violet-500/40', fondo: 'bg-violet-500/[0.08]' },
  { id: 'listo', titulo: 'Listos para entrar', tono: 'text-emerald-400',
    borde: 'border-emerald-500/40', fondo: 'bg-emerald-500/[0.08]' },
  { id: 'fuera', titulo: 'Ya no están', tono: 'text-dark-400',
    borde: 'border-white/15', fondo: 'bg-white/[0.04]' },
]

/* LAS CUATRO COLUMNAS, en el orden en que pasa una persona. Los nombres los
   pone la pantalla; en QUE fase esta cada uno lo decide el servidor (gotcha
   54), que es donde vive la regla. */
const FASES = [
  { id: 'formacion', titulo: 'Formación sin mandar', icono: Send, pie: 'Tiene los papeles y espera su acceso',
    tono: 'text-brand-300', borde: 'border-brand-500/30', oculta: true },
  { id: 'por_pedir', titulo: 'Por pedir', icono: Inbox, pie: 'Le falta algo y nadie le ha escrito',
    tono: 'text-amber-300', borde: 'border-amber-500/30' },
  { id: 'esperando', titulo: 'A la espera', icono: Hourglass, pie: 'Se le ha pedido; falta que lo mande',
    tono: 'text-sky-300', borde: 'border-sky-500/30' },
  { id: 'revision', titulo: 'En revisión', icono: Eye, pie: 'Ya lo ha mandado, se está comprobando',
    tono: 'text-violet-300', borde: 'border-violet-500/30' },
  { id: 'listo', titulo: 'Completos', icono: CheckCircle2, pie: 'No les falta nada',
    tono: 'text-emerald-400', borde: 'border-emerald-500/30' },
]

/* Como se ve cada estado de un papel. El estado lo decide el servidor; esto es
   solo el color. Nunca el color solo: cada celda lleva su texto, porque a 12 px
   dos verdes distintos no se distinguen (gotcha 22). */
const TONO = {
  falta: 'bg-red-500/15 text-red-300 ring-red-500/30',
  pedido: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  revision: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  ok: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  '': 'bg-white/[0.03] text-dark-600 ring-dark-800',
}
/* El clic va rodando por el recorrido de un papel, que es como se usa de
   verdad: falta -> se lo he pedido -> en revisión -> correcto -> nada. */
const SIGUIENTE = { '': 'falta', falta: 'pedido', pedido: 'revision', revision: 'ok', ok: '' }

export default function Incorporaciones() {
  const { center } = useOutletContext() || {}
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [abierta, setAbierta] = useState(null)     // id de la ficha desplegada
  const [msg, setMsg] = useState(null)             // { id, texto, wa, nombre }
  const [pegar, setPegar] = useState(false)
  const [alta, setAlta] = useState(false)
  const [plantilla, setPlantilla] = useState(false)
  const [motivo, setMotivo] = useState('')      // el «check global»: todos los del carnet, etc.
  const [agrupar, setAgrupar] = useState('falta')   // 'falta' | 'fase'
  const [vista, setVista] = useState('lista')      // 'lista' | 'tabla'
  const [bajando, setBajando] = useState(false)

  const [cuentas, setCuentas] = useState(null)
  const [verCuentas, setVerCuentas] = useState(true)
  // Por defecto, SOLO la gente que está entrando. Amazon devuelve también a los
  // que llevan meses dentro y a los que ya se fueron, y con eso la lista deja
  // de mirarse.
  const [todasLasCuentas, setTodasLasCuentas] = useState(false)
  const [masOpciones, setMasOpciones] = useState(false)
  /* Arranca en «esperando papeles», que es donde hay trabajo. Sin paso elegido
     la lista enseñaba un conjunto (17) y el embudo otro (15): dos números para
     lo mismo hacen dudar de los dos. Ahora lo que se ve ES el paso elegido. */
  const [paso, setPaso] = useState('papeles')

  const cargar = useCallback(() => {
    getIncorporaciones(center)
      .then((r) => { setD(r.data); setErr('') })
      .catch((e) => setErr(e?.response?.data?.detail || 'No se ha podido cargar.'))
  }, [center])
  useEffect(() => { cargar() }, [cargar])

  /* LAS CUENTAS DE AMAZON, APARTE Y SIN TUMBAR LA PANTALLA.
     Vienen de la pantalla de Asociados del portal y todavia pueden no haber
     llegado nunca. Si esta llamada falla, Incorporaciones tiene que seguir
     funcionando igual: es informacion que suma, no de la que depende. */
  useEffect(() => {
    let vivo = true
    getAsociados(center, todasLasCuentas)
      .then((r) => { if (vivo) setCuentas(r.data) })
      .catch(() => { if (vivo) setCuentas({ cuentas: [], error: true }) })
    return () => { vivo = false }
  }, [center, todasLasCuentas])

  const personas = useMemo(() => {
    const t = q.trim().toLowerCase()
    let lista = d?.personas || []
    /* El check global. Cuenta el motivo marcado a mano Y el que sugiere el
       listado de la ETT: si solo mirara los marcados, pedir «los del carnet»
       dejaría fuera justo a los que nadie ha tocado todavía, que son los que
       hay que mirar. */
    if (motivo) {
      lista = lista.filter((p) => (p.motivos || []).includes(motivo) || p.sugerido === motivo)
    }
    if (t) {
      lista = lista.filter((p) => `${p.nombre} ${p.dni} ${p.telefono} ${p.ett}`
        .toLowerCase().includes(t))
    }
    return lista
  }, [d, q, motivo])

  /* Repartidas en sus cuatro columnas, y dentro de cada una por nombre.
     `localeCompare` y no `sort()` a secas: las fichas vienen en MAYÚSCULAS,
     minúsculas y Mixtas, y comparar por código de carácter deja la lista
     pareciendo aleatoria (gotcha 23). */
  /* LAS COLUMNAS. Por defecto, por lo que le falta: «Pendiente de revisar» es
     el montón de entrada, y en cuanto se marca qué le falla la persona SALE de
     ahí y se va a su columna. Eso es lo que da el orden y dice hacia dónde
     tirar. El otro agrupado —por el punto en que está— contesta otra pregunta:
     «¿a quién estoy esperando?».

     El cajón `pendiente` va SIEMPRE el primero aunque esté vacío no se pinta,
     pero nunca se mezcla con el resto: lo que no se ha mirado no puede quedar
     escondido entre lo ya resuelto (gotcha 30, el cajón de sobras). */
  /* TRES ETAPAS, Y LAS COLUMNAS SOLO DENTRO DE UNA.
     Al abrir, la pregunta no es «qué papel le falta a quién» sino «¿a quién le
     toca algo HOY?». Quien ya tiene su usuario de formación no necesita que le
     pidan papeles: necesita que le manden el acceso, y mezclado entre las
     columnas de documentos se perdía. */
  /* La gente de cada paso. `fuera` aparte: es quien ya termino o se fue, y
     mezclarlo con el resto es lo que hacia que la lista pareciera mas larga de
     lo que es. */
  const grupos = useMemo(() => {
    const g = { papeles: [], acceso: [], cuenta: [], dentro: [], listo: [], fuera: [] }
    for (const p of personas) {
      const c = p.camino
      if (!c) { g.papeles.push(p); continue }
      if (c.fuera) g.fuera.push(p)
      else if (!c.siguiente) g.listo.push(p)
      else if (c.siguiente === 'dentro') g.dentro.push(p)
      else if (c.siguiente === 'cuenta') g.cuenta.push(p)
      else if (c.siguiente === 'acceso') g.acceso.push(p)
      else g.papeles.push(p)
    }
    return g
  }, [personas])

  const columnas = useMemo(() => {
    if (agrupar === 'fase') {
      return FASES.filter((f) => !f.oculta).map((f) => ({
        id: f.id, titulo: f.titulo, pie: f.pie, icono: f.icono,
        tono: f.tono, borde: f.borde,
        gente: (motivo ? personas : (paso ? grupos[paso] || [] : personas))
          .filter((p) => p.fase === f.id),
      }))
    }
    const cat = d?.plantilla?.motivos || {}
    const orden = [
      { id: 'pendiente', titulo: 'Pendiente de revisar', icono: Inbox,
        pie: 'Nadie ha dicho todavía qué le falta', tono: 'text-amber-300',
        borde: 'border-amber-500/30' },
      ...Object.entries(cat).map(([k, v]) => ({
        id: k, titulo: v.titulo, icono: FileQuestion, pie: 'Se le ha pedido esto',
        tono: 'text-sky-300', borde: 'border-sky-500/30',
      })),
      { id: 'completo', titulo: 'Completos', icono: CheckCircle2,
        pie: 'Alguien ha dicho que ya está', tono: 'text-emerald-400',
        borde: 'border-emerald-500/30' },
    ]
    const base = motivo ? personas : (paso ? grupos[paso] || [] : personas)
    return orden.map((c) => ({ ...c, gente: base.filter((p) => p.columna === c.id) }))
  }, [grupos, paso, motivo, personas, agrupar, d])

  /* Dentro de cada columna, por nombre. `localeCompare` y no `sort()` a secas:
     las fichas vienen en MAYÚSCULAS, minúsculas y Mixtas, y comparar por código
     de carácter deja la lista pareciendo aleatoria (gotcha 23). */
  const bloques = useMemo(() => columnas.map((c) => ({
    ...c,
    gente: [...c.gente].sort((a, b) => (a.nombre || '')
      .localeCompare(b.nombre || '', 'es', { sensitivity: 'base' })),
  })), [columnas])

  const ordenadas = personas

  /* ── LA RONDA DE AVISOS ───────────────────────────────────────────────────
     El 15-09-2026, de 26 candidatos, 25 no habian recibido NI UN mensaje. No
     porque nadie quisiera: porque avisar a veinticinco personas eran
     veinticinco veces buscar la ficha, marcar, abrir WhatsApp y volver.
     Aqui se hace una sola vez: se confirma uno y aparece el siguiente ya
     preparado. La lista se congela al empezar, asi que reordenarse por debajo
     no cambia a quien le toca. */
  const [ronda, setRonda] = useState(null)   // { ids: [...], i: 0 }

  // Los motivos con los que se le escribe: los marcados a mano, y si no hay,
  // el que sugiere el listado de la ETT. A quien no le consta NADA que pedirle
  // se le deja fuera: un mensaje sin motivo es un mensaje que confunde.
  const motivosDe = (p) => ((p.motivos || []).length ? p.motivos
    : (p.sugerido ? [p.sugerido] : []))

  /* Quien entra en la tanda. Sin telefono no hay WhatsApp que abrir: el
     servidor devuelve 400 y la tanda se quedaria parada en esa persona sin
     poder seguir. Hoy los tienen todos, pero manana entra uno sin el. */
  const entraEnLaTanda = (p) => p.nunca_avisado && p.columna !== 'completo'
    && !!p.telefono && motivosDe(p).length > 0

  /* LA TANDA DE FORMACIÓN. Quien ya está «en incorporación» tiene su usuario
     —el Código Test Formación— y lo único que le falta es empezarla. Sin código
     no entra: un mensaje con el usuario en blanco hace que la persona lo
     intente, no pueda, y deje de hacer caso al siguiente. */
  /* Y SOLO LOS DEL ÚLTIMO LISTADO. Víctor salía como «en incorporación» con
     una ficha de días antes: ya había terminado y estaba trabajando. Mandarle
     «empieza la formación» sería hablarle de un estado que ya no tiene, y
     delante de una persona eso resta credibilidad a todo lo demás. */
  const entraEnFormacion = (p) => !!p.telefono && !!p.codigo_formacion
    && p.en_el_listado !== false

  const pedirMensaje = async (p, motivos, extra, tipo) => {
    setErr('')
    try {
      const r = await mensajeIncorporacion(p.id, tipo ? { tipo } : { motivos, extra })
      setMsg({ id: p.id, ...r.data })
      return true
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se ha podido preparar el mensaje.')
      return false
    }
  }

  /* La descarga. El navegador no puede guardar un fichero que no existe en
     disco, así que se construye en memoria y se suelta el objeto después: sin
     el `revokeObjectURL` cada descarga deja el CSV entero retenido. */
  const descargar = async () => {
    setBajando(true); setErr('')
    try {
      const r = await exportarIncorporaciones(center)
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      /* La fecha se compone a mano. `toISOString()` sobre una fecha local
         corre el dia en Espana: a las 00:30 el fichero saldria con la de
         ayer, y quien lo abra manana no sabra de cuando es (gotcha 11). */
      const h = new Date()
      const dia = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
      a.download = `incorporaciones-${dia}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se ha podido descargar.')
    } finally { setBajando(false) }
  }

  const confirmar = async () => {
    try {
      await marcarAvisoIncorporacion(msg.id, { texto: msg.texto })
      if (ronda) { await siguienteDeLaRonda(); return }
      setMsg(null); cargar()
    } catch (e) { setErr(e?.response?.data?.detail || 'No se ha podido marcar.') }
  }

  const arrancarRonda = async (cola, tipo) => {
    if (!cola.length) return
    setRonda({ ids: cola, i: 0, tipo })
    await prepararDeLaRonda(cola, 0, tipo)
  }

  const prepararDeLaRonda = async (ids, i, tipo) => {
    const p = (d?.personas || []).find((x) => x.id === ids[i])
    if (!p) { setRonda(null); setMsg(null); cargar(); return }
    if (tipo === 'formacion') {
      const ok = await pedirMensaje(p, null, '', 'formacion')
      if (!ok) {
        setErr(`No se ha podido preparar el de ${p.nombre}; se ha saltado.`)
        if (i + 1 < ids.length) { setRonda({ ids, i: i + 1, tipo }); await prepararDeLaRonda(ids, i + 1, tipo) }
        else { setRonda(null); setMsg(null); cargar() }
      }
      return
    }
    /* SI UNO FALLA, SE SIGUE. Un error preparando el mensaje de una persona no
       puede dejar la tanda parada ahi: quedarian dieciseis sin avisar por culpa
       de uno. Se apunta cual fallo y se pasa al siguiente. */
    const ok = await pedirMensaje(p, motivosDe(p), '')
    if (!ok) {
      setErr(`No se ha podido preparar el mensaje de ${p.nombre}; se ha saltado.`)
      if (i + 1 < ids.length) { setRonda({ ids, i: i + 1, tipo }); await prepararDeLaRonda(ids, i + 1, tipo) }
      else { setRonda(null); setMsg(null); cargar() }
    }
  }

  const siguienteDeLaRonda = async () => {
    const i = ronda.i + 1
    if (i >= ronda.ids.length) {
      // Se acabo: ahora si se recarga, con todo marcado de una vez.
      setRonda(null); setMsg(null); cargar()
      return
    }
    setRonda({ ...ronda, i })
    await prepararDeLaRonda(ronda.ids, i, ronda.tipo)
  }

  const salirDeLaRonda = () => { setRonda(null); setMsg(null); cargar() }

  /* Una sola acción, la del paso elegido. Dos botones a la vez es tener que
     decidir antes de hacer, y por eso los tres bloques de antes no se usaban. */
  const accionDelPaso = useMemo(() => {
    if (paso === 'acceso') {
      /* Primero a quien MÁS se le pasó el día de formación: Jonatan la tenía
         el 10/09 y el 16/09 seguía sin su acceso, en medio de la lista. */
      const cola = grupos.acceso.filter(entraEnFormacion)
        .sort((a, b) => (b.camino?.formacion_atrasada ?? -1) - (a.camino?.formacion_atrasada ?? -1))
      if (!cola.length) return null
      return { ...EMBUDO[1], titulo: `${cola.length} esperan su acceso a la formación`,
        pie: 'Se les manda la app Amiigo con su usuario y la contraseña, uno detrás de otro.',
        boton: `Mandárselo a ${cola.length}`,
        hacer: () => arrancarRonda(cola.map((x) => x.id), 'formacion') }
    }
    if (paso === 'papeles') {
      const cola = grupos.papeles.filter(entraEnLaTanda)
      if (!cola.length) return null
      return { ...EMBUDO[0], titulo: `${cola.length} sin que nadie les haya escrito`,
        pie: 'Se les pide lo que falta por WhatsApp, uno detrás de otro.',
        boton: `Avisar a ${cola.length}`,
        hacer: () => arrancarRonda(cola.map((x) => x.id), 'falta') }
    }
    return null
  }, [paso, grupos])   // eslint-disable-line react-hooks/exhaustive-deps

  if (err && !d) return <p className="card p-4 text-[13px] text-red-300">{err}</p>
  if (!d) {
    return (
      <div className="flex items-center gap-2 py-10 text-[13px] text-dark-400">
        <Loader2 size={15} className="animate-spin" /> Cargando…
      </div>
    )
  }

  /* Lo que se cuenta aquí es lo que se PINTA debajo: las columnas de papeles.
     Contar también a los de formación —que ya tienen bloque propio arriba—
     dejaba «26 personas» encima de una lista de 16. */
  const deAbajo = motivo ? ordenadas : (paso ? grupos[paso] || [] : personas)
  const pendientes = deAbajo.filter((p) => p.falta_texto || (p.motivos || []).length).length

  return (
    /* Hueco abajo cuando hay un mensaje preparado: si no, tapa la última ficha. */
    <div className={`space-y-4 ${msg ? 'pb-56' : ''}`}>
      <div>
        <h1 className="text-[19px] font-bold text-dark-50">Incorporaciones</h1>
        <p className="mt-0.5 max-w-[86ch] text-[13px] text-dark-400">
          En qué paso está cada uno y qué le toca ahora, con el WhatsApp ya escrito.
        </p>
      </div>

      {err && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
          {err}
        </p>
      )}

      {/* ── LA BARRA DE ARRIBA ────────────────────────────────────────────
          Lo que se usa todos los días a la vista, y lo de vez en cuando detrás
          de «Más». Antes había SEIS botones en fila compitiendo con el buscador
          y con tres bloques de avisos: demasiado ruido para una pantalla cuya
          única pregunta es «¿a quién le toca algo hoy?». */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input className="input pl-9" placeholder="Buscar por nombre, DNI o teléfono"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button onClick={() => { setPegar(true); setAlta(false) }}
          className="btn-primary inline-flex items-center gap-2">
          <ClipboardPaste size={14} /> Pegar el listado
        </button>
        <button onClick={() => setMasOpciones((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg border border-dark-700 px-3 py-2 text-[12.5px] text-dark-300 hover:border-dark-500">
          <MoreHorizontal size={14} /> Más
        </button>
      </div>
      {masOpciones && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <button onClick={() => { setAlta(true); setPegar(false); setMasOpciones(false) }}
            className="inline-flex items-center gap-2 rounded-lg border border-dark-700 px-3 py-1.5 text-[12.5px] text-dark-200 hover:border-dark-500">
            <UserPlus size={14} /> Añadir a mano
          </button>
          <button onClick={() => setPlantilla(!plantilla)}
            className="inline-flex items-center gap-2 rounded-lg border border-dark-700 px-3 py-1.5 text-[12.5px] text-dark-300 hover:border-dark-500">
            <Pencil size={14} /> Cómo se pide
          </button>
          <button onClick={() => setVista(vista === 'tabla' ? 'lista' : 'tabla')}
            className="inline-flex items-center gap-2 rounded-lg border border-dark-700 px-3 py-1.5 text-[12.5px] text-dark-300 hover:border-dark-500">
            {vista === 'tabla' ? <List size={14} /> : <Table2 size={14} />}
            {vista === 'tabla' ? 'Ver en lista' : 'Ver la tabla'}
          </button>
          <button onClick={descargar} disabled={bajando}
            className="inline-flex items-center gap-2 rounded-lg border border-dark-700 px-3 py-1.5 text-[12.5px] text-dark-300 hover:border-dark-500 disabled:opacity-40">
            {bajando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Descargar
          </button>
        </div>
      )}

      {/* ── EL EMBUDO ──────────────────────────────────────────────────────
          Los cinco pasos del proceso, con cuánta gente hay parada en cada uno.
          Es la estructura de la pantalla: se pincha un paso y abajo sale SOLO
          esa gente, con la acción que toca. Antes había tres bloques sueltos
          —formación, urgencias, cuentas— cada uno con su propio botón; nadie
          sabía por dónde empezar. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {EMBUDO.map((e) => {
          const n = (grupos[e.id] || []).length
          const activo = paso === e.id
          return (
            <button key={e.id} onClick={() => setPaso(activo ? '' : e.id)}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                activo ? `${e.borde} ${e.fondo}`
                  : n > 0 ? 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
                    : 'border-white/[0.04] bg-white/[0.01] opacity-50'}`}>
              <span className={`cifra block text-[22px] font-bold leading-none ${
                n > 0 ? e.tono : 'text-dark-600'}`}>{n}</span>
              <div className={`mt-1 text-[11.5px] leading-tight ${
                n > 0 ? 'text-dark-300' : 'text-dark-600'}`}>{e.titulo}</div>
            </button>
          )
        })}
      </div>

      {/* LA ACCIÓN DEL PASO ELEGIDO. Una sola, la que toca: dos botones a la
          vez es tener que decidir antes de hacer. */}
      {accionDelPaso && !ronda && (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-3 ${accionDelPaso.borde} ${accionDelPaso.fondo}`}>
          <div className="min-w-[200px] flex-1">
            <p className={`text-[13px] font-semibold ${accionDelPaso.tono}`}>{accionDelPaso.titulo}</p>
            <p className="mt-0.5 text-[11.5px] text-dark-400">{accionDelPaso.pie}</p>
          </div>
          <button onClick={accionDelPaso.hacer}
            className="btn-primary inline-flex items-center gap-2 whitespace-nowrap">
            <Send size={14} /> {accionDelPaso.boton}
          </button>
        </div>
      )}

      {/* EL CHECK GLOBAL: «enséñame todos los del carnet» en un clic. Solo en
          el paso de papeles y cuando no hay ninguno elegido: en «esperando a
          Amazon» no hay papeles de por medio y esa fila era ruido. */}
      <div className={`flex flex-wrap items-center gap-1.5 ${
        (paso && paso !== 'papeles') ? 'hidden' : ''}`}>
        <button onClick={() => setMotivo('')}
          className={`rounded-lg border px-2.5 py-1.5 text-[12px] transition ${
            !motivo ? 'border-brand-500/50 bg-brand-500/15 text-brand-200'
              : 'border-dark-700 text-dark-300 hover:border-dark-500'}`}>
          Todos <span className="text-dark-500">· {(d.personas || []).length}</span>
        </button>
        {Object.entries(d.plantilla.motivos).map(([k, v]) => {
          const n = (d.por_motivo || {})[k] || 0
          if (!n) return null          // un filtro que no lleva a nadie es ruido
          return (
            <button key={k} onClick={() => setMotivo(motivo === k ? '' : k)}
              className={`rounded-lg border px-2.5 py-1.5 text-[12px] transition ${
                motivo === k ? 'border-brand-500/50 bg-brand-500/15 text-brand-200'
                  : 'border-dark-700 text-dark-300 hover:border-dark-500'}`}>
              {v.titulo} <span className="text-dark-500">· {n}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-dark-500">Ordenar por</span>
        {[['falta', 'lo que le falta'], ['fase', 'en qué punto está']].map(([k, t]) => (
          <button key={k} onClick={() => setAgrupar(k)}
            className={`rounded-lg border px-2.5 py-1 transition ${
              agrupar === k ? 'border-brand-500/50 bg-brand-500/15 text-brand-200'
                : 'border-dark-700 text-dark-400 hover:border-dark-500'}`}>
            {t}
          </button>
        ))}
      </div>

      <p className="text-[12.5px] text-dark-400">
        <b className="text-dark-100">{deAbajo.length}</b>
        {motivo ? ' con eso pendiente' : ' personas'}
        {pendientes > 0 && !motivo && (
          <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11.5px] font-semibold text-amber-300">
            {pendientes} con algo pendiente
          </span>
        )}
      </p>

      {plantilla && (
        <Plantilla pl={d.plantilla} onCerrar={() => setPlantilla(false)}
          onGuardado={() => { setPlantilla(false); cargar() }} />
      )}
      {alta && <Alta onHecho={() => { setAlta(false); cargar() }} onCerrar={() => setAlta(false)} />}
      {pegar && <Pegar onHecho={() => { setPegar(false); cargar() }} onCerrar={() => setPegar(false)} />}

      {!ordenadas.length && (
        <p className="card p-6 text-center text-[13px] text-dark-400">
          {q ? 'Nadie con ese nombre.' : 'Todavía no hay nadie. Pega el listado de tu ETT o una tabla de Excel.'}
        </p>
      )}

      {vista === 'tabla' ? (
        <Tabla personas={ordenadas} cat={d.plantilla.motivos} nombres={d.estado_nombre}
          onCelda={(p, doc, valor) => editarIncorporacion(p.id,
            { estados: { ...(p.estados || {}), [doc]: valor } }).then(cargar)
            .catch((e) => setErr(e?.response?.data?.detail || 'No se ha podido guardar.'))} />
      ) : (
      <>
      {/* AGRUPAR POR PAPEL SOLO DONDE SIGNIFICA ALGO. En «esperando papeles»
          saber que a nueve les falta el carnet se ataca de una vez. En los
          demás pasos no hay papeles de por medio: agrupar ahí solo partía la
          lista en trozos de uno. */}
      {(paso && paso !== 'papeles' && !motivo) ? (
        <div className="space-y-2">
          {deAbajo.map((p) => (
            <Ficha key={p.id} p={p} motivosCat={d.plantilla.motivos} nombres={d.estado_nombre}
              abierta={abierta === p.id}
              onAbrir={() => setAbierta(abierta === p.id ? null : p.id)}
              onGuardar={(c) => editarIncorporacion(p.id, c).then(cargar)
                .catch((e) => setErr(e?.response?.data?.detail || 'No se ha podido guardar.'))}
              onMensaje={(ms, extra) => pedirMensaje(p, ms, extra)} />
          ))}
          {!deAbajo.length && (
            <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-6 text-center text-[12.5px] text-dark-500">
              Nadie en este paso.
            </p>
          )}
        </div>
      ) : (
      <div className="space-y-4">
        {bloques.map((f) => {
          const gente = f.gente
          if (!gente.length) return null
          const Icono = f.icono
          return (
            <section key={f.id}>
              <div className={`flex items-baseline gap-2 border-l-2 pl-2.5 ${f.borde}`}>
                <Icono size={14} className={f.tono} />
                <b className={`text-[13px] ${f.tono}`}>{f.titulo}</b>
                <span className="text-[12px] text-dark-500">{gente.length}</span>
                <span className="text-[11.5px] text-dark-600">{f.pie}</span>
              </div>
              <div className="mt-2 space-y-2">
                {gente.map((p) => (
                  <Ficha key={p.id} p={p} motivosCat={d.plantilla.motivos} nombres={d.estado_nombre}
                    abierta={abierta === p.id}
                    onAbrir={() => setAbierta(abierta === p.id ? null : p.id)}
                    onGuardar={(c) => editarIncorporacion(p.id, c).then(cargar)
                      .catch((e) => setErr(e?.response?.data?.detail || 'No se ha podido guardar.'))}
                    onMensaje={(ms, extra) => pedirMensaje(p, ms, extra)} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
      )}
      </>
      )}

      {msg && <Mensaje msg={msg}
        onCerrar={ronda ? salirDeLaRonda : () => setMsg(null)}
        onEnviado={confirmar}
        ronda={ronda}
        onSaltar={ronda ? siguienteDeLaRonda : null} />}
    </div>
  )
}

/* ── UNA PERSONA ─────────────────────────────────────────────────────────── */
function Ficha({ p, motivosCat, nombres, abierta, onAbrir, onGuardar, onMensaje }) {
  /* Los estados vienen ya resueltos del servidor, con lo que dice el listado de
     la ETT traducido: si pone «falta el alta en la Seguridad Social», ese papel
     llega en «falta» sin que nadie lo marque. */
  const [es, setEs] = useState(p.estados || {})
  const [nota, setNota] = useState(p.nota || '')
  /* Quien reparte en cajones es el servidor (gotcha 54). Aqui se pintaba
     «completo» cuando no habia nada marcado, y eso es justo lo contrario: son
     los que nadie ha mirado todavia. En pantalla salia «Pendiente de revisar» y
     dentro «✓ completo», que es peor que no poner nada. */
  const completo = p.columna === 'completo'

  const rodar = (k) => setEs((x) => {
    const v = SIGUIENTE[x[k] || '']
    const n = { ...x }
    if (v) n[k] = v; else delete n[k]
    return n
  })
  // Lo que se le pide es lo que falta y lo que se pidió y no llegó. Lo que está
  // en revisión NO: ya lo mandó, y volver a pedírselo hace que deje de contestar.
  const pedibles = Object.keys(es).filter((k) => es[k] === 'falta' || es[k] === 'pedido')

  return (
    <div className="card p-3">
      {/* LA FILA: DOS LÍNEAS Y TRES COLUMNAS.
          Antes era todo etiquetas de colores en una fila que se partía sola —
          nombre, ETT, teléfono, lo que falta, el punto, los días, la cuenta de
          Amazon y «nadie le ha escrito»— ocho cosas del mismo peso. Con todo
          igual de importante no destaca nada y hay que leerlo entero.

          Ahora: quién (izquierda, lo primero que se busca), qué le falta
          (centro) y cuánto lleva (derecha, alineado). Lo de debajo —ETT y
          teléfono— es dato de apoyo y va en gris pequeño. El resto se abre. */}
      <button onClick={onAbrir} className="flex w-full items-start gap-3 text-left">
        {/* El punto de estado: color a la izquierda, siempre en el mismo sitio.
            Un ojo escanea una columna de puntos mucho más rápido que ocho
            etiquetas repartidas. */}
        <span className="mt-[5px] shrink-0">
          {/* Quien ya tiene los papeles y solo espera su acceso NO está «por
              pedir»: la etiqueta de los papeles contradecía a la de al lado. */}
          {p.camino?.siguiente === 'acceso'
            ? <Punto fase="formacion" />
            : <Punto fase={p.fase} />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[13.5px] font-semibold text-dark-100">{p.nombre}</span>
            {/* Sin avisar: un punto, no una frase en naranja repetida en cada
                fila. La frase entera la lleva el título (`title`). */}
            {p.nunca_avisado && !completo && (
              <span title="nadie le ha escrito todavía"
                className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            )}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-dark-500">
            {p.ett && <span>{p.ett}</span>}
            {p.ett && p.telefono && <span className="text-dark-700">·</span>}
            {p.telefono && <span className="font-mono">{p.telefono}</span>}
            {!p.nunca_avisado && p.ultimo_aviso && (
              <>
                <span className="text-dark-700">·</span>
                <span>{p.dias_desde_aviso === 0 ? 'avisado hoy' : `avisado hace ${p.dias_desde_aviso} d`}</span>
              </>
            )}
          </span>
        </span>

        {/* LO QUE LE FALTA, una sola cosa y la que manda: lo que Amazon pide
            gana a lo que dice la ETT, porque es lo que de verdad tiene parada
            la cuenta. */}
        <span className="hidden min-w-0 shrink-0 items-center gap-1.5 sm:flex sm:max-w-[45%]">
          {p.cuenta && !p.cuenta.completa ? (
            <span title={`Amazon pide: ${p.cuenta.faltan.join(', ')}`}
              className="truncate rounded-full bg-brand-500/15 px-2 py-0.5 text-[11.5px] text-brand-200">
              Amazon: {p.cuenta.faltan.slice(0, 2).join(', ')}
              {p.cuenta.faltan.length > 2 && ` +${p.cuenta.faltan.length - 2}`}
            </span>
          ) : p.cuenta?.completa ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11.5px] text-emerald-300">
              <ShieldCheck size={11} /> cuenta lista
            </span>
          ) : p.falta_texto ? (
            <span title={p.falta_texto}
              className="truncate rounded-full bg-amber-500/15 px-2 py-0.5 text-[11.5px] text-amber-300">
              {p.falta_texto}
            </span>
          ) : completo ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-400">
              <Check size={11} /> completo
            </span>
          ) : p.columna === 'pendiente' ? (
            <span className="text-[11.5px] text-dark-600">sin revisar</span>
          ) : null}
        </span>

        {/* CUÁNTO LLEVA, alineado a la derecha y en columna fija: así se leen
            los quince días de uno y el de hoy del otro de un vistazo. Solo se
            colorea cuando ya duele.
            Si espera su acceso a la formación, lo que cuenta es cuánto hace que
            tenía que haberla empezado, no cuándo lo colgó la ETT: Jonatan salía
            con «2 d» teniendo la formación pasada desde hacía seis. */}
        <span className="w-14 shrink-0 text-right">
          {p.camino?.siguiente === 'acceso' && p.camino?.formacion_atrasada != null ? (
            <span title="Días desde su fecha de formación sin haberle mandado el acceso"
              className={`text-[12px] font-semibold tabular-nums ${
                p.camino.formacion_atrasada >= 2 ? 'text-red-300'
                  : p.camino.formacion_atrasada >= 1 ? 'text-amber-300' : 'text-dark-500'}`}>
              {p.camino.formacion_atrasada === 0 ? 'hoy' : `+${p.camino.formacion_atrasada} d`}
            </span>
          ) : p.dias_esperando != null && !completo && (
            <span className={`text-[12px] font-semibold tabular-nums ${
              p.dias_esperando >= 14 ? 'text-red-300'
                : p.dias_esperando >= 7 ? 'text-amber-300' : 'text-dark-500'}`}>
              {p.dias_esperando === 0 ? 'hoy' : `${p.dias_esperando} d`}
            </span>
          )}
        </span>
      </button>

      {abierta && (
        <div className="mt-3 space-y-3 border-t border-dark-800 pt-3">
          {/* EL CAMINO. Cinco pasos desde que la ETT lo cuelga hasta que se
              sube a una furgoneta, cada uno con su fecha — y ninguno dado por
              hecho sin un dato que lo demuestre. Debajo, en una línea, qué toca
              AHORA con esta persona: es lo único que hace falta leer. */}
          {p.camino && (
            <div className="mb-2 space-y-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 w-[52px] shrink-0 text-[10.5px] uppercase tracking-wide text-dark-600">ETT</span>
                {p.camino.ett.map((x, i) => (
                  <span key={x.id} className="flex items-center gap-1">
                    {i > 0 && <span className="text-dark-700">→</span>}
                    <span title={x.cuando ? `${x.que} · ${x.cuando.split('-').reverse().join('/')}` : x.que}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                        x.hecho ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.04] text-dark-500'}`}>
                      {x.hecho && <Check size={10} />}{x.que}
                    </span>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 w-[52px] shrink-0 text-[10.5px] uppercase tracking-wide text-dark-600">Amazon</span>
                {!p.camino.amazon.vista ? (
                  /* «No la hemos visto» y NUNCA «no la tiene»: Lois la tenía, y
                     decir lo contrario fue decir algo falso sobre una persona. */
                  <span className="text-[11.5px] text-dark-500">su cuenta no la hemos visto todavía</span>
                ) : (
                  <>
                    <span className={`cifra rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      p.camino.amazon.completa ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-sky-500/15 text-sky-300'}`}>
                      {p.camino.amazon.hechas} de {p.camino.amazon.total}
                    </span>
                    {p.camino.amazon.naves?.length > 0 && (
                      <span className="text-[11px] text-dark-600">{p.camino.amazon.naves.join('/')}</span>
                    )}
                    {(p.camino.amazon.pendientes || []).slice(0, 4).map((x) => (
                      <span key={x} className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300">{x}</span>
                    ))}
                  </>
                )}
              </div>
              <p className={`pt-0.5 text-[12px] ${p.camino.siguiente || p.camino.fuera ? 'text-amber-200' : 'text-emerald-300'}`}>
                {p.camino.siguiente || p.camino.fuera ? '→ ' : '✓ '}{p.camino.que_toca}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-dark-500">
            {p.registrado && <span>la ETT lo colgó el {p.registrado.split('-').reverse().join('/')}</span>}
            {p.dni && <span>DNI {p.dni}</span>}
            {p.idper && <span>IDPER {p.idper}</span>}
            {p.centro && <span>{p.centro}</span>}
          </div>

          <Cuenta p={p} />

          <div>
            <p className="label">Cada papel, en qué punto está <span className="text-dark-600">· pulsa para avanzarlo</span></p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {Object.entries(motivosCat).map(([k, v]) => {
                const st = es[k] || ''
                return (
                  <button key={k} onClick={() => rodar(k)}
                    className={`rounded-lg px-2.5 py-1.5 text-[12px] ring-1 transition ${TONO[st]}`}>
                    {v.titulo}
                    <span className="ml-1.5 opacity-80">
                      {st ? `· ${nombres[st]}` : '· sin marcar'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="label">Algo más que decirle (opcional)</label>
            <input className="input py-1.5 text-[12.5px]" value={nota}
              placeholder="Lo que quieras añadir, con sus palabras"
              onChange={(e) => setNota(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-2">
            {/* El enlace lo monta el backend. Si no hay teléfono se dice, no se
                pinta un botón que abriría WhatsApp sin nadie al otro lado. */}
            {p.wa_vacio ? (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-amber-300">
                <AlertTriangle size={13} /> Sin teléfono guardado: no se le puede escribir.
              </span>
            ) : (
              <button onClick={() => onMensaje(pedibles, nota)} disabled={!pedibles.length && !nota.trim()}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-40">
                <MessageSquare size={14} /> Ver el mensaje
              </button>
            )}
            <button onClick={() => onGuardar({ estados: es, nota })}
              className="inline-flex items-center gap-2 rounded-lg border border-dark-700 px-3 py-2 text-[12.5px] text-dark-300 hover:border-dark-500">
              <Check size={14} /> Guardar
            </button>
            {/* Los dos que la mueven de columna. Que llegue una foto a un
                WhatsApp no lo sabe la aplicación: lo marca una persona. */}
            {!p.recibido_en ? (
              <button onClick={() => onGuardar({ recibido: true })}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-500/40 px-3 py-2 text-[12.5px] text-violet-300 hover:bg-violet-500/10">
                <Eye size={14} /> Ya me lo ha mandado
              </button>
            ) : (
              <button onClick={() => onGuardar({ recibido: false })}
                className="inline-flex items-center gap-2 rounded-lg border border-dark-700 px-3 py-2 text-[12.5px] text-dark-400 hover:border-dark-500">
                <Hourglass size={14} /> Aún no lo ha mandado
              </button>
            )}
            <button onClick={() => onGuardar({ estados: Object.fromEntries(Object.keys(es).map((k) => [k, 'ok'])), falta_texto: '', recibido: false, triaje: 'completo' })}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-[12.5px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25">
              <CheckCircle2 size={14} /> Ya está completo
            </button>
            <button onClick={() => onGuardar({ archivada: true })}
              className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-dark-500 hover:text-dark-300">
              <Archive size={13} /> Ya está dentro
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── EL MENSAJE, ANTES DE MANDARLO ───────────────────────────────────────── */
function Mensaje({ msg, onCerrar, onEnviado, ronda, onSaltar }) {
  return (
    /* Fija a la ventana, no `sticky`: con veintiséis fichas la página es larga
       y un `sticky` al final del contenedor no se pega a nada, así que el
       mensaje salía debajo de todo y había que ir a buscarlo. Por encima del
       menú de móvil, que mide 53 px (gotcha 48). */
    <div className="card fixed bg-dark-900 backdrop-blur-md inset-x-3 bottom-[60px] z-30 mx-auto max-w-2xl border-brand-500/30 p-4 shadow-lg shadow-black/30 md:inset-x-6 md:bottom-4">
      <div className="flex items-center gap-2">
        <MessageSquare size={15} className="text-brand-300" />
        <b className="text-[14px] text-dark-100">Para {msg.nombre}</b>
        {ronda && (
          <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[11.5px] font-semibold text-brand-200">
            {ronda.i + 1} de {ronda.ids.length}
          </span>
        )}
        <button onClick={onCerrar} className="ml-auto text-dark-500 hover:text-dark-300">
          <X size={16} />
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap rounded-lg border border-dark-800 bg-dark-950 p-3 text-[13px] leading-relaxed text-dark-200">
        {msg.texto}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={msg.wa} target="_blank" rel="noopener noreferrer"
          className="btn-primary inline-flex items-center gap-2 no-underline">
          <Send size={14} /> Abrir WhatsApp
        </a>
        {/* Abrir WhatsApp no es haber enviado: lo confirma quien lo manda. */}
        <button onClick={onEnviado}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-[12.5px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25">
          <Check size={14} /> {ronda ? 'Enviado, siguiente' : 'Ya se lo he enviado'}
        </button>
        {/* SALTAR NO ES AVISAR. Uno al que hoy no toca escribir no puede quedar
            marcado como avisado: seria perderlo de vista sin haberle dicho nada. */}
        {onSaltar && (
          <button onClick={onSaltar}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] text-dark-400 hover:text-dark-200">
            <SkipForward size={14} /> Saltar
          </button>
        )}
      </div>
      <p className="mt-2 text-[11.5px] text-dark-500">
        Se abre WhatsApp con el texto escrito; tú le das a enviar. Marca «ya se lo he
        enviado» para que quede constancia de a quién se avisó y cuándo.
      </p>
    </div>
  )
}

/* ── ALTA A MANO ─────────────────────────────────────────────────────────── */
function Alta({ onHecho, onCerrar }) {
  const [f, setF] = useState({ nombre: '', telefono: '', ett: '', dni: '', falta_texto: '' })
  const [err, setErr] = useState('')
  const [yendo, setYendo] = useState(false)

  const enviar = async () => {
    setYendo(true); setErr('')
    try { await altaIncorporacion(f); onHecho() } catch (e) {
      setErr(e?.response?.data?.detail || 'No se ha podido dar de alta.')
    } finally { setYendo(false) }
  }

  return (
    <div className="card border-brand-500/30 p-4">
      <div className="flex items-center gap-2">
        <UserPlus size={15} className="text-brand-300" />
        <b className="text-[14px] text-dark-100">Añadir una persona</b>
        <button onClick={onCerrar} className="ml-auto text-dark-500 hover:text-dark-300"><X size={16} /></button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label className="label">Nombre *</label>
          <input className="input py-1.5 text-[12.5px]" value={f.nombre}
            onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </div>
        <div>
          <label className="label">Teléfono *</label>
          <input className="input py-1.5 text-[12.5px]" value={f.telefono}
            placeholder="612 34 56 78" onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        </div>
        <div>
          <label className="label">ETT</label>
          <input className="input py-1.5 text-[12.5px]" value={f.ett}
            onChange={(e) => setF({ ...f, ett: e.target.value })} />
        </div>
      </div>
      {err && <p className="mt-2 text-[12.5px] text-red-300">{err}</p>}
      <button onClick={enviar} disabled={yendo || !f.nombre.trim() || !f.telefono.trim()}
        className="btn-primary mt-3 inline-flex items-center gap-2 disabled:opacity-40">
        {yendo ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Añadir
      </button>
    </div>
  )
}

/* ── PEGAR EL LISTADO ENTERO ─────────────────────────────────────────────── */
function Pegar({ onHecho, onCerrar }) {
  const [texto, setTexto] = useState('')
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  const [yendo, setYendo] = useState(false)

  const enviar = async () => {
    setYendo(true); setErr('')
    try { const res = await importarIncorporaciones({ texto }); setR(res.data) } catch (e) {
      setErr(e?.response?.data?.detail || 'No se ha podido leer ese texto.')
    } finally { setYendo(false) }
  }

  return (
    <div className="card border-brand-500/30 p-4">
      <div className="flex items-center gap-2">
        <ClipboardPaste size={15} className="text-brand-300" />
        <b className="text-[14px] text-dark-100">Pegar el listado de candidatos</b>
        <button onClick={onCerrar} className="ml-auto text-dark-500 hover:text-dark-300"><X size={16} /></button>
      </div>
      {/* DOS FORMAS, Y LA VERDAD SOBRE LAS CONTRASENAS. Solo entendia el listado
          de la web de la ETT: otra ETT o un Excel propio daban «no he reconocido
          ninguna ficha». Y aqui ponia que las contraseñas no se guardan, cuando
          el lector de la ETT SI las guarda (ocultas, para revisar el expediente).
          Un texto que promete lo contrario de lo que pasa es peor que no decir nada. */}
      <p className="mt-1 text-[12px] leading-relaxed text-dark-400">
        Vale el listado de la ETT copiado tal cual, o una tabla de Excel con cabecera: una
        columna <b className="text-dark-200">Nombre</b> y otra con <b className="text-dark-200">Teléfono</b> o{' '}
        <b className="text-dark-200">DNI</b> (y si la tienes, Email, Nave, Código formación y Fecha
        formación). Se puede pegar todos los días: quien ya esté no se duplica.
      </p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-dark-400">
        Del listado de la ETT se guardan también sus contraseñas, ocultas, para revisar el
        expediente; nunca salen en WhatsApp ni en el CSV. De una tabla de Excel no se leen.
      </p>
      <textarea className="input mt-2 h-32 font-mono text-[11.5px]" value={texto}
        placeholder="Pega aquí…" onChange={(e) => setTexto(e.target.value)} />
      {err && <p className="mt-2 text-[12.5px] text-red-300">{err}</p>}
      {r && (
        <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-300">
          {r.leidas} fichas leídas{r.formato === 'tabla' ? ' de la tabla' : ''} · {r.nuevas} nuevas · {r.actualizadas} actualizadas
          {r.sin_telefono > 0 && (
            <span className="text-amber-300"> · {r.sin_telefono} sin teléfono (a esos no se les puede escribir)</span>
          )}
          {/* Filas de la tabla sin teléfono ni DNI: no se guardan, porque sin eso
              no se sabe quién es quién y acabarían juntadas en una sola ficha. */}
          {r.sin_clave > 0 && (
            <span className="text-amber-300"> · {r.sin_clave} filas sin teléfono ni DNI, no guardadas</span>
          )}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button onClick={enviar} disabled={yendo || texto.trim().length < 20}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-40">
          {yendo ? <Loader2 size={14} className="animate-spin" /> : <ClipboardPaste size={14} />} Leer
        </button>
        {r && (
          <button onClick={onHecho}
            className="inline-flex items-center gap-2 rounded-lg border border-dark-700 px-3 py-2 text-[12.5px] text-dark-300 hover:border-dark-500">
            <Check size={14} /> Listo
          </button>
        )}
      </div>
    </div>
  )
}

/* ── CÓMO SE PIDE CADA COSA ──────────────────────────────────────────────────
   Quien habla con la gente todos los días sabe mejor que nadie cómo pedir un
   carnet otra vez sin que suene a bronca. El texto de fábrica es un punto de
   partida, no una ley: aquí se cambia y queda cambiado para todos. */
function Plantilla({ pl, onCerrar, onGuardado }) {
  const [f, setF] = useState({
    saludo: pl.saludo, cuerpo: pl.cuerpo, cierre: pl.cierre,
    motivos: Object.fromEntries(Object.entries(pl.motivos)
      .map(([k, v]) => [k, { ...v }])),
  })
  const [err, setErr] = useState('')
  const [yendo, setYendo] = useState(false)

  const guardar = async () => {
    setYendo(true); setErr('')
    try { await guardarPlantillaIncorporaciones(f); onGuardado() } catch (e) {
      setErr(e?.response?.data?.detail || 'No se ha podido guardar.')
    } finally { setYendo(false) }
  }

  return (
    <div className="card border-brand-500/30 p-4">
      <div className="flex items-center gap-2">
        <Pencil size={15} className="text-brand-300" />
        <b className="text-[14px] text-dark-100">Cómo se pide cada cosa</b>
        <button onClick={onCerrar} className="ml-auto text-dark-500 hover:text-dark-300"><X size={16} /></button>
      </div>
      <p className="mt-1 text-[12px] text-dark-500">
        El mensaje se arma con estas tres piezas y lo que le falte a cada uno.
        <code className="mx-1 rounded bg-dark-800 px-1 text-[11px]">{'{nombre}'}</code>
        se sustituye por su nombre de pila.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {[['saludo', 'Saludo'], ['cuerpo', 'Explicación'], ['cierre', 'Despedida']].map(([k, t]) => (
          <div key={k}>
            <label className="label">{t}</label>
            <textarea className="input h-16 py-1.5 text-[12px]" value={f[k]}
              onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {Object.entries(f.motivos).map(([k, v]) => (
          <div key={k} className="grid gap-2 sm:grid-cols-[180px_1fr]">
            <input className="input py-1.5 text-[12px]" value={v.titulo}
              onChange={(e) => setF({ ...f, motivos: { ...f.motivos, [k]: { ...v, titulo: e.target.value } } })} />
            <input className="input py-1.5 text-[12px]" value={v.texto}
              onChange={(e) => setF({ ...f, motivos: { ...f.motivos, [k]: { ...v, texto: e.target.value } } })} />
          </div>
        ))}
      </div>

      {err && <p className="mt-2 text-[12.5px] text-red-300">{err}</p>}
      <button onClick={guardar} disabled={yendo}
        className="btn-primary mt-3 inline-flex items-center gap-2 disabled:opacity-40">
        {yendo ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar
      </button>
    </div>
  )
}

/* ── LA CUENTA DE ONBOARDING ─────────────────────────────────────────────────
   Para entrar a revisar el expediente de esa persona sin ir a buscarla al
   listado de la ETT, que es lo que hoy cuesta dos minutos por cada una.

   LA CONTRASEÑA VA TAPADA Y NO SE ENSEÑA SOLA. No es pudor: esta pantalla se
   mira con gente al lado y se comparte por captura, y una contraseña en una
   captura de pantalla ya no se recoge. Se destapa cuando hace falta y se copia
   sin llegar a verse. Tampoco sale NUNCA en el WhatsApp que se manda — eso lo
   vigila un caso en `test_incorporaciones.py`. */
function Cuenta({ p }) {
  const [ver, setVer] = useState(false)
  const [copiado, setCopiado] = useState('')
  if (!p.email && !p.clave_email && !p.codigo_formacion) return null

  const copiar = (que, valor) => {
    navigator.clipboard?.writeText(valor)
    setCopiado(que)
    setTimeout(() => setCopiado(''), 1500)
  }

  return (
    <div className="rounded-lg border border-dark-800 bg-dark-950/60 p-2.5">
      <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-dark-500">
        Cuenta de onboarding
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
        {p.email && (
          <span className="inline-flex items-center gap-1.5 text-dark-200">
            <AtSign size={12} className="text-dark-600" />
            <span className="font-mono">{p.email}</span>
            <button onClick={() => copiar('email', p.email)}
              className="text-dark-500 hover:text-dark-200" title="Copiar el correo">
              {copiado === 'email' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
          </span>
        )}
        {p.clave_email && (
          <span className="inline-flex items-center gap-1.5 text-dark-200">
            <span className="font-mono">{ver ? p.clave_email : '••••••••••'}</span>
            <button onClick={() => setVer(!ver)} className="text-dark-500 hover:text-dark-200"
              title={ver ? 'Tapar' : 'Ver la contraseña'}>
              {ver ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
            <button onClick={() => copiar('clave', p.clave_email)}
              className="text-dark-500 hover:text-dark-200" title="Copiar sin verla">
              {copiado === 'clave' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
          </span>
        )}
        {p.codigo_formacion && (
          <span className="inline-flex items-center gap-1.5 text-dark-300">
            <GraduationCap size={12} className="text-dark-600" />
            <span className="font-mono text-[11.5px]">{p.codigo_formacion}</span>
            <button onClick={() => copiar('form', p.codigo_formacion)}
              className="text-dark-500 hover:text-dark-200" title="Copiar el código de la formación">
              {copiado === 'form' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
          </span>
        )}
      </div>
    </div>
  )
}

/* En qué punto está, como insignia. Agrupando por lo que falta la columna ya no
   lo dice, y sin esto no se distingue a quien no se ha escrito todavía de quien
   lleva tres días sin contestar — que es la diferencia entre trabajo que hacer
   y trabajo que esperar. */
function Punto({ fase }) {
  const f = FASES.find((x) => x.id === fase)
  if (!f || fase === 'listo') return null
  const Icono = f.icono
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] ${f.tono}`}>
      <Icono size={10} /> {f.titulo}
    </span>
  )
}

/* ── LA TABLA: QUIÉN × QUÉ PAPEL ─────────────────────────────────────────────
   Para ver de un vistazo a quién le falta qué, sin abrir veintiséis fichas. Es
   la vista que se mira para decidir a quién llamar hoy, y la que se enseña en
   una reunión.

   Cada celda se pulsa y avanza al siguiente punto del recorrido. Se guarda al
   instante: una tabla con botón de guardar acaba con cambios a medias cuando
   alguien cierra la pestaña.

   La tabla es lo ÚNICO que puede desbordar a lo ancho, y por eso va en su
   propio contenedor con scroll: si desbordara la página entera, el resto del
   panel se movería con ella. */
function Tabla({ personas, cat, nombres, onCelda }) {
  const docs = Object.entries(cat)
  if (!personas.length) return null
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-dark-800">
            <th className="sticky left-0 z-10 bg-dark-900 px-3 py-2 text-left font-semibold text-dark-300">
              Persona
            </th>
            {docs.map(([k, v]) => (
              <th key={k} className="px-2 py-2 text-left text-[11.5px] font-semibold text-dark-400">
                {v.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {personas.map((p) => (
            <tr key={p.id} className="border-b border-dark-800/60 last:border-0">
              <td className="sticky left-0 z-10 bg-dark-900 px-3 py-1.5">
                <span className="block font-medium text-dark-100">{p.nombre}</span>
                <span className="block text-[11px] text-dark-500">{p.ett} · {p.telefono}</span>
              </td>
              {docs.map(([k]) => {
                const st = (p.estados || {})[k] || ''
                return (
                  <td key={k} className="px-1.5 py-1.5">
                    <button onClick={() => onCelda(p, k, SIGUIENTE[st])}
                      className={`w-full rounded-md px-2 py-1 text-[11.5px] ring-1 transition ${TONO[st]}`}
                      title="Pulsa para avanzarlo">
                      {st ? nombres[st] : '—'}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
