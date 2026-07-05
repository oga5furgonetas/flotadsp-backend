import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, LogIn, Zap } from 'lucide-react'
import { API_BASE } from '../services/api'
import { saveSession, isAuthed, getToken, logout } from './auth'

export default function PanelLogin() {
  const nav = useNavigate()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)   // vista "recuperar contraseña"
  const [fEmail, setFEmail] = useState('')
  const [fMsg, setFMsg] = useState(null)
  const [fBusy, setFBusy] = useState(false)

  async function sendReset() {
    if (!fEmail.trim()) return setFMsg({ ok: false, text: 'Introduce tu email' })
    setFBusy(true); setFMsg(null)
    try {
      await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fEmail.trim() }),
      })
      // Respuesta genérica siempre (no revelamos si el email existe).
      setFMsg({ ok: true, text: 'Si ese email está vinculado a una cuenta, te hemos enviado un enlace para restablecer la contraseña. Revisa tu bandeja (y spam).' })
    } catch {
      setFMsg({ ok: false, text: 'No se pudo conectar. Inténtalo de nuevo.' })
    } finally { setFBusy(false) }
  }

  // Sesión guardada: solo auto-entrar si el servidor confirma que sigue siendo
  // válida (usuarios borrados/revocados quedaban entrando con el token viejo).
  useEffect(() => {
    if (!isAuthed()) return
    const ctrl = new AbortController()
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${getToken()}` },
      signal: ctrl.signal,
    })
      .then((r) => {
        if (r.ok) nav('/panel', { replace: true })
        else logout()
      })
      .catch(() => {}) // sin red: se queda en el login, sin auto-entrar a ciegas
    return () => ctrl.abort()
  }, [nav])

  async function submit() {
    if (!user || !pass) return setErr('Introduce usuario y contraseña')
    setBusy(true)
    setErr('')
    try {
      const r = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.trim(), password: pass }),
      })
      const j = await r.json()
      if (!r.ok || !j.access_token) {
        setErr(j.detail || 'Usuario o contraseña incorrectos')
        setBusy(false)
        return
      }
      saveSession(j)
      nav('/panel', { replace: true })
    } catch {
      setErr('No se pudo conectar. Inténtalo de nuevo.')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-950 p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600">
            <Zap size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-dark-50">FlotaDSP</h1>
          <p className="mt-1 text-sm text-dark-400">Panel de administración</p>
        </div>

        {!forgot ? (
          <div className="space-y-4">
            <div>
              <label className="label">Usuario</label>
              <input
                className="input"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input
                type="password"
                className="input"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </div>
            {err && <p className="text-sm text-red-400">{err}</p>}
            <button
              onClick={submit}
              disabled={busy}
              className="btn-primary flex w-full items-center justify-center gap-2 py-2.5"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Entrar
            </button>
            <button
              type="button"
              onClick={() => { setForgot(true); setFMsg(null); setErr('') }}
              className="w-full text-center text-xs text-dark-400 hover:text-brand-400"
            >
              ¿Has olvidado tu contraseña?
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-dark-300">Introduce el email vinculado a tu cuenta y te enviaremos un enlace para crear una nueva contraseña.</p>
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={fEmail}
                onChange={(e) => setFEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendReset()}
                autoFocus
              />
            </div>
            {fMsg && <p className={`text-sm ${fMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{fMsg.text}</p>}
            <button
              onClick={sendReset}
              disabled={fBusy}
              className="btn-primary flex w-full items-center justify-center gap-2 py-2.5"
            >
              {fBusy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Enviar enlace
            </button>
            <button
              type="button"
              onClick={() => { setForgot(false); setFMsg(null) }}
              className="w-full text-center text-xs text-dark-400 hover:text-brand-400"
            >
              ← Volver al acceso
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
