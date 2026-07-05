import { Html } from '@react-three/drei'

// Color por severidad (coherente con el resto de la app).
export const SEV_COLOR = {
  critico: '#ef4444', grave: '#f97316', moderado: '#f59e0b',
  leve: '#eab308', sin_analisis: '#94a3b8', sin_danos: '#22c55e',
}
export const SEV_LABEL = {
  critico: 'Crítico', grave: 'Grave', moderado: 'Moderado',
  leve: 'Leve', sin_analisis: 'Sin analizar', sin_danos: 'Sin daños',
}

// Empuja el pin hacia fuera de la superficie a lo largo de su normal.
function offsetPos(pos, normal, d = 0.32) {
  return [pos[0] + normal[0] * d, pos[1] + normal[1] * d, pos[2] + normal[2] * d]
}

export default function DamagePins({ markers, selectedKey, hoveredKey, onSelect, onHover }) {
  return (
    <>
      {markers.map((m) => {
        const color = SEV_COLOR[m.severity] || SEV_COLOR.sin_analisis
        const active = m.key === selectedKey
        const hovered = m.key === hoveredKey
        const repaired = m.status === 'repaired'
        return (
          <Html
            key={m.key}
            position={offsetPos(m.pos, m.normal)}
            center
            zIndexRange={[60, 0]}
            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
          >
            <div
              onClick={(e) => { e.stopPropagation(); onSelect(m.key) }}
              onPointerEnter={() => onHover(m.key)}
              onPointerLeave={() => onHover(null)}
              style={{
                transform: `scale(${active ? 1.35 : hovered ? 1.18 : 1})`,
                transition: 'transform .18s cubic-bezier(.34,1.56,.64,1)',
                position: 'relative',
              }}
            >
              {/* Pin teardrop */}
              <div style={{
                width: 26, height: 26, borderRadius: '50% 50% 50% 0',
                transform: 'rotate(-45deg)',
                background: repaired ? 'transparent' : color,
                border: repaired ? `2.5px dashed ${color}` : `2px solid rgba(255,255,255,.9)`,
                boxShadow: active
                  ? `0 0 0 4px ${color}55, 0 4px 14px ${color}88`
                  : `0 3px 8px rgba(0,0,0,.5)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{
                  transform: 'rotate(45deg)', color: repaired ? color : '#fff',
                  fontSize: 11, fontWeight: 800, lineHeight: 1,
                }}>
                  {repaired ? '✓' : (m.count > 1 ? m.count : '')}
                </span>
              </div>
              {/* Pulso para daños abiertos */}
              {!repaired && (
                <span style={{
                  position: 'absolute', top: 3, left: 3, width: 20, height: 20,
                  borderRadius: '50%', border: `2px solid ${color}`,
                  animation: 'twinPulse 1.8s ease-out infinite', pointerEvents: 'none',
                }} />
              )}

              {/* Tooltip al hover */}
              {(hovered || active) && (
                <div style={{
                  position: 'absolute', bottom: 34, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(17,24,39,.97)', color: '#fff', borderRadius: 8,
                  padding: '6px 10px', whiteSpace: 'nowrap', fontSize: 12,
                  boxShadow: '0 6px 20px rgba(0,0,0,.5)', border: `1px solid ${color}66`,
                }}>
                  <div style={{ fontWeight: 700 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                    {m.sideText && <span>{m.sideText} · </span>}
                    <span style={{ color }}>{SEV_LABEL[m.severity] || m.severity}</span>
                    {repaired && <span style={{ color: '#22c55e' }}> · reparado</span>}
                  </div>
                </div>
              )}
            </div>
          </Html>
        )
      })}
    </>
  )
}
