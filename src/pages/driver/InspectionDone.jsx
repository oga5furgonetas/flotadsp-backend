import { CheckCircle2 } from 'lucide-react'

export default function InspectionDone({ result, onNew, onLogout }) {
  const analysis = result?.analysis
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-950 p-4">
      <div className="card w-full max-w-sm animate-fadeIn p-8 text-center">
        <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-400" />
        <h2 className="mb-2 text-xl font-bold text-dark-50">Inspección completada</h2>
        <p className="mb-1 text-sm text-dark-400">
          {analysis ? 'El análisis IA ha sido procesado' : 'El análisis IA se está procesando'}
        </p>

        {analysis && (
          <div className="card mt-4 space-y-1 p-3 text-left text-sm">
            <div className="flex justify-between">
              <span className="text-dark-400">Severidad</span>
              <span className={`font-medium ${
                analysis.severity === 'grave' || analysis.severity === 'critico'
                  ? 'text-red-400'
                  : analysis.severity === 'moderado' ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {analysis.severity}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-400">Daños</span>
              <span className="text-dark-100">{analysis.total_damages_count}</span>
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button onClick={onNew} className="btn-primary flex-1">Nueva inspección</button>
          <button onClick={onLogout} className="btn-secondary">Salir</button>
        </div>
      </div>
    </div>
  )
}
