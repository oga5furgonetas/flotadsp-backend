/* ─────────────────────────────────────────────────────────────────────────────
   LA PISTA — cuándo se te acumula el taller
   ---------------------------------------------------------------------------
   POR QUÉ UN GRÁFICO Y NO OTRA LISTA

   Una lista ordenada por urgencia responde "¿qué toca primero?". No responde la
   pregunta que de verdad cuesta dinero: **¿en qué semana se me juntan?**

   Tres aceites, dos pastillas y unas ruedas cayendo la misma semana son seis
   furgonetas paradas a la vez. Eso no se ve leyendo filas: se ve cuando pones
   el tiempo en un eje y miras dónde se apelotonan los puntos.

   ELECCIONES DE DISEÑO, y por qué cada una

   · DOT PLOT sobre eje temporal, no barras. Cada punto es un mantenimiento
     concreto; la posición es su fecha estimada. Las barras agregarían y
     esconderían justo lo que hay que ver: la aglomeración.
   · TRES CARRILES por tipo de servicio. Permite ver que la semana 3 son todo
     aceites (una entrada al taller) y no seis servicios distintos.
   · APILADO VERTICAL cuando dos caen el mismo día: el montón ES el dato.
   · RETÍCULA SEMANAL al 6 % sobre la base, que es lo que recomienda un sistema
     de gráficos para modo oscuro: se lee sin competir con los datos.
   · LOS VENCIDOS NO VAN EN EL EJE. Van en una banda propia a la izquierda,
     porque "hace 12 días" y "dentro de 12 días" no son la misma magnitud y
     mezclarlos en la misma escala sería mentir con la geometría.
   · LOS SIN RITMO MEDIDO TAMPOCO. No tienen fecha, así que no pueden tener
     posición. Se cuentan aparte.

   SIN FALSOS POSITIVOS
   Un atasco sólo se marca con 3 o más servicios en la misma semana. Con dos no
   se avisa: dos furgonetas en el taller la misma semana es un martes normal.

   Datos: LAB/SIMULATED.
   ───────────────────────────────────────────────────────────────────────────── */
import { useMemo, useState } from 'react'

const LANE = { aceite: 0, pastillas: 1, ruedas: 2 }
const COLOR = { aceite: '#5aa9e6', pastillas: '#e0a13c', ruedas: '#8f7fe8' }
const NOMBRE = { aceite: 'Aceite', pastillas: 'Pastillas', ruedas: 'Ruedas' }
const HORIZONTE = 42          // días que entran en el eje
const ATASCO = 3              // servicios en la misma semana para avisar

export default function Runway({ filas, sinRitmo, onSel, sel }) {
  const [hover, setHover] = useState(null)

  const { enEje, vencidos, semanas, atascos, W, H, x } = useMemo(() => {
    /* La banda de vencidos ocupa 0-62 y los rótulos de carril 70-128, para que
       no se pisen: antes el texto caía dentro del recuadro rojo. */
    const W = 760, H = 176
    const izq = 138, der = 20, arriba = 26, alto = 34
    const vencidos = filas.filter((f) => f.dias !== null && f.pasado)
    const enEje = filas.filter((f) => f.dias !== null && !f.pasado && f.dias <= HORIZONTE)
    const x = (d) => izq + (d / HORIZONTE) * (W - izq - der)

    /* Apilado: si dos caen el mismo día y carril, uno se sube */
    const usados = {}
    for (const f of enEje) {
      const k = `${f.tipo.kind}-${Math.round(f.dias)}`
      f._n = usados[k] = (usados[k] || 0) + 1
    }

    const semanas = [0, 7, 14, 21, 28, 35, 42]
    const porSemana = {}
    for (const f of enEje) {
      const s = Math.floor(f.dias / 7)
      ;(porSemana[s] ||= []).push(f)
    }
    /* ATASCO RELATIVO, no absoluto. La primera versión marcaba toda semana con
       3 o más y acababa pintando casi el gráfico entero: si todo está señalado,
       nada lo está. Un atasco es una semana que SE SALE de tu media, así que se
       exige superar el doble de la mediana de las demás — y aun así un mínimo
       absoluto, porque duplicar una mediana de 1 no es un atasco. */
    const cuentas = Object.values(porSemana).map((xs) => xs.length).sort((a, b) => a - b)
    const mediana = cuentas.length ? cuentas[Math.floor(cuentas.length / 2)] : 0
    const umbral = Math.max(ATASCO, Math.ceil(mediana * 2))
    const atascos = Object.entries(porSemana)
      .filter(([, xs]) => xs.length >= umbral)
      .map(([s, xs]) => ({ semana: Number(s), n: xs.length, umbral, mediana }))
      .sort((a, b) => b.n - a.n)

    return { enEje, vencidos, semanas, atascos, W, H, x, izq, arriba, alto }
  }, [filas])

  const izq = 138, arriba = 26, alto = 34
  const yDe = (kind, n) => arriba + LANE[kind] * alto + 16 - (n - 1) * 9

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img" aria-label="Mantenimientos previstos en los próximos 42 días, por tipo de servicio">

        {/* Franjas de atasco: detrás de todo, para que no compitan */}
        {atascos.map((a) => (
          <g key={a.semana}>
            <rect x={x(a.semana * 7)} y={arriba - 8}
              width={x(7) - x(0)} height={alto * 3 + 4}
              fill="#e0a13c" opacity="0.09" rx="3" />
            <text x={x(a.semana * 7) + (x(7) - x(0)) / 2} y={arriba - 13} textAnchor="middle"
              fill="#e0a13c" fontSize="9" letterSpacing=".06em">
              {a.n} JUNTOS
            </text>
          </g>
        ))}

        {/* Retícula semanal al 6 %, y la etiqueta debajo */}
        {semanas.map((d) => (
          <g key={d}>
            <line x1={x(d)} y1={arriba - 8} x2={x(d)} y2={arriba + alto * 3 - 4}
              stroke="rgba(255,255,255,.06)" strokeWidth="1" />
            <text x={x(d)} y={H - 22} textAnchor="middle"
              fill="rgba(255,255,255,.30)" fontSize="9.5"
              fontFamily="ui-monospace, monospace" letterSpacing=".08em">
              {d === 0 ? 'HOY' : `+${d}d`}
            </text>
          </g>
        ))}

        {/* Banda de vencidos, fuera de la escala a propósito */}
        {vencidos.length > 0 && (
          <g>
            <rect x="0" y={arriba - 8} width="62" height={alto * 3 + 4}
              fill="#e5695f" opacity="0.08" rx="4" />
            <text x="31" y={arriba + 34} textAnchor="middle"
              fill="#e5695f" fontSize="21" fontWeight="500"
              style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' }}>
              {vencidos.length}
            </text>
            <text x="31" y={arriba + 50} textAnchor="middle"
              fill="rgba(229,105,95,.75)" fontSize="8.5" letterSpacing=".06em">
              VENCIDOS
            </text>
            <text x="31" y={arriba + 63} textAnchor="middle"
              fill="rgba(255,255,255,.26)" fontSize="8">
              fuera de escala
            </text>
          </g>
        )}

        {/* Carriles */}
        {Object.keys(LANE).map((k) => (
          <g key={k}>
            <line x1={izq} y1={arriba + LANE[k] * alto + 16} x2={W - 20} y2={arriba + LANE[k] * alto + 16}
              stroke="rgba(255,255,255,.05)" strokeWidth="1" />
            <text x={izq - 10} y={arriba + LANE[k] * alto + 19} textAnchor="end"
              fill="rgba(255,255,255,.34)" fontSize="10">{NOMBRE[k]}</text>
          </g>
        ))}

        {/* Los puntos: cada uno un mantenimiento */}
        {enEje.map((f) => {
          const activo = sel === f.id || hover === f.id
          const cx = x(f.dias), cy = yDe(f.tipo.kind, f._n)
          return (
            <g key={f.id}
              onMouseEnter={() => setHover(f.id)} onMouseLeave={() => setHover(null)}
              onClick={() => onSel?.(sel === f.id ? null : f.id)}
              style={{ cursor: 'pointer' }}>
              {activo && <circle cx={cx} cy={cy} r="9" fill={COLOR[f.tipo.kind]} opacity=".18" />}
              <circle cx={cx} cy={cy} r={activo ? 5 : 4}
                fill={COLOR[f.tipo.kind]} opacity={activo ? 1 : .82}
                stroke="#0e0e10" strokeWidth="1.5" />
              {activo && (
                <text x={cx} y={cy - 13} textAnchor="middle" fill="rgba(255,255,255,.92)"
                  fontSize="10" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {f.matricula}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Lectura del gráfico, en palabras. Un gráfico que hay que descifrar
          no sirve en una operación a las siete de la mañana. */}
      <p style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.65, color: 'rgba(255,255,255,.55)' }}>
        {atascos.length > 0 ? (
          <>Se te juntan <b style={{ color: '#e0a13c', fontWeight: 500 }}>{atascos[0].n} servicios</b> en la semana
            {' '}del día +{atascos[0].semana * 7}, cuando lo normal en tu flota son {atascos[0].mediana} por semana.
            {' '}Adelanta uno o dos y evitas tener varias furgonetas paradas a la vez.</>
        ) : (
          <>Ninguna semana se sale de lo normal. Se avisa cuando una <b style={{ color: 'rgba(255,255,255,.8)', fontWeight: 500 }}>duplica
            la mediana</b> de las demás, no por acumular un número fijo: con un umbral fijo acabaría marcado casi todo
            el calendario y el aviso dejaría de significar nada.</>
        )}
        {sinRitmo > 0 && (
          <> Otros <b style={{ color: 'rgba(255,255,255,.8)', fontWeight: 500 }}>{sinRitmo}</b> no aparecen aquí porque
            no tienen kilómetros suficientes para estimar una fecha.</>
        )}
      </p>
    </div>
  )
}
