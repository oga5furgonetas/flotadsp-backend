import { useState } from 'react'
import { Plus } from 'lucide-react'
import { addOrgCenter } from '../api'

/* QUÉ CENTROS DEL FICHERO SON TUYOS, Y A DÓNDE VA CADA UNO.
   La pieza común de todas las importaciones. Un fichero casi nunca es de una
   sola nave: el de Amazon trae la región entera y el de la gestoría todas las
   naves de la empresa, con el centro escrito como «AMZL OGA5 SANTIAGO XPT».
   Aquí se ve cada grupo con lo que trae, se marca si entra y se elige a cuál
   de tus centros va. Si el fichero trae una nave que aún no está en la
   empresa, se añade desde aquí mismo. */

/* Qué se marca solo al abrir. Lo que ya se sabe que es tuyo, sí. Una nave que
   la empresa no tiene, no —el Excel de Amazon trae las de otras empresas—,
   salvo que el fichero entero sea un solo grupo: eso es alguien subiendo lo
   suyo. Con un centro elegido arriba, se respeta. */
export function seleccionInicial(grupos, empresa, center) {
  const unico = (grupos || []).length === 1
  const conCentro = center && center !== 'Todos' && empresa.includes(center) ? center : ''
  const sel = {}
  for (const g of grupos || []) {
    let destino = g.conocido ? g.sugerido : ''
    if (!destino && (unico || !g.clave)) destino = conCentro || (empresa.length === 1 ? empresa[0] : '')
    const on = !!destino && (g.conocido || unico || !g.clave) && (!conCentro || unico || destino === conCentro)
    sel[g.clave] = { on, destino }
  }
  return sel
}

export function resumenSeleccion(grupos, sel) {
  let nuevas = 0, existentes = 0, fuera = 0, sinDestino = 0
  for (const g of grupos || []) {
    const s = sel[g.clave] || {}
    if (!s.on) { fuera += g.filas; continue }
    if (!s.destino) sinDestino += 1
    nuevas += g.nuevas; existentes += g.ya_estan
  }
  return { nuevas, existentes, fuera, sinDestino }
}

// Lo que se manda al servidor: qué grupos entran y a qué centro va cada uno.
export function eleccionParaEnviar(grupos, sel) {
  const elegidos = (grupos || []).filter((g) => sel[g.clave]?.on)
  return {
    centros: elegidos.map((g) => g.clave),
    mapa: Object.fromEntries(elegidos.map((g) => [g.clave, sel[g.clave].destino])),
  }
}

export default function EleccionCentros({
  grupos, empresa, sel, setSel, onEmpresa, onError,
  nombreFilas = 'Nuevas', nombreExistentes = 'Ya las tienes',
}) {
  const [anadiendo, setAnadiendo] = useState('')
  const marcar = (clave, cambio) => setSel((x) => ({ ...x, [clave]: { ...x[clave], ...cambio } }))

  const anadir = async (g) => {
    setAnadiendo(g.clave); onError?.('')
    try {
      await addOrgCenter(g.sugerido)
      onEmpresa?.([...new Set([...(empresa || []), g.sugerido])].sort())
      marcar(g.clave, { destino: g.sugerido, on: true })
    } catch (ex) {
      onError?.(ex?.response?.data?.detail || 'No se ha podido añadir el centro.')
    } finally { setAnadiendo('') }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-dark-800">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead className="bg-dark-900/60 text-[10.5px] uppercase tracking-wide text-dark-500">
          <tr>
            <th className="w-8 px-3 py-2" />
            <th className="px-3 py-2 text-left font-semibold">En el fichero</th>
            <th className="px-3 py-2 text-left font-semibold">Va a</th>
            <th className="px-3 py-2 text-right font-semibold">{nombreFilas}</th>
            <th className="px-3 py-2 text-right font-semibold">{nombreExistentes}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dark-800">
          {(grupos || []).map((g) => {
            const s = sel[g.clave] || {}
            const nombre = g.clave ? g.texto : 'Sin centro en el fichero'
            const puedeAnadir = g.sugerido && !(empresa || []).includes(g.sugerido)
            return (
              <tr key={g.clave || '_sin'} className={s.on ? '' : 'opacity-60'}>
                <td className="px-3 py-2 align-top">
                  <input type="checkbox" checked={!!s.on} aria-label={`Importar ${nombre}`}
                    onChange={(e) => marcar(g.clave, { on: e.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-brand-500" />
                </td>
                <td className="px-3 py-2 align-top">
                  <div className={g.clave ? 'text-dark-100' : 'italic text-dark-400'}>{nombre}</div>
                  {g.ejemplos?.length > 0 && (
                    <div className="truncate text-[11px] text-dark-500" style={{ maxWidth: 260 }}>
                      {g.ejemplos.join(' · ')}{g.filas > g.ejemplos.length ? ' …' : ''}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select value={s.destino || ''} aria-label={`Centro de destino de ${nombre}`}
                      onChange={(e) => marcar(g.clave, { destino: e.target.value, on: s.on || !!e.target.value })}
                      className="rounded-md border border-dark-700 bg-dark-950 px-2 py-1 text-[12.5px] text-dark-100">
                      <option value="">— elige tu centro —</option>
                      {(empresa || []).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {puedeAnadir && (
                      <button onClick={() => anadir(g)} disabled={!!anadiendo}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-brand-300 ring-1 ring-brand-500/30 hover:bg-brand-500/10 disabled:opacity-50">
                        <Plus size={11} /> Añadir {g.sugerido} a mi empresa
                      </button>
                    )}
                  </div>
                  {s.on && !s.destino && (
                    <p className="mt-1 text-[11px] text-amber-300">Elige a qué centro van.</p>
                  )}
                </td>
                <td className="px-3 py-2 text-right align-top tabular-nums text-dark-200">{g.nuevas}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums text-dark-400">{g.ya_estan}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
