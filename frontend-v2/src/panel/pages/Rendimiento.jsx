import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, ArrowUpDown, LifeBuoy, RotateCcw, PhoneOff, Camera, Undo2, PackageX, Search,
} from 'lucide-react'
import { getRendimientoConductores } from '../api'

/* CÓMO VA CADA CONDUCTOR — una tabla, y en el periodo que se elija.
   ══════════════════════════════════════════════════════════════════════════
   Es la pantalla con la que se habla con una persona sobre su trabajo, así que
   lo que no puede tener es un número que no se sostenga. Dos decisiones:

   · SE DICE DE DÓNDE SALE CADA COLUMNA. Ayudas, reintentos y DCR salen de
     Cortex, que se captura solo y está al día. Los fallos de contacto, los de
     POD, los RTS y los DNR salen del reporte diario, que alguien sube a mano y
     llega con días de retraso. Sin decirlo, un cero en «fallos de contacto» se
     lee como «no ha fallado» cuando lo que pasa es que todavía no hay reporte
     de esos días — y eso es acusar a alguien de nada o absolverlo sin datos.
     Por eso arriba pone hasta qué día llega cada fuente, y las columnas del
     reporte se pintan apagadas cuando el periodo va más allá.

   · ORDENAR ES DEL USUARIO, no del servidor: la tabla llega ordenada por
     ayudas y se puede reordenar por cualquier columna sin volver a pedir nada.

   Los que no tienen ficha salen igual, marcados: son transportistas que Cortex
   o el reporte conocen y nosotros no. Esconderlos sería perder justo la pista
   de que falta darlos de alta (gotcha 30). */

/* LA FECHA SE COMPONE A MANO, no con `toISOString`. `new Date()` es hora
   LOCAL y su ISO es UTC: en España, entre medianoche y las dos de la mañana,
   `toISOString().slice(0,10)` devuelve el día ANTERIOR. Aquí eso sería pedir
   los números de ayer creyendo que son los de hoy (gotcha 11). */
const clave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const HOY = () => clave(new Date())
const menos = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return clave(d)
}

const COLS = [
  { k: 'nombre', t: 'Conductor', txt: true },
  { k: 'dias', t: 'Días', ayuda: 'Días con reparto en el periodo' },
  { k: 'entregas', t: 'Entregas', ayuda: 'Paquetes entregados (Cortex)' },
  { k: 'dcr', t: 'DCR', pct: true, ayuda: 'Entregados sobre despachados (Cortex)' },
  { k: 'reintentos', t: 'Reintentos', icono: RotateCcw, ayuda: 'Paquetes que necesitaron otro intento (Cortex)' },
  { k: 'ayuda_paquetes', t: 'Ayudas', icono: LifeBuoy, ayuda: 'Paquetes que ha hecho en la ruta de otro (Cortex)' },
  { k: 'cc_fails', t: 'Contacto', icono: PhoneOff, reporte: true, ayuda: 'Fallos de contacto (reporte diario)' },
  { k: 'pod_fails', t: 'POD', icono: Camera, reporte: true, ayuda: 'Fallos de foto en la entrega (reporte diario)' },
  { k: 'rts', t: 'RTS', icono: Undo2, reporte: true, ayuda: 'Paquetes devueltos a la nave (reporte diario)' },
  { k: 'dnr', t: 'DNR', icono: PackageX, reporte: true, ayuda: 'No entregados y reclamados (reporte diario)' },
]

export default function Rendimiento() {
  const { center } = useOutletContext()
  const [d, setD] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [err, setErr] = useState('')
  const [desde, setDesde] = useState(menos(6))
  const [hasta, setHasta] = useState(HOY())
  const [orden, setOrden] = useState({ k: 'ayuda_paquetes', desc: true })
  const [busca, setBusca] = useState('')

  const cargar = useCallback(() => {
    setCargando(true); setErr('')
    getRendimientoConductores({ desde, hasta, center })
      .then((r) => setD(r.data))
      .catch((e) => setErr(e?.response?.data?.detail || 'No se han podido cargar los números.'))
      .finally(() => setCargando(false))
  }, [desde, hasta, center])
  useEffect(() => { cargar() }, [cargar])

  const filas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const xs = (d?.filas || []).filter((f) => !q
      || (f.nombre || '').toLowerCase().includes(q)
      || (f.transporter || '').toLowerCase().includes(q))
    const { k, desc } = orden
    /* Desempate por transporter: sin él, dos personas con el mismo número
       bailan de sitio cada vez que se reordena y parece que el dato cambia. */
    return [...xs].sort((a, b) => {
      const va = a[k], vb = b[k]
      const cmp = typeof va === 'string'
        ? String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' })
        : (va || 0) - (vb || 0)
      return (desc ? -cmp : cmp) || String(a.transporter).localeCompare(String(b.transporter))
    })
  }, [d, orden, busca])

  // El reporte llega con días de retraso: si el periodo pasa de ahí, sus
  // columnas están incompletas y hay que decirlo, no dibujar ceros.
  const reporteCorto = !!(d?.cobertura?.reporte) && d.cobertura.reporte < hasta

  const periodo = (dias, txt) => (
    <button onClick={() => { setDesde(menos(dias)); setHasta(HOY()) }}
      className={`rounded-lg px-2.5 py-1 text-[12.5px] ${
        desde === menos(dias) && hasta === HOY()
          ? 'bg-brand-500/20 font-semibold text-brand-200'
          : 'border border-dark-700 text-dark-400 hover:border-dark-500'}`}>
      {txt}
    </button>
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[19px] font-bold text-dark-50">Rendimiento</h1>
        <p className="mt-0.5 max-w-[80ch] text-[13px] text-dark-400">
          Cómo va cada conductor. Ayudas, reintentos y DCR salen de Cortex y están al
          día; contacto, POD, RTS y DNR salen del reporte diario, que se sube a mano.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {periodo(0, 'Hoy')}
        {periodo(6, '7 días')}
        {periodo(29, '30 días')}
        <div>
          <label className="label">Desde</label>
          <input type="date" className="input py-1.5 text-[13px]" value={desde}
            onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input type="date" className="input py-1.5 text-[13px]" value={hasta}
            onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-600" />
          <input className="input py-1.5 pl-7 text-[13px]" placeholder="Buscar conductor"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      {d && (
        <p className="text-[12px] text-dark-500">
          Cortex tiene datos hasta el <b className="text-dark-300">{d.cobertura.cortex || '—'}</b>;
          el reporte diario, hasta el <b className={reporteCorto ? 'text-amber-300' : 'text-dark-300'}>
            {d.cobertura.reporte || '—'}</b>.
          {reporteCorto && ' Contacto, POD, RTS y DNR de los días posteriores todavía no están: un cero ahí no significa que no haya fallos.'}
        </p>
      )}

      {err && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">{err}</p>}
      {cargando && !d && (
        <div className="flex items-center gap-2 py-10 text-[13px] text-dark-400">
          <Loader2 size={15} className="animate-spin" /> Contando…
        </div>
      )}

      {d && (
        <div className="card overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-dark-800 text-left text-[11px] uppercase tracking-wider text-dark-500">
                {COLS.map((c) => (
                  <th key={c.k} title={c.ayuda}
                    className={`whitespace-nowrap px-2.5 py-2 font-semibold ${c.txt ? '' : 'text-right'}`}>
                    <button onClick={() => setOrden((o) => ({ k: c.k, desc: o.k === c.k ? !o.desc : true }))}
                      className={`inline-flex items-center gap-1 ${
                        orden.k === c.k ? 'text-dark-200' : 'hover:text-dark-300'} ${
                        c.reporte && reporteCorto ? 'opacity-60' : ''}`}>
                      {c.icono && <c.icono size={11} />}
                      {c.t}
                      <ArrowUpDown size={9} className={orden.k === c.k ? '' : 'opacity-30'} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.transporter} className="border-b border-dark-800/60 last:border-0 hover:bg-dark-800/30">
                  <td className="px-2.5 py-1.5">
                    <span className="font-medium text-dark-100">{f.nombre || '—'}</span>
                    {!f.ficha && (
                      <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-px text-[10px] font-semibold text-amber-300"
                        title="Cortex o el reporte le conocen, pero no tiene ficha: sus datos no se cruzan con nada más">
                        sin ficha
                      </span>
                    )}
                    {f.centro && <span className="ml-1.5 text-[11px] text-dark-600">{f.centro}</span>}
                  </td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-dark-400">{f.dias || '—'}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-dark-200">{f.entregas || '—'}</td>
                  <td className={`px-2.5 py-1.5 text-right tabular-nums ${
                    f.entregas ? (f.dcr >= 99 ? 'text-emerald-300' : f.dcr >= 98 ? 'text-dark-200' : 'text-amber-300') : 'text-dark-600'}`}>
                    {f.entregas ? `${f.dcr.toFixed(1)} %` : '—'}
                  </td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-dark-300">{f.reintentos || '—'}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums">
                    {f.ayuda_paquetes
                      ? <span className="font-semibold text-brand-300" title={`${f.ayudas} ${f.ayudas === 1 ? 'salida' : 'salidas'} a rutas de otros`}>
                          {f.ayuda_paquetes}
                        </span>
                      : <span className="text-dark-600">—</span>}
                  </td>
                  {['cc_fails', 'pod_fails', 'rts', 'dnr'].map((k) => (
                    <td key={k} className={`px-2.5 py-1.5 text-right tabular-nums ${
                      f[k] ? 'text-amber-300' : 'text-dark-600'} ${reporteCorto ? 'opacity-70' : ''}`}>
                      {f[k] || '—'}
                    </td>
                  ))}
                </tr>
              ))}
              {!filas.length && (
                <tr><td colSpan={COLS.length} className="px-3 py-8 text-center text-[13px] text-dark-500">
                  Nadie con datos en ese periodo.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
