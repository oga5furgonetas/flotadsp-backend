import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { X, Shield, Users } from 'lucide-react'

/* EL MENÚ DEL MÓVIL — el mismo de escritorio, no una tira de pastillas.
   ═══════════════════════════════════════════════════════════════════════
   Hasta el 02-09-2026, en el móvil las 40 pantallas salían en una fila
   horizontal de pastillas, sin grupos y sin orden visible: para llegar a
   «Órdenes de taller» había que barrer a ciegas media pantalla. Con el panel
   abierto en el móvil eso es lo que se hace CIEN veces al día, y era lo más
   atrasado que teníamos.

   Aquí sale lo mismo que en el escritorio —los grupos ya filtrados por
   permisos, con sus iconos y sus avisos— en una hoja que sube desde abajo:
   se llega a cualquier pantalla en dos toques y se ve DÓNDE está cada cosa.

   Detalles que se notan con una mano y de pie:
   · filas de 48 px (el dedo falla por debajo de 44),
   · se cierra al elegir, al tocar fuera y con Escape,
   · respeta la zona segura de los iPhone con notch,
   · la pantalla en la que estás sale marcada, para no perder el sitio. */
export default function MenuMovil({ abierto, cerrar, groups, showAdmin, cm, t }) {
  useEffect(() => {
    if (!abierto) return
    const esc = (e) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('keydown', esc)
    // El fondo no se mueve mientras la hoja está abierta: en iOS, sin esto, el
    // dedo arrastra la página de detrás y se pierde el sitio al cerrar.
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = antes }
  }, [abierto, cerrar])

  if (!abierto) return null

  const fila = ({ isActive }) =>
    `flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-[14px] ${
      isActive ? 'bg-brand-500/20 font-semibold text-brand-300' : 'text-dark-200 active:bg-dark-800'}`

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
      <button className="absolute inset-0 bg-black/70" onClick={cerrar} aria-label={t('common.close')} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-3xl border-t border-dark-700 bg-dark-900 shadow-2xl">
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <span className="mx-auto h-1 w-10 rounded-full bg-dark-600" />
        </div>
        <div className="flex items-center justify-between border-b border-dark-800 px-4 pb-3">
          <h2 className="text-[15px] font-bold text-dark-50">{t('nav.menu')}</h2>
          <button onClick={cerrar} className="rounded-lg p-2 text-dark-400 active:bg-dark-800" aria-label={t('common.close')}>
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          {groups.map((g) => (
            <div key={g.key} className="mb-3">
              <div className="flex items-center gap-2 px-3 pb-1 pt-2">
                {g.gIcon && <g.gIcon size={13} className={g.iconCls} />}
                <span className="text-[11px] font-semibold uppercase tracking-wider text-dark-500">{g.g}</span>
              </div>
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} onClick={cerrar} className={fila}>
                  <it.icon size={17} className="shrink-0 text-dark-400" />
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.aviso > 0 && (
                    <span className="min-w-[20px] rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[11px] font-bold leading-tight text-white">
                      {it.aviso > 99 ? '99+' : it.aviso}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}

          {(showAdmin || cm) && (
            <div className="mb-3 border-t border-dark-800 pt-2">
              {showAdmin && (
                <NavLink to="/panel/admin" onClick={cerrar} className={fila}>
                  <Shield size={17} className="shrink-0 text-dark-400" /> {t('nav.business')}
                </NavLink>
              )}
              <NavLink to="/panel/usuarios" onClick={cerrar} className={fila}>
                <Users size={17} className="shrink-0 text-dark-400" /> {t('nav.users')}
              </NavLink>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
