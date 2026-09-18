import { useEffect, useState } from 'react'
import { Loader2, Users, Eye, Building2, LogOut, Clock, UserPlus, Activity } from 'lucide-react'
import { getAnalitica } from '../api'

/* Cómo va el negocio: cuánta gente entra, por dónde pasa y dónde se va.

   Se mide por VISITAS, no por personas: la clave de sesión muere al cerrar la
   pestaña, así que quien vuelve mañana cuenta dos veces y aquí no hay forma de
   saberlo. Está dicho en la pantalla porque un número que se lee como
   «personas» y son visitas lleva a decisiones equivocadas. */

const PERIODOS = [7, 30, 90]
/* «De fuera» es todo menos el equipo de casa, que es lo que interesa para saber
   qué hace la gente. El equipo propio tiene su botón igualmente: sin él, sus
   visitas se cuentan y no se ven por ninguna parte, y la pantalla parece vacía
   cuando en realidad las únicas visitas son tuyas. */
const SEGMENTOS = [
  ['externo', 'De fuera'],
  ['cliente', 'Clientes'],
  ['visitante', 'Sin cuenta'],
  ['demo', 'Demo'],
  ['conductor', 'Conductores'],
  ['propio', 'Equipo de casa'],
  ['todos', 'Todo'],
]
const AREAS = {
  web: 'Web pública', panel: 'Panel', conductor: 'Portal conductor',
  empleo: 'Empleo', tienda: 'Tienda', enlaces: 'Enlaces (taller, apoyo)',
  acceso: 'Acceso', otra: 'Otras',
}

const num = (n) => (n == null ? '—' : n.toLocaleString('es-ES'))
const pct = (n) => (n == null ? '—' : `${String(n).replace('.', ',')} %`)

function duracion(seg) {
  if (seg == null) return '—'
  const s = Math.round(seg)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`
}

function Tile({ icon: Icon, valor, etiqueta, pie, acento }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-dark-500">
        <Icon size={12} /> {etiqueta}
      </div>
      <div className={`mt-1 font-display text-[22px] font-semibold tabular-nums leading-none ${acento || 'text-dark-50'}`}>{valor}</div>
      {pie && <div className="mt-1 text-[11.5px] text-dark-500">{pie}</div>}
    </div>
  )
}

/* Barras por día. Sin librería: son treinta números y un div por día pesa menos
   que cargar un motor de gráficas en una pantalla que se abre de vez en cuando. */
function Serie({ serie, altas }) {
  const max = Math.max(1, ...serie.map((d) => d.sesiones))
  const altasPorDia = Object.fromEntries((altas?.serie || []).map((a) => [a.dia, a.n]))
  return (
    <div className="flex h-28 items-end gap-[2px]">
      {serie.map((d) => {
        const alta = altasPorDia[d.dia] || 0
        return (
          <div key={d.dia} className="group relative flex-1"
            title={`${d.dia}: ${d.sesiones} visitas · ${d.vistas} pantallas${alta ? ` · ${alta} alta(s)` : ''}`}>
            <div className="w-full rounded-t bg-brand-400/70 transition group-hover:bg-brand-400"
              style={{ height: `${Math.max(2, (d.sesiones / max) * 100)}px` }} />
            {alta > 0 && <div className="absolute -top-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-emerald-400" />}
          </div>
        )
      })}
    </div>
  )
}

function Embudo({ e }) {
  const primero = e.pasos[0]?.n || 0
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-dark-100">{e.titulo}</h3>
        <span className="text-[11.5px] tabular-nums text-dark-500">{num(e.sesiones)} visitas</span>
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {e.pasos.map((p, i) => {
          const ancho = primero ? Math.round((p.n / primero) * 100) : 0
          const previo = i > 0 ? e.pasos[i - 1].n : null
          const caida = previo ? previo - p.n : 0
          return (
            <li key={p.etiqueta}>
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="text-dark-300">{p.etiqueta}</span>
                <span className="tabular-nums text-dark-200">
                  {num(p.n)}
                  {previo != null && previo > 0 && (
                    <span className={caida ? 'ml-1.5 text-amber-300/80' : 'ml-1.5 text-emerald-300/80'}>
                      {caida ? `−${num(caida)}` : 'sin caída'}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-500"
                  style={{ width: `${ancho}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function Analitica() {
  const [dias, setDias] = useState(30)
  const [seg, setSeg] = useState('externo')
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vivo = true
    setCargando(true)
    getAnalitica(dias, seg)
      .then((r) => { if (vivo) { setD(r.data); setErr('') } })
      .catch((e) => { if (vivo) setErr(e?.response?.data?.detail || 'No se ha podido cargar') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [dias, seg])

  const r = d?.resumen
  const vacio = d && !r?.sesiones
  const otrosSegmentos = Object.entries(d?.por_segmento || {}).filter(([k, n]) => n > 0 && k !== seg)

  return (
    <div className="space-y-4 pb-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[19px] font-semibold tracking-[-0.02em] text-dark-50">Cómo va el negocio</h1>
          <p className="mt-0.5 max-w-[80ch] text-[12.5px] leading-relaxed text-dark-400">
            Cuánta gente entra, por qué pantallas pasa y dónde se va. Son <b className="text-dark-200">visitas</b>,
            no personas: la medición es anónima y se olvida al cerrar la pestaña, así que quien vuelve otro día
            cuenta dos veces.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {d?.resumen?.activos_ahora > 0 && (
            <span className="mr-1 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[12px] font-semibold text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {num(d.resumen.activos_ahora)} ahora
            </span>
          )}
          {PERIODOS.map((p) => (
            <button key={p} onClick={() => setDias(p)}
              className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold transition ${
                dias === p ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30' : 'text-dark-500 hover:text-dark-300'}`}>
              {p} d
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {SEGMENTOS.map(([k, etiqueta]) => (
          <button key={k} onClick={() => setSeg(k)}
            className={`rounded-lg px-2.5 py-1 text-[12px] transition ${
              seg === k ? 'bg-white/[0.07] font-semibold text-dark-100' : 'text-dark-500 hover:text-dark-300'}`}>
            {etiqueta}
            {d?.por_segmento && k !== 'externo' && k !== 'todos' && (
              <span className="ml-1 tabular-nums text-dark-600">{num(d.por_segmento[k])}</span>
            )}
          </button>
        ))}
      </div>

      {err && <div className="rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-2.5 text-[13px] text-red-300">{err}</div>}
      {cargando && !d && <div className="flex items-center gap-2 py-16 text-dark-500"><Loader2 size={16} className="animate-spin" /> Cargando…</div>}

      {vacio && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-8 text-center">
          <p className="text-[14px] font-semibold text-dark-100">Todavía no hay visitas medidas</p>
          <p className="mx-auto mt-1 max-w-[60ch] text-[12.5px] leading-relaxed text-dark-400">
            {d.medido_desde
              ? `Se está midiendo desde el ${d.medido_desde.slice(0, 10)}, pero en este periodo y filtro no hay nada.`
              : 'La medición acaba de encenderse. En cuanto alguien abra la web, la tienda o el panel, aparecerá aquí.'}
          </p>
          {/* Decir dónde SÍ hay visitas: si no, «no hay nada» con el filtro puesto
              se lee como «no entra nadie», que es una conclusión distinta. */}
          {otrosSegmentos.length > 0 && (
            <p className="mt-2 text-[12.5px] text-dark-300">
              Con otros filtros sí hay:{' '}
              {otrosSegmentos.map(([k, n], i) => (
                <span key={k}>
                  {i > 0 && ' · '}
                  <button onClick={() => setSeg(k)} className="font-semibold text-brand-300 hover:text-brand-200">
                    {(SEGMENTOS.find((x) => x[0] === k) || [k, k])[1]} ({num(n)})
                  </button>
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      {d && !vacio && (
        <>
          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Tile icon={Users} etiqueta="Visitas" valor={num(r.sesiones)}
              pie={`${num(r.pantallas_por_sesion)} pantallas de media`} />
            <Tile icon={Eye} etiqueta="Pantallas vistas" valor={num(r.vistas)} pie={`${num(r.acciones)} acciones`} />
            <Tile icon={UserPlus} etiqueta="Altas de empresa" valor={num(d.altas?.ventana)}
              pie={`${num(d.altas?.total)} en total`} acento="text-emerald-300" />
            <Tile icon={Building2} etiqueta="Empresas que usan la app" valor={num(r.empresas_activas)} />
            <Tile icon={LogOut} etiqueta="Se van en la primera" valor={pct(r.pct_una_pantalla)}
              pie={`de ${num(r.sesiones_cerradas)} visitas terminadas`}
              acento={r.pct_una_pantalla > 60 ? 'text-amber-300' : 'text-dark-50'} />
            <Tile icon={Clock} etiqueta="Duración mediana" valor={duracion(r.duracion_mediana_s)} />
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[13px] font-semibold text-dark-100">Visitas por día</h2>
              <span className="text-[11.5px] text-dark-500">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" /> alta de empresa
              </span>
            </div>
            <Serie serie={d.serie} altas={d.altas} />
            <div className="mt-1 flex justify-between text-[11px] text-dark-600">
              <span>{d.serie[0]?.dia}</span><span>{d.serie[d.serie.length - 1]?.dia}</span>
            </div>
          </div>

          <div className="grid gap-2 lg:grid-cols-2">
            {d.embudos.filter((e) => e.sesiones > 0).map((e) => <Embudo key={e.clave} e={e} />)}
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.06] px-3.5 py-2.5">
              <h2 className="text-[13px] font-semibold text-dark-100">Pantallas: hasta dónde llegan y dónde se van</h2>
              <span className="text-[11.5px] text-dark-500">
                «Se va» = la visita terminó ahí. Las que siguen abiertas no cuentan.
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-dark-800 text-left text-[11px] uppercase tracking-wider text-dark-500">
                    <th className="px-3 py-2 font-medium">Pantalla</th>
                    <th className="px-2.5 py-2 text-right font-medium">Visitas</th>
                    <th className="px-2.5 py-2 text-right font-medium">Vistas</th>
                    <th className="px-2.5 py-2 text-right font-medium">Entran por aquí</th>
                    <th className="px-2.5 py-2 text-right font-medium">Se van aquí</th>
                    <th className="px-2.5 py-2 text-right font-medium">Tiempo</th>
                    <th className="px-3 py-2 font-medium">Después van a</th>
                  </tr>
                </thead>
                <tbody>
                  {d.pantallas.map((p) => (
                    <tr key={p.ruta} className="border-b border-dark-900/70 last:border-0">
                      <td className="px-3 py-1.5">
                        <span className="font-mono text-[12px] text-dark-100">{p.ruta}</span>
                        <span className="ml-2 text-[11px] text-dark-600">{AREAS[p.area] || p.area}</span>
                        {p.empresas > 0 && <span className="ml-2 text-[11px] text-dark-600">{num(p.empresas)} empresa(s)</span>}
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-dark-200">{num(p.sesiones)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-dark-400">{num(p.vistas)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-dark-400">{num(p.entradas)}</td>
                      <td className={`px-2.5 py-1.5 text-right tabular-nums ${
                        p.pct_salida >= 70 ? 'text-amber-300' : 'text-dark-300'}`}>
                        {/* Sin ninguna visita terminada en esta pantalla no hay
                            porcentaje que dar: «—» y nada más, que «—0» se lee
                            como un cero que no significa lo que parece. */}
                        {p.pct_salida == null ? '—' : <>{pct(p.pct_salida)}
                          <span className="ml-1 text-[11px] text-dark-600">{num(p.salidas)}</span></>}
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-dark-400">{duracion(p.segundos_mediana)}</td>
                      <td className="px-3 py-1.5 text-[11.5px] text-dark-500">
                        {p.siguiente.length
                          ? p.siguiente.map((s) => `${s.ruta} (${s.n})`).join(' · ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-2 lg:grid-cols-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
              <h2 className="mb-2 text-[13px] font-semibold text-dark-100">De dónde llegan</h2>
              {d.canales.length ? (
                <ul className="space-y-1">
                  {d.canales.map((c) => (
                    <li key={c.canal} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="truncate text-dark-300">{c.canal}</span>
                      <span className="tabular-nums text-dark-200">{num(c.sesiones)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[12px] text-dark-500">Nadie ha llegado todavía a una página pública.</p>}
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
              <h2 className="mb-2 text-[13px] font-semibold text-dark-100">Con qué entran</h2>
              <ul className="space-y-1">
                {Object.entries(d.dispositivos).map(([k, v]) => (
                  <li key={k} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="capitalize text-dark-300">{k}</span>
                    <span className="tabular-nums text-dark-200">{num(v)}</span>
                  </li>
                ))}
              </ul>
              <h2 className="mb-1 mt-3 text-[13px] font-semibold text-dark-100">Por área</h2>
              <ul className="space-y-1">
                {Object.entries(d.areas).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <li key={k} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="text-dark-300">{AREAS[k] || k}</span>
                    <span className="tabular-nums text-dark-200">{num(v)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
              <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-dark-100">
                <Activity size={13} /> A qué hora entran
              </h2>
              <div className="flex h-16 items-end gap-[2px]">
                {d.por_hora.map((v, h) => {
                  const max = Math.max(1, ...d.por_hora)
                  return (
                    <div key={h} className="flex-1 rounded-t bg-brand-400/60" title={`${h}:00 · ${v} visitas`}
                      style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
                  )
                })}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-dark-600"><span>00</span><span>12</span><span>23</span></div>
              {d.acciones.length > 0 && (
                <>
                  <h2 className="mb-1 mt-3 text-[13px] font-semibold text-dark-100">Lo que pulsan</h2>
                  <ul className="space-y-1">
                    {d.acciones.slice(0, 8).map((a) => (
                      <li key={a.nombre} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                        <span className="truncate font-mono text-[11.5px] text-dark-300">{a.nombre}</span>
                        <span className="tabular-nums text-dark-200">{num(a.sesiones)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>

          <p className="text-[11.5px] leading-relaxed text-dark-600">
            {d.medido_desde && <>Midiendo desde el {d.medido_desde.slice(0, 10)}. </>}
            Sin cookies, sin IP y sin identificar a nadie; los datos se borran solos a los 180 días.
            {d.truncado && <span className="text-amber-300"> Hay más eventos de los que caben en el informe: se han usado los más recientes del periodo.</span>}
          </p>
        </>
      )}
    </div>
  )
}
