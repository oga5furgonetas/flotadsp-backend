import { useEffect, useState } from 'react'
import { Loader2, LogIn, Truck } from 'lucide-react'
import { getConductorList, getDriverToken } from '../../services/api'
import { useToast } from '../../lib/toast'

const CENTERS = ['OGA5', 'DGA1', 'DGA2']

export default function DriverLogin({ onLogin }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [drivers, setDrivers] = useState([])
  const [center, setCenter] = useState('OGA5')

  useEffect(() => {
    getConductorList()
      .then((r) => setDrivers(r.data || []))
      .catch(() => setDrivers([]))
  }, [])

  const handleLogin = async () => {
    if (!email) return toast.warning('Introduce tu email')
    setBusy(true)
    const driver = drivers.find(
      (d) => d.email?.toLowerCase() === email.trim().toLowerCase(),
    )
    if (!driver) {
      toast.error('Email no encontrado. Contacta con tu administrador.')
      setBusy(false)
      return
    }
    try {
      const r = await getDriverToken(driver.id)
      if (r.data?.access_token) {
        localStorage.setItem('flotadsp_token', r.data.access_token)
      }
      onLogin({ ...driver, center: r.data?.center || driver.center })
      toast.success(`Bienvenido, ${driver.name}`)
    } catch {
      toast.error('No se pudo iniciar sesión. Inténtalo de nuevo.')
    }
    setBusy(false)
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-dark-950 p-4"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/3 top-1/3 h-72 w-72 rounded-full bg-brand-500/5 blur-3xl" />
      </div>

      <div className="card relative w-full max-w-sm animate-fadeIn p-6">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500">
            <Truck size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-dark-50">Portal Conductor</h1>
          <p className="mt-1 text-sm text-dark-400">FlotaDSP</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Centro</label>
            <select className="select" value={center} onChange={(e) => setCenter(e.target.value)}>
              {CENTERS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Email asignado</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="tu.email@empresa.com"
              autoFocus
            />
          </div>
          <button
            onClick={handleLogin}
            disabled={busy}
            className="btn-primary flex w-full items-center justify-center gap-2 py-2.5"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Acceder
          </button>
        </div>

        <div className="mt-4 border-t border-dark-800 pt-3 text-center">
          <a href="/login" className="text-xs text-dark-500 hover:text-dark-300">
            ¿Admin? Ir al panel →
          </a>
        </div>
      </div>
    </div>
  )
}
