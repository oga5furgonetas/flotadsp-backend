import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, Loader2, ShoppingBag, Check, Minus, Plus, Receipt, CreditCard,
  Mail, KeyRound, ShieldCheck, RefreshCw,
} from 'lucide-react'
import {
  tiendaEscaparate, tiendaCrearPedido, tiendaAnularMiPedido, tiendaMisPedidos,
  tiendaCuenta, tiendaVincularCuenta, tiendaFotoBlob, tiendaPagar,
} from '../../services/api'
import { FotoPrenda } from '../../panel/components/TiendaPrendas'

/* ────────────────────────────────────────────────────────────────────────────
   LA TIENDA, EN EL PORTAL DEL CONDUCTOR
   ---------------------------------------------------------------------------
   POR DROPS, Y AQUI NO SE CUENTA LA LOGISTICA.
   La version anterior enseñaba una cuenta atras ("se cierra en 4 dias") y un
   minimo ("faltan 28 prendas para que salga"), porque el proveedor de entonces
   exigia juntar 40 unidades. Eso obligaba a explicarle al conductor como
   funciona nuestro almacen antes de venderle una camiseta, y a pedirle que
   confiara en que se le devolveria si no salia. Con el proveedor de ahora no
   hay minimo ni espera: se compra cuando el ya ha pagado.
   Asi que lo que se enseña es lo que hay — y lo que QUEDA. Un drop de doce
   unidades vende por lo que es, no por un plazo.

   La cuenta de la tienda es SUYA y no la del trabajo (correo personal y
   contraseña propia): el justificante de una compra no tiene por que pasar por
   el correo de la empresa.
   ──────────────────────────────────────────────────────────────────────────── */

const eur = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`

export default function Tienda({ onBack }) {
  const [datos, setDatos] = useState(null)
  const [correo, setCorreo] = useState('')
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
      // Solo el de SU cuenta de tienda: el de la ficha es el del trabajo.
      if (c?.email) setCorreo((v) => v || c.email)
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

  /* EL DESCUENTO DE LOS PRIMEROS. El porcentaje, cuantas plazas quedan y si
     esta persona tiene derecho vienen del servidor, por lo mismo que el
     recargo de talla: aqui solo se pinta. Y se aplica LINEA A LINEA, igual
     que en el backend, porque redondear el total entero daria un centimo de
     diferencia con lo que cobra la tarjeta. */
  const desc = datos?.descuento || {}
  const rebaja = useMemo(() => {
    if (!desc.para_ti || !desc.pct) return 0
    const con = cesta.reduce(
      (s, l) => s + Math.round((l.precio || 0) * (1 - desc.pct) * 100) / 100 * l.cantidad, 0)
    return Math.round((total - con) * 100) / 100
  }, [cesta, total, desc.para_ti, desc.pct])

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
    /* EL CORREO ES SUYO, NO EL DEL TRABAJO. La ficha lleva el de la empresa
       -@winiw.es en 123 de 140- y a ese buzon no tiene acceso: el justificante
       de una compra pagada con su dinero acabaria donde no puede leerlo. Se
       pide aqui, y si lo deja en blanco no se manda ninguno: ya lo pregunta la
       pantalla de la tarjeta. */
    if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) {
      setErr('Ese correo no parece correcto. Revísalo o déjalo en blanco.'); return
    }
    setEnviando(true); setErr('')
    try {
      const r = await tiendaCrearPedido(cesta.map((l) => ({
        prenda: l.prenda, talla: l.talla, cantidad: l.cantidad, personalizado: l.personalizado,
      })), correo)
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
          <p className="text-[15px] font-medium text-dark-200">La ropa todavía no está a la venta</p>
          <p className="mt-1 text-[13px] text-dark-500">Te avisaremos cuando lo esté.</p>
        </div>
      </Marco>
    )
  }

  if (hecho) {
    return (
      <Marco onBack={() => { setHecho(null); onBack() }}>
        <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.06] px-5 py-7 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15">
            <Check size={22} className="text-emerald-400" />
          </div>
          <p className="text-[16px] font-semibold text-dark-50">Es tuyo</p>
          <p className="mt-1.5 font-mono text-[12px] tracking-wide text-dark-400">{hecho.ref}</p>
          <p className="mt-3 text-[22px] font-semibold tabular-nums text-dark-50">{eur(hecho.total)}</p>
          {/* Lo que se aplico DE VERDAD, dicho por el servidor. Entre mirar el
              escaparate y pulsar puede llevarse la ultima plaza otro, asi que
              el numero que vale es este y no el que calculo la cesta. */}
          {hecho.descuento_pct > 0 && (
            <p className="mt-1 text-[12.5px] font-semibold text-brand-400">
              Con el -{Math.round(hecho.descuento_pct * 100)} % de los primeros
            </p>
          )}
          <p className="mx-auto mt-4 max-w-[17rem] text-[12.5px] leading-relaxed text-dark-500">
            Te escribimos para el pago y te avisamos en cuanto llegue a la nave.
          </p>
        </div>
        <MisPedidos pedidos={[hecho, ...pedidos]} pasarela={datos?.pasarela} onCambio={cargar} />
      </Marco>
    )
  }

  const { prendas = [] } = datos

  return (
    <Marco onBack={onBack}>
      {desc.para_ti && desc.quedan > 0 && (
        <p className="mb-4 rounded-2xl border border-brand-500/25 bg-brand-500/[0.07] px-4 py-3 text-[12.5px] leading-relaxed text-dark-200">
          <b className="text-brand-400">-{Math.round(desc.pct * 100)} % por ser de los primeros.</b>{' '}
          Se aplica solo al primer pedido y quedan{' '}
          <b className="text-dark-100">{desc.quedan} de {desc.plazas}</b> plazas.
        </p>
      )}
      {datos.aviso && (
        <p className="mb-5 rounded-2xl border border-brand-500/20 bg-brand-500/[0.05] px-4 py-3 text-[12.5px] leading-relaxed text-dark-300">
          {datos.aviso}
        </p>
      )}

      <CuentaTienda cuenta={cuenta} onHecho={cargar} />

      {/* El catálogo. Una columna en el móvil: la foto es el argumento de
          venta y a media pantalla no se ve la prenda. */}
      <div className="mt-6 space-y-5">
        {prendas.map((p) => (
          <Producto key={p.id} p={p} onAñadir={añadir} />
        ))}
      </div>
      {prendas.length === 0 && (
        <p className="mt-10 text-center text-[13px] text-dark-500">
          Todavía no hay nada a la venta.
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

          {rebaja > 0 && (
            <div className="mt-3 space-y-1">
              <div className="flex items-baseline justify-between text-[13px] text-dark-400">
                <span>Subtotal</span>
                <span className="tabular-nums">{eur(total)}</span>
              </div>
              <div className="flex items-baseline justify-between text-[13px] text-brand-400">
                <span>Descuento de los {desc.plazas} primeros</span>
                <span className="tabular-nums">-{eur(rebaja)}</span>
              </div>
            </div>
          )}
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-[13px] text-dark-400">Total</span>
            <span className="text-[17px] font-semibold tabular-nums text-dark-100">{eur(total - rebaja)}</span>
          </div>

          <label className="mt-3 block text-[12px] text-dark-400">
            Tu correo, para el justificante
          </label>
          <input type="email" inputMode="email" autoComplete="email" value={correo}
            onChange={(e) => setCorreo(e.target.value)} placeholder="tucorreo@gmail.com"
            className="mt-1 w-full rounded-xl border border-dark-700 bg-dark-950 px-3 py-2.5 text-[15px] text-dark-100" />
          <p className="mt-1 text-[11.5px] leading-snug text-dark-500">
            El tuyo de siempre, no el del trabajo: ahí es donde te llega el recibo.
          </p>

          {err && <p className="mt-2 text-[13px] text-red-400">{err}</p>}

          <button onClick={enviar} disabled={enviando}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-[14px] font-semibold text-dark-950 disabled:opacity-50">
            {enviando && <Loader2 size={15} className="animate-spin" />} Lo quiero
          </button>
          <p className="mt-2 text-center text-[11.5px] leading-snug text-dark-500">
            Te escribimos para el pago. Nada se cobra hasta entonces.
          </p>
        </div>
      )}

      <MisPedidos pedidos={pedidos} pasarela={datos?.pasarela} onCambio={cargar} />
    </Marco>
  )
}

/* El marco. La marca arriba y aire alrededor: lo que separa una tienda de un
   formulario es el espacio, no los adornos. */
function Marco({ children, onBack }) {
  return (
    <div className="min-h-screen bg-dark-950 px-5 pb-16 pt-6">
      <div className="mx-auto max-w-md">
        <button onClick={onBack}
          className="mb-8 flex items-center gap-1.5 text-[13px] text-dark-500 transition-colors hover:text-dark-300">
          <ArrowLeft size={15} /> Volver
        </button>
        <div className="mb-8">
          <div className="text-[28px] font-bold leading-none tracking-tight text-dark-50">
            FDs
          </div>
          <div className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-brand-400">
            Equipo · edicion limitada
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

function Producto({ p, onAñadir }) {
  const [talla, setTalla] = useState('')
  const grande = (p.tallas_grandes || []).includes(talla)
  const precio = (p.precio || 0) + (grande ? (p.recargo_talla || 0) : 0)
  const quedan = p.quedan            // null = sin limite de drop
  const agotado = quedan === 0
  // "Quedan 3" solo cuando de verdad quedan pocas. Ponerlo siempre lo convierte
  // en decorado y deja de significar nada el dia que importa.
  const pocas = typeof quedan === 'number' && quedan > 0 && quedan <= 5

  return (
    <article className={`overflow-hidden rounded-3xl border border-dark-800/80 bg-dark-900/40 ${agotado ? 'opacity-55' : ''}`}>
      <div className="relative flex items-center justify-center overflow-hidden bg-gradient-to-b from-dark-900 to-dark-950">
        <div className={p.foto_ver ? 'w-full' : 'w-[132px] py-6'}>
          <FotoPrenda prenda={p} traer={tiendaFotoBlob}
            datos={{ colores: COLORES, tintas: TINTAS, posiciones: POSICIONES }} cara="delante" />
        </div>
        {agotado && (
          <span className="absolute left-3 top-3 rounded-full bg-dark-950/90 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-dark-400">
            Agotado
          </span>
        )}
        {pocas && (
          <span className="absolute left-3 top-3 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-amber-300">
            Quedan {quedan}
          </span>
        )}
      </div>

      <div className="px-4 pb-4 pt-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15.5px] font-semibold leading-tight text-dark-50">{p.nombre}</h2>
          <div className="shrink-0 text-[17px] font-semibold tabular-nums text-dark-50">
            {eur(precio)}
          </div>
        </div>

        {!agotado && (
          <>
            <div className="mt-3.5 flex flex-wrap gap-1.5">
              {(p.tallas || []).map((t) => (
                <button key={t} onClick={() => setTalla(t)}
                  className={`min-w-[2.6rem] rounded-xl border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                    talla === t
                      ? 'border-dark-100 bg-dark-100 text-dark-950'
                      : 'border-dark-700 text-dark-300 hover:border-dark-500'}`}>
                  {t === 'U' ? 'Única' : t}
                </button>
              ))}
            </div>

            {grande && (
              <p className="mt-2 text-[11.5px] leading-snug text-dark-500">
                La {talla} sube {eur(p.recargo_talla)}: el fabricante cobra más de esa talla en adelante.
              </p>
            )}

            <button onClick={() => talla && onAñadir(p, talla)} disabled={!talla}
              className={`mt-4 w-full rounded-2xl py-3 text-[13.5px] font-semibold transition-colors ${
                talla
                  ? 'bg-dark-50 text-dark-950 hover:bg-white'
                  : 'cursor-not-allowed border border-dark-800 text-dark-600'}`}>
              {talla ? 'Añadir' : 'Elige tu talla'}
            </button>
          </>
        )}
      </div>
    </article>
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

function Anular({ pedido, onHecho }) {
  const [seguro, setSeguro] = useState(false)
  const [yendo, setYendo] = useState(false)
  const [err, setErr] = useState('')

  /* Pregunta antes de hacerlo: el boton vive justo debajo del de pagar y en un
     movil se pulsa con el pulgar. Un pedido anulado por error no se deshace
     desde aqui —hay que pedirlo otra vez y la talla puede haberse agotado—. */
  const hazlo = async () => {
    setYendo(true); setErr('')
    try { await tiendaAnularMiPedido(pedido.id); onHecho?.() } catch (e) {
      setErr(e?.response?.data?.detail || 'No se ha podido anular.')
      setYendo(false); setSeguro(false)
    }
  }

  if (err) return <p className="mt-2 text-[12px] text-red-400">{err}</p>
  if (!seguro) {
    return (
      <button onClick={() => setSeguro(true)}
        className="mt-2 w-full rounded-xl border border-dark-700 py-2 text-[12.5px] text-dark-400">
        Anular este pedido
      </button>
    )
  }
  return (
    <div className="mt-2 flex gap-2">
      <button onClick={hazlo} disabled={yendo}
        className="flex-1 rounded-xl border border-red-500/40 bg-red-500/10 py-2 text-[12.5px] font-semibold text-red-300 disabled:opacity-50">
        {yendo ? 'Anulando…' : 'Sí, anúlalo'}
      </button>
      <button onClick={() => setSeguro(false)}
        className="flex-1 rounded-xl border border-dark-700 py-2 text-[12.5px] text-dark-400">
        Mejor no
      </button>
    </div>
  )
}

function MisPedidos({ pedidos, pasarela, onCambio }) {
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
              {pasarela === 'stripe' && p.estado === 'pendiente_pago' && (
                <BotonPagar pedido={p} />
              )}
              {/* Poder echarse atras uno mismo. Sin esto, equivocarse de talla
                  significaba escribirle a alguien de la oficina, y mientras
                  tanto su unidad seguia apartada del drop sin estar vendida. */}
              {p.estado === 'pendiente_pago' && (
                <Anular pedido={p} onHecho={onCambio} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* Pagar. El enlace lo da el SERVIDOR: aqui no se construye ninguna URL de
   pago ni se toca un importe. Se abre en la misma pestaña a proposito —una
   pestaña nueva en el movil se pierde detras y la gente cree que no ha
   funcionado—. */
function BotonPagar({ pedido }) {
  const [yendo, setYendo] = useState(false)
  const [err, setErr] = useState('')
  return (
    <>
      <button
        disabled={yendo}
        onClick={async () => {
          setYendo(true); setErr('')
          try {
            const r = await tiendaPagar(pedido.id)
            if (r.data?.url) window.location.href = r.data.url
            else { setErr('No se ha podido abrir el pago.'); setYendo(false) }
          } catch (e) {
            setErr(e?.response?.data?.detail || 'No se ha podido abrir el pago.')
            setYendo(false)
          }
        }}
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-dark-50 py-2.5 text-[13px] font-semibold text-dark-950 disabled:opacity-50">
        {yendo ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
        Pagar {eur(pedido.total)}
      </button>
      {err && <p className="mt-1.5 text-[12px] text-red-400">{err}</p>}
    </>
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
