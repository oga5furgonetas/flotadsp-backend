import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { Loader2, Link2, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cortexEmparejar, updateDriver } from '../api'
import { lista } from '../../lib/lista'

/* ────────────────────────────────────────────────────────────────────────────
   Poner nombre a los IDs de Amazon que reparten sin ficha.

   Medido en producción: 44 IDs entregaron 19.579 paquetes en 30 días sin una
   ficha detrás — el 20 % del volumen del mes. Sus fallos cuentan en el DCR del
   centro, pero como no tienen nombre no se les puede formar ni felicitar: son
   una línea de estadística anónima en el ranking.

   Se hace UNA vez por conductor y ya queda para siempre. Por eso esta tarjeta
   solo aparece cuando queda algo pendiente: cuando esté todo emparejado
   desaparece sola y no vuelve a estorbar.
   ──────────────────────────────────────────────────────────────────────────── */

export default function Emparejar() {
  const { t } = useT()
  const [datos, setDatos] = useState(null)
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState('')
  const [elegido, setElegido] = useState({})   // driver_id -> ficha_id
  const [err, setErr] = useState('')

  const cargar = useCallback(() => {
    cortexEmparejar().then((r) => setDatos(r.data)).catch(() => setDatos(null))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const asignar = async (amazonId) => {
    const fichaId = elegido[amazonId]
    if (!fichaId) return
    setGuardando(amazonId); setErr('')
    try {
      // No hace falta endpoint nuevo: driver_id ya está en la whitelist del
      // PATCH de conductor, así que se reutiliza el que ya existe.
      await updateDriver(fichaId, { driver_id: amazonId })
      setElegido((e) => { const n = { ...e }; delete n[amazonId]; return n })
      cargar()
    } catch (e) {
      setErr(e?.response?.data?.detail || t('emp.error'))
    } finally { setGuardando('') }
  }

  const pendientes = lista(datos?.pendientes)
  if (!datos || pendientes.length === 0) return null

  const r = datos.resumen || {}
  const libres = lista(datos.libres)

  return (
    <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-4">
      <button onClick={() => setAbierto((a) => !a)} className="flex w-full items-center gap-2 text-left">
        <Link2 size={15} className="shrink-0 text-amber-400" />
        <span className="flex-1 text-sm font-semibold text-amber-200">
          {t('emp.titulo').replace('{n}', r.sin_ficha).replace('{p}', Number(r.paquetes_sin_atribuir || 0).toLocaleString('es-ES'))}
        </span>
        {abierto ? <ChevronUp size={15} className="text-amber-400/70" />
          : <ChevronDown size={15} className="text-amber-400/70" />}
      </button>
      <p className="mt-1 pl-6 text-[11px] leading-relaxed text-dark-500">{t('emp.explica')}</p>

      {abierto && (
        <div className="mt-3 space-y-2">
          {err && <p className="text-xs text-red-300">{err}</p>}
          {pendientes.map((p) => {
            const sug = p.sugerencias?.[0]
            const valor = elegido[p.driver_id] || sug?.ficha_id || ''
            return (
              <div key={p.driver_id} className="flex flex-wrap items-center gap-2 rounded-lg bg-dark-900/60 p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] font-semibold text-dark-200">{p.driver_id}</div>
                  <div className="text-[10px] text-dark-600">
                    {t('emp.paquetes').replace('{n}', Number(p.paquetes).toLocaleString('es-ES'))}
                    {' · '}{p.ultimo_dia}
                    {p.centro ? ` · ${p.centro}` : ''}
                  </div>
                  {p.nombre_historico && (
                    <div className="text-[10px] text-emerald-400/80">
                      {t('emp.amazon.dice')} {p.nombre_historico}
                    </div>
                  )}
                </div>
                <select value={valor}
                  onChange={(e) => setElegido((s) => ({ ...s, [p.driver_id]: e.target.value }))}
                  className="max-w-[220px] flex-1 rounded-lg border border-dark-700 bg-dark-900 px-2 py-1 text-xs text-dark-100">
                  <option value="">{t('emp.elige')}</option>
                  {libres.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}{f.center ? ` · ${f.center}` : ''}
                    </option>
                  ))}
                </select>
                <button onClick={() => asignar(p.driver_id)}
                  disabled={!valor || guardando === p.driver_id}
                  className="flex items-center gap-1 rounded-lg bg-brand-500/15 px-2.5 py-1 text-[11px] font-semibold text-brand-300 disabled:opacity-40">
                  {guardando === p.driver_id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  {t('emp.asignar')}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
