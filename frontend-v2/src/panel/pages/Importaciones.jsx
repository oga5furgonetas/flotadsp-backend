import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { useT } from '../../i18n'
import {
  Loader2, Truck, Check, AlertTriangle, RotateCcw, ArrowRight, Users, CalendarDays,
  PackageSearch, Trophy, CircleDashed, ClipboardPaste, Download, Columns3,
} from 'lucide-react'
import { importVehicles, previsualizarVehiculos, getOnboarding } from '../api'
import EleccionCentros, { seleccionInicial, resumenSeleccion, eleccionParaEnviar } from '../components/EleccionCentros'
import ImportarConductores from '../components/ImportarConductores'
import SubirFichero from '../components/SubirFichero'
import Pasos from '../components/Pasos'
import MapeoColumnas, { textoAFichero, descargarPlantilla } from '../components/MapeoColumnas'

/* INTEGRAR LO QUE YA TIENES.
   Un sitio para todo lo que una empresa nueva trae de fuera, una pestaña por
   cosa y un asistente corto en cada una: subir → revisar → listo. Nada se
   guarda sin haberlo visto antes, y un fichero con varias naves se reparte
   para elegir cuáles entran. El estado de cada pestaña sale de los datos
   reales (`/onboarding`), no de una marca guardada. */

const PESTANAS = [
  { id: 'furgonetas', label: 'Furgonetas', icono: Truck, paso: 'vehiculos' },
  { id: 'conductores', label: 'Conductores', icono: Users, paso: 'conductores' },
  { id: 'turnos', label: 'Turnos', icono: CalendarDays, nave: 'turnos' },
  { id: 'cortex', label: 'Cortex', icono: PackageSearch, nave: 'cortex' },
  { id: 'scorecard', label: 'Scorecard', icono: Trophy, nave: 'objetivos' },
]

function ImportarFlota({ center, alTerminar }) {
  const [fichero, setFichero] = useState(null)
  const [vista, setVista] = useState(null)
  const [empresa, setEmpresa] = useState([])
  const [sel, setSel] = useState({})
  const [crear, setCrear] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [hecho, setHecho] = useState(null)
  const [columnas, setColumnas] = useState({})   // correcciones: {índice: campo}
  const [verColumnas, setVerColumnas] = useState(false)
  const [pegando, setPegando] = useState(false)
  const [pegado, setPegado] = useState('')

  const reiniciar = () => {
    setFichero(null); setVista(null); setSel({}); setErr(''); setHecho(null)
    setColumnas({}); setVerColumnas(false); setPegando(false); setPegado('')
  }

  const leer = async (file, cols = {}) => {
    setBusy('leyendo'); setErr(''); setHecho(null)
    try {
      const { data: d } = await previsualizarVehiculos(file, cols)
      const emp = d.centros_empresa || []
      setEmpresa(emp)
      setSel(seleccionInicial(d.centros, emp, center))
      setCrear((d.flota_actual || 0) === 0)   // flota vacía: este fichero ES su flota
      setFichero(file); setVista(d); setColumnas(cols)
      if (d.falta_matricula) setVerColumnas(true)
    } catch (ex) {
      setErr(ex?.response?.data?.detail || 'No se ha podido leer el fichero.')
    } finally { setBusy('') }
  }

  // Corregir una columna vuelve a leer el fichero con la asignación nueva.
  const cambiarColumna = (indice, campo) => leer(fichero, { ...columnas, [indice]: campo })

  const resumen = useMemo(() => (vista ? resumenSeleccion(vista.centros, sel) : null), [vista, sel])

  const importar = async () => {
    setBusy('importando'); setErr('')
    try {
      const { data: d } = await importVehicles(fichero, null, crear,
        { ...eleccionParaEnviar(vista.centros, sel), columnas })
      setHecho(d); setVista(null); setFichero(null)
      alTerminar?.()
    } catch (ex) {
      setErr(ex?.response?.data?.detail || 'No se ha podido importar.')
    } finally { setBusy('') }
  }

  const puede = vista && !vista.falta_matricula && resumen && resumen.sinDestino === 0
    && (resumen.existentes > 0 || (crear && resumen.nuevas > 0))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pasos actual={hecho ? 2 : vista ? 1 : 0} />
        {(vista || hecho) && (
          <button onClick={reiniciar} className="inline-flex items-center gap-1 text-[12px] text-dark-500 hover:text-dark-300">
            <RotateCcw size={12} /> Otro fichero
          </button>
        )}
      </div>

      {err && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {err}
        </p>
      )}

      {!vista && !hecho && !pegando && (
        <>
          <SubirFichero onFile={(f) => leer(f)} ocupado={busy === 'leyendo'}
            titulo="Arrastra el Excel de tus furgonetas"
            pie="el tuyo, el de la gestoría o el de Amazon" />
          <div className="flex flex-wrap items-center justify-center gap-2 text-[12.5px]">
            <button onClick={() => setPegando(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-dark-300 ring-1 ring-dark-700 hover:text-dark-100">
              <ClipboardPaste size={14} /> Pegar desde Excel
            </button>
            <button onClick={() => descargarPlantilla('plantilla-furgonetas.csv',
              ['Matrícula', 'Centro', 'Marca', 'Modelo', 'Kilómetros', 'Bastidor', 'Próxima ITV', 'Renting'],
              ['1234 ABC', center && center !== 'Todos' ? center : 'OGA5', 'Toyota', 'Proace', '25300', 'VF1ABCDEFGH123456', '15/03/2027', 'Arval'])}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-dark-300 ring-1 ring-dark-700 hover:text-dark-100">
              <Download size={14} /> Descargar plantilla
            </button>
          </div>
        </>
      )}

      {pegando && !vista && (
        <div className="space-y-2">
          <textarea value={pegado} onChange={(e) => setPegado(e.target.value)} rows={8} autoFocus
            placeholder={'Copia las filas en Excel (con la cabecera) y pégalas aquí.\nMatrícula\tCentro\tMarca\n1234 ABC\tOGA5\tToyota'}
            className="w-full rounded-lg border border-dark-700 bg-dark-950 p-3 font-mono text-[12.5px] text-dark-100 outline-none focus:border-brand-500/50" />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setPegando(false); setPegado('') }} className="px-3 py-1.5 text-[13px] text-dark-400 hover:text-dark-200">Cancelar</button>
            <button onClick={() => leer(textoAFichero(pegado, 'pegado-desde-excel.csv'))}
              disabled={!pegado.trim() || busy === 'leyendo'}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
              {busy === 'leyendo' ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />} Revisar
            </button>
          </div>
        </div>
      )}

      {hecho && (
        <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-5">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-200"><Check size={17} /> {hecho.message}</p>
          <Link to="/panel/vehiculos" className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-300 hover:text-emerald-200">
            Ver mis furgonetas <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {vista?.falta_matricula && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-amber-200">
            <Columns3 size={15} /> ¿Qué columna es la matrícula?
          </p>
          <MapeoColumnas cabeceras={vista.cabeceras} campos={vista.campos}
            onCambio={cambiarColumna} ocupado={busy === 'leyendo'} />
        </div>
      )}

      {vista && !vista.falta_matricula && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[[vista.matriculas, 'matrículas'], [vista.centros.length, vista.centros.length === 1 ? 'centro' : 'centros'],
              [vista.repetidas + vista.sin_matricula, 'filas descartadas']].map(([n, l]) => (
              <div key={l} className="rounded-lg bg-white/[0.03] py-2.5">
                <div className="text-[20px] font-semibold tabular-nums text-dark-50">{n}</div>
                <div className="text-[11px] text-dark-500">{l}</div>
              </div>
            ))}
          </div>

          <EleccionCentros grupos={vista.centros} empresa={empresa} sel={sel} setSel={setSel}
            onEmpresa={setEmpresa} onError={setErr} />

          <div>
            <button onClick={() => setVerColumnas((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[12px] text-dark-500 hover:text-dark-300">
              <Columns3 size={13} />
              {vista.columnas.length} columnas usadas{vista.ignoradas?.length ? ` · ${vista.ignoradas.length} sin usar` : ''} · {verColumnas ? 'ocultar' : 'revisar'}
            </button>
            {verColumnas && (
              <div className="mt-2">
                <MapeoColumnas cabeceras={vista.cabeceras} campos={vista.campos}
                  onCambio={cambiarColumna} ocupado={busy === 'leyendo'} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dark-800 pt-4">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-dark-200">
              <input type="checkbox" checked={crear} onChange={(e) => setCrear(e.target.checked)}
                className="h-4 w-4 accent-brand-500" />
              {resumen.nuevas === 1 ? 'Dar de alta la nueva' : `Dar de alta las ${resumen.nuevas} nuevas`}
            </label>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-dark-500">
                {resumen.existentes} ya las tienes{resumen.fuera > 0 && ` · ${resumen.fuera} fuera`}
              </span>
              <button onClick={importar} disabled={!puede || !!busy}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
                {busy === 'importando' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Importar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Atajo({ titulo, detalle, to, cta, naves }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dark-800 p-5">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-dark-100">{titulo}</p>
          <p className="mt-0.5 text-[12.5px] text-dark-500">{detalle}</p>
        </div>
        <Link to={to} className="btn-primary inline-flex shrink-0 items-center gap-2">
          {cta} <ArrowRight size={14} />
        </Link>
      </div>
      {naves?.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {naves.map((n) => (
            <li key={n.centro} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-[13px]">
              <span className="font-mono font-semibold text-dark-200">{n.centro}</span>
              {n.hecho
                ? <span className="inline-flex items-center gap-1 text-emerald-300"><Check size={13} /> listo</span>
                : <span className="inline-flex items-center gap-1 text-dark-500"><CircleDashed size={13} /> pendiente</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Importaciones() {
  const { center } = useOutletContext()
  const { t } = useT()
  const [params, setParams] = useSearchParams()
  const tab = PESTANAS.some((p) => p.id === params.get('t')) ? params.get('t') : 'furgonetas'
  const [estado, setEstado] = useState(null)

  const cargarEstado = () => getOnboarding().then((r) => setEstado(r.data)).catch(() => {})
  useEffect(() => { cargarEstado() }, [])

  const hecho = (p) => {
    if (!estado) return false
    if (p.paso) return !!estado.pasos?.find((x) => x.id === p.paso)?.hecho
    const naves = estado.naves || []
    return naves.length > 0 && naves.every((n) => n.pasos?.find((x) => x.id === p.nave)?.hecho)
  }
  const navesDe = (id) => (estado?.naves || []).map((n) => ({
    centro: n.centro, hecho: !!n.pasos?.find((x) => x.id === id)?.hecho,
  }))

  return (
    <div className="mx-auto max-w-4xl">
      <header className="rise mb-5">
        <h1 className="font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">{t('imp.title')}</h1>
        <p className="mt-2 text-[13.5px] text-dark-400">Trae lo que ya tienes. Nada se guarda sin revisarlo antes.</p>
      </header>

      <nav role="tablist" aria-label="Qué integrar" className="mb-4 flex gap-1 overflow-x-auto border-b border-dark-800">
        {PESTANAS.map((p) => {
          const Icono = p.icono
          const activa = tab === p.id
          return (
            <button key={p.id} role="tab" aria-selected={activa}
              onClick={() => setParams({ t: p.id }, { replace: true })}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition ${
                activa ? 'border-brand-400 text-dark-50' : 'border-transparent text-dark-500 hover:text-dark-200'}`}>
              <Icono size={15} />
              {p.label}
              {hecho(p) && <Check size={13} className="text-emerald-400" aria-label="hecho" />}
            </button>
          )
        })}
      </nav>

      <section role="tabpanel" className="card p-5">
        {tab === 'furgonetas' && <ImportarFlota center={center} alTerminar={cargarEstado} />}
        {tab === 'conductores' && <ImportarConductores center={center} alTerminar={cargarEstado} />}
        {tab === 'turnos' && (
          <Atajo titulo="Cuadrante mensual" detalle="El Excel de Amazon (hoja MENSUAL), un centro y un mes cada vez."
            to="/panel/turnos" cta="Subir en Turnos" naves={navesDe('turnos')} />
        )}
        {tab === 'cortex' && (
          <Atajo titulo="Paquetes y rutas en vivo" detalle="La extensión de Chrome lee Cortex y trae cada nave sola."
            to="/panel/paquetes" cta="Instalar la extensión" naves={navesDe('cortex')} />
        )}
        {tab === 'scorecard' && (
          <Atajo titulo="Scorecard de Amazon" detalle="Sube un PDF oficial por nave y los objetivos pasan a ser los tuyos."
            to="/panel/scorecard" cta="Subir scorecard" naves={navesDe('objetivos')} />
        )}
      </section>
    </div>
  )
}
