import { LANGS, useT } from '../i18n'

// Pricing nuevo: 149/299/499 + Enterprise. Decidido por CEO (sesión auditoría).
// Clientes actuales: grandfathering 12 meses (sin cambios para ellos).
export default function Planes() {
  const { lang, setLang } = useT()
  const plans = [
    {
      key: 'trial', tag: 'Prueba', name: '14 días gratis', who: 'Sin tarjeta. Sin compromiso.',
      price: '0€', per: '', cta: 'Empezar', href: '/registro', pop: false,
      feats: ['Todas las funciones', 'Sin tarjeta de crédito', '1 centro durante la prueba'],
    },
    {
      key: 'Starter', tag: 'Starter', name: 'Starter', who: 'Para flotas pequeñas (hasta 25 vehículos)',
      price: '149€', per: '/mes', cta: 'Elegir Starter', href: '/registro?plan=Starter', pop: false,
      feats: ['1 centro', 'Hasta 25 vehículos', 'Inspecciones IA ilimitadas', 'Soporte por email'],
    },
    {
      key: 'Pro', tag: 'Pro', name: 'Pro', who: 'Operación multi-centro',
      price: '299€', per: '/mes', cta: 'Elegir Pro', href: '/registro?plan=Pro', pop: false,
      feats: ['Hasta 3 centros', 'Vehículos ilimitados', 'Scorecard Amazon integrado', 'Todos los módulos', 'Soporte prioritario'],
    },
    {
      key: 'Forensics', tag: 'Más popular ⭐', name: 'Pro + AI Forensics', who: 'Pone fin a las disputas por daños',
      price: '499€', per: '/mes', cta: 'Empezar 14 días gratis', href: '/registro?plan=Forensics', pop: true,
      feats: [
        'Todo lo de Pro',
        '🛡️ Peritaje técnico con firma del conductor',
        '🔒 Cadena de custodia con hash inmutable',
        '🚨 Detección de fraude del conductor',
        '🎯 Scorecard AI Coach con plan de acción',
      ],
    },
    {
      key: 'Enterprise', tag: 'Enterprise', name: 'Enterprise', who: 'Holdings de DSPs (5+ estaciones)',
      price: 'A medida', per: '', cta: 'Hablar con ventas', href: '/contacto?asunto=Enterprise', pop: false,
      feats: ['Centros ilimitados', 'Vista consolidada multi-DSP', 'SLA + soporte dedicado', 'SSO/SAML', 'Onboarding asistido'],
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(1100px 560px at 72% -12%,rgba(14,165,233,.10),transparent),#0b0d10', color: '#eef1f6', fontFamily: 'Inter,system-ui,sans-serif', padding: '20px 16px 60px' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: '#eef1f6' }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#fb923c,#ea6800)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⚡</div>
            <b>FlotaDSP</b>
          </a>
          <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ background: '#13161b', color: '#e7ebf2', border: '1px solid rgba(255,255,255,.12)', borderRadius: 9, padding: '7px 10px', fontSize: 13 }}>
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </nav>

        <h1 style={{ textAlign: 'center', fontSize: 32, margin: '24px 0 6px', fontWeight: 850 }}>Precios claros para DSPs serios</h1>
        <p style={{ textAlign: 'center', color: '#8b94a3', margin: '0 0 8px', fontSize: 15 }}>14 días gratis · sin tarjeta · cancela cuando quieras</p>
        <div style={{ textAlign: 'center', margin: '10px 0 22px' }}>
          <span style={{ background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.35)', color: '#4ade80', padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 700 }}>
            Anual: 2 meses gratis · escríbenos en Contacto
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, alignItems: 'stretch' }}>
          {plans.map((p, i) => (
            <div key={i} style={{
              position: 'relative', background: '#13161b',
              border: p.pop ? '2px solid rgba(14,165,233,.6)' : '1px solid rgba(255,255,255,.08)',
              borderRadius: 18, padding: '24px 20px 22px',
              display: 'flex', flexDirection: 'column',
              boxShadow: p.pop ? '0 24px 60px -20px rgba(14,165,233,.55)' : 'none',
              transform: p.pop ? 'translateY(-4px)' : 'none',
            }}>
              {p.pop && (
                <span style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#0ea5e9,#0369a1)', color: '#fff', fontSize: 10.5, fontWeight: 800, padding: '4px 12px', borderRadius: 99, letterSpacing: .3, textTransform: 'uppercase' }}>Más popular</span>
              )}
              <span style={{ alignSelf: 'flex-start', fontSize: 10.5, fontWeight: 800, color: '#0ea5e9', background: 'rgba(14,165,233,.12)', padding: '3px 9px', borderRadius: 99, marginBottom: 10, textTransform: 'uppercase' }}>{p.tag}</span>
              <h3 style={{ margin: '0 0 2px', fontSize: 19 }}>{p.name}</h3>
              <p style={{ color: '#8b94a3', fontSize: 12.5, margin: '0 0 16px', minHeight: 32 }}>{p.who}</p>
              <div style={{ fontSize: 30, fontWeight: 850, marginBottom: 2 }}>{p.price}<span style={{ fontSize: 13, color: '#8b94a3', fontWeight: 600 }}>{p.per}</span></div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0', flex: 1 }}>
                {p.feats.map((f, j) => (
                  <li key={j} style={{ fontSize: 13, color: '#cbd3e0', padding: '5px 0 5px 22px', position: 'relative', lineHeight: 1.4 }}>
                    <span style={{ position: 'absolute', left: 0, color: p.pop ? '#0ea5e9' : '#22c55e', fontWeight: 800 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <a href={p.href} style={{
                display: 'block', textAlign: 'center', padding: 12, borderRadius: 11, fontWeight: 800, fontSize: 14,
                textDecoration: 'none',
                background: p.pop ? 'linear-gradient(135deg,#0ea5e9,#0369a1)' : 'rgba(255,255,255,.05)',
                color: '#fff', border: p.pop ? 'none' : '1px solid rgba(255,255,255,.1)',
              }}>{p.cta}</a>
            </div>
          ))}
        </div>

        <div style={{ maxWidth: 760, margin: '34px auto 0', padding: '18px 22px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14 }}>
          <p style={{ margin: 0, fontSize: 13.5, color: '#cbd3e0', lineHeight: 1.7 }}>
            🤝 <b style={{ color: '#fff' }}>Promesa con los clientes actuales:</b> si ya estás en un plan vigente, mantienes <b>tu precio actual durante 12 meses</b>. No subimos a nadie a mitad de viaje.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#8b94a3', lineHeight: 1.6 }}>
            Los precios incluyen IVA cuando aplique. Pagos gestionados por Lemon Squeezy (Merchant of Record). Puedes cancelar tu suscripción en cualquier momento desde el panel; el acceso continúa hasta el final del periodo ya pagado. Más información en <a href="/terminos" style={{ color: '#0ea5e9' }}>Términos</a> y <a href="/privacidad" style={{ color: '#0ea5e9' }}>Privacidad</a>.
          </p>
        </div>

        <div style={{ maxWidth: 1100, margin: '36px auto 0' }}>
          <h2 style={{ fontSize: 18, margin: '0 0 14px', textAlign: 'center', color: '#cbd3e0' }}>¿Por qué <b style={{ color: '#0ea5e9' }}>Pro + AI Forensics</b>?</h2>
          <p style={{ textAlign: 'center', color: '#8b94a3', maxWidth: 680, margin: '0 auto 18px', fontSize: 13.5, lineHeight: 1.6 }}>
            Si solo te ahorra <b style={{ color: '#fff' }}>una</b> disputa de daños al año (~1.500€ por incidente reclamado), el plan se paga 3 veces.
            Pero no lo vendemos por el ahorro — lo vendemos porque dormirás tranquilo.
          </p>
        </div>
      </div>
    </div>
  )
}
