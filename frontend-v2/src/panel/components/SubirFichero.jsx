import { useRef, useState } from 'react'
import { Loader2, UploadCloud } from 'lucide-react'

/* Zona para soltar un fichero. Se arrastra o se pulsa; nada más. */
export default function SubirFichero({ onFile, ocupado, titulo = 'Arrastra tu Excel o CSV', pie = '.xlsx · .xls · .csv', accept = '.xlsx,.xls,.csv' }) {
  const ref = useRef(null)
  const [encima, setEncima] = useState(false)

  const elegir = (f) => {
    if (f && !ocupado) onFile(f)
    if (ref.current) ref.current.value = ''
  }

  return (
    <button type="button" disabled={ocupado}
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setEncima(true) }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => { e.preventDefault(); setEncima(false); elegir(e.dataTransfer.files?.[0]) }}
      className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition ${
        encima ? 'border-brand-400 bg-brand-500/[0.07]' : 'border-dark-700 hover:border-dark-500 hover:bg-white/[0.02]'
      } disabled:cursor-wait`}>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => elegir(e.target.files?.[0])} />
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500/10 text-brand-300">
        {ocupado ? <Loader2 size={20} className="animate-spin" /> : <UploadCloud size={20} />}
      </span>
      <span className="text-[14px] font-semibold text-dark-100">{ocupado ? 'Leyendo…' : titulo}</span>
      <span className="text-[12px] text-dark-500">o pulsa para elegirlo · {pie}</span>
    </button>
  )
}
