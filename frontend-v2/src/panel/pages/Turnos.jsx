import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, CalendarClock, Users, ChevronLeft, ChevronRight, Save, Zap,
  Upload, Check, X, Settings2, AlertTriangle, Inbox, ClipboardPaste, Ban, Trash2,
  Brush, Undo2, Search, CalendarRange, Eraser,
} from 'lucide-react'
import {
  getShifts, getShiftCoverage, getDrivers, saveShiftsBulk, setShiftSettings,
  generateShiftsAuto, getRouteDemand, setRouteDemand, getShiftRequests,
  resolveShiftRequest, importShifts, getCodigosCuadrante, setCodigosCuadrante,
  importShiftsPegado, getShiftBlocks, createShiftBlock, deleteShiftBlock,
  setAliasNombres,
} from '../api'
import { useT } from '../../i18n'
import { lista } from '../../lib/lista'
import { canSee } from '../auth'
import { isoLocal } from '../../lib/fecha'

const DIAS = 14

/* Tipos de turno. El backend solo admite estos tres (VALID_SHIFT_TYPE);
   la celda cicla entre ellos al pulsar. */
const TIPOS = {
  libre:   { letra: 'L', k: 'turns.t.libre',   cls: 'bg-dark-800/60 text-dark-500 border-dark-700/60' },
  trabaja: { letra: 'T', k: 'turns.t.trabaja', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35' },
  extra:   { letra: 'E', k: 'turns.t.extra',   cls: 'bg-amber-500/15 text-amber-300 border-amber-500/35' },
}
const CICLO = { libre: 'trabaja', trabaja: 'extra', extra: 'libre' }

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
  const [demanda, setDemanda] = useState({})    // fecha -> objetivo (string, se edita)
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
  const [pincel, setPincel] = useState('trabaja')
  const pintando = useRef(false)
  const [busca, setBusca] = useState('')
  const [vistaMes, setVistaMes] = useState(false)
  const [aprobados, setAprobados] = useState(new Set())  // 'did|fecha' con día libre CONCEDIDO
  const historial = useRef([])                            // para deshacer
  const [puedeDeshacer, setPuedeDeshacer] = useState(false)
  const gridOriginal = useRef({})                         // lo que había al cargar
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
  const hasta = dias[dias.length - 1]

  const cargar = useCallback(async () => {
    if (noCenter) return
    setCargando(true); setErr(''); setAviso('')
    try {
      const [rd, rs, rc, rdem, rreq, rapr] = await Promise.all([
        getDrivers(center),
        getShifts(center, desde, hasta),
        getShiftCoverage(center, desde, hasta),
        getRouteDemand(center, desde, hasta),
        getShiftRequests(center, 'pendiente'),
        // Los días YA CONCEDIDOS. Sin esto, la rejilla te deja poner a trabajar
        // a alguien el día que le aprobaste libre y no dice nada — el peor
        // fallo posible aquí, porque se descubre el día que no aparece.
        getShiftRequests(center, 'aprobado'),
      ])
      setDrivers(lista(rd.data).filter((d) => d.active !== false))
      const g = {}
      for (const s of lista(rs.data?.shifts)) g[`${s.driver_id}|${s.date}`] = s.type
      setGrid(g); setSucio(false)
      gridOriginal.current = { ...g }
      historial.current = []; setPuedeDeshacer(false)
      setAprobados(new Set(
        lista(rapr.data?.requests)
          .filter((r) => r.type === 'libre')
          .map((r) => `${r.driver_id}|${r.date}`)))
      setMin(rc.data?.min || 0)
      const dm = {}
      for (const [f, v] of Object.entries(rdem.data?.demand || {})) {
        if (v?.objetivo != null) dm[f] = String(v.objetivo)
      }
      setDemanda(dm)
      setSolicitudes(lista(rreq.data?.requests))
    } catch {
      setErr(t('turns.error'))
    } finally {
      setCargando(false)
    }
  }, [center, desde, hasta, noCenter])

  useEffect(() => { cargar() }, [cargar])

  /* Avisa antes de perder cambios del cuadrante al cerrar la pestaña. */
  useEffect(() => {
    if (!sucio) return
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [sucio])

  const cobertura = useMemo(() => {
    const c = {}
    for (const [k, v] of Object.entries(grid)) {
      if (v === 'trabaja' || v === 'extra') {
        const f = k.split('|')[1]
        c[f] = (c[f] || 0) + 1
      }
    }
    return c
  }, [grid])

  /* Los que se ven ahora mismo. Con 85 conductores, buscar por nombre no es un
     lujo: es la diferencia entre encontrar a alguien y rendirse. */
  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const ds = drivers || []
    if (!q) return ds
    return ds.filter((d) => (d.name || '').toLowerCase().includes(q))
  }, [drivers, busca])

  /* CHOQUES: alguien puesto a trabajar un día que se le CONCEDIÓ libre.
     Es el fallo que más caro sale, porque no se descubre al hacerlo — se
     descubre el día que esa persona no aparece. Se marca la celda y se cuenta
     arriba; no se corrige solo, porque a veces se hace a propósito y hablado. */
  const choques = useMemo(() => {
    const s = new Set()
    for (const [k, v] of Object.entries(grid)) {
      if ((v === 'trabaja' || v === 'extra') && aprobados.has(k)) s.add(k)
    }
    return s
  }, [grid, aprobados])

  /* Días de trabajo de cada uno en lo que se está viendo. Sin esto no hay forma
     de ver de un vistazo que a uno le has puesto 14 y a otro 3. */
  const totales = useMemo(() => {
    const m = {}
    for (const d of (drivers || [])) {
      let n = 0
      for (const f of dias) {
        const v = grid[`${d.id}|${f}`]
        if (v === 'trabaja' || v === 'extra') n += 1
      }
      m[d.id] = n
    }
    return m
  }, [drivers, dias, grid])

  /* Cuántas celdas han cambiado respecto a lo cargado. "Sin guardar" a secas no
     dice si has tocado una casilla o doscientas. */
  const nCambios = useMemo(() => {
    const o = gridOriginal.current || {}
    const claves = new Set([...Object.keys(o), ...Object.keys(grid)])
    let n = 0
    for (const k of claves) if ((o[k] || 'libre') !== (grid[k] || 'libre')) n += 1
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

  /* Una celda. Con pincel pone ese tipo; sin pincel, cicla como antes. */
  const aplicar = (did, fecha, conHistorial = true) => {
    const k = `${did}|${fecha}`
    if (conHistorial) recordar()
    setGrid((g) => ({ ...g, [k]: pincel || CICLO[g[k] || 'libre'] }))
    setSucio(true)
  }

  const ciclar = (did, fecha) => aplicar(did, fecha)

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
      for (const d of visibles) n[`${d.id}|${fecha}`] = pincel
      return n
    })
    setSucio(true)
  }

  /* Pinta una fila entera (toda la quincena de un conductor) de una vez. */
  const filaEntera = (did, tipo) => {
    recordar()
    setGrid((g) => {
      const n = { ...g }
      for (const f of dias) n[`${did}|${f}`] = tipo
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
          const tipo = grid[`${d.id}|${f}`]
          if (tipo) items.push({ driver_id: d.id, driver_name: d.name, center, date: f, type: tipo })
        }
      }
      const r = await saveShiftsBulk(items)
      setSucio(false)
      setAviso(t('turns.saved').replace('{n}', r.data?.saved ?? items.length))
    } catch {
      setErr(t('turns.save.err'))
    } finally { setOcupado('') }
  }

  const guardarDemanda = async () => {
    const items = dias.map((f) => ({ date: f, objetivo: demanda[f] === '' ? null : demanda[f] }))
    try { await setRouteDemand(center, items) } catch { setErr(t('turns.demand.err')) }
  }

  const generar = async () => {
    setOcupado('auto'); setErr(''); setAviso('')
    try {
      await guardarDemanda()                    // el generador lee la demanda de la BD
      const r = await generateShiftsAuto(center, desde, hasta)
      const g = {}
      for (const f of dias) for (const d of drivers || []) g[`${d.id}|${f}`] = 'libre'
      for (const a of lista(r.data?.assignments)) g[`${a.driver_id}|${a.date}`] = a.type
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
            {fmtNum(desde)} – {fmtNum(hasta)}
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
          <div className="flex gap-1">
            {Object.entries(TIPOS).map(([k, v]) => (
              <button key={k} onClick={() => setPincel(k)}
                title={`Pintar ${t(v.k)}`}
                className={`h-7 w-9 rounded-lg border text-[12px] font-bold transition ${
                  pincel === k ? v.cls + ' ring-2 ring-brand-500/60' : 'border-dark-700 text-dark-500 hover:text-dark-200'}`}>
                {v.letra}
              </button>
            ))}
            <button onClick={() => setPincel(null)} title="Sin pincel: cada clic pasa al siguiente tipo"
              className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition ${
                pincel === null ? 'border-brand-500/60 bg-brand-500/15 text-brand-300' : 'border-dark-700 text-dark-500 hover:text-dark-200'}`}>
              <Eraser size={12} /> Ciclar
            </button>
          </div>

          <span className="hidden text-[11.5px] text-dark-600 sm:inline">
            Arrastra para pintar varias · toca el día para toda la columna
          </span>

          <div className="relative ml-auto">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-600" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar conductor"
              className="w-44 rounded-lg border border-dark-700 bg-dark-950 py-1.5 pl-7 pr-2 text-[12.5px] text-dark-100 outline-none placeholder:text-dark-600 focus:border-brand-500/60" />
          </div>

          <button onClick={() => setVistaMes((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition ${
              vistaMes ? 'border-brand-500/50 bg-brand-500/15 text-brand-300' : 'border-dark-700 text-dark-400 hover:text-dark-200'}`}>
            <CalendarRange size={14} /> {vistaMes ? 'Mes completo' : 'Quincena'}
          </button>

          <button onClick={deshacer} disabled={!puedeDeshacer}
            className="flex items-center gap-1.5 rounded-lg border border-dark-700 px-2.5 py-1.5 text-[12px] font-semibold text-dark-400 transition hover:text-dark-100 disabled:opacity-30">
            <Undo2 size={14} /> Deshacer
          </button>

          {nCambios > 0 && (
            <span className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[12px] font-semibold text-amber-300">
              {nCambios} sin guardar
              <button onClick={descartar} className="text-[11px] font-normal text-amber-200/70 underline underline-offset-2 hover:text-amber-100">
                descartar
              </button>
            </span>
          )}
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
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-dark-900 px-3 py-2 text-left text-xs font-semibold uppercase text-dark-500">
                  {t('turns.driver')}
                </th>
                {dias.map((f) => (
                  <th key={f} className={`px-1 py-2 text-center ${finde(f) ? 'bg-dark-800/40' : ''}`}>
                    <button onClick={() => columnaEntera(f)} disabled={!pincel}
                      title={pincel ? `Poner ${t(TIPOS[pincel].k)} a todos este día` : 'Elige un pincel para rellenar la columna'}
                      className="rounded px-1 py-0.5 transition enabled:hover:bg-brand-500/15 disabled:cursor-default">
                      <div className="text-[10px] uppercase text-dark-500">{fmtDia(f)}</div>
                      <div className="text-[11px] font-semibold text-dark-300">{fmtNum(f)}</div>
                    </button>
                  </th>
                ))}
              </tr>
              {/* Demanda de Amazon: rutas objetivo del día (la usa el generador) */}
              <tr>
                <th className="sticky left-0 z-10 bg-dark-900 px-3 py-1 text-left text-[11px] font-medium text-dark-500">
                  {t('turns.demand')}
                </th>
                {dias.map((f) => (
                  <td key={f} className={`px-1 py-1 text-center ${finde(f) ? 'bg-dark-800/40' : ''}`}>
                    <input
                      type="number" min="0" value={demanda[f] ?? ''} placeholder="—"
                      onChange={(e) => setDemanda((d) => ({ ...d, [f]: e.target.value }))}
                      onBlur={guardarDemanda}
                      className="w-11 rounded border border-dark-700/70 bg-dark-900 px-1 py-0.5 text-center text-[11px] text-dark-200 placeholder:text-dark-700"
                    />
                  </td>
                ))}
              </tr>
              {/* Cobertura real vs objetivo */}
              <tr className="border-b border-dark-800">
                <th className="sticky left-0 z-10 bg-dark-900 px-3 py-1 text-left text-[11px] font-medium text-dark-500">
                  {t('turns.coverage')}
                </th>
                {dias.map((f) => {
                  const n = cobertura[f] || 0
                  const obj = Number(demanda[f]) || 0
                  const falta = (obj > 0 && n < obj) || (min > 0 && n < min)
                  return (
                    <td key={f} className={`px-1 py-1 text-center ${finde(f) ? 'bg-dark-800/40' : ''}`}>
                      <span className={`text-[12px] font-bold ${falta ? 'text-red-400' : 'text-dark-200'}`}>
                        {n}{obj > 0 && <span className="text-[10px] font-normal text-dark-600">/{obj}</span>}
                      </span>
                    </td>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {visibles.map((d) => (
                <tr key={d.id} className="group border-b border-dark-800/50 last:border-0">
                  <td className="sticky left-0 z-10 flex items-center gap-2 bg-dark-900 px-3 py-1.5">
                    <span className="max-w-[10rem] truncate text-[13px] text-dark-200" title={d.name}>{d.name}</span>
                    <span className="shrink-0 rounded bg-dark-800 px-1.5 text-[10px] font-bold tabular-nums text-dark-400"
                      title="Días de trabajo en lo que estás viendo">
                      {totales[d.id] ?? 0}
                    </span>
                    <span className="ml-auto hidden shrink-0 gap-0.5 group-hover:flex">
                      {Object.entries(TIPOS).map(([k, v]) => (
                        <button
                          key={k} onClick={() => filaEntera(d.id, k)} title={t('turns.fill').replace('{t}', t(v.k))}
                          className="h-4 w-4 rounded border border-dark-700 text-[9px] font-bold text-dark-500 hover:text-dark-200"
                        >{v.letra}</button>
                      ))}
                    </span>
                  </td>
                  {dias.map((f) => {
                    const k = `${d.id}|${f}`
                    const tipo = grid[k] || 'libre'
                    const ui = TIPOS[tipo]
                    const choca = choques.has(k)          // trabaja un día que tiene concedido
                    const concedido = aprobados.has(k)    // día libre aprobado
                    return (
                      <td key={f} className={`px-1 py-1 text-center ${finde(f) ? 'bg-dark-800/40' : ''}`}>
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
                            if (pintando.current && pincel) aplicar(d.id, f, false)
                          }}
                          title={`${d.name} · ${fmtNum(f)} · ${t(ui.k)}${
                            choca ? ' — OJO: tiene este día APROBADO libre' : (concedido ? ' — día libre aprobado' : '')}`}
                          className={`h-6 w-7 select-none rounded border text-[11px] font-bold transition hover:brightness-125 ${
                            choca ? 'border-red-500 bg-red-500/25 text-red-200 ring-1 ring-red-500/70'
                              : concedido ? 'border-emerald-500/50 bg-emerald-500/[0.07] text-emerald-400/80'
                                : ui.cls}`}
                        >
                          {choca ? '!' : ui.letra}
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

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-dark-500">
        {Object.entries(TIPOS).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`inline-flex h-4 w-5 items-center justify-center rounded border text-[9px] font-bold ${v.cls}`}>{v.letra}</span>
            {t(v.k)}
          </span>
        ))}
        <span className="text-dark-600">· {t('turns.hint')}</span>
      </div>

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
          {Object.entries(TIPOS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`inline-flex h-4 w-5 items-center justify-center rounded border text-[9px] font-bold ${v.cls}`}>{v.letra}</span>
              {t(v.k)}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-4 w-5 items-center justify-center rounded border border-emerald-500/50 bg-emerald-500/[0.07] text-[9px] font-bold text-emerald-400/80">L</span>
            Día libre aprobado
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
