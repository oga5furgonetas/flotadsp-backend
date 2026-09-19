import { useState } from 'react'
import { Loader2, ShieldAlert } from 'lucide-react'
import { asignarIdConductor, confirmarParTransporter } from '../api'

/* ── «AMAZON DICE QUE ESTE ID ES OTRA PERSONA» ───────────────────────────────
   Un Transporter ID puesto en una ficha no está verificado: lo puso una
   persona, a veces desde un desplegable. El 19-09-2026 el ID de Alberto Brion
   Piñeiro estaba colgado de Alberto Vázquez Arias y la pantalla lo enseñaba
   con la misma seguridad que uno bueno — sin ninguna forma de ver que estaba
   mal ni de deshacerlo.

   Aquí se enseña lo que dice Amazon y se dan las TRES salidas, todas con un
   clic y ninguna automática:
     · quitarlo de esa ficha (queda apuntado como estaba antes);
     · pasarlo a la persona que Amazon dice, si su nombre lleva a UNA ficha;
     · «está bien»: es la misma persona (apodo, apellido distinto) y no vuelve
       a salir. */
export default function AvisoIdAmazon({ tid, fichaId, ficha, amazon, propuesta, distintos, onHecho, onError }) {
  const [ocupado, setOcupado] = useState('')

  const ejecutar = async (que, fn, confirmacion) => {
    if (confirmacion && !window.confirm(confirmacion)) return
    setOcupado(que); onError?.('')
    try {
      await fn(false)
      await onHecho?.()
    } catch (e) {
      // 409 = Amazon o la ficha dicen otra cosa. Se enseña y se deja repetir
      // sabiendo lo que se hace, no se salta en silencio.
      const det = e?.response?.data?.detail
      if (e?.response?.status === 409 && typeof det === 'string'
          && window.confirm(`${det}\n\n¿Hacerlo igualmente?`)) {
        try { await fn(true); await onHecho?.() } catch (e2) {
          onError?.(e2?.response?.data?.detail || 'No se pudo guardar.')
        }
      } else if (e?.response?.status !== 409) {
        onError?.(det || 'No se pudo guardar.')
      }
    } finally { setOcupado('') }
  }

  const btn = 'rounded border px-1.5 py-0.5 text-[10.5px] font-semibold disabled:opacity-40'
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px]" onClick={(e) => e.stopPropagation()}>
      <ShieldAlert size={13} className="shrink-0 text-red-400" />
      <span className="text-red-300">
        Amazon dice que <span className="font-mono text-[10.5px]">{tid}</span> es <b>{amazon}</b>
        {ficha ? <>, no {ficha}</> : null}
        {distintos ? <> · y esa ficha tiene otro ID de Amazon distinto</> : null}
      </span>
      <button disabled={!!ocupado} className={`${btn} border-red-500/40 text-red-300 hover:bg-red-500/10`}
        onClick={() => ejecutar('quitar', () => asignarIdConductor({ transporter_id: tid, driver_id: '' }),
          `¿Quitar el ID ${tid} de ${ficha || 'esa ficha'}? Queda apuntado como estaba.`)}>
        {ocupado === 'quitar' ? <Loader2 size={11} className="inline animate-spin" /> : `quitarlo de ${ficha ? ficha.split(' ')[0] : 'la ficha'}`}
      </button>
      {propuesta && !propuesta.ya_tiene_otro_id && (
        <button disabled={!!ocupado} className={`${btn} border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10`}
          onClick={() => ejecutar('pasar', (f) => asignarIdConductor({
            transporter_id: tid, driver_id: propuesta.ficha_id, forzar: f }),
            `¿Pasar el ID ${tid} a ${propuesta.nombre}? Se quita de ${ficha || 'la ficha actual'}.`)}>
          {ocupado === 'pasar' ? <Loader2 size={11} className="inline animate-spin" /> : `es ${propuesta.nombre}`}
        </button>
      )}
      <button disabled={!!ocupado} className={`${btn} border-dark-600 text-dark-400 hover:text-dark-100`}
        title="Es la misma persona aunque el nombre no se parezca: no vuelve a salir este aviso."
        onClick={() => ejecutar('ok', () => confirmarParTransporter({ transporter_id: tid, ficha_id: fichaId }))}>
        {ocupado === 'ok' ? <Loader2 size={11} className="inline animate-spin" /> : 'está bien'}
      </button>
    </span>
  )
}
