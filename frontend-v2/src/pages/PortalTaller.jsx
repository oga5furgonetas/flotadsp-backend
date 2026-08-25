import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { useParams } from 'react-router-dom'
import {
  Loader2, Camera, Check, Euro, MessageSquare, Wrench, AlertTriangle,
  CalendarClock,
} from 'lucide-react'
import { API_BASE } from '../lib/apiBase'

/* PORTAL DEL TALLER — sin usuario y sin contraseña.
   ────────────────────────────────────────────────────────────────────────
   Quien abre esto es un mecánico con el móvil lleno de grasa, de pie al lado
   de la furgoneta. Todo lo que exija recordar algo, escribir mucho o navegar
   por menús no se usa: se coge el teléfono y se llama, que es justo lo que
   esta pantalla viene a quitar. De ahí las decisiones raras a la vista:
   botones enormes, una sola columna, y cada acción se guarda sola sin un
   "guardar" final que nadie pulsaría.

   Cliente HTTP PROPIO, sin interceptores. El `api` del resto de la app mete
   el token de sesión en cada petición y, si algo devuelve 401 dentro de
   /panel, borra la sesión. Aquí no hay sesión que meter ni que borrar, y si
   el taller abre el enlace en el móvil de alguien de oficina no tiene ningún
   sentido mandar sus credenciales a un endpoint público. */
const apiTaller = axios.create({ baseURL: API_BASE, timeout: 60000 })

const COLOR_ESTADO = {
  recibido: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  diagnostico: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  esperando_piezas: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  reparando: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  listo: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  entregado: 'bg-dark-700/40 text-dark-300 border-dark-600',
  anulada: 'bg-dark-700/40 text-dark-400 border-dark-600',
  abierta: 'bg-dark-700/40 text-dark-300 border-dark-600',
}

const eur = (n) => (n == null ? null
  : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n))

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/* "martes 2 de septiembre" y no "2026-09-02". Quien lee esto está de pie al
   lado de una furgoneta, no delante de una hoja de cálculo. */
const enCristiano = (iso) => {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`
}

const hoyIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* Suma días a una fecha SIN pasar por UTC: `toISOString()` sobre una fecha
   local corre el día en España y la promesa saldría un día antes. */
const masDias = (iso, n) => {
  const base = iso ? new Date(iso + 'T12:00:00') : new Date()
  base.setDate(base.getDate() + n)
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
}

const cuando = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function PortalTaller() {
  const { token } = useParams()
  const [orden, setOrden] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [ocupado, setOcupado] = useState('')

  const [fecha, setFecha] = useState('')
  /* El bloque de fecha tiene dos momentos: enseñar lo prometido, y cambiarlo.
     Mezclarlos en un formulario siempre abierto hacía que no se viera lo que
     habías dicho, que es el dato que más se consulta. */
  const [cambiandoFecha, setCambiandoFecha] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [importe, setImporte] = useState('')
  const [detalle, setDetalle] = useState('')
  const [nota, setNota] = useState('')
  const fotoRef = useRef(null)

  const cargar = useCallback(async () => {
    setCargando(true); setErr('')
    try {
      const r = await apiTaller.get(`/taller/${token}`)
      setOrden(r.data)
      setFecha(r.data.fecha_entrega_estimada || '')
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo abrir esta orden.')
    } finally { setCargando(false) }
  }, [token])

  useEffect(() => { cargar() }, [cargar])

  /* Un único camino para todo lo que escribe: así el aviso de "guardado", el
     bloqueo del botón y el refresco de la pantalla se comportan igual en las
     cinco acciones y no hay una que se olvide de refrescar. */
  const enviar = async (clave, ruta, cuerpo, mensaje) => {
    setOcupado(clave); setErr(''); setOk('')
    try {
      const r = await apiTaller.post(`/taller/${token}/${ruta}`, cuerpo)
      setOrden(r.data)
      setOk(mensaje)
      setTimeout(() => setOk(''), 4000)
      return true
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo guardar. Inténtalo otra vez.')
      return false
    } finally { setOcupado('') }
  }

  const subirFotos = async (lista) => {
    const fs = Array.from(lista || [])
    if (!fs.length) return
    setOcupado('fotos'); setErr(''); setOk('')
    const fd = new FormData()
    for (const f of fs) fd.append('files', f)
    try {
      const r = await apiTaller.post(`/taller/${token}/fotos`, fd, { timeout: 120000 })
      setOrden(r.data)
      setOk(`${fs.length} foto${fs.length > 1 ? 's' : ''} enviada${fs.length > 1 ? 's' : ''}.`)
      setTimeout(() => setOk(''), 4000)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudieron enviar las fotos.')
    } finally {
      setOcupado('')
      if (fotoRef.current) fotoRef.current.value = ''
    }
  }

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-950">
        <Loader2 size={30} className="animate-spin text-brand-400" />
      </div>
    )
  }

  if (!orden) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-950 p-6">
        <div className="max-w-sm text-center">
          <AlertTriangle size={34} className="mx-auto mb-3 text-amber-400" />
          <h1 className="mb-2 text-lg font-bold text-dark-100">No podemos abrir esta orden</h1>
          <p className="text-[14px] leading-relaxed text-dark-400">{err}</p>
          <p className="mt-3 text-[13px] text-dark-500">
            Si el enlace es antiguo, pídele uno nuevo a la oficina.
          </p>
        </div>
      </div>
    )
  }

  const bloqueada = orden.cerrada

  return (
    <div className="min-h-screen bg-dark-950 pb-16">
      {/* ── Cabecera: lo primero es SIEMPRE de qué furgoneta hablamos ── */}
      <header className="border-b border-dark-800 bg-dark-900 px-4 py-5">
        <div className="mx-auto max-w-lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
            {orden.numero} · {orden.taller}
          </p>
          <h1 className="mt-1 text-[30px] font-extrabold leading-none tracking-tight text-dark-50">
            {orden.matricula}
          </h1>
          {orden.modelo && <p className="mt-1 text-[14px] text-dark-400">{orden.modelo}</p>}
          <span className={`mt-3 inline-block rounded-full border px-3 py-1 text-[12.5px] font-semibold ${COLOR_ESTADO[orden.estado] || COLOR_ESTADO.abierta}`}>
            {orden.estado_txt}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        {err && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[13.5px] text-red-200">{err}</p>
        )}
        {ok && (
          <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[13.5px] text-emerald-200">{ok}</p>
        )}

        {bloqueada && (
          <p className="rounded-lg border border-dark-700 bg-dark-900 px-3 py-3 text-[13.5px] text-dark-300">
            Esta orden ya está cerrada. Puedes consultarla, pero no cambiar nada.
            Si hace falta algo más, avisa a la oficina.
          </p>
        )}

        {/* ── Lo que nos han dicho que pasa ── */}
        {orden.problema && (
          <section className="card p-4">
            <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-dark-500">
              Lo que nos han reportado
            </h2>
            <p className="text-[15px] leading-relaxed text-dark-200">{orden.problema}</p>
          </section>
        )}

        {/* ── 1. Para cuándo ── */}
        {!bloqueada && (
          <section className={`card p-4 ${
            orden.fecha_entrega_estimada && orden.fecha_entrega_estimada < hoyIso()
              ? 'border-amber-500/50' : ''}`}>
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-dark-100">
              <CalendarClock size={17} className="text-brand-400" /> ¿Para cuándo estará?
            </h2>

            {/* LO PROMETIDO, GRANDE. Es lo que se viene a consultar, y hasta
                ahora estaba escondido dentro de un campo de formulario. */}
            {orden.fecha_entrega_estimada && !cambiandoFecha && (
              <>
                <p className="text-[13px] text-dark-500">Dijisteis que estaría el</p>
                <p className="text-[24px] font-bold leading-tight text-dark-50">
                  {enCristiano(orden.fecha_entrega_estimada)}
                </p>
                {orden.motivo_retraso && (
                  <p className="mt-1 text-[13px] text-amber-300/90">{orden.motivo_retraso}</p>
                )}
                {orden.fecha_entrega_estimada < hoyIso() && (
                  <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.08] px-3 py-2 text-[13.5px] text-amber-200">
                    Esa fecha ya pasó. Si se ha retrasado, dínoslo aquí y nos ahorramos la llamada.
                  </p>
                )}

                {/* Los tres atajos de retraso. Un toque, sin teclado. */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[['Un día más', 1], ['Dos días', 2], ['Una semana', 7]].map(([txt, n]) => (
                    <button
                      key={n}
                      disabled={!!ocupado}
                      onClick={() => {
                        const base = orden.fecha_entrega_estimada < hoyIso()
                          ? hoyIso() : orden.fecha_entrega_estimada
                        setFecha(masDias(base, n))
                        setCambiandoFecha(true)
                      }}
                      className="rounded-xl border border-dark-700 bg-dark-900 py-3 text-[14px] font-semibold text-dark-200 disabled:opacity-50"
                    >
                      +{txt}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setFecha(orden.fecha_entrega_estimada); setCambiandoFecha(true) }}
                  className="mt-2 w-full rounded-xl border border-dark-800 py-2.5 text-[13.5px] font-semibold text-dark-400"
                >
                  Poner otra fecha
                </button>
              </>
            )}

            {/* Primera vez, o cambiándola */}
            {(!orden.fecha_entrega_estimada || cambiandoFecha) && (
              <>
                {!orden.fecha_entrega_estimada && (
                  <p className="mb-3 text-[13px] text-dark-500">
                    Es lo que más nos ayuda. Y si luego cambia, se cambia aquí — no pasa nada.
                  </p>
                )}
                {cambiandoFecha && orden.fecha_entrega_estimada && (
                  <p className="mb-2 text-[13px] text-dark-500">
                    Antes: {enCristiano(orden.fecha_entrega_estimada)}
                  </p>
                )}
                <input
                  type="date" value={fecha} min={hoyIso()}
                  onChange={(e) => setFecha(e.target.value)}
                  className="mb-1 w-full rounded-lg border border-dark-700 bg-dark-900 px-3 py-3 text-[17px] text-dark-100"
                />
                {fecha && (
                  <p className="mb-3 text-[14px] font-semibold text-brand-300">
                    {enCristiano(fecha)}
                  </p>
                )}

                {/* El motivo, solo si es un CAMBIO: la primera vez nadie tiene
                    que justificar nada. */}
                {cambiandoFecha && orden.fecha_entrega_estimada && (
                  <>
                    <p className="mb-1.5 text-[12.5px] text-dark-500">¿Por qué? (opcional)</p>
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {(orden.motivos || []).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setMotivo(motivo === m.id ? '' : m.id)}
                          className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
                            motivo === m.id
                              ? 'border-brand-500 bg-brand-500/15 text-brand-200'
                              : 'border-dark-700 text-dark-400'}`}
                        >
                          {m.txt}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <div className="flex gap-2">
                  <button
                    disabled={!fecha || ocupado === 'fecha'}
                    onClick={async () => {
                      const ok = await enviar('fecha', 'entrega', { fecha, motivo },
                        'Apuntado. La oficina ya lo sabe, no hace falta que llaméis.')
                      if (ok) { setCambiandoFecha(false); setMotivo('') }
                    }}
                    className="btn-primary flex-1 py-3 text-[15px] disabled:opacity-40"
                  >
                    {ocupado === 'fecha' ? <Loader2 size={17} className="animate-spin" /> : 'Confirmar fecha'}
                  </button>
                  {cambiandoFecha && (
                    <button
                      onClick={() => { setCambiandoFecha(false); setMotivo('') }}
                      className="rounded-lg border border-dark-700 px-4 text-[14px] font-semibold text-dark-400"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {/* ── 2. Estado ── */}
        {!bloqueada && (
          <section className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-dark-100">
              <Wrench size={17} className="text-brand-400" /> ¿Cómo va?
            </h2>
            <div className="grid gap-2">
              {(orden.estados_posibles || []).map((e) => {
                const activo = e.id === orden.estado
                return (
                  <button
                    key={e.id}
                    disabled={!!ocupado}
                    onClick={() => enviar(e.id, 'estado', { estado: e.id }, `Puesto en "${e.txt}". La oficina ya lo ve.`)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-4 text-left text-[16px] font-semibold transition disabled:opacity-50 ${
                      activo
                        ? 'border-brand-500 bg-brand-500/15 text-brand-200'
                        : 'border-dark-700 bg-dark-900 text-dark-200 hover:border-dark-600'
                    }`}
                  >
                    {e.txt}
                    {ocupado === e.id
                      ? <Loader2 size={18} className="animate-spin" />
                      : activo && <Check size={18} />}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* ── 3. Fotos ── */}
        {!bloqueada && (
          <section className="card p-4">
            <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-dark-100">
              <Camera size={17} className="text-brand-400" /> Fotos del trabajo
            </h2>
            <p className="mb-3 text-[13px] text-dark-500">
              Lo que veas: la pieza, el daño, cómo va quedando.
            </p>
            <button
              disabled={ocupado === 'fotos'}
              onClick={() => fotoRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-dark-600 bg-dark-900 py-6 text-[15.5px] font-semibold text-dark-200 disabled:opacity-50"
            >
              {ocupado === 'fotos'
                ? <><Loader2 size={19} className="animate-spin" /> Enviando…</>
                : <><Camera size={19} /> Hacer foto o elegir</>}
            </button>
            {/* `capture` abre la cámara directamente en el móvil, que es donde
                se va a usar esto el 100% de las veces. */}
            <input
              ref={fotoRef} type="file" accept="image/*" capture="environment" multiple
              className="hidden" onChange={(e) => subirFotos(e.target.files)}
            />
            {!!(orden.fotos || []).length && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {orden.fotos.map((u, i) => (
                  <a key={u + i} href={u} target="_blank" rel="noreferrer">
                    <img src={u} alt="" loading="lazy"
                      className="aspect-square w-full rounded-lg border border-dark-800 object-cover" />
                  </a>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── 4. Presupuesto ── */}
        {!bloqueada && (
          <section className="card p-4">
            <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-dark-100">
              <Euro size={17} className="text-brand-400" /> Presupuesto
            </h2>
            <p className="mb-3 text-[13px] text-dark-500">
              Manda el importe y la oficina lo aprueba desde su lado. No hace falta que llames.
            </p>

            {orden.importe_estimado != null && (
              <p className="mb-3 rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-[13.5px] text-dark-300">
                Enviado: <b className="text-dark-100">{eur(orden.importe_estimado)}</b>
                {orden.presupuesto === 'pendiente' && ' · pendiente de aprobar'}
                {orden.presupuesto === 'aprobado' && ' · aprobado ✅'}
                {orden.presupuesto === 'rechazado' && ' · no aprobado'}
              </p>
            )}

            <div className="flex gap-2">
              <input
                type="text" inputMode="decimal" value={importe} placeholder="0,00 €"
                onChange={(e) => setImporte(e.target.value)}
                className="w-32 rounded-lg border border-dark-700 bg-dark-900 px-3 py-3 text-[16px] text-dark-100"
              />
              <input
                type="text" value={detalle} placeholder="Qué incluye (opcional)"
                onChange={(e) => setDetalle(e.target.value)}
                className="flex-1 rounded-lg border border-dark-700 bg-dark-900 px-3 py-3 text-[15px] text-dark-100"
              />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                disabled={!importe || ocupado === 'presu'}
                onClick={async () => {
                  if (await enviar('presu', 'presupuesto', { importe, detalle, final: false },
                    'Presupuesto enviado. Te avisamos en cuanto lo aprueben.')) {
                    setImporte(''); setDetalle('')
                  }
                }}
                className="btn-primary flex-1 text-[15px] disabled:opacity-40"
              >
                {ocupado === 'presu' ? <Loader2 size={17} className="animate-spin" /> : 'Enviar presupuesto'}
              </button>
              <button
                disabled={!importe || ocupado === 'final'}
                onClick={async () => {
                  if (await enviar('final', 'presupuesto', { importe, detalle, final: true },
                    'Importe final enviado.')) { setImporte(''); setDetalle('') }
                }}
                className="rounded-lg border border-dark-700 px-4 text-[14px] font-semibold text-dark-300 disabled:opacity-40"
              >
                Es el final
              </button>
            </div>
          </section>
        )}

        {/* ── 5. Nota libre ── */}
        {!bloqueada && (
          <section className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-dark-100">
              <MessageSquare size={17} className="text-brand-400" /> Contarnos algo
            </h2>
            <textarea
              rows={3} value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="Lo que sea: una pieza que no llega, algo que habéis visto…"
              className="w-full rounded-lg border border-dark-700 bg-dark-900 px-3 py-3 text-[15px] text-dark-100"
            />
            <button
              disabled={!nota.trim() || ocupado === 'nota'}
              onClick={async () => { if (await enviar('nota', 'nota', { nota }, 'Enviado.')) setNota('') }}
              className="btn-primary mt-2 w-full text-[15px] disabled:opacity-40"
            >
              {ocupado === 'nota' ? <Loader2 size={17} className="animate-spin" /> : 'Enviar'}
            </button>
          </section>
        )}

        {/* ── Historial: la prueba de que lo que escriben llega ── */}
        <section className="card p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-dark-500">
            Todo lo que ha pasado
          </h2>
          <ol className="space-y-3">
            {[...(orden.historial || [])].reverse().map((h, i) => (
              <li key={h.cuando + i} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-brand-500" />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-dark-200">{h.que}</p>
                  {h.detalle && <p className="text-[13.5px] leading-snug text-dark-400">{h.detalle}</p>}
                  <p className="text-[12px] text-dark-600">{cuando(h.cuando)} · {h.quien}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <p className="pt-2 text-center text-[12px] text-dark-600">
          FlotaDSP · esta página es solo para esta furgoneta
        </p>
      </main>
    </div>
  )
}
