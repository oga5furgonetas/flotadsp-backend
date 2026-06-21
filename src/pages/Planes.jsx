import { useT, LANGS } from '../i18n'

export default function Planes() {
  const { t, lang, setLang } = useT()
  const plans = [
    { tag: t('nav.try'), name: t('pl.days'), who: t('pl.who.trial'), price: t('pl.free'), per: '', cta: t('pl.start'), href: '/registro', pop: false,
      feats: ['pl.feat.all', 'pl.feat.nocard', 'pl.feat.1c'] },
    { tag: 'Starter', name: 'Starter', who: t('pl.who.s'), price: '99,99€', per: t('pl.mo'), cta: t('pl.choose'), href: '/registro?plan=Starter', pop: false,
      feats: ['pl.feat.1c', 'pl.feat.25', 'pl.feat.insp'] },
    { tag: 'Pro ⭐', name: 'Pro', who: t('pl.who.p'), price: '139,99€', per: t('pl.mo'), cta: t('pl.choose'), href: '/registro?plan=Pro', pop: true,
      feats: ['pl.feat.3c', 'pl.feat.unl', 'pl.feat.allm', 'pl.feat.prio'] },
    { tag: 'Max', name: 'Max', who: t('pl.who.f'), price: '199,99€', per: t('pl.mo'), cta: t('pl.choose'), href: '/registro?plan=Max', pop: false,
      feats: ['pl.feat.unlc', 'pl.feat.allm', 'pl.feat.prio'] },
  ]
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(1100px 560px at 72% -12%,rgba(14,165,233,.10),transparent),#0b0d10', color: '#eef1f6', fontFamily: 'Inter,system-ui,sans-serif', padding: '20px 16px 60px' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: '#eef1f6' }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#fb923c,#ea6800)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⚡</div>
            <b>FlotaDSP</b>
          </a>
          <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ background: '#13161b', color: '#e7ebf2', border: '1px solid rgba(255,255,255,.12)', borderRadius: 9, padding: '7px 10px', fontSize: 13 }}>
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </nav>

        <h1 style={{ textAlign: 'center', fontSize: 30, margin: '20px 0 6px', fontWeight: 850 }}>{t('pl.title')}</h1>
        <p style={{ textAlign: 'center', color: '#8b94a3', margin: '0 0 8px' }}>{t('pl.sub')}</p>
        <div style={{ textAlign: 'center', margin: '14px 0 26px' }}>
          <span style={{ background: 'rgba(251,191,36,.12)', border: '1px solid rgba(251,191,36,.35)', color: '#fbbf24', padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 700 }}>🚀 {t('pl.beta')}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, alignItems: 'stretch' }}>
          {plans.map((p, i) => (
            <div key={i} style={{ background: '#13161b', border: p.pop ? '1px solid rgba(14,165,233,.5)' : '1px solid rgba(255,255,255,.08)', borderRadius: 18, padding: '22px 20px', display: 'flex', flexDirection: 'column', boxShadow: p.pop ? '0 18px 50px -20px rgba(14,165,233,.4)' : 'none' }}>
              <span style={{ alignSelf: 'flex-start', fontSize: 10.5, fontWeight: 800, color: '#0ea5e9', background: 'rgba(14,165,233,.12)', padding: '3px 9px', borderRadius: 99, marginBottom: 10, textTransform: 'uppercase' }}>{p.pop ? t('pl.popular') : p.tag}</span>
              <h3 style={{ margin: '0 0 2px', fontSize: 18 }}>{p.name}</h3>
              <p style={{ color: '#8b94a3', fontSize: 12, margin: '0 0 14px', minHeight: 18 }}>{p.who}</p>
              <div style={{ fontSize: 30, fontWeight: 850, marginBottom: 2 }}>{p.price}<span style={{ fontSize: 13, color: '#8b94a3', fontWeight: 600 }}>{p.per}</span></div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0', flex: 1 }}>
                {p.feats.map((f, j) => <li key={j} style={{ fontSize: 13, color: '#cbd3e0', padding: '5px 0 5px 22px', position: 'relative' }}><span style={{ position: 'absolute', left: 0, color: '#0ea5e9', fontWeight: 800 }}>✓</span>{t(f)}</li>)}
              </ul>
              <a href={p.href} style={{ display: 'block', textAlign: 'center', padding: 11, borderRadius: 11, fontWeight: 800, fontSize: 14, textDecoration: 'none', background: p.pop ? 'linear-gradient(135deg,#0ea5e9,#0369a1)' : 'rgba(255,255,255,.05)', color: '#fff', border: p.pop ? 'none' : '1px solid rgba(255,255,255,.1)' }}>{p.cta}</a>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', color: '#8b94a3', fontSize: 12, margin: '22px auto 0', maxWidth: 620, lineHeight: 1.6 }}>💙 {t('pl.note')}</p>
      </div>
    </div>
  )
}
