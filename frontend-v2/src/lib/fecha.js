// Día de negocio en hora LOCAL. `toISOString()` devuelve la fecha en UTC:
// en España, entre las 00:00 y las 02:00 el día UTC todavía es el ANTERIOR,
// así que plantilla, checklist, aparcamiento y "hoy" amanecían en el día
// equivocado durante las primeras horas de la madrugada.
export function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function hoyLocal() {
  return isoLocal(new Date())
}
