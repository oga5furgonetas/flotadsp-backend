/* Arranque de Google Ads (AW-18388111082).
 *
 * Va en un fichero propio y NO en un <script> dentro del index.html a
 * propósito: un script en línea obligaría a poner 'unsafe-inline' en el
 * script-src de la CSP, y eso abre la puerta a cualquier script inyectado en la
 * página. Desde un fichero servido por nosotros basta con 'self', que ya está
 * permitido, y la CSP se queda igual de cerrada.
 */
window.dataLayer = window.dataLayer || []
function gtag() { window.dataLayer.push(arguments) }
gtag('js', new Date())
gtag('config', 'AW-18388111082')
