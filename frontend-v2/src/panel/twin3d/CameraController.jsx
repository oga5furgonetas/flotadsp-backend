import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ─────────────────────────────────────────────────────────────────────────────
// CameraController — vuelo suave de cámara (fly-to) al seleccionar un daño o al
// pulsar una vista preset. Interpola posición de cámara y target de OrbitControls.
// ─────────────────────────────────────────────────────────────────────────────
export default function CameraController({ controlsRef, target }) {
  const { camera } = useThree()
  const from = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3() })
  const to = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3() })
  const t = useRef(1) // 1 = en reposo

  useEffect(() => {
    if (!target) return
    from.current.pos.copy(camera.position)
    from.current.look.copy(controlsRef.current ? controlsRef.current.target : new THREE.Vector3())
    to.current.pos.set(target.pos[0], target.pos[1], target.pos[2])
    to.current.look.set(target.look[0], target.look[1], target.look[2])
    t.current = 0
  }, [target, camera, controlsRef])

  useFrame((_, delta) => {
    if (t.current >= 1) return
    t.current = Math.min(1, t.current + delta * 1.6)
    const e = 1 - Math.pow(1 - t.current, 3) // easeOutCubic
    camera.position.lerpVectors(from.current.pos, to.current.pos, e)
    if (controlsRef.current) {
      controlsRef.current.target.lerpVectors(from.current.look, to.current.look, e)
      controlsRef.current.update()
    }
  })

  return null
}

// Calcula la posición de cámara para encuadrar un punto mirando a lo largo de
// su normal, a una distancia dada.
export function frameFromNormal(pos, normal, dist = 3.2) {
  return {
    pos: [pos[0] + normal[0] * dist, pos[1] + normal[1] * dist + 0.4, pos[2] + normal[2] * dist],
    look: pos,
  }
}
