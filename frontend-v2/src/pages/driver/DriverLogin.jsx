import { useEffect, useState } from 'react'
import { Loader2, LogIn, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { getConductorList, getDriverToken, currentSlug } from '../../services/api'
import { api } from '../../services/api'
import { useToast } from '../../lib/toast'

export default function DriverLogin({ onLogin }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [step, setStep] = useState('email') // 'email' | 'password'
  const [currentDriver, setCurrentDriver] = useState(null)
  const [busy, setBusy] = useState(false)
  const [drivers, setDrivers] = useState([])
  const [orgName] = useState('')
  const [centers, setCenters] = useState([])
  const [center, setCenter] = useState('')

  const urlCenter = (new URLSearchParams(window.location.search).get('c') || '').toUpperCase()

  useEffect(() => {
    if (urlCenter) setCenter(urlCenter)
    getConductorList()
      .then((r) => {
        const list = r.data || []
        setDrivers(list)
        const uniq = [...new Set(list.map((d) => d.center).filter(Boolean))].sort()
        setCenters(uniq)
      })
      .catch(() => setDrivers([]))
    // org name intencionalmente no se muestra (privacidad)
  }, [])

  const handleEmailSubmit = async () => {
    if (!email) return toast.warning('Introduce tu email')
    setBusy(true)
    const driver = drivers.find((d) => d.email?.toLowerCase() === email.trim().toLowerCase())
    if (!driver) {
      toast.error('Email no encontrado. Contacta con tu administrador.')
      setBusy(false)
      return
    }
    // Si el conductor tiene cuenta con contraseña, pasar al paso de contraseña
    if (driver.has_account) {
      setCurrentDriver(driver)
      setStep('password')
      setBusy(false)
      return
    }
    // Sin contraseña: login directo
    try {
      const r = await getDriverToken(driver.id)
      if (r.data?.access_token) localStorage.setItem('flotadsp_token', r.data.access_token)
      onLogin({ ...driver, center: r.data?.center || driver.center })
      toast.success(`Bienvenido, ${driver.name}`)
    } catch {
      toast.error('No se pudo iniciar sesión. Inténtalo de nuevo.')
    }
    setBusy(false)
  }

  const handlePasswordSubmit = async () => {
    if (!password) return toast.warning('Introduce tu contraseña')
    setBusy(true)
    try {
      const r = await api.post('/auth/driver-login', { email: email.trim(), password })
      if (r.data?.access_token) localStorage.setItem('flotadsp_token', r.data.access_token)
      onLogin({
        ...currentDriver,
        name: r.data?.name || currentDriver.name,
        center: r.data?.center || currentDriver.center,
      })
      toast.success(`Bienvenido, ${r.data?.name || currentDriver.name}`)
    } catch (ex) {
      const msg = ex?.response?.data?.detail || 'Contraseña incorrecta.'
      toast.error(msg)
    }
    setBusy(false)
  }

  const displayCenter = urlCenter || center

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-dark-950 px-4"
         style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>

      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-brand-500/8 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-xl shadow-brand-500/30">
            <svg viewBox="0 0 24 24" className="h-8 w-8 fill-white" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-dark-50">Portal Conductor</h1>
          <p className="mt-1 text-sm text-dark-400">{orgName || 'FlotaDSP'}</p>
          {displayCenter && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-400">
              Estación {displayCenter}
            </span>
          )}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-dark-800 bg-dark-900/80 p-6 shadow-2xl shadow-black/50 backdrop-blur-sm">

          {/* Paso 1: email */}
          {step === 'email' && (
            <div className="space-y-4">
              {centers.length > 0 && !urlCenter && (
                <div>
                  <label className="label">Tu estación</label>
                  <select className="select" value={center} onChange={(e) => setCenter(e.target.value)}>
                    <option value="">Todas las estaciones</option>
                    {centers.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="label">Email profesional</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
                  placeholder="tu.email@empresa.com"
                  autoFocus
                  autoComplete="email"
                />
              </div>

              <button
                onClick={handleEmailSubmit}
                disabled={busy || !email}
                className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base"
              >
                {busy
                  ? <><Loader2 size={16} className="animate-spin" /> Verificando…</>
                  : <><LogIn size={16} /> Continuar</>}
              </button>
            </div>
          )}

          {/* Paso 2: contraseña */}
          {step === 'password' && (
            <div className="space-y-4">
              {/* Info del conductor */}
              <div className="rounded-xl bg-dark-800/60 px-4 py-3 flex items-center gap-3">
                <Lock size={16} className="text-brand-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-dark-100">{currentDriver?.name}</div>
                  <div className="text-xs text-dark-500">{email}</div>
                </div>
              </div>

              <div>
                <label className="label">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                    placeholder="Tu contraseña"
                    autoFocus
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                onClick={handlePasswordSubmit}
                disabled={busy || !password}
                className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base"
              >
                {busy
                  ? <><Loader2 size={16} className="animate-spin" /> Verificando…</>
                  : <><LogIn size={16} /> Acceder</>}
              </button>

              <button
                type="button"
                onClick={() => { setStep('email'); setPassword(''); setCurrentDriver(null) }}
                className="flex w-full items-center justify-center gap-1.5 text-xs text-dark-500 hover:text-dark-300 transition-colors"
              >
                <ArrowLeft size={12} /> Cambiar email
              </button>
            </div>
          )}

          <div className="mt-5 rounded-xl border border-dark-800 bg-dark-950/60 p-3 text-center text-xs text-dark-500">
            Acceso exclusivo para conductores registrados.
            <br />Si tienes problemas, contacta con tu responsable de flota.
          </div>
        </div>

        <div className="mt-6 text-center">
          <a href="/login" className="text-xs text-dark-600 hover:text-dark-400 transition">
            ¿Eres administrador? → Panel de gestión
          </a>
        </div>
      </div>
    </div>
  )
}
