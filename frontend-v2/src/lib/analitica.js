import { API_BASE } from './apiBase'

/* Cuántas visitas hay y por dónde se va la gente. Anónimo a propósito: una
   clave de sesión que se inventa el navegador y muere al cerrar la pestaña, sin
   cookies, sin IP y sin identificar a nadie. Por eso no hace falta banner.

   La ruta viaja como PATRÓN (`/t/:token`, `/empleo/:slug/:oferta`): un token de
   tienda o el slug de una empresa en la URL identificarían a quien la abre, que
   es justo lo que este módulo no puede hacer. El backend lo vuelve a limpiar.

   Y no puede romper nada: si falla la red, si el navegador no tiene
   `sessionStorage` (Safari privado) o si el backend contesta mal, se calla. */

const CLAVE = 'fd_an_sid'
const LETRAS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

let memoria = null

function sid() {
  if (memoria) return memoria
  try {
    const guardado = sessionStorage.getItem(CLAVE)
    if (guardado) { memoria = guardado; return memoria }
  } catch (_) { /* sin almacén: la sesión dura lo que dure esta pestaña */ }
  let v = ''
  const bytes = new Uint8Array(16)
  try { crypto.getRandomValues(bytes) } catch (_) { for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256) }
  for (const b of bytes) v += LETRAS[b % LETRAS.length]
  memoria = v
  try { sessionStorage.setItem(CLAVE, v) } catch (_) { /* da igual: vale la de memoria */ }
  return v
}

function dispositivo() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 0
  if (w && w < 768) return 'movil'
  if (w && w < 1200) return 'tablet'
  return 'escritorio'
}

/* Un tramo es un nombre de pantalla o un identificador. Lo segundo NO viaja. */
const NOMBRE = /^[a-z][a-z-]{0,29}$/

const PATRONES = [
  [/^\/t\/[^/]+$/, '/t/:token'],
  [/^\/taller\/t\/[^/]+$/, '/taller/t/:token'],
  [/^\/taller\/[^/]+$/, '/taller/:token'],
  [/^\/apoyo\/t\/[^/]+$/, '/apoyo/t/:token'],
  [/^\/dnr\/[^/]+$/, '/dnr/:token'],
  [/^\/empleo\/[^/]+\/[^/]+$/, '/empleo/:slug/:oferta'],
  [/^\/empleo\/[^/]+$/, '/empleo/:slug'],
  [/^\/verify\/[^/]+$/, '/verify/:token'],
  [/^\/reset-password\/[^/]+$/, '/reset-password/:token'],
]

export function patronDe(ruta) {
  const limpia = String(ruta || '/').split('?')[0].split('#')[0]
  for (const [re, patron] of PATRONES) if (re.test(limpia)) return patron
  const segs = limpia.split('/').filter(Boolean)
  if (!segs.length) return '/'
  return '/' + segs.slice(0, 4).map((s) => (NOMBRE.test(s) ? s : ':x')).join('/')
}

/* El token, si lo hay, para que el SERVIDOR sepa si es un cliente, la demo, un
   conductor o el equipo de casa. El navegador no decide eso: lo dice el token
   firmado. Sin token es una visita anónima y punto. */
function token() {
  try {
    const t = localStorage.getItem('flotadsp_token')
    if (t) return t
    const d = JSON.parse(localStorage.getItem('flotadsp_driver') || 'null')
    if (d && d.access_token) return d.access_token
  } catch (_) { /* almacén bloqueado: se manda sin token */ }
  return null
}

function origen() {
  const fuera = {}
  try {
    const p = new URLSearchParams(window.location.search)
    const utm = p.get('utm_source')
    if (utm) fuera.utm = utm.toLowerCase().slice(0, 60)
    const ref = document.referrer
    if (ref) {
      const h = new URL(ref).hostname
      if (h && h !== window.location.hostname) fuera.ref = h.toLowerCase()
    }
  } catch (_) { /* sin referrer no pasa nada */ }
  return fuera
}

function mandar(cuerpo) {
  try {
    const t = token()
    fetch(API_BASE + '/analitica/evento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
      body: JSON.stringify({ sid: sid(), disp: dispositivo(), ...origen(), ...cuerpo }),
      keepalive: true,
    }).catch(() => {})
  } catch (_) { /* medir nunca puede tumbar una pantalla */ }
}

let ultima = null

export function medirVista(ruta) {
  const r = patronDe(ruta)
  // Recargar o cambiar solo la query no es una pantalla nueva.
  if (r === ultima) return
  ultima = r
  mandar({ tipo: 'vista', ruta: r })
}

export function medirAccion(nombre) {
  mandar({ tipo: 'accion', nombre, ruta: patronDe(window.location.pathname) })
}
