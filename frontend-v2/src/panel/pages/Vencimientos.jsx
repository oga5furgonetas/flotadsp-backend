import { lazy, Suspense, useState } from 'react'
import { CalendarClock, Loader2 } from 'lucide-react'
import { useT } from '../../i18n'
import { canSee } from '../auth'

// Fusión de las 3 pantallas de vencimientos en una sola con pestañas.
// Las páginas originales se reutilizan intactas (cero regresión); sus rutas
// antiguas siguen funcionando para deep-links y la paleta ⌘K.
// El calendario va PRIMERO: es la vista que evita entrar furgoneta por
// furgoneta, que era justo el problema. Las listas siguen detrás para el
// detalle.
const CalendarioFlota = lazy(() => import('./CalendarioFlota'))
const AvisosITV = lazy(() => import('./AvisosITV'))
const Renting = lazy(() => import('./Renting'))
const CasasAlquiler = lazy(() => import('./CasasAlquiler'))
// Un mantenimiento vencido es un vencimiento como la ITV, solo que medido en
// km en vez de en días: entra aquí y no como una entrada más en la barra
// lateral, que ya tiene de sobra.
const Mantenimiento = lazy(() => import('./Mantenimiento'))

export default function Vencimientos() {
  const { t } = useT()
  const tabs = [
    canSee('avisos-itv') && { k: 'cal', label: t('cal.tab'), C: CalendarioFlota },
    canSee('avisos-itv') && { k: 'itv', label: t('nav.itvalerts'), C: AvisosITV },
    // Mismo permiso que los avisos de ITV: quien vigila vencimientos de flota
    // es quien tiene que ver los cambios que vencen.
    canSee('avisos-itv') && { k: 'mant', label: t('mant.tab'), C: Mantenimiento },
    canSee('renting') && { k: 'renting', label: t('nav.renting'), C: Renting },
    canSee('casas-alquiler') && { k: 'casas', label: t('nav.rental'), C: CasasAlquiler },
  ].filter(Boolean)
  const [tab, setTab] = useState(tabs[0]?.k)
  const active = tabs.find((x) => x.k === tab) || tabs[0]

  if (!tabs.length) return null

  return (
    <div>
      <div className="rise mb-6 flex flex-wrap items-end gap-4">
        <h1 className="font-display text-[clamp(28px,3.4vw,42px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">
          {t('nav.grp.expiry')}
        </h1>
        <div className="flex gap-1 rounded-lg bg-dark-900 p-1 ring-1 ring-dark-700">
          {tabs.map((x) => (
            <button
              key={x.k}
              onClick={() => setTab(x.k)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === x.k ? 'bg-brand-500/20 text-brand-300' : 'text-dark-400 hover:text-dark-200'
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <Suspense fallback={<div className="flex items-center gap-2 py-10 text-dark-400"><Loader2 size={16} className="animate-spin" /> …</div>}>
        {active && <active.C />}
      </Suspense>
    </div>
  )
}
