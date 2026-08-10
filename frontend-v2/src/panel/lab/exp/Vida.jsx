/* ─────────────────────────────────────────────────────────────────────────────
   LÍNEA DE VIDA DEL VEHÍCULO
   ---------------------------------------------------------------------------
   Forma deliberadamente distinta a un gráfico de puntos: aquí lo que importa no
   es CUÁNDO pasó cada cosa, sino CUÁNTO TIEMPO estuvo así.

   Un daño no es un instante, es un PERIODO: desde que se detecta hasta que se
   repara. Dibujarlo como una barra que se extiende hace visible de un vistazo
   lo que una lista esconde — que ese golpe lleva 94 días abierto, o que la
   furgoneta pasó tres semanas en el taller en marzo.

   CÓMO SE LEE
   · Cada carril horizontal es un panel de la carrocería.
   · La barra empieza el día que se detectó y termina el día que se reparó.
   · Una barra que llega al borde derecho sigue abierta HOY.
   · Las bandas grises de fondo son los periodos en taller.
   · La retícula son los meses.

   SIN FALSOS POSITIVOS
   · Un daño sin fecha de reparación se dibuja hasta hoy, no hasta una fecha
     inventada, y se marca como abierto.
   · Si dos daños caen en el mismo panel, van en el mismo carril: es
     exactamente lo que hace visible la reincidencia, sin necesidad de
     afirmar que existe un patrón.
   · No se dibuja nada anterior al primer dato conocido del vehículo: el
     silencio de antes no es "no pasó nada", es "no lo sabemos".

   Datos: LAB/SIMULATED.
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo } from 'react'

const DIA = 86400000
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const SEV = { leve: '#d9a441', moderado: '#e08a3c', grave: '#e5695f', critico: '#e5695f' }

export default function Vida({ danos, hoy, taller = [], onSel, sel }) {
  const { carriles, meses, W, H, x } = useMemo(() => {
    const hoyMs = Date.parse(hoy + 'T12:00:00Z')
    const fechas = danos.map((d) => Date.parse(String(d.first_seen).slice(0, 10) + 'T12:00:00Z'))
      .filter((n) => isFinite(n))
    /* El eje empieza en el dato más antiguo que tenemos, no en una fecha
       redonda: dibujar meses vacíos anteriores sugeriría que ahí no pasó nada,
       y lo que pasa es que no lo sabemos. */
    const desde = fechas.length ? Math.min(...fechas) - 10 * DIA : hoyMs - 180 * DIA
    const span = Math.max(hoyMs - desde, 30 * DIA)

    const izq = 128, der = 16, arriba = 20, altoCarril = 26
    const W = 760
    const x = (ms) => izq + ((ms - desde) / span) * (W - izq - der)

    /* Un carril por panel: la reincidencia aparece sola, sin afirmarla */
    const porPanel = {}
    for (const d of danos) (porPanel[d.part || d.panel] ||= []).push(d)
    const carriles = Object.entries(porPanel)
      .map(([panel, xs]) => ({
        panel,
        n: xs.length,
        items: xs.map((d) => {
          const ini = Date.parse(String(d.first_seen).slice(0, 10) + 'T12:00:00Z')
          const fin = d.repair_status === 'done' && d.repaired_at
            ? Date.parse(String(d.repaired_at).slice(0, 10) + 'T12:00:00Z')
            : hoyMs
          return { ...d, ini, fin, abierto: d.repair_status !== 'done', dias: Math.round((fin - ini) / DIA) }
        }),
      }))
      .sort((a, b) => b.n - a.n || b.items[0].ini - a.items[0].ini)

    const H = arriba + carriles.length * altoCarril + 26

    /* Marcas de mes, sin saturar: como mucho ocho */
    const meses = []
    const d0 = new Date(desde)
    d0.setUTCDate(1)
    const paso = Math.max(1, Math.ceil(span / DIA / 30 / 8))
    for (let k = 0, t = d0.getTime(); t <= hoyMs; k += 1) {
      if (k % paso === 0) meses.push(t)
      const n = new Date(t); n.setUTCMonth(n.getUTCMonth() + 1); t = n.getTime()
    }

    return { carriles, meses, W, H, x, desde, izq, arriba, altoCarril }
  }, [danos, hoy])

  const izq = 128, arriba = 20, altoCarril = 26
  const hoyMs = Date.parse(hoy + 'T12:00:00Z')

  if (!danos.length) {
    return <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,.42)' }}>Sin daños registrados para esta furgoneta.</p>
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img" aria-label="Línea de vida del vehículo: cada barra es un daño desde que se detectó hasta que se reparó">

        {/* Periodos en taller, de fondo */}
        {taller.map((t, i) => (
          <rect key={i} x={x(t.ini)} y={arriba - 6} width={Math.max(2, x(t.fin) - x(t.ini))}
            height={carriles.length * altoCarril + 4} fill="rgba(255,255,255,.05)" rx="2" />
        ))}

        {/* Meses */}
        {meses.map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={arriba - 6} x2={x(t)} y2={arriba + carriles.length * altoCarril - 2}
              stroke="rgba(255,255,255,.055)" strokeWidth="1" />
            <text x={x(t)} y={H - 8} textAnchor="middle" fill="rgba(255,255,255,.28)"
              fontSize="9.5" fontFamily="ui-monospace, monospace" letterSpacing=".06em">
              {MES[new Date(t).getUTCMonth()]}
            </text>
          </g>
        ))}

        {/* Hoy: la única línea que se ve */}
        <line x1={x(hoyMs)} y1={arriba - 10} x2={x(hoyMs)} y2={arriba + carriles.length * altoCarril}
          stroke="rgba(255,122,61,.5)" strokeWidth="1" strokeDasharray="2 3" />

        {carriles.map((c, i) => {
          const y = arriba + i * altoCarril
          return (
            <g key={c.panel}>
              <text x={izq - 10} y={y + 12} textAnchor="end" fill="rgba(255,255,255,.44)" fontSize="10.5">
                {c.panel.length > 20 ? c.panel.slice(0, 19) + '…' : c.panel}
              </text>
              {c.n > 1 && (
                <text x={izq - 10} y={y + 22} textAnchor="end" fill="rgba(229,105,95,.72)" fontSize="8.5">
                  {c.n} veces
                </text>
              )}
              {c.items.map((d) => {
                const activo = sel === d.id
                const x0 = x(d.ini), x1 = Math.max(x0 + 3, x(d.fin))
                return (
                  <g key={d.id} onClick={() => onSel?.(sel === d.id ? null : d.id)} style={{ cursor: 'pointer' }}>
                    <rect x={x0} y={y + 3} width={x1 - x0} height={9} rx="4.5"
                      fill={SEV[d.severity] || '#d9a441'}
                      opacity={d.abierto ? (activo ? 1 : .85) : (activo ? .6 : .32)} />
                    {/* El extremo abierto se remata en punta: no ha terminado */}
                    {d.abierto && <circle cx={x1} cy={y + 7.5} r="3.5" fill={SEV[d.severity] || '#d9a441'} />}
                    {activo && (
                      <text x={x0} y={y - 1} fill="rgba(255,255,255,.9)" fontSize="9.5">
                        {d.dias} días{d.abierto ? ' · sigue abierto' : ' · reparado'}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>

      <p style={{ margin: '8px 0 0', fontSize: 11.5, lineHeight: 1.65, color: 'rgba(255,255,255,.42)' }}>
        Cada barra va desde que se detectó el daño hasta que se reparó; las que acaban en punto siguen abiertas hoy.
        Las bandas grises son periodos en taller. <b style={{ color: 'rgba(255,255,255,.62)', fontWeight: 500 }}>Que
        dos barras compartan carril es un hecho contable</b>, no la prueba de un patrón: para afirmar que esta
        furgoneta se rompe más que las demás habría que compararla con otras de kilometraje parecido.
      </p>
    </div>
  )
}
