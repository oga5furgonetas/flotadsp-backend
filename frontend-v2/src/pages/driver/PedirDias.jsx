import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Loader2, Check, Send, Clock, X,
} from 'lucide-react'
import { getMyShifts, createShiftRequest, marcarRespuestasVistas } from '../../services/api'
import { lista } from '../../lib/lista'

/* ────────────────────────────────────────────────────────────────────────────
   PEDIR DÍAS LIBRES
   ---------------------------------------------------------------------------
   Un mes entero delante, con flecha para pasar al siguiente. Se marcan los
   días tocándolos, se elige el motivo y se manda todo de una vez.

   Antes había que pedirlos de uno en uno sobre una lista de 28 días, y no se
   podía ver el mes que viene — que es justo cuando se piden las cosas con
   tiempo.

   ── LO QUE NO SE PUEDE MARCAR, Y POR QUÉ ────────────────────────────────────
     · Días pasados: no se pide un día que ya fue.
     · Días ya pedidos y sin contestar: mandarlos otra vez le deja a la oficina
       la misma petición duplicada sin saber cuál responder.
     · Días que ya tienes libres: no hay nada que pedir.
   Las tres se ven en el propio calendario, no se descubren al darle a enviar.
   ──────────────────────────────────────────────────────────────────────────── */

const MOTIVOS = [
  { k: 'asuntos', label: 'Asuntos propios' },
  { k: 'medico',  label: 'Médico' },
  { k: 'familia', label: 'Asunto familiar' },
  { k: 'viaje',   label: 'Viaje' },
  { k: 'otro',    label: 'Otro' },
]

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/* Clave YYYY-MM-DD de una fecha LOCAL. No se usa toISOString: convierte a UTC
   y en España devuelve el día anterior de madrugada. */
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function PedirDias({ onBack }) {
  const hoyIso = iso(new Date())
  const [ref, setRef] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [sel, setSel] = useState(() => new Set())
  const [motivo, setMotivo] = useState('asuntos')
  const [nota, setNota] = useState('')
  const [datos, setDatos] = useState(null)      // {turnos:{fecha:tipo}, pendientes:Set, respuestas:[]}
  const [enviando, setEnviando] = useState(false)
  const [err, setErr] = useState('')
  const [hecho, setHecho] = useState(null)      // {dias:n}

  /* Se piden tres meses de golpe (el anterior, este y los dos siguientes) para
     que cambiar de mes no tenga que esperar a la red cada vez. */
  const rango = useMemo(() => {
    const a = new Date(ref.getFullYear(), ref.getMonth() - 1, 1)
    const b = new Date(ref.getFullYear(), ref.getMonth() + 3, 0)
    return [iso(a), iso(b)]
  }, [ref.getFullYear(), ref.getMonth()])

  const cargar = useCallback(async () => {
    try {
      const r = await getMyShifts(rango[0], rango[1])
      const turnos = {}
      for (const s of lista(r.data?.shifts)) turnos[s.date] = s.type
      const pendientes = new Set(
        lista(r.data?.requests).filter((x) => x.status === 'pendiente').map((x) => x.date))
      setDatos({ turnos, pendientes, respuestas: lista(r.data?.sin_ver) })
    } catch {
      setDatos({ turnos: {}, pendientes: new Set(), respuestas: [] })
    }
  }, [rango])
  useEffect(() => { cargar() }, [cargar])

  /* Rejilla del mes empezando en lunes. */
  const celdas = useMemo(() => {
    const y = ref.getFullYear(), m = ref.getMonth()
    const total = new Date(y, m + 1, 0).getDate()
    const hueco = (new Date(y, m, 1).getDay() + 6) % 7
    const out = Array(hueco).fill(null)
    for (let d = 1; d <= total; d++) out.push(new Date(y, m, d))
    return out
  }, [ref])

  const estadoDe = (f) => {
    if (f < hoyIso) return 'pasado'
    if (datos?.pendientes?.has(f)) return 'pedido'
    if (datos?.turnos?.[f] === 'libre') return 'libre'
    return 'libre_de_marcar'
  }

  const alternar = (f) => {
    if (estadoDe(f) !== 'libre_de_marcar') return
    setSel((s) => {
      const n = new Set(s)
      n.has(f) ? n.delete(f) : n.add(f)
      return n
    })
    setErr('')
  }

  // No se puede retroceder antes del mes en curso: no se piden días pasados.
  const hoy = new Date()
  const puedeAtras = ref.getFullYear() > hoy.getFullYear()
    || (ref.getFullYear() === hoy.getFullYear() && ref.getMonth() > hoy.getMonth())
  const mover = (n) => { if (n < 0 && !puedeAtras) return; setRef((d) => new Date(d.getFullYear(), d.getMonth() + n, 1)) }

  async function enviar() {
    if (!sel.size) return
    setEnviando(true); setErr('')
    try {
      const dates = [...sel].sort()
      await createShiftRequest({ dates, motivo, note: nota.trim(), type: 'libre' })
      setHecho({ dias: dates.length })
      setSel(new Set()); setNota('')
      await cargar()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo enviar. Inténtalo otra vez.')
    } finally { setEnviando(false) }
  }

  async function marcarVistas() {
    try {
      await marcarRespuestasVistas({ ids: (datos?.respuestas || []).map((r) => r.id) })
      setDatos((d) => ({ ...d, respuestas: [] }))
    } catch { /* si falla, seguirá saliendo la próxima vez: no se pierde nada */ }
  }

  if (hecho) {
    return (
      <div className="min-h-screen bg-dark-950 px-4 py-6">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-5">
            <Check size={26} className="text-emerald-400" />
            <h1 className="mt-3 font-display text-[20px] font-bold text-dark-50">Petición enviada</h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-emerald-200/80">
              Has pedido {hecho.dias} día{hecho.dias > 1 ? 's' : ''}. Cuando la oficina conteste te
              avisamos aquí mismo, y verás quién ha respondido y por qué.
            </p>
          </div>
          <button onClick={() => setHecho(null)}
            className="mt-3 w-full rounded-xl border border-dark-700 bg-dark-900 py-3 text-[14px] font-semibold text-dark-100">
            Pedir más días
          </button>
          <button onClick={onBack}
            className="mt-2 w-full rounded-xl py-3 text-[14px] font-semibold text-dark-400">
            Volver al inicio
          </button>
        </div>
      </div>
    )
  }

  const respuestas = datos?.respuestas || []

  return (
    <div className="min-h-screen bg-dark-950 px-4 py-6">
      <div className="mx-auto max-w-md">
        <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-[13px] text-dark-400">
          <ArrowLeft size={15} /> Volver
        </button>

        {/* Respuestas que aún no ha leído. Arriba del todo y antes que nada:
            si la respuesta no se ve, vuelve a preguntar de palabra. */}
        {respuestas.length > 0 && (
          <div className="mb-5 flex flex-col gap-2">
            {respuestas.map((r) => (
              <div key={r.id} className={`rounded-xl border p-3.5 ${
                r.status === 'aprobado'
                  ? 'border-emerald-500/30 bg-emerald-500/[0.07]'
                  : 'border-red-500/30 bg-red-500/[0.07]'}`}>
                <p className={`flex items-center gap-1.5 text-[13px] font-bold ${
                  r.status === 'aprobado' ? 'text-emerald-300' : 'text-red-300'}`}>
                  {r.status === 'aprobado' ? <Check size={14} /> : <X size={14} />}
                  {r.status === 'aprobado' ? 'Aprobado' : 'Rechazado'} · {r.date}
                </p>
                {r.motivo_respuesta && (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-dark-200">«{r.motivo_respuesta}»</p>
                )}
                <p className="mt-2 text-[11px] text-dark-500">
                  {r.resolved_by || '—'}{r.resolved_at ? ` · ${r.resolved_at.slice(8, 10)}/${r.resolved_at.slice(5, 7)} ${r.resolved_at.slice(11, 16)}` : ''}
                </p>
              </div>
            ))}
            <button onClick={marcarVistas}
              className="self-start text-[12px] font-semibold text-dark-400 underline underline-offset-2">
              Enterado, quitar avisos
            </button>
          </div>
        )}

        <h1 className="font-display text-[22px] font-bold tracking-[-.02em] text-dark-50">Pedir días libres</h1>
        <p className="mt-1 text-[13px] text-dark-500">Toca los días que quieras. Puedes pasar de mes.</p>

        {/* Calendario */}
        <div className="mt-5 rounded-2xl border border-dark-800 bg-dark-900/60 p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <button onClick={() => mover(-1)} disabled={!puedeAtras}
              className="rounded-lg border border-dark-700 p-1.5 text-dark-400 disabled:opacity-25"
              aria-label="Mes anterior">
              <ChevronLeft size={16} />
            </button>
            <span className="text-[15px] font-bold capitalize text-dark-50">
              {MESES[ref.getMonth()]} {ref.getFullYear()}
            </span>
            <button onClick={() => mover(1)}
              className="rounded-lg border border-dark-700 p-1.5 text-dark-400" aria-label="Mes siguiente">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {DOW.map((d) => (
              <span key={d} className="pb-1 text-center font-mono text-[10px] text-dark-600">{d}</span>
            ))}
          </div>

          {!datos ? (
            <div className="flex items-center justify-center gap-2 py-12 text-dark-500">
              <Loader2 size={15} className="animate-spin" /> Cargando…
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {celdas.map((d, i) => {
                if (!d) return <span key={i} />
                const f = iso(d)
                const est = estadoDe(f)
                const marcado = sel.has(f)
                const esHoy = f === hoyIso
                return (
                  <button
                    key={f}
                    onClick={() => alternar(f)}
                    disabled={est !== 'libre_de_marcar'}
                    title={est === 'pedido' ? 'Ya lo has pedido, esperando respuesta'
                      : est === 'libre' ? 'Ya lo tienes libre'
                        : est === 'pasado' ? 'Día pasado' : ''}
                    className={`aspect-square rounded-lg text-[13px] tabular-nums transition-colors ${
                      marcado ? 'bg-brand-500 font-bold text-white'
                        : est === 'pasado' ? 'text-dark-700'
                          : est === 'pedido' ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40'
                            : est === 'libre' ? 'bg-dark-800/60 text-dark-600 line-through'
                              : `text-dark-100 hover:bg-dark-800 ${esHoy ? 'ring-1 ring-brand-500/60' : ''}`
                    }`}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>
          )}

          {/* Qué significa cada color. Sin esto, un día tachado parece un fallo. */}
          <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 border-t border-dark-800 pt-3 text-[10.5px] text-dark-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-brand-500" /> Lo pides</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-amber-500/40" /> Esperando respuesta</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-dark-700" /> Ya libre</span>
          </div>
        </div>

        {sel.size > 0 && (
          <>
            <p className="mt-4 text-[13px] font-semibold text-brand-400">
              {sel.size} día{sel.size > 1 ? 's' : ''} seleccionado{sel.size > 1 ? 's' : ''}
            </p>

            <div className="mt-3">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">
                Motivo
              </label>
              <div className="flex flex-wrap gap-1.5">
                {MOTIVOS.map((m) => (
                  <button key={m.k} onClick={() => setMotivo(m.k)}
                    className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] transition-colors ${
                      motivo === m.k
                        ? 'border-brand-500/60 bg-brand-500/15 text-brand-200'
                        : 'border-dark-700 text-dark-400'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">
                Cuéntalo un poco <span className="normal-case tracking-normal text-dark-600">(opcional)</span>
              </label>
              <textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)}
                placeholder="Así la oficina sabe de qué va y no tiene que preguntarte."
                className="w-full resize-none rounded-xl border border-dark-700 bg-dark-900 px-3.5 py-3 text-[14px] text-dark-50 outline-none placeholder:text-dark-600 focus:border-brand-500/60" />
            </div>

            {err && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{err}</p>}

            <button onClick={enviar} disabled={enviando}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-[15px] font-bold text-white disabled:opacity-50">
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Enviar petición
            </button>
          </>
        )}

        {sel.size === 0 && datos && (
          <p className="mt-5 flex items-center justify-center gap-2 text-[13px] text-dark-600">
            <Clock size={14} /> Marca los días que quieras pedir
          </p>
        )}
      </div>
    </div>
  )
}
