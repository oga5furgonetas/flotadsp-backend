import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Check, AlertTriangle, RotateCcw, ArrowRight } from 'lucide-react'
import { previsualizarConductores, importarConductores } from '../api'
import EleccionCentros, { seleccionInicial, resumenSeleccion, eleccionParaEnviar } from './EleccionCentros'
import SubirFichero from './SubirFichero'
import Pasos from './Pasos'

/* IMPORTAR LA PLANTILLA.
   Se lee el Excel que ya tienen, con sus columnas; lo único imprescindible es
   el nombre. Se enseña antes de guardar, y si trae varias naves se elige
   cuáles entran. Importar da de alta lo que falta: nunca pisa una ficha. */

export default function ImportarConductores({ center, alTerminar }) {
  const [prev, setPrev] = useState(null)
  const [fichero, setFichero] = useState(null)
  const [empresa, setEmpresa] = useState([])
  const [sel, setSel] = useState({})
  const [estado, setEstado] = useState('')
  const [err, setErr] = useState('')
  const [hecho, setHecho] = useState(null)

  const reiniciar = () => { setPrev(null); setFichero(null); setSel({}); setErr(''); setHecho(null) }

  const elegir = async (f) => {
    setFichero(f); setPrev(null); setHecho(null); setErr(''); setEstado('leyendo')
    try {
      const fd = new FormData()
      fd.append('file', f)
      if (center && center !== 'Todos') fd.append('center', center)
      const { data } = await previsualizarConductores(fd)
      const emp = data.centros_empresa || []
      setEmpresa(emp)
      setSel(seleccionInicial(data.centros || [], emp, center))
      setPrev(data)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo leer el fichero.')
      setFichero(null)
    } finally { setEstado('') }
  }

  const resumen = useMemo(() => (prev ? resumenSeleccion(prev.centros || [], sel) : null), [prev, sel])

  const confirmar = async () => {
    setEstado('importando'); setErr('')
    try {
      const fd = new FormData()
      fd.append('file', fichero)
      if (center && center !== 'Todos') fd.append('center', center)
      const el = eleccionParaEnviar(prev.centros || [], sel)
      fd.append('centros', JSON.stringify(el.centros))
      fd.append('mapa', JSON.stringify(el.mapa))
      const { data } = await importarConductores(fd)
      setHecho(data); setPrev(null); setFichero(null)
      alTerminar?.()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo importar.')
    } finally { setEstado('') }
  }

  const muestra = (prev?.muestra || []).filter((p) => sel[(p.centro_texto || '').toUpperCase()]?.on).slice(0, 6)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pasos actual={hecho ? 2 : prev ? 1 : 0} />
        {(prev || hecho) && (
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

      {!prev && !hecho && (
        <SubirFichero onFile={elegir} ocupado={estado === 'leyendo'}
          titulo="Arrastra el Excel de tu plantilla"
          pie="basta con una columna de nombre" />
      )}

      {hecho && (
        <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-5">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-200">
            <Check size={17} /> {hecho.importados} {hecho.importados === 1 ? 'conductor dado de alta' : 'conductores dados de alta'}
          </p>
          {(hecho.ya_estaban > 0 || hecho.fuera_seleccion > 0) && (
            <p className="mt-1 text-[12.5px] text-emerald-300/80">
              {hecho.ya_estaban > 0 && `${hecho.ya_estaban} ya estaban`}
              {hecho.ya_estaban > 0 && hecho.fuera_seleccion > 0 && ' · '}
              {hecho.fuera_seleccion > 0 && `${hecho.fuera_seleccion} de otros centros sin tocar`}
            </p>
          )}
          <Link to="/panel/conductores" className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-300 hover:text-emerald-200">
            Ver conductores <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {prev && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[[prev.total_leidas, 'personas'], [(prev.centros || []).length, (prev.centros || []).length === 1 ? 'centro' : 'centros'],
              [prev.sin_correo, 'sin correo']].map(([n, l]) => (
              <div key={l} className="rounded-lg bg-white/[0.03] py-2.5">
                <div className="text-[20px] font-semibold tabular-nums text-dark-50">{n}</div>
                <div className="text-[11px] text-dark-500">{l}</div>
              </div>
            ))}
          </div>

          <EleccionCentros grupos={prev.centros || []} empresa={empresa} sel={sel} setSel={setSel}
            onEmpresa={setEmpresa} onError={setErr} nombreExistentes="Ya estaban" />

          {muestra.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-dark-800">
              <table className="w-full text-[12.5px]">
                <thead className="bg-dark-900/60 text-[10.5px] uppercase tracking-wide text-dark-500">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-semibold">Nombre</th>
                    <th className="px-3 py-1.5 text-left font-semibold">Teléfono</th>
                    <th className="px-3 py-1.5 text-left font-semibold">Correo</th>
                    <th className="px-3 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800/60">
                  {muestra.map((p) => (
                    <tr key={`${p.fila}-${p.name}`}>
                      <td className="px-3 py-1.5 text-dark-200">{p.name}</td>
                      <td className="px-3 py-1.5 tabular-nums text-dark-400">{p.phone || '—'}</td>
                      <td className="px-3 py-1.5 text-dark-400">{p.email || '—'}</td>
                      <td className="px-3 py-1.5 text-right text-[11px] text-dark-500">{p.ya_existe ? 'ya estaba' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(prev.n_saltadas > 0 || prev.sin_correo > 0) && (
            <details className="text-[12px] text-dark-500">
              <summary className="cursor-pointer select-none hover:text-dark-300">
                {[prev.n_saltadas > 0 && `${prev.n_saltadas} filas no se importan`,
                  prev.sin_correo > 0 && `${prev.sin_correo} sin correo (no podrán entrar al portal)`]
                  .filter(Boolean).join(' · ')}
              </summary>
              <ul className="mt-1.5 space-y-0.5">
                {(prev.saltadas || []).slice(0, 8).map((s) => <li key={s.fila}>Fila {s.fila}: {s.motivo}</li>)}
              </ul>
            </details>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dark-800 pt-4">
            <span className="text-[12px] text-dark-500">
              {resumen.existentes} ya estaban{resumen.fuera > 0 && ` · ${resumen.fuera} fuera`}
            </span>
            <button onClick={confirmar}
              disabled={estado === 'importando' || resumen.sinDestino > 0 || !resumen.nuevas}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
              {estado === 'importando' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Dar de alta {resumen.nuevas}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
