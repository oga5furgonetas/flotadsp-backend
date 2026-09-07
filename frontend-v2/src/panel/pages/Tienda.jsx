import TiendaRopa from '../components/TiendaRopa'

/* ────────────────────────────────────────────────────────────────────────────
   TIENDA — su propia pantalla, no un cajón dentro del Perfil
   ---------------------------------------------------------------------------
   Estaba metida en Perfil junto al cambio de contraseña, y ahí no la
   encontraba nadie: el Perfil se abre dos veces al año. Esto es un negocio
   aparte —catálogo, pedidos, dinero— y necesita su entrada en el menú como
   cualquier otra parte de la operación.

   La pantalla es sólo el marco: todo el contenido vive en `TiendaRopa`, que
   se puede seguir montando en cualquier sitio sin duplicar nada.
   ──────────────────────────────────────────────────────────────────────────── */

export default function Tienda() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">Tienda</h1>
        <p className="mt-0.5 text-sm text-dark-400">
          La ropa que le vendes a tu gente y a otros DSP: qué falta para poder
          venderla, tus prendas y los pedidos de cada tanda.
        </p>
      </div>
      <TiendaRopa />
    </div>
  )
}
