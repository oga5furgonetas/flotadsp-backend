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

// Cuántos días han pasado desde una fecha 'YYYY-MM-DD' hasta hoy.
// Se construyen las dos a MEDIODÍA a propósito: restando medianoches, el
// cambio de hora de octubre y marzo mete una hora de más o de menos y un día
// entero se convierte en 0,96 o en 1,04, que al truncar salta un día. A las
// 12:00 sobra media jornada de margen y eso no puede pasar.
export function diasAtras(iso) {
  if (!iso || typeof iso !== 'string') return 0
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!a || !m || !d) return 0
  const hoy = new Date()
  const then = new Date(a, m - 1, d, 12, 0, 0)
  const now = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12, 0, 0)
  return Math.round((now - then) / 86400000)
}
