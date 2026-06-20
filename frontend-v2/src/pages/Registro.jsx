import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE } from '../services/api'
import { useT, LANGS } from '../i18n'

function slugify(s) {
  return (s || '').toLowerCase().trim()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)
}

export default function Registro() {
  const { t, lang, setLang } = useT()
  const nav = useNavigate()
  const [org, setOrg] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setTouched] = useState(false)
  const [center, setCenter] = useState('')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  function onOrg(v) { setOrg(v); if (!slugTouched) setSlug(slugify(v)) }

  async function submit() {
    setErr('')
    const s = slugify(slug)
    if (!org.trim()) return setErr('—')
    if (s.length < 3 || user.trim().length < 3 || pass.length < 8) return setErr('—')
    setBusy(true)
    try {
      const r = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_name: org.trim(), username: user.trim(), password: pass, slug: s, center: center.trim() }),
      })
      const j = await r.json()
      if (!r.ok || !j.access_token) { setErr(j.detail || t('reg.taken')); setBusy(false); return }
      localStorage.setItem('flotadsp_token', j.access_token)
      localStorage.setItem('flotadsp_admin', JSON.stringify({ name: j.name, role: j.role, id: j.id, account_type: j.account_type, slug: j.slug, centers: j.centers || [] }))
      const plan = new URLSearchParams(window.location.search).get('plan')
      if (plan) localStorage.setItem('flota_plan', plan)
      window.location.href = 'https://app.flotadsp.com'
    } catch { setErr('—'); setBusy(false) }
  }

  return (
    <div style={wrap}>
      <div style={{ position: 'absolute', top: 18, right: 18 }}>
        <select value={lang} onChange={(e) => setLang(e.target.value)} style={sel}>
          {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div style={card}>
        <div style={{ fontSize: 28, textAlign: 'center' }}>⚡</div>
        <h2 style={{ margin: '6px 0 2px', textAlign: 'center', fontSize: 20 }}>{t('reg.title')}</h2>
        <p style={{ margin: '0 0 16px', textAlign: 'center', color: '#8b94a3', fontSize: 13 }}>{t('reg.sub')}</p>

        <label style={lbl}>{t('reg.company')}</label>
        <input style={inp} value={org} onChange={(e) => onOrg(e.target.value)} placeholder="Transportes Pérez SL" />

        <label style={lbl}>{t('reg.url')}</label>
        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, background: '#0e1116', overflow: 'hidden' }}>
          <span style={{ padding: '11px 2px 11px 12px', color: '#8b94a3', fontSize: 13, whiteSpace: 'nowrap' }}>flotadsp.com/</span>
          <input style={{ ...inp, border: 'none', paddingLeft: 2 }} value={slug}
            onChange={(e) => { setTouched(true); setSlug(slugify(e.target.value)) }} placeholder="transportes-perez" />
        </div>
        <div style={hint}>{t('reg.urlhint')}</div>

        <label style={lbl}>{t('reg.center')}</label>
        <input style={inp} value={center} onChange={(e) => setCenter(e.target.value)} placeholder="OGA5" />

        <label style={lbl}>{t('login.user')}</label>
        <input style={inp} value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" />

        <label style={lbl}>{t('login.pass')}</label>
        <input style={inp} type="password" value={pass} onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()} autoComplete="new-password" />

        <button style={{ ...btn, opacity: busy ? .6 : 1 }} disabled={busy} onClick={submit}>{busy ? '…' : t('reg.btn')}</button>
        {err && err !== '—' && <div style={{ color: '#f87171', fontSize: 13, marginTop: 12, textAlign: 'center' }}>{err}</div>}
        <div style={{ textAlign: 'center', marginTop: 16, color: '#8b94a3', fontSize: 13 }}>
          {t('reg.have')} <a href="/login" style={{ color: '#0ea5e9', textDecoration: 'none', fontWeight: 600 }}>{t('login.btn')}</a>
        </div>
      </div>
    </div>
  )
}

const wrap = { minHeight: '100vh', background: 'radial-gradient(1100px 560px at 72% -12%,rgba(14,165,233,.10),transparent),#0b0d10', color: '#eef1f6', fontFamily: 'Inter,system-ui,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }
const card = { width: '100%', maxWidth: 420, background: '#13161b', border: '1px solid rgba(255,255,255,.08)', borderRadius: 18, padding: '26px 24px' }
const lbl = { display: 'block', fontSize: 12, color: '#8b94a3', margin: '12px 0 6px', fontWeight: 600 }
const inp = { width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: '#0e1116', color: '#eef1f6', fontSize: 14, boxSizing: 'border-box' }
const hint = { fontSize: 11, color: '#8b94a3', marginTop: 5 }
const btn = { width: '100%', marginTop: 20, padding: 12, border: 'none', borderRadius: 11, background: 'linear-gradient(135deg,#0ea5e9,#0369a1)', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer' }
const sel = { background: '#13161b', color: '#e7ebf2', border: '1px solid rgba(255,255,255,.12)', borderRadius: 9, padding: '7px 10px', fontSize: 13, fontWeight: 600 }
