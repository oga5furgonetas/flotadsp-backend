import { useState } from 'react'
import { LANGS, useT } from '../i18n'
import { Check, Zap, ArrowRight } from 'lucide-react'

// Precios base mensuales
const PLANS = [
  {
    key: 'basico',
    name: 'Básico',
    tag: null,
    who: 'Flotas pequeñas · 1 estación',
    priceM: 99,
    popular: false,
    color: '#64748b',
    limits: '1 centro · hasta 20 vehículos · hasta 20 conductores',
    feats: [
      '1 estación / centro',
      'Hasta 20 vehículos',
      'Hasta 20 conductores',
      'Inspecciones diarias con fotos',
      'Portal conductor (app móvil)',
      'Gestión de incidencias',
      'Alertas de mantenimiento (aceite, ruedas, pastillas)',
      'Alertas de ITV',
      'Historial por vehículo',
      'Soporte por email',
    ],
    no: ['Análisis IA de daños', 'Scorecard Amazon', 'Chat por estación', 'Asignación diaria', 'AI Forensics', 'Exportación de datos'],
  },
  {
    key: 'pro',
    name: 'Pro',
    tag: 'Más elegido',
    who: 'Flotas medianas · multi-estación',
    priceM: 229,
    popular: true,
    color: '#0ea5e9',
    limits: 'Hasta 3 centros · hasta 75 vehículos · conductores ilimitados',
    feats: [
      'Hasta 3 estaciones / centros',
      'Hasta 75 vehículos',
      'Conductores ilimitados',
      'Todo lo del plan Básico',
      '🤖 Análisis IA de daños en cada inspección',
      '📊 Scorecard Amazon DSP integrado',
      '💬 Chat en tiempo real por estación',
      '📋 Asignación diaria conductor↔furgoneta',
      '📁 Directorio de contactos',
      'Soporte prioritario',
    ],
    no: ['AI Forensics (peritaje firmado)', 'Exportación de datos'],
  },
  {
    key: 'flota',
    name: 'Flota',
    tag: 'Máxima protección',
    who: 'Flotas grandes · sin límites',
    priceM: 399,
    popular: false,
    color: '#a855f7',
    limits: 'Centros ilimitados · vehículos ilimitados · conductores ilimitados',
    feats: [
      'Centros ilimitados',
      'Vehículos y conductores ilimitados',
      'Todo lo del plan Pro',
      '🛡️ AI Forensics: peritaje técnico firmado',
      '🔒 Cadena de custodia con hash inmutable',
      '🚨 Detección de fraude del conductor',
      '📤 Exportación completa de datos',
      '🎯 Scorecard AI Coach con plan de acción',
      'Soporte dedicado + SLA',
    ],
    no: [],
  },
]

const ENTERPRISE = {
  feats: ['Todo lo de Flota', 'Múltiples DSPs consolidados', 'SSO / SAML', 'Onboarding asistido', 'SLA personalizado', 'Integración API'],
}

// Precios anuales reales de Lemon Squeezy (pago único anual)
const ANNUAL_PRICE = { basico: 1040, pro: 2405, flota: 4190 }
const annualM = (key) => Math.round(ANNUAL_PRICE[key] / 12)
const annualY = (key) => ANNUAL_PRICE[key]
const annualSave = (priceM, key) => priceM * 12 - ANNUAL_PRICE[key]

export default function Planes() {
  const { lang, setLang, t } = useT()
  const [billing, setBilling] = useState('monthly') // 'monthly' | 'annual'

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(1100px 560px at 72% -12%,rgba(14,165,233,.10),transparent),#0b0d10', color: '#eef1f6', fontFamily: 'Inter,system-ui,sans-serif', padding: '20px 16px 80px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 48 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: '#eef1f6' }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#fb923c,#ea6800)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={17} color="white" />
            </div>
            <b style={{ fontSize: 16 }}>FlotaDSP</b>
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ background: '#13161b', color: '#e7ebf2', border: '1px solid rgba(255,255,255,.12)', borderRadius: 9, padding: '6px 10px', fontSize: 13 }}>
              {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <a href="/panel/login" style={{ color: '#8b94a3', fontSize: 13, textDecoration: 'none' }}>Acceder</a>
          </div>
        </nav>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,.10)', border: '1px solid rgba(245,158,11,.30)', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700, color: '#fbbf24', marginBottom: 10, letterSpacing: '.06em' }}>
            ⭐ Acceso Fundador · plazas limitadas
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(14,165,233,.12)', border: '1px solid rgba(14,165,233,.3)', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700, color: '#38bdf8', marginBottom: 16, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            ✨ 14 días gratis en todos los planes
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,44px)', fontWeight: 900, margin: '0 0 12px', lineHeight: 1.1 }}>
            El plan que necesita tu flota
          </h1>
          <p style={{ color: '#8b94a3', fontSize: 16, maxWidth: 500, margin: '0 auto 24px' }}>
            Sin permanencia. Sin tarjeta durante la prueba. Cancela cuando quieras.
          </p>

          {/* Toggle mensual / anual */}
          <div style={{ display: 'inline-flex', alignItems: 'center', background: '#13161b', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: 4, gap: 4 }}>
            <button
              onClick={() => setBilling('monthly')}
              style={{ padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: billing === 'monthly' ? '#1e293b' : 'transparent', color: billing === 'monthly' ? '#eef1f6' : '#64748b', transition: 'all .2s' }}
            >
              Mensual
            </button>
            <button
              onClick={() => setBilling('annual')}
              style={{ padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, background: billing === 'annual' ? '#1e293b' : 'transparent', color: billing === 'annual' ? '#eef1f6' : '#64748b', transition: 'all .2s' }}
            >
              Anual
              <span style={{ background: 'rgba(52,211,153,.15)', color: '#34d399', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                Ahorra hasta 598€
              </span>
            </button>
          </div>

          {billing === 'annual' && (
            <p style={{ color: '#34d399', fontSize: 13, marginTop: 10, fontWeight: 600 }}>
              💚 Un solo pago al año · sin renovaciones mensuales · precio bloqueado
            </p>
          )}
        </div>

        {/* Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20, marginBottom: 24 }}>
          {PLANS.map((p) => {
            const displayPrice = billing === 'annual' ? annualM(p.key) : p.priceM
            const yearTotal = annualY(p.key)
            const yearSave = annualSave(p.priceM, p.key)

            return (
              <div key={p.key} style={{
                background: p.popular ? 'linear-gradient(145deg,#0f172a,#0c1929)' : '#13161b',
                border: p.popular ? `2px solid ${p.color}` : '1px solid rgba(255,255,255,.08)',
                borderRadius: 20,
                padding: '28px 24px',
                position: 'relative',
                display: 'flex', flexDirection: 'column',
                boxShadow: p.popular ? `0 0 40px ${p.color}22` : 'none',
              }}>
                {p.tag && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: p.color, borderRadius: 20, padding: '3px 14px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', letterSpacing: '.04em' }}>
                    {p.tag}
                  </div>
                )}

                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: p.color, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: '#8b94a3', marginBottom: 16 }}>{p.who}</div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 44, fontWeight: 900, color: '#eef1f6' }}>{displayPrice}€</span>
                    <span style={{ color: '#8b94a3', fontSize: 14 }}>/mes</span>
                    {billing === 'annual' && (
                      <span style={{ marginLeft: 6, fontSize: 13, color: '#64748b', textDecoration: 'line-through' }}>{p.priceM}€</span>
                    )}
                  </div>

                  {billing === 'annual' ? (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 12, color: '#34d399', fontWeight: 700 }}>
                        {yearTotal}€/año · ahorras {yearSave}€ al año
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{p.limits}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{p.limits}</div>
                  )}
                </div>

                <a
                  href={`/registro?plan=${p.key}&billing=${billing}`}
                  style={{
                    display: 'block', textAlign: 'center', padding: '12px 0',
                    borderRadius: 12, fontWeight: 800, fontSize: 14, textDecoration: 'none',
                    marginBottom: 24,
                    background: p.popular ? `linear-gradient(135deg,${p.color},${p.color}cc)` : 'transparent',
                    color: p.popular ? '#fff' : p.color,
                    border: p.popular ? 'none' : `1.5px solid ${p.color}`,
                  }}
                >
                  Empezar 14 días gratis →
                </a>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Incluye</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {p.feats.map((f) => (
                      <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#cbd3e0' }}>
                        <Check size={14} color={p.color} style={{ marginTop: 2, flexShrink: 0 }} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {p.no.length > 0 && (
                    <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {p.no.map((f) => (
                        <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569' }}>
                          <span style={{ fontSize: 14, lineHeight: 1 }}>✕</span> {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Nota fundadores */}
        <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.18)', borderRadius: 14, padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ fontSize: 18 }}>⭐</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', marginBottom: 3 }}>Los primeros clientes tienen acceso prioritario a todas las mejoras</div>
            <div style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>
              Como cliente fundador, recibirás antes que nadie cada nueva función, mejora del análisis de IA y actualización del sistema. Tu flota y tu feedback moldean el producto directamente.
            </div>
          </div>
        </div>

        {/* Nota upgrade prorrateado */}
        <div style={{ background: 'rgba(14,165,233,.06)', border: '1px solid rgba(14,165,233,.18)', borderRadius: 14, padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ fontSize: 18 }}>🔄</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', marginBottom: 3 }}>Cambia de plan cuando quieras — pagarás solo la diferencia</div>
            <div style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>
              Si subes de Básico a Pro a mitad de mes, calculamos los días que llevas en el plan actual y te descontamos ese importe del nuevo. Nunca pagas dos veces lo mismo.
            </div>
          </div>
        </div>

        {/* Enterprise */}
        <div style={{ background: '#13161b', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: '28px 32px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Enterprise</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 900 }}>Holdings de DSPs · 5+ estaciones</h3>
            <p style={{ color: '#8b94a3', fontSize: 14, margin: 0 }}>Precio a medida · SLA garantizado · onboarding asistido</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
              {ENTERPRISE.feats.map((f) => (
                <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8' }}>
                  <Check size={13} color="#f59e0b" /> {f}
                </li>
              ))}
            </ul>
          </div>
          <a href="/contacto?asunto=Enterprise" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 28px', borderRadius: 12, background: 'rgba(245,158,11,.15)', border: '1.5px solid rgba(245,158,11,.4)', color: '#fbbf24', fontWeight: 800, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Hablar con ventas →
          </a>
        </div>

        {/* FAQ */}
        <div style={{ marginTop: 48, textAlign: 'center' }}>
          <p style={{ color: '#64748b', fontSize: 13 }}>
            ¿Dudas? <a href="/contacto" style={{ color: '#0ea5e9', textDecoration: 'none' }}>Contacta con nosotros</a> · Puedes empezar con la prueba gratuita y cambiar de plan en cualquier momento.
          </p>
        </div>

      </div>
    </div>
  )
}
