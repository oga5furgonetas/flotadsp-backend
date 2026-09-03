import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2, Lock, TrendingUp, Package, MapPin, RotateCcw } from 'lucide-react'
import { getMisNumeros } from '../../services/api'

/* TUS ESTADÍSTICAS — lo que Cortex sabe de él, devuelto a quien lo hizo.
   ═══════════════════════════════════════════════════════════════════════
   Esta pantalla la lee la persona de la que habla, así que un número inflado
   se nota y quema la pantalla entera. Por eso:
   · HOY lleva porcentaje: es en vivo y no ha dado tiempo a que se erosione.
   · Los días cerrados NO lo llevan. `state` en Cortex es el estado de AHORA:
     un paquete devuelto el viernes y re-repartido el lunes figura hoy como
     entregado el viernes, así que un porcentaje de un día pasado saldría
     mejor de lo que fue. Se enseña lo que no se degrada hacia abajo: cuántos
     paquetes entregó cada día.
   · La única comparación es contra el CENTRO, nunca contra otro conductor.
   · Y se dice, en la propia pantalla, que esto no lo ve nadie más. */

/* El día del mes, no el nombre del día: con hasta 31 barras el nombre no cabe
   ni se distingue. Se etiqueta 1, 5, 10, 15, 20, 25, 30 y el último, que es lo
   que hace falta para situarse. Ojo: la clave es 'YYYY-MM-DD' y se parte a
   mano, nunca con `new Date(iso).getDate()` — el ISO se interpreta en UTC y en
   España devolvería el día anterior (gotcha 11). */
const DIA_NUM = (iso) => Number(String(iso || '').split('-')[2]) || 0
const MES_LARGO = (iso) => {
  const [y, m] = String(iso || '').split('-').map(Number)
  if (!y) return 'este mes'
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long' })
}

export default function MisNumeros({ onBack }) {
  const [datos, setDatos] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    getMisNumeros()
      .then((r) => setDatos(r.data))
      .catch((e) => setErr(e?.response?.data?.detail || 'No se han podido cargar tus números'))
  }, [])

  const hoy = datos?.hoy
  const dias = datos?.dias || []
  const tope = Math.max(1, ...dias.map((d) => d.entregados))
  // `mes` es el nombre nuevo; `semana` sigue llegando de alias mientras el
  // backend viejo esté arriba. Sin esto, un despliegue a medias deja la
  // pantalla en blanco al leer `.entregados` de un undefined.
  const mes = datos?.mes ?? datos?.semana
  const ultimo = dias.length ? DIA_NUM(dias[dias.length - 1].dia) : 0
  const etiqueta = (d) => {
    const n = DIA_NUM(d.dia)
    return (n === 1 || n % 5 === 0 || n === ultimo) ? n : ''
  }

  return (
    <div className="min-h-screen bg-dark-950 text-dark-100">
      <div className="mx-auto max-w-lg space-y-4 p-4 pb-16">

        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-xl border border-dark-700 p-2 text-dark-400 active:bg-dark-800" aria-label="Volver">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-display text-[22px] font-bold tracking-[-.02em]">Tus estadísticas</h1>
            <p className="text-[12.5px] text-dark-400">Lo que va saliendo de Cortex</p>
          </div>
        </div>

        {!datos && !err && <div className="py-16 text-center"><Loader2 className="mx-auto animate-spin text-brand-400" size={28} /></div>}
        {err && <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13.5px] text-red-300">{err}</p>}

        {datos?.sin_transporter && (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3.5 text-[13px] leading-relaxed text-amber-200/90">
            Tu ficha todavía no está emparejada con tu identificador de Cortex, así que aquí no
            puede salir nada tuyo. Díselo a la oficina: lo arreglan en un minuto.
          </div>
        )}

        {/* ── HOY ─────────────────────────────────────────────────────── */}
        {hoy && (
          <div className="rounded-2xl border border-dark-700/60 bg-dark-900/70 p-4">
            <div className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.16em] text-dark-500">
              Hoy{hoy.ruta ? ` · ${hoy.ruta}` : ''}
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="cifra text-[40px] font-bold leading-none">{hoy.entregados}</span>
                <span className="text-[13px] text-dark-400">de {hoy.total}</span>
              </div>
              {hoy.pct != null && (
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                  {String(hoy.pct).replace('.', ',')} %
                </span>
              )}
            </div>
            <div className="mt-3 h-[7px] overflow-hidden rounded-full bg-dark-800">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400"
                style={{ width: `${Math.min(100, hoy.pct || 0)}%` }} />
            </div>
            <p className="mt-2.5 text-[12.5px] text-dark-400">
              {hoy.pendientes > 0
                ? <>Te quedan <b className="cifra text-dark-100">{hoy.pendientes}</b> paquetes en <b className="cifra text-dark-100">{hoy.paradas_pendientes}</b> paradas.</>
                : <>No te queda nada pendiente. Buen día.</>}
              {hoy.bajado_hace_min != null && <> Cortex, hace {hoy.bajado_hace_min} min.</>}
            </p>
          </div>
        )}

        {!hoy && !datos?.sin_transporter && datos && (
          <div className="rounded-2xl border border-dark-700/60 bg-dark-900/70 px-4 py-3.5 text-[13px] text-dark-400">
            Hoy todavía no hay nada tuyo en Cortex. En cuanto empieces a escanear aparece aquí.
          </div>
        )}

        {hoy && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { i: Package, n: hoy.total, l: 'Del día' },
              { i: MapPin, n: hoy.paradas_pendientes, l: 'Paradas' },
              { i: RotateCcw, n: hoy.reintentos, l: 'Reintentos' },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl border border-dark-700/60 bg-dark-900/70 px-3 py-3">
                <x.i size={13} className="mb-1.5 text-dark-500" />
                <div className="cifra text-[19px] font-bold leading-none">{x.n}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-dark-500">{x.l}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── EL MES ──────────────────────────────────────────────────── */}
        {dias.length > 0 && mes && (
          <div className="rounded-2xl border border-dark-700/60 bg-dark-900/70 p-4">
            <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.16em] text-dark-500">
              <TrendingUp size={12} /> <span className="capitalize">{MES_LARGO(mes.desde)}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="cifra text-[28px] font-bold leading-none">{mes.entregados}</span>
              <span className="text-[13px] text-dark-400">
                paquetes en {mes.dias_con_ruta} {mes.dias_con_ruta === 1 ? 'día' : 'días'} de ruta
              </span>
            </div>

            {/* Hasta 31 barras: el hueco baja a 2 px para que quepan en un móvil. */}
            <div className="mt-3 flex h-[52px] items-end gap-[2px]">
              {dias.map((d) => (
                <div key={d.dia} className="flex-1 rounded-t-[2px] bg-brand-400/25"
                  style={{ height: `${Math.max(6, (d.entregados / tope) * 100)}%`,
                    background: d.dia === mes.mejor?.dia ? 'linear-gradient(180deg,#14E7D8,#0FC2BC)' : undefined }}
                  title={`${d.dia}: ${d.entregados}`} />
              ))}
            </div>
            <div className="mt-1 flex gap-[2px]">
              {dias.map((d) => (
                <span key={d.dia} className="flex-1 text-center font-mono text-[9px] text-dark-600">{etiqueta(d)}</span>
              ))}
            </div>

            {mes.mejor && (
              <p className="mt-2.5 text-[12.5px] text-dark-400">
                Tu mejor día fueron <b className="cifra text-dark-100">{mes.mejor.entregados}</b> paquetes.
              </p>
            )}
            {/* Sin porcentaje en los días cerrados, y dicho en claro por qué. */}
            <p className="mt-1 text-[11.5px] leading-relaxed text-dark-600">
              De los días cerrados se cuentan los paquetes entregados, no un porcentaje: un paquete
              que vuelve y se reparte otro día cambia de estado, y saldría mejor de lo que fue.
            </p>
          </div>
        )}

        {datos?.centro && (
          <div className="rounded-2xl border border-dark-700/60 bg-dark-900/70 px-4 py-3.5">
            <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[.16em] text-dark-500">
              Entre todos, en {datos.centro.codigo}
            </div>
            <p className="text-[13px] text-dark-300">
              El centro va al <b className="cifra text-dark-50">{String(datos.centro.dcr).replace('.', ',')} %</b> estos siete días,
              con <b className="cifra text-dark-50">{datos.centro.entregados.toLocaleString('es-ES')}</b> paquetes entregados.
            </p>
          </div>
        )}

        <div className="flex items-start gap-2.5 rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] px-3.5 py-3">
          <Lock size={14} className="mt-0.5 shrink-0 text-brand-400" />
          <p className="text-[12px] leading-relaxed text-brand-300/90">
            Esto lo ves solo tú. La oficina mira el total del centro, no una lista de mejores y peores.
          </p>
        </div>

      </div>
    </div>
  )
}
