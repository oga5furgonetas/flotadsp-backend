import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE } from '../services/api'
import { useT, LANGS } from '../i18n'

export default function Dashboard() {
  const { t, lang, setLang } = useT()
  const nav = useNavigate()
  const [me, setMe] = useState(null)
  const [data, setData] = useState({ vehicles: null, drivers: null, insp: [] })
  const [bill, setBill] = useState(null)
  const [billCfg, setBillCfg] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const tk = localStorage.getItem('flotadsp_token')
    if (!tk) { nav('/login'); return }
    let admin = {}
    try { admin = JSON.parse(localStorage.getItem('flotadsp_admin') || '{}') } catch {}
    setMe(admin)
    const H = { Authorization: `Bearer ${tk}` }
    const get = (p) => fetch(`${API_BASE}/${p}`, { headers: H }).then(r => r.ok ? r.json() : null).catch(() => null)
    Promise.all([get('vehicles'), get('drivers'), get('inspections?limit=8')]).then(([v, d, i]) => {
      if (v === null) { nav('/login'); return }
      const arr = Array.isArray(i) ? i : (i?.items || i?.inspections || [])
      setData({ vehicles: Array.isArray(v) ? v : [], drivers: Array.isArray(d) ? d : [], insp: arr })
    })
    get('org/billing').then(setBill)
    get('billing/config').then(setBillCfg)
  }, [nav])

  function logout() { localStorage.removeItem('flotadsp_token'); localStorage.removeItem('flotadsp_admin'); nav('/login') }

  if (!me) return null
  const link = `https://flotadsp.com/conductor/#${me.slug || ''}`
  function orgId() { try { return JSON.parse(atob((localStorage.getItem('flotadsp_token') || '').split('.')[1] || '')).org_id || '' } catch { return '' } }
  function chosenPlan() { const c = localStorage.getItem('flota_plan'); return ['Starter', 'Pro', 'Max'].includes(c) ? c : '' }
  function planOrder() { const c = chosenPlan(); const all = ['Starter', 'Pro', 'Max']; return c ? [c, ...all.filter((p) => p !== c)] : all }
  const PRICES = { Starter: '99,99', Pro: '139,99', Max: '199,99' }
  const kpis = [
    { n: data.vehicles?.length, l: t('dash.vehicles'), ic: '🚐' },
    { n: data.drivers?.length, l: t('dash.drivers'), ic: '👤' },
    { n: data.insp?.length, l: t('dash.insp'), ic: '📋' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0b0d10', color: '#eef1f6', fontFamily: 'Inter Variable,Inter,system-ui,sans-serif' }}>
      <header style={hdr}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={logo}>⚡</div><b>{me.name || 'FlotaDSP'}</b>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <select value={lang} onChange={(e) => setLang(e.target.value)} style={selSm}>
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={logout} style={btnGhost}>{t('dash.logout')}</button>
        </div>
      </header>

      <main style={{ maxWidth: 940, margin: '0 auto', padding: '34px 22px 60px' }}>
        <h1 style={{ fontSize: 23, margin: '0 0 22px' }}>{t('dash.welcome')}, {me.name || ''} 👋</h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginBottom: 22 }}>
          {kpis.map((k, i) => (
            <div key={i} style={card}>
              <div style={{ fontSize: 18 }}>{k.ic}</div>
              <div style={{ fontSize: 28, fontWeight: 850, marginTop: 6 }}>{k.n == null ? '…' : k.n}</div>
              <div style={{ color: '#8b94a3', fontSize: 12.5 }}>{k.l}</div>
            </div>
          ))}
        </div>

        <div style={{ ...card, marginBottom: 22 }}>
          <h2 style={h2}>🔗 {t('dash.linkT')}</h2>
          <p style={{ color: '#8b94a3', fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>{t('dash.linkD')}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input readOnly value={link} style={{ flex: 1, minWidth: 220, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: '#0e1116', color: '#eef1f6', fontSize: 13 }} />
            <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
              style={{ ...btnPrimary, whiteSpace: 'nowrap' }}>{copied ? t('dash.copied') : t('dash.copy')}</button>
          </div>
        </div>

        {bill && bill.account_type !== 'owner' && (
          <div style={{ ...card, marginBottom: 22 }}>
            <h2 style={h2}>💳 {t('bill.title')}</h2>
            {bill.status === 'active' ? (
              <p style={{ color: '#4ade80', fontSize: 14, margin: 0, fontWeight: 600 }}>✅ {t('bill.active')}{bill.plan ? ` · ${bill.plan}` : ''}</p>
            ) : (
              <div>
                <p style={{ color: '#f59e0b', fontSize: 13, margin: '0 0 4px', fontWeight: 600 }}>
                  ⏳ {t('bill.trial')}{bill.days_left != null ? ` · ${bill.days_left} ${t('bill.daysleft')}` : ''}
                </p>
                <p style={{ color: '#8b94a3', fontSize: 13, margin: '0 0 12px' }}>
                  {t('bill.continue')}{chosenPlan() ? ` · ${t('bill.chosen')}: ${chosenPlan()}` : ''}
                </p>
                {billCfg && billCfg.ready ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {planOrder().map((p) => billCfg.checkout[p] ? (
                      <a key={p} href={`${billCfg.checkout[p]}?checkout[custom][org_id]=${orgId()}`}
                        style={{ ...btnPrimary, background: p === (chosenPlan() || 'Pro') ? 'linear-gradient(135deg,#fb923c,#ea6800)' : 'rgba(255,255,255,.06)', border: p === (chosenPlan() || 'Pro') ? 'none' : '1px solid rgba(255,255,255,.12)' }}>
                        {t('bill.sub')} {p} {PRICES[p] ? `· ${PRICES[p]}€` : ''}
                      </a>
                    ) : null)}
                  </div>
                ) : <p style={{ color: '#8b94a3', fontSize: 13, margin: 0 }}>{t('bill.soon')}</p>}
              </div>
            )}
          </div>
        )}

        <div style={card}>
          <h2 style={h2}>{t('dash.recent')}</h2>
          {data.insp == null ? <p style={{ color: '#8b94a3' }}>…</p> :
            data.insp.length === 0 ? <p style={{ color: '#8b94a3', fontSize: 13 }}>{t('dash.empty')}</p> :
              <div>{data.insp.slice(0, 8).map((x, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: i ? '1px solid rgba(255,255,255,.05)' : 'none', fontSize: 13 }}>
                  <span>{(x.vehicle_plate || x.license_plate || x.vehicle_id || '—')}</span>
                  <span style={{ color: '#8b94a3' }}>{(x.created_at || '').slice(0, 10)}</span>
                </div>
              ))}</div>}
        </div>
      </main>
    </div>
  )
}

const hdr = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,.07)', padding: '15px 22px' }
const logo = { width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#fb923c,#ea6800)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const card = { background: '#13161b', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: '18px 20px' }
const h2 = { fontSize: 15, margin: '0 0 8px', fontWeight: 800 }
const selSm = { background: '#13161b', color: '#e7ebf2', border: '1px solid rgba(255,255,255,.12)', borderRadius: 9, padding: '6px 9px', fontSize: 13 }
const btnGhost = { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#eef1f6', borderRadius: 9, padding: '7px 13px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }
const btnPrimary = { background: 'linear-gradient(135deg,#fb923c,#ea6800)', border: 'none', color: '#fff', borderRadius: 10, padding: '10px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 800 }
