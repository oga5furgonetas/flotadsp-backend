import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2, Zap } from 'lucide-react'
import { API_BASE } from '../services/api'
import { saveSession, isAuthed, getToken, logout } from './auth'

/* Campo hecho a medida: etiqueta en microtipografía mono que se ilumina al
   enfocar, el vidrio del input se aclara, el anillo de foco emerge sin brusquedad. */
function Field({ label, type = 'text', value, onChange, onEnter, autoFocus }) {
  return (
    <label className="group block">
      <span className="mb-2 block font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-dark-500 transition-colors duration-300 group-focus-within:text-brand-400">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[15px] text-dark-50 caret-brand-400 placeholder:text-dark-600 transition-all duration-300 hover:border-white/[0.12] focus:border-brand-500/50 focus:bg-white/[0.045] focus:outline-none focus:ring-[3px] focus:ring-brand-500/15"
      />
    </label>
  )
}

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

  const year = new Date().getFullYear()

  return (
    <div className="atmosphere relative flex min-h-screen items-center justify-center overflow-hidden px-5 text-dark-50">
      {/* ── Luz que respira: la escena está viva antes de mostrar nada ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="drift absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-brand-500/[0.07] blur-[120px]" />
        <div className="drift absolute -bottom-52 right-[-10%] h-[620px] w-[620px] rounded-full bg-[rgba(120,120,140,0.06)] blur-[130px]" style={{ animationDelay: '-8s' }} />
      </div>

      <div className="relative grid w-full max-w-5xl items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">

        {/* ── Columna editorial: identidad reconocible sin logo ── */}
        <div className="hidden lg:block">
          <div className="rise flex items-center gap-3" style={{ animationDelay: '40ms' }}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/25">
              <Zap size={18} className="text-white" />
            </div>
            <span className="font-display text-[17px] font-semibold tracking-tight">FlotaDSP</span>
          </div>

          <h1 className="rise mt-10 font-display text-[clamp(38px,4.4vw,60px)] font-semibold leading-[1.02] tracking-[-0.035em] text-dark-50" style={{ animationDelay: '120ms' }}>
            Tu flota,<br />
            <span className="text-dark-400">bajo control absoluto.</span>
          </h1>

          <p className="rise mt-6 max-w-md text-[16px] leading-relaxed text-dark-400" style={{ animationDelay: '200ms' }}>
            Inspecciones con IA, vencimientos, rutas en vivo y el estado real de cada furgoneta.
            Todo en un solo instrumento.
          </p>

          <div className="rise mt-12 flex items-center gap-2.5 text-[12px] text-dark-600" style={{ animationDelay: '280ms' }}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="font-mono uppercase tracking-[0.18em]">Sistema operativo · flotadsp.com</span>
          </div>
        </div>

        {/* ── Formulario: panel flotante de vidrio ── */}
        <div className="rise mx-auto w-full max-w-[400px]" style={{ animationDelay: '160ms' }}>
          <div className="rail p-7 sm:p-9">
            {/* Marca compacta (visible sobre todo en móvil, sin columna editorial) */}
            <div className="mb-8 flex items-center gap-2.5 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/25">
                <Zap size={16} className="text-white" />
              </div>
              <span className="font-display text-[15px] font-semibold tracking-tight">FlotaDSP</span>
            </div>

            {!forgot ? (
              <div>
                <h2 className="font-display text-[22px] font-semibold tracking-tight text-dark-50">Bienvenido de nuevo</h2>
                <p className="mt-1.5 text-[13.5px] text-dark-500">Accede a tu centro de operaciones.</p>

                <div className="mt-7 space-y-5">
                  <Field label="Usuario" value={user} onChange={setUser} onEnter={submit} autoFocus />
                  <Field label="Contraseña" type="password" value={pass} onChange={setPass} onEnter={submit} />

                  {err && (
                    <p className="animate-fade-in rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3.5 py-2.5 text-[13px] text-red-300">
                      {err}
                    </p>
                  )}

                  <button
                    onClick={submit}
                    disabled={busy}
                    className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 py-3.5 text-[14.5px] font-semibold text-white shadow-lg shadow-brand-500/25 transition-all duration-300 [text-shadow:0_1px_1px_rgba(0,0,0,0.15)] hover:-translate-y-px hover:shadow-xl hover:shadow-brand-500/30 hover:brightness-110 active:translate-y-0 active:scale-[0.99] disabled:cursor-wait disabled:opacity-90"
                  >
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
                    {busy ? (
                      <><Loader2 size={17} className="animate-spin" /> Entrando…</>
                    ) : (
                      <>Entrar <ArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-0.5" /></>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setForgot(true); setFMsg(null); setErr('') }}
                    className="w-full text-center text-[12.5px] text-dark-500 transition-colors hover:text-brand-400"
                  >
                    ¿Has olvidado tu contraseña?
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="font-display text-[22px] font-semibold tracking-tight text-dark-50">Recuperar acceso</h2>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-dark-500">
                  Introduce el email vinculado a tu cuenta y te enviaremos un enlace para crear una nueva contraseña.
                </p>

                <div className="mt-7 space-y-5">
                  <Field label="Email" type="email" value={fEmail} onChange={setFEmail} onEnter={sendReset} autoFocus />

                  {fMsg && (
                    <p className={`animate-fade-in rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed ${fMsg.ok ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300' : 'border-red-500/20 bg-red-500/[0.06] text-red-300'}`}>
                      {fMsg.text}
                    </p>
                  )}

                  <button
                    onClick={sendReset}
                    disabled={fBusy}
                    className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 py-3.5 text-[14.5px] font-semibold text-white shadow-lg shadow-brand-500/25 transition-all duration-300 [text-shadow:0_1px_1px_rgba(0,0,0,0.15)] hover:-translate-y-px hover:shadow-xl hover:shadow-brand-500/30 hover:brightness-110 active:translate-y-0 active:scale-[0.99] disabled:cursor-wait disabled:opacity-90"
                  >
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
                    {fBusy ? <><Loader2 size={17} className="animate-spin" /> Enviando…</> : <>Enviar enlace <ArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-0.5" /></>}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setForgot(false); setFMsg(null) }}
                    className="w-full text-center text-[12.5px] text-dark-500 transition-colors hover:text-brand-400"
                  >
                    ← Volver al acceso
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-dark-600">
            FlotaDSP · {year}
          </p>
        </div>
      </div>
    </div>
  )
}
