import { createContext, useCallback, useContext, useState } from 'react'

const ToastContext = createContext(null)

let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const push = useCallback((type, text, ms = 3500) => {
    const id = nextId++
    setToasts((t) => [...t, { id, type, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms)
  }, [])

  const toast = {
    success: (t) => push('success', t),
    error: (t) => push('error', t, 5000),
    info: (t) => push('info', t),
    warning: (t) => push('warning', t),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[9999] flex flex-col items-center gap-2 px-4"
           style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur-md animate-fadeIn ${
              t.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-950/90 text-emerald-300'
                : t.type === 'error'
                  ? 'border-red-500/30 bg-red-950/90 text-red-300'
                  : t.type === 'warning'
                    ? 'border-amber-500/30 bg-amber-950/90 text-amber-300'
                    : 'border-dark-700 bg-dark-800/95 text-dark-100'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
