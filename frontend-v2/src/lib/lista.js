// Garantiza una lista. `x || []` no vale: un objeto es "verdadero" y se cuela,
// y al primer .map() la pantalla se cae entera (pasó de verdad en Usuarios).
export const lista = (x) => (Array.isArray(x) ? x : [])
