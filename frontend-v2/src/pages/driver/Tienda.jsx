import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, Loader2, ShoppingBag, Check, Clock, Minus, Plus, Receipt,
  Mail, KeyRound, ShieldCheck, RefreshCw,
} from 'lucide-react'
import {
  tiendaEscaparate, tiendaCrearPedido, tiendaMisPedidos,
  tiendaCuenta, tiendaVincularCuenta, tiendaFotoBlob,
} from '../../services/api'
import { FotoPrenda } from '../../panel/components/TiendaPrendas'

/* ────────────────────────────────────────────────────────────────────────────
   LA TIENDA, EN EL PORTAL DEL CONDUCTOR
   ---------------------------------------------------------------------------
   Pedido agrupado, no tienda normal: se juntan pedidos hasta el viernes y el
   lunes se encarga todo de una vez. Por eso la pantalla enseña SIEMPRE dos
   cosas que una tienda corriente no tiene —cuánto queda para el cierre y
   cuántas unidades lleva la tanda—: son las que hacen que alguien avise a un
   compañero, y sin llegar al mínimo no sale ninguno.

   Y por eso el precio se ve, pero el compromiso también: si no se llega al
   mínimo se devuelve. Decirlo antes de pagar es lo que evita el enfado después.

   La cuenta de la tienda es SUYA y no la del trabajo (correo personal y
   contraseña propia): el justificante de una compra no tiene por qué pasar por
   el correo de la empresa.
   ──────────────────────────────────────────────────────────────────────────── */

const eur = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`

/* Cuenta atrás en palabras. «2 días» se entiende; una fecha ISO, no. */
function faltan(iso) {
  const ms = new Date(iso).getTime() - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return 'cerrando hoy'
  const h = Math.floor(ms / 3600000)
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))} min`
  if (h < 24) return `${h} h`
  return `${Math.round(h / 24)} días`
}

export default function Tienda({ onBack }) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [cesta, setCesta] = useState([])      // {prenda, talla, cantidad, personalizado}
  const [pedidos, setPedidos] = useState([])
  const [cuenta, setCuenta] = useState(undefined)   // undefined = aún no sé
  const [enviando, setEnviando] = useState(false)
  const [err, setErr] = useState('')
  const [hecho, setHecho] = useState(null)

  const cargar = useCallback(() => {
    setCargando(true)
    Promise.all([
      tiendaEscaparate().then((r) => r.data).catch(() => ({ visible: false })),
      tiendaMisPedidos().then((r) => r.data.pedidos).catch(() => []),
      tiendaCuenta().then((r) => r.data.cliente).catch(() => null),
    ]).then(([e, p, c]) => {
      setDatos(e); setPedidos(p); setCuenta(c)
    }).finally(() => setCargando(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  /* El precio de una talla concreta. La regla la manda el SERVIDOR —que talla
     es grande y cuanto suma vienen en el escaparate—: aqui solo se aplica,
     para que lo que se ve en pantalla sea exactamente lo que se va a cobrar.
     Si el cliente llevara su propia lista de tallas grandes, el dia que
     cambiara se veria un precio y se pagaria otro (gotcha 54). */
  const precioDe = (p, talla) =>
    (p.precio || 0) + ((p.tallas_grandes || []).includes(talla) ? (p.recargo_talla || 0) : 0)

  const total = useMemo(
    () => cesta.reduce((s, l) => s + (l.precio || 0) * l.cantidad, 0), [cesta])

  const añadir = (p, talla) => {
    setErr('')
    setCesta((c) => {
      const i = c.findIndex((l) => l.prenda === p.id && l.talla === talla)
      if (i >= 0) {
        const copia = [...c]
        copia[i] = { ...copia[i], cantidad: Math.min(5, copia[i].cantidad + 1) }
        return copia
      }
      return [...c, { prenda: p.id, nombre: p.nombre, talla, cantidad: 1,
        precio: precioDe(p, talla), lleva_nombre: p.lleva_nombre, personalizado: '' }]
    })
  }
  const cambiar = (i, k, v) => setCesta((c) => c.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  const quitar = (i) => setCesta((c) => c.filter((_, j) => j !== i))

  const enviar = async () => {
    setEnviando(true); setErr('')
    try {
      const r = await tiendaCrearPedido(cesta.map((l) => ({
        prenda: l.prenda, talla: l.talla, cantidad: l.cantidad, personalizado: l.personalizado,
      })))
      setHecho(r.data); setCesta([]); cargar()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se ha podido enviar el pedido.')
    } finally { setEnviando(false) }
  }

  if (cargando) {
    return (
      <Marco onBack={onBack}>
        <div className="flex items-center gap-2 py-10 text-sm text-dark-400">
          <Loader2 size={16} className="animate-spin" /> Cargando…
        </div>
      </Marco>
    )
  }

  if (!datos?.visible) {
    return (
      <Marco onBack={onBack}>
        <div className="rounded-2xl border border-dark-800 bg-dark-900/50 px-5 py-10 text-center">
          <ShoppingBag size={26} className="mx-auto mb-3 text-dark-600" />
          <p className="text-[15px] font-medium text-dark-200">La tienda todavía no está abierta</p>
          <p className="mt-1 text-[13px] text-dark-500">Te avisaremos cuando lo esté.</p>
        </div>
      </Marco>
    )
  }

  if (hecho) {
    return (
      <Marco onBack={() => { setHecho(null); onBack() }}>
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-5 text-center">
          <Check size={26} className="mx-auto mb-2 text-emerald-400" />
          <p className="text-[15px] font-semibold text-dark-100">Pedido enviado</p>
          <p className="mt-1 text-[13px] text-dark-400">
            Referencia <b className="text-dark-200">{hecho.ref}</b> · {eur(hecho.total)}
          </p>
          <p className="mt-3 text-[12.5px] leading-snug text-dark-500">
            Se cierra el {new Date(hecho.cierre).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}.
            Te avisamos para pagarlo. Si la tanda no llega al mínimo, no se cobra nada.
          </p>
        </div>
        <MisPedidos pedidos={[hecho, ...pedidos]} />
      </Marco>
    )
  }

  const { prendas = [], cierre, minimo, unidades } = datos
  const restan = Math.max(0, minimo - unidades)

  return (
    <Marco onBack={onBack}>
      {/* La tanda: es lo que explica por qué esto no es una tienda normal */}
      <div className="mb-4 rounded-2xl border border-dark-800 bg-dark-900/50 p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-dark-100">
          <Clock size={15} className="text-brand-400" /> Se cierra en {faltan(cierre)}
        </div>
        <p className="mt-1 text-[12.5px] leading-snug text-dark-400">
          Se junta todo y se encarga de una vez: por eso sale a este precio.
          {restan > 0
            ? <> Faltan <b className="text-dark-200">{restan} prendas</b> para que salga.</>
            : <> Ya sale: <b className="text-emerald-400">{unidades} prendas</b> pedidas.</>}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-dark-800">
          <div className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${Math.min(100, Math.round((unidades / (minimo || 1)) * 100))}%` }} />
        </div>
        {datos.aviso && <p className="mt-2 text-[12px] text-amber-300">{datos.aviso}</p>}
      </div>

      <CuentaTienda cuenta={cuenta} onHecho={cargar} />

      {/* Catálogo */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {prendas.map((p) => (
          <Producto key={p.id} p={p} onAñadir={añadir} />
        ))}
      </div>
      {prendas.length === 0 && (
        <p className="mt-6 text-center text-[13px] text-dark-500">
          Todavía no hay prendas a la venta.
        </p>
      )}

      {/* Cesta */}
      {cesta.length > 0 && (
        <div className="mt-6 rounded-2xl border border-dark-800 bg-dark-900/50 p-4">
          <div className="mb-2 text-[13px] font-semibold text-dark-100">Tu pedido</div>
          <div className="space-y-2">
            {cesta.map((l, i) => (
              <div key={`${l.prenda}-${l.talla}`} className="rounded-xl border border-dark-800 p-2.5">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-dark-100">{l.nombre}</div>
                    <div className="text-[11.5px] text-dark-500">Talla {l.talla} · {eur(l.precio)}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => cambiar(i, 'cantidad', Math.max(1, l.cantidad - 1))}
                      aria-label="Quitar una" className="rounded-lg border border-dark-700 p-1 text-dark-300">
                      <Minus size={13} />
                    </button>
                    <span className="w-5 text-center text-[13px] tabular-nums text-dark-100">{l.cantidad}</span>
                    <button onClick={() => cambiar(i, 'cantidad', Math.min(5, l.cantidad + 1))}
                      aria-label="Añadir una" className="rounded-lg border border-dark-700 p-1 text-dark-300">
                      <Plus size={13} />
                    </button>
                  </div>
                  <button onClick={() => quitar(i)} className="text-[12px] text-dark-500">Quitar</button>
                </div>
                {l.lleva_nombre && (
                  <input
                    className="mt-2 w-full rounded-lg border border-dark-700 bg-dark-950 px-2.5 py-1.5 text-[13px] text-dark-100"
                    maxLength={20} placeholder="Tu nombre, como quieres que vaya bordado"
                    value={l.personalizado}
                    onChange={(e) => cambiar(i, 'personalizado', e.target.value)} />
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-[13px] text-dark-400">Total</span>
            <span className="text-[17px] font-semibold tabular-nums text-dark-100">{eur(total)}</span>
          </div>

          {err && <p className="mt-2 text-[13px] text-red-400">{err}</p>}

          <button onClick={enviar} disabled={enviando}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-[14px] font-semibold text-dark-950 disabled:opacity-50">
            {enviando && <Loader2 size={15} className="animate-spin" />} Reservar mi pedido
          </button>
          <p className="mt-2 text-center text-[11.5px] leading-snug text-dark-500">
            Reservas ahora y te avisamos para pagar. Si no se llega al mínimo, no se cobra nada.
          </p>
        </div>
      )}

      <MisPedidos pedidos={pedidos} />
    </Marco>
  )
}

function Marco({ children, onBack }) {
  return (
    <div className="min-h-screen bg-dark-950 px-4 py-6">
      <div className="mx-auto max-w-md">
        <button onClick={onBack} className="mb-5 flex items-center gap-1.5 text-[13px] text-dark-400">
          <ArrowLeft size={15} /> Volver
        </button>
        <h1 className="mb-4 text-[19px] font-bold text-dark-50">Tienda</h1>
        {children}
      </div>
    </div>
  )
}

function Producto({ p, onAñadir }) {
  const [talla, setTalla] = useState('')
  const grande = (p.tallas_grandes || []).includes(talla)
  return (
    <div className="overflow-hidden rounded-2xl border border-dark-800 bg-dark-900/50">
      <div className="flex items-center justify-center overflow-hidden bg-dark-950/60">
        <div className={p.foto_ver ? 'w-full' : 'w-[104px] py-2'}>
          <FotoPrenda prenda={p} traer={tiendaFotoBlob}
            datos={{ colores: COLORES, tintas: TINTAS, posiciones: POSICIONES }} cara="delante" />
        </div>
      </div>
      <div className="p-3">
        <div className="text-[14px] font-medium text-dark-100">{p.nombre}</div>
        <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-brand-300">
          {p.recargo_talla > 0 ? <span className="text-[11.5px] font-normal text-dark-500">desde </span> : null}
          {eur(p.precio)}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(p.tallas || []).map((t) => (
            <button key={t} onClick={() => setTalla(t)}
              className={`rounded-lg border px-2.5 py-1 text-[12px] font-medium ${
                talla === t ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                  : 'border-dark-700 text-dark-400'}`}>
              {t}
            </button>
          ))}
        </div>
        {grande && (
          <p className="mt-1.5 text-[11.5px] leading-snug text-dark-400">
            Talla {talla}: {eur(p.precio + (p.recargo_talla || 0))} — el fabricante
            cobra más de la XXL para arriba.
          </p>
        )}
        <button onClick={() => talla && onAñadir(p, talla)} disabled={!talla}
          className="mt-2.5 w-full rounded-xl border border-dark-700 py-2 text-[13px] font-medium text-dark-200 disabled:opacity-40">
          {talla ? 'Añadir' : 'Elige talla'}
        </button>
      </div>
    </div>
  )
}

/* La cuenta de la tienda, con SU correo y SU contraseña. La del trabajo no se
   toca: sigue entrando con la que le dio la oficina. */
function CuentaTienda({ cuenta, onHecho }) {
  const [abierto, setAbierto] = useState(false)
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [err, setErr] = useState('')

  /* Una contraseña sugerida de verdad, del generador del navegador. Se ofrece
     porque la mayoría pone la misma de siempre, y aquí hay dinero de por medio;
     se puede cambiar, no se impone. */
  const sugerir = () => {
    const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const n = new Uint32Array(14)
    crypto.getRandomValues(n)
    setClave([...n].map((x) => abc[x % abc.length]).join(''))
  }

  if (cuenta) {
    return (
      <div className="rounded-2xl border border-dark-800 bg-dark-900/50 p-3">
        <div className="flex items-center gap-2 text-[12.5px] text-dark-400">
          <ShieldCheck size={14} className="text-emerald-400" />
          Tus avisos y justificantes van a <b className="text-dark-200">{cuenta.email}</b>
        </div>
      </div>
    )
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)}
        className="flex w-full items-center gap-2 rounded-2xl border border-brand-500/25 bg-brand-500/[0.06] p-3 text-left">
        <Mail size={15} className="shrink-0 text-brand-400" />
        <span className="text-[12.5px] leading-snug text-dark-300">
          <b className="text-dark-100">Pon tu correo de verdad</b> para recibir el justificante
          y avisar de prendas nuevas. Sigues entrando con la cuenta del trabajo.
        </span>
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-dark-800 bg-dark-900/50 p-4">
      <div className="mb-2 text-[13px] font-semibold text-dark-100">Tu cuenta de la tienda</div>
      <p className="mb-3 text-[12px] leading-snug text-dark-500">
        Es aparte de la del trabajo: con este correo y esta contraseña podrás entrar
        a la tienda también desde fuera.
      </p>
      <label className="mb-1 block text-[12px] text-dark-400">Tu correo</label>
      <input type="email" inputMode="email" autoComplete="email" value={email}
        onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@gmail.com"
        className="mb-3 w-full rounded-xl border border-dark-700 bg-dark-950 px-3 py-2.5 text-[15px] text-dark-100" />
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-[12px] text-dark-400">Contraseña</label>
        <button onClick={sugerir} className="inline-flex items-center gap-1 text-[12px] text-brand-400">
          <RefreshCw size={11} /> Sugerir una segura
        </button>
      </div>
      <input type="text" autoComplete="new-password" value={clave}
        onChange={(e) => setClave(e.target.value)} placeholder="Mínimo 8 caracteres"
        className="w-full rounded-xl border border-dark-700 bg-dark-950 px-3 py-2.5 font-mono text-[14px] text-dark-100" />
      <Fuerza clave={clave} />
      {err && <p className="mt-2 text-[13px] text-red-400">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button
          disabled={ocupado || clave.length < 8 || !email.includes('@')}
          onClick={async () => {
            setOcupado(true); setErr('')
            try {
              await tiendaVincularCuenta(email.trim(), clave)
              onHecho()
            } catch (e) {
              setErr(e?.response?.data?.detail || 'No se ha podido crear.')
            } finally { setOcupado(false) }
          }}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-[13px] font-semibold text-dark-950 disabled:opacity-50">
          {ocupado ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Crear cuenta
        </button>
        <button onClick={() => setAbierto(false)}
          className="rounded-xl border border-dark-700 px-3 text-[13px] text-dark-400">Ahora no</button>
      </div>
    </div>
  )
}

/* Medidor de fuerza. No bloquea: informa. Bloquear por «poca fuerza» hace que
   la gente ponga «Password1!» y se quede tan tranquila. */
function Fuerza({ clave }) {
  if (!clave) return null
  let n = 0
  if (clave.length >= 8) n++
  if (clave.length >= 12) n++
  if (/[a-z]/.test(clave) && /[A-Z]/.test(clave)) n++
  if (/[0-9]/.test(clave)) n++
  if (/[^\w]/.test(clave)) n++
  const txt = ['Muy débil', 'Débil', 'Normal', 'Buena', 'Muy buena'][Math.min(4, Math.max(0, n - 1))]
  const tono = n <= 2 ? 'bg-red-500' : n === 3 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="mt-1.5">
      <div className="h-1 w-full overflow-hidden rounded-full bg-dark-800">
        <div className={`h-full rounded-full ${tono}`} style={{ width: `${(n / 5) * 100}%` }} />
      </div>
      <p className="mt-1 text-[11.5px] text-dark-500">{txt}</p>
    </div>
  )
}

function MisPedidos({ pedidos }) {
  if (!pedidos?.length) return null
  const ESTADOS = {
    pendiente_pago: ['Pendiente de pago', 'text-amber-300'],
    pagado: ['Pagado', 'text-emerald-400'],
    encargado: ['Encargado al taller', 'text-brand-300'],
    entregado: ['Entregado', 'text-dark-400'],
    anulado: ['Anulado', 'text-dark-500'],
  }
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-dark-100">
        <Receipt size={14} /> Mis pedidos
      </div>
      <div className="space-y-2">
        {pedidos.map((p) => {
          const [txt, tono] = ESTADOS[p.estado] || ['—', 'text-dark-400']
          return (
            <div key={p.id} className="rounded-xl border border-dark-800 bg-dark-900/50 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[12px] text-dark-300">{p.ref}</span>
                <span className={`text-[12px] font-medium ${tono}`}>{txt}</span>
              </div>
              <div className="mt-1 text-[12.5px] text-dark-400">
                {(p.lineas || []).map((l) => `${l.cantidad}× ${l.nombre} (${l.talla})`).join(' · ')}
              </div>
              <div className="mt-1 text-[13px] font-semibold tabular-nums text-dark-100">{eur(p.total)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const COLORES = [
  { id: 'negro', nombre: 'Negro', hex: '#16191C', claro: false },
  { id: 'antracita', nombre: 'Antracita', hex: '#3A4046', claro: false },
  { id: 'marino', nombre: 'Azul marino', hex: '#1B2A41', claro: false },
  { id: 'blanco', nombre: 'Blanco', hex: '#F5F7F8', claro: true },
  { id: 'gris', nombre: 'Gris jaspeado', hex: '#B9C0C6', claro: true },
  { id: 'marengo', nombre: 'Gris marengo', hex: '#4A4F54', claro: false },
  { id: 'rosa', nombre: 'Rosa empolvado', hex: '#DDB5B4', claro: true },
  { id: 'crema', nombre: 'Crema', hex: '#E9E2D3', claro: true },
]
const TINTAS = [
  { id: 'blanco', hex: '#F5F7F8' }, { id: 'negro', hex: '#16191C' },
  { id: 'cian', hex: '#14E7D8' }, { id: 'azul', hex: '#0AACD3' },
  { id: 'tonal', hex: null },
]
const POSICIONES = [
  { id: 'pecho', cara: 'delante' }, { id: 'espalda', cara: 'detras' },
  { id: 'manga', cara: 'delante' },
]
