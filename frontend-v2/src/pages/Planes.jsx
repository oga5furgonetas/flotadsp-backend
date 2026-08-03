import { useEffect, useState } from 'react'
import { LANGS, useT } from '../i18n'
import { Check, Zap, ArrowRight } from 'lucide-react'
import { API_BASE } from '../lib/apiBase'

/* Tarifa POR FURGONETA. Un DSP sabe lo que le cuesta cada furgoneta al mes;
   "8 € por furgoneta" lo compara solo con lo que le cuesta un golpe. Estos
   valores son el respaldo: los de verdad llegan de /billing/planes. */
const PLANES_FALLBACK = [
  {
    clave: 'operacion',
    nombre: 'Operación',
    para: 'Un centro',
    por_vehiculo: 5,
    minimo_vehiculos: 20,
    color: '#64748b',
    incluye: [
      'Inspecciones con foto y análisis de daños por IA',
      'Histórico de daños por furgoneta',
      'Reparaciones: taller, coste real y cierre',
      'Avisos de mantenimiento e ITV',
      'Portal del conductor',
      'Chat del centro',
    ],
    no_incluye: ['Scorecard de Amazon', 'Asignación diaria y turnos', 'Métricas de Amazon',
                 'Informe pericial firmado', 'Exportar datos', 'Varios centros'],
  },
  {
    clave: 'completo',
    nombre: 'Completo',
    para: 'Varios centros',
    por_vehiculo: 8,
    minimo_vehiculos: 20,
    recomendado: true,
    color: '#fb923c',
    incluye: [
      'Todo lo de Operación, sin límite de centros',
      'Scorecard de Amazon con objetivos y umbrales',
      'Asignación diaria y cuadrante de turnos',
      'Métricas de Amazon y ritmo real por conductor',
      'Informe pericial firmado y cadena de custodia',
      'Exportar datos',
    ],
    no_incluye: [],
  },
  {
    clave: 'holding',
    nombre: 'Holding',
    para: 'Cinco estaciones o más',
    por_vehiculo: 0,
    minimo_vehiculos: 0,
    color: '#a78bfa',
    incluye: ['Todo lo de Completo', 'Varias sociedades', 'API para tus sistemas',
              'Soporte con SLA', 'Alta asistida'],
    no_incluye: [],
  },
]

/* Lo que paga al mes una flota de ese tamaño. 0 = precio a medida. */
const precioMes = (p, furgonetas) =>
  p.por_vehiculo ? p.por_vehiculo * Math.max(Number(furgonetas) || 0, p.minimo_vehiculos) : 0

const ENTERPRISE = {
  feats: ['Todo lo de Flota', 'Múltiples DSPs consolidados', 'SSO / SAML', 'Onboarding asistido', 'SLA personalizado', 'Integración API'],
}

/* Pagando un año se pagan 10 meses: dos salen gratis. Antes esto era una
   tabla de importes a mano que había que cuadrar con Lemon Squeezy. */
const MESES_ANUAL = 10
const precioAnual = (p, furgonetas) => precioMes(p, furgonetas) * MESES_ANUAL
const ahorroAnual = (p, furgonetas) => precioMes(p, furgonetas) * (12 - MESES_ANUAL)

/* ── Oferta Fundador: Completo a precio de Operación para siempre, plazas
   por el backend. La reserva no cobra: captura el contacto y avisa por Telegram
   para cerrar la venta por teléfono. ── */
function FounderOffer() {
  const [slots, setSlots] = useState(null)          // { total, left }
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', fleet_size: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(`${API_BASE}/founder/slots`).then(r => r.json()).then(setSlots).catch(() => {})
  }, [])

  async function reserve(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr('')
    try {
      const r = await fetch(`${API_BASE}/founder/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.detail || 'No se pudo reservar')
      setDone(true)
      if (typeof j.left === 'number') setSlots(s => ({ ...(s || { total: 10 }), left: j.left }))
    } catch (e2) {
      setErr(e2.message)
    } finally { setBusy(false) }
  }

  if (slots && slots.left <= 0) return null   // agotadas: la oferta desaparece sola

  const inputS = { background: '#0b0d10', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#eef1f6', outline: 'none', width: '100%' }

  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(145deg,rgba(245,158,11,.10),rgba(249,115,22,.05)), #13161b', border: '1.5px solid rgba(245,158,11,.35)', borderRadius: 20, padding: '26px 28px', marginBottom: 36, boxShadow: '0 0 50px rgba(245,158,11,.08)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ minWidth: 260, flex: '1 1 320px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,.15)', borderRadius: 99, padding: '4px 12px', fontSize: 11, fontWeight: 800, color: '#fbbf24', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            ⭐ Oferta fundador {slots ? `· quedan ${slots.left} de ${slots.total} plazas` : '· plazas limitadas'}
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 900, lineHeight: 1.2 }}>
            El plan Completo a <span style={{ color: '#fbbf24' }}>5€ por furgoneta, para siempre</span>
          </h2>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 14, lineHeight: 1.6, maxWidth: 520 }}>
            Scorecard, turnos, métricas de Amazon e informe pericial — todo el plan Completo (8€/furgoneta) al precio del de Operación,
            <b style={{ color: '#cbd3e0' }}> bloqueado de por vida</b> mientras seas cliente. Solo para los primeros DSPs.
            Reservar es gratis y sin compromiso: te llamamos y lo activamos juntos.
          </p>
        </div>

        <div style={{ flex: '0 1 340px', minWidth: 280 }}>
          {done ? (
            <div style={{ background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.3)', borderRadius: 14, padding: '18px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#34d399', marginBottom: 4 }}>Plaza reservada</div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>Te contactamos en menos de 24h para activarla. Sin compromiso.</div>
            </div>
          ) : open ? (
            <form onSubmit={reserve} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input style={inputS} placeholder="Tu nombre *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              <input style={inputS} type="email" placeholder="Email *" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={inputS} placeholder="Teléfono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                <input style={inputS} placeholder="Nº furgonetas" value={form.fleet_size} onChange={e => setForm(f => ({ ...f, fleet_size: e.target.value }))} />
              </div>
              {err && <div style={{ fontSize: 12, color: '#f87171' }}>{err}</div>}
              <button type="submit" disabled={busy} style={{ background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', border: 'none', borderRadius: 11, padding: '12px 0', fontSize: 14, fontWeight: 900, color: '#0b0d10', cursor: 'pointer', opacity: busy ? .6 : 1 }}>
                {busy ? 'Reservando…' : 'Confirmar reserva gratuita'}
              </button>
            </form>
          ) : (
            <button onClick={() => setOpen(true)} style={{ width: '100%', background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', border: 'none', borderRadius: 12, padding: '15px 24px', fontSize: 15, fontWeight: 900, color: '#0b0d10', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 30px rgba(245,158,11,.25)' }}>
              Reservar mi plaza fundador <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Planes() {
  const { lang, setLang, t } = useT()
  const [billing, setBilling] = useState('monthly') // 'monthly' | 'annual'
  /* El visitante escribe cuántas furgonetas tiene y ve SU precio. Una tabla
     de planes obliga a hacer cuentas; esto no. */
  const [furgonetas, setFurgonetas] = useState(40)
  const [planes, setPlanes] = useState(PLANES_FALLBACK)

  useEffect(() => {
    // Los precios mandan desde el backend. Si no responde, se quedan los de
    // respaldo: la página de precios nunca puede aparecer sin precios.
    fetch(`${API_BASE}/billing/planes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const lista = d?.planes
        if (!Array.isArray(lista) || !lista.length) return
        setPlanes(lista.map((p) => ({
          ...p,
          color: PLANES_FALLBACK.find((f) => f.clave === p.clave)?.color || '#64748b',
        })))
      })
      .catch(() => { /* respaldo local */ })
  }, [])


  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(1100px 560px at 72% -12%,rgba(14,165,233,.10),transparent),#0b0d10', color: '#eef1f6', fontFamily: 'Inter Variable,Inter,system-ui,sans-serif', padding: '20px 16px 80px' }}>
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
                2 meses gratis
              </span>
            </button>
          </div>

          {billing === 'annual' && (
            <p style={{ color: '#34d399', fontSize: 13, marginTop: 10, fontWeight: 600 }}>
              💚 Un solo pago al año · sin renovaciones mensuales · precio bloqueado
            </p>
          )}
        </div>

        {/* Oferta fundador con plazas reales */}
        <FounderOffer />

        {/* Cards */}
        {/* Cuántas furgonetas tienes: el precio se calcula con TU flota */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center', background: '#13161b', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: '14px 22px' }}>
            <label htmlFor="flota" style={{ fontSize: 14, color: '#cbd5e1', fontWeight: 600 }}>
              ¿Cuántas furgonetas tienes?
            </label>
            <input
              id="flota"
              type="range" min="5" max="200" step="5"
              value={furgonetas}
              onChange={(e) => setFurgonetas(Number(e.target.value))}
              style={{ width: 220, accentColor: '#fb923c' }}
            />
            <input
              type="number" min="1" max="2000" value={furgonetas}
              onChange={(e) => setFurgonetas(Math.max(1, Math.min(2000, Number(e.target.value) || 1)))}
              style={{ width: 74, background: '#0b0d10', border: '1px solid rgba(255,255,255,.14)', borderRadius: 10, padding: '8px 10px', color: '#eef1f6', fontSize: 15, fontWeight: 800, textAlign: 'center' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20, marginBottom: 24 }}>
          {planes.map((p) => {
            const mes = precioMes(p, furgonetas)
            const aMedida = !p.por_vehiculo
            const mostrado = billing === 'annual' ? Math.round(precioAnual(p, furgonetas) / 12) : mes
            const minimo = furgonetas > 0 && furgonetas < p.minimo_vehiculos

            return (
              <div key={p.clave} style={{
                background: p.recomendado ? 'linear-gradient(145deg,#0f172a,#0c1929)' : '#13161b',
                border: p.recomendado ? `2px solid ${p.color}` : '1px solid rgba(255,255,255,.08)',
                borderRadius: 20,
                padding: '28px 24px',
                position: 'relative',
                display: 'flex', flexDirection: 'column',
                boxShadow: p.recomendado ? `0 0 40px ${p.color}22` : 'none',
              }}>
                {p.recomendado && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: p.color, borderRadius: 20, padding: '3px 14px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', letterSpacing: '.04em', color: '#0b0d10' }}>
                    El de casi todos
                  </div>
                )}

                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: p.color, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>{p.nombre}</div>
                  <div style={{ fontSize: 13, color: '#8b94a3', marginBottom: 16 }}>{p.para}</div>

                  {aMedida ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 30, fontWeight: 900, color: '#eef1f6' }}>A medida</span>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ fontSize: 44, fontWeight: 900, color: '#eef1f6' }}>{mostrado}€</span>
                        <span style={{ color: '#8b94a3', fontSize: 14 }}>/mes</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#8b94a3', marginTop: 4 }}>
                        {p.por_vehiculo}€ por furgoneta y mes
                        {minimo && <span style={{ color: '#64748b' }}> · mínimo {p.minimo_vehiculos}</span>}
                      </div>
                      {billing === 'annual' && (
                        <div style={{ fontSize: 12, color: '#34d399', fontWeight: 700, marginTop: 4 }}>
                          {precioAnual(p, furgonetas)}€/año · ahorras {ahorroAnual(p, furgonetas)}€
                        </div>
                      )}
                    </>
                  )}
                </div>

                <a
                  href={aMedida ? '/contacto?asunto=Holding' : `/registro?plan=${p.clave}&billing=${billing}&flota=${furgonetas}`}
                  style={{
                    display: 'block', textAlign: 'center', padding: '12px 0',
                    borderRadius: 12, fontWeight: 800, fontSize: 14, textDecoration: 'none',
                    marginBottom: 24,
                    background: p.recomendado ? `linear-gradient(135deg,${p.color},${p.color}cc)` : 'transparent',
                    color: p.recomendado ? '#0b0d10' : p.color,
                    border: p.recomendado ? 'none' : `1.5px solid ${p.color}`,
                  }}
                >
                  {aMedida ? 'Hablamos →' : 'Empezar 14 días gratis →'}
                </a>

                <div style={{ flex: 1 }}>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(p.incluye || []).map((f) => (
                      <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#cbd5e1', lineHeight: 1.45 }}>
                        <Check size={14} color={p.color} style={{ flexShrink: 0, marginTop: 2 }} /> {f}
                      </li>
                    ))}
                  </ul>
                  {(p.no_incluye || []).length > 0 && (
                    <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {p.no_incluye.map((f) => (
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
              Si subes de Operación a Completo a mitad de mes, calculamos los días que llevas en el plan actual y te descontamos ese importe del nuevo. Nunca pagas dos veces lo mismo. Y si tu flota crece o encoge, el precio se ajusta: pagas por las furgonetas que tengas.
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
