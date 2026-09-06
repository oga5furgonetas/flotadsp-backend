import { useCallback, useEffect, useState } from 'react'
import {
  Shirt, Loader2, ExternalLink, ChevronDown, Check, AlertTriangle, Info,
} from 'lucide-react'
import { tiendaPreparacion, tiendaMarcarPaso } from '../api'

/* ────────────────────────────────────────────────────────────────────────────
   TIENDA DE ROPA Y MATERIAL — todo lo que hace falta para empezar a vender
   ---------------------------------------------------------------------------
   Vive en el Perfil porque es la preparación del NEGOCIO, no una pantalla de
   operaciones: no se mira todos los días, se mira cuando se avanza un paso.

   Tres bloques y en este orden, que es el orden en que muerden:
     1. El producto — qué vendes y a cuánto te sale.
     2. Poder cobrar — sin esto no se puede emitir ni una factura, y hoy es el
        que está bloqueado (no hay sociedad constituida).
     3. Los canales — de dónde salen los ingresos, por lo que valen.

   LOS COSTES SON ESTIMACIONES y se dice en pantalla, no en una nota al pie:
   un número sin presupuesto detrás que parece cerrado es peor que no tenerlo,
   porque se toman decisiones con él.

   Lo que la app ya sabe no se pregunta: la gente activa, cuántas fichas tienen
   talla y las altas del mes salen de los datos y se pintan arriba. Una lista
   que hay que rellenar entera a mano deja de mirarse a la semana.
   ──────────────────────────────────────────────────────────────────────────── */

const eur = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`

export default function TiendaRopa() {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState('')
  const [guardando, setGuardando] = useState('')

  const cargar = useCallback(() => {
    setCargando(true)
    tiendaPreparacion()
      .then((r) => { setDatos(r.data); setError('') })
      .catch(() => setError('No se ha podido cargar la preparación de la tienda.'))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  /* Se pinta el cambio ANTES de que conteste el servidor y se deshace si falla.
     Marcar una casilla y que tarde medio segundo en moverse hace que la gente
     la pulse dos veces y acabe desmarcándola. */
  const marcar = async (paso, hecho) => {
    setGuardando(paso)
    const antes = datos
    setDatos((d) => {
      if (!d) return d
      const pasos = d.pasos.map((p) => (p.id === paso ? { ...p, hecho } : p))
      const hechos = pasos.filter((p) => p.hecho).length
      return { ...d, pasos, hechos, pct: Math.round((100 * hechos) / (pasos.length || 1)) }
    })
    try {
      await tiendaMarcarPaso(paso, hecho)
    } catch {
      setDatos(antes)
      setError('No se ha podido guardar. Inténtalo otra vez.')
    } finally {
      setGuardando('')
    }
  }

  if (cargando && !datos) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm text-dark-400">
        <Loader2 size={15} className="animate-spin" /> Cargando la tienda…
      </div>
    )
  }
  if (!datos) {
    return <div className="card p-5 text-sm text-red-400">{error || 'No hay datos.'}</div>
  }

  const { pasos, fases, hechos, total, pct, catalogo, datos: vivos, unidades_ref: uds } = datos
  const bloqueado = pasos.find((p) => p.id === 'alta_reta' && !p.hecho)

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-dark-200">
        <Shirt size={16} /> Tienda de ropa y material
      </div>
      <p className="text-sm text-dark-400">
        Lo que hace falta para venderle ropa a tus conductores y a otros DSP, por dónde vas
        y de dónde puede salir el dinero.
      </p>

      {/* Por dónde vas */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="text-dark-400">{hechos} de {total} pasos</span>
          <span className="font-semibold tabular-nums text-dark-200">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-dark-800">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Lo que ya sabemos sin preguntar a nadie */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Dato n={vivos.conductores_activos} q="conductores activos" />
        <Dato n={`${vivos.con_talla}/${vivos.conductores_activos}`} q="con talla en la ficha"
          mal={vivos.con_talla === 0} />
        <Dato n={vivos.altas_30d} q="altas en 30 días" />
      </div>

      {bloqueado && (
        <div className="mt-4 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[13px] text-amber-200">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            Hoy no puedes cobrar: no hay sociedad ni alta de autónomo desde la que facturar.
            Para la primera tanda, que el serigrafiador le facture a cada conductor y tú solo
            organices el pedido — compruebas la demanda con cero exposición fiscal.
          </span>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {/* Los pasos, por fases */}
      {fases.map((f) => {
        const suyos = pasos.filter((p) => p.fase === f.id)
        const listos = suyos.filter((p) => p.hecho).length
        return (
          <div key={f.id} className="mt-5">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <div>
                <div className="text-[13px] font-semibold text-dark-100">{f.titulo}</div>
                <div className="text-[12px] text-dark-500">{f.sub}</div>
              </div>
              <span className="shrink-0 text-[12px] tabular-nums text-dark-500">{listos}/{suyos.length}</span>
            </div>
            <div className="divide-y divide-dark-800 overflow-hidden rounded-xl border border-dark-800">
              {suyos.map((p) => (
                <Paso key={p.id} p={p}
                  abierto={abierto === p.id}
                  onAbrir={() => setAbierto(abierto === p.id ? '' : p.id)}
                  onMarcar={() => marcar(p.id, !p.hecho)}
                  guardando={guardando === p.id} />
              ))}
            </div>
          </div>
        )
      })}

      {/* Catálogo y márgenes */}
      <div className="mt-6">
        <div className="mb-1 text-[13px] font-semibold text-dark-100">Qué vender y qué te queda</div>
        <p className="mb-2 text-[12px] text-dark-500">
          Por unidad, en pedidos de {uds}. «Te queda» es el margen después de quitarle el IVA
          al precio de venta, que es donde la gente se hace ilusiones.
        </p>
        <div className="overflow-x-auto rounded-xl border border-dark-800">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-dark-800 text-left text-[11px] uppercase tracking-wide text-dark-500">
                <th className="px-3 py-2 font-medium">Prenda</th>
                <th className="px-3 py-2 text-right font-medium">Te cuesta</th>
                <th className="px-3 py-2 text-right font-medium">La vendes</th>
                <th className="px-3 py-2 text-right font-medium">Te queda</th>
              </tr>
            </thead>
            <tbody>
              {catalogo.map((a) => (
                <tr key={a.id} className="border-b border-dark-800 last:border-0">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 font-medium text-dark-100">
                      {a.nombre}
                      {a.estrella && (
                        <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-300">
                          por aquí
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-dark-500">{a.personalizacion}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-dark-300">{eur(a.coste)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-dark-300">{eur(a.pvp)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="font-semibold text-dark-100">{eur(a.margen)}</div>
                    <div className="text-[11.5px] text-dark-500">{a.margen_pct}%</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex gap-2 text-[12px] text-dark-500">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            Estos costes son <b>estimaciones de mercado</b>, no presupuestos. En cuanto tengas
            tres presupuestos reales dejan de serlo, y entonces estos márgenes son tu cuenta.
          </span>
        </div>
      </div>
    </div>
  )
}

function Dato({ n, q, mal }) {
  return (
    <div className="rounded-lg border border-dark-800 bg-dark-900/40 px-3 py-2">
      <div className={`text-[17px] font-semibold tabular-nums ${mal ? 'text-amber-300' : 'text-dark-100'}`}>{n}</div>
      <div className="text-[11.5px] leading-tight text-dark-500">{q}</div>
    </div>
  )
}

function Paso({ p, abierto, onAbrir, onMarcar, guardando }) {
  return (
    <div className={p.hecho ? 'bg-emerald-500/[0.04]' : ''}>
      <div className="flex items-start gap-3 px-3 py-2.5">
        <button
          onClick={onMarcar}
          disabled={guardando}
          aria-label={p.hecho ? `Desmarcar ${p.titulo}` : `Marcar ${p.titulo} como hecho`}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
            p.hecho
              ? 'border-emerald-500 bg-emerald-500 text-dark-950'
              : 'border-dark-600 hover:border-dark-400'}`}>
          {guardando ? <Loader2 size={12} className="animate-spin" /> : p.hecho && <Check size={13} />}
        </button>
        <button onClick={onAbrir} className="min-w-0 flex-1 text-left">
          <div className={`text-[13.5px] font-medium ${p.hecho ? 'text-dark-400 line-through' : 'text-dark-100'}`}>
            {p.titulo}
          </div>
          <div className="text-[11.5px] text-dark-500">{p.coste}</div>
        </button>
        <button onClick={onAbrir} aria-label="Ver el detalle" className="mt-0.5 shrink-0 text-dark-500 hover:text-dark-300">
          <ChevronDown size={15} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {abierto && (
        <div className="space-y-2 border-t border-dark-800 bg-dark-950/40 px-3 py-3 pl-11 text-[12.5px]">
          <p className="text-dark-400"><b className="text-dark-300">Por qué:</b> {p.porque}</p>
          <p className="text-dark-400"><b className="text-dark-300">Cómo:</b> {p.como}</p>
          {p.enlace && (
            <a href={p.enlace.url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-brand-400 hover:text-brand-300">
              {p.enlace.texto} <ExternalLink size={12} />
            </a>
          )}
          {p.at && (
            <p className="text-[11.5px] text-dark-600">
              {p.hecho ? 'Marcado' : 'Desmarcado'} el {String(p.at).slice(0, 10)}
              {p.por ? ` por ${p.por}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
