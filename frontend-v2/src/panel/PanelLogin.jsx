import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, LogIn, Zap } from 'lucide-react'
import { API_BASE } from '../services/api'
import { saveSession, isAuthed } from './auth'

export default function PanelLogin() {
  const nav = useNavigate()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (isAuthed()) {
    nav('/panel', { replace: true })
  }

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
        </div>
      </div>
    </div>
  )
}
