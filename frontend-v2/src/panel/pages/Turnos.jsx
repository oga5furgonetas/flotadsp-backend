import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, CalendarClock, Users, ChevronLeft, ChevronRight, Save, Zap,
  Upload, Check, X, Settings2, AlertTriangle, Inbox, ClipboardPaste, Ban, Trash2,
  Brush, Undo2, Search, CalendarRange, Eraser, Rows3, CopyPlus, UserMinus, Download,
} from 'lucide-react'
import {
  getShifts, getShiftCoverage, getDrivers, saveShiftsBulk, setShiftSettings,
  generateShiftsAuto, getRouteDemand, setRouteDemand, getShiftRequests,
  resolveShiftRequest, importShifts, getCodigosCuadrante, setCodigosCuadrante,
  importShiftsPegado, getShiftBlocks, createShiftBlock, deleteShiftBlock,
  setAliasNombres, updateDriver, exportarCuadrante,
} from '../api'
import { useT } from '../../i18n'
import { lista } from '../../lib/lista'
import { canSee } from '../auth'
import { isoLocal } from '../../lib/fecha'

const DIAS = 14

/* ── EL CÓDIGO, NO EL TIPO ─────────────────────────────────────────────────
   La app entiende tres tipos (trabaja / libre / extra) y con eso decide
   cobertura, peticiones y lo que ve el conductor. Pero el cuadrante que sale
   de Amazon tiene DOCE códigos, y siete de ellos caen en "libre": V, COMP,
   N/D, N/P, SUSP, N/T y N/T APROB significan cosas muy distintas.

   Pintar sólo el tipo convertía el cuadrante en una pared de dos letras que no
   se parecía a la hoja de la que había salido. Por eso la rejilla trabaja con
   el CÓDIGO: `grid['id|fecha']` guarda 'BKP', 'V', 'N/D'… y el tipo se deduce
   de él al guardar. */

/* CINCO COLORES PARA DIECISÉIS CÓDIGOS, y es a propósito.

   Con un color por código la rejilla era un arcoíris donde no se distinguía
   nada. Todas las guías serias de color categórico —Okabe-Ito, la paleta de
   IBM, las recomendaciones de accesibilidad— dicen lo mismo: NO PASAR DE SEIS.
   A partir de ahí los colores dejan de diferenciarse a tamaño pequeño, y una
   celda de cuadrante mide 22 px.

   Así que el COLOR dice de qué familia es el día —se lee de lejos, de un
   vistazo— y el TEXTO DEL CÓDIGO, que siempre está dentro de la celda, dice
   cuál es exactamente. Dos canales: el que funciona en diagonal desde el otro
   lado de la mesa, y el que funciona cuando te acercas.

   El nombre de la familia lo manda el servidor; aquí sólo se traduce a clases. */
const COLORES = {
  ruta:     'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
  apoyo:    'bg-teal-500/[0.12] text-teal-300 border-teal-500/30',
  libre:    'bg-dark-800/70 text-dark-400 border-dark-700/70',
  previsto: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
  aviso:    'bg-red-500/15 text-red-300 border-red-500/35',
}
/* El mismo color, pero plano y sin borde: para los cuadraditos de la leyenda y
   de la paleta, donde no hay rejilla que acompañe. */
const FAMILIA_NOMBRE = {
  ruta: 'Sale a ruta', apoyo: 'Trabaja sin ruta', libre: 'Día libre',
  previsto: 'Ausencia prevista', aviso: 'Ausencia no prevista',
}

/* Lo que se usa si el servidor no contesta. La rejilla NO puede quedarse en
   blanco por eso: sería peor que el problema. */
const COD_DEF = {
  '1':         { tipo: 'trabaja', etiqueta: 'Trabaja',        color: 'ruta' },
  'BKP':       { tipo: 'trabaja', etiqueta: 'Backup',         color: 'apoyo' },
  'S':         { tipo: 'trabaja', etiqueta: 'Site (oficina)', color: 'apoyo' },
  'RIDE':      { tipo: 'trabaja', etiqueta: 'Ride along',     color: 'apoyo' },
  'EXTRA':     { tipo: 'extra',   etiqueta: 'Extra',          color: 'apoyo' },
  'N/T':       { tipo: 'libre',   etiqueta: 'No trabaja',     color: 'libre' },
  'L':         { tipo: 'libre',   etiqueta: 'Libre',          color: 'libre' },
  'V':         { tipo: 'libre',   etiqueta: 'Vacaciones',     color: 'previsto' },
  'COMP':      { tipo: 'libre',   etiqueta: 'Compensa',       color: 'previsto' },
  'N/T APROB': { tipo: 'libre',   etiqueta: 'Libre aprobado', color: 'previsto' },
  'N/D':       { tipo: 'libre',   etiqueta: 'No disponible',  color: 'aviso' },
  'N/P':       { tipo: 'libre',   etiqueta: 'No presentado',  color: 'aviso' },
  'SUSP':      { tipo: 'libre',   etiqueta: 'Suspendido',     color: 'aviso' },
}

/* En la CELDA no caben nueve caracteres. Se acorta sólo ahí: en la paleta y en
   la leyenda va el código entero, porque abreviado salían dos botones 'N/T'
   —'N/T' y 'N/T APROB'— y no había manera de saber cuál era cuál. En la celda
   no hay confusión posible: el aprobado lleva anillo verde y el tooltip dice
   cuál es. */
const ABREV = { 'N/T APROB': 'N/T', EXTRA: 'EX', 'RIDE ALONG': 'RIDE' }
const corto = (c) => ABREV[c] || c

/* Turnos guardados ANTES de que se empezara a guardar el código: sólo tienen
   tipo. Se les pone el código más probable para que se puedan ver y pintar,
   en vez de dejarlos en blanco. */
const TIPO_A_COD = { trabaja: '1', libre: 'N/T', extra: 'EXTRA' }

/* Ordenar por nombre SIN que las mayúsculas y las tildes manden.

   Las fichas están escritas de todas las maneras: 'BERNARDO PUENTE', 'belen
   fernandez lariño', 'Borja Salvado Varela'. Un `sort()` normal compara por
   código de carácter, así que todas las minúsculas caían detrás de todas las
   mayúsculas y la lista parecía cualquier cosa menos alfabética. `localeCompare`
   con sensitivity 'base' iguala mayúsculas y tildes, que es como lo ordenaría
   una persona. */
const porNombre = (a, b) =>
  (a?.name || '').localeCompare(b?.name || '', 'es', { sensitivity: 'base' })

/* ¿Es lunes? Marca el corte de semana en la rejilla: en 31 columnas seguidas
   no hay forma de saber dónde empieza una semana sin una línea. */
const lunes = (iso) => new Date(iso + 'T12:00:00').getDay() === 1

/* Lunes de la semana de una fecha (la semana laboral empieza en lunes). */
function lunesDe(d) {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
function sumaDias(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return isoLocal(d)
}

export default function Turnos() {
  const { center, centers } = useOutletContext()
  const { t, lang } = useT()
  const noCenter = center === 'Todos'

  const [desde, setDesde] = useState(() => isoLocal(lunesDe(new Date())))
  const [drivers, setDrivers] = useState(null)
  const [grid, setGrid] = useState({})          // 'driverId|fecha' -> tipo
  const [sucio, setSucio] = useState(false)     // hay cambios sin guardar
  /* TRES numeros por dia, y son cosas distintas:
       · maximas  — el techo comprometido con Amazon: lo que habria que poder
                    cubrir si lo pidieran todo. Se rellena con antelacion.
       · demanda  — las rutas que piden ESE dia. Llega mucho mas tarde.
       · cobertura— la gente que estas poniendo. Sale de la rejilla, no se
                    escribe.
     Mirar solo la cobertura no dice nada: 39 personas es mucho o poco segun
     lo que pidan, y quedarse corto respecto al maximo es lo que hace que
     Amazon no te ofrezca rutas la proxima vez. */
  const [demanda, setDemanda] = useState({})    // fecha -> rutas que piden (string)
  const [maximas, setMaximas] = useState({})    // fecha -> techo comprometido (string)
  const [min, setMin] = useState(0)
  const [solicitudes, setSolicitudes] = useState([])
  const [err, setErr] = useState('')
  const [aviso, setAviso] = useState('')
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState('')    // '' | 'guardar' | 'auto' | 'importar'
  const ficheroRef = useRef(null)
  const [previa, setPrevia] = useState(null)    // resumen del Excel antes de guardar
  /* Nombre del cuadrante → id del conductor, mientras se emparejan a mano en la
     vista previa. Al guardarlos quedan para siempre y el mes que viene entran
     solos. */
  const [emparejando, setEmparejando] = useState({})
  const [pegado, setPegado] = useState('')      // el cuadrante copiado de Sheets
  const [verPegar, setVerPegar] = useState(false)
  const [bloqueos, setBloqueos] = useState([])
  const [verBloqueos, setVerBloqueos] = useState(false)
  const [nuevoBloqueo, setNuevoBloqueo] = useState({ desde: '', hasta: '', motivo: '', driver_id: '' })

  /* ── LA REJILLA ─────────────────────────────────────────────────────────
     `pincel` es el modo de trabajo. Con un pincel elegido, tocar una celda la
     pone de ese tipo y arrastrar pinta seguido — que es como se rellena un mes
     entero sin morir a clics. Sin pincel se mantiene el comportamiento de
     antes (cada clic pasa al siguiente tipo), para quien ya estaba
     acostumbrado. */
  const [codigos, setCodigos] = useState(COD_DEF)
  const [pincel, setPincel] = useState('1')
  const pintando = useRef(false)
  const [busca, setBusca] = useState('')
  /* 'cuadrante' = sólo quien tiene algún turno puesto en lo que se está viendo.
     Es el modo por defecto porque el problema real no es que falte gente: es
     que SOBRA. En OGA5 hay 71 fichas activas y en el cuadrante de agosto
     estaban 61 — las otras 10 son bajas que nadie marcó, y en la rejilla
     ocupaban diez filas vacías que no se podían distinguir de un olvido. */
  const [quien, setQuien] = useState('cuadrante')   // 'cuadrante' | 'todos'
  const [denso, setDenso] = useState(false)
  const [confirmarBaja, setConfirmarBaja] = useState(null)  // conductor a sacar
  const [vistaMes, setVistaMes] = useState(false)
  const [aprobados, setAprobados] = useState(new Set())  // 'did|fecha' con día libre CONCEDIDO
  const historial = useRef([])                            // para deshacer
  const [puedeDeshacer, setPuedeDeshacer] = useState(false)
  const gridOriginal = useRef({})                         // lo que había al cargar
  /* La hora entre paréntesis de la celda ("V (05:43)"). No se pinta —no cabe—
     pero se enseña al pasar por encima y se conserva al guardar: al conductor
     le importa más esa hora que el código. */
  const horas = useRef({})
  const tablaRef = useRef(null)
  // El mes NO sale del fichero: la plantilla de Amazon arrastra en la cabecera
  // el texto del mes anterior ("Desde: 01-06-2026" en un fichero de agosto).
  const [mesImport, setMesImport] = useState(() => new Date().toISOString().slice(0, 7))

  /* Ver las peticiones lo puede hacer cualquiera del centro; decidirlas no.
     Quién puede se configura por usuario en Usuarios → permisos, porque cada
     empresa reparte esto de una manera. El servidor lo comprueba también: un
     botón escondido no protege nada. */
  const puedeAprobar = canSee('aprobar-dias')

  /* Quincena o mes completo. El mes entero cabe: la columna del nombre se
     queda fija y los días se desplazan en horizontal. */
  const dias = useMemo(() => {
    if (!vistaMes) return Array.from({ length: DIAS }, (_, i) => sumaDias(desde, i))
    const d = new Date(desde + 'T12:00:00')
    const y = d.getFullYear()
    const m = d.getMonth()
    const total = new Date(y, m + 1, 0).getDate()
    return Array.from({ length: total }, (_, i) => isoLocal(new Date(y, m, i + 1)))
  }, [desde, vistaMes])
  /* El rango que se PIDE al servidor sale de los días que se van a pintar, no
     de `desde`. En "mes completo" `dias` empieza el día 1 aunque la quincena
     empiece el 3: pidiendo desde el 3 los días 1 y 2 salían vacíos teniendo
     turnos guardados, y la cobertura de esos dos días marcaba 0. */
  const primerDia = dias[0]
  const hasta = dias[dias.length - 1]

  /* Se PIDE el mes entero aunque sólo se pinten catorce días.

     Porque "quién está en el cuadrante" es una pregunta del mes, no de la
     quincena: alguien que sólo trabaja del 1 al 10 aparecería como "sobra" si
     estás mirando del 17 al 30, y eso es justo el falso positivo que hace que
     no te puedas fiar del aviso. Son 61 × 31 documentos, unos 1.900: nada. */
  const mesDesde = useMemo(() => primerDia.slice(0, 8) + '01', [primerDia])
  const mesHasta = useMemo(() => {
    const d = new Date(hasta + 'T12:00:00')
    return isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  }, [hasta])

  const cargar = useCallback(async () => {
    if (noCenter) return
    setCargando(true); setErr(''); setAviso('')
    try {
      const [rd, rs, rc, rdem, rreq, rapr, rcod] = await Promise.all([
        getDrivers(center),
        getShifts(center, mesDesde, mesHasta),
        getShiftCoverage(center, primerDia, hasta),
        getRouteDemand(center, primerDia, hasta),
        getShiftRequests(center, 'pendiente'),
        // Los días YA CONCEDIDOS. Sin esto, la rejilla te deja poner a trabajar
        // a alguien el día que le aprobaste libre y no dice nada — el peor
        // fallo posible aquí, porque se descubre el día que no aparece.
        getShiftRequests(center, 'aprobado'),
        // Los códigos y sus colores. Si esto falla se sigue con COD_DEF: la
        // rejilla no se queda en blanco por no poder leer una tabla de colores.
        getCodigosCuadrante().catch(() => null),
      ])
      const info = rcod?.data?.info
      setCodigos(info && Object.keys(info).length ? info : COD_DEF)
      // Alfabético. La lista venía en el orden en que están en la base de
      // datos, que no es ninguno, y con 71 fichas eso hace imposible buscar a
      // nadie con la vista.
      setDrivers(lista(rd.data).filter((d) => d.active !== false).sort(porNombre))
      const g = {}
      for (const s of lista(rs.data?.shifts)) {
        g[`${s.driver_id}|${s.date}`] = s.cod || TIPO_A_COD[s.type] || 'N/T'
      }
      horas.current = {}
      for (const s of lista(rs.data?.shifts)) {
        if (s.hora) horas.current[`${s.driver_id}|${s.date}`] = s.hora
      }
      setGrid(g); setSucio(false)
      gridOriginal.current = { ...g }
      historial.current = []; setPuedeDeshacer(false)
      setAprobados(new Set(
        lista(rapr.data?.requests)
          .filter((r) => r.type === 'libre')
          .map((r) => `${r.driver_id}|${r.date}`)))
      setMin(rc.data?.min || 0)
      const dm = {}
      const mx = {}
      for (const [f, v] of Object.entries(rdem.data?.demand || {})) {
        if (v?.objetivo != null) dm[f] = String(v.objetivo)
        if (v?.maximo != null) mx[f] = String(v.maximo)
      }
      setDemanda(dm)
      setMaximas(mx)
      setSolicitudes(lista(rreq.data?.requests))
    } catch {
      setErr(t('turns.error'))
    } finally {
      setCargando(false)
    }
  }, [center, primerDia, hasta, mesDesde, mesHasta, noCenter])

  useEffect(() => { cargar() }, [cargar])

  /* Avisa antes de perder cambios del cuadrante al cerrar la pestaña. */
  useEffect(() => {
    if (!sucio) return
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [sucio])

  /* Los que se ven ahora mismo. Con 85 conductores, buscar por nombre no es un
     lujo: es la diferencia entre encontrar a alguien y rendirse. */
  /* La paleta: un botón por significado, no por código. 'T' y 'X' quieren
     decir lo mismo que '1', y 'RA' lo mismo que 'RIDE'; poner los cuatro sólo
     alarga la fila y hace dudar de cuál pulsar. Se queda el primero de cada
     etiqueta, que es el que se usa de verdad en la hoja. */
  const paleta = useMemo(() => {
    const vistas = new Set()
    const out = []
    for (const [cod, ui] of Object.entries(codigos)) {
      if (vistas.has(ui.etiqueta)) continue
      vistas.add(ui.etiqueta)
      out.push({ cod, ui })
    }
    return out
  }, [codigos])

  /* Quién tiene algo puesto en lo que se está viendo. */
  const enCuadrante = useMemo(() => {
    const s = new Set()
    for (const k of Object.keys(grid)) s.add(k.split('|')[0])
    return s
  }, [grid])

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    let ds = drivers || []
    if (quien === 'cuadrante') ds = ds.filter((d) => enCuadrante.has(d.id))
    if (q) ds = ds.filter((d) => (d.name || '').toLowerCase().includes(q))
    return ds
  }, [drivers, busca, quien, enCuadrante])

  /* Los que están en la ficha pero no en el cuadrante. Se cuentan aunque estén
     escondidos: si no, esconderlos sería taparlos. */
  const sobran = useMemo(
    () => (drivers || []).filter((d) => !enCuadrante.has(d.id)),
    [drivers, enCuadrante])

  /* Saca a alguien del cuadrante de verdad: le marca la ficha como no activa.
     Es lo mismo que hacer la baja en Conductores, pero desde donde se nota el
     problema — que es aquí, viendo su fila vacía mes tras mes. */
  const darDeBaja = async (d) => {
    setConfirmarBaja(null); setErr(''); setAviso('')
    try {
      await updateDriver(d.id, { active: false })
      setDrivers((ds) => (ds || []).filter((x) => x.id !== d.id))
      setAviso(`${d.name} ya no sale en el cuadrante. Sigue en Conductores, dado de baja.`)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo dar de baja.')
    }
  }

  /* CHOQUES: alguien puesto a trabajar un día que se le CONCEDIÓ libre.
     Es el fallo que más caro sale, porque no se descubre al hacerlo — se
     descubre el día que esa persona no aparece. Se marca la celda y se cuenta
     arriba; no se corrige solo, porque a veces se hace a propósito y hablado. */
  /* Del código al tipo. Un código que ya no esté en la tabla (porque se
     borró en la pantalla de códigos) no puede tumbar la rejilla: cae en
     'libre', que es lo que menos daño hace. */
  const tipoDe = useCallback(
    (cod) => (codigos[cod] || COD_DEF[cod] || {}).tipo || 'libre', [codigos])
  const uiDe = useCallback(
    (cod) => codigos[cod] || COD_DEF[cod] || { tipo: 'libre', etiqueta: cod, color: 'gris' },
    [codigos])

  /* Cuánta gente sale a ruta cada día. Va DEBAJO de `tipoDe` a propósito: un
     useMemo se ejecuta al pintar, y si se declara antes revienta al usarlo. */
  const cobertura = useMemo(() => {
    const c = {}
    for (const [k, v] of Object.entries(grid)) {
      const tp = tipoDe(v)
      if (tp === 'trabaja' || tp === 'extra') {
        const f = k.split('|')[1]
        c[f] = (c[f] || 0) + 1
      }
    }
    return c
  }, [grid, tipoDe])   // se indexa por fecha, así que sobra filtrar

  const choques = useMemo(() => {
    // Sólo los días que se ven. El aviso de arriba dice "están marcados en rojo
    // en la rejilla": contar uno que cae fuera de la vista lo convertiría en
    // mentira, y en un aviso que no se puede resolver.
    const enVista = new Set(dias)
    const s = new Set()
    for (const [k, v] of Object.entries(grid)) {
      if (!enVista.has(k.split('|')[1])) continue
      const tp = tipoDe(v)
      if ((tp === 'trabaja' || tp === 'extra') && aprobados.has(k)) s.add(k)
    }
    return s
  }, [grid, aprobados, tipoDe, dias])

  /* Días de trabajo de cada uno en lo que se está viendo. Sin esto no hay forma
     de ver de un vistazo que a uno le has puesto 14 y a otro 3. */
  const totales = useMemo(() => {
    const m = {}
    for (const d of (drivers || [])) {
      let n = 0
      for (const f of dias) {
        const tp = tipoDe(grid[`${d.id}|${f}`])
        if (tp === 'trabaja' || tp === 'extra') n += 1
      }
      m[d.id] = n
    }
    return m
  }, [drivers, dias, grid, tipoDe])

  /* Cuántas celdas han cambiado respecto a lo cargado. "Sin guardar" a secas no
     dice si has tocado una casilla o doscientas. */
  const nCambios = useMemo(() => {
    const o = gridOriginal.current || {}
    const claves = new Set([...Object.keys(o), ...Object.keys(grid)])
    let n = 0
    for (const k of claves) if ((o[k] || '') !== (grid[k] || '')) n += 1
    return n
  }, [grid, sucio])

  const descartar = () => {
    setGrid({ ...gridOriginal.current })
    historial.current = []; setPuedeDeshacer(false)
    setSucio(false)
  }

  /* Guarda el estado ANTES de tocar nada, para poder deshacer. Se limita a 30
     pasos: más no hace falta y ocuparía memoria con 85 conductores × 31 días. */
  const recordar = () => {
    historial.current.push(grid)
    if (historial.current.length > 30) historial.current.shift()
    setPuedeDeshacer(true)
  }

  const deshacer = () => {
    const previo = historial.current.pop()
    if (!previo) return
    setGrid(previo)
    setPuedeDeshacer(historial.current.length > 0)
    setSucio(true)
  }

  /* Una celda. El pincel es un código; con la goma (pincel = null) se vacía,
     que es distinto de poner "libre": vacío es "no hay nada puesto ese día". */
  const aplicar = (did, fecha, conHistorial = true) => {
    const k = `${did}|${fecha}`
    if (conHistorial) recordar()
    setGrid((g) => {
      if (!pincel) { const n = { ...g }; delete n[k]; return n }
      return { ...g, [k]: pincel }
    })
    setSucio(true)
  }

  /* Teclado. Con 12 códigos, ir al ratón a la paleta cada vez que cambias de
     código es la mitad del trabajo; las teclas 1..9 y 0 eligen pincel y la
     tecla . coge la goma. No se activa mientras se escribe en un campo. */
  useEffect(() => {
    const teclas = (e) => {
      const el = e.target
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const orden = Object.keys(codigos)
      if (e.key === '.' || e.key === 'Delete') { setPincel(null); return }
      const i = e.key === '0' ? 9 : '123456789'.indexOf(e.key)
      if (i >= 0 && orden[i]) setPincel(orden[i])
    }
    window.addEventListener('keydown', teclas)
    return () => window.removeEventListener('keydown', teclas)
  }, [codigos])

  /* La cruz: al pasar por una celda se marcan su fila y su columna enteras.
     En 31 columnas es lo único que evita leer el día equivocado.

     Se hace tocando el DOM a mano y NO con estado de React a propósito: con 85
     conductores × 31 días son 2.600 celdas, y volver a pintarlas en cada
     movimiento del ratón deja la pantalla pegajosa. */
  const cruz = useCallback((td) => {
    const tb = tablaRef.current
    if (!tb) return
    tb.querySelectorAll('.xr').forEach((x) => x.classList.remove('xr'))
    if (!td) return
    const col = td.dataset.col
    if (col == null) return
    tb.querySelectorAll(`[data-col="${col}"]`).forEach((x) => x.classList.add('xr'))
    td.closest('tr')?.querySelectorAll('td').forEach((x) => x.classList.add('xr'))
  }, [])

  /* Arrastrar para pintar. El mouseup se escucha en la ventana entera: si se
     suelta el ratón fuera de la tabla, hay que dejar de pintar igualmente —
     si no, se sigue pintando al volver a entrar sin tener el botón pulsado. */
  useEffect(() => {
    const soltar = () => { pintando.current = false }
    window.addEventListener('mouseup', soltar)
    window.addEventListener('mouseleave', soltar)
    return () => {
      window.removeEventListener('mouseup', soltar)
      window.removeEventListener('mouseleave', soltar)
    }
  }, [])

  /* Un día entero para todos los que se ven. Respeta el filtro de búsqueda a
     propósito: si has filtrado por "ETT", rellenas sólo a los ETT. */
  const columnaEntera = (fecha) => {
    if (!pincel) return
    recordar()
    setGrid((g) => {
      const n = { ...g }
      for (const d of visibles) {
        if (pincel) n[`${d.id}|${fecha}`] = pincel
        else delete n[`${d.id}|${fecha}`]
      }
      return n
    })
    setSucio(true)
  }

  /* COPIAR LA SEMANA ANTERIOR. Es la herramienta que más se usa en cualquier
     programa de cuadrantes serio (When I Work, Homebase): un cuadrante real
     cambia poco de una semana a la siguiente, así que se copia y se retocan
     cuatro celdas, en vez de rellenar 61 × 7 a mano.

     Copia sobre lo que se ve: si has filtrado por un nombre, sólo mueve el
     suyo. Y no toca los días que ya tienen algo puesto salvo que se pida. */
  const copiarSemanaAnterior = (pisar) => {
    recordar()
    setGrid((g) => {
      const n = { ...g }
      for (const d of visibles) {
        for (const f of dias) {
          const k = `${d.id}|${f}`
          if (!pisar && n[k]) continue
          const previo = g[`${d.id}|${sumaDias(f, -7)}`]
          if (previo) n[k] = previo
          else if (pisar) delete n[k]
        }
      }
      return n
    })
    setSucio(true)
  }

  /* REPETIR UN PATRÓN. 'Trabaja 5, libra 2' y variantes: se elige el patrón y
     se estampa desde el primer día que se ve hasta el último, para todos los
     que se ven. Es como se montan los cuadrantes rotativos a mano en Excel,
     sólo que sin arrastrar la fórmula. */
  const aplicarPatron = (trabaja, libra) => {
    if (!pincel) return
    recordar()
    const libreCod = codigos['N/T'] ? 'N/T' : 'L'
    setGrid((g) => {
      const n = { ...g }
      visibles.forEach((d, iDriver) => {
        // Cada persona empieza el ciclo un día más tarde que la anterior. Sin
        // esto, un patrón 5/2 pone a TODOS a librar los mismos dos días y el
        // cuadrante se queda sin nadie ese fin de semana.
        let paso = iDriver % (trabaja + libra)
        for (const f of dias) {
          n[`${d.id}|${f}`] = paso < trabaja ? pincel : libreCod
          paso = (paso + 1) % (trabaja + libra)
        }
      })
      return n
    })
    setSucio(true)
  }

  /* Pinta una fila entera (todo lo que se ve de un conductor) de una vez. */
  const filaEntera = (did, cod) => {
    recordar()
    setGrid((g) => {
      const n = { ...g }
      for (const f of dias) n[`${did}|${f}`] = cod
      return n
    })
    setSucio(true)
  }

  const guardar = async () => {
    setOcupado('guardar'); setErr(''); setAviso('')
    try {
      const items = []
      for (const d of drivers || []) {
        for (const f of dias) {
          const k = `${d.id}|${f}`
          const cod = grid[k]
          if (!cod) continue
          const it = { driver_id: d.id, driver_name: d.name, center, date: f,
                       type: tipoDe(cod), cod }
          if (horas.current[k]) it.hora = horas.current[k]
          items.push(it)
        }
      }
      const r = await saveShiftsBulk(items)
      setSucio(false)
      setAviso(t('turns.saved').replace('{n}', r.data?.saved ?? items.length))
    } catch {
      setErr(t('turns.save.err'))
    } finally { setOcupado('') }
  }

  /* Descargar el cuadrante en .xlsx.

     Se pide como blob y se dispara el <a> a mano porque el endpoint exige el
     token: un enlace normal no manda la cabecera y se comería un 401 sin decir
     por qué. Y se avisa si hay cambios sin guardar, porque el fichero sale de
     la BASE DE DATOS, no de lo que se ve en pantalla — bajarse una hoja sin lo
     que acabas de pintar y no enterarte sería el peor final posible. */
  const descargar = async () => {
    if (sucio && !window.confirm(
      'Tienes cambios sin guardar. El Excel sale de lo guardado, así que no los llevará. ¿Descargar de todas formas?')) return
    setOcupado('descargar'); setErr('')
    try {
      const r = await exportarCuadrante(center, primerDia, hasta)
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `cuadrante-${center}-${primerDia}-a-${hasta}.xlsx`
      document.body.appendChild(a); a.click(); a.remove()
      // Sin esto el blob se queda en memoria hasta recargar la página.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo generar el Excel.')
    } finally { setOcupado('') }
  }

  /* Se mandan los dos numeros SIEMPRE, aunque solo hayas tocado uno. Si se
     mandara solo el editado, el otro llegaria vacio al servidor y se borraria:
     rellenar las maximas del mes y perderlas al escribir la primera demanda. */
  const guardarDemanda = async (dm = demanda, mx = maximas) => {
    const items = dias.map((f) => ({
      date: f,
      objetivo: dm[f] === '' || dm[f] == null ? null : dm[f],
      maximo: mx[f] === '' || mx[f] == null ? null : mx[f],
    }))
    try { await setRouteDemand(center, items) } catch { setErr(t('turns.demand.err')) }
  }

  /* Copia el primer maximo que encuentre a los dias que esten en blanco. Las
     maximas suelen ser el mismo numero casi todo el mes, y escribirlo treinta
     y una veces a mano es exactamente el tipo de cosa por la que se sigue
     usando la hoja de calculo. */
  const rellenarMaximas = () => {
    const base = dias.map((f) => maximas[f]).find((v) => v != null && v !== '')
    if (!base) { setErr('Escribe primero un máximo en un día y luego pulsa rellenar.'); return }
    const mx = { ...maximas }
    for (const f of dias) if (mx[f] == null || mx[f] === '') mx[f] = base
    setMaximas(mx)
    guardarDemanda(demanda, mx)
  }

  const generar = async () => {
    setOcupado('auto'); setErr(''); setAviso('')
    try {
      await guardarDemanda()                    // el generador lee la demanda de la BD
      const r = await generateShiftsAuto(center, primerDia, hasta)
      const g = {}
      for (const f of dias) for (const d of drivers || []) g[`${d.id}|${f}`] = 'N/T'
      for (const a of lista(r.data?.assignments)) {
        g[`${a.driver_id}|${a.date}`] = TIPO_A_COD[a.type] || 'N/T'
      }
      setGrid(g); setSucio(true)
      setAviso(r.data?.resumen || t('turns.auto.ok'))
    } catch (e) {
      setErr(e?.response?.data?.detail || t('turns.auto.err'))
    } finally { setOcupado('') }
  }

  const guardarMin = async (n) => {
    setMin(n)
    try { await setShiftSettings(center, n) } catch { setErr(t('turns.min.err')) }
  }

  /* Importar el cuadrante en dos pasos: primero se enseña lo que va a hacer y
     sólo se guarda al confirmar. Con 61 conductores y 31 días son casi 1.900
     turnos: escribirlos sin que nadie los haya mirado es demasiado. */
  /* PEGAR EL CUADRANTE. Es mas fiable que el Excel porque lo que se ve es lo
     que entra: no depende de donde este la fila de dias ni la columna del
     nombre en el fichero original. Mismos dos pasos — se enseña lo que va a
     hacer y solo se guarda al confirmar. */
  const previsualizarPegado = async () => {
    if (!pegado.trim()) { setErr('Pega el cuadrante primero'); return }
    setOcupado('importar'); setErr(''); setAviso(''); setPrevia(null)
    try {
      const r = await importShiftsPegado({ center, mes: mesImport, texto: pegado })
      setPrevia({ ...r.data, pegado: true })
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'No se pudo leer lo pegado.')
    } finally { setOcupado('') }
  }

  const confirmarPegado = async () => {
    setOcupado('importar'); setErr('')
    try {
      const r = await importShiftsPegado({ center, mes: mesImport, texto: pegado, confirmar: true })
      setPrevia(null); setPegado('')
      setAviso(t('turns.import.ok').replace('{n}', r.data?.saved ?? 0))
      await cargar()
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'No se pudo guardar.')
    } finally { setOcupado('') }
  }

  const cargarBloqueos = useCallback(async () => {
    try {
      const r = await getShiftBlocks(center)
      setBloqueos(lista(r.data?.bloqueos))
    } catch { setBloqueos([]) }
  }, [center])
  useEffect(() => { cargarBloqueos() }, [cargarBloqueos])

  // Fuera del JSX a proposito: un salto de linea escapado dentro del
  // marcado es justo lo que se cuela mal al generar este fichero.
  const lineasPegadas = pegado.trim()
    ? pegado.trim().split(String.fromCharCode(10)).length : 0

  const crearBloqueo = async () => {
    const b = nuevoBloqueo
    if (!b.desde || !b.hasta || b.motivo.trim().length < 4) {
      setErr('Pon las dos fechas y el motivo: lo lee el conductor.')
      return
    }
    setOcupado('bloqueo'); setErr('')
    try {
      await createShiftBlock({ center, desde: b.desde, hasta: b.hasta,
        motivo: b.motivo.trim(), driver_id: b.driver_id || undefined })
      setNuevoBloqueo({ desde: '', hasta: '', motivo: '', driver_id: '' })
      setAviso('Bloqueo creado. Los conductores ya no pueden pedir esos días.')
      await cargarBloqueos()
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'No se pudo crear el bloqueo.')
    } finally { setOcupado('') }
  }

  const quitarBloqueo = async (id) => {
    try { await deleteShiftBlock(id); await cargarBloqueos() }
    catch (e2) { setErr(e2?.response?.data?.detail || 'No se pudo quitar.') }
  }

  /* Guarda los emparejamientos hechos a mano y vuelve a leer lo mismo, para
     que la previa se actualice con esos nombres ya reconocidos. */
  const guardarEmparejados = async () => {
    const mapa = Object.fromEntries(Object.entries(emparejando).filter(([, v]) => v))
    if (!Object.keys(mapa).length) return
    setOcupado('importar'); setErr('')
    try {
      await setAliasNombres(mapa)
      setEmparejando({})
      if (previa?.pegado) await previsualizarPegado()
      else setAviso('Emparejados. Vuelve a subir el Excel para que entren.')
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'No se pudieron guardar los emparejamientos.')
    } finally { setOcupado('') }
  }

  const subirExcel = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setOcupado('importar'); setErr(''); setAviso(''); setPrevia(null)
    try {
      const r = await importShifts(f, center, mesImport, false)
      setPrevia({ ...r.data, fichero: f })
    } catch (e2) {
      setErr(e2?.response?.data?.detail || t('turns.import.err'))
    } finally { setOcupado('') }
  }

  const confirmarImport = async () => {
    if (!previa?.fichero) return
    setOcupado('importar'); setErr('')
    try {
      const r = await importShifts(previa.fichero, center, mesImport, true)
      setPrevia(null)
      setAviso(t('turns.import.ok').replace('{n}', r.data?.saved ?? 0))
      await cargar()
    } catch (e2) {
      setErr(e2?.response?.data?.detail || t('turns.import.err'))
    } finally { setOcupado('') }
  }

  /* Traducir un código del Excel que la app no conocía. Se guarda para
     siempre, así que sólo hay que hacerlo la primera vez. */
  const traducir = async (cod, tipo) => {
    try {
      const actual = (await getCodigosCuadrante()).data?.codigos || {}
      const r = await setCodigosCuadrante({ ...actual, [cod]: tipo })
      setPrevia((p) => p && ({
        ...p,
        codigos_desconocidos: Object.fromEntries(
          Object.entries(p.codigos_desconocidos || {}).filter(([k]) => k !== cod)),
        codigos_traducidos: { ...(p.codigos_traducidos || {}), [cod]: tipo },
      }))
      return r
    } catch (e2) { setErr(e2?.response?.data?.detail || 'No se pudo guardar el código') }
  }

  /* Aprobar es un clic. RECHAZAR pide motivo, y sin él no se manda.
     Un "no" a secas deja al conductor preguntando por WhatsApp por qué, que es
     justo el sitio del que se le quiere sacar. El motivo lo lee él tal cual. */
  const resolver = async (grupo, accion) => {
    let motivo = ''
    if (accion === 'rechazar') {
      motivo = (window.prompt(
        `¿Por qué no puede ser?\n\nLo va a leer ${grupo.driver_name} tal cual, así que dilo claro.`,
        '') || '').trim()
      if (motivo.length < 3) return          // cancelado o vacío: no se hace nada
    }
    setErr('')
    try {
      for (const id of grupo.ids) await resolveShiftRequest(id, accion, motivo)
      setSolicitudes((s) => s.filter((x) => !grupo.ids.includes(x.id)))
      await cargar()
    } catch (e) {
      setErr(e?.response?.data?.detail || t('turns.req.err'))
    }
  }

  /* Las peticiones llegan de una en una por día, pero el conductor las pidió
     de golpe. Se agrupan por `grupo` para verlas como las mandó: "Razavi, 3
     días", y no tres filas sueltas que se aprueban por separado sin querer. */
  const grupos = useMemo(() => {
    const m = new Map()
    for (const s of solicitudes) {
      const k = s.grupo || s.id
      if (!m.has(k)) m.set(k, { key: k, driver_name: s.driver_name, type: s.type,
        motivo_label: s.motivo_label, note: s.note, created_at: s.created_at,
        fechas: [], ids: [] })
      const g = m.get(k)
      g.fechas.push(s.date); g.ids.push(s.id)
    }
    /* Una peticion cuyo dia YA PASO y sigue sin contestar es una persona que se
       quedo sin respuesta: o vino a trabajar sin saberlo, o no vino sin
       permiso. Se marca y se pone la primera, porque enterrada entre las demas
       no la ve nadie — habia una asi en produccion el 22-08-2026. */
    const hoyIso = new Date().toISOString().slice(0, 10)
    for (const g of m.values()) {
      g.fechas.sort()
      g.caducada = g.fechas[0] < hoyIso
    }
    return [...m.values()].sort((a, b) => (
      (a.caducada === b.caducada)
        ? String(a.created_at).localeCompare(String(b.created_at))
        : (a.caducada ? -1 : 1)))
  }, [solicitudes])

  if (noCenter) {
    return (
      <div>
        <h1 className="mb-4 text-xl font-bold">{t('turns.title')}</h1>
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <CalendarClock size={30} className="text-brand-400" />
          <p className="text-dark-200">{t('turns.pick.center')}</p>
          <p className="text-sm text-dark-500">{t('turns.available')} {centers?.join(' · ') || '—'}</p>
        </div>
      </div>
    )
  }

  const fmtDia = (f) => new Date(f + 'T12:00:00').toLocaleDateString(lang, { weekday: 'short' })
  const fmtNum = (f) => new Date(f + 'T12:00:00').toLocaleDateString(lang, { day: '2-digit', month: '2-digit' })
  const finde = (f) => [0, 6].includes(new Date(f + 'T12:00:00').getDay())

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera: centro + navegación de quincena */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <CalendarClock size={20} /> {t('turns.title')} · {center}
        </h1>
        <div className="flex items-center gap-1">
          <button className="btn-ghost p-2" onClick={() => setDesde((d) => sumaDias(d, -DIAS))} aria-label={t('turns.prev')}>
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[9.5rem] text-center text-sm font-semibold text-dark-200">
            {fmtNum(primerDia)} – {fmtNum(hasta)}
          </span>
          <button className="btn-ghost p-2" onClick={() => setDesde((d) => sumaDias(d, DIAS))} aria-label={t('turns.next')}>
            <ChevronRight size={16} />
          </button>
          <button className="btn-ghost ml-1 px-3 py-1.5 text-xs" onClick={() => setDesde(isoLocal(lunesDe(new Date())))}>
            {t('turns.today')}
          </button>
        </div>
      </div>

      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary flex items-center gap-2" onClick={generar} disabled={!!ocupado || !drivers?.length}>
          {ocupado === 'auto' ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
          {t('turns.auto')}
        </button>
        {/* El mes va PEGADO al botón de importar, no escondido en ajustes: es
            la decisión que hay que tomar justo antes de subir el fichero. */}
        <div className="flex items-center gap-1.5 rounded-lg border border-dark-700 bg-dark-900 pl-2.5">
          <span className="text-[11px] text-dark-500">Mes</span>
          <input type="month" value={mesImport} onChange={(e) => setMesImport(e.target.value)}
            className="bg-transparent py-1.5 text-[12.5px] text-dark-100 outline-none" />
          <button className="btn-ghost flex items-center gap-1.5 rounded-l-none"
            onClick={() => ficheroRef.current?.click()} disabled={!!ocupado || !mesImport}>
            {ocupado === 'importar' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {t('turns.import')}
          </button>
        </div>
        <input ref={ficheroRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={subirExcel} />
        <button className="btn-ghost flex items-center gap-1.5"
          onClick={() => { setVerPegar((v) => !v); setPrevia(null) }} disabled={!!ocupado}>
          <ClipboardPaste size={15} /> Pegar desde Sheets
        </button>
        <button className="btn-ghost flex items-center gap-1.5"
          onClick={() => setVerBloqueos((v) => !v)}>
          <Ban size={15} /> Bloquear días
          {bloqueos.length > 0 && (
            <span className="rounded-full bg-red-500/20 px-1.5 text-[10px] font-bold text-red-300">{bloqueos.length}</span>
          )}
        </button>
        <label className="flex items-center gap-2 text-xs text-dark-400">
          <Settings2 size={14} /> {t('turns.min.label')}
          <input
            type="number" min="0" value={min}
            onChange={(e) => guardarMin(Math.max(0, Number(e.target.value) || 0))}
            className="w-16 rounded-lg border border-dark-700 bg-dark-900 px-2 py-1 text-center text-sm text-dark-100"
          />
        </label>
        <div className="flex-1" />
        {sucio && <span className="text-xs font-semibold text-amber-400">{t('turns.unsaved')}</span>}
        <button onClick={descargar} disabled={!!ocupado}
          title="Baja el cuadrante en Excel: la rejilla con sus colores y, en otra hoja, una fila por persona y día para filtrar o mandar"
          className="flex items-center gap-2 rounded-lg border border-dark-700 px-3 py-2 text-sm font-semibold text-dark-300 transition hover:text-dark-100 disabled:opacity-40">
          {ocupado === 'descargar' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          Descargar Excel
        </button>
        <button className="btn-primary flex items-center gap-2" onClick={guardar} disabled={!!ocupado || !sucio}>
          {ocupado === 'guardar' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {t('turns.save')}
        </button>
      </div>

      {err && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}
      {aviso && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{aviso}</p>}

      {!cargando && drivers?.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dark-800 bg-dark-900/60 px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Brush size={15} className="text-dark-500" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-dark-500">Pincel</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {paleta.map(({ cod, ui }, i) => (
              <button key={cod} onClick={() => setPincel(cod)}
                title={`${ui.etiqueta} — ${ui.tipo}${i < 10 ? ` · tecla ${i === 9 ? 0 : i + 1}` : ''}`}
                className={`h-7 min-w-[2.4rem] rounded-lg border px-1.5 text-[11px] font-bold transition ${
                  pincel === cod ? COLORES[ui.color] + ' ring-2 ring-brand-500/70' : 'border-dark-700 text-dark-500 hover:text-dark-200'}`}>
                {cod}
              </button>
            ))}
            <button onClick={() => setPincel(null)} title="Goma: vacía la celda (tecla .)"
              className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition ${
                pincel === null ? 'border-brand-500/60 bg-brand-500/15 text-brand-300' : 'border-dark-700 text-dark-500 hover:text-dark-200'}`}>
              <Eraser size={12} /> Vaciar
            </button>
          </div>

          <span className="hidden text-[11.5px] text-dark-600 xl:inline">
            Arrastra para pintar seguido · teclas 1–9 cambian de código
          </span>

          {nCambios > 0 && (
            <span className="ml-auto flex items-center gap-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[12px] font-semibold text-amber-300">
              {nCambios} sin guardar
              <button onClick={descartar} className="text-[11px] font-normal text-amber-200/70 underline underline-offset-2 hover:text-amber-100">
                descartar
              </button>
            </span>
          )}
        </div>
      )}

      {/* ── SEGUNDA FILA: montar el cuadrante ────────────────────────────────
          Separada de la paleta a propósito. Arriba se elige QUÉ se pinta;
          aquí, SOBRE QUIÉN y CÓMO. Mezclarlo todo en una barra era la mitad
          de la sensación de lío. */}
      {!cargando && drivers?.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-xl border border-dark-800 bg-dark-900/60 px-3 py-2.5">
          <div className="flex overflow-hidden rounded-lg border border-dark-700">
            {[['cuadrante', `Del cuadrante (${(drivers || []).length - sobran.length})`],
              ['todos', `Todos (${(drivers || []).length})`]].map(([k, lbl]) => (
              <button key={k} onClick={() => setQuien(k)}
                className={`px-2.5 py-1.5 text-[12px] font-semibold transition ${
                  quien === k ? 'bg-brand-500/20 text-brand-200' : 'text-dark-500 hover:text-dark-200'}`}>
                {lbl}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-600" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar conductor"
              className="w-40 rounded-lg border border-dark-700 bg-dark-950 py-1.5 pl-7 pr-2 text-[12.5px] text-dark-100 outline-none placeholder:text-dark-600 focus:border-brand-500/60" />
          </div>

          <button onClick={() => setVistaMes((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition ${
              vistaMes ? 'border-brand-500/50 bg-brand-500/15 text-brand-300' : 'border-dark-700 text-dark-400 hover:text-dark-200'}`}>
            <CalendarRange size={14} /> {vistaMes ? 'Mes completo' : 'Quincena'}
          </button>

          <button onClick={() => setDenso((v) => !v)} title="Filas más juntas: caben más personas de una vez"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition ${
              denso ? 'border-brand-500/50 bg-brand-500/15 text-brand-300' : 'border-dark-700 text-dark-400 hover:text-dark-200'}`}>
            <Rows3 size={14} /> {denso ? 'Compacto' : 'Cómodo'}
          </button>

          <span className="mx-1 hidden h-5 w-px bg-dark-700 sm:block" />

          <button onClick={() => copiarSemanaAnterior(false)}
            title="Trae lo de la semana de antes a los días que estén vacíos. Lo ya puesto no se toca."
            className="flex items-center gap-1.5 rounded-lg border border-dark-700 px-2.5 py-1.5 text-[12px] font-semibold text-dark-400 transition hover:text-dark-100">
            <CopyPlus size={14} /> Copiar semana anterior
          </button>

          <div className="flex items-center gap-1 rounded-lg border border-dark-700 px-2 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-dark-600">Patrón</span>
            {[[5, 2], [6, 1], [4, 3]].map(([tr, li]) => (
              <button key={`${tr}/${li}`} onClick={() => aplicarPatron(tr, li)} disabled={!pincel}
                title={`Trabaja ${tr} y libra ${li}, seguido, a todos los que se ven. Cada persona arranca un día después que la anterior para que no libren todos a la vez. Se puede deshacer.`}
                className="rounded px-1.5 py-0.5 text-[12px] font-bold text-dark-400 transition hover:bg-brand-500/15 hover:text-brand-200 disabled:opacity-30">
                {tr}/{li}
              </button>
            ))}
          </div>

          <button onClick={deshacer} disabled={!puedeDeshacer}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-dark-700 px-2.5 py-1.5 text-[12px] font-semibold text-dark-400 transition hover:text-dark-100 disabled:opacity-30">
            <Undo2 size={14} /> Deshacer
          </button>
        </div>
      )}

      {/* Gente con ficha activa que no aparece en el cuadrante. Es la queja
          real: 'hay gente que no está en la empresa'. No se puede adivinar
          quién es baja, pero sí se puede señalar y dar el botón. */}
      {!cargando && quien === 'cuadrante' && sobran.length > 0 && (
        <div className="rounded-xl border border-dark-800 bg-dark-900/40 px-3.5 py-2.5">
          <p className="text-[12.5px] text-dark-400">
            <b className="text-dark-200">{sobran.length}</b> {sobran.length === 1 ? 'persona tiene' : 'personas tienen'} ficha
            activa pero ni un día puesto en {vistaMes ? 'este mes' : 'el mes'}.
            {sobran.length === 1 ? ' Está escondida.' : ' Están escondidas.'}
            {' '}
            <button onClick={() => setQuien('todos')} className="underline underline-offset-2 hover:text-dark-100">
              {sobran.length === 1 ? 'Verla' : 'Verlas'}
            </button>
            {sobran.length === 1 ? ' y darle de baja si ya no está.' : ' y darles de baja si ya no están.'}
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-dark-600">
            {sobran.slice(0, 8).map((d) => d.name).join(' · ')}
            {sobran.length > 8 ? ` y ${sobran.length - 8} más` : ''}
          </p>
        </div>
      )}

      {confirmarBaja && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/[0.08] px-3.5 py-3">
          <AlertTriangle size={16} className="shrink-0 text-red-400" />
          <p className="flex-1 text-[13px] text-red-100">
            ¿Dar de baja a <b>{confirmarBaja.name}</b>? Desaparece del cuadrante y de la
            asignación diaria. Su historial se queda: no se borra nada.
          </p>
          <button onClick={() => darDeBaja(confirmarBaja)}
            className="rounded-lg bg-red-500/20 px-3 py-1.5 text-[12px] font-semibold text-red-200 hover:bg-red-500/30">
            Sí, dar de baja
          </button>
          <button onClick={() => setConfirmarBaja(null)}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-dark-400 hover:text-dark-100">
            Cancelar
          </button>
        </div>
      )}

      {choques.size > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/[0.08] px-3.5 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
          <div>
            <p className="text-[13px] font-semibold text-red-200">
              {choques.size} {choques.size === 1 ? 'día puesto a trabajar' : 'días puestos a trabajar'} a quien le aprobaste libre
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-red-200/70">
              Están marcados en rojo en la rejilla. No se corrigen solos: a veces se hace a
              propósito y hablado con la persona. Pero conviene mirarlos antes de guardar.
            </p>
          </div>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> {t('ui.loading')}</div>
      ) : !drivers?.length ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <Users size={28} className="text-dark-500" />
          <p className="text-dark-300">{t('turns.no.drivers')}</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table ref={tablaRef} onMouseLeave={() => cruz(null)}
            className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-dark-900 px-3 py-2 text-left text-xs font-semibold uppercase text-dark-500">
                  {t('turns.driver')}
                </th>
                {dias.map((f, ci) => (
                  <th key={f} data-col={ci}
                    className={`border-r border-dark-800/70 px-1 py-2 text-center ${
                      finde(f) ? 'bg-dark-800/40' : ''} ${
                      lunes(f) ? 'border-l border-l-dark-600' : ''}`}>
                    <button onClick={() => columnaEntera(f)}
                      title={pincel ? `Poner ${uiDe(pincel).etiqueta} a todos este día` : 'Vaciar este día a todos'}
                      className="rounded px-1 py-0.5 transition hover:bg-brand-500/15">
                      <div className="text-[10px] uppercase text-dark-500">{fmtDia(f)}</div>
                      <div className="text-[11px] font-semibold text-dark-300">{fmtNum(f)}</div>
                    </button>
                  </th>
                ))}
              </tr>
              {/* MÁXIMAS: el techo comprometido con Amazon. Va la primera porque es
                  la que se rellena antes y la que no cambia. */}
              <tr>
                <th className="sticky left-0 z-10 border-r border-dark-700 bg-dark-900 px-3 py-1 text-left text-[11px] font-medium text-dark-500">
                  <span className="flex items-center gap-1.5">
                    Máximas
                    <button onClick={rellenarMaximas} title="Copia el primer máximo que haya escrito a todos los días que estén en blanco"
                      className="rounded border border-dark-700 px-1 text-[9px] font-bold text-dark-600 hover:text-dark-200">
                      rellenar
                    </button>
                  </span>
                </th>
                {dias.map((f, ci) => (
                  <td key={f} data-col={ci}
                    className={`border-r border-dark-800/70 px-1 py-1 text-center ${
                      finde(f) ? 'bg-dark-800/40' : ''} ${lunes(f) ? 'border-l border-l-dark-600' : ''}`}>
                    <input
                      type="number" min="0" value={maximas[f] ?? ''} placeholder="—"
                      onChange={(e) => setMaximas((m) => ({ ...m, [f]: e.target.value }))}
                      onBlur={() => guardarDemanda()}
                      title="Rutas que podrían pedirnos ese día"
                      className="w-10 rounded border border-amber-500/25 bg-amber-500/[0.06] px-1 py-0.5 text-center text-[11px] font-semibold text-amber-200/90 placeholder:font-normal placeholder:text-dark-700"
                    />
                  </td>
                ))}
              </tr>
              {/* PIDEN: las rutas de ese día. Es lo que usa el generador. */}
              <tr>
                <th className="sticky left-0 z-10 border-r border-dark-700 bg-dark-900 px-3 py-1 text-left text-[11px] font-medium text-dark-500">
                  Piden
                </th>
                {dias.map((f, ci) => (
                  <td key={f} data-col={ci}
                    className={`border-r border-dark-800/70 px-1 py-1 text-center ${
                      finde(f) ? 'bg-dark-800/40' : ''} ${lunes(f) ? 'border-l border-l-dark-600' : ''}`}>
                    <input
                      type="number" min="0" value={demanda[f] ?? ''} placeholder="—"
                      onChange={(e) => setDemanda((d) => ({ ...d, [f]: e.target.value }))}
                      onBlur={() => guardarDemanda()}
                      title="Rutas que Amazon pide ese día"
                      className="w-10 rounded border border-dark-700/70 bg-dark-900 px-1 py-0.5 text-center text-[11px] text-dark-200 placeholder:text-dark-700"
                    />
                  </td>
                ))}
              </tr>
              {/* PONEMOS: sale de la rejilla. El color compara con las otras dos. */}
              <tr className="border-b border-dark-700">
                <th className="sticky left-0 z-10 border-r border-dark-700 bg-dark-900 px-3 py-1 text-left text-[11px] font-medium text-dark-500">
                  Ponemos
                </th>
                {dias.map((f, ci) => {
                  const n = cobertura[f] || 0
                  const piden = Number(demanda[f]) || 0
                  const max = Number(maximas[f]) || 0
                  // Rojo: no llegas a lo que piden hoy — eso es una ruta sin
                  // cubrir. Ámbar: llegas a lo de hoy pero no al techo, así que
                  // si Amazon pide más no lo puedes coger. Verde: cubierto.
                  const corto = (piden > 0 && n < piden) || (min > 0 && n < min)
                  // Lo que te faltaría si HOY te pidieran el máximo. Va como
                  // número pequeño y no como color: estar por debajo del techo
                  // es lo normal —nunca se pone a toda la plantilla— así que
                  // pintarlo de ámbar dejaba la fila entera en ámbar, y una
                  // alerta que sale siempre no es una alerta.
                  const hueco = max > 0 && n < max ? max - n : 0
                  return (
                    <td key={f} data-col={ci}
                      className={`border-r border-dark-800/70 px-1 py-1 text-center ${
                        finde(f) ? 'bg-dark-800/40' : ''} ${lunes(f) ? 'border-l border-l-dark-600' : ''}`}>
                      <span className="flex items-baseline justify-center gap-0.5"
                        title={`${n} ${n === 1 ? 'persona' : 'personas'} a ruta${
                          piden > 0 ? ` · piden ${piden}` : ''}${max > 0 ? ` · máximo ${max}` : ''}${
                          corto ? ' — FALTAN ' + (Math.max(piden, min) - n) : ''}${
                          hueco ? ` · te faltarían ${hueco} para cubrir el máximo` : ''}`}>
                        <span className={`text-[12px] font-bold tabular-nums ${
                          corto ? 'text-red-400' : 'text-emerald-300'}`}>{n}</span>
                        {hueco > 0 && (
                          <span className="text-[9px] font-medium tabular-nums text-amber-500/60">−{hueco}</span>
                        )}
                      </span>
                    </td>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {visibles.map((d, iFila) => (
                <tr key={d.id}
                  /* Filas alternas. En una tabla de 31 columnas es lo que evita
                     leer el día de la fila de al lado — y es la única mejora de
                     legibilidad en tablas densas que sale medida en los
                     estudios de usabilidad, no por gusto. */
                  className={`group ${iFila % 2 ? 'bg-dark-800/[0.18]' : ''}`}>
                  <td className={`sticky left-0 z-10 flex items-center gap-2 border-r border-dark-700 px-3 ${
                    iFila % 2 ? 'bg-[#17171a]' : 'bg-dark-900'} ${denso ? 'py-0.5' : 'py-1.5'}`}>
                    <span className={`shrink-0 rounded px-1.5 text-[10px] font-bold tabular-nums ${
                      (totales[d.id] ?? 0) === 0 ? 'bg-dark-800 text-dark-600' : 'bg-dark-800 text-dark-300'}`}
                      title="Días de trabajo en lo que estás viendo">
                      {totales[d.id] ?? 0}
                    </span>
                    <span className={`max-w-[11rem] truncate text-[13px] ${
                      enCuadrante.has(d.id) ? 'text-dark-200' : 'text-dark-500 italic'}`} title={d.name}>
                      {d.name}
                    </span>
                    <span className="ml-auto hidden shrink-0 items-center gap-1 group-hover:flex">
                      <button onClick={() => filaEntera(d.id, pincel)}
                        title={pincel
                          ? `Poner ${uiDe(pincel).etiqueta} a ${d.name} en todos los días que se ven`
                          : 'Elige un código arriba para rellenar la fila'}
                        disabled={!pincel}
                        className="rounded border border-dark-700 px-1 text-[9px] font-bold text-dark-500 hover:text-dark-200 disabled:opacity-30">
                        rellenar
                      </button>
                      {!enCuadrante.has(d.id) && (
                        <button onClick={() => setConfirmarBaja(d)} title={`Dar de baja a ${d.name}`}
                          className="rounded border border-dark-700 p-0.5 text-dark-500 hover:border-red-500/50 hover:text-red-300">
                          <UserMinus size={11} />
                        </button>
                      )}
                    </span>
                  </td>
                  {dias.map((f, ci) => {
                    const k = `${d.id}|${f}`
                    const cod = grid[k]
                    const ui = cod ? uiDe(cod) : null
                    const choca = choques.has(k)          // trabaja un día que tiene concedido
                    const concedido = aprobados.has(k)    // día libre aprobado
                    const hora = horas.current[k]
                    return (
                      <td key={f} data-col={ci}
                        className={`border-r border-dark-800/70 px-0.5 text-center ${
                          denso ? 'py-0' : 'py-0.5'} ${finde(f) ? 'bg-dark-800/40' : ''} ${
                          lunes(f) ? 'border-l border-l-dark-600' : ''}`}
                        onMouseEnter={(e) => cruz(e.currentTarget)}>
                        <button
                          onMouseDown={(e) => {
                            // Sólo el botón izquierdo: con el derecho se abre el
                            // menú del navegador y quedaría pintando sin querer.
                            if (e.button !== 0) return
                            e.preventDefault()
                            pintando.current = true
                            aplicar(d.id, f)
                          }}
                          onMouseEnter={() => {
                            // Al arrastrar no se apila un paso de deshacer por
                            // celda: se deshace la pincelada entera, que es lo
                            // que espera quien la ha dado.
                            if (pintando.current) aplicar(d.id, f, false)
                          }}
                          title={`${d.name} · ${fmtNum(f)} · ${ui ? ui.etiqueta : 'sin poner'}${
                            hora ? ` · entra a las ${hora}` : ''}${
                            choca ? ' — OJO: tiene este día APROBADO libre'
                              : (concedido ? ' — día libre aprobado' : '')}`}
                          className={`w-[2.15rem] select-none rounded-[3px] border text-[10px] font-bold leading-none transition hover:brightness-125 ${
                            denso ? 'h-[1.15rem]' : 'h-6'} ${
                            choca ? 'border-red-500 bg-red-500/25 text-red-100 ring-1 ring-red-500/70'
                              : !ui ? 'border-dashed border-dark-800 text-dark-700 hover:border-dark-600'
                                : COLORES[ui.color] + (concedido ? ' ring-1 ring-emerald-400/70' : '')}`}
                        >
                          {ui ? corto(cod) : '·'}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* (La leyenda vieja estaba aqui, entre la tabla y los paneles. Se quito
          el 22-08-2026: duplicaba la de abajo y decia 'pulsa una celda para
          cambiar el turno', que dejo de ser verdad en cuanto hubo pincel. Una
          leyenda que miente es peor que ninguna.) */}

      {/* ── Lo que va a hacer el Excel, ANTES de escribirlo ─────────────────
          Con 61 conductores y 31 días son casi 1.900 turnos. Escribirlos sin
          que nadie los mire es demasiado, y deshacerlo después no es trivial. */}
      {verPegar && (
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2">
            <ClipboardPaste size={16} className="text-brand-400" />
            <h3 className="text-sm font-bold text-dark-100">Pegar el cuadrante desde Sheets</h3>
          </div>
          <p className="mb-2 text-[12.5px] leading-relaxed text-dark-400">
            Selecciona en tu hoja el bloque con <b>la fila de días de la semana</b> y las filas de
            conductores, cópialo y pégalo aquí. La primera columna es el nombre; las siguientes,
            los días 1, 2, 3… del mes que hayas elegido arriba.
          </p>
          <p className="mb-2 text-[11.5px] text-dark-500">
            Si pegas la fila de días (LUN, MAR…), se comprueba que el bloque empieza donde debe.
            Un mes a medias vale: se guarda lo que haya.
          </p>
          <textarea rows={7} value={pegado} onChange={(e) => setPegado(e.target.value)}
            placeholder="Pega aquí el bloque copiado de tu hoja de cálculo"
            className="w-full resize-y rounded-lg border border-dark-700 bg-dark-950 p-2.5 font-mono text-[11.5px] text-dark-100 outline-none focus:border-brand-500/60" />
          <div className="mt-2 flex items-center gap-2">
            <button className="btn-primary flex items-center gap-1.5"
              onClick={previsualizarPegado} disabled={!!ocupado || !pegado.trim() || !mesImport}>
              {ocupado === 'importar' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Ver qué va a entrar
            </button>
            <button className="btn-ghost" onClick={() => { setPegado(''); setPrevia(null) }}>Limpiar</button>
            <span className="text-[11.5px] text-dark-500">{lineasPegadas} líneas pegadas</span>
          </div>
        </div>
      )}

      {verBloqueos && (
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2">
            <Ban size={16} className="text-red-400" />
            <h3 className="text-sm font-bold text-dark-100">Días que no se pueden pedir</h3>
          </div>
          <p className="mb-3 text-[12.5px] leading-relaxed text-dark-400">
            El conductor los ve cerrados en su calendario, con el motivo, y no puede ni marcarlos.
            <b> No toca lo ya pedido</b>: las peticiones de antes se siguen contestando a mano.
          </p>

          {puedeAprobar ? (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dark-700 bg-dark-900/60 p-3">
              <label className="flex flex-col gap-1 text-[11px] text-dark-500">Desde
                <input type="date" value={nuevoBloqueo.desde}
                  onChange={(e) => setNuevoBloqueo((b) => ({ ...b, desde: e.target.value }))}
                  className="rounded-lg border border-dark-700 bg-dark-950 px-2 py-1.5 text-[12.5px] text-dark-100 outline-none" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-dark-500">Hasta
                <input type="date" value={nuevoBloqueo.hasta}
                  onChange={(e) => setNuevoBloqueo((b) => ({ ...b, hasta: e.target.value }))}
                  className="rounded-lg border border-dark-700 bg-dark-950 px-2 py-1.5 text-[12.5px] text-dark-100 outline-none" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-dark-500">A quién
                <select value={nuevoBloqueo.driver_id}
                  onChange={(e) => setNuevoBloqueo((b) => ({ ...b, driver_id: e.target.value }))}
                  className="rounded-lg border border-dark-700 bg-dark-950 px-2 py-1.5 text-[12.5px] text-dark-100 outline-none">
                  <option value="">A todo el centro</option>
                  {lista(drivers).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-[11px] text-dark-500">Motivo (lo lee el conductor)
                <input value={nuevoBloqueo.motivo}
                  onChange={(e) => setNuevoBloqueo((b) => ({ ...b, motivo: e.target.value }))}
                  placeholder="Pico de Navidad, no se dan días"
                  className="rounded-lg border border-dark-700 bg-dark-950 px-2 py-1.5 text-[12.5px] text-dark-100 outline-none placeholder:text-dark-600" />
              </label>
              <button className="btn-primary flex items-center gap-1.5" onClick={crearBloqueo}
                disabled={ocupado === 'bloqueo'}>
                {ocupado === 'bloqueo' ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
                Bloquear
              </button>
            </div>
          ) : (
            <p className="text-[12.5px] text-dark-500">Solo quien puede aprobar días puede bloquearlos.</p>
          )}

          <div className="mt-3 divide-y divide-white/[0.04]">
            {bloqueos.length === 0 ? (
              <p className="py-3 text-[12.5px] text-dark-500">No hay ningún día bloqueado.</p>
            ) : bloqueos.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="font-mono text-[12.5px] text-dark-100">{b.desde} → {b.hasta}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  b.driver_id ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/15 text-red-300'}`}>
                  {b.driver_name || 'Todo el centro'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-dark-400">{b.motivo}</span>
                {puedeAprobar && (
                  <button onClick={() => quitarBloqueo(b.id)}
                    className="rounded p-1 text-dark-600 hover:text-red-400" title="Quitar">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!cargando && drivers?.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-dark-500">
          {/* Agrupada por FAMILIA de color, que es como se lee: primero ves de
              qué color es y luego, si hace falta, qué pone. Una leyenda de
              dieciséis entradas sueltas no la mira nadie. */}
          {Object.entries(FAMILIA_NOMBRE).map(([fam, nombre]) => {
            const suyos = paleta.filter(({ ui }) => ui.color === fam)
            if (!suyos.length) return null
            return (
              <span key={fam} className="flex items-center gap-1.5">
                <span className={`inline-flex h-4 w-4 rounded border ${COLORES[fam]}`} />
                <span className="text-dark-400">{nombre}:</span>
                <span className="text-dark-500">{suyos.map(({ cod }) => cod).join(', ')}</span>
              </span>
            )
          })}
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-4 min-w-[1.6rem] items-center justify-center rounded border border-dashed border-dark-800 px-1 text-[9px] font-bold text-dark-700">·</span>
            Sin poner
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-4 w-5 items-center justify-center rounded border border-red-500 bg-red-500/25 text-[9px] font-bold text-red-200">!</span>
            Trabaja un día que tiene concedido
          </span>
          <span className="ml-auto text-dark-600">El número junto al nombre son sus días de trabajo aquí</span>
        </div>
      )}

      {previa && (
        <div className="card border border-brand-500/30 p-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-dark-100">
            <Upload size={16} /> Esto es lo que voy a importar
          </h2>
          <p className="mb-3 text-xs text-dark-500">Todavía no se ha guardado nada.</p>

          <div className="mb-3 flex flex-wrap gap-x-7 gap-y-2">
            {[['Mes', previa.mes], ['Conductores', previa.conductores],
              ['Días', previa.primer_dia
                ? `${previa.primer_dia.slice(8)}–${previa.ultimo_dia.slice(8)}`
                : previa.dias],
              ['Turnos', previa.turnos], ['Trabaja', previa.trabaja],
              ['Libre', previa.libre]].map(([k, v]) => (
              <span key={k} className="flex items-baseline gap-1.5">
                <b className="text-lg font-bold tabular-nums text-dark-50">{v}</b>
                <span className="text-[12px] text-dark-500">{k}</span>
              </span>
            ))}
          </div>

          {/* NO se listan los nombres en una frase: se ponen en una lista con un
              desplegable al lado para decir quién es cada uno. Antes salían
              como texto —y desde que el servidor manda el motivo, salían como
              "[object Object]"— y encima no se podía hacer nada con ellos.
              Ahora se emparejan una vez y quedan guardados para siempre. */}
          {previa.n_sin_conductor > 0 && (
            <div className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3">
              <p className="text-[12.5px] font-semibold text-amber-200">
                {previa.n_sin_conductor} {previa.n_sin_conductor > 1 ? 'nombres' : 'nombre'} sin
                emparejar {previa.n_sin_conductor > 1 ? 'se quedan' : 'se queda'} fuera
              </p>
              <p className="mb-2 mt-1 text-[11.5px] leading-relaxed text-amber-200/70">
                Dime quién es cada uno y lo recordaré: el mes que viene entrarán solos.
              </p>
              <div className="flex flex-col gap-1.5">
                {(previa.sin_conductor || []).map((s) => {
                  const nombre = typeof s === 'string' ? s : s.nombre
                  const motivo = typeof s === 'string' ? '' : s.motivo
                  return (
                    <div key={nombre} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-[13rem] flex-1 truncate text-[12.5px] text-dark-200" title={nombre}>
                        {nombre}
                      </span>
                      {motivo === 'ambiguo' && (
                        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-red-300"
                          title="Encajan dos fichas: hay que decir cuál, no se adivina">
                          dos fichas iguales
                        </span>
                      )}
                      <select
                        value={emparejando[nombre] || ''}
                        onChange={(e) => setEmparejando((m) => ({ ...m, [nombre]: e.target.value }))}
                        className="min-w-[12rem] rounded-lg border border-dark-700 bg-dark-950 px-2 py-1 text-[12px] text-dark-100 outline-none">
                        <option value="">— es…</option>
                        {(drivers || []).map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
              {Object.values(emparejando).filter(Boolean).length > 0 && (
                <button onClick={guardarEmparejados} disabled={ocupado === 'importar'}
                  className="btn-primary mt-2.5 flex items-center gap-1.5">
                  {ocupado === 'importar' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Guardar {Object.values(emparejando).filter(Boolean).length} y volver a leer
                </button>
              )}
            </div>
          )}

          {previa.aviso_alineacion && (
            <p className="mb-3 rounded-lg border border-dark-700 bg-dark-900/60 px-3 py-2 text-[11.5px] leading-relaxed text-dark-400">
              {previa.aviso_alineacion}
            </p>
          )}

          {previa.de_baja?.length > 0 && (
            <p className="mb-3 rounded-lg border border-sky-500/25 bg-sky-500/[0.06] px-3 py-2 text-[11.5px] leading-relaxed text-sky-200/80">
              <b>{previa.de_baja.length}</b> de estas personas están dadas de baja en la app y aun
              así salen en el cuadrante: {previa.de_baja.slice(0, 6).join(' · ')}. Sus turnos se
              guardan igual, pero conviene mirar si siguen o no.
            </p>
          )}

          {/* Códigos que la app no conoce. Traducirlos aquí y se recuerda para
              siempre: un código sin traducir es un día que se quedaría vacío. */}
          {Object.keys(previa.codigos_desconocidos || {}).length > 0 && (
            <div className="mb-3 rounded-lg border border-red-500/25 bg-red-500/[0.06] p-3">
              <p className="mb-2 text-[12.5px] font-semibold text-red-200">
                No sé qué significan estos códigos. Dímelo y los recordaré siempre:
              </p>
              <div className="flex flex-col gap-2">
                {Object.entries(previa.codigos_desconocidos).map(([cod, n]) => (
                  <div key={cod} className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-dark-800 px-2 py-1 font-mono text-[12.5px] text-dark-100">{cod}</code>
                    <span className="text-[11.5px] text-dark-500">{n} {n > 1 ? 'veces' : 'vez'}</span>
                    <div className="flex gap-1.5">
                      {[['trabaja', 'Trabaja'], ['libre', 'Libre'], ['extra', 'Extra'], ['ignorar', 'Ignorar']].map(([k, lbl]) => (
                        <button key={k} onClick={() => traducir(cod, k)}
                          className="rounded-lg border border-dark-700 px-2 py-1 text-[11.5px] text-dark-300 hover:border-brand-500/50 hover:text-brand-300">
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-dark-500">
                Después de traducirlos, vuelve a subir el Excel para que entren esos días.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {/* La misma previa sirve para el Excel y para lo pegado. Sin este
                reparto, confirmar un cuadrante pegado llamaba al camino del
                Excel, que no tiene fichero, y no pasaba NADA: ni guardaba ni
                daba error. */}
            <button onClick={previa.pegado ? confirmarPegado : confirmarImport}
              disabled={ocupado === 'importar' || !previa.turnos}
              className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40">
              {ocupado === 'importar' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Guardar {previa.turnos} turnos
            </button>
            <button onClick={() => setPrevia(null)} className="btn-ghost text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {/* Solicitudes de los conductores */}
      <div className="card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-dark-100">
          <Inbox size={16} /> {t('turns.requests')}
          {solicitudes.length > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-300">{solicitudes.length}</span>
          )}
        </h2>
        {solicitudes.length === 0 ? (
          <p className="text-sm text-dark-500">{t('turns.no.requests')}</p>
        ) : (
          <div className="divide-y divide-dark-800">
            {grupos.map((g) => (
              <div key={g.key} className={`flex flex-wrap items-start gap-x-3 gap-y-2 py-3 ${
                g.caducada ? 'rounded-lg bg-red-500/[0.06] px-2' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-dark-100">{g.driver_name}</span>
                    {g.caducada && (
                      <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                        Sin contestar y el día ya pasó
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${g.type === 'libre' ? 'bg-sky-500/15 text-sky-300' : 'bg-amber-500/15 text-amber-300'}`}>
                      {g.motivo_label || t(g.type === 'libre' ? 'turns.t.libre' : 'turns.t.extra')}
                    </span>
                    <span className="font-mono text-[12px] text-brand-300">
                      {g.fechas.length} día{g.fechas.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-dark-400">{g.fechas.map(fmtNum).join(' · ')}</p>
                  {g.note && <p className="mt-1 text-[12.5px] italic text-dark-500">“{g.note}”</p>}
                  {g.created_at && (
                    <p className="mt-1 font-mono text-[10.5px] text-dark-600">
                      pedido el {g.created_at.slice(8, 10)}/{g.created_at.slice(5, 7)} a las {g.created_at.slice(11, 16)}
                    </p>
                  )}
                </div>
                {puedeAprobar ? (
                  <div className="flex gap-2">
                    <button onClick={() => resolver(g, 'aprobar')} className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25">
                      <Check size={13} /> {t('turns.approve')}
                    </button>
                    <button onClick={() => resolver(g, 'rechazar')} className="flex items-center gap-1 rounded-lg bg-red-500/15 px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/25">
                      <X size={13} /> {t('turns.reject')}
                    </button>
                  </div>
                ) : (
                  /* Quien no puede decidir lo ve igual: enterarse de quién ha
                     pedido qué es media función, y esconderlo solo genera
                     preguntas. Lo que no puede es contestar. */
                  <span className="self-center rounded-lg border border-dark-700 px-2.5 py-1.5 text-[11px] text-dark-500">
                    Solo lectura
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {min > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-dark-600">
          <AlertTriangle size={12} /> {t('turns.min').replace('{n}', min)}
        </p>
      )}
    </div>
  )
}
