import { useT, LANGS } from '../i18n'

function LangPicker() {
  const { lang, setLang } = useT()
  return (
    <select value={lang} onChange={(e) => setLang(e.target.value)}
      style={{ background: '#13161b', color: '#e7ebf2', border: '1px solid rgba(255,255,255,.12)', borderRadius: 9, padding: '7px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
      {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  )
}

const feats = [
  { ic: '📸', t: 'f1.t', d: 'f1.d' },
  { ic: '🔔', t: 'f2.t', d: 'f2.d' },
  { ic: '🏆', t: 'f3.t', d: 'f3.d' },
  { ic: '🔒', t: 'f4.t', d: 'f4.d' },
]

export default function Landing() {
  const { t } = useT()
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(1100px 560px at 72% -12%,rgba(14,165,233,.12),transparent),#0b0d10', color: '#eef1f6', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1040, margin: '0 auto', padding: '18px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#fb923c,#ea6800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⚡</div>
          <b style={{ fontSize: 17 }}>FlotaDSP</b>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <LangPicker />
          <a href="/planes" style={link}>{t('nav.plans')}</a>
          <a href="/login" style={link}>{t('nav.login')}</a>
          <a href="/registro" style={btnPrimary}>{t('nav.try')}</a>
        </div>
      </nav>

      <header style={{ maxWidth: 860, margin: '0 auto', padding: '54px 18px 30px', textAlign: 'center' }}>
        <span style={pill}>🚀 {t('hero.badge')}</span>
        <h1 style={{ fontSize: 'clamp(30px,5vw,46px)', lineHeight: 1.08, margin: '0 0 16px', fontWeight: 850, letterSpacing: '-.02em' }}>
          {t('hero.title1')} <span style={{ background: 'linear-gradient(120deg,#38bdf8,#0ea5e9)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{t('hero.title2')}</span>.
        </h1>
        <p style={{ fontSize: 17, color: '#8b94a3', maxWidth: 600, margin: '0 auto 28px', lineHeight: 1.55 }}>{t('hero.sub')}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/registro" style={{ ...btnPrimary, padding: '13px 22px', fontSize: 15 }}>{t('hero.ctaTry')}</a>
          <a href="/planes" style={{ ...btnGhost, padding: '13px 22px', fontSize: 15 }}>{t('hero.ctaPlans')}</a>
        </div>
        <div style={{ color: '#8b94a3', fontSize: 12.5, marginTop: 14 }}>{t('hero.mini')}</div>
      </header>

      <section style={{ maxWidth: 1000, margin: '30px auto 0', padding: '0 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
        {feats.map((f, i) => (
          <div key={i} style={{ background: '#13161b', border: '1px solid rgba(255,255,255,.07)', borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{f.ic}</div>
            <h3 style={{ margin: '0 0 5px', fontSize: 15.5 }}>{t(f.t)}</h3>
            <p style={{ margin: 0, color: '#8b94a3', fontSize: 13, lineHeight: 1.5 }}>{t(f.d)}</p>
          </div>
        ))}
      </section>

      <footer style={{ textAlign: 'center', color: '#8b94a3', fontSize: 13, padding: '40px 18px 50px' }}>
        {t('foot.have')} <a href="/login" style={{ color: '#0ea5e9', textDecoration: 'none' }}>{t('foot.login')}</a>
      </footer>
    </div>
  )
}

const link = { color: '#8b94a3', textDecoration: 'none', fontSize: 14, fontWeight: 600 }
const btnPrimary = { color: '#fff', background: 'linear-gradient(135deg,#0ea5e9,#0369a1)', padding: '8px 14px', borderRadius: 9, textDecoration: 'none', fontWeight: 800, fontSize: 14 }
const btnGhost = { color: '#eef1f6', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', padding: '8px 14px', borderRadius: 12, textDecoration: 'none', fontWeight: 800 }
const pill = { display: 'inline-block', background: 'rgba(251,191,36,.12)', border: '1px solid rgba(251,191,36,.35)', color: '#fbbf24', padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 700, marginBottom: 20 }
