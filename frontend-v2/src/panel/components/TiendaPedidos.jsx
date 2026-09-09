import { useCallback, useEffect, useState } from 'react'
import { Loader2, Store, Check, Package, AlertTriangle, Euro, Trash2, ExternalLink } from 'lucide-react'
import { tiendaPedidos, tiendaConfig, tiendaEstadoPedido, tiendaBorrarPedido } from '../api'

/* ────────────────────────────────────────────────────────────────────────────
   LA TIENDA, DESDE LA OFICINA — abrirla, ver la tanda y marcar los pagos
   ---------------------------------------------------------------------------
   NACE CERRADA y el interruptor está aquí. Mientras esté cerrada, en el móvil
   del conductor no aparece ni la entrada del menú: no es que la pantalla esté
   oculta, es que el servidor no contesta nada.

   Lo que hay que mirar antes de encargar es UNA cifra: cuántas unidades lleva
   la tanda. Por debajo del mínimo no compensa —el coste de preparación se
   reparte entre menos prendas— y lo honesto es no lanzarla y devolver.

   Y la lista «para el taller» va agrupada por prenda y talla, que es como se
   encarga. Sumar a mano una lista de pedidos es exactamente como se pide una
   talla de menos.
   ──────────────────────────────────────────────────────────────────────────── */

const eur = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

const ESTADOS = [
  ['pendiente_pago', 'Pendiente'], ['pagado', 'Pagado'],
  ['encargado', 'Encargado'], ['entregado', 'Entregado'], ['anulado', 'Anulado'],
]

export default function TiendaPedidos() {
  const [d, setD] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState('')
  const [err, setErr] = useState('')

  const cargar = useCallback(() => {
    setCargando(true)
    tiendaPedidos()
      .then((r) => { setD(r.data); setErr('') })
      .catch(() => setErr('No se ha podido cargar la tienda.'))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  /* Borrar de la lista, y SOLO lo ya anulado: anular es lo que devuelve las
     unidades al drop y la plaza del descuento, asi que quitar de golpe un
     pedido vivo dejaria el drop mordido sin nadie a quien reclamar. El camino
     es anular primero -que se deshace- y borrar despues. */
  const borrar = async (id) => {
    setGuardando(id); setErr('')
    try { await tiendaBorrarPedido(id); cargar() } catch (e) {
      setErr(e?.response?.data?.detail || 'No se ha podido borrar.')
    } finally { setGuardando('') }
  }

  const guardar = async (cambios) => {
    setGuardando('config'); setErr('')
    try { await tiendaConfig(cambios); cargar() } catch (e) {
      setErr(e?.response?.data?.detail || 'No se ha podido guardar.')
    } finally { setGuardando('') }
  }

  const marcar = async (id, estado) => {
    setGuardando(id)
    try { await tiendaEstadoPedido(id, estado); cargar() } catch {
      setErr('No se ha podido cambiar el estado.')
    } finally { setGuardando('') }
  }

  if (cargando && !d) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-dark-400">
        <Loader2 size={15} className="animate-spin" /> Cargando la tienda…
      </div>
    )
  }
  if (!d) return <p className="mt-6 text-sm text-red-400">{err}</p>

  const { config, unidades, minimo, sale, importe, pagados, para_el_taller: lista, pedidos } = d
  const ventas = d.ventas || {}
  const cobrado = ventas.pagado || {}
  const enElAire = ventas.pendiente || {}
  const caidos = ventas.anulado || {}
  const desc = d.descuento || {}
  // La tanda es solo lo de esta semana; los anulados no cuentan para encargar.
  const enTanda = pedidos.filter((p) => p.cierre === d.cierre && p.estado !== 'anulado')

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-dark-100">
        <Store size={15} /> La tienda
      </div>

      {/* El interruptor */}
      <div className="rounded-xl border border-dark-800 bg-dark-900/40 p-3">
        <label className="flex items-start gap-2.5">
          <input type="checkbox" className="mt-0.5" checked={!!config.visible}
            disabled={guardando === 'config'}
            onChange={(e) => guardar({ visible: e.target.checked })} />
          <span className="text-[12.5px] leading-snug text-dark-300">
            <b className="text-dark-100">Abierta para los conductores</b>
            <span className="block text-dark-500">
              {config.visible
                ? 'La ven en su portal y pueden pedir.'
                : 'Apagada: en su móvil no aparece ni la entrada del menú.'}
            </span>
          </span>
        </label>

        {/* EL SEGUNDO INTERRUPTOR, y no sobra. El de arriba enciende la tienda
            a las 140 personas de la casa; este abre el enlace que se reenvía
            fuera -y el anuncio del final de una candidatura-. Con uno solo no
            se podía probar una compra de verdad sin enseñársela de golpe a
            toda la plantilla. Son dos públicos distintos. */}
        <label className="mt-3 flex items-start gap-2.5 border-t border-dark-800 pt-3">
          <input type="checkbox" className="mt-0.5" checked={!!config.publico}
            disabled={guardando === 'config'}
            onChange={(e) => guardar({ publico: e.target.checked })} />
          <span className="text-[12.5px] leading-snug text-dark-300">
            <b className="text-dark-100">Abierta para gente de fuera</b>
            <span className="block text-dark-500">
              {config.publico
                ? 'El enlace vende y se anuncia al final de las candidaturas.'
                : 'Cerrada: quien abra el enlace ve la ropa pero no puede comprar.'}
            </span>
          </span>
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="label">Mínimo de prendas</label>
            <input type="number" min="1" className="input py-1.5 text-[13px]"
              defaultValue={config.minimo}
              onBlur={(e) => {
                const v = Number(e.target.value)
                if (v && v !== config.minimo) guardar({ minimo: v })
              }} />
          </div>
          <div>
            <label className="label">Cierra los</label>
            <select className="input py-1.5 text-[13px]" value={config.dia_cierre}
              onChange={(e) => guardar({ dia_cierre: Number(e.target.value) })}>
              {DIAS.map((n, i) => <option key={n} value={i}>{n}</option>)}
            </select>
          </div>
        </div>

        {config.pasarela === 'ninguna' && (
          <div className="mt-3 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[12px] text-amber-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Todavía no hay pasarela de pago: los pedidos se quedan en «pendiente» y
              los marcas tú al cobrar. Cuando tengas la cuenta de la SL se conecta y
              se marcan solos.
            </span>
          </div>
        )}
      </div>

      {/* LAS VENTAS. Va lo primero porque es lo que se viene a mirar, y va
          SIN el corte por semana: la tanda dice que hay que encargar, no
          cuanto se ha vendido. `queda` no es el bruto —descuenta IVA, coste
          de la prenda, envio, pasarela y colchon—, que es el numero con el
          que se decide si esto merece la pena. */}
      <div className="mt-3 rounded-xl border border-dark-800 bg-dark-900/40 p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[12px] font-medium text-dark-300">
            <Euro size={12} className="mr-1 inline" /> Ventas cobradas
          </span>
          <span className="text-[11.5px] text-dark-500">
            {cobrado.pedidos || 0} pedidos · {ventas.de_la_nave || 0} de la nave ·{' '}
            {ventas.de_fuera || 0} de fuera
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Cifra t="Cobrado" v={eur(cobrado.importe || 0)} />
          <Cifra t="Te queda" v={eur(cobrado.queda || 0)} />
          <Cifra t="Este mes" v={eur((ventas.mes || {}).importe || 0)} />
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-dark-500">
          {enElAire.pedidos > 0 && (
            <>Hay <b className="text-amber-300">{enElAire.pedidos}</b> pedidos sin pagar
              ({eur(enElAire.importe || 0)}) con sus unidades apartadas. </>
          )}
          {caidos.pedidos > 0 && <>Se han caido {caidos.pedidos}. </>}
          {desc.plazas > 0 && (
            <>Descuento de arranque: quedan <b className="text-dark-300">{desc.quedan}</b>{' '}
              de {desc.plazas} plazas al {Math.round((desc.pct || 0) * 100)} %.</>
          )}
        </p>
      </div>

      {/* La tanda */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Cifra t="Prendas" v={`${unidades}/${minimo}`} mal={!sale} />
        <Cifra t="Pedidos" v={enTanda.length} />
        <Cifra t="Importe" v={eur(importe)} />
      </div>
      <p className="mt-1.5 text-[12px] text-dark-500">
        {sale
          ? <>Cierra el {new Date(d.cierre).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} y <b className="text-emerald-400">ya sale</b>. {pagados} pedidos pagados.</>
          : <>Faltan <b className="text-amber-300">{minimo - unidades}</b> prendas para que compense lanzarla.</>}
      </p>

      {/* Qué pedirle al taller */}
      {lista.length > 0 && (
        <div className="mt-3 rounded-xl border border-dark-800">
          <div className="border-b border-dark-800 px-3 py-2 text-[12px] font-medium text-dark-300">
            <Package size={12} className="mr-1 inline" /> Qué encargar (solo lo pagado)
          </div>
          {lista.map((l) => <Encargo key={l.que} l={l} />)}
        </div>
      )}

      {/* Lo que viene pero AUN NO ESTA COBRADO. Aparte a proposito: encargarlo
          al proveedor es poner el dinero por alguien que todavia no ha pagado. */}
      {(d.aun_sin_cobrar || []).length > 0 && (
        <div className="mt-3 rounded-xl border border-dark-800">
          <div className="border-b border-dark-800 px-3 py-2 text-[12px] font-medium text-amber-300">
            <AlertTriangle size={12} className="mr-1 inline" /> Pedido pero sin pagar — no lo encargues aún
          </div>
          {d.aun_sin_cobrar.map((l) => <Encargo key={l.que} l={l} apagado />)}
        </div>
      )}

      {err && <p className="mt-2 text-[12.5px] text-red-400">{err}</p>}

      {/* Los pedidos */}
      {pedidos.length > 0 && (
        <div className="mt-3 space-y-2">
          {pedidos.slice(0, 25).map((p) => (
            <div key={p.id} className="rounded-xl border border-dark-800 bg-dark-900/40 p-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-mono text-[11.5px] text-dark-400">{p.ref}</span>
                <span className="text-[12.5px] font-medium text-dark-100">
                  {p.driver_nombre || (p.externo ? 'De fuera' : '—')}
                  {p.descuento_pct > 0 && (
                    <span className="ml-1.5 text-[11px] font-semibold text-brand-400">
                      -{Math.round(p.descuento_pct * 100)} %
                    </span>
                  )}
                </span>
                <span className="text-[12.5px] font-semibold tabular-nums text-dark-200">{eur(p.total)}</span>
              </div>
              <div className="mt-0.5 text-[11.5px] text-dark-500">
                {(p.lineas || []).map((l) => `${l.cantidad}× ${l.nombre} ${l.talla}`).join(' · ')}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {ESTADOS.map(([id, txt]) => (
                  <button key={id} disabled={guardando === p.id}
                    onClick={() => marcar(p.id, id)}
                    className={`rounded-lg border px-2 py-0.5 text-[11.5px] ${
                      p.estado === id
                        ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                        : 'border-dark-700 text-dark-500 hover:border-dark-500'}`}>
                    {p.estado === id && <Check size={10} className="mr-0.5 inline" />}{txt}
                  </button>
                ))}
                {p.estado === 'anulado' && (
                  <button disabled={guardando === p.id} onClick={() => borrar(p.id)}
                    title="Quitarlo de la lista para siempre"
                    className="ml-auto rounded-lg border border-dark-800 px-2 py-0.5 text-[11.5px] text-dark-600 hover:border-red-500/40 hover:text-red-400">
                    <Trash2 size={10} className="mr-0.5 inline" />Borrar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {pedidos.length === 0 && (
        <p className="mt-3 text-[12.5px] text-dark-500">Todavía no ha pedido nadie.</p>
      )}
    </div>
  )
}

/* UNA LÍNEA DE «QUÉ ENCARGAR», CON DE DÓNDE SE PIDE.
   Antes ponía «Hoodie FDs · L — 2» y ahí acababa: con cuarenta hoodies en el
   catálogo del proveedor, acordarse de cuál era es justo donde se encarga la
   prenda equivocada, con el cliente ya pagado y esperando. Ahora la referencia
   va al lado y el enlace abre el producto exacto.
   Si la prenda no lo tiene puesto se dice —«sin proveedor»— en vez de dejar el
   hueco: un hueco parece que no hace falta, y lo que pasa es que falta. */
function Encargo({ l, apagado }) {
  return (
    <div className="border-b border-dark-800 px-3 py-2 text-[12.5px] last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className={apagado ? 'text-dark-400' : 'text-dark-300'}>{l.que}</span>
        <span className={`font-semibold tabular-nums ${apagado ? 'text-dark-300' : 'text-dark-100'}`}>
          {l.unidades}
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]">
        {(l.proveedor || l.referencia) ? (
          <span className="text-dark-500">
            {[l.proveedor, l.referencia].filter(Boolean).join(' · ')}
          </span>
        ) : (
          <span className="text-amber-300/70">Sin proveedor puesto — ponlo en la prenda</span>
        )}
        {l.enlace && (
          <a href={l.enlace} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-brand-300 hover:underline">
            <ExternalLink size={11} /> Encargar
          </a>
        )}
      </div>
    </div>
  )
}

function Cifra({ t, v, mal }) {
  return (
    <div className="rounded-lg border border-dark-800 bg-dark-900/40 px-2.5 py-1.5">
      <div className="text-[11px] text-dark-500">{t}</div>
      <div className={`text-[15px] font-semibold tabular-nums ${mal ? 'text-amber-300' : 'text-dark-100'}`}>{v}</div>
    </div>
  )
}
