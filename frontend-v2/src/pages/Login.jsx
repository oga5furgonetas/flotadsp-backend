import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE } from '../services/api'
import { useT, LANGS } from '../i18n'

export default function Login() {
  const { t, lang, setLang } = useT()
  const nav = useNavigate()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true); setErr('')
    try {
      const r = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.trim(), password: pass }),
      })
      const j = await r.json()
      if (!r.ok || !j.access_token) { setErr(t('login.err')); setBusy(false); return }
      localStorage.setItem('flotadsp_token', j.access_token)
      localStorage.setItem('flotadsp_admin', JSON.stringify({ name: j.name, role: j.role, id: j.id, account_type: j.account_type, slug: j.slug }))
      window.location.href = '/panel'
    } catch { setErr(t('login.err')); setBusy(false) }
  }

  return (
    <div style={wrap}>
      <div style={{ position: 'absolute', top: 18, right: 18 }}>
        <select value={lang} onChange={(e) => setLang(e.target.value)} style={sel}>
          {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div style={card}>
        <div style={{ fontSize: 30, textAlign: 'center', marginBottom: 6 }}>⚡</div>
        <h2 style={{ margin: '0 0 20px', textAlign: 'center', fontSize: 20 }}>{t('login.title')}</h2>
        <label style={lbl}>{t('login.user')}</label>
        <input style={inp} value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" />
        <label style={lbl}>{t('login.pass')}</label>
        <input style={inp} type="password" value={pass} onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()} autoComplete="current-password" />
        <button style={{ ...btn, opacity: busy ? .6 : 1 }} disabled={busy} onClick={submit}>{busy ? '…' : t('login.btn')}</button>
        {err && <div style={{ color: '#f87171', fontSize: 13, marginTop: 12, textAlign: 'center' }}>{err}</div>}
        <div style={{ textAlign: 'center', marginTop: 18, color: '#8b94a3', fontSize: 13 }}>
          {t('login.no')} <a href="/registro" style={{ color: '#0ea5e9', textDecoration: 'none', fontWeight: 600 }}>{t('login.create')}</a>
        </div>
      </div>
    </div>
  )
}

const wrap = { minHeight: '100vh', background: 'radial-gradient(1100px 560px at 72% -12%,rgba(14,165,233,.10),transparent),#0b0d10', color: '#eef1f6', fontFamily: 'Inter,system-ui,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }
const card = { width: '100%', maxWidth: 380, background: '#13161b', border: '1px solid rgba(255,255,255,.08)', borderRadius: 18, padding: '28px 24px' }
const lbl = { display: 'block', fontSize: 12, color: '#8b94a3', margin: '12px 0 6px', fontWeight: 600 }
const inp = { width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: '#0e1116', color: '#eef1f6', fontSize: 14, boxSizing: 'border-box' }
const btn = { width: '100%', marginTop: 20, padding: 12, border: 'none', borderRadius: 11, background: 'linear-gradient(135deg,#0ea5e9,#0369a1)', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer' }
const sel = { background: '#13161b', color: '#e7ebf2', border: '1px solid rgba(255,255,255,.12)', borderRadius: 9, padding: '7px 10px', fontSize: 13, fontWeight: 600 }
