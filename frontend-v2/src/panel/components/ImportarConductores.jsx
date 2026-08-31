import { useRef, useState } from 'react'
import { Loader2, Upload, Check, AlertTriangle, FileSpreadsheet } from 'lucide-react'
import { previsualizarConductores, importarConductores } from '../api'

/* IMPORTAR LA PLANTILLA DE GOLPE
   ═══════════════════════════════════════════════════════════════════════════
   Una empresa que empieza tiene su gente en un Excel. Darla de alta a mano
   —cincuenta fichas, una a una— es el motivo por el que la mayoría de las
   aplicaciones de flota se abandonan la primera semana.

   Dos decisiones que hacen que esto se use:
     · NO se pide una plantilla nuestra. Se lee el Excel que ya tienen, con las
       columnas que ya usan. Pedir un formato es trasladarles el trabajo.
     · Se ENSEÑA antes de guardar. Primero qué se ha entendido y cuántos
       entrarían; importar a ciegas y descubrir 50 fichas mal es peor que no
       importar. */

export default function ImportarConductores({ center, alTerminar }) {
  const [prev, setPrev] = useState(null)
  const [fichero, setFichero] = useState(null)
  const [estado, setEstado] = useState('')
  const [err, setErr] = useState('')
  const [hecho, setHecho] = useState(null)
  const ref = useRef()

  const elegir = async (f) => {
    if (!f) return
    setFichero(f); setPrev(null); setHecho(null); setErr(''); setEstado('leyendo')
    try {
      const fd = new FormData()
      fd.append('file', f)
      if (center && center !== 'Todos') fd.append('center', center)
      const r = await previsualizarConductores(fd)
      setPrev(r.data)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo leer el fichero.')
      setFichero(null)
    } finally { setEstado('') }
  }

  const confirmar = async () => {
    setEstado('importando'); setErr('')
    try {
      const fd = new FormData()
      fd.append('file', fichero)
      if (center && center !== 'Todos') fd.append('center', center)
      const r = await importarConductores(fd)
      setHecho(r.data); setPrev(null); setFichero(null)
      alTerminar?.()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo importar.')
    } finally { setEstado('') }
  }

  if (hecho) {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-lime-300">
          <Check size={16} /> {hecho.importados} conductores dados de alta
        </div>
        {hecho.ya_estaban > 0 && (
          <p className="mt-1.5 text-[12.5px] text-dark-400">
            {hecho.ya_estaban} ya estaban y no se han tocado: importar da de alta lo
            que falta, nunca pisa una ficha que ya existe.
          </p>
        )}
        <button onClick={() => setHecho(null)}
          className="mt-3 text-[12.5px] text-brand-300 hover:underline">Importar otro fichero</button>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center gap-2">
        <FileSpreadsheet size={16} className="text-brand-300" />
        <h3 className="text-[14px] font-semibold text-dark-100">Importar la plantilla desde Excel</h3>
      </div>
      <p className="mb-3 text-[12.5px] leading-relaxed text-dark-500">
        Sube tu Excel tal cual, con las columnas que ya uses. Lo único imprescindible
        es una columna con el nombre — puede llamarse <b>Nombre</b>, <b>Conductor</b>,
        <b>Nombre y apellidos</b> o <b>Driver name</b>. Si trae DNI, teléfono, correo,
        centro o ID de Amazon, también se aprovechan.
      </p>

      {err && (
        <p className="mb-3 flex items-start gap-1.5 text-[12.5px] text-red-300">
          <AlertTriangle size={14} className="mt-0.5 flex-none" /> {err}
        </p>
      )}

      {!prev && (
        <>
          <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => elegir(e.target.files?.[0])} />
          <button onClick={() => ref.current?.click()} disabled={estado === 'leyendo'}
            className="btn-primary flex items-center gap-2 px-3.5 py-2 text-[13px] disabled:opacity-50">
            {estado === 'leyendo'
              ? <><Loader2 size={14} className="animate-spin" /> Leyendo…</>
              : <><Upload size={14} /> Elegir el Excel</>}
          </button>
          <p className="mt-2 text-[11.5px] text-dark-600">Vale .xlsx, .xls y .csv</p>
        </>
      )}

      {/* Lo que se ha entendido, ANTES de guardar nada. */}
      {prev && (
        <div className="space-y-3">
          <div className="rounded-lg border border-dark-700 p-3">
            <p className="text-[13px] text-dark-200">
              He leído <span className="cifra font-semibold">{prev.total_leidas}</span> personas.
              {' '}<span className="cifra font-semibold text-lime-300">{prev.nuevas}</span> se darían de alta
              {prev.ya_estaban > 0 && <> y <span className="cifra">{prev.ya_estaban}</span> ya estaban</>}.
            </p>
            <p className="mt-1 text-[12px] text-dark-500">
              Columnas reconocidas: {Object.values(prev.columnas_reconocidas).join(', ') || '—'}
            </p>
            {prev.sin_correo > 0 && (
              <p className="mt-1 text-[12px] text-amber-300">
                {prev.sin_correo} sin correo. Se dan de alta igual, pero sin correo no
                podrán entrar al portal del conductor.
              </p>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-dark-400">
              Comprueba que se ha entendido bien:
            </p>
            <div className="overflow-x-auto rounded-lg border border-dark-800">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-dark-800 text-[10.5px] uppercase tracking-wider text-dark-500">
                    <th className="px-2.5 py-1.5 text-left">Nombre</th>
                    <th className="px-2.5 py-1.5 text-left">Teléfono</th>
                    <th className="px-2.5 py-1.5 text-left">Correo</th>
                    <th className="px-2.5 py-1.5 text-left"></th>
                  </tr>
                </thead>
                <tbody>
                  {prev.muestra.map((p) => (
                    <tr key={`${p.fila}-${p.name}`} className="border-b border-dark-800/50 last:border-0">
                      <td className="px-2.5 py-1.5 text-dark-200">{p.name}</td>
                      <td className="cifra px-2.5 py-1.5 text-dark-400">{p.phone || '—'}</td>
                      <td className="px-2.5 py-1.5 text-dark-400">{p.email || '—'}</td>
                      <td className="px-2.5 py-1.5 text-[11.5px] text-dark-600">
                        {p.ya_existe ? 'ya estaba' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lo que NO se va a importar, y por qué. Un número sin explicación
              asusta más que el propio problema. */}
          {prev.n_saltadas > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-2.5">
              <p className="text-[12.5px] text-amber-200">
                {prev.n_saltadas} filas no se van a importar:
              </p>
              <ul className="mt-1 space-y-0.5">
                {prev.saltadas.slice(0, 5).map((s) => (
                  <li key={s.fila} className="text-[12px] text-amber-200/80">
                    fila {s.fila} — {s.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={confirmar} disabled={estado === 'importando' || !prev.nuevas}
              className="btn-primary px-3.5 py-2 text-[13px] disabled:opacity-50">
              {estado === 'importando' ? 'Importando…' : `Dar de alta ${prev.nuevas}`}
            </button>
            <button onClick={() => { setPrev(null); setFichero(null) }}
              className="px-3 py-2 text-[13px] text-dark-400 hover:text-dark-200">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
