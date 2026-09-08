import { useCallback, useEffect, useState } from 'react'
import { Mail, Send, Inbox, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { getCorreoEstado, enviarCorreo } from '../api'

/* EL CORREO DE LA EMPRESA — escribir desde contacto@flotadsp.com.
   ══════════════════════════════════════════════════════════════════════════
   A Dani le piden que conteste desde esa dirección y no tenía forma: el buzón
   recibe, pero escribir desde él exige montar un cliente de correo con ese
   dominio. La aplicación ya manda correos desde ahí, así que lo que faltaba
   era una caja donde escribir y un sitio donde volver a mirarlo.

   TRES COSAS QUE APRENDIMOS AL PRIMER USO REAL:

   · UN BOTÓN APAGADO TIENE QUE DECIR POR QUÉ. La primera versión exigía dos
     letras de asunto y no lo contaba: se escribía un correo entero, se pulsaba
     «Enviar» y no pasaba nada. Un botón que no responde y no explica nada es
     peor que uno que da error.
   · «PARA» ES A QUIÉN ESCRIBES, no tu propia dirección. En el primer intento
     se puso `contacto@flotadsp.com` en Para —que es DE DONDE sale— y el
     destinatario real en «responder a». Ahora cada campo dice de qué va y se
     avisa si te escribes a ti mismo.
   · LO RECIBIDO NO ESTÁ AQUÍ TODAVÍA, y se dice. `contacto@flotadsp.com` se
     reenvía hoy al Gmail personal (Cloudflare Email Routing), así que los
     correos que llegan viven allí. Enseñar una bandeja vacía haciendo creer
     que no ha entrado nada sería justo el tipo de cero que engaña. */

const VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/

export default function Correo() {
  const [d, setD] = useState(null)
  const [pestana, setPestana] = useState('escribir')
  const [para, setPara] = useState('')
  const [asunto, setAsunto] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [responder, setResponder] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [yendo, setYendo] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const cargar = useCallback(() => {
    getCorreoEstado()
      .then((r) => { setD(r.data); setResponder((v) => v || r.data.responder_a || '') })
      .catch((e) => setErr(e?.response?.status === 403
        ? 'El correo de la empresa es solo para el super-admin.'
        : 'No se ha podido leer la configuración del correo.'))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const miDireccion = (d?.de || '').replace(/.*<|>.*/g, '').toLowerCase()
  /* El motivo por el que NO se puede enviar, uno y en cristiano. Es lo que
     convierte un botón muerto en una instrucción. */
  const falta = !para.trim() ? 'Falta a quién se lo mandas.'
    : !VALIDO.test(para.trim()) ? 'Ese correo de destino no parece válido.'
    : para.trim().toLowerCase() === miDireccion ? 'Ese es tu propio correo: en «para» va a quién le escribes.'
    : !asunto.trim() ? 'Falta el asunto.'
    : !cuerpo.trim() ? 'El mensaje está vacío.'
    : responder.trim() && !VALIDO.test(responder.trim()) ? 'El correo de respuesta no es válido.'
    : d && !d.configurado ? 'El envío de correo no está configurado en el servidor.'
    : ''

  const enviar = async () => {
    setYendo(true); setErr(''); setMsg('')
    try {
      await enviarCorreo({ para: para.trim(), asunto, cuerpo, responder_a: responder.trim() })
      setMsg(`Enviado a ${para.trim()}.`)
      setPara(''); setAsunto(''); setCuerpo(''); setConfirmando(false)
      cargar()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se ha podido enviar.')
      setConfirmando(false)
    } finally { setYendo(false) }
  }

  const Pestana = ({ id, icono: Icono, txt }) => (
    <button onClick={() => setPestana(id)}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] ${
        pestana === id ? 'bg-brand-500/20 font-semibold text-brand-200'
          : 'text-dark-400 hover:text-dark-200'}`}>
      <Icono size={14} /> {txt}
    </button>
  )

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-[19px] font-bold text-dark-50">
          <Mail size={18} /> Correo de la empresa
        </h1>
        <p className="mt-0.5 text-[13px] text-dark-400">
          Sale desde <b className="text-dark-200">{d?.de || '—'}</b>.
        </p>
      </div>

      <div className="flex gap-1">
        <Pestana id="escribir" icono={Send} txt="Escribir" />
        <Pestana id="enviados" icono={CheckCircle2} txt={`Enviados${d?.enviados?.length ? ` (${d.enviados.length})` : ''}`} />
        <Pestana id="recibidos" icono={Inbox} txt="Recibidos" />
      </div>

      {err && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">{err}</p>}

      {pestana === 'escribir' && (
        <div className="card p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="label">Para — a quién le escribes</label>
              <input className="input py-1.5 text-[13px]" placeholder="alguien@empresa.com"
                value={para} onChange={(e) => { setPara(e.target.value); setConfirmando(false) }} />
            </div>
            <div>
              <label className="label">Responder a — dónde quieres la respuesta</label>
              <input className="input py-1.5 text-[13px]" placeholder="tu correo"
                value={responder} onChange={(e) => setResponder(e.target.value)} />
            </div>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-dark-500">
            Sin «responder a», la contestación vuelve al buzón de contacto y puede quedarse
            ahí sin que nadie la vea.
          </p>
          <div className="mt-2">
            <label className="label">Asunto</label>
            <input className="input py-1.5 text-[13px]" value={asunto}
              onChange={(e) => { setAsunto(e.target.value); setConfirmando(false) }} />
          </div>
          <div className="mt-2">
            <label className="label">Mensaje</label>
            <textarea rows={10} className="input w-full text-[13px]" value={cuerpo}
              onChange={(e) => { setCuerpo(e.target.value); setConfirmando(false) }}
              placeholder="Escríbelo tal cual. Los saltos de línea se respetan." />
          </div>

          {msg && <p className="mt-2 text-[12.5px] text-emerald-300">{msg}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!confirmando ? (
              <>
                <button onClick={() => setConfirmando(true)} disabled={!!falta || yendo}
                  className="rounded-lg bg-brand-500/20 px-3 py-1.5 text-[13px] font-semibold text-brand-200 disabled:opacity-40">
                  Enviar
                </button>
                {/* El botón apagado dice por qué. Sin esto se escribe el correo
                    entero, se pulsa y no pasa nada. */}
                {falta && <span className="text-[12.5px] text-amber-300">{falta}</span>}
              </>
            ) : (
              <>
                <span className="text-[12.5px] text-dark-300">
                  Va a salir a <b className="text-dark-100">{para}</b> desde {d?.de}. ¿Lo mando?
                </span>
                <button onClick={enviar} disabled={yendo}
                  className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[13px] font-semibold text-emerald-200 disabled:opacity-50">
                  {yendo ? 'Enviando…' : 'Sí, envíalo'}
                </button>
                <button onClick={() => setConfirmando(false)}
                  className="rounded-lg border border-dark-700 px-3 py-1.5 text-[13px] text-dark-400">
                  Mejor no
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {pestana === 'enviados' && (
        <div className="card p-4">
          {!d && <div className="flex items-center gap-2 text-[13px] text-dark-400"><Loader2 size={14} className="animate-spin" /> Cargando…</div>}
          {d && !d.enviados.length && (
            <p className="text-[13px] text-dark-500">Todavía no has mandado ninguno desde aquí.</p>
          )}
          <div className="space-y-2">
            {(d?.enviados || []).map((x) => (
              <div key={x.id} className="rounded-lg border border-dark-800 p-2.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  {x.ok
                    ? <CheckCircle2 size={13} className="text-emerald-400" />
                    : <XCircle size={13} className="text-red-400" />}
                  <b className="text-[13px] text-dark-100">{x.asunto}</b>
                  <span className="text-[12px] text-dark-400">a {x.para}</span>
                  <span className="ml-auto text-[11.5px] text-dark-600">
                    {String(x.at).slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
                <div className="mt-0.5 text-[11.5px] text-dark-500">
                  respuestas a {x.responder_a || 'el buzón de contacto'} · lo mandó {x.por || '—'}
                  {!x.ok && <b className="ml-1 text-red-400">no salió</b>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pestana === 'recibidos' && (
        <div className="card p-4 text-[13px] leading-relaxed text-dark-300">
          <p className="mb-2 font-semibold text-dark-100">Los recibidos todavía no llegan aquí.</p>
          <p className="mb-2 text-dark-400">
            Ahora mismo <b className="text-dark-200">contacto@flotadsp.com</b> se reenvía
            automáticamente a tu Gmail, así que lo que entra está allí y esta aplicación no
            tiene copia. Preferimos decirlo a enseñarte una bandeja vacía que parezca que
            no ha escrito nadie.
          </p>
          <p className="text-dark-400">
            Se puede traer, y no es mucho trabajo: hay que hacer que ese reenvío pase antes
            por nosotros —guardamos una copia y seguimos mandándotelo al Gmail igual—. Toca
            tu correo de verdad, así que dime tú si lo hacemos.
          </p>
        </div>
      )}
    </div>
  )
}
