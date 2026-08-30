import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import ExpiryAlerts from './ExpiryAlerts'
import { getItvAlerts, getItvPendientes, guardarItvLote } from '../api'
import { useT } from '../../i18n'

/* ── ITV: RELLENAR EN LOTE ─────────────────────────────────────────────────
   El problema no es detectarlo, ya se detecta. Lo que pasa es que rellenarlo
   cuesta: hoy hay que abrir la ficha de cada furgoneta, buscar el campo y
   guardar, cincuenta y seis veces. Un dato que cuesta dos minutos por unidad
   no se rellena nunca, por muy rojo que se pinte el aviso.

   Y renovar una vencida es un clic: en España la siguiente ITV cae el mismo
   día del mes, al año o a los seis meses si el vehículo pasa de diez. Se
   PROPONE la fecha y la persona confirma — no se pone sola, porque marcar como
   pasada una ITV que no se pasó es mucho peor que el aviso rojo que había. */
function ItvPendientes({ onCambio }) {
  const [d, setD] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [borrador, setBorrador] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(() => {
    setCargando(true)
    getItvPendientes()
      .then((r) => setD(r.data))
      .catch(() => setD(null))
      .finally(() => setCargando(false))
  }, [])
  useEffect(cargar, [cargar])

  const guardar = async () => {
    const fechas = Object.entries(borrador)
      .filter(([, v]) => v)
      .map(([vehicle_id, itv_date]) => ({ vehicle_id, itv_date }))
    if (!fechas.length) return
    setGuardando(true); setMsg(null)
    try {
      const r = await guardarItvLote({ fechas })
      const err = r.data?.errores || []
      setMsg(err.length
        ? { mal: true, txt: `${r.data.guardadas} guardadas. ${err.length} con problema: ${err.map((e) => e.error).join(', ')}` }
        : { txt: `${r.data.guardadas} fechas guardadas.` })
      // Solo se limpian las que SÍ entraron: si se limpiara todo, las que
      // fallaron habría que volver a teclearlas.
      const bien = new Set((r.data?.detalle || []).map((x) => x.vehicle_id))
      setBorrador((b) => Object.fromEntries(Object.entries(b).filter(([k]) => !bien.has(k))))
      cargar(); onCambio?.()
    } catch (e) {
      setMsg({ mal: true, txt: e?.response?.data?.detail || 'No se pudo guardar.' })
    } finally { setGuardando(false) }
  }

  if (cargando) {
    return (
      <div className="card flex items-center justify-center gap-2 p-10 text-dark-400">
        <Loader2 size={15} className="animate-spin" /> Buscando las que no tienen la ITV controlada…
      </div>
    )
  }
  if (!d) return null

  const pendientes = Object.values(borrador).filter(Boolean).length

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-orange-500/25 bg-orange-500/[0.07] px-3.5 py-2.5">
        <p className="text-[13px] text-orange-200">
          La ITV de <span className="cifra font-semibold">{d.sin_control}</span> de{' '}
          <span className="cifra">{d.activas}</span> furgonetas activas no está controlada:{' '}
          <span className="cifra font-semibold">{d.vencidas.length}</span> con la fecha pasada y{' '}
          <span className="cifra font-semibold">{d.sin_fecha.length}</span> sin ninguna fecha.
        </p>
        <p className="mt-1 text-[12px] text-dark-400">
          Sin fecha es peor que vencida: no salta ningún aviso, así que nadie se entera.
        </p>
      </div>

      {msg && (
        <p className={`text-[12.5px] ${msg.mal ? 'text-red-300' : 'text-lime-300'}`}>{msg.txt}</p>
      )}

      {!!d.vencidas.length && (
        <div className="card overflow-hidden">
          <p className="border-b border-dark-800 px-3.5 py-2 text-xs font-semibold uppercase tracking-wide text-dark-300">
            Con la fecha pasada
          </p>
          <div className="divide-y divide-dark-800/60">
            {d.vencidas.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2">
                <span className="cifra w-[86px] flex-none font-semibold text-dark-100">{v.license_plate}</span>
                <span className="min-w-0 flex-1 text-[12px] text-dark-500">
                  venció el <span className="cifra text-orange-300">{v.itv_date}</span>
                  {v.dias_vencida != null && <> · hace <span className="cifra">{v.dias_vencida}</span> días</>}
                  {v.center && <> · {v.center}</>}
                </span>
                <input type="date" value={borrador[v.id] || ''}
                  onChange={(e) => setBorrador({ ...borrador, [v.id]: e.target.value })}
                  className="input w-[150px] py-1 text-[12.5px]" />
                {v.propuesta && borrador[v.id] !== v.propuesta && (
                  <button onClick={() => setBorrador({ ...borrador, [v.id]: v.propuesta })}
                    className="text-[12px] font-medium text-brand-300 hover:text-brand-200"
                    title="Si ya se pasó, la siguiente cae aquí">
                    ya se pasó → {v.propuesta}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!!d.sin_fecha.length && (
        <div className="card overflow-hidden">
          <p className="border-b border-dark-800 px-3.5 py-2 text-xs font-semibold uppercase tracking-wide text-dark-300">
            Sin ninguna fecha <span className="cifra font-normal text-dark-500">{d.sin_fecha.length}</span>
          </p>
          <div className="max-h-[420px] divide-y divide-dark-800/60 overflow-y-auto">
            {d.sin_fecha.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3 px-3.5 py-1.5">
                <span className="cifra w-[86px] flex-none font-semibold text-dark-100">{v.license_plate}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-dark-500">
                  {[v.brand, v.model].filter(Boolean).join(' ')}{v.center && ` · ${v.center}`}
                </span>
                <input type="date" value={borrador[v.id] || ''}
                  onChange={(e) => setBorrador({ ...borrador, [v.id]: e.target.value })}
                  className="input w-[150px] py-1 text-[12.5px]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* El botón se queda pegado abajo: con 56 filas, si estuviera al final
          habría que bajar toda la lista para guardar lo que se acaba de teclear. */}
      {pendientes > 0 && (
        <div className="sticky bottom-3 flex items-center gap-3 rounded-lg border border-dark-700 bg-dark-900 px-3.5 py-2.5 shadow-lg shadow-black/40">
          <span className="text-[13px] text-dark-300">
            <span className="cifra font-semibold">{pendientes}</span> fecha{pendientes > 1 ? 's' : ''} por guardar
          </span>
          <button onClick={() => setBorrador({})}
            className="text-[12px] text-dark-500 hover:text-dark-300">descartar</button>
          <button onClick={guardar} disabled={guardando}
            className="btn-primary ml-auto px-4 py-1.5 text-[13px] disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar todas'}
          </button>
        </div>
      )}
    </div>
  )
}


export default function AvisosITV() {
  const { t } = useT()
  const [ver, setVer] = useState('avisos')
  const [n, setN] = useState(0)

  // El contador va en la pestaña: sin el numero delante, nadie entra a
  // rellenar y las 56 sin fecha siguen invisibles otro mes.
  useEffect(() => {
    getItvPendientes().then((r) => setN(r.data?.sin_control || 0)).catch(() => setN(0))
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex w-fit gap-1 rounded-lg bg-dark-900 p-1 ring-1 ring-dark-700">
        {[['avisos', t('itv.title')], ['pendientes', 'Sin controlar']].map(([k, txt]) => (
          <button key={k} onClick={() => setVer(k)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              ver === k ? 'bg-brand-500/20 text-brand-300' : 'text-dark-400 hover:text-dark-200'}`}>
            {txt}
            {k === 'pendientes' && n > 0 && (
              <span className="cifra rounded-full bg-orange-500/20 px-1.5 text-[10px] text-orange-300">{n}</span>
            )}
          </button>
        ))}
      </div>

      {ver === 'pendientes'
        ? <ItvPendientes onCambio={() => getItvPendientes()
            .then((r) => setN(r.data?.sin_control || 0)).catch(() => {})} />
        : <ExpiryAlerts title={t('itv.title')} fetcher={getItvAlerts} dateField="itv_date" dateLabel={t('itv.date.label')} />}
    </div>
  )
}
