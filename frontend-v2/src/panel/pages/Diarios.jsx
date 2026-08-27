import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, ClipboardPaste, Check, X, AlertTriangle, IdCard, Search, Users,
  Upload, FileText,
} from 'lucide-react'
import {
  pegarDiario, diariosPorConductor, vincularTransporterIds, asignarIdConductor, getDrivers,
  subirDiarios,
} from '../api'
import { lista } from '../../lib/lista'
import { isoLocal } from '../../lib/fecha'

/* ── CONTADOR DE DNRs ────────────────────────────────────────────────────────

   Lo que cuenta como defecto es DSC = 'Y'. No al revés, y no es una opinión:
   está conciliado contra 4 scorecards reales de Amazon en
   docs/REPORTES_DIARIOS.md. Las filas con DSC = 'N' son DNRs que existen pero
   NO puntúan, y por eso se enseñan las dos cifras separadas — sumarlas en una
   sola daría un número que no cuadra con lo que Amazon te factura.

   Y hay dos trampas que la pantalla tiene que respetar, las dos medidas:
     · el reporte del día F trae el bloque DNR de F−2;
     · la columna DSC se rellena 2-4 días TARDE, así que un bloque recién
       bajado viene entero a 'N' y parecería un día perfecto. */

/* El dinero SIEMPRE formateado por Intl. Concatenar '€' a un float deja cosas
   como '130.5700000000001 €' en pantalla, y en una cifra de dinero eso destruye
   la confianza en el resto del numero. */
const eur = (n) => new Intl.NumberFormat('es-ES',
  { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const eur2 = (n) => new Intl.NumberFormat('es-ES',
  { style: 'currency', currency: 'EUR' }).format(n || 0)

const domingoDe = (d) => {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  x.setDate(x.getDate() - x.getDay())
  return x
}

export default function Diarios() {
  const { center } = useOutletContext()
  const noCenter = center === 'Todos'

  const [rango, setRango] = useState(() => {
    const d = domingoDe(new Date())
    return { desde: isoLocal(d), hasta: isoLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6)) }
  })
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [err, setErr] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [busca, setBusca] = useState('')
  const [abierto, setAbierto] = useState(null)      // transporter_id desplegado

  /* La semana que contiene un día. El bloque DNR de un reporte es F−2, así que
     lo que acabas de subir casi nunca cae en la semana en curso: sin esto se
     guardaban 14 filas del día 19 y la pantalla seguía enseñando el 23-29,
     vacía y sin decir por qué. */
  const semanaDe = (iso) => {
    const d = domingoDe(new Date(iso + 'T12:00:00'))
    return { desde: isoLocal(d), hasta: isoLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6)) }
  }
  /* Sólo se coloca solo UNA vez, al abrir. Si saltara cada vez que el rango
     queda vacío, no se podría mirar una semana sin datos a propósito. */
  const yaColocado = useRef(false)

  const ficheroRef = useRef(null)
  const [subiendo, setSubiendo] = useState(false)
  const [previaSubida, setPreviaSubida] = useState(null)
  const [ficheros, setFicheros] = useState([])

  const [verPegar, setVerPegar] = useState(false)
  const [texto, setTexto] = useState('')
  const [previa, setPrevia] = useState(null)

  /* Los conductores del centro, para poder poner el nombre desde la propia
     fila. Es la salida cuando no hay lista que pegar ni historial del que
     sacarlo: los IDs se ven en la tabla, se elige la persona y ya. */
  const [conductores, setConductores] = useState([])
  const [asignando, setAsignando] = useState(null)
  /* Que fila se esta re-asignando. Antes, una vez puesto el nombre el
     desplegable desaparecia y un dedazo se quedaba para siempre: no habia
     ningun camino en la pantalla para deshacerlo. */
  const [corrigiendo, setCorrigiendo] = useState(null)

  const [verIds, setVerIds] = useState(false)
  const [textoIds, setTextoIds] = useState('')
  const [previaIds, setPreviaIds] = useState(null)

  const cargar = useCallback(async () => {
    if (noCenter) return
    setCargando(true); setErr('')
    try {
      const [r, rd] = await Promise.all([
        diariosPorConductor(center, rango.desde, rango.hasta),
        getDrivers(center),
      ])
      setDatos(r.data)
      setConductores(lista(rd.data)
        .filter((d) => d.active !== false)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })))
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudieron cargar los diarios.')
    } finally { setCargando(false) }
  }, [center, rango, noCenter])

  useEffect(() => { cargar() }, [cargar])

  /* Si al abrir no hay nada en la ventana pero SÍ hay datos en otra fecha, se
     salta a la última semana con datos y se dice. Vale más enseñar algo y
     explicar dónde estás que una pantalla vacía que parece un fallo. */
  useEffect(() => {
    if (yaColocado.current || !datos) return
    const ult = datos?.disponible?.ultimo_dia
    if (!ult || datos.totales?.dnr_total > 0) return
    yaColocado.current = true
    setRango(semanaDe(ult))
    setAviso(`No había nada en esas fechas. Te he llevado a la última semana con datos (${ult.slice(8)}/${ult.slice(5, 7)}).`)
  }, [datos])

  const elegirFicheros = async (lista) => {
    const fs = Array.from(lista || []).filter((f) => /\.html?$/i.test(f.name))
    setFicheros(fs); setPreviaSubida(null); setErr(''); setAviso('')
    if (!fs.length) { setErr('Elige ficheros .html descargados de Cortex.'); return }
    setSubiendo(true)
    try {
      const r = await subirDiarios(fs, center, false)
      setPreviaSubida(r.data)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudieron leer los ficheros.')
    } finally { setSubiendo(false) }
  }

  const confirmarSubida = async () => {
    setSubiendo(true); setErr('')
    try {
      const r = await subirDiarios(ficheros, center, true)
      const tot = r.data.totales || {}
      setPreviaSubida(null); setFicheros([])
      if (ficheroRef.current) ficheroRef.current.value = ''
      setAviso(`${tot.reportes} reportes guardados: ${tot.dnr} DNR y ${tot.otras} filas de RTS, POD y contacto.`)
      // Colocarse donde están los datos que se acaban de subir.
      if (r.data.ultimo_dia) { yaColocado.current = true; setRango(semanaDe(r.data.ultimo_dia)) }
      else await cargar()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo guardar.')
    } finally { setSubiendo(false) }
  }

  const previsualizar = async () => {
    setOcupado('previa'); setErr(''); setAviso('')
    try {
      const r = await pegarDiario({ texto, center })
      setPrevia(r.data)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo leer lo pegado.')
    } finally { setOcupado('') }
  }

  const confirmar = async () => {
    setOcupado('guardar'); setErr('')
    try {
      const r = await pegarDiario({ texto, center, confirmar: true })
      setPrevia(null); setTexto(''); setVerPegar(false)
      setAviso(`Guardado: ${r.data.dnr_guardados} filas DNR del ${r.data.fecha_dnr}`
        + `${r.data.clasificados_ahora ? ` · ${r.data.clasificados_ahora} pasaron a defecto al reclasificarse` : ''}`)
      await cargar()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo guardar.')
    } finally { setOcupado('') }
  }

  const previsualizarIds = async () => {
    setOcupado('ids'); setErr('')
    try {
      const r = await vincularTransporterIds({ texto: textoIds, center })
      setPreviaIds(r.data)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo leer la lista.')
    } finally { setOcupado('') }
  }

  /* Vincular sin pegar nada, sacando las parejas del historial de rutas. Ese
     dato ya estaba en la base de datos —y viene de Amazon, no de una hoja
     escrita a mano— mientras las 86 fichas de DGA1 seguían sin un solo ID. */
  const vincularDesdeHistorial = async (confirmar) => {
    setOcupado('auto'); setErr('')
    try {
      const r = await vincularTransporterIds({ desde_historial: true, center, confirmar })
      if (confirmar) {
        setPreviaIds(null)
        setAviso(`${r.data.n_vinculan} conductores vinculados desde el historial de Amazon.`)
        await cargar()
      } else {
        setPreviaIds(r.data); setVerIds(true)
      }
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo leer el historial.')
    } finally { setOcupado('') }
  }

  const confirmarIds = async () => {
    setOcupado('ids'); setErr('')
    try {
      const r = await vincularTransporterIds({ texto: textoIds, center, confirmar: true })
      setPreviaIds(null); setTextoIds(''); setVerIds(false)
      setAviso(`${r.data.n_vinculan} conductores vinculados con su Transporter ID.`)
      await cargar()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudieron guardar.')
    } finally { setOcupado('') }
  }

  const ponerNombre = async (tid, driverId) => {
    setAsignando(tid); setErr('')
    try {
      const r = await asignarIdConductor({ transporter_id: tid, driver_id: driverId })
      setAviso(`${tid} → ${r.data.driver_name}`)
      await cargar()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo asignar.')
    } finally { setAsignando('') }
  }

  const filas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const cs = lista(datos?.conductores)
    if (!q) return cs
    return cs.filter((c) => (c.driver_name || c.transporter_id || '').toLowerCase().includes(q))
  }, [datos, busca])

  if (noCenter) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <Users size={28} className="text-dark-500" />
        <p className="text-dark-300">Elige un centro arriba para ver sus DNRs.</p>
      </div>
    )
  }

  const t = datos?.totales || {}

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <AlertTriangle size={20} /> DNR · {center}
        </h1>
        <div className="flex items-center gap-1.5">
          <input type="date" value={rango.desde}
            onChange={(e) => e.target.value && setRango((r) => ({ ...r, desde: e.target.value }))}
            className="rounded-lg border border-dark-700 bg-dark-950 px-2 py-1 text-[12.5px] font-semibold text-dark-100" />
          <span className="text-dark-600">→</span>
          <input type="date" value={rango.hasta}
            onChange={(e) => e.target.value && setRango((r) => ({ ...r, hasta: e.target.value }))}
            className="rounded-lg border border-dark-700 bg-dark-950 px-2 py-1 text-[12.5px] font-semibold text-dark-100" />
          <span className="ml-1 text-[11px] text-dark-600">por fecha de concesión</span>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setVerIds((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-dark-700 px-3 py-1.5 text-[12.5px] font-semibold text-dark-300 hover:text-dark-100">
            <IdCard size={15} /> Transporter IDs
          </button>
          <button onClick={() => setVerPegar((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-dark-700 px-3 py-1.5 text-[12.5px] font-semibold text-dark-300 hover:text-dark-100">
            <ClipboardPaste size={15} /> Pegar
          </button>
          <button onClick={() => ficheroRef.current?.click()} disabled={subiendo}
            className="btn-primary flex items-center gap-1.5 text-[12.5px] disabled:opacity-50">
            {subiendo ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            Subir Daily Report
          </button>
          <input ref={ficheroRef} type="file" accept=".html,.htm" multiple className="hidden"
            onChange={(e) => elegirFicheros(e.target.files)} />
        </div>
      </div>

      {err && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}
      {aviso && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{aviso}</p>}

      {/* Las cuatro cifras. Separadas a propósito: el total y los defectos NO
          son lo mismo y juntarlos daría un número que no cuadra con Amazon. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {/* El dinero primero y en grande: es la cifra que decide si esto
            importa esta semana o no. Y son los DEFECTOS, no todos los DNRs:
            los que no puntúan no restan nada. */}
        <div className="rounded-xl border border-red-500/30 bg-red-500/[0.07] px-3.5 py-3"
          title="Suma del valor de los paquetes de los DNR que SÍ puntúan (DSC = Y). Es el valor de la mercancía concedida al cliente, tal y como lo da Cortex.">
          <p className="text-[11px] uppercase tracking-wider text-red-300/70">En paquetes que puntúan</p>
          <p className="text-2xl font-bold tabular-nums text-red-300">{eur(t.euros_defectos)}</p>
          <p className="mt-0.5 text-[11px] text-red-200/50">de {eur(t.euros)} en DNRs totales</p>
        </div>
        {[['DNRs en total', t.dnr_total, 'text-dark-100'],
          ['Defectos (DSC = Y)', t.defectos, 'text-red-300'],
          ['No puntúan (DSC = N)', t.limpias, 'text-emerald-300'],
          ['Sin clasificar', t.sin_clasificar, 'text-amber-300']].map(([lbl, v, cls]) => (
          <div key={lbl} className="rounded-xl border border-dark-800 bg-dark-900/60 px-3.5 py-3">
            <p className="text-[11px] uppercase tracking-wider text-dark-500">{lbl}</p>
            <p className={`text-2xl font-bold tabular-nums ${cls}`}>{v ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Desglose por semana de Amazon: es como se factura y como se mira la
          scorecard. Solo se enseña si el rango pisa mas de una. */}
      {datos?.por_semana?.length > 1 && (
        <div className="rounded-xl border border-dark-800 bg-dark-900/60 px-3.5 py-3">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-dark-500">
            Por semana de Amazon (domingo a sábado)
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {datos.por_semana.map((s2) => (
              <div key={s2.semana}>
                <p className="text-[11.5px] text-dark-500">Semana del {s2.semana.slice(8)}/{s2.semana.slice(5, 7)}</p>
                <p className="text-[15px] font-bold tabular-nums text-red-300">
                  {eur(s2.euros_defectos)}
                  <span className="ml-1.5 text-[11.5px] font-normal text-dark-500">
                    {s2.defectos} de {s2.dnr} DNRs
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {datos?.sin_nombre?.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3.5 py-2.5">
          <p className="text-[12.5px] text-amber-200">
            <b>{datos.sin_nombre.length}</b> {datos.sin_nombre.length === 1 ? 'ID no tiene' : 'IDs no tienen'} nombre:
            salen como código. {' '}
            <button onClick={() => setVerIds(true)} className="underline underline-offset-2 hover:text-amber-100">
              Pegar la lista
            </button>
          </p>
          <p className="mt-1 font-mono text-[11px] text-amber-200/60">{datos.sin_nombre.join(' · ')}</p>
        </div>
      )}

      {datos?.dias_con_datos?.length > 0 && (
        <p className="px-1 text-[11.5px] text-dark-600">
          Días cargados en este rango: {datos.dias_con_datos.length} ({datos.dias_con_datos.join(' · ')})
        </p>
      )}

      {/* ── LO QUE TRAEN LOS FICHEROS, ANTES DE GUARDAR ──────────────────── */}
      {previaSubida && (
        <div className="card p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <FileText size={16} className="text-brand-400" />
            <h3 className="text-sm font-bold text-dark-100">
              {previaSubida.ficheros} {previaSubida.ficheros === 1 ? 'fichero leído' : 'ficheros leídos'}
            </h3>
            {previaSubida.con_error > 0 && (
              <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                {previaSubida.con_error} con error
              </span>
            )}
            <button onClick={() => { setPreviaSubida(null); setFicheros([]) }}
              className="ml-auto text-dark-500 hover:text-dark-200"><X size={16} /></button>
          </div>

          <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2">
            {[['Reportes', previaSubida.totales?.reportes], ['DNR', previaSubida.totales?.dnr],
              ['RTS · POD · contacto', previaSubida.totales?.otras],
              ['Desde', previaSubida.primer_dia], ['Hasta', previaSubida.ultimo_dia]].map(([k, v]) => (
              <div key={k}>
                <p className="text-[10.5px] uppercase tracking-wider text-dark-600">{k}</p>
                <p className="text-[14px] font-semibold text-dark-100">{v ?? '—'}</p>
              </div>
            ))}
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-dark-800">
            <table className="w-full text-left text-[12px]">
              <thead className="sticky top-0 bg-dark-900">
                <tr className="text-[10px] uppercase tracking-wider text-dark-600">
                  <th className="px-2 py-1.5 font-semibold">Fichero</th>
                  <th className="px-2 py-1.5 font-semibold">Reporte</th>
                  <th className="px-2 py-1.5 font-semibold">Bloque DNR</th>
                  <th className="px-2 py-1.5 text-right font-semibold">DNR</th>
                  <th className="px-2 py-1.5 text-right font-semibold">RTS</th>
                  <th className="px-2 py-1.5 text-right font-semibold">POD</th>
                  <th className="px-2 py-1.5 text-right font-semibold">CC</th>
                  <th className="px-2 py-1.5 font-semibold">Cruce</th>
                </tr>
              </thead>
              <tbody>
                {(previaSubida.resultados || []).map((r, i) => (
                  <tr key={r.fichero + i} className={`border-t border-dark-800/70 ${i % 2 ? 'bg-dark-800/[0.15]' : ''}`}>
                    <td className="max-w-[15rem] truncate px-2 py-1 text-dark-300" title={r.fichero}>{r.fichero}</td>
                    {r.error ? (
                      <td colSpan={7} className="px-2 py-1 text-red-300">{r.error}</td>
                    ) : (
                      <>
                        <td className="whitespace-nowrap px-2 py-1 tabular-nums text-dark-300">{r.fecha_reporte}</td>
                        <td className="whitespace-nowrap px-2 py-1 tabular-nums text-dark-400">{r.fecha_dnr}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-dark-200">{r.dnr}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-dark-500">{r.rts}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-dark-500">{r.pod}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-dark-500">{r.cc}</td>
                        <td className="px-2 py-1">
                          {r.descuadres ? (
                            <span className="text-red-300">{r.descuadres} no cuadran</span>
                          ) : <span className="text-emerald-400/70">cuadra</span>}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Los avisos de los reportes viejos, agrupados: uno por fichero
              llenaría la pantalla y dicen todos lo mismo. */}
          {(() => {
            const viejos = (previaSubida.resultados || []).filter((r) => (r.avisos || []).length)
            return viejos.length ? (
              <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[12px] leading-relaxed text-amber-200">
                {viejos.length} {viejos.length === 1 ? 'reporte es' : 'reportes son'} anteriores al 13-05-2026 y no
                traen la columna DSC. Sus DNR se guardan <b>sin clasificar</b>: existen, pero no se
                puede saber cuáles puntúan. No cuentan como defectos.
              </p>
            ) : null
          })()}

          <button onClick={confirmarSubida} disabled={subiendo || !previaSubida.totales?.reportes}
            className="btn-primary mt-3 flex items-center gap-1.5 text-sm disabled:opacity-40">
            {subiendo ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Guardar {previaSubida.totales?.reportes} reportes
          </button>
        </div>
      )}

      {/* ── PEGAR EL REPORTE ──────────────────────────────────────────────── */}
      {verPegar && (
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2">
            <ClipboardPaste size={16} className="text-brand-400" />
            <h3 className="text-sm font-bold text-dark-100">Pegar el Daily Report de Cortex</h3>
            <button onClick={() => { setVerPegar(false); setPrevia(null) }}
              className="ml-auto text-dark-500 hover:text-dark-200"><X size={16} /></button>
          </div>
          <p className="mb-2 text-[12.5px] leading-relaxed text-dark-400">
            Copia y pega las dos tablas: el resumen (Transporter ID · RTS · DNR · POD · CC)
            y el detalle de DNR con su título. Puedes pegarlas juntas y en cualquier orden.
            El día del bloque DNR sale de su propio título, y si no está se calcula: el
            reporte del día F trae siempre el bloque de F−2.
          </p>
          <textarea value={texto} onChange={(e) => { setTexto(e.target.value); setPrevia(null) }}
            rows={7} placeholder="Pega aquí el reporte entero"
            className="w-full rounded-lg border border-dark-700 bg-dark-950 p-2.5 font-mono text-[11px] text-dark-200 outline-none placeholder:text-dark-700" />
          <div className="mt-2 flex items-center gap-3">
            <button onClick={previsualizar} disabled={!texto.trim() || !!ocupado}
              className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40">
              {ocupado === 'previa' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Ver qué va a entrar
            </button>
            <span className="text-[11.5px] text-dark-600">
              {texto ? `${texto.trim().split('\n').length} líneas` : ''}
            </span>
          </div>

          {previa && (
            <div className="mt-3 rounded-lg border border-dark-700 bg-dark-900/60 p-3">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {[['Reporte', previa.fecha_reporte], ['Bloque DNR', previa.fecha_dnr],
                  ['Semana Amazon', previa.semana], ['Conductores', previa.conductores],
                  ['Filas DNR', previa.filas_dnr]].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[10.5px] uppercase tracking-wider text-dark-600">{k}</p>
                    <p className="text-[13px] font-semibold text-dark-100">{v ?? '—'}</p>
                  </div>
                ))}
              </div>

              {/* EL CRUCE. Es lo único que dice si lo pegado está completo. */}
              <div className={`mt-3 rounded-lg px-3 py-2 text-[12.5px] ${
                previa.descuadres?.length
                  ? 'border border-red-500/40 bg-red-500/[0.08] text-red-200'
                  : 'border border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-200'}`}>
                {previa.descuadres?.length ? (
                  <>
                    <b>{previa.descuadres.length} no cuadran</b> entre el resumen y el detalle.
                    Suele ser que falta media tabla por copiar:
                    <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-red-200/80">
                      {previa.descuadres.map((d) => (
                        <li key={d.transporter_id}>
                          {d.transporter_id}: el resumen dice {d.dice_el_resumen}, hay {d.filas_de_detalle} filas
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>Cuadra: el resumen suma <b>{previa.dnr_resumen}</b> DNRs y el detalle trae{' '}
                    <b>{previa.dnr_detalle}</b> filas, conductor a conductor.</>
                )}
              </div>

              {(previa.avisos || []).map((a) => (
                <p key={a} className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[12px] leading-relaxed text-amber-200">
                  {a}
                </p>
              ))}

              <button onClick={confirmar} disabled={!!ocupado}
                className="btn-primary mt-3 flex items-center gap-1.5 text-sm disabled:opacity-40">
                {ocupado === 'guardar' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Guardar {previa.filas_dnr} filas
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── VINCULAR IDs ──────────────────────────────────────────────────── */}
      {verIds && (
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2">
            <IdCard size={16} className="text-brand-400" />
            <h3 className="text-sm font-bold text-dark-100">Transporter ID de cada conductor</h3>
            <button onClick={() => { setVerIds(false); setPreviaIds(null) }}
              className="ml-auto text-dark-500 hover:text-dark-200"><X size={16} /></button>
          </div>
          <p className="mb-2 text-[12.5px] leading-relaxed text-dark-400">
            Una persona por línea: nombre, tabulador, ID. Los nombres no tienen que estar
            escritos igual que en las fichas — se emparejan por palabras. Antes de guardar
            se comprueba contra el historial de rutas, que trae el ID y el nombre juntos y
            viene de Amazon.
          </p>
          <textarea value={textoIds} onChange={(e) => { setTextoIds(e.target.value); setPreviaIds(null) }}
            rows={6} placeholder={'NOMBRE APELLIDOS\tA1B2C3D4E5F6G7'}
            className="w-full rounded-lg border border-dark-700 bg-dark-950 p-2.5 font-mono text-[11px] text-dark-200 outline-none placeholder:text-dark-700" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={previsualizarIds} disabled={!textoIds.trim() || !!ocupado}
              className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40">
              {ocupado === 'ids' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Comprobar lo pegado
            </button>
            <span className="text-[11.5px] text-dark-600">o</span>
            <button onClick={() => vincularDesdeHistorial(false)} disabled={!!ocupado}
              title="Saca las parejas nombre + ID del historial de rutas, que ya está en la base de datos y viene de Amazon. No hay que pegar nada."
              className="flex items-center gap-1.5 rounded-lg border border-dark-700 px-3 py-1.5 text-sm font-semibold text-dark-300 hover:text-dark-100 disabled:opacity-40">
              {ocupado === 'auto' ? <Loader2 size={14} className="animate-spin" /> : <IdCard size={14} />}
              Sacarlos del historial de Amazon
            </button>
          </div>

          {previaIds && (
            <div className="mt-3 space-y-2">
              <p className="text-[12.5px] text-dark-300">
                {previaIds.pares_leidos} parejas leídas en {previaIds.centro} ·{' '}
                <b className="text-emerald-300">{previaIds.n_vinculan} se vinculan</b>
                {previaIds.ya_estaban > 0 && ` · ${previaIds.ya_estaban} ya estaban`}
              </p>
              {previaIds.formato === 'dos columnas emparejadas por orden' && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[12px] leading-relaxed text-amber-200">
                  Lo has pegado en <b>dos bloques</b>: primero todos los nombres y después todos los
                  IDs. Los he emparejado <b>por orden</b> — el primer nombre con el primer ID, y así.
                  Míralo antes de confirmar: si el orden de las dos columnas no era el mismo,
                  los defectos se le colgarían a quien no es.
                </p>
              )}
              {/* Lo que SÍ se va a escribir, a la vista. Un emparejamiento por
                  orden no se puede confirmar sin poder comprobarlo. */}
              {previaIds.vinculan?.length > 0 && (
                <div className="max-h-52 overflow-y-auto rounded-lg border border-dark-800">
                  <table className="w-full text-left text-[12px]">
                    <tbody>
                      {previaIds.vinculan.map((v, i) => (
                        <tr key={v.transporter_id} className={i % 2 ? 'bg-dark-800/[0.15]' : ''}>
                          <td className="px-2 py-1 text-dark-200">{v.nombre}</td>
                          <td className="px-2 py-1 font-mono text-[11px] text-dark-500">{v.transporter_id}</td>
                          <td className="px-2 py-1 text-[11px] text-dark-600">
                            {v.escrito && v.escrito !== v.nombre ? `escrito «${v.escrito}»` : ''}
                            {v.de_baja ? ' · de baja' : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {previaIds.discrepan?.length > 0 && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/[0.08] px-3 py-2 text-[12px] text-red-200">
                  <b>{previaIds.discrepan.length} no coinciden con el historial de Amazon.</b> No se tocan:
                  un ID mal puesto le cuelga los defectos de uno a otro.
                  <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-red-200/80">
                    {previaIds.discrepan.map((d) => (
                      <li key={d.transporter_id}>{d.transporter_id}: tú dices «{d.tu_lista}», el historial «{d.el_historial}»</li>
                    ))}
                  </ul>
                </div>
              )}
              {previaIds.conflictos?.length > 0 && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[12px] text-amber-200">
                  {previaIds.conflictos.length} ya tenían OTRO ID guardado y no se pisan:{' '}
                  {previaIds.conflictos.map((c) => `${c.nombre} (${c.tenia} → ${c.quieres})`).join(' · ')}
                </p>
              )}
              {previaIds.sin_id?.length > 0 && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[12px] leading-relaxed text-amber-200">
                  {previaIds.sin_id.length} {previaIds.sin_id.length === 1 ? 'línea no traía' : 'líneas no traían'} ningún
                  ID (o traían dos) y {previaIds.sin_id.length === 1 ? 'se ha' : 'se han'} dejado fuera:{' '}
                  <span className="font-mono text-[11px] text-amber-200/60">
                    «{previaIds.sin_id[0]}»{previaIds.sin_id.length > 1 ? ` y ${previaIds.sin_id.length - 1} más` : ''}
                  </span>
                </p>
              )}
              {previaIds.n_no_parecen > 0 && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[12px] leading-relaxed text-amber-200">
                  {previaIds.n_no_parecen} {previaIds.n_no_parecen === 1 ? 'línea tiene' : 'líneas tienen'} un
                  ID pero lo de al lado no parece el nombre de una persona, así que
                  {previaIds.n_no_parecen === 1 ? ' se ha' : ' se han'} dejado fuera:{' '}
                  <span className="font-mono text-[11px] text-amber-200/60">
                    «{previaIds.no_parecen_nombre?.[0]}»
                  </span>
                </p>
              )}
              {previaIds.sin_ficha?.length > 0 && (
                <p className="rounded-lg border border-dark-700 bg-dark-900/60 px-3 py-2 text-[12px] text-dark-400">
                  {previaIds.sin_ficha.length} sin ficha de conductor en la app (oficina, bajas o nombres nuevos):{' '}
                  {previaIds.sin_ficha.slice(0, 10).map((s) => s.nombre).join(' · ')}
                  {previaIds.sin_ficha.length > 10 ? ` y ${previaIds.sin_ficha.length - 10} más` : ''}
                </p>
              )}
              {previaIds.sin_cubrir?.length > 0 && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[12px] text-amber-200">
                  Salen en los reportes y esta lista no los cubre:{' '}
                  <span className="font-mono">{previaIds.sin_cubrir.map((s) => s.transporter_id).join(' · ')}</span>
                </p>
              )}
              <button
                onClick={() => (textoIds.trim() ? confirmarIds() : vincularDesdeHistorial(true))}
                disabled={!previaIds.n_vinculan || !!ocupado}
                className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40">
                <Check size={14} /> Vincular {previaIds.n_vinculan}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── LA TABLA ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-600" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conductor"
            className="w-52 rounded-lg border border-dark-700 bg-dark-950 py-1.5 pl-7 pr-2 text-[12.5px] text-dark-100 placeholder:text-dark-600" />
        </div>
        <span className="text-[11.5px] text-dark-600">{filas.length} conductores</span>
      </div>

      {cargando ? (
        <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> Cargando…</div>
      ) : !filas.length ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <AlertTriangle size={26} className="text-dark-600" />
          <p className="text-dark-400">No hay diarios cargados en estas fechas.</p>
          <p className="text-[12.5px] text-dark-600">Pega el Daily Report de Cortex para empezar.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-dark-600">
                <th className="px-3 py-2 font-semibold">Conductor</th>
                <th className="px-3 py-2 font-semibold">Transporter ID</th>
                <th className="px-2 py-2 text-center font-semibold">DNRs</th>
                <th className="px-2 py-2 text-center font-semibold text-red-400/80">Defectos</th>
                <th className="px-2 py-2 text-right font-semibold text-red-400/80">€ que puntúan</th>
                <th className="px-2 py-2 text-center font-semibold">No puntúan</th>
                <th className="px-2 py-2 text-center font-semibold">Sin clasif.</th>
                <th className="px-2 py-2 text-center font-semibold">RTS</th>
                <th className="px-2 py-2 text-center font-semibold">POD</th>
                <th className="px-2 py-2 text-center font-semibold">CC</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c, i) => (
                <Fragment key={c.transporter_id}>
                  <tr
                    onClick={() => setAbierto(abierto === c.transporter_id ? null : c.transporter_id)}
                    className={`cursor-pointer border-t border-dark-800/70 hover:bg-dark-800/30 ${i % 2 ? 'bg-dark-800/[0.15]' : ''}`}>
                    <td className="px-3 py-1.5">
                      <span className={c.driver_name ? 'text-dark-200' : 'font-mono text-[11px] text-amber-300/80'}>
                        {c.driver_name || c.transporter_id}
                      </span>
                      {c.driver_name && corrigiendo !== c.transporter_id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setCorrigiendo(c.transporter_id) }}
                          title={`Transporter ID ${c.transporter_id} — pulsa si no es esta persona`}
                          className="ml-2 rounded border border-dark-700 px-1.5 py-0.5 text-[10px] font-semibold text-dark-500 hover:text-dark-200">
                          no es él
                        </button>
                      )}
                      {c.driver_name && corrigiendo === c.transporter_id && (
                        <>
                          <select
                            value=""
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              if (!e.target.value) return
                              // '' quita el id de quien lo tuviera; el backend ya
                              // lo contempla y es lo que deja la fila como estaba.
                              ponerNombre(c.transporter_id, e.target.value === '__quitar' ? '' : e.target.value)
                              setCorrigiendo(null)
                            }}
                            disabled={asignando === c.transporter_id}
                            className="ml-2 max-w-[13rem] rounded border border-amber-500/40 bg-dark-950 px-1.5 py-0.5 text-[11.5px] text-amber-200 outline-none">
                            <option value="">
                              {asignando === c.transporter_id ? 'guardando…' : '¿quién es en realidad?'}
                            </option>
                            <option value="__quitar">— quitarlo, ya lo asigno luego —</option>
                            {conductores.map((d) => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={(e) => { e.stopPropagation(); setCorrigiendo(null) }}
                            className="ml-1 text-[10px] text-dark-500 hover:text-dark-200">cancelar</button>
                        </>
                      )}
                      {!c.driver_name && (
                        // Sin nombre: se elige aquí mismo. Con el `select` no
                        // hay nada que emparejar ni adivinar — se señala la
                        // ficha a dedo, que es lo único que no puede fallar.
                        <select
                          value=""
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => e.target.value && ponerNombre(c.transporter_id, e.target.value)}
                          disabled={asignando === c.transporter_id}
                          className="ml-2 max-w-[13rem] rounded border border-amber-500/40 bg-dark-950 px-1.5 py-0.5 text-[11.5px] text-amber-200 outline-none">
                          <option value="">
                            {asignando === c.transporter_id ? 'guardando…' : '¿quién es?'}
                          </option>
                          {conductores.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      )}
                      {(c.de_baja || c.ficha_sin_vincular || c.sin_ficha || c.solo_historial) && (
                        <span className={`ml-1.5 rounded px-1 text-[9px] ${
                          c.ficha_sin_vincular ? 'bg-amber-500/15 text-amber-300/80' : 'bg-dark-800 text-dark-300'}`}
                          title={c.de_baja
                            ? 'Ficha dada de baja: ya no trabaja aquí, pero este DNR es suyo'
                            : c.ficha_sin_vincular
                              ? 'SÍ tiene ficha: lo que falta es ponerle el Transporter ID. Pulsa "Vincular desde el historial".'
                              : 'Sin ficha de conductor en la app (oficina, o alguien que se fue antes)'}>
                          {c.de_baja ? 'ya no está' : c.ficha_sin_vincular ? 'ID sin vincular' : 'sin ficha'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[10.5px] text-dark-600">{c.transporter_id}</td>
                    <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-dark-200">{c.dnr_total}</td>
                    <td className={`px-2 py-1.5 text-center font-bold tabular-nums ${c.defectos ? 'text-red-300' : 'text-dark-600'}`}>
                      {c.defectos}
                    </td>
                    <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${c.euros_defectos ? 'text-red-300' : 'text-dark-700'}`}
                      title={`${eur2(c.euros_defectos)} de los ${eur2(c.euros)} que suman todos sus DNRs`}>
                      {c.euros_defectos ? eur(c.euros_defectos) : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-center tabular-nums text-dark-500">{c.limpias}</td>
                    <td className={`px-2 py-1.5 text-center tabular-nums ${c.sin_clasificar ? 'text-amber-300' : 'text-dark-700'}`}>
                      {c.sin_clasificar || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-center tabular-nums text-dark-400">{c.rts ?? '—'}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums text-dark-400">{c.pod_fails ?? '—'}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums text-dark-400">{c.cc_fails ?? '—'}</td>
                  </tr>
                  {abierto === c.transporter_id && c.detalle?.length > 0 && (
                    <tr className="bg-dark-950/60">
                      <td colSpan={10} className="px-3 py-2">
                        <p className="mb-1 font-mono text-[10.5px] text-dark-600">{c.transporter_id}</p>
                        <table className="w-full text-left text-[11.5px]">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-dark-600">
                              <th className="py-1 pr-3 font-semibold">Concesión</th>
                              <th className="py-1 pr-3 font-semibold">Entrega</th>
                              <th className="py-1 pr-3 font-semibold">Tracking</th>
                              <th className="py-1 pr-3 font-semibold">Dónde se dejó</th>
                              <th className="py-1 pr-3 font-semibold">Valor</th>
                              <th className="py-1 font-semibold">DSC</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.detalle.map((d) => (
                              <tr key={d.tracking_id} className="text-dark-400">
                                <td className="py-0.5 pr-3 tabular-nums">{d.fecha_concesion}</td>
                                <td className="py-0.5 pr-3 tabular-nums text-dark-600">{d.fecha_entrega || '—'}</td>
                                <td className="py-0.5 pr-3 font-mono text-[10.5px]">{d.tracking_id}</td>
                                <td className="py-0.5 pr-3">{(d.scan || '').replace('DELIVERED_TO_', '').replace(/_/g, ' ').toLowerCase()}</td>
                                <td className="py-0.5 pr-3 tabular-nums">{d.valor || '—'}</td>
                                <td className="py-0.5">
                                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                    d.dsc === 'Y' ? 'bg-red-500/20 text-red-300'
                                      : d.dsc === 'N' ? 'bg-emerald-500/15 text-emerald-300'
                                        : 'bg-amber-500/15 text-amber-300'}`}>
                                    {d.dsc || 'sin clasificar'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
