/* El fichero de verificación de Google Search Console, servido con 200 DIRECTO.
 *
 * POR QUÉ HACE FALTA UNA FUNCIÓN PARA UN FICHERO DE 53 BYTES: Cloudflare Pages
 * le quita la extensión a los `.html` y devuelve un **308** a la URL sin
 * `.html`. El contenido acaba llegando —lo comprobé—, pero Google pide que su
 * fichero de verificación NO redirija, y si decide no seguir el 308 la
 * propiedad se queda sin verificar sin decir por qué.
 *
 * Las funciones se resuelven ANTES que los assets estáticos, así que esta gana
 * a esa redirección automática. El nombre del fichero es la ruta: los puntos
 * incluidos.
 *
 * El contenido es EXACTAMENTE el que descargó Dani de Search Console, 53 bytes
 * y sin salto de línea final. No se genera ni se reconstruye: se escribe tal
 * cual, porque un byte de más aquí es una verificación que falla.
 */
export async function onRequestGet() {
  return new Response('google-site-verification: google51144a3efae4ec3d.html', {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
