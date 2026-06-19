import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT, LANGS } from '../i18n'

export default function Dashboard() {
  const { t, lang, setLang } = useT()
  const nav = useNavigate()
  const [me, setMe] = useState(null)

  useEffect(() => {
    const tk = localStorage.getItem('flotadsp_token')
    if (!tk) { nav('/login'); return }
    try { setMe(JSON.parse(localStorage.getItem('flotadsp_admin') || '{}')) } catch { setMe({}) }
  }, [nav])

  function logout() {
    localStorage.removeItem('flotadsp_token'); localStorage.removeItem('flotadsp_admin'); nav('/login')
  }

  if (!me) return null
  return (
    <div style={{ minHeight: '100vh', background: '#0b0d10', color: '#eef1f6', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,.07)', padding: '16px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#fb923c,#ea6800)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⚡</div>
          <b>FlotaDSP</b>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ background: '#13161b', color: '#e7ebf2', border: '1px solid rgba(255,255,255,.12)', borderRadius: 9, padding: '6px 9px', fontSize: 13 }}>
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={logout} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#eef1f6', borderRadius: 9, padding: '7px 13px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>{t('dash.logout')}</button>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 22px' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>{t('dash.welcome')}, {me.name || ''} 👋</h1>
        {me.slug && <p style={{ color: '#8b94a3', margin: '0 0 24px' }}>flotadsp.com/{me.slug}</p>}
        <div style={{ background: '#13161b', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🚧</div>
          <p style={{ color: '#8b94a3', margin: 0, maxWidth: 460, marginInline: 'auto', lineHeight: 1.6 }}>{t('dash.soon')}</p>
        </div>
      </main>
    </div>
  )
}
