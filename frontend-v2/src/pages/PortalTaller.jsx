import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { useParams } from 'react-router-dom'
import {
  Loader2, Camera, Check, Euro, MessageSquare, AlertTriangle,
  CalendarClock, History, ThumbsUp, Clock3, X,
} from 'lucide-react'
import { API_BASE } from '../lib/apiBase'

/* PORTAL DEL TALLER — sin usuario y sin contraseña.
   ═══════════════════════════════════════════════════════════════════════
   Quien abre esto es un mecánico con el móvil en una mano, de pie al lado de
   la furgoneta y con prisa. Todo lo que exija recordar algo, escribir mucho o
   navegar por menús no se usa: se coge el teléfono y se llama, que es justo
   lo que esta pantalla viene a evitar.

   De ahí las decisiones que a primera vista parecen raras:
     · va en CLARO, porque se mira a menudo con luz de nave o de calle;
     · una sola columna y botones de 56 px, para dedos con guantes;
     · cada acción se guarda sola — no hay un "Guardar" final que nadie
       pulsaría y que dejaría el trabajo a medias;
     · lo que se consulta (¿qué furgoneta?, ¿para cuándo?, ¿puedo empezar?)
       va ARRIBA; lo que se escribe, debajo.

   Cliente HTTP PROPIO, sin interceptores. El `api` del resto de la app mete
   el token de sesión en cada petición y, si algo devuelve 401 dentro de
   /panel, borra la sesión. Aquí no hay sesión que meter ni que borrar, y si
   el taller abre el enlace en el móvil de alguien de oficina no tiene ningún
   sentido mandar sus credenciales a un endpoint público. */
const apiTaller = axios.create({ baseURL: API_BASE, timeout: 60000 })

const CHIP = {
  abierta: 'bg-slate-100 text-slate-700 ring-slate-200',
  recibido: 'bg-sky-50 text-sky-700 ring-sky-200',
  diagnostico: 'bg-violet-50 text-violet-700 ring-violet-200',
  esperando_piezas: 'bg-orange-50 text-orange-700 ring-orange-200',
  reparando: 'bg-blue-50 text-blue-700 ring-blue-200',
  listo: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  entregado: 'bg-slate-100 text-slate-500 ring-slate-200',
  anulada: 'bg-slate-100 text-slate-400 ring-slate-200',
}

const eur = (n) => (n == null ? null
  : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n))

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/* "martes 2 de septiembre" y no "2026-09-02". Quien lee esto está de pie al
   lado de una furgoneta, no delante de una hoja de cálculo. */
const enCristiano = (iso) => {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`
}

const fechaCorta = (iso) => {
  if (!iso) return ''
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
  return `${d.getDate()} ${MES_CORTO[d.getMonth()]}`
}

const hoyIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* Suma días SIN pasar por UTC: `toISOString()` sobre una fecha local corre el
   día en España y la promesa saldría un día antes. */
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

/* Una tarjeta y nada más. Existe para que las ocho secciones se vean iguales
   sin repetir doce clases cada vez. */
function Bloque({ titulo, icono: Icono, ayuda, children, aro }) {
  return (
    <section className={`rounded-2xl border bg-white p-5 ${aro || 'border-slate-200'}`}>
      {titulo && (
        <h2 className="mb-1 flex items-center gap-2 text-[16px] font-bold text-slate-900">
          {Icono && <Icono size={18} className="text-blue-600" />} {titulo}
        </h2>
      )}
      {ayuda && <p className="mb-3 text-[13.5px] leading-relaxed text-slate-500">{ayuda}</p>}
      {children}
    </section>
  )
}

export default function PortalTaller() {
  const { token } = useParams()
  const [orden, setOrden] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [ocupado, setOcupado] = useState('')

  const [fecha, setFecha] = useState('')
  /* El bloque de fecha tiene dos momentos: enseñar lo prometido y cambiarlo.
     Mezclarlos en un formulario siempre abierto hacía que no se viera lo que
     habían dicho, que es el dato que más se consulta. */
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
     bloqueo del botón y el refresco se comportan igual en las cinco acciones
     y no hay una que se olvide de refrescar. */
  const enviar = async (clave, ruta, cuerpo, mensaje) => {
    setOcupado(clave); setErr(''); setOk('')
    try {
      const r = await apiTaller.post(`/taller/${token}/${ruta}`, cuerpo)
      setOrden(r.data)
      setOk(mensaje)
      setTimeout(() => setOk(''), 5000)
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
      setTimeout(() => setOk(''), 5000)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudieron enviar las fotos.')
    } finally {
      setOcupado('')
      if (fotoRef.current) fotoRef.current.value = ''
    }
  }

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={30} className="animate-spin text-blue-600" />
      </div>
    )
  }

  if (!orden) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-6">
        <div className="max-w-sm text-center">
          <AlertTriangle size={34} className="mx-auto mb-3 text-orange-500" />
          <h1 className="mb-2 text-lg font-bold text-slate-900">No podemos abrir esta orden</h1>
          <p className="text-[14px] leading-relaxed text-slate-600">{err}</p>
          <p className="mt-3 text-[13px] text-slate-400">
            Si el enlace es antiguo, pídele uno nuevo a la oficina.
          </p>
        </div>
      </div>
    )
  }

  const bloqueada = orden.cerrada
  const pasos = orden.pasos || []
  const paso = orden.paso || 0
  const tarde = orden.fecha_entrega_estimada && orden.fecha_entrega_estimada < hoyIso()
  /* "Dijisteis que estaría el..." sólo si la fecha la puso EL TALLER. Cuando la
     escribe la oficina al abrir la orden, atribuirles esa promesa es mentir. */
  const laDijeron = orden.entrega_la_dijo_taller

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-16 text-slate-900">

      {/* ── Cabecera: de qué furgoneta hablamos y por dónde va ────────── */}
      <header className="border-b border-slate-200 bg-white px-4 pb-5 pt-6">
        <div className="mx-auto max-w-lg">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-blue-600">
            {orden.numero} · {orden.taller}
          </p>
          <h1 className="mt-1 text-[34px] font-extrabold leading-none tracking-tight">
            {orden.matricula}
          </h1>
          {orden.modelo && <p className="mt-1 text-[14.5px] text-slate-500">{orden.modelo}</p>}
          <span className={`mt-3 inline-block rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset ${CHIP[orden.estado] || CHIP.abierta}`}>
            {orden.estado_txt}
          </span>

          {/* EL RECORRIDO. Una etiqueta dice dónde estás; esto dice además
              cuánto queda, que es lo que pregunta todo el mundo. */}
          {!!paso && (
            <div className="mt-5">
              <div className="flex items-center">
                {pasos.map((p, i) => (
                  <div key={p.id} className="flex flex-1 items-center last:flex-none">
                    <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-[12px] font-bold ${
                      i < paso ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      {i < paso - 1 ? <Check size={14} /> : i + 1}
                    </span>
                    {i < pasos.length - 1 && (
                      <span className={`h-1 flex-1 ${i < paso - 1 ? 'bg-blue-600' : 'bg-slate-200'}`} />
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[12.5px] text-slate-500">
                Paso {paso} de {pasos.length} · {orden.estado_txt}
              </p>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">

        {/* Avisos, pegados arriba para que no se pierdan al hacer scroll */}
        {err && (
          <p className="sticky top-2 z-20 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700 shadow-sm">
            <AlertTriangle size={17} className="mt-0.5 flex-none" /> {err}
            <button onClick={() => setErr('')} className="ml-auto flex-none text-red-400"><X size={16} /></button>
          </p>
        )}
        {ok && (
          <p className="sticky top-2 z-20 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] font-medium text-emerald-800 shadow-sm">
            <Check size={17} className="mt-0.5 flex-none" /> {ok}
          </p>
        )}

        {/* ¿PUEDEN EMPEZAR O NO?
            Un taller con un presupuesto sin contestar está parado, y como no
            tiene forma de enterarse, al día siguiente llama a preguntar. La
            respuesta va aquí arriba, antes que nada. */}
        {orden.presupuesto === 'aprobado' && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-4">
            <ThumbsUp size={20} className="mt-0.5 flex-none text-emerald-600" />
            <div>
              <p className="text-[16px] font-bold text-emerald-900">Presupuesto aprobado</p>
              <p className="text-[13.5px] leading-snug text-emerald-800">
                Podéis seguir adelante. No hace falta que llaméis.
              </p>
            </div>
          </div>
        )}
        {orden.presupuesto === 'pendiente' && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4">
            <Clock3 size={20} className="mt-0.5 flex-none text-amber-600" />
            <div>
              <p className="text-[16px] font-bold text-amber-900">Presupuesto enviado, pendiente de aprobar</p>
              <p className="text-[13.5px] leading-snug text-amber-800">
                Lo estamos mirando. En cuanto se apruebe lo veréis aquí mismo.
              </p>
            </div>
          </div>
        )}
        {orden.presupuesto === 'rechazado' && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 px-4 py-4">
            <AlertTriangle size={20} className="mt-0.5 flex-none text-red-600" />
            <div>
              <p className="text-[16px] font-bold text-red-900">Presupuesto no aprobado</p>
              <p className="text-[13.5px] leading-snug text-red-800">
                No sigáis hasta hablarlo con la oficina.
              </p>
            </div>
          </div>
        )}

        {bloqueada && (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-[14px] leading-relaxed text-slate-600">
            Esta orden ya está cerrada. Podéis consultarla, pero no cambiar nada.
            Si hace falta algo más, avisad a la oficina.
          </p>
        )}

        {orden.problema && (
          <Bloque>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Lo que nos han reportado
            </p>
            <p className="text-[16px] leading-relaxed text-slate-800">{orden.problema}</p>
          </Bloque>
        )}

        {/* ── 1. ¿PARA CUÁNDO? ──────────────────────────────────────── */}
        {!bloqueada && (
          <Bloque titulo="¿Para cuándo estará?" icono={CalendarClock}
            aro={tarde ? 'border-amber-300' : ''}>

            {orden.fecha_entrega_estimada && !cambiandoFecha && (
              <>
                <p className="text-[13.5px] text-slate-500">
                  {laDijeron ? 'Dijisteis que estaría el' : 'La entrega prevista es el'}
                </p>
                <p className="text-[26px] font-bold leading-tight tracking-tight">
                  {enCristiano(orden.fecha_entrega_estimada)}
                </p>
                {orden.motivo_retraso && (
                  <p className="mt-1 text-[14px] font-medium text-amber-700">{orden.motivo_retraso}</p>
                )}
                {tarde && (
                  <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-[14px] leading-snug text-amber-900">
                    Esa fecha ya pasó. Si se ha retrasado, decídnoslo aquí y nos ahorramos la llamada.
                  </p>
                )}

                {/* Tres atajos de un toque: sin teclado. Con las manos sucias
                    y el móvil en una mano, nadie escribe una fecha. */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[['Un día más', 1], ['Dos días', 2], ['Una semana', 7]].map(([txt, n]) => (
                    <button key={n} disabled={!!ocupado}
                      onClick={() => {
                        const base = tarde ? hoyIso() : orden.fecha_entrega_estimada
                        setFecha(masDias(base, n)); setCambiandoFecha(true)
                      }}
                      className="min-h-[56px] rounded-xl border border-slate-300 bg-white px-1 text-[14.5px] font-semibold text-slate-700 active:bg-slate-100 disabled:opacity-50">
                      +{txt}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setFecha(orden.fecha_entrega_estimada); setCambiandoFecha(true) }}
                  className="mt-2 min-h-[48px] w-full rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-500">
                  Poner otra fecha
                </button>
              </>
            )}

            {(!orden.fecha_entrega_estimada || cambiandoFecha) && (
              <>
                {!orden.fecha_entrega_estimada && (
                  <p className="mb-3 text-[14px] leading-relaxed text-slate-500">
                    Es lo que más nos ayuda. Y si luego cambia, se cambia aquí — no pasa nada.
                  </p>
                )}
                {cambiandoFecha && orden.fecha_entrega_estimada && (
                  <p className="mb-2 text-[13.5px] text-slate-500">
                    Antes: {enCristiano(orden.fecha_entrega_estimada)}
                  </p>
                )}
                <input type="date" value={fecha} min={hoyIso()}
                  onChange={(e) => setFecha(e.target.value)}
                  className="mb-1 min-h-[56px] w-full rounded-xl border border-slate-300 bg-white px-3 text-[17px]" />
                {fecha && (
                  <p className="mb-3 text-[15px] font-semibold text-blue-700">{enCristiano(fecha)}</p>
                )}

                {/* El motivo, sólo si es un CAMBIO: la primera vez nadie tiene
                    que justificar nada. */}
                {cambiandoFecha && orden.fecha_entrega_estimada && (
                  <>
                    <p className="mb-2 text-[13.5px] text-slate-500">¿Por qué? (opcional)</p>
                    <div className="mb-4 flex flex-wrap gap-2">
                      {(orden.motivos || []).map((m) => (
                        <button key={m.id} onClick={() => setMotivo(motivo === m.id ? '' : m.id)}
                          className={`min-h-[44px] rounded-full border px-4 text-[14px] font-semibold ${
                            motivo === m.id
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-slate-300 text-slate-600'}`}>
                          {m.txt}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <div className="flex gap-2">
                  <button disabled={!fecha || ocupado === 'fecha'}
                    onClick={async () => {
                      const hecho = await enviar('fecha', 'entrega', { fecha, motivo },
                        'Apuntado. La oficina ya lo sabe, no hace falta que llaméis.')
                      if (hecho) { setCambiandoFecha(false); setMotivo('') }
                    }}
                    className="min-h-[56px] flex-1 rounded-xl bg-blue-600 text-[16px] font-semibold text-white active:bg-blue-700 disabled:opacity-40">
                    {ocupado === 'fecha' ? <Loader2 size={18} className="mx-auto animate-spin" /> : 'Confirmar fecha'}
                  </button>
                  {cambiandoFecha && (
                    <button onClick={() => { setCambiandoFecha(false); setMotivo('') }}
                      className="min-h-[56px] rounded-xl border border-slate-300 px-5 text-[14.5px] font-semibold text-slate-500">
                      Cancelar
                    </button>
                  )}
                </div>
              </>
            )}
          </Bloque>
        )}

        {/* ── 2. ¿CÓMO VA? ──────────────────────────────────────────── */}
        {!bloqueada && (
          <Bloque titulo="¿Cómo va?" icono={Check}>
            <div className="grid gap-2">
              {(orden.estados_posibles || []).map((e) => {
                const activo = e.id === orden.estado
                return (
                  <button key={e.id} disabled={!!ocupado}
                    onClick={() => enviar(e.id, 'estado', { estado: e.id }, `Puesto en «${e.txt}». La oficina ya lo ve.`)}
                    className={`flex min-h-[58px] items-center justify-between rounded-xl border px-4 text-left text-[16px] font-semibold transition disabled:opacity-50 ${
                      activo ? 'border-blue-600 bg-blue-50 text-blue-800'
                        : 'border-slate-300 bg-white text-slate-700 active:bg-slate-50'}`}>
                    {e.txt}
                    {ocupado === e.id ? <Loader2 size={19} className="animate-spin" />
                      : activo && <Check size={20} className="text-blue-600" />}
                  </button>
                )
              })}
            </div>
          </Bloque>
        )}

        {/* ── 3. FOTOS ──────────────────────────────────────────────── */}
        {!bloqueada && (
          <Bloque titulo="Fotos del trabajo" icono={Camera}
            ayuda="Lo que veáis: la pieza, el daño, cómo va quedando.">
            <button disabled={ocupado === 'fotos'} onClick={() => fotoRef.current?.click()}
              className="flex min-h-[80px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-[16px] font-semibold text-slate-600 active:bg-slate-100 disabled:opacity-50">
              {ocupado === 'fotos'
                ? <><Loader2 size={20} className="animate-spin" /> Enviando…</>
                : <><Camera size={20} /> Hacer foto o elegir</>}
            </button>
            {/* `capture` abre la cámara directamente en el móvil, que es donde
                se va a usar esto el 100 % de las veces. */}
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" multiple
              className="hidden" onChange={(e) => subirFotos(e.target.files)} />
            {!!(orden.fotos || []).length && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {orden.fotos.map((u, i) => (
                  <a key={u + i} href={u} target="_blank" rel="noreferrer">
                    <img src={u} alt="" loading="lazy"
                      className="aspect-square w-full rounded-xl border border-slate-200 object-cover" />
                  </a>
                ))}
              </div>
            )}
          </Bloque>
        )}

        {/* ── 4. PRESUPUESTO ────────────────────────────────────────── */}
        {!bloqueada && (
          <Bloque titulo="Presupuesto" icono={Euro}
            ayuda="Mandad el importe y la oficina lo aprueba desde su lado. No hace falta que llaméis.">
            {orden.importe_estimado != null && (
              <p className="mb-3 rounded-xl bg-slate-50 px-3.5 py-3 text-[14px] text-slate-600">
                Enviado: <b className="text-slate-900">{eur(orden.importe_estimado)}</b>
                {orden.presupuesto === 'pendiente' && ' · pendiente de aprobar'}
                {orden.presupuesto === 'aprobado' && ' · aprobado'}
                {orden.presupuesto === 'rechazado' && ' · no aprobado'}
              </p>
            )}
            <div className="mb-2 flex gap-2">
              <input type="text" inputMode="decimal" value={importe} placeholder="0,00 €"
                onChange={(e) => setImporte(e.target.value)}
                className="min-h-[56px] w-32 rounded-xl border border-slate-300 px-3 text-[17px]" />
              <input type="text" value={detalle} placeholder="Qué incluye (opcional)"
                onChange={(e) => setDetalle(e.target.value)}
                /* min-w-0: sin esto un input con flex-1 NO encoge por debajo de su
                   ancho natural y se sale de la tarjeta en un movil. */
                className="min-h-[56px] min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-[15px]" />
            </div>
            <div className="flex gap-2">
              <button disabled={!importe || ocupado === 'presu'}
                onClick={async () => {
                  if (await enviar('presu', 'presupuesto', { importe, detalle, final: false },
                    'Presupuesto enviado. Os avisamos en cuanto lo aprueben.')) {
                    setImporte(''); setDetalle('')
                  }
                }}
                className="min-h-[56px] flex-1 rounded-xl bg-blue-600 text-[16px] font-semibold text-white active:bg-blue-700 disabled:opacity-40">
                {ocupado === 'presu' ? <Loader2 size={18} className="mx-auto animate-spin" /> : 'Enviar presupuesto'}
              </button>
              <button disabled={!importe || ocupado === 'final'}
                onClick={async () => {
                  if (await enviar('final', 'presupuesto', { importe, detalle, final: true },
                    'Importe final enviado.')) { setImporte(''); setDetalle('') }
                }}
                className="min-h-[56px] rounded-xl border border-slate-300 px-4 text-[14.5px] font-semibold text-slate-600 disabled:opacity-40">
                Es el final
              </button>
            </div>
          </Bloque>
        )}

        {/* ── 5. NOTA LIBRE ─────────────────────────────────────────── */}
        {!bloqueada && (
          <Bloque titulo="Contarnos algo" icono={MessageSquare}>
            <textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="Lo que sea: una pieza que no llega, algo que habéis visto…"
              className="w-full rounded-xl border border-slate-300 px-3 py-3 text-[15.5px]" />
            <button disabled={!nota.trim() || ocupado === 'nota'}
              onClick={async () => { if (await enviar('nota', 'nota', { nota }, 'Enviado.')) setNota('') }}
              className="mt-2 min-h-[56px] w-full rounded-xl bg-blue-600 text-[16px] font-semibold text-white active:bg-blue-700 disabled:opacity-40">
              {ocupado === 'nota' ? <Loader2 size={18} className="mx-auto animate-spin" /> : 'Enviar'}
            </button>
          </Bloque>
        )}

        {/* LO QUE YA SE LE HIZO.
            Un mecánico que sabe que hace tres meses se cambiaron los discos no
            vuelve a diagnosticar el ruido desde cero. Se dice QUÉ se hizo pero
            NUNCA en qué taller: eso es información de la flota y a este taller
            no le incumbe quién hizo el trabajo anterior. */}
        {!!(orden.ya_estuvo || []).length && (
          <Bloque titulo="Esta furgoneta ya pasó por taller" icono={History}>
            <ul className="space-y-3">
              {orden.ya_estuvo.map((h, i) => (
                <li key={h.fecha + i} className="flex gap-3">
                  <span className="w-[3.6rem] flex-none whitespace-nowrap text-[13px] tabular-nums text-slate-400">
                    {fechaCorta(h.fecha)}
                  </span>
                  <span className="text-[14.5px] leading-snug text-slate-700">{h.que}</span>
                </li>
              ))}
            </ul>
          </Bloque>
        )}

        {/* El historial es la prueba de que lo que escriben llega. */}
        <Bloque>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Todo lo que ha pasado
          </p>
          <ol className="space-y-3.5">
            {[...(orden.historial || [])].reverse().map((h, i) => (
              <li key={h.cuando + i} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-blue-500" />
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold text-slate-800">{h.que}</p>
                  {h.detalle && <p className="text-[14px] leading-snug text-slate-500">{h.detalle}</p>}
                  <p className="text-[12.5px] text-slate-400">{cuando(h.cuando)} · {h.quien}</p>
                </div>
              </li>
            ))}
          </ol>
        </Bloque>

        <p className="pt-2 text-center text-[12.5px] text-slate-400">
          FlotaDSP · esta página es sólo para esta furgoneta
        </p>
      </main>
    </div>
  )
}
