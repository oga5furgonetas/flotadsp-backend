import { useCallback, useMemo, useState } from 'react'

/* ORDENAR UNA TABLA PULSANDO LA CABECERA. Uno solo para todas las pantallas.
   ══════════════════════════════════════════════════════════════════════════
   Tres cosas que no son obvias y que, sin ellas, ordenar MIENTE:

   · LOS VACÍOS VAN SIEMPRE AL FINAL, en las dos direcciones. Con el orden
     normal, ordenar por POD de menor a mayor pone arriba a los que no tienen
     dato — que no es «los que menos POD tienen», es «de los que no sabemos
     nada». Un cero medido y un hueco no son lo mismo.

   · EL TEXTO SE COMPARA CON `localeCompare`, nunca con `<`. Las fichas están
     en MAYÚSCULAS, minúsculas y Mixtas: comparar por código de carácter deja
     todas las minúsculas detrás de todas las mayúsculas y la lista parece
     aleatoria (gotcha 23). Y así las tildes también caen donde deben.

   · TRES ESTADOS, no dos: mayor→menor, menor→mayor y SIN ORDEN. Sin el tercero
     no hay forma de volver al orden natural de la pantalla, que en varias
     tablas es el que trae el significado (los diarios llegan por importe).

   La primera pulsada ordena de MAYOR A MENOR, que es lo que se busca el 90 %
   de las veces: quién tiene más DNRs, más defectos, más euros. */

export function useOrden(campoInicial = null, dirInicial = 'desc') {
  const [orden, setOrden] = useState(
    campoInicial ? { campo: campoInicial, dir: dirInicial } : null)

  const pulsar = useCallback((campo) => {
    setOrden((o) => {
      if (o?.campo !== campo) return { campo, dir: 'desc' }
      if (o.dir === 'desc') return { campo, dir: 'asc' }
      return null              // tercera pulsada: se quita el orden
    })
  }, [])

  const ordenar = useCallback((filas) => {
    if (!orden || !Array.isArray(filas)) return filas
    const { campo, dir } = orden
    const signo = dir === 'asc' ? 1 : -1
    const vacio = (v) => v === null || v === undefined || v === ''
    return [...filas].sort((a, b) => {
      const x = a?.[campo]
      const y = b?.[campo]
      // Los huecos, siempre abajo: da igual la dirección.
      if (vacio(x) && vacio(y)) return 0
      if (vacio(x)) return 1
      if (vacio(y)) return -1
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * signo
      const nx = Number(x); const ny = Number(y)
      if (!Number.isNaN(nx) && !Number.isNaN(ny)) return (nx - ny) * signo
      return String(x).localeCompare(String(y), 'es', { sensitivity: 'base' }) * signo
    })
  }, [orden])

  return { orden, pulsar, ordenar }
}

/* La flecha de la cabecera. Se ve SIEMPRE en gris muy tenue en la columna que
   no ordena, para que se sepa que se puede pulsar: una cabecera que solo revela
   que es pulsable al pasar por encima no existe para quien va con el dedo. */
export function flechaOrden(orden, campo) {
  if (orden?.campo !== campo) return '↕'
  return orden.dir === 'desc' ? '↓' : '↑'
}

export function claseOrden(orden, campo) {
  return orden?.campo === campo ? 'text-brand-300' : 'text-dark-600/60'
}

/* Para las tablas que ya calculan sus filas con `useMemo`. */
export function useFilasOrdenadas(filas, ordenar) {
  return useMemo(() => ordenar(filas), [filas, ordenar])
}
