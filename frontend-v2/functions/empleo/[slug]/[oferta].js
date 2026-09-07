/* La página de una oferta, servida CON sus datos dentro del HTML.
 *
 * POR QUÉ HACE FALTA ESTO. La app es una SPA: `index.html` es el mismo fichero
 * para todas las rutas y el contenido lo pinta React después. Google a veces
 * ejecuta el JavaScript y a veces no, y con Google for Jobs no verlo es no
 * existir. Así que esta función de Cloudflare intercepta la petición, le pide
 * los datos al backend y los INYECTA en el <head> antes de servir la página.
 * El robot recibe el título, la descripción y el bloque JobPosting ya escritos.
 *
 * La persona no nota nada: recibe el mismo index.html de siempre, con unas
 * etiquetas de más en la cabecera, y React monta igual.
 *
 * Si la oferta ya no está activa se sirve la página con `noindex`, para que
 * Google la SAQUE de los resultados. Una oferta cerrada que sigue apareciendo
 * son llamadas de gente a un puesto que no existe.
 */

const API = 'https://flotadsp-backend.fly.dev/api'

/* En un atributo HTML no basta con escapar las comillas: un `<` abre etiqueta.
   La descripción la escribe un admin, pero acaba dentro del HTML de una página
   pública, así que se trata como texto ajeno. */
const attr = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

/* Dentro de un <script>, la secuencia `</script` cierra el bloque aunque vaya
   dentro de una cadena JSON. Se escapa el `<`, que es lo que JSON-LD admite. */
const jsonSeguro = (o) => JSON.stringify(o).replace(/</g, '\\u003c')

export async function onRequestGet(context) {
  const { params, env, request } = context
  const url = new URL(request.url)

  const respuesta = await env.ASSETS.fetch(new URL('/index.html', url))
  let html = await respuesta.text()

  let cabeza = ''
  try {
    const r = await fetch(
      `${API}/empleo/seo/${encodeURIComponent(params.slug)}/${encodeURIComponent(params.oferta)}`,
      { headers: { accept: 'application/json' } },
    )
    if (r.ok) {
      const d = await r.json()
      cabeza = [
        `<title>${attr(d.titulo)}</title>`,
        `<meta name="description" content="${attr(d.descripcion)}" />`,
        `<link rel="canonical" href="${attr(d.url)}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:title" content="${attr(d.titulo)}" />`,
        `<meta property="og:description" content="${attr(d.descripcion)}" />`,
        `<meta property="og:url" content="${attr(d.url)}" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<script type="application/ld+json">${jsonSeguro(d.jsonld)}</script>`,
      ].join('\n    ')
    } else if (r.status === 404) {
      cabeza = '<meta name="robots" content="noindex,follow" />'
    }
  } catch {
    /* Si el backend no contesta se sirve la página tal cual: mejor sin
       etiquetas que sin página. La app sigue funcionando igual. */
  }

  if (cabeza) {
    /* Se quitan las etiquetas GENÉRICAS del index antes de meter las nuestras.
       No es limpieza: el `<link rel="canonical" href="https://flotadsp.com/">`
       de la plantilla le dice a Google que esta página es en realidad la
       portada, así que la oferta NO se indexaría — el canonical manda sobre
       todo lo demás. Y con dos `description` distintas elige Google, que
       normalmente elige la que no toca.
       Comprobado en producción: la primera versión de esta función dejaba las
       dos, y el canonical apuntaba a la home. */
    if (cabeza.includes('<title>')) html = html.replace(/<title>[\s\S]*?<\/title>/i, '')
    if (cabeza.includes('name="description"')) {
      html = html.replace(/<meta\s+name="description"[^>]*>/i, '')
    }
    if (cabeza.includes('rel="canonical"')) {
      html = html.replace(/<link\s+rel="canonical"[^>]*>/i, '')
    }
    // Las og: de la plantilla también hablan de la portada.
    if (cabeza.includes('property="og:title"')) {
      html = html.replace(/<meta\s+property="og:(title|description|url)"[^>]*>/gi, '')
    }
    html = html.replace('</head>', `    ${cabeza}\n  </head>`)
  }

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Corto: una oferta se edita y se cierra, y no puede quedarse cacheada
      // media hora en el borde diciendo que sigue abierta.
      'cache-control': 'public, max-age=0, s-maxage=120',
    },
  })
}
