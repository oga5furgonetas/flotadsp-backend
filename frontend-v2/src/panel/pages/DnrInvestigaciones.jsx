import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, MapPin, Ruler, Phone, Copy, Check, Mail, AlertTriangle, Send,
  ExternalLink, Clock, Truck, Wand2, TimerOff, MessageSquare, Link2,
  Building2, CloudOff,
} from 'lucide-react'
import {
  getDnrInvestigaciones, responderDnr, marcarDnrEnviada, preguntarConductorDnr,
  enviarDnr,
} from '../api'

/* ── INVESTIGACIONES DE DNR — contestar a Amazon sin rellenar formularios ────
   ═══════════════════════════════════════════════════════════════════════════
   Cuando un cliente dice que no recibió su paquete, Amazon abre una
   investigación y hay que contestar DÓNDE se entregó. Cada una que se queda sin
   contestar cuenta en contra en la scorecard, y son decenas por semana.

   El portal lo pide con cuatro desplegables por paquete, un botón que genera un
   bloque de texto y un correo que hay que montar a mano. Aquí se hace lo mismo
   pero con dos cosas que allí no hay:

   · EL CONTEXTO DE CORTEX. Lo que de verdad contesta la pregunta no es la
     dirección: es la DISTANCIA entre dónde estaba el destino y dónde estaba el
     repartidor cuando marcó la entrega. A veinte metros, el paquete se dejó en
     esa puerta; a trescientos, la conversación con el conductor es otra. Los
     dos puntos los tiene Cortex y nadie los estaba mirando.

   · LO QUE DIJO EL CONDUCTOR, guardado. La respuesta sale de preguntarle a él,
     no de elegir la opción que mejor suene. Se apunta con la respuesta para
     que dentro de un mes se sepa en qué se basó.

   LA APP PREPARA EL CORREO, NO LO ENVÍA. Declarar ante Amazon dónde se dejó un
   paquete es una afirmación sobre un hecho: la revisa y la manda una persona.
   Y abrir el correo no es haberlo enviado — se marca aparte, como con las ETT. */

const NADA = { completion: '', location: '', additional: '', property: '', building_number: '', building_floor: '', nota: '' }

/* CUÁNTO QUEDA. El plazo son 24 h desde que Amazon abre el caso — lo dice el
   contador de su propia página, no es una cuenta nuestra. Pasado eso ya no se
   puede contestar, y seguir enseñándola como pendiente sería pedir trabajo
   imposible. */
function quedan(vence) {
  if (!vence) return null
  const ms = new Date(vence) - Date.now()
  if (ms <= 0) return { texto: 'fuera de plazo', vencida: true }
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return { texto: h >= 1 ? `quedan ${h} h ${m} min` : `quedan ${m} min`, apura: h < 4 }
}

export default function DnrInvestigaciones() {
  const { center } = useOutletContext() || {}
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [resp, setResp] = useState({})          // tracking -> respuesta
  const [correo, setCorreo] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const [yendo, setYendo] = useState(false)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(() => {
    setErr('')
    getDnrInvestigaciones(center)
      .then((r) => setD(r.data))
      .catch((e) => setErr(e?.response?.data?.detail || 'No se han podido cargar.'))
  }, [center])

  /* RELLENAR LAS QUE AMAZON YA CONTESTA. El escaneo con el que el conductor
     cerró la entrega ES la respuesta: `DELIVERED_TO_GARDEN` son literalmente
     las dos primeras casillas. No se rellena solo al abrir la pantalla a
     propósito — es una declaración a Amazon y la pone una persona, aunque sea
     de un clic. Y solo las `completa`: las que el escaneo no termina de
     contestar se quedan en blanco para preguntarle al conductor. */
  const rellenar = () => {
    const puestas = {}
    for (const x of (d?.investigaciones || [])) {
      if (x.caducada || !x.sugerencia?.completa) continue
      puestas[x.tracking_id] = {
        ...NADA, ...resp[x.tracking_id],
        completion: x.sugerencia.completion,
        location: x.sugerencia.location,
      }
    }
    setResp((r) => ({ ...r, ...puestas }))
  }
  useEffect(() => { cargar() }, [cargar])

  const set = (tba, k, v) => setResp((x) => {
    const antes = x[tba] || { ...NADA }
    /* Al cambiar el tipo de entrega, lo de debajo deja de valer: las opciones
       de «lugar seguro» no existen para «locker». Si no se limpiaran, se
       mandaría una combinación que Amazon rechaza — y rechaza el bloque
       ENTERO, no solo esa fila. */
    const limpio = k === 'completion' ? { ...antes, location: '', additional: '' } : antes
    return { ...x, [tba]: { ...limpio, [k]: v } }
  })

  /* Fuera de las caducadas: mandar una respuesta pasada de plazo no la cuenta
     nadie, y mete una fila de más en un bloque que Amazon rechaza entero si
     algo no le cuadra. */
  const listas = useMemo(() => {
    const fuera = new Set((d?.investigaciones || []).filter((x) => x.caducada)
      .map((x) => x.tracking_id))
    return Object.entries(resp)
      .filter(([tba, r]) => r.completion && !fuera.has(tba))
      .map(([tracking_id, r]) => ({ tracking_id, ...r }))
  }, [resp, d])

  /* SE REFRESCA SOLA. Sin esto la pantalla se carga una vez y ya: mandas el
     WhatsApp, el conductor contesta en treinta segundos y aquí no pasa nada —
     que es exactamente lo que pasó el 15-09-2026 («he probado yo y no ha
     sucedido nada»). La respuesta SÍ había entrado —45 segundos después de
     mandarla—; lo que no se enteraba era la pestaña que estaba abierta.

     Cada 30 s y, sobre todo, AL VOLVER A LA PESTAÑA: el recorrido real es
     mandar el WhatsApp desde el móvil y volver aquí, y ese momento tiene que
     traer el dato de ahora. Mismo patrón que `PanelLayout` con los permisos.

     NO se refresca con trabajo a medias —un correo preparado o respuestas ya
     marcadas—: recargar entonces borraría lo que se está haciendo, que es peor
     que ir un minuto tarde. */
  const congelado = Boolean(correo) || listas.length > 0
  useEffect(() => {
    if (congelado) return undefined
    const t = setInterval(cargar, 30000)
    const alVolver = () => { if (!document.hidden) cargar() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }, [cargar, congelado])

  const preparar = async () => {
    setYendo(true); setErr('')
    try {
      const r = await responderDnr({ center, respuestas: listas })
      setCorreo(r.data); setCopiado(false)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se ha podido preparar el correo.')
    } finally { setYendo(false) }
  }

  /* PREGUNTARLE AL CONDUCTOR. El backend crea el enlace —o devuelve el que ya
     había, porque dos enlaces vivos para el mismo paquete son dos respuestas
     posibles— y el WhatsApp escrito. Aquí solo se abre. */
  const preguntar = async (x) => {
    setErr('')
    try {
      const { data } = await preguntarConductorDnr({ tracking_id: x.tracking_id })
      if (data.sin_telefono) {
        setErr(`${data.conductor || 'Ese conductor'} no tiene teléfono guardado. `
          + `Copia el enlace y mándaselo tú: ${data.url}`)
        return
      }
      window.open(data.wa, '_blank', 'noopener')
      cargar()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se ha podido preparar la pregunta.')
    }
  }

  /* MANDARLO NOSOTROS. Es lo único que funciona con más de tres paquetes: el
     `mailto` mete el bloque entero en la URL y Windows corta por encima de
     ~2.000 caracteres — medido, 5 paquetes ya se pasan. Y un bloque base64
     cortado lo rechaza Amazon ENTERO, llevándose por delante las respuestas
     buenas de esa misma tanda, sin decir por qué. */
  const enviarYa = async () => {
    setYendo(true); setErr('')
    try {
      const { data } = await enviarDnr({ center, respuestas: listas })
      setCorreo(null); setResp({})
      setAviso(`Enviado a Amazon (${data.paquetes} paquete${data.paquetes > 1 ? 's' : ''})`
        + `${data.copia?.length ? `, con copia a ${data.copia.join(', ')}` : ''}. ${data.aviso}`)
      cargar()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se ha podido enviar.')
    } finally { setYendo(false) }
  }

  const marcar = async () => {
    try {
      await marcarDnrEnviada({ tracking_ids: listas.map((x) => x.tracking_id) })
      setCorreo(null); setResp({}); cargar()
    } catch (e) { setErr(e?.response?.data?.detail || 'No se ha podido marcar.') }
  }

  if (err && !d) return <p className="card p-4 text-[13px] text-red-300">{err}</p>
  if (!d) {
    return (
      <div className="flex items-center gap-2 py-10 text-[13px] text-dark-400">
        <Loader2 size={15} className="animate-spin" /> Cargando investigaciones…
      </div>
    )
  }

  const inv = d.investigaciones || []
  // Las que ya ha contestado el conductor y aún no se han mandado: es lo que
  // hay que mirar al volver a la pantalla.
  const contestadas = inv.filter((x) => x.respuesta_conductor && !x.caducada)

  return (
    /* El hueco de abajo es para la barra fija: sin él, la última investigación
       queda tapada justo cuando se va a contestar. */
    <div className={`space-y-3 ${listas.length || correo ? 'pb-24' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[13px] text-dark-300">
          <b className="text-amber-300">{d.vivas ?? inv.length}</b> con el plazo corriendo
          {d.caducadas > 0 && (
            <span className="text-red-400"> · {d.caducadas} fuera de plazo</span>
          )}
          {d.contestadas > 0 && <span className="text-dark-500"> · {d.contestadas} ya contestadas</span>}
        </p>
        {/* El botón sale solo si de verdad hay algo que rellenar. Un botón que
            no hace nada al pulsarlo se deja de pulsar. */}
        {(d.ya_contestadas_por_el_escaneo || 0) > 0 && (
          <button onClick={rellenar}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-500/40 px-3 py-1.5 text-[12.5px] text-brand-200 hover:bg-brand-500/10">
            <Wand2 size={14} /> Rellenar las {d.ya_contestadas_por_el_escaneo} que ya contesta el escaneo
          </button>
        )}
      </div>
      {/* DE QUE NAVES HA LLEGADO EL INFORME, Y DE CUALES NO.
          Una lista vacia se lee como «esta nave no tiene ninguna», y eso puede
          ser mentira: el 15-09-2026 las de DGA1 no salian porque su informe no
          se habia bajado NUNCA, no porque no las hubiera. Desde la pantalla las
          dos cosas se veian igual. Ahora no: una nave sin informe sale dicha,
          en rojo, porque es trabajo sin hacer al que se le escapa el plazo. */}
      {Array.isArray(d.naves) && d.naves.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {d.naves.map((n) => (
            <span key={n.centro}
              title={n.tiene_informe
                ? `Ultimo informe: ${new Date(n.ultimo).toLocaleString('es-ES')}`
                : 'No ha llegado ningun informe de investigaciones de esta nave'}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] ${
                n.tiene_informe
                  ? 'border-white/10 bg-white/[0.04] text-dark-300'
                  : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
              {n.tiene_informe ? <Building2 size={11} /> : <CloudOff size={11} />}
              <b>{n.centro}</b>
              {n.tiene_informe
                ? <span className="text-dark-500">{n.abiertas} abierta{n.abiertas === 1 ? '' : 's'}</span>
                : <span>sin informe</span>}
            </span>
          ))}
        </div>
      )}
      {Array.isArray(d.naves) && d.naves.some((n) => !n.tiene_informe) && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12.5px] text-red-200">
          <AlertTriangle size={13} className="mr-1.5 inline" />
          De <b>{d.naves.filter((n) => !n.tiene_informe).map((n) => n.centro).join(', ')}</b>{' '}
          no ha llegado el informe de investigaciones. Eso no quiere decir que no tengan:
          quiere decir que no las estamos viendo. Abre una vez «Informes complementarios»
          en Cortex y entrarán las de todas las naves.
        </p>
      )}

      {contestadas.length > 0 && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-300">
          <MessageSquare size={13} className="mr-1.5 inline" />
          <b>{contestadas.length}</b> conductor{contestadas.length > 1 ? 'es han' : ' ha'} contestado:
          {' '}{contestadas.map((x) => x.tracking_id).join(', ')}
        </p>
      )}

      <p className="text-[12px] text-dark-500">
        El plazo son 24 h desde que Amazon abre el caso. Lo que el escaneo del conductor
        no conteste, pregúntaselo a él.
      </p>

      {err && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{err}</p>}
      {aviso && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-300">
          <Check size={13} className="mr-1.5 inline" />{aviso}
          <button onClick={() => setAviso('')} className="ml-2 text-dark-500 hover:text-dark-300">cerrar</button>
        </p>
      )}

      {!inv.length && (
        <p className="card p-6 text-center text-[13px] text-dark-400">
          No hay ninguna abierta. Entran solas con el informe del portal.
        </p>
      )}

      <div className="space-y-2.5">
        {inv.map((x) => (
          <Fila key={x.tracking_id} x={x} r={resp[x.tracking_id] || NADA}
            opciones={d.opciones} set={(k, v) => set(x.tracking_id, k, v)}
            onPreguntar={() => preguntar(x)}
            onUsarRespuesta={() => {
              const rc = x.respuesta_conductor || {}
              setResp((y) => ({ ...y, [x.tracking_id]: {
                ...NADA, ...y[x.tracking_id],
                completion: rc.completion || '', location: rc.location || '',
                additional: rc.additional || '', nota: rc.nota || rc.texto || '',
              } }))
            }} />
        ))}
      </div>

      {/* La barra solo aparece cuando hay algo que mandar, y va FIJA a la
          ventana: con 23 investigaciones la pagina mide 8.400 px y un
          `sticky` al final del contenedor no se pega a nada — el botón se
          quedaba ocho mil píxeles por debajo de donde estabas marcando.
          `bottom-[60px]` para no caer debajo del menú de móvil, que mide 53
          y es `fixed bottom-0 z-40` (gotcha 48). */}
      {listas.length > 0 && !correo && (
        <div className="fixed inset-x-3 bottom-[60px] z-30 mx-auto flex max-w-2xl flex-wrap items-center gap-3 rounded-xl border border-brand-500/30 bg-dark-900/95 px-4 py-3 shadow-lg shadow-black/30 backdrop-blur md:inset-x-6 md:bottom-4">
          <span className="text-[13px] text-dark-200">
            <b className="text-brand-300">{listas.length}</b> respuesta{listas.length > 1 ? 's' : ''} lista{listas.length > 1 ? 's' : ''}
          </span>
          <button onClick={enviarYa} disabled={yendo}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
            {yendo ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Responder a Amazon
          </button>
          {/* El de siempre se queda para cuando falle el envío o se prefiera
              mandarlo desde el correo de la nave. Con más de 3 paquetes avisa. */}
          <button onClick={preparar} disabled={yendo}
            className="inline-flex items-center gap-2 rounded-lg border border-dark-700 px-3 py-2 text-[12.5px] text-dark-300 hover:border-dark-500 disabled:opacity-50">
            <Mail size={14} /> Abrirlo en mi correo
            {listas.length > 3 && <span className="text-amber-300">· se corta con {listas.length}</span>}
          </button>
        </div>
      )}

      {correo && <Correo correo={correo} n={listas.length} copiado={copiado}
        onCopiar={() => { navigator.clipboard?.writeText(correo.cuerpo); setCopiado(true) }}
        onEnviada={marcar} onCerrar={() => setCorreo(null)} />}
    </div>
  )
}

/* ── UNA INVESTIGACIÓN ───────────────────────────────────────────────────── */
/* El texto de una opción, para poder decirlo con palabras en vez de con el
   código de Amazon: «El envío fue dejado en un lugar seguro», no «SAFE_PLACE». */
const opcion = (cat, k) => (cat || {})[k] || k

function Fila({ x, r, opciones, set, onPreguntar, onUsarRespuesta }) {
  const c = x.cortex || {}
  const m = c.metros
  const q = quedan(x.vence)
  /* El semáforo de la distancia. Los cortes no son una opinión: treinta metros
     es el error normal de un GPS de móvil en calle, y por encima de cien ya no
     se puede decir que sea la misma puerta. Entre medias, se dice que es
     dudoso en vez de fingir que se sabe. */
  const tono = m == null ? 'text-dark-500'
    : m <= 30 ? 'text-emerald-400' : m <= 100 ? 'text-amber-300' : 'text-red-400'

  return (
    /* Una fuera de plazo se apaga: ya no se puede contestar y tenerla igual de
       viva que las demás hace perder el tiempo justo donde no queda. */
    <div className={`card p-3.5 ${q?.vencida ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[13px] font-semibold text-dark-100">{x.tracking_id}</span>
        <span className="text-[12px] text-dark-400">{x.entregado_en}</span>
        <span className="rounded bg-dark-800 px-1.5 py-px text-[11px] text-dark-300">{x.scan}</span>
        {x.esperando_confirmacion && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
            x.sin_confirmar_horas > 24 ? 'bg-red-500/15 text-red-300' : 'bg-sky-500/15 text-sky-300'}`}>
            <Send size={11} />
            {x.sin_confirmar_horas > 24
              ? `enviada hace ${Math.round(x.sin_confirmar_horas)} h y Amazon no la confirma`
              : 'enviada · esperando a que Amazon lo confirme'}
          </span>
        )}
        {q && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
            q.vencida ? 'bg-red-500/15 text-red-300'
              : q.apura ? 'bg-amber-500/15 text-amber-300' : 'bg-white/[0.04] text-dark-300'}`}>
            {q.vencida ? <TimerOff size={11} /> : <Clock size={11} />} {q.texto}
          </span>
        )}
      </div>

      {/* LO QUE YA CONTESTA EL ESCANEO. No es una suposición nuestra: es lo que
          el conductor declaró al entregar, en el sistema de Amazon. */}
      {x.sugerencia?.completa ? (
        <p className="mt-1.5 text-[12px] text-emerald-400/90">
          <Check size={11} className="mr-1 inline" />
          El escaneo ya lo contesta: <b>{opcion(opciones.completion, x.sugerencia.completion)}</b>
          {x.sugerencia.location && <> · <b>{opcion((opciones.location || {})[x.sugerencia.completion], x.sugerencia.location)}</b></>}
        </p>
      ) : x.sugerencia?.porque ? (
        <p className="mt-1.5 text-[12px] text-amber-300/80">
          <AlertTriangle size={11} className="mr-1 inline" />
          {x.sugerencia.porque}
        </p>
      ) : null}

      {/* Lo que sabe Cortex. Si no sabe nada, se dice: un paquete de hace más
          de dos semanas ya no está, y un hueco en blanco parecería un fallo. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
        {c.en_cortex ? (
          <>
            {/* La direccion primero: es lo que se lee en voz alta al conductor
                para preguntarle. El mapa del DESTINO va aqui, y el de donde
                marco la entrega mas abajo — son dos sitios distintos y esa
                diferencia es justo la pregunta. */}
            {(c.direccion || c.mapa_destino) && (
              <span className="inline-flex items-center gap-1 text-dark-200">
                <MapPin size={12} className="text-dark-600" />
                {c.mapa_destino ? (
                  <a href={c.mapa_destino} target="_blank" rel="noopener noreferrer"
                    className="hover:underline">
                    {c.direccion || 'a qué puerta iba'}
                    <ExternalLink size={10} className="ml-1 inline" />
                  </a>
                ) : (<>{c.direccion}{c.ciudad ? `, ${c.ciudad}` : ''}</>)}
              </span>
            )}
            {c.ruta && (
              <span className="inline-flex items-center gap-1 text-dark-300">
                <Truck size={12} className="text-dark-600" /> {c.ruta} · {c.dia}
              </span>
            )}
            {c.conductor && (
              <span className="inline-flex items-center gap-1 text-dark-300">
                {c.conductor}
                {/* El enlace lo arma el backend con `enlace_wa`, con la
                    pregunta ya escrita. Si viene vacío es que esa persona no
                    tiene teléfono guardado, y eso se DICE (gotcha 47). */}
                {c.wa ? (
                  <a href={c.wa} target="_blank" rel="noopener noreferrer"
                    className="ml-1 inline-flex items-center gap-1 text-emerald-400 hover:underline">
                    <Phone size={11} /> preguntarle
                  </a>
                ) : (
                  <span className="ml-1 text-dark-600">sin teléfono guardado</span>
                )}
              </span>
            )}
            {m != null && (
              <span className={`inline-flex items-center gap-1 font-semibold ${tono}`}>
                <Ruler size={12} /> {m} m del destino
                <span className="font-normal text-dark-500">
                  {m <= 30 ? '· coincide' : m <= 100 ? '· cerca' : '· lejos'}
                </span>
              </span>
            )}
            {c.mapa && (
              <a href={c.mapa} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-brand-300 hover:underline">
                <MapPin size={12} /> dónde lo dejó <ExternalLink size={10} />
              </a>
            )}
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-amber-300/80">
            <AlertTriangle size={12} /> Este paquete ya no está en Cortex: pregúntale al conductor sin más contexto.
          </span>
        )}
      </div>

      {/* LO QUE CONTESTÓ EL CONDUCTOR. Viene ya traducido a las casillas de
          Amazon —los botones de su página SON el catálogo—, así que no hay que
          interpretar nada: se revisa y se usa. */}
      {x.respuesta_conductor ? (
        <div className="mt-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
          <p className="text-[12.5px] text-emerald-300">
            <MessageSquare size={12} className="mr-1 inline" />
            El conductor dice: <b>{x.respuesta_conductor.texto}</b>
            <span className="ml-1.5 text-dark-500">
              · {new Date(x.respuesta_conductor.en).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </p>
          {x.respuesta_conductor.nota && (
            <p className="mt-0.5 text-[12px] text-dark-300">«{x.respuesta_conductor.nota}»</p>
          )}
          {x.respuesta_conductor.completion && (
            <button onClick={onUsarRespuesta}
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-2.5 py-1 text-[12px] text-emerald-300 hover:bg-emerald-500/10">
              <Check size={12} /> Usar su respuesta
            </button>
          )}
        </div>
      ) : !x.caducada && (
        <button onClick={onPreguntar}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-dark-700 px-2.5 py-1.5 text-[12px] text-dark-300 hover:border-dark-500">
          <Link2 size={12} />
          {x.preguntado_en ? 'Volver a preguntarle por WhatsApp' : 'Preguntarle por WhatsApp'}
          {x.preguntado_en && (
            <span className="text-dark-600">
              · enviado el {new Date(x.preguntado_en).toLocaleDateString('es-ES')}
            </span>
          )}
        </button>
      )}

      {/* Las respuestas */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Sel label="Cómo se entregó" value={r.completion} onChange={(v) => set('completion', v)}
          opts={opciones.completion} />
        <Sel label="Dónde" value={r.location} onChange={(v) => set('location', v)}
          opts={(opciones.location || {})[r.completion]} dep={!r.completion} />
        <Sel label="Detalle" value={r.additional} onChange={(v) => set('additional', v)}
          opts={(opciones.additional || {})[r.completion]} dep={!r.completion} />
        <Sel label="Tipo de edificio" value={r.property} onChange={(v) => set('property', v)}
          opts={opciones.property} />
      </div>

      {r.completion && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[110px_110px_1fr]">
          <div>
            <label className="label">Nº portal</label>
            <input className="input py-1.5 text-[12.5px]" value={r.building_number}
              onChange={(e) => set('building_number', e.target.value)} />
          </div>
          <div>
            <label className="label">Planta</label>
            <input className="input py-1.5 text-[12.5px]" value={r.building_floor}
              onChange={(e) => set('building_floor', e.target.value)} />
          </div>
          <div>
            <label className="label">Lo que dijo el conductor</label>
            <input className="input py-1.5 text-[12.5px]" value={r.nota}
              placeholder="Lo dejó bajo el felpudo, avisó por teléfono antes"
              onChange={(e) => set('nota', e.target.value)} />
          </div>
        </div>
      )}
    </div>
  )
}

function Sel({ label, value, onChange, opts, dep }) {
  const entradas = Object.entries(opts || {})
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input py-1.5 text-[12.5px] disabled:opacity-40" value={value}
        disabled={dep || !entradas.length}
        onChange={(e) => onChange(e.target.value)}>
        <option value="">{dep ? '—' : 'Sin elegir'}</option>
        {entradas.map(([k, txt]) => <option key={k} value={k}>{txt}</option>)}
      </select>
    </div>
  )
}

/* ── EL CORREO, LISTO PARA MANDAR ────────────────────────────────────────── */
function Correo({ correo, n, copiado, onCopiar, onEnviada, onCerrar }) {
  return (
    /* Fijo a la ventana, como la barra que lo abre. Con 23 investigaciones la
       página mide 9.000 px y esto salía al final: pulsabas «Preparar el correo»
       y, desde donde estabas, no pasaba nada.
       `max-h` + scroll propio porque el bloque de Amazon es largo y en un móvil
       tapaba la pantalla entera. */
    <div className="card fixed bg-dark-900 backdrop-blur-md inset-x-3 bottom-[60px] z-30 mx-auto max-h-[70vh] max-w-2xl overflow-y-auto border-brand-500/30 p-4 shadow-lg shadow-black/30 md:inset-x-6 md:bottom-4">
      <div className="flex flex-wrap items-center gap-2">
        <Mail size={15} className="text-brand-300" />
        <b className="text-[14px] text-dark-100">Correo listo — {n} respuesta{n > 1 ? 's' : ''}</b>
        <button onClick={onCerrar} className="ml-auto text-[12px] text-dark-500 hover:text-dark-300">
          volver a editar
        </button>
      </div>
      <p className="mt-1 text-[12.5px] text-dark-400">
        Para <b className="text-dark-200">{correo.para}</b> · asunto <b className="text-dark-200">{correo.asunto}</b>
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <a href={correo.mailto}
          className="btn-primary inline-flex items-center gap-2 no-underline">
          <Send size={14} /> Abrir en el correo
        </a>
        <button onClick={onCopiar}
          className="inline-flex items-center gap-2 rounded-lg border border-dark-700 px-3 py-2 text-[12.5px] text-dark-300 hover:border-dark-500">
          {copiado ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          {copiado ? 'Copiado' : 'Copiar el texto'}
        </button>
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-dark-500">
        Revísalo antes de enviarlo: estás declarando ante Amazon dónde se dejó cada paquete.
        Si tu correo no se abre solo, copia el texto y pégalo tal cual — no se puede tocar
        ni una letra del bloque.
      </p>

      <details className="mt-2">
        <summary className="cursor-pointer text-[12px] text-dark-500">Ver el texto</summary>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-dark-800 bg-dark-950 p-2.5 text-[10.5px] leading-snug text-dark-400">
          {correo.cuerpo}
        </pre>
      </details>

      {/* Abrir el correo no es haberlo enviado. Lo confirma una persona: si se
          marcara solo, se dejarían de contestar investigaciones creyendo que ya
          están hechas — que es peor que no marcarlas. */}
      <button onClick={onEnviada}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-[12.5px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25">
        <Check size={14} /> Ya lo he enviado
      </button>
    </div>
  )
}
