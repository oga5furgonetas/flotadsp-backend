import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, CalendarDays, Loader2, Check, Clock, X, Plus,
} from 'lucide-react'
import { getMyShifts, createShiftRequest } from '../../services/api'
import { lista } from '../../lib/lista'
import { isoLocal } from '../../lib/fecha'
import { useT } from '../../i18n'

const DIAS = 28   // cuatro semanas vista: lo que un conductor necesita planificar

const TIPO = {
  trabaja: { k: 'dr.sh.works', cls: 'border-emerald-500/40 bg-emerald-500/12 text-emerald-300' },
  extra:   { k: 'dr.sh.extra', cls: 'border-amber-500/40 bg-amber-500/12 text-amber-300' },
  libre:   { k: 'dr.sh.off',   cls: 'border-dark-700 bg-dark-800/50 text-dark-500' },
}
const ESTADO = {
  aprobado:  { k: 'dr.sh.approved', icono: Check, cls: 'text-emerald-400' },
  pendiente: { k: 'dr.sh.pending',  icono: Clock, cls: 'text-amber-400' },
  rechazado: { k: 'dr.sh.rejected', icono: X,     cls: 'text-red-400' },
}

export default function MisTurnos({ onBack }) {
  const { t, lang } = useT()
  const [turnos, setTurnos] = useState(null)
  const [peticiones, setPeticiones] = useState([])
  const [err, setErr] = useState('')
  const [aviso, setAviso] = useState('')
  const [pidiendo, setPidiendo] = useState(null)   // fecha sobre la que se pide
  const [enviando, setEnviando] = useState(false)

  const dias = useMemo(() => {
    const hoy = new Date()
    return Array.from({ length: DIAS }, (_, i) => {
      const d = new Date(hoy)
      d.setDate(d.getDate() + i)
      return isoLocal(d)
    })
  }, [])

  const cargar = useCallback(async () => {
    setErr('')
    try {
      const r = await getMyShifts(dias[0], dias[DIAS - 1])
      const m = {}
      for (const s of lista(r.data?.shifts)) m[s.date] = s.type
      setTurnos(m)
      setPeticiones(lista(r.data?.requests))
    } catch {
      setErr(t('dr.sh.error'))
      setTurnos({})
    }
  }, [dias])

  useEffect(() => { cargar() }, [cargar])

  const pedir = async (fecha, tipo) => {
    setEnviando(true); setErr(''); setAviso('')
    try {
      const r = await createShiftRequest(fecha, tipo, '')
      setPidiendo(null)
      // El backend auto-aprueba si queda cobertura suficiente: díselo al conductor.
      setAviso(r.data?.auto ? t('dr.sh.auto.ok') : t('dr.sh.sent'))
      await cargar()
    } catch (e) {
      setErr(e?.response?.data?.detail || t('dr.sh.req.err'))
    } finally { setEnviando(false) }
  }

  const fmt = (f) => new Date(f + 'T12:00:00').toLocaleDateString(lang, { weekday: 'short', day: '2-digit', month: 'short' })
  const porFecha = useMemo(() => {
    const m = {}
    for (const p of peticiones) m[p.date] = p
    return m
  }, [peticiones])

  return (
    <div className="min-h-screen bg-dark-950 pb-10">
      <header
        className="sticky top-0 z-40 flex items-center gap-3 border-b border-dark-800/60 bg-dark-950/95 px-4 pb-3 backdrop-blur-md"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 12px))' }}
      >
        <button onClick={onBack} className="btn-ghost p-1.5" aria-label={t('dr.sh.back')}>
          <ArrowLeft size={18} />
        </button>
        <h1 className="flex items-center gap-2 text-base font-bold text-dark-50">
          <CalendarDays size={17} /> {t('dr.sh.title')}
        </h1>
      </header>

      <div className="flex flex-col gap-3 px-4 pt-4">
        {err && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}
        {aviso && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{aviso}</p>}

        {turnos === null ? (
          <div className="flex items-center gap-2 py-8 text-dark-400">
            <Loader2 className="animate-spin" size={18} /> {t('ui.loading')}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {dias.map((f) => {
              const tipo = turnos[f]
              const ui = TIPO[tipo] || null
              const pet = porFecha[f]
              const est = pet ? ESTADO[pet.status] : null
              const Icono = est?.icono
              return (
                <div key={f} className="flex items-center gap-3 rounded-xl border border-dark-800/70 bg-dark-900/50 px-3 py-2.5">
                  <span className="w-24 shrink-0 text-[13px] capitalize text-dark-300">{fmt(f)}</span>
                  {ui ? (
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${ui.cls}`}>
                      {t(ui.k)}
                    </span>
                  ) : (
                    <span className="text-[12px] text-dark-600">{t('dr.sh.none')}</span>
                  )}
                  {est && (
                    <span className={`flex items-center gap-1 text-[11px] font-semibold ${est.cls}`}>
                      <Icono size={12} /> {t(est.k)}
                    </span>
                  )}
                  <div className="ml-auto">
                    {pidiendo === f ? (
                      <div className="flex gap-1.5">
                        <button disabled={enviando} onClick={() => pedir(f, 'libre')}
                          className="rounded-lg bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold text-sky-300 disabled:opacity-50">
                          {t('dr.sh.ask.off')}
                        </button>
                        <button disabled={enviando} onClick={() => pedir(f, 'extra')}
                          className="rounded-lg bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300 disabled:opacity-50">
                          {t('dr.sh.ask.extra')}
                        </button>
                        <button onClick={() => setPidiendo(null)} className="btn-ghost px-2 py-1 text-[11px]">
                          {t('dr.sh.cancel')}
                        </button>
                      </div>
                    ) : !pet && (
                      <button onClick={() => { setPidiendo(f); setAviso('') }}
                        className="flex items-center gap-1 rounded-lg border border-dark-700 px-2 py-1 text-[11px] font-medium text-dark-400">
                        <Plus size={11} /> {t('dr.sh.ask')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
