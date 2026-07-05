import { useEffect } from 'react'
import { useT } from '../i18n'

// BUG-05: antes cualquier URL desconocida renderizaba la Landing (soft-404).
// Ahora muestra una página 404 real con CTA a la home. En una SPA sobre
// Cloudflare Pages el status HTTP sigue siendo 200 (fallback /index.html); para
// que no se indexe como contenido, marcamos noindex mientras se ve esta página.
export default function NotFound() {
  const { t } = useT()

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => { document.head.removeChild(meta) }
  }, [])

  return (
    <div style={wrap} data-testid="not-found-page">
      <div style={{ fontSize: 64, fontWeight: 950, letterSpacing: '-.04em', background: 'linear-gradient(120deg,#fb923c,#fbbf24)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>404</div>
      <h1 style={{ margin: '10px 0 8px', fontSize: 22, fontWeight: 800 }}>{t('nf.title')}</h1>
      <p style={{ margin: '0 0 26px', color: '#8b94a3', fontSize: 15, maxWidth: 420, lineHeight: 1.6 }}>{t('nf.sub')}</p>
      <a href="/" data-testid="not-found-home" style={cta}>{t('nf.cta')}</a>
    </div>
  )
}

const wrap = { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, background: 'radial-gradient(1000px 520px at 70% -12%,rgba(249,115,22,.10),transparent),#080a0e', color: '#eef1f6', fontFamily: 'Inter Variable,Inter,system-ui,sans-serif' }
const cta = { background: 'linear-gradient(135deg,#fb923c,#ea6800)', color: '#fff', textDecoration: 'none', padding: '13px 26px', borderRadius: 12, fontSize: 15, fontWeight: 800 }
