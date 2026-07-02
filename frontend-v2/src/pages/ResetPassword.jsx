import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { API_BASE } from '../services/api'
import { useT } from '../i18n'

/* Recuperación de contraseña.
   Sin ?token=  → formulario para pedir el enlace por email.
   Con ?token=  → formulario para fijar la contraseña nueva. */
export default function ResetPassword() {
  const { t } = useT()
  const [params] = useSearchParams()
  const token = params.get('token') || ''

  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  async function requestLink() {
    if (!email.trim()) return
    setBusy(true); setErr('')
    try {
      await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      setDone(true)
    } catch { setErr(t('reset.err')) }
    setBusy(false)
  }

  async function saveNewPassword() {
    if (pass.length < 6) return setErr(t('reset.min'))
    if (pass !== pass2) return setErr(t('reset.mismatch'))
    setBusy(true); setErr('')
    try {
      const r = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: pass }),
      })
      const j = await r.json()
      if (!r.ok) { setErr(j?.detail || t('reset.err')); setBusy(false); return }
      setDone(true)
    } catch { setErr(t('reset.err')) }
    setBusy(false)
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ fontSize: 30, textAlign: 'center', marginBottom: 6 }}>🔑</div>
        <h2 style={{ margin: '0 0 20px', textAlign: 'center', fontSize: 20 }}>
          {token ? t('reset.title.new') : t('reset.title')}
        </h2>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#34d399', fontSize: 14, lineHeight: 1.6 }}>
              {token ? t('reset.done') : t('reset.sent')}
            </p>
            <Link to="/login" style={{ ...btn, display: 'block', textDecoration: 'none', textAlign: 'center', boxSizing: 'border-box' }}>
              {t('reset.back')}
            </Link>
          </div>
        ) : token ? (
          <>
            <label style={lbl}>{t('reset.new.pass')}</label>
            <input style={inp} type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" autoFocus />
            <label style={lbl}>{t('reset.new.pass2')}</label>
            <input style={inp} type="password" value={pass2} onChange={(e) => setPass2(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveNewPassword()} autoComplete="new-password" />
            <button style={{ ...btn, opacity: busy ? .6 : 1 }} disabled={busy} onClick={saveNewPassword}>
              {busy ? '…' : t('reset.save')}
            </button>
          </>
        ) : (
          <>
            <p style={{ color: '#8b94a3', fontSize: 13, lineHeight: 1.6, margin: '0 0 4px' }}>{t('reset.hint')}</p>
            <label style={lbl}>{t('reset.email.label')}</label>
            <input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && requestLink()} autoComplete="email" autoFocus />
            <button style={{ ...btn, opacity: busy ? .6 : 1 }} disabled={busy} onClick={requestLink}>
              {busy ? '…' : t('reset.send')}
            </button>
          </>
        )}

        {err && <div style={{ color: '#f87171', fontSize: 13, marginTop: 12, textAlign: 'center' }}>{err}</div>}
        {!done && (
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <Link to="/login" style={{ color: '#8b94a3', fontSize: 13, textDecoration: 'none' }}>← {t('reset.back')}</Link>
          </div>
        )}
      </div>
    </div>
  )
}

const wrap = { minHeight: '100vh', background: 'radial-gradient(1100px 560px at 72% -12%,rgba(14,165,233,.10),transparent),#0b0d10', color: '#eef1f6', fontFamily: 'Inter,system-ui,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }
const card = { width: '100%', maxWidth: 380, background: '#13161b', border: '1px solid rgba(255,255,255,.08)', borderRadius: 18, padding: '28px 24px' }
const lbl = { display: 'block', fontSize: 12, color: '#8b94a3', margin: '12px 0 6px', fontWeight: 600 }
const inp = { width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: '#0e1116', color: '#eef1f6', fontSize: 14, boxSizing: 'border-box' }
const btn = { width: '100%', marginTop: 20, padding: 12, border: 'none', borderRadius: 11, background: 'linear-gradient(135deg,#0ea5e9,#0369a1)', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer' }
