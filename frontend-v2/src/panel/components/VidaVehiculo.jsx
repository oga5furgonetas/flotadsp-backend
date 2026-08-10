/* ─────────────────────────────────────────────────────────────────────────────
   LÍNEA DE VIDA DEL VEHÍCULO
   ---------------------------------------------------------------------------
   Complementa a la lista cronológica de la pestaña Historial: aquélla responde
   QUÉ pasó y CUÁNDO; ésta responde CUÁNTO TIEMPO estuvo así.

   Un daño no es un instante, es un PERIODO: desde que se detecta hasta que se
   repara. Dibujarlo como una barra que se extiende hace visible de un vistazo
   lo que una lista esconde — que ese golpe lleva 94 días abierto.

   ── DATOS ────────────────────────────────────────────────────────────────────
   Se alimenta EXCLUSIVAMENTE del ledger que la ficha ya carga al abrirse
   (`getVehicleDamageLedger` → `{open, repaired}`). Campos usados: `part`/`panel`,
   `severity`, `first_seen` (YYYY-MM-DD) y `repaired_at` (ISO). Cero estimaciones.

   ── POR QUÉ NO PUEDE DAR UN FALSO POSITIVO ──────────────────────────────────
   · Sin `first_seen` no se dibuja: sin principio no hay periodo.
   · Un daño ABIERTO se dibuja hasta hoy y se remata en punto. Nunca se le
     inventa una fecha de cierre.
   · Un daño REPARADO sin `repaired_at` legible NO se dibuja, y se dice cuántos
     quedaron fuera. Dibujarlo hasta hoy lo haría parecer abierto (mentira) y
     dibujarlo hasta una fecha inventada sería peor.
   · Si `repaired_at` es anterior a `first_seen`, el dato es incoherente y
     tampoco se dibuja: no se maquilla con una barra de cero días.
   · El eje arranca en el dato más antiguo conocido, no en una fecha redonda:
     pintar meses vacíos antes sugeriría que ahí no pasó nada, cuando lo que
     pasa es que no lo sabemos.
   · Dos daños en el mismo panel comparten carril, así que la reincidencia se ve
     sola — pero el pie deja escrito que eso es un RECUENTO y no la prueba de un
     patrón: para sostener eso habría que comparar con furgonetas de kilometraje
     parecido, y aquí no se hace.
   · Y si esos dos daños se SOLAPAN en el tiempo, se apilan en sub-filas. Antes
     una barra tapaba a la otra: el carril decía "2 veces" y solo se veía una.
     Un gráfico que esconde la mitad de sus datos es peor que no tenerlo.
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react'
import { useT } from '../../i18n'

const DIA = 86400000
const SEV = { leve: '#fbbf24', moderado: '#fb923c', grave: '#f87171', critico: '#ef4444' }
const MESES = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  fr: ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'],
  de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
  it: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
}
/** Fecha (YYYY-MM-DD o ISO completo) → ms al mediodía UTC, o null si no es legible. */
const ms = (v) => {
  const s = String(v || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const n = Date.parse(`${s}T12:00:00Z`)
  return isFinite(n) ? n : null
}

export default function VidaVehiculo({ ledger }) {
  const { t, lang } = useT()
  const [sel, setSel] = useState(null)
  const meses = MESES[lang] || MESES.en

  const datos = useMemo(() => {
    const hoyMs = Date.parse(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`)
    const items = []
    let descartados = 0

    const añadir = (e, abierto, i) => {
      const ini = ms(e.first_seen)
      if (ini == null) { descartados += 1; return }   // sin principio no hay periodo
      let fin = hoyMs
      if (!abierto) {
        const rep = ms(e.repaired_at)
        // Reparado sin fecha legible, o cerrado antes de abrirse: no se dibuja.
        if (rep == null || rep < ini) { descartados += 1; return }
        fin = rep
      }
      items.push({
        id: `${abierto ? 'o' : 'r'}-${e.panel || e.part || 'p'}-${e.first_seen}-${i}`,
        panel: e.part || e.panel || '—',
        severity: e.severity || 'leve',
        ini, fin, abierto,
        dias: Math.round((fin - ini) / DIA),
      })
    }
    ;(ledger?.open || []).forEach((e, i) => añadir(e, true, i))
    ;(ledger?.repaired || []).forEach((e, i) => añadir(e, false, i))

    if (!items.length) return { vacio: true, descartados }

    const desde = Math.min(...items.map((x) => x.ini)) - 8 * DIA
    const span = Math.max(hoyMs - desde, 30 * DIA)

    const porPanel = {}
    for (const x of items) (porPanel[x.panel] ||= []).push(x)
    const carriles = Object.entries(porPanel)
      .map(([panel, xs]) => {
        /* Sub-filas: dos daños del mismo panel que se solapan en el tiempo NO
           pueden ir en la misma línea o uno tapa al otro. Reparto codicioso:
           cada barra baja a la primera sub-fila donde quepa. Con margen de un
           día para que dos periodos consecutivos no se peguen. */
        const orden = [...xs].sort((a, b) => a.ini - b.ini)
        const finDe = []
        for (const x of orden) {
          let f = finDe.findIndex((fin) => x.ini > fin + DIA)
          if (f === -1) f = finDe.length
          finDe[f] = x.fin
          x.fila = f
        }
        return { panel, n: xs.length, filas: finDe.length, items: orden }
      })
      .sort((a, b) => b.n - a.n || b.items[0].ini - a.items[0].ini)

    // Marcas de mes, sin saturar el eje: ocho como mucho.
    const marcas = []
    const d0 = new Date(desde)
    d0.setUTCDate(1)
    const paso = Math.max(1, Math.ceil(span / DIA / 30 / 8))
    let tt = d0.getTime()
    for (let k = 0; tt <= hoyMs && k < 240; k += 1) {
      if (k % paso === 0) marcas.push(tt)
      const n = new Date(tt); n.setUTCMonth(n.getUTCMonth() + 1); tt = n.getTime()
    }

    const sevs = [...new Set(items.map((x) => x.severity))]
      .filter((s) => SEV[s])
      .sort((a, b) => Object.keys(SEV).indexOf(a) - Object.keys(SEV).indexOf(b))

    return { carriles, marcas, desde, span, hoyMs, descartados, sevs, vacio: false }
  }, [ledger])

  if (!ledger) return null

  if (datos.vacio) {
    return (
      <div className="rounded-xl border border-dark-700/40 px-4 py-6 text-center">
        <p className="text-[12.5px] text-dark-500">{t('vh.vida.none')}</p>
        {datos.descartados > 0 && (
          <p className="mt-1 text-[11px] text-dark-600">
            {datos.descartados} {t('vh.vida.reps')} {t('vh.vida.nodate')}
          </p>
        )}
      </div>
    )
  }

  const { carriles, marcas, desde, span, hoyMs, descartados, sevs } = datos
  // `der` reserva sitio a la derecha para los días: así ninguna barra llega al
  // borde y el número nunca se monta encima del nombre del panel.
  const W = 720, izq = 132, der = 52, arriba = 26
  const FILA = 15, HUECO = 11   // alto de sub-fila y separación entre carriles
  // Cada carril mide según cuántas sub-filas necesitó: el alto se gana, no se fija.
  const tops = []
  let acum = arriba
  for (const c of carriles) { tops.push(acum); acum += c.filas * FILA + HUECO }
  const fondo = acum - HUECO
  const H = fondo + 20
  const x = (v) => izq + ((v - desde) / span) * (W - izq - der)

  return (
    <div className="rounded-xl border border-dark-700/40 bg-dark-800/25 px-4 pb-3 pt-3.5">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-dark-500">
          {t('vh.vida.title')}
        </h4>
        <div className="flex items-center gap-2.5">
          {sevs.map((s) => (
            <span key={s} className="flex items-center gap-1 text-[10px] text-dark-500">
              <span className="h-1.5 w-3 rounded-full" style={{ background: SEV[s] }} />
              {t(`sev.${s}`)}
            </span>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full"
        role="img" aria-label={t('vh.vida.title')}>
        {/* Bandas alternas: guían la vista de la etiqueta a su barra */}
        {carriles.map((c, i) => i % 2 === 1 && (
          <rect key={`b${c.panel}`} x={izq - 6} y={tops[i] - 4} width={W - izq - der + 6}
            height={c.filas * FILA + 2} fill="rgba(255,255,255,.022)" rx="3" />
        ))}

        {marcas.map((m) => (
          <g key={m}>
            <line x1={x(m)} y1={arriba - 8} x2={x(m)} y2={fondo}
              stroke="rgba(255,255,255,.055)" strokeWidth="1" />
            <text x={x(m)} y={H - 5} textAnchor="middle" fill="rgba(255,255,255,.3)"
              fontSize="9.5" letterSpacing=".05em">{meses[new Date(m).getUTCMonth()]}</text>
          </g>
        ))}

        {/* Hoy: la única línea que se ve de verdad */}
        <line x1={x(hoyMs)} y1={arriba - 12} x2={x(hoyMs)} y2={fondo}
          stroke="rgba(249,115,22,.5)" strokeWidth="1" strokeDasharray="2 3" />
        <text x={x(hoyMs) - 4} y={arriba - 14} textAnchor="end"
          fill="rgba(249,115,22,.8)" fontSize="9">{t('vh.vida.today')}</text>

        {carriles.map((c, i) => {
          const top = tops[i]
          const medio = top + (c.filas * FILA) / 2
          return (
            <g key={c.panel}>
              <text x={izq - 10} y={medio + (c.n > 1 ? 0 : 3.5)} textAnchor="end"
                fill="rgba(255,255,255,.5)" fontSize="10.5">
                {c.panel.length > 22 ? `${c.panel.slice(0, 21)}…` : c.panel}
              </text>
              {c.n > 1 && (
                <text x={izq - 10} y={medio + 10} textAnchor="end" fill="rgba(248,113,113,.7)" fontSize="8.5">
                  {c.n} {t('vh.vida.times')}
                </text>
              )}
              {c.items.map((d) => {
                const activo = sel === d.id
                const y = top + d.fila * FILA
                const x0 = x(d.ini)
                const x1 = Math.max(x0 + 3, x(d.fin))
                const color = SEV[d.severity] || SEV.leve
                return (
                  <g key={d.id} className="cursor-pointer"
                    onClick={() => setSel(activo ? null : d.id)}
                    onMouseEnter={() => setSel(d.id)}
                    onMouseLeave={() => setSel(null)}>
                    {/* Zona de click generosa: la barra sola son 7 px de alto */}
                    <rect x={x0 - 5} y={y - 2} width={x1 - x0 + 46} height={FILA} fill="transparent" />
                    {/* Marca del día exacto en que se detectó */}
                    <rect x={x0 - 0.6} y={y} width="1.6" height="11" rx="0.8" fill={color}
                      opacity={d.abierto ? 0.9 : 0.45} />
                    <rect x={x0} y={y + 2} width={x1 - x0} height="7" rx="3.5" fill={color}
                      opacity={d.abierto ? (activo ? 1 : 0.82) : (activo ? 0.6 : 0.3)} />
                    {/* Extremo abierto rematado en punto: no ha terminado */}
                    {d.abierto && <circle cx={x1} cy={y + 5.5} r="3.1" fill={color} />}
                    <text
                      x={x1 + 8}
                      y={y + 9}
                      fontSize="9"
                      className="tabular-nums"
                      fill={activo ? 'rgba(255,255,255,.95)' : d.abierto ? 'rgba(255,255,255,.62)' : 'rgba(255,255,255,.34)'}
                    >
                      {d.dias}
                    </text>
                    {/* Al señalar, la frase entera encima de la barra. Se ancla a
                        la izquierda y se acota para que nunca se salga del lienzo. */}
                    {activo && (
                      <text x={Math.max(4, Math.min(x0, W - 200))} y={y - 3}
                        fill="rgba(255,255,255,.92)" fontSize="9.5">
                        {d.dias} {t('vh.vida.days')} · {d.abierto ? t('vh.vida.open') : t('vh.vida.repaired')}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>

      <p className="mt-2 text-[11px] leading-relaxed text-dark-600">
        {t('vh.vida.foot')}
        {descartados > 0 && ` · ${descartados} ${t('vh.vida.reps')} ${t('vh.vida.nodate')}`}
      </p>
    </div>
  )
}
