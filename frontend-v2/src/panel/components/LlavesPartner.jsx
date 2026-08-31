import { useCallback, useEffect, useState } from 'react'
import { Loader2, Key, Copy, Check, Trash2, Eye } from 'lucide-react'
import {
  getLlavesPartner, crearLlavePartner, revocarLlavePartner, getAccesosPartner,
} from '../api'

/* ACCESO PARA TERCEROS
   ═══════════════════════════════════════════════════════════════════════════
   Lo que le importa a quien audita un DSP no es ver una pantalla: es poder
   sacar el dato a SUS sistemas cuando quiera. Un informe que hay que pedir por
   correo no es trazabilidad, es un favor.

   Tres cosas que esta pantalla tiene que dejar claras, porque son las que
   preguntan antes de aceptar una llave:
     · qué se lleva (y qué no: aquí no sale un solo dato personal),
     · quién ha mirado y cuándo,
     · que se corta en un clic. */

export default function LlavesPartner() {
  const [llaves, setLlaves] = useState(null)
  const [accesos, setAccesos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('Amazon Logistics')
  const [nueva, setNueva] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(() => {
    setCargando(true)
    Promise.all([
      getLlavesPartner().then((r) => r.data.llaves).catch(() => []),
      getAccesosPartner().then((r) => r.data.accesos).catch(() => []),
    ]).then(([l, a]) => { setLlaves(l); setAccesos(a) }).finally(() => setCargando(false))
  }, [])
  useEffect(cargar, [cargar])

  const crear = async () => {
    if (!nombre.trim()) { setMsg({ mal: true, txt: 'Dile de quién es la llave.' }); return }
    setCreando(true); setMsg(null)
    try {
      const r = await crearLlavePartner({ partner: nombre.trim(), dias: 365 })
      setNueva(r.data)
      cargar()
    } catch (e) {
      setMsg({ mal: true, txt: e?.response?.data?.detail || 'No se pudo crear.' })
    } finally { setCreando(false) }
  }

  const revocar = async (id) => {
    try { await revocarLlavePartner(id); cargar() }
    catch { setMsg({ mal: true, txt: 'No se pudo cortar el acceso.' }) }
  }

  const copiar = (t) => {
    navigator.clipboard?.writeText(t)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (cargando) {
    return (
      <div className="flex items-center gap-2 py-8 text-[13px] text-slate-500">
        <Loader2 size={14} className="animate-spin" /> Cargando accesos…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* La llave recién creada. Se enseña UNA vez: a partir de aquí en la base
          solo queda su huella, así que si se pierde hay que hacer otra. */}
      {nueva && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="mb-2 text-[13px] font-semibold text-emerald-900">
            Llave para {nueva.partner}. Cópiala ahora: no se puede volver a ver.
          </p>
          <div className="flex gap-2">
            <input readOnly value={nueva.token}
              className="min-w-0 flex-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-2 font-mono text-[12px] text-slate-700" />
            <button onClick={() => copiar(nueva.token)}
              className="rounded-lg border border-emerald-300 bg-white px-3 text-emerald-700 hover:bg-emerald-100">
              {copiado ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
          <p className="mt-2 font-mono text-[11.5px] leading-relaxed text-emerald-800">
            {nueva.como_se_usa}
          </p>
          <button onClick={() => setNueva(null)}
            className="mt-2 text-[12px] text-emerald-700 hover:underline">Ya la he copiado</button>
        </div>
      )}

      {msg && <p className={`text-[12.5px] ${msg.mal ? 'text-red-600' : 'text-emerald-700'}`}>{msg.txt}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)}
          placeholder="Amazon Logistics"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-2 text-[13px]" />
        <button onClick={crear} disabled={creando}
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-[13px] font-semibold text-white hover:bg-slate-900 disabled:opacity-50">
          <Key size={14} /> {creando ? 'Creando…' : 'Dar acceso'}
        </button>
      </div>

      {llaves?.length ? (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          {llaves.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5 last:border-b-0">
              <span className="text-[13.5px] font-semibold">{l.partner}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                l.activa ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                {l.activa ? 'activa' : l.revocado ? 'cortada' : 'caducada'}
              </span>
              <span className="text-[12.5px] text-slate-500">
                <span className="tabular-nums">{l.accesos}</span> consultas
                {l.ultimo_uso && <> · última el {String(l.ultimo_uso).slice(0, 10)}</>}
              </span>
              <span className="text-[12.5px] text-slate-400">caduca {String(l.expira_en).slice(0, 10)}</span>
              {l.activa && (
                <button onClick={() => revocar(l.id)}
                  className="ml-auto flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-[12px] text-slate-600 hover:bg-red-50 hover:text-red-700">
                  <Trash2 size={13} /> Cortar
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="py-4 text-[13px] text-slate-500">
          Todavía no le has dado acceso a nadie.
        </p>
      )}

      {/* Quién ha mirado y cuándo. La transparencia va en los dos sentidos: si
          les abres tus datos, tienes que poder ver qué consultan. */}
      {!!accesos?.length && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-600">
            <Eye size={14} /> Lo que han consultado
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            {accesos.slice(0, 6).map((a, i) => (
              <div key={`${a.at}-${i}`} className="flex flex-wrap items-baseline gap-2 border-b border-slate-100 px-3 py-2 text-[12.5px] last:border-b-0">
                <span className="font-mono tabular-nums text-slate-400">
                  {String(a.at).slice(0, 16).replace('T', ' ')}
                </span>
                <span className="font-semibold text-slate-700">{a.partner}</span>
                <span className="text-slate-500">consultó {a.recurso}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[12px] leading-relaxed text-slate-500">
        La llave es de solo lectura y no lleva ningún dato personal: ni nombres de
        conductores, ni teléfonos, ni quién conducía cuándo. Se guarda cifrada, así
        que si se pierde hay que cortarla y hacer otra.
      </p>
    </div>
  )
}
