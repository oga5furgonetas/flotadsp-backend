/* El sitemap, con las ofertas de empleo metidas EN CADA PETICIÓN.
 *
 * Es la parte que se retroalimenta sola: publicas una oferta y entra en el
 * sitemap; la desactivas y sale. Sin tocar un fichero, sin desplegar y sin que
 * nadie tenga que acordarse — que es exactamente como se quedan viejas las
 * listas escritas a mano.
 *
 * Las páginas fijas siguen viniendo del `sitemap.xml` estático de `public/`:
 * esas no cambian y no hay razón para generarlas.
 *
 * Si el backend no contesta se sirve el sitemap estático tal cual. Un sitemap
 * a medias es mucho peor que uno corto: Google se queda con lo que le des.
 */

const API = 'https://flotadsp-backend.fly.dev/api'

const xml = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function onRequestGet(context) {
  const { env, request } = context
  const url = new URL(request.url)

  const base = await env.ASSETS.fetch(new URL('/sitemap.xml', url))
  let texto = await base.text()

  try {
    const r = await fetch(`${API}/empleo/seo/sitemap`, { headers: { accept: 'application/json' } })
    if (r.ok) {
      const { ofertas } = await r.json()
      const filas = (ofertas || []).map((o) => {
        const lastmod = /^\d{4}-\d{2}-\d{2}$/.test(o.lastmod || '')
          ? `<lastmod>${o.lastmod}</lastmod>` : ''
        // Prioridad alta: son las páginas que queremos que Google recorra a
        // menudo, porque caducan.
        return `  <url><loc>${xml(o.url)}</loc>${lastmod}<changefreq>daily</changefreq><priority>0.9</priority></url>`
      }).join('\n')
      if (filas) texto = texto.replace('</urlset>', `${filas}\n</urlset>`)
    }
  } catch {
    /* se sirve el estático */
  }

  return new Response(texto, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=600',
    },
  })
}
