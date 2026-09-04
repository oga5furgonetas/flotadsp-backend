import { flechaOrden, claseOrden } from '../../lib/orden'

/* CABECERA QUE ORDENA. Una sola para todas las tablas del panel.
   ══════════════════════════════════════════════════════════════════════════
   La flecha se ve SIEMPRE, tenue en las columnas que no ordenan. Enseñarla
   solo al pasar el ratón por encima la deja invisible para quien va con el
   dedo en una tablet, que es donde se mira medio panel — y una función que no
   se ve no existe.

   `campo` es el nombre del campo de la fila, y tiene que ser el MISMO que pinta
   la celda: ordenar por un campo que no existe deja la tabla igual y no da
   ningún error, así que parece que el botón no hace nada. */
export default function ThOrden({ campo, orden, pulsar, className = '', title, children }) {
  const activa = orden?.campo === campo
  return (
    <th className={`${className} font-semibold`} aria-sort={activa ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        onClick={() => pulsar(campo)}
        title={title || 'Ordenar por esta columna'}
        className={`inline-flex items-center gap-1 hover:text-dark-200 ${activa ? 'text-dark-200' : ''}`}>
        {children}
        <span className={`text-[11px] leading-none ${claseOrden(orden, campo)}`}>{flechaOrden(orden, campo)}</span>
      </button>
    </th>
  )
}
