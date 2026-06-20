import { useT, LANGS } from '../i18n'

function LangPicker() {
  const { lang, setLang } = useT()
  return (
    <select value={lang} onChange={(e) => setLang(e.target.value)} style={sel}>
      {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  )
}

/* Mockup del panel (CSS, sin imágenes) para el hero */
function DashboardMock() {
  const k = (n, l, c) => (
    <div style={{ background: '#0e1116', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: '12px 14px', flex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 850, color: c }}>{n}</div>
      <div style={{ fontSize: 10.5, color: '#7b8494' }}>{l}</div>
    </div>
  )
  return (
    <div style={{ background: '#13161b', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, boxShadow: '0 40px 80px -30px rgba(0,0,0,.7)', overflow: 'hidden', maxWidth: 460, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <span style={dot('#ef4444')} /><span style={dot('#f59e0b')} /><span style={dot('#22c55e')} />
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>{k('89', 'Furgonetas', '#fff')}{k('95', 'Conductores', '#fff')}{k('4.6', '★ Score', '#38bdf8')}</div>
        <div style={{ background: '#0e1116', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: 14, height: 120, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          {[40, 60, 45, 80, 55, 90, 70].map((h, i) => <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 4, background: 'linear-gradient(180deg,#38bdf8,#0369a1)' }} />)}
        </div>
      </div>
    </div>
  )
}

/* Detección de daño sobre FOTO real de furgoneta */
function DamageMock({ label }) {
  return (
    <div style={{ position: 'relative', maxWidth: 460, margin: '0 auto', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 30px 70px -30px rgba(0,0,0,.7)' }}>
      <img src="/van.jpg" alt="" style={{ width: '100%', display: 'block' }} />
      {/* matrícula cubierta (privacidad) */}
      <div style={{ position: 'absolute', left: '36%', top: '80.5%', width: '28%', height: '5%', background: 'rgba(10,12,16,.9)', borderRadius: 3 }} />
      {/* recuadro de detección IA */}
      <div style={{ position: 'absolute', left: '20%', top: '67%', width: '26%', height: '11%', border: '3px solid #f59e0b', borderRadius: 6, boxShadow: '0 0 0 100vmax rgba(0,0,0,.04)' }} />
      <div style={{ position: 'absolute', left: '20%', top: '61%', background: '#f59e0b', color: '#1a1207', fontSize: 11.5, fontWeight: 800, padding: '3px 9px', borderRadius: 5 }}>⚠ {label} · 94%</div>
      <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(14,165,233,.9)', color: '#fff', fontSize: 10.5, fontWeight: 800, padding: '4px 10px', borderRadius: 99, letterSpacing: '.04em' }}>● IA</div>
    </div>
  )
}

/* Tarjeta de ahorro (ROI) */
function RoiCard({ ic, big, t, d }) {
  return (
    <div style={{ background: '#13161b', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: '20px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{ic}</span>
        <span style={{ fontSize: 18, fontWeight: 850, color: '#34d399' }}>{big}</span>
      </div>
      <h3 style={{ margin: '0 0 5px', fontSize: 15.5 }}>{t}</h3>
      <p style={{ margin: 0, color: '#8b94a3', fontSize: 13, lineHeight: 1.5 }}>{d}</p>
    </div>
  )
}

const feats = [
  { ic: '📸', t: 'f1.t', d: 'f1.d' },
  { ic: '🔔', t: 'f2.t', d: 'f2.d' },
  { ic: '🏆', t: 'f3.t', d: 'f3.d' },
  { ic: '🔒', t: 'f4.t', d: 'f4.d' },
]
const steps = [['1', 'how.1t', 'how.1d'], ['2', 'how.2t', 'how.2d'], ['3', 'how.3t', 'how.3d']]

export default function Landing() {
  const { t } = useT()
  return (
    <div style={{ background: '#0b0d10', color: '#eef1f6', fontFamily: 'Inter,system-ui,sans-serif', overflowX: 'hidden' }}>
      {/* NAV */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1080, margin: '0 auto', padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={logo}>⚡</div><b style={{ fontSize: 17 }}>FlotaDSP</b>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LangPicker />
          <a href="/planes" style={link}>{t('nav.plans')}</a>
          <a href="/login" style={link}>{t('nav.login')}</a>
          <a href="/registro" style={btnPrimary}>{t('nav.try')}</a>
        </div>
      </nav>

      {/* HERO */}
      <header style={{ position: 'relative', background: 'radial-gradient(900px 480px at 75% -8%,rgba(14,165,233,.16),transparent)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 20px 50px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 40, alignItems: 'center' }}>
          <div>
            <span style={pill}>🚀 {t('hero.badge')}</span>
            <h1 style={{ fontSize: 'clamp(30px,4.6vw,48px)', lineHeight: 1.07, margin: '0 0 16px', fontWeight: 850, letterSpacing: '-.025em' }}>
              {t('hero.title1')} <span style={grad}>{t('hero.title2')}</span>.
            </h1>
            <p style={{ fontSize: 16.5, color: '#8b94a3', maxWidth: 520, margin: '0 0 26px', lineHeight: 1.55 }}>{t('hero.sub')}</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a href="/registro" style={{ ...btnPrimary, padding: '13px 22px', fontSize: 15 }}>{t('hero.ctaTry')}</a>
              <a href="/planes" style={{ ...btnGhost, padding: '13px 22px', fontSize: 15 }}>{t('hero.ctaPlans')}</a>
            </div>
            <div style={{ color: '#7b8494', fontSize: 12.5, marginTop: 16 }}>{t('hero.mini')}</div>
          </div>
          <DashboardMock />
        </div>
      </header>

      {/* CUÁNTO TE AHORRAS (ROI) */}
      <section style={sec}>
        <h2 style={{ ...h2c, marginBottom: 6 }}>💸 {t('roi.t')}</h2>
        <p style={{ textAlign: 'center', color: '#8b94a3', margin: '0 0 28px', fontSize: 15 }}>{t('roi.sub')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 16 }}>
          <RoiCard ic="🛡️" big="300–1.500 €" t={t('roi.1t')} d={t('roi.1d')} />
          <RoiCard ic="🔔" big="0 €" t={t('roi.2t')} d={t('roi.2d')} />
          <RoiCard ic="🏆" big="−30%" t={t('roi.3t')} d={t('roi.3d')} />
          <RoiCard ic="⏱️" big="2h → 5min" t={t('roi.4t')} d={t('roi.4d')} />
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section style={sec}>
        <h2 style={h2c}>{t('how.t')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18 }}>
          {steps.map(([n, tt, dd]) => (
            <div key={n} style={{ textAlign: 'center', padding: '8px 12px' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, margin: '0 auto 12px', background: 'linear-gradient(135deg,#0ea5e9,#0369a1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 850, fontSize: 18 }}>{n}</div>
              <h3 style={{ margin: '0 0 5px', fontSize: 16 }}>{t(tt)}</h3>
              <p style={{ margin: 0, color: '#8b94a3', fontSize: 13.5, lineHeight: 1.5 }}>{t(dd)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SHOWCASE DETECCIÓN */}
      <section style={{ ...sec, background: '#0e1116', borderTop: '1px solid rgba(255,255,255,.05)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 36, alignItems: 'center' }}>
          <DamageMock label={t('show.label')} />
          <div>
            <span style={pillBlue}>{t('show.tag')}</span>
            <h2 style={{ fontSize: 26, margin: '0 0 10px', fontWeight: 800 }}>{t('show.t')}</h2>
            <p style={{ color: '#8b94a3', fontSize: 15, lineHeight: 1.6, margin: 0 }}>{t('show.d')}</p>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={sec}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
          {feats.map((f, i) => (
            <div key={i} style={cardF}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{f.ic}</div>
              <h3 style={{ margin: '0 0 5px', fontSize: 15.5 }}>{t(f.t)}</h3>
              <p style={{ margin: 0, color: '#8b94a3', fontSize: 13, lineHeight: 1.5 }}>{t(f.d)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SCORECARD TEASER */}
      <section style={sec}>
        <div style={{ background: 'linear-gradient(135deg,rgba(56,189,248,.08),rgba(29,78,216,.05))', border: '1px solid rgba(56,189,248,.25)', borderRadius: 20, padding: '30px 26px', textAlign: 'center' }}>
          <span style={{ ...pillBlue, background: 'rgba(56,189,248,.15)' }}>🔮 {t('score.tag')}</span>
          <h2 style={{ fontSize: 24, margin: '6px 0 8px', fontWeight: 800 }}>{t('score.t')}</h2>
          <p style={{ color: '#8b94a3', fontSize: 15, maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>{t('score.d')}</p>
        </div>
      </section>

      {/* SOCIO FUNDADOR */}
      <section style={sec}>
        <div style={{ background: 'linear-gradient(135deg,rgba(251,191,36,.1),rgba(234,104,0,.06))', border: '1px solid rgba(251,191,36,.3)', borderRadius: 20, padding: '28px 26px', textAlign: 'center' }}>
          <span style={{ ...pill, marginBottom: 10 }}>💙 {t('found.t')}</span>
          <p style={{ color: '#e7ebf2', fontSize: 16, maxWidth: 600, margin: '0 auto', lineHeight: 1.6, fontWeight: 500 }}>{t('found.d')}</p>
        </div>
      </section>

      {/* CTA FINAL */}
      <section style={{ ...sec, textAlign: 'center' }}>
        <h2 style={{ fontSize: 28, margin: '0 0 8px', fontWeight: 850 }}>{t('cta.t')}</h2>
        <p style={{ color: '#8b94a3', margin: '0 0 22px', fontSize: 15 }}>{t('cta.d')}</p>
        <a href="/registro" style={{ ...btnPrimary, padding: '14px 28px', fontSize: 16 }}>{t('hero.ctaTry')}</a>
      </section>

      <footer style={{ textAlign: 'center', color: '#7b8494', fontSize: 13, padding: '30px 18px 50px', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        {t('foot.have')} <a href="/login" style={{ color: '#0ea5e9', textDecoration: 'none' }}>{t('foot.login')}</a>
        <div style={{ marginTop: 10, color: '#5e6675' }}>© FlotaDSP</div>
      </footer>
    </div>
  )
}

const dot = (c) => ({ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' })
const sec = { maxWidth: 1080, margin: '0 auto', padding: '54px 20px' }
const link = { color: '#8b94a3', textDecoration: 'none', fontSize: 14, fontWeight: 600 }
const logo = { width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#fb923c,#ea6800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }
const btnPrimary = { color: '#fff', background: 'linear-gradient(135deg,#0ea5e9,#0369a1)', padding: '8px 14px', borderRadius: 10, textDecoration: 'none', fontWeight: 800, fontSize: 14, display: 'inline-block' }
const btnGhost = { color: '#eef1f6', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', padding: '8px 14px', borderRadius: 12, textDecoration: 'none', fontWeight: 800, display: 'inline-block' }
const pill = { display: 'inline-block', background: 'rgba(251,191,36,.12)', border: '1px solid rgba(251,191,36,.35)', color: '#fbbf24', padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 700, marginBottom: 20 }
const pillBlue = { display: 'inline-block', background: 'rgba(14,165,233,.12)', border: '1px solid rgba(14,165,233,.3)', color: '#38bdf8', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.04em' }
const grad = { background: 'linear-gradient(120deg,#38bdf8,#0ea5e9)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
const h2c = { textAlign: 'center', fontSize: 26, fontWeight: 800, margin: '0 0 30px' }
const cardF = { background: '#13161b', border: '1px solid rgba(255,255,255,.07)', borderRadius: 16, padding: 20 }
const sel = { background: '#13161b', color: '#e7ebf2', border: '1px solid rgba(255,255,255,.12)', borderRadius: 9, padding: '7px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
