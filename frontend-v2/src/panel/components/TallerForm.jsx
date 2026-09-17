import { useState } from 'react'
import { Loader2, X, MapPin } from 'lucide-react'
import { crearTaller, editarTaller } from '../api'
import { useEscape } from '../../lib/useEscape'

const TRABAJOS = [
  ['chapa', 'Chapa'], ['pintura', 'Pintura'], ['mecanica', 'Mecánica'],
  ['lunas', 'Lunas'], ['neumaticos', 'Neumáticos'],
]

/* Alta y edición de un taller. La dirección se ubica sola en el servidor: sin
   coordenadas, un taller no sale en la lista por distancia. */
export default function TallerForm({ taller, proveedores = [], onCerrar, onGuardado }) {
  const nuevo = !taller?.id
  const [f, setF] = useState({
    name: taller?.name || '', phone: taller?.phone || '',
    address: taller?.address || '', city: taller?.city || '',
    categories: taller?.categories || [], convenios: taller?.convenios || [],
    notes: taller?.notes || '',
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  useEscape(onCerrar)

  const poner = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const alternar = (k, v) => setF((x) => ({
    ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v],
  }))

  const guardar = async (e) => {
    e.preventDefault()
    if (!f.name.trim()) { setError('Pon el nombre del taller.'); return }
    setGuardando(true); setError('')
    const cuerpo = { ...f, name: f.name.trim(), phone: f.phone.trim(),
      address: f.address.trim(), city: f.city.trim(), notes: f.notes.trim() }
    try {
      let ubicado
      if (nuevo) {
        const r = await crearTaller(cuerpo)
        ubicado = r.data?.latitude != null
      } else {
        const r = await editarTaller(taller.id, cuerpo)
        ubicado = r.data?.ubicado
      }
      onGuardado?.({ nuevo, ubicado, nombre: cuerpo.name, conDireccion: !!(cuerpo.address || cuerpo.city) })
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se ha podido guardar. Inténtalo de nuevo.')
    } finally { setGuardando(false) }
  }

  const chip = (sel) => `rounded-lg px-2.5 py-1 text-[12px] font-medium ring-1 transition ${
    sel ? 'bg-brand-500/15 text-brand-200 ring-brand-500/40' : 'text-dark-400 ring-dark-700 hover:text-dark-200'}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onCerrar}>
      <form onSubmit={guardar} onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-dark-700 bg-dark-900 p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-dark-50">{nuevo ? 'Añadir taller' : 'Editar taller'}</h2>
            <p className="mt-0.5 text-[12px] text-dark-500">Con la dirección aparece en el mapa y en las recomendaciones de cada daño.</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1 text-dark-500 hover:text-dark-200"><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-[12px] font-medium text-dark-300">Nombre *</span>
            <input className="input mt-1 w-full" value={f.name} onChange={poner('name')} autoFocus placeholder="Talleres Muñiz" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[12px] font-medium text-dark-300">Teléfono</span>
              <input className="input mt-1 w-full" value={f.phone} onChange={poner('phone')} inputMode="tel" placeholder="981 000 000" />
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-dark-300">Localidad</span>
              <input className="input mt-1 w-full" value={f.city} onChange={poner('city')} placeholder="Santiago de Compostela" />
            </label>
          </div>
          <label className="block">
            <span className="flex items-center gap-1 text-[12px] font-medium text-dark-300"><MapPin size={11} /> Dirección</span>
            <input className="input mt-1 w-full" value={f.address} onChange={poner('address')} placeholder="Rúa do Tambre 12" />
          </label>

          <div>
            <span className="text-[12px] font-medium text-dark-300">Qué trabajos hace</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {TRABAJOS.map(([id, label]) => (
                <button key={id} type="button" onClick={() => alternar('categories', id)} className={chip(f.categories.includes(id))}>{label}</button>
              ))}
            </div>
          </div>

          {proveedores.length > 0 && (
            <div>
              <span className="text-[12px] font-medium text-dark-300">Convenio con</span>
              <span className="ml-1 text-[11px] text-dark-500">(sin marcar: trabaja con todos)</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {proveedores.map((p) => (
                  <button key={p} type="button" onClick={() => alternar('convenios', p)} className={chip(f.convenios.includes(p))}>{p}</button>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-[12px] font-medium text-dark-300">Notas</span>
            <textarea className="input mt-1 w-full" rows={2} value={f.notes} onChange={poner('notes')} placeholder="Horario, persona de contacto…" />
          </label>
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="btn-ghost px-4 py-2 text-sm">Cancelar</button>
          <button type="submit" disabled={guardando} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50">
            {guardando && <Loader2 size={14} className="animate-spin" />}
            {nuevo ? 'Guardar taller' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}
