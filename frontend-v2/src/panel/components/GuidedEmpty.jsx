import { Link } from 'react-router-dom'

/* Estado vacío que GUÍA: en vez de una pantalla muda, dice el siguiente paso.
   Clave para que un DSP recién registrado no se pierda (conversión trial→pago). */
export default function GuidedEmpty({ emoji = '📦', title, hint, actionLabel, to, onAction, secondary }) {
  return (
    <div className="card animate-fade-in flex flex-col items-center gap-3 p-12 text-center">
      <span className="text-4xl">{emoji}</span>
      <h3 className="text-base font-bold text-dark-100">{title}</h3>
      {hint && <p className="max-w-md text-sm leading-relaxed text-dark-500">{hint}</p>}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {to && <Link to={to} className="btn-primary">{actionLabel}</Link>}
        {!to && onAction && <button onClick={onAction} className="btn-primary">{actionLabel}</button>}
        {secondary && (
          <Link to={secondary.to} className="btn-secondary">{secondary.label}</Link>
        )}
      </div>
    </div>
  )
}
