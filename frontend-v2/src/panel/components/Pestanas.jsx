import { useSearchParams } from 'react-router-dom'

/* Pestañas de una pantalla, con la elegida en la URL (?t=) para que un enlace
   o el botón de atrás lleven a la misma. `pestanas` = [{ id, label, icono?,
   marca? }]; `marca` es un nodo pequeño a la derecha (un ✓, un contador). */
export function usePestana(pestanas, porDefecto) {
  const [params, setParams] = useSearchParams()
  const pedida = params.get('t')
  const activa = pestanas.some((p) => p.id === pedida) ? pedida : (porDefecto || pestanas[0]?.id)
  const elegir = (id) => {
    const sig = new URLSearchParams(params)
    sig.set('t', id)
    setParams(sig, { replace: true })
  }
  return [activa, elegir]
}

export default function Pestanas({ pestanas, activa, onElegir, etiqueta, className = '' }) {
  return (
    <nav role="tablist" aria-label={etiqueta}
      className={`flex gap-1 overflow-x-auto border-b border-dark-800 ${className}`}>
      {pestanas.map((p) => {
        const Icono = p.icono
        const sel = activa === p.id
        return (
          <button key={p.id} type="button" role="tab" aria-selected={sel}
            onClick={() => onElegir(p.id)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition ${
              sel ? 'border-brand-400 text-dark-50' : 'border-transparent text-dark-500 hover:text-dark-200'}`}>
            {Icono && <Icono size={15} />}
            {p.label}
            {p.marca}
          </button>
        )
      })}
    </nav>
  )
}
