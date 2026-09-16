/* ¿ESTOY CORRIENDO LA ÚLTIMA VERSIÓN DE LA APP?
 * ═══════════════════════════════════════════════════════════════════════════
 * El 16-09-2026 Dani dijo «Eddy no me aparece para enviarle la formación».
 * Eddy estaba bien en los datos; su pestaña llevaba horas abierta con una
 * compilación anterior. La app no fallaba: simplemente enseñaba lo de antes.
 *
 * Eso es peor que un error. Un error se ve; esto no, y lleva a desconfiar de
 * los datos cuando el problema es la pestaña.
 *
 * `build.json` lo escribe el despliegue con el nombre del bundle recién subido
 * (ver `scripts/sellar-build.mjs`). Aquí se compara con el que está corriendo.
 * Si no coinciden, hay versión nueva.
 */

/** El bundle que tiene cargado ESTA pestaña, sacado del propio `<script>`. */
function bundleActual() {
  try {
    const s = [...document.querySelectorAll('script[type="module"][src]')]
      .map((x) => x.getAttribute('src'))
      .find((x) => /\/index-[^/]+\.js$/.test(x || ''))
    return s ? s.split('/').pop() : ''
  } catch (_) { return '' }
}

/**
 * Llama a `alHaberNueva()` cuando se publica una compilación distinta.
 * Mira cada `cadaMs` y también al volver a la pestaña — que es cuando de
 * verdad importa: alguien vuelve del café y sigue con lo de hace dos horas.
 */
export function vigilarVersion(alHaberNueva, cadaMs = 5 * 60 * 1000) {
  const mio = bundleActual()
  if (!mio) return () => {}          // sin saber el mío no se puede comparar
  const estado = { parado: false }

  const mirar = async () => {
    if (estado.parado || document.hidden) return
    try {
      const r = await fetch('/build.json', { cache: 'no-store' })
      if (!r.ok) return
      const j = await r.json()
      // Falso positivo: `parado` solo pasa de false a true, nunca vuelve atras.
      // eslint-disable-next-line require-atomic-updates
      if (j?.bundle && j.bundle !== mio) { estado.parado = true; alHaberNueva(j) }
    } catch (_) { /* sin red: se vuelve a mirar en la siguiente vuelta */ }
  }

  const t = setInterval(mirar, cadaMs)
  const alVolver = () => { if (!document.hidden) mirar() }
  document.addEventListener('visibilitychange', alVolver)
  window.addEventListener('focus', alVolver)
  // La primera, a los diez segundos: al arrancar acaba de bajar el bundle.
  const t0 = setTimeout(mirar, 10000)
  return () => {
    estado.parado = true
    clearInterval(t); clearTimeout(t0)
    document.removeEventListener('visibilitychange', alVolver)
    window.removeEventListener('focus', alVolver)
  }
}
