import { Check } from 'lucide-react'

/* Dónde estás: Subir → Revisar → Listo. */
export default function Pasos({ actual, pasos = ['Subir', 'Revisar', 'Listo'] }) {
  return (
    <ol className="flex items-center gap-2 text-[12px]" aria-label="Progreso">
      {pasos.map((p, i) => {
        const hecho = i < actual
        const aqui = i === actual
        return (
          <li key={p} className="flex items-center gap-2">
            <span aria-current={aqui ? 'step' : undefined}
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10.5px] font-semibold ${
                hecho ? 'bg-emerald-500/20 text-emerald-300'
                  : aqui ? 'bg-brand-500/20 text-brand-200 ring-1 ring-brand-400/50'
                    : 'bg-white/[0.05] text-dark-500'}`}>
              {hecho ? <Check size={11} /> : i + 1}
            </span>
            <span className={aqui ? 'font-semibold text-dark-100' : 'text-dark-500'}>{p}</span>
            {i < pasos.length - 1 && <span className="h-px w-6 bg-dark-700" />}
          </li>
        )
      })}
    </ol>
  )
}
