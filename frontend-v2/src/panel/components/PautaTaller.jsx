import { useCallback, useEffect, useState } from 'react'
import { Loader2, MessageSquare, Clock, Inbox } from 'lucide-react'
import {
  getPautaTaller, setPautaTaller, setPlantillaTaller,
  getBandejaTaller, marcarLeidoTaller,
} from '../api'

/* EL CANAL CON EL TALLER
   ═══════════════════════════════════════════════════════════════════════════
   Dos cosas que hasta ahora estaban cosidas al código y no se podían tocar sin
   un despliegue: CADA CUÁNTO se pregunta y QUÉ se dice. Si cambiarlo cuesta un
   despliegue, no lo cambia nadie — y una cadencia que no encaja con cómo
   trabaja un taller acaba en que dejen de leernos.

   Y el canal va en los DOS sentidos: abajo está lo que ELLOS dicen, hayamos
   preguntado o no. Si terminan el martes y no nos tocaba preguntar hasta el
   jueves, la furgoneta no se queda dos días parada en la puerta del taller. */

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export default function PautaTaller() {
  const [d, setD] = useState(null)
  const [bandeja, setBandeja] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState('')
  const [editando, setEditando] = useState(null)
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(() => {
    setCargando(true)
    Promise.all([
      getPautaTaller().then((r) => r.data).catch(() => null),
      getBandejaTaller().then((r) => r.data).catch(() => null),
    ]).then(([p, b]) => { setD(p); setBandeja(b) }).finally(() => setCargando(false))
  }, [])
  useEffect(cargar, [cargar])

  const guardarPauta = async (cambio) => {
    setGuardando('pauta'); setMsg(null)
    try {
      const r = await setPautaTaller({ ...d.pauta, ...cambio })
      setD((p) => ({ ...p, pauta: r.data.pauta }))
    } catch (e) {
      setMsg({ mal: true, txt: e?.response?.data?.detail || 'No se pudo guardar.' })
    } finally { setGuardando('') }
  }

  const guardarPlantilla = async () => {
    setGuardando('plantilla'); setMsg(null)
    try {
      const r = await setPlantillaTaller(editando.clave, {
        nombre: editando.nombre, texto: editando.texto,
      })
      setMsg(r.data.desconocidas?.length
        ? { mal: true, txt: `Ojo: {${r.data.desconocidas.join('}, {')}} no existe, saldrá en blanco. Así queda: «${r.data.ejemplo}»` }
        : { txt: `Guardado. Así llegará: «${r.data.ejemplo}»` })
      setEditando(null); cargar()
    } catch (e) {
      setMsg({ mal: true, txt: e?.response?.data?.detail || 'No se pudo guardar.' })
    } finally { setGuardando('') }
  }

  if (cargando) {
    return (
      <div className="card flex items-center justify-center gap-2 p-10 text-dark-400">
        <Loader2 size={15} className="animate-spin" /> Cargando el canal del taller…
      </div>
    )
  }
  if (!d?.pauta) return null
  const p = d.pauta

  return (
    <div className="space-y-4">
      {msg && (
        <p className={`text-[12.5px] ${msg.mal ? 'text-amber-300' : 'text-lime-300'}`}>{msg.txt}</p>
      )}

      {/* ── CADA CUÁNTO ─────────────────────────────────────────────────── */}
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Clock size={15} className="text-brand-300" />
          <h3 className="text-[14px] font-semibold text-dark-100">Cada cuánto se pregunta</h3>
          {guardando === 'pauta' && <Loader2 size={13} className="animate-spin text-dark-500" />}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <label className="flex items-center gap-2 text-[13px] text-dark-300">
            Si lleva
            <input type="number" min="1" max="60" value={p.cada_dias}
              onChange={(e) => guardarPauta({ cada_dias: Number(e.target.value) })}
              className="cifra w-16 rounded-md border border-dark-700 bg-dark-900 px-2 py-1 text-center text-dark-100" />
            días sin decir nada
          </label>

          <label className="flex items-center gap-2 text-[13px] text-dark-300">
            y como mucho
            <input type="number" min="1" max="12" value={p.max_toques}
              onChange={(e) => guardarPauta({ max_toques: Number(e.target.value) })}
              className="cifra w-16 rounded-md border border-dark-700 bg-dark-900 px-2 py-1 text-center text-dark-100" />
            veces
          </label>

          <label className="flex items-center gap-2 text-[13px] text-dark-300">
            entre las
            <input type="number" min="0" max="23" value={p.hora_desde}
              onChange={(e) => guardarPauta({ hora_desde: Number(e.target.value) })}
              className="cifra w-14 rounded-md border border-dark-700 bg-dark-900 px-2 py-1 text-center text-dark-100" />
            y las
            <input type="number" min="0" max="23" value={p.hora_hasta}
              onChange={(e) => guardarPauta({ hora_hasta: Number(e.target.value) })}
              className="cifra w-14 rounded-md border border-dark-700 bg-dark-900 px-2 py-1 text-center text-dark-100" />
          </label>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <span className="mr-1 text-[12.5px] text-dark-400">Días:</span>
          {DIAS.map((n, i) => (
            <button key={n} onClick={() => guardarPauta({
              dias_semana: p.dias_semana.includes(i)
                ? p.dias_semana.filter((x) => x !== i) : [...p.dias_semana, i].sort(),
            })}
              className={`h-7 w-7 rounded-md text-[12px] font-semibold ${
                p.dias_semana.includes(i)
                  ? 'bg-brand-400 text-brand-tinta' : 'bg-dark-800 text-dark-500 hover:text-dark-300'}`}>
              {n}
            </button>
          ))}
          <button onClick={() => guardarPauta({ activa: !p.activa })}
            className={`ml-auto rounded-md px-2.5 py-1 text-[12px] font-semibold ${
              p.activa ? 'bg-lime-500/15 text-lime-300' : 'bg-dark-800 text-dark-400'}`}>
            {p.activa ? 'activo' : 'parado'}
          </button>
        </div>

        {/* Se enseña CUÁNDO le toca a cada una, no solo la regla: «el próximo
            el jueves» se entiende y «cada 3 días» se cambia a ciegas. */}
        {!!d.proximos?.length && (
          <div className="mt-3 border-t border-dark-800 pt-2.5">
            {d.proximos.slice(0, 6).map((x) => (
              <div key={x.numero} className="flex flex-wrap items-baseline gap-x-2 py-1 text-[12.5px]">
                <span className="cifra font-semibold text-dark-200">{x.matricula}</span>
                <span className="text-dark-500">{x.taller}</span>
                <span className={`ml-auto ${x.toca_ahora ? 'text-amber-300' : 'text-dark-500'}`}>
                  {x.toca_ahora ? 'le toca ahora' : x.proximo ? `próximo: ${x.proximo}` : 'no le toca'}
                </span>
                <span className="w-full text-[11.5px] text-dark-600">{x.motivo}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── QUÉ SE DICE ─────────────────────────────────────────────────── */}
      <div className="card p-4">
        <div className="mb-1 flex items-center gap-2">
          <MessageSquare size={15} className="text-brand-300" />
          <h3 className="text-[14px] font-semibold text-dark-100">Qué se les dice</h3>
        </div>
        {/* Repetir el mismo «¿cómo va?» cuatro veces no funciona: quien no
            contestó al primero tampoco contesta al segundo. Cada aviso baja de
            lo abierto a lo cerrado. */}
        <p className="mb-3 text-[12px] leading-relaxed text-dark-500">
          Cada aviso pregunta algo distinto y más concreto que el anterior. Puedes
          usar {Object.keys(d.variables || {}).map((v) => `{${v}}`).join(', ')}.
        </p>

        <div className="space-y-1.5">
          {(d.plantillas || []).map((pl) => (
            <div key={pl.clave} className="rounded-lg border border-dark-800 px-3 py-2">
              {editando?.clave === pl.clave ? (
                <>
                  <textarea value={editando.texto} rows={4}
                    onChange={(e) => setEditando({ ...editando, texto: e.target.value })}
                    className="w-full rounded-md border border-dark-700 bg-dark-900 px-2.5 py-2 text-[12.5px] text-dark-100" />
                  <div className="mt-2 flex gap-2">
                    <button onClick={guardarPlantilla} disabled={guardando === 'plantilla'}
                      className="btn-primary px-3 py-1 text-[12px] disabled:opacity-50">
                      {guardando === 'plantilla' ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button onClick={() => setEditando(null)}
                      className="px-3 py-1 text-[12px] text-dark-400 hover:text-dark-200">Cancelar</button>
                  </div>
                </>
              ) : (
                <button onClick={() => setEditando({ ...pl })} className="w-full text-left">
                  <span className="text-[12.5px] font-semibold text-dark-200">{pl.nombre}</span>
                  <span className="mt-0.5 block whitespace-pre-line text-[12px] leading-relaxed text-dark-500">
                    {pl.texto}
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── LO QUE ELLOS DICEN ──────────────────────────────────────────── */}
      <div className="card p-4">
        <div className="mb-1 flex items-center gap-2">
          <Inbox size={15} className="text-brand-300" />
          <h3 className="text-[14px] font-semibold text-dark-100">Lo que dicen los talleres</h3>
          {!!bandeja?.sin_leer && (
            <span className="cifra rounded-full bg-brand-400/15 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
              {bandeja.sin_leer} sin leer
            </span>
          )}
          {!!bandeja?.sin_asignar && (
            <span className="cifra rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
              {bandeja.sin_asignar} sin saber de cuál hablan
            </span>
          )}
        </div>
        <p className="mb-3 text-[12px] leading-relaxed text-dark-500">
          Aunque no les hayamos preguntado. Si terminan antes, lo dicen y salta aquí.
        </p>

        {bandeja?.mensajes?.length ? (
          <div className="space-y-1.5">
            {bandeja.mensajes.slice(0, 10).map((m) => (
              <div key={m.id} className={`rounded-lg border px-3 py-2 ${
                m.leido ? 'border-dark-800' : 'border-brand-400/30 bg-brand-400/[0.04]'}`}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="cifra text-[12.5px] font-semibold text-dark-200">
                    {m.matricula || '¿qué furgoneta?'}
                  </span>
                  <span className="text-[12px] text-dark-500">{m.taller_nombre}</span>
                  <span className="ml-auto text-[11.5px] text-dark-600">{(m.at || '').slice(0, 16).replace('T', ' ')}</span>
                </div>
                <p className="mt-1 text-[12.5px] text-dark-300">{m.texto}</p>
                {!m.leido && (
                  <button onClick={() => marcarLeidoTaller(m.id).then(cargar)}
                    className="mt-1 text-[11.5px] text-dark-500 hover:text-dark-300">marcar leído</button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-[12.5px] text-dark-500">
            Todavía no ha escrito ningún taller.
          </p>
        )}
      </div>
    </div>
  )
}
