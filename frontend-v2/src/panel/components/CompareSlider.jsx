import { useRef, useState } from 'react'

/* Comparador antes/después con divisor arrastrable.
   Base = foto de REFERENCIA (estado anterior); superpuesta y recortada por la
   izquierda = foto ACTUAL. Arrastra el divisor para revelar el cambio. */
export default function CompareSlider({ beforeUrl, afterUrl }) {
  const [pos, setPos] = useState(50)
  const boxRef = useRef(null)

  function move(clientX) {
    const r = boxRef.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    setPos(Math.max(2, Math.min(98, ((clientX - r.left) / r.width) * 100)))
  }

  return (
    <div
      ref={boxRef}
      className="relative select-none overflow-hidden"
      onMouseDown={(e) => move(e.clientX)}
      onMouseMove={(e) => e.buttons === 1 && move(e.clientX)}
      onTouchStart={(e) => move(e.touches[0].clientX)}
      onTouchMove={(e) => move(e.touches[0].clientX)}
    >
      <img src={beforeUrl} alt="Referencia (antes)" className="block w-full" draggable={false} />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={afterUrl} alt="Actual (ahora)" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      </div>

      {/* Divisor */}
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="h-full w-0.5 bg-white/90 shadow-[0_0_10px_rgba(0,0,0,.9)]" />
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-2 py-1 text-[11px] font-black text-black shadow-lg">
          ⇄
        </div>
      </div>

      <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/75 px-2 py-0.5 text-[10px] font-bold text-orange-300">
        AHORA
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/75 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
        ANTES (referencia)
      </span>
    </div>
  )
}
