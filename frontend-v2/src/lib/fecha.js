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

// Hora y fecha-hora LOCALES de un instante ISO del servidor. Cortar el texto
// (`iso.slice(11, 16)`) enseña la hora de UTC: en España, dos horas menos en
// verano. Pasó en Actividad, Mi día, el checklist, las peticiones de días y
// seis sitios más (17-09-2026). Sin zona en el texto, el navegador lo toma
// como local y el resultado es el mismo que cortar.
function aFecha(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

const dos = (n) => String(n).padStart(2, '0')

// Compuestas a mano: `toLocale*String` con '2-digit' no rellena igual en
// todos los motores (Node daba «15/9»).
export function horaLocal(iso) {
  const d = aFecha(iso)
  return d ? `${dos(d.getHours())}:${dos(d.getMinutes())}` : ''
}

export function diaMesLocal(iso) {
  const d = aFecha(iso)
  return d ? `${dos(d.getDate())}/${dos(d.getMonth() + 1)}` : ''
}

export function fechaHoraLocal(iso) {
  const d = aFecha(iso)
  return d ? `${diaMesLocal(iso)}/${d.getFullYear()} ${horaLocal(iso)}` : ''
}

// '2026-11-20' -> '20/11/2026'. Troceando el texto, sin pasar por Date:
// es una fecha de calendario, no un instante (gotcha 11).
export function fechaEs(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f || ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (f || '')
}
