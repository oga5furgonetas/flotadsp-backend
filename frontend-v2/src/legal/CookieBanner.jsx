import { useEffect, useState } from 'react'
import { Cookie, X } from 'lucide-react'
import { Link } from 'react-router-dom'

// Banner informativo (solo usamos almacenamiento estrictamente necesario).
// Cumple con la guía AEPD: informar + permitir cerrar.
export default function CookieBanner() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    try { if (!localStorage.getItem('cookie_consent')) setShow(true) } catch {}
  }, [])
  function accept() {
    try { localStorage.setItem('cookie_consent', JSON.stringify({ v: 1, at: new Date().toISOString() })) } catch {}
    setShow(false)
  }
  if (!show) return null
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-xl border border-dark-700 bg-dark-900/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start gap-3">
        <Cookie size={20} className="mt-0.5 shrink-0 text-amber-400" />
        <div className="flex-1 text-sm text-dark-300">
          <b className="text-dark-100">Cookies necesarias.</b> Usamos solo almacenamiento imprescindible para iniciar sesión y recordar tus preferencias. No usamos cookies de seguimiento ni marketing.
          {' '}<Link to="/cookies" className="text-sky-400 hover:underline">Más información</Link>.
        </div>
        <button onClick={accept} className="btn-primary px-3 py-1.5 text-sm">Entendido</button>
        <button onClick={accept} className="btn-ghost p-1.5 text-dark-400" aria-label="Cerrar"><X size={16} /></button>
      </div>
    </div>
  )
}
