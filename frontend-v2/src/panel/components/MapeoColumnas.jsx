/* A qué dato va cada columna del fichero. Se rellena sola; aquí se corrige
   lo que no se haya reconocido. */
export default function MapeoColumnas({ cabeceras, campos, onCambio, ocupado }) {
  const usados = new Set((cabeceras || []).map((c) => c.campo).filter(Boolean))
  return (
    <div className="overflow-x-auto rounded-lg border border-dark-800">
      <table className="w-full min-w-[480px] text-[12.5px]">
        <thead className="bg-dark-900/60 text-[10.5px] uppercase tracking-wide text-dark-500">
          <tr>
            <th className="px-3 py-1.5 text-left font-semibold">Columna del fichero</th>
            <th className="px-3 py-1.5 text-left font-semibold">Ejemplo</th>
            <th className="px-3 py-1.5 text-left font-semibold">Es…</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dark-800/60">
          {(cabeceras || []).map((c) => (
            <tr key={c.indice}>
              <td className="px-3 py-1.5 text-dark-200">{c.nombre}</td>
              <td className="max-w-[180px] truncate px-3 py-1.5 text-dark-500">{c.ejemplo || '—'}</td>
              <td className="px-3 py-1.5">
                <select value={c.campo || ''} disabled={ocupado} aria-label={`Qué es la columna ${c.nombre}`}
                  onChange={(e) => onCambio(c.indice, e.target.value)}
                  className={`rounded-md border bg-dark-950 px-2 py-1 text-[12.5px] ${
                    c.campo ? 'border-dark-700 text-dark-100' : 'border-dark-800 text-dark-500'}`}>
                  <option value="">No usar</option>
                  {(campos || []).map((f) => (
                    <option key={f.id} value={f.id} disabled={usados.has(f.id) && f.id !== c.campo}>{f.nombre}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* Lo pegado desde Excel (tabuladores) o un CSV, convertido en un fichero para
   que pase por la MISMA vista previa que una subida. */
export function textoAFichero(texto, nombre = 'pegado.csv') {
  const limpio = String(texto || '').replace(/\r/g, '').trim()
  return new File([limpio], nombre, { type: 'text/csv' })
}

export function descargarPlantilla(nombre, cabeceras, ejemplo) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = '﻿' + [cabeceras.map(esc).join(';'), ejemplo.map(esc).join(';')].join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = nombre
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
