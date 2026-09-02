import { useCallback, useEffect, useState } from 'react'
import { Loader2, MessageSquare, Clock, Inbox } from 'lucide-react'
import {
  getPautaTaller, setPautaTaller, setPlantillaTaller,
  getBandejaTaller, marcarLeidoTaller, asignarMensajeTaller, getOrdenes,
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
  // Ordenes abiertas para poder decir A MANO de cual habla un mensaje que no
  // se pudo clasificar. La pantalla contaba "N sin saber de cual hablan" y la
  // ruta para asignarlos existia desde el 30-08-2026, pero ningun boton la
  // llamaba: el dato se enseñaba y no se podia resolver (02-09-2026).
  const [ordenes, setOrdenes] = useState([])
  const [eleccion, setEleccion] = useState({})

  const cargar = useCallback(() => {
    setCargando(true)
    Promise.all([
      getPautaTaller().then((r) => r.data).catch(() => null),
      getBandejaTaller().then((r) => r.data).catch(() => null),
      getOrdenes({ abiertas: true, limit: 200 }).then((r) => r.data).catch(() => null),
    ]).then(([p, b, o]) => {
      setD(p); setBandeja(b)
      setOrdenes(Array.isArray(o) ? o : (o?.ordenes || o?.items || []))
    }).finally(() => setCargando(false))
  }, [])
  useEffect(cargar, [cargar])

  const asignar = async (m) => {
    const ordenId = eleccion[m.id]
    if (!ordenId) return
    setGuardando('asignar-' + m.id); setMsg(null)
    try {
      const r = await asignarMensajeTaller(m.id, ordenId)
      setMsg({ txt: `Asignado a la orden ${r.data?.orden || ''}.` })
      cargar()
    } catch (e) {
      setMsg({ mal: true, txt: e?.response?.data?.detail || 'No se pudo asignar.' })
    } finally { setGuardando('') }
  }

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
      <div className="rounded-xl border border-slate-200 bg-white flex items-center justify-center gap-2 p-10 text-slate-500">
        <Loader2 size={15} className="animate-spin" /> Cargando el canal del taller…
      </div>
    )
  }
  if (!d?.pauta) return null
  const p = d.pauta

  return (
    <div className="space-y-4">
      {msg && (
        <p className={`text-[12.5px] ${msg.mal ? 'text-amber-700' : 'text-emerald-700'}`}>{msg.txt}</p>
      )}

      {/* ── CADA CUÁNTO ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Clock size={15} className="text-emerald-700" />
          <h3 className="text-[14px] font-semibold text-slate-800">Cada cuánto se pregunta</h3>
          {guardando === 'pauta' && <Loader2 size={13} className="animate-spin text-slate-500" />}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <label className="flex items-center gap-2 text-[13px] text-slate-600">
            Si lleva
            <input type="number" min="1" max="60" value={p.cada_dias}
              onChange={(e) => guardarPauta({ cada_dias: Number(e.target.value) })}
              className="cifra w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-slate-800" />
            días sin decir nada
          </label>

          <label className="flex items-center gap-2 text-[13px] text-slate-600">
            y como mucho
            <input type="number" min="1" max="12" value={p.max_toques}
              onChange={(e) => guardarPauta({ max_toques: Number(e.target.value) })}
              className="cifra w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-slate-800" />
            veces
          </label>

          <label className="flex items-center gap-2 text-[13px] text-slate-600">
            entre las
            <input type="number" min="0" max="23" value={p.hora_desde}
              onChange={(e) => guardarPauta({ hora_desde: Number(e.target.value) })}
              className="cifra w-14 rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-slate-800" />
            y las
            <input type="number" min="0" max="23" value={p.hora_hasta}
              onChange={(e) => guardarPauta({ hora_hasta: Number(e.target.value) })}
              className="cifra w-14 rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-slate-800" />
          </label>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <span className="mr-1 text-[12.5px] text-slate-500">Días:</span>
          {DIAS.map((n, i) => (
            <button key={n} onClick={() => guardarPauta({
              dias_semana: p.dias_semana.includes(i)
                ? p.dias_semana.filter((x) => x !== i) : [...p.dias_semana, i].sort(),
            })}
              className={`h-7 w-7 rounded-md text-[12px] font-semibold ${
                p.dias_semana.includes(i)
                  ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-600'}`}>
              {n}
            </button>
          ))}
          <button onClick={() => guardarPauta({ activa: !p.activa })}
            className={`ml-auto rounded-md px-2.5 py-1 text-[12px] font-semibold ${
              p.activa ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {p.activa ? 'activo' : 'parado'}
          </button>
        </div>

        {/* Se enseña CUÁNDO le toca a cada una, no solo la regla: «el próximo
            el jueves» se entiende y «cada 3 días» se cambia a ciegas. */}
        {!!d.proximos?.length && (
          <div className="mt-3 border-t border-slate-200 pt-2.5">
            {d.proximos.slice(0, 6).map((x) => (
              <div key={x.numero} className="flex flex-wrap items-baseline gap-x-2 py-1 text-[12.5px]">
                <span className="cifra font-semibold text-slate-700">{x.matricula}</span>
                <span className="text-slate-500">{x.taller}</span>
                <span className={`ml-auto ${x.toca_ahora ? 'text-amber-700' : 'text-slate-500'}`}>
                  {x.toca_ahora ? 'le toca ahora' : x.proximo ? `próximo: ${x.proximo}` : 'no le toca'}
                </span>
                <span className="w-full text-[11.5px] text-slate-400">{x.motivo}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── QUÉ SE DICE ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-1 flex items-center gap-2">
          <MessageSquare size={15} className="text-emerald-700" />
          <h3 className="text-[14px] font-semibold text-slate-800">Qué se les dice</h3>
        </div>
        {/* Repetir el mismo «¿cómo va?» cuatro veces no funciona: quien no
            contestó al primero tampoco contesta al segundo. Cada aviso baja de
            lo abierto a lo cerrado. */}
        <p className="mb-3 text-[12px] leading-relaxed text-slate-500">
          Cada aviso pregunta algo distinto y más concreto que el anterior. Puedes
          usar {Object.keys(d.variables || {}).map((v) => `{${v}}`).join(', ')}.
        </p>

        <div className="space-y-1.5">
          {(d.plantillas || []).map((pl) => (
            <div key={pl.clave} className="rounded-lg border border-slate-200 px-3 py-2">
              {editando?.clave === pl.clave ? (
                <>
                  <textarea value={editando.texto} rows={4}
                    onChange={(e) => setEditando({ ...editando, texto: e.target.value })}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-[12.5px] text-slate-800" />
                  <div className="mt-2 flex gap-2">
                    <button onClick={guardarPlantilla} disabled={guardando === 'plantilla'}
                      className="rounded-lg bg-slate-800 font-semibold text-white hover:bg-slate-900 px-3 py-1 text-[12px] disabled:opacity-50">
                      {guardando === 'plantilla' ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button onClick={() => setEditando(null)}
                      className="px-3 py-1 text-[12px] text-slate-500 hover:text-slate-700">Cancelar</button>
                  </div>
                </>
              ) : (
                <button onClick={() => setEditando({ ...pl })} className="w-full text-left">
                  <span className="text-[12.5px] font-semibold text-slate-700">{pl.nombre}</span>
                  <span className="mt-0.5 block whitespace-pre-line text-[12px] leading-relaxed text-slate-500">
                    {pl.texto}
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── LO QUE ELLOS DICEN ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-1 flex items-center gap-2">
          <Inbox size={15} className="text-emerald-700" />
          <h3 className="text-[14px] font-semibold text-slate-800">Lo que dicen los talleres</h3>
          {!!bandeja?.sin_leer && (
            <span className="cifra rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              {bandeja.sin_leer} sin leer
            </span>
          )}
          {!!bandeja?.sin_asignar && (
            <span className="cifra rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              {bandeja.sin_asignar} sin saber de cuál hablan
            </span>
          )}
        </div>
        <p className="mb-3 text-[12px] leading-relaxed text-slate-500">
          Aunque no les hayamos preguntado. Si terminan antes, lo dicen y salta aquí.
        </p>

        {bandeja?.mensajes?.length ? (
          <div className="space-y-1.5">
            {bandeja.mensajes.slice(0, 10).map((m) => (
              <div key={m.id} className={`rounded-lg border px-3 py-2 ${
                m.leido ? 'border-slate-200' : 'border-emerald-300 bg-emerald-50/60'}`}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="cifra text-[12.5px] font-semibold text-slate-700">
                    {m.matricula || '¿qué furgoneta?'}
                  </span>
                  <span className="text-[12px] text-slate-500">{m.taller_nombre}</span>
                  <span className="ml-auto text-[11.5px] text-slate-400">{(m.at || '').slice(0, 16).replace('T', ' ')}</span>
                </div>
                <p className="mt-1 text-[12.5px] text-slate-600">{m.texto}</p>
                {!m.orden_id && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-[11.5px] text-amber-700">¿De qué orden habla?</span>
                    <select value={eleccion[m.id] || ''}
                      onChange={(e) => setEleccion((p) => ({ ...p, [m.id]: e.target.value }))}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-700">
                      <option value="">Elegir orden abierta…</option>
                      {ordenes.map((o) => (
                        <option key={o.id} value={o.id}>
                          {[o.numero, o.matricula, o.taller_nombre].filter(Boolean).join(' · ')}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => asignar(m)} disabled={!eleccion[m.id] || guardando === 'asignar-' + m.id}
                      className="rounded-md bg-slate-800 px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-50">
                      {guardando === 'asignar-' + m.id ? 'Asignando…' : 'Asignar'}
                    </button>
                    {!ordenes.length && <span className="text-[11.5px] text-slate-400">No hay órdenes abiertas.</span>}
                  </div>
                )}
                {!m.leido && (
                  <button onClick={() => marcarLeidoTaller(m.id).then(cargar)}
                    className="mt-1 text-[11.5px] text-slate-500 hover:text-slate-600">marcar leído</button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-[12.5px] text-slate-500">
            Todavía no ha escrito ningún taller.
          </p>
        )}
      </div>
    </div>
  )
}
