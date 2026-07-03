/* Skeletons de carga — sensación de velocidad y estructura antes de tener datos. */

export function Skeleton({ className = '' }) {
  return <div className={`shimmer rounded-lg ${className}`} />
}

/* Grid de KPIs + tabla: el patrón de la mayoría de páginas del panel */
export function PageSkeleton({ kpis = 4, rows = 8 }) {
  return (
    <div className="animate-fade-in">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: kpis }).map((_, i) => (
          <div key={i} className="card p-4">
            <Skeleton className="mb-2 h-7 w-14" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="card p-4">
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
