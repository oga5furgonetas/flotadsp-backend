import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, CalendarClock, Users, ChevronLeft, ChevronRight, Save, Zap,
  Upload, Check, X, Settings2, AlertTriangle, Inbox,
} from 'lucide-react'
import {
  getShifts, getShiftCoverage, getDrivers, saveShiftsBulk, setShiftSettings,
  generateShiftsAuto, getRouteDemand, setRouteDemand, getShiftRequests,
  resolveShiftRequest, importShifts, getCodigosCuadrante, setCodigosCuadrante,
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
  // El mes NO sale del fichero: la plantilla de Amazon arrastra en la cabecera
  // el texto del mes anterior ("Desde: 01-06-2026" en un fichero de agosto).
  const [mesImport, setMesImport] = useState(() => new Date().toISOString().slice(0, 7))

  /* Ver las peticiones lo puede hacer cualquiera del centro; decidirlas no.
     Quién puede se configura por usuario en Usuarios → permisos, porque cada
     empresa reparte esto de una manera. El servidor lo comprueba también: un
     botón escondido no protege nada. */
  const puedeAprobar = canSee('aprobar-dias')

  const dias = useMemo(
    () => Array.from({ length: DIAS }, (_, i) => sumaDias(desde, i)),
    [desde],
  )
  const hasta = dias[DIAS - 1]

  const cargar = useCallback(async () => {
    if (noCenter) return
    setCargando(true); setErr(''); setAviso('')
    try {
      const [rd, rs, rc, rdem, rreq] = await Promise.all([
        getDrivers(center),
        getShifts(center, desde, hasta),
        getShiftCoverage(center, desde, hasta),
        getRouteDemand(center, desde, hasta),
        getShiftRequests(center, 'pendiente'),
      ])
      setDrivers(lista(rd.data).filter((d) => d.active !== false))
      const g = {}
      for (const s of lista(rs.data?.shifts)) g[`${s.driver_id}|${s.date}`] = s.type
      setGrid(g); setSucio(false)
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

  const ciclar = (did, fecha) => {
    const k = `${did}|${fecha}`
    setGrid((g) => ({ ...g, [k]: CICLO[g[k] || 'libre'] }))
    setSucio(true)
  }

  /* Pinta una fila entera (toda la quincena de un conductor) de una vez. */
  const filaEntera = (did, tipo) => {
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
    for (const g of m.values()) g.fechas.sort()
    return [...m.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
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
                    <div className="text-[10px] uppercase text-dark-500">{fmtDia(f)}</div>
                    <div className="text-[11px] font-semibold text-dark-300">{fmtNum(f)}</div>
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
              {drivers.map((d) => (
                <tr key={d.id} className="group border-b border-dark-800/50 last:border-0">
                  <td className="sticky left-0 z-10 flex items-center gap-2 bg-dark-900 px-3 py-1.5">
                    <span className="max-w-[11rem] truncate text-[13px] text-dark-200" title={d.name}>{d.name}</span>
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
                    const tipo = grid[`${d.id}|${f}`] || 'libre'
                    const ui = TIPOS[tipo]
                    return (
                      <td key={f} className={`px-1 py-1 text-center ${finde(f) ? 'bg-dark-800/40' : ''}`}>
                        <button
                          onClick={() => ciclar(d.id, f)}
                          title={`${d.name} · ${fmtNum(f)} · ${t(ui.k)}`}
                          className={`h-6 w-7 rounded border text-[11px] font-bold transition hover:brightness-125 ${ui.cls}`}
                        >
                          {ui.letra}
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
      {previa && (
        <div className="card border border-brand-500/30 p-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-dark-100">
            <Upload size={16} /> Esto es lo que voy a importar
          </h2>
          <p className="mb-3 text-xs text-dark-500">Todavía no se ha guardado nada.</p>

          <div className="mb-3 flex flex-wrap gap-x-7 gap-y-2">
            {[['Mes', previa.mes], ['Conductores', previa.conductores],
              ['Días', previa.dias], ['Trabaja', previa.trabaja],
              ['Libre', previa.libre]].map(([k, v]) => (
              <span key={k} className="flex items-baseline gap-1.5">
                <b className="text-lg font-bold tabular-nums text-dark-50">{v}</b>
                <span className="text-[12px] text-dark-500">{k}</span>
              </span>
            ))}
          </div>

          {previa.n_sin_conductor > 0 && (
            <div className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3">
              <p className="text-[12.5px] font-semibold text-amber-200">
                {previa.n_sin_conductor} nombre{previa.n_sin_conductor > 1 ? 's' : ''} del Excel no
                {previa.n_sin_conductor > 1 ? ' están' : ' está'} en {center}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-amber-200/70">
                Se quedan fuera. Suele ser que el nombre está escrito distinto o que son de otro
                centro: {previa.sin_conductor?.slice(0, 8).join(' · ')}
                {previa.n_sin_conductor > 8 ? ` y ${previa.n_sin_conductor - 8} más` : ''}
              </p>
            </div>
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
            <button onClick={confirmarImport} disabled={ocupado === 'importar' || !previa.turnos}
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
              <div key={g.key} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-dark-100">{g.driver_name}</span>
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
