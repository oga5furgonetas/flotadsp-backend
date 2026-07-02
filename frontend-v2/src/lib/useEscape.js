import { useEffect } from 'react'

/* Cierra un modal con la tecla Escape. Uso: useEscape(onClose) */
export function useEscape(onClose) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
}
