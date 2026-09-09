import { Shirt, ChevronRight } from 'lucide-react'

/* EL CARTEL DE LA ROPA — el mismo en las dos páginas públicas.
   ══════════════════════════════════════════════════════════════════════════
   Se anuncia en la lista de ofertas y al terminar una candidatura, y tiene que
   ser EL MISMO cartel: dos versiones a mano acaban con precios distintos en
   cada sitio, y un precio que no cuadra con el de la tienda es peor que no
   anunciarla.

   LLEVA EL PRECIO DELANTE. La versión anterior decía «ver la colección» y nada
   más: sin precio, quien lo lee no sabe si esto cuesta 20 € o 200, y con esa
   duda no lo abre nadie. El «desde» sale del backend —el precio más bajo de lo
   que hay publicado, sin recargo de talla— así que bajar un precio en el panel
   lo cambia aquí solo, sin tocar esta pantalla.

   Y NO SE PINTA NADA si el backend no manda enlace: la tienda se cierra desde
   el panel y el anuncio desaparece de todos los sitios a la vez. La decisión
   vive allí, no repartida por cada página. */

const euros = (v) => (typeof v === 'number' && v > 0
  ? `${v.toFixed(2).replace('.', ',')} €` : '')

export default function RopaCartel({ url, desde, prendas = 0, titulo = 'La ropa del equipo' }) {
  if (!url) return null
  const precio = euros(desde)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-2xl bg-slate-900 text-left ring-1 ring-slate-900 transition hover:bg-slate-800"
    >
      <div className="flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-500">
          <Shirt size={22} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-400">
            Tienda
          </div>
          <p className="mt-0.5 text-[17px] font-bold leading-snug text-white">{titulo}</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-slate-300">
            Sudadera, cortavientos y gorra con el escudo de Galicia.
            {precio && <> Desde <b className="text-white">{precio}</b>.</>}
            {prendas > 0 && !precio && <> {prendas} modelos.</>}
          </p>
        </div>
        <ChevronRight size={20} className="hidden shrink-0 text-slate-500 transition group-hover:text-white sm:block" />
      </div>
      <div className="flex items-center justify-center gap-1.5 bg-orange-500 py-2.5 text-[13.5px] font-semibold text-white">
        Verla <ChevronRight size={15} />
      </div>
    </a>
  )
}
