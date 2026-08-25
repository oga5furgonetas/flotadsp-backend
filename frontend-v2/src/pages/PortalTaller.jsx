import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { useParams } from 'react-router-dom'
import {
  Loader2, Camera, Check, Euro, MessageSquare, AlertTriangle,
  CalendarClock, History, ThumbsUp, Clock3, X, ChevronLeft, ChevronRight, Wrench,
} from 'lucide-react'
import { API_BASE } from '../lib/apiBase'

/* PORTAL DEL TALLER — sin usuario y sin contraseña, y de UNO EN UNO.
   ═══════════════════════════════════════════════════════════════════════
   Quien abre esto es un mecánico con el móvil en una mano, de pie al lado de
   la furgoneta y con prisa. Antes era un scroll largo con seis bloques: se
   veía todo pero no se sabía por dónde empezar, y lo de abajo no lo miraba
   nadie. Ahora es UNA COSA POR PANTALLA con atrás / siguiente / finalizar.

   Dos reglas que hacen que un paso a paso no estorbe:

     · NADA se guarda al pulsar "Siguiente". Cada acción se guarda sola en el
       momento. Si el taller se va a mitad, lo que ya hizo está guardado —un
       asistente que solo guarda al final es una trampa.
     · SE PUEDE SALTAR CUALQUIER PASO. "Siguiente" nunca está bloqueado. El
       que solo entra a cambiar la fecha no tiene que pasar por las fotos ni
       por el presupuesto.

   Y va en CLARO porque se mira con luz de nave o de calle, con botones de
   56 px para dedos con guantes.

   Cliente HTTP PROPIO, sin interceptores. El `api` del resto de la app mete
   el token de sesión en cada petición y, si algo devuelve 401 dentro de
   /panel, borra la sesión. Aquí no hay sesión que meter ni que borrar. */
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

const PASOS = [
  { id: 'estado', titulo: '¿Cómo va?', icono: Wrench },
  { id: 'fecha', titulo: '¿Para cuándo?', icono: CalendarClock },
  { id: 'fotos', titulo: 'Fotos', icono: Camera },
  { id: 'presupuesto', titulo: 'Presupuesto', icono: Euro },
  { id: 'fin', titulo: 'Resumen', icono: Check },
]

export default function PortalTaller() {
  const { token } = useParams()
  const [orden, setOrden] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [paso, setPaso] = useState(0)

  const [fecha, setFecha] = useState('')
  const [cambiandoFecha, setCambiandoFecha] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [importe, setImporte] = useState('')
  const [detalle, setDetalle] = useState('')
  const [nota, setNota] = useState('')
  const fotoRef = useRef(null)
  const arriba = useRef(null)

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

  /* Al cambiar de paso se sube arriba. Sin esto, en un móvil te quedas a
     media pantalla y parece que no ha pasado nada. */
  useEffect(() => {
    arriba.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [paso])

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
  const tarde = orden.fecha_entrega_estimada && orden.fecha_entrega_estimada < hoyIso()
  /* "Dijisteis que estaría el..." sólo si la fecha la puso EL TALLER. Cuando la
     escribe la oficina al abrir la orden, atribuirles esa promesa es mentir. */
  const laDijeron = orden.entrega_la_dijo_taller
  const actual = PASOS[paso]
  const ultimo = paso === PASOS.length - 1

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-32 text-slate-900">
      <span ref={arriba} />

      {/* ── Cabecera: siempre visible, es el "dónde estoy" ────────────── */}
      <header className="border-b border-slate-200 bg-white px-4 pb-4 pt-6">
        <div className="mx-auto max-w-lg">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-blue-600">
            {orden.numero} · {orden.taller}
          </p>
          <div className="flex items-end gap-3">
            <h1 className="text-[32px] font-extrabold leading-none tracking-tight">
              {orden.matricula}
            </h1>
            <span className={`mb-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ${CHIP[orden.estado] || CHIP.abierta}`}>
              {orden.estado_txt}
            </span>
          </div>
          {orden.modelo && <p className="mt-1 text-[14px] text-slate-500">{orden.modelo}</p>}

          {/* Los pasos, pulsables: el que sólo viene a una cosa va directo. */}
          {!bloqueada && (
            <div className="mt-4 flex items-center gap-1.5">
              {PASOS.map((p, i) => (
                <button key={p.id} onClick={() => setPaso(i)}
                  aria-label={p.titulo}
                  className={`h-2 flex-1 rounded-full transition ${
                    i === paso ? 'bg-blue-600' : i < paso ? 'bg-blue-300' : 'bg-slate-200'}`} />
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">

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

        {/* ¿PUEDEN EMPEZAR? Va en TODOS los pasos, no en uno: un taller parado
            esperando una aprobación que no ve acaba llamando por teléfono. */}
        {orden.presupuesto === 'aprobado' && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3.5">
            <ThumbsUp size={19} className="mt-0.5 flex-none text-emerald-600" />
            <p className="text-[15px] font-bold text-emerald-900">
              Presupuesto aprobado
              <span className="block text-[13.5px] font-normal leading-snug text-emerald-800">
                Podéis seguir adelante. No hace falta que llaméis.
              </span>
            </p>
          </div>
        )}
        {orden.presupuesto === 'pendiente' && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3.5">
            <Clock3 size={19} className="mt-0.5 flex-none text-amber-600" />
            <p className="text-[15px] font-bold text-amber-900">
              Presupuesto pendiente de aprobar
              <span className="block text-[13.5px] font-normal leading-snug text-amber-800">
                Lo estamos mirando. En cuanto se apruebe lo veréis aquí.
              </span>
            </p>
          </div>
        )}
        {orden.presupuesto === 'rechazado' && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 px-4 py-3.5">
            <AlertTriangle size={19} className="mt-0.5 flex-none text-red-600" />
            <p className="text-[15px] font-bold text-red-900">
              Presupuesto no aprobado
              <span className="block text-[13.5px] font-normal leading-snug text-red-800">
                No sigáis hasta hablarlo con la oficina.
              </span>
            </p>
          </div>
        )}

        {bloqueada ? (
          <>
            <p className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-[14.5px] leading-relaxed text-slate-600">
              Esta orden ya está cerrada. Podéis consultarla, pero no cambiar nada.
              Si hace falta algo más, avisad a la oficina.
            </p>
            <Historial orden={orden} />
          </>
        ) : (
          <>
            {/* ── El paso ─────────────────────────────────────────────── */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Paso {paso + 1} de {PASOS.length}
              </p>
              <h2 className="mb-4 flex items-center gap-2 text-[20px] font-bold">
                <actual.icono size={20} className="text-blue-600" /> {actual.titulo}
              </h2>

              {/* 1 · ESTADO */}
              {actual.id === 'estado' && (
                <>
                  {orden.problema && (
                    <div className="mb-4 rounded-xl bg-slate-50 px-3.5 py-3">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Lo que nos han reportado
                      </p>
                      <p className="text-[15px] leading-relaxed text-slate-800">{orden.problema}</p>
                    </div>
                  )}
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
                </>
              )}

              {/* 2 · FECHA */}
              {actual.id === 'fecha' && (
                <>
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
                      <button onClick={() => { setFecha(orden.fecha_entrega_estimada); setCambiandoFecha(true) }}
                        className="mt-2 min-h-[48px] w-full rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-500">
                        Poner otra fecha
                      </button>
                    </>
                  )}

                  {(!orden.fecha_entrega_estimada || cambiandoFecha) && (
                    <>
                      {!orden.fecha_entrega_estimada && (
                        <p className="mb-3 text-[14.5px] leading-relaxed text-slate-500">
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
                      {cambiandoFecha && orden.fecha_entrega_estimada && (
                        <>
                          <p className="mb-2 text-[13.5px] text-slate-500">¿Por qué? (opcional)</p>
                          <div className="mb-4 flex flex-wrap gap-2">
                            {(orden.motivos || []).map((m) => (
                              <button key={m.id} onClick={() => setMotivo(motivo === m.id ? '' : m.id)}
                                className={`min-h-[44px] rounded-full border px-4 text-[14px] font-semibold ${
                                  motivo === m.id ? 'border-blue-600 bg-blue-50 text-blue-700'
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
                </>
              )}

              {/* 3 · FOTOS */}
              {actual.id === 'fotos' && (
                <>
                  <p className="mb-3 text-[14.5px] leading-relaxed text-slate-500">
                    Lo que veáis: la pieza, el daño, cómo va quedando.
                  </p>
                  <button disabled={ocupado === 'fotos'} onClick={() => fotoRef.current?.click()}
                    className="flex min-h-[96px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-[16px] font-semibold text-slate-600 active:bg-slate-100 disabled:opacity-50">
                    {ocupado === 'fotos'
                      ? <><Loader2 size={20} className="animate-spin" /> Enviando…</>
                      : <><Camera size={20} /> Hacer foto o elegir</>}
                  </button>
                  {/* `capture` abre la cámara directamente en el móvil, que es
                      donde se va a usar esto el 100 % de las veces. */}
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
                </>
              )}

              {/* 4 · PRESUPUESTO */}
              {actual.id === 'presupuesto' && (
                <>
                  <p className="mb-3 text-[14.5px] leading-relaxed text-slate-500">
                    Mandad el importe y la oficina lo aprueba desde su lado. No hace falta que llaméis.
                  </p>
                  {orden.importe_estimado != null && (
                    <p className="mb-3 rounded-xl bg-slate-50 px-3.5 py-3 text-[14px] text-slate-600">
                      Enviado: <b className="text-slate-900">{eur(orden.importe_estimado)}</b>
                      {orden.presupuesto === 'pendiente' && ' · pendiente de aprobar'}
                      {orden.presupuesto === 'aprobado' && ' · aprobado'}
                      {orden.presupuesto === 'rechazado' && ' · no aprobado'}
                    </p>
                  )}
                  <input type="text" inputMode="decimal" value={importe} placeholder="0,00 €"
                    onChange={(e) => setImporte(e.target.value)}
                    className="mb-2 min-h-[56px] w-full rounded-xl border border-slate-300 px-3 text-[19px] font-semibold" />
                  <input type="text" value={detalle} placeholder="Qué incluye (opcional)"
                    onChange={(e) => setDetalle(e.target.value)}
                    className="mb-3 min-h-[56px] w-full rounded-xl border border-slate-300 px-3 text-[15px]" />
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
                </>
              )}

              {/* 5 · RESUMEN + NOTA */}
              {actual.id === 'fin' && (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-2">
                    {[['Estado', orden.estado_txt],
                      ['Entrega', orden.fecha_entrega_estimada ? enCristiano(orden.fecha_entrega_estimada) : 'sin decir'],
                      ['Fotos', String((orden.fotos || []).length)],
                      ['Presupuesto', orden.importe_estimado != null ? eur(orden.importe_estimado) : 'sin mandar']].map(([k, v]) => (
                      <div key={k} className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <p className="text-[10.5px] uppercase tracking-wider text-slate-400">{k}</p>
                        <p className="text-[14.5px] font-semibold leading-snug">{v}</p>
                      </div>
                    ))}
                  </div>

                  <p className="mb-2 flex items-center gap-2 text-[15px] font-bold">
                    <MessageSquare size={17} className="text-blue-600" /> ¿Algo más que contarnos?
                  </p>
                  <textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)}
                    placeholder="Lo que sea: una pieza que no llega, algo que habéis visto…"
                    className="w-full rounded-xl border border-slate-300 px-3 py-3 text-[15.5px]" />
                  <button disabled={!nota.trim() || ocupado === 'nota'}
                    onClick={async () => { if (await enviar('nota', 'nota', { nota }, 'Enviado.')) setNota('') }}
                    className="mt-2 min-h-[56px] w-full rounded-xl border border-slate-300 text-[15.5px] font-semibold text-slate-700 disabled:opacity-40">
                    {ocupado === 'nota' ? <Loader2 size={18} className="mx-auto animate-spin" /> : 'Enviar nota'}
                  </button>
                </>
              )}
            </section>

            {/* LO QUE YA SE LE HIZO — sólo en el paso del estado, que es donde
                un mecánico está decidiendo qué le pasa a la furgoneta.
                Se dice QUÉ se hizo pero NUNCA en qué taller: eso es
                información de la flota y a este taller no le incumbe. */}
            {actual.id === 'estado' && !!(orden.ya_estuvo || []).length && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
                  <History size={17} className="text-blue-600" /> Esta furgoneta ya pasó por taller
                </h3>
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
              </section>
            )}

            {ultimo && <Historial orden={orden} />}
          </>
        )}

        <p className="pb-2 pt-1 text-center text-[12.5px] text-slate-400">
          FlotaDSP · esta página es sólo para esta furgoneta
        </p>
      </main>

      {/* ── Barra de navegación, fija abajo ────────────────────────────
          Fija y no al final del scroll: si hay que buscarla, la mitad de la
          gente se queda en el primer paso. */}
      {!bloqueada && (
        <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <button onClick={() => setPaso((p) => Math.max(0, p - 1))} disabled={paso === 0}
              className="flex min-h-[52px] items-center gap-1 rounded-xl border border-slate-300 px-4 text-[15px] font-semibold text-slate-600 disabled:opacity-30">
              <ChevronLeft size={18} /> Atrás
            </button>
            {ultimo ? (
              <button onClick={() => window.close()}
                className="flex min-h-[52px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-[16px] font-semibold text-white active:bg-emerald-700">
                <Check size={19} /> Finalizar
              </button>
            ) : (
              <button onClick={() => setPaso((p) => Math.min(PASOS.length - 1, p + 1))}
                className="flex min-h-[52px] flex-1 items-center justify-center gap-1 rounded-xl bg-blue-600 text-[16px] font-semibold text-white active:bg-blue-700">
                Siguiente <ChevronRight size={18} />
              </button>
            )}
          </div>
          {!ultimo && (
            <p className="mx-auto mt-1.5 max-w-lg text-center text-[12px] text-slate-400">
              Puedes saltarte lo que no aplique — se guarda solo, no al final.
            </p>
          )}
        </nav>
      )}
    </div>
  )
}

/* El historial es la prueba de que lo que escriben llega. Se saca a su propio
   componente porque aparece en dos sitios: en el resumen y en las cerradas. */
function Historial({ orden }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
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
    </section>
  )
}
