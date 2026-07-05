import { useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBox, useGLTF } from '@react-three/drei'
import { bodyColorFor } from './vanGeometry'

// ─────────────────────────────────────────────────────────────────────────────
// VehicleModelLoader — malla de la furgoneta.
// Si el VehicleModelResolver aporta un GLB del modelo real, se carga ese (y el
// resto del visor no cambia porque todo se posiciona con las MISMAS dims y el
// mapeo de zonas). Si no, geometría procedural paramétrica con las dimensiones
// REALES del modelo (no una furgoneta genérica): silueta específica del modelo.
// ─────────────────────────────────────────────────────────────────────────────

// Modelo 3D real desde GLB, NORMALIZADO al mismo marco que el procedural para
// que los pines de daño (posicionados con dims) encajen sobre la malla:
//   · centrado en X/Z, apoyado en el suelo (y=0)
//   · escalado para que el largo del vehículo = dims.L
//   · orientado con el largo a lo largo de X (front +X)
// flipX/rot corrigen la orientación nativa del GLB (varía según de dónde salga).
function RealVanModel({ url, dims, flipX = false }) {
  const { scene } = useGLTF(url)
  const norm = useMemo(() => {
    const obj = scene.clone(true)
    const box = new THREE.Box3().setFromObject(obj)
    const size = new THREE.Vector3(); box.getSize(size)
    const center = new THREE.Vector3(); box.getCenter(center)
    // largo = eje horizontal mayor; si va por Z, rotamos 90° para llevarlo a X
    const lengthAxisZ = size.z > size.x
    const lengthNative = Math.max(size.x, size.z)
    const scale = lengthNative > 0 ? dims.L / lengthNative : 1
    return {
      obj,
      // centra X/Z y apoya en el suelo (en unidades nativas, antes de escalar)
      center: [-center.x, -box.min.y, -center.z],
      scale,
      rotY: (lengthAxisZ ? Math.PI / 2 : 0) + (flipX ? Math.PI : 0),
    }
  }, [scene, dims, flipX])

  return (
    <group rotation={[0, norm.rotY, 0]}>
      <group scale={[norm.scale, norm.scale, norm.scale]}>
        <group position={norm.center}>
          <primitive object={norm.obj} />
        </group>
      </group>
    </group>
  )
}

export default function VanModel({ dims, brand, inspectionMode, litZones, glbUrl }) {
  if (glbUrl) {
    return <RealVanModel url={glbUrl} dims={dims} />
  }
  return <ProceduralVan dims={dims} brand={brand} inspectionMode={inspectionMode} litZones={litZones} />
}

// Cristal
const GLASS = {
  color: '#0d1b2a', metalness: 0.1, roughness: 0.05,
  transparent: true, opacity: 0.55,
}

function ProceduralVan({ dims, brand, inspectionMode, litZones }) {
  const { L, H, W, cab, roofDrop, nose } = dims
  const bodyColor = inspectionMode ? '#6b7280' : bodyColorFor(brand)

  const body = useMemo(() => ({
    color: bodyColor,
    metalness: inspectionMode ? 0.1 : 0.55,
    roughness: inspectionMode ? 0.85 : 0.35,
  }), [bodyColor, inspectionMode])

  const dark = { color: '#1a1d23', metalness: 0.4, roughness: 0.5 }
  const tyre = { color: '#111316', metalness: 0.1, roughness: 0.85 }
  const rim = { color: inspectionMode ? '#5b6270' : '#c3c7cd', metalness: 0.8, roughness: 0.3 }
  const light = { color: '#e8eef5', metalness: 0.3, roughness: 0.15, emissive: '#dfe8f2', emissiveIntensity: 0.25 }
  const rearLight = { color: '#c0392b', metalness: 0.3, roughness: 0.2, emissive: '#7a1f16', emissiveIntensity: 0.3 }

  const hw = W / 2
  const cabLen = L * cab
  const cargoLen = L - cabLen
  const cargoCx = L / 2 - cabLen - cargoLen / 2   // centro del furgón (X)
  const cabCx = L / 2 - cabLen / 2
  const wheelR = Math.min(0.42, H * 0.17)
  const axleY = wheelR * 0.92
  const frontAxleX = L / 2 - cabLen * 0.55
  const rearAxleX = -L / 2 + L * 0.16
  const bodyY = axleY + 0.12

  // Ruedas (4)
  const wheels = [
    [frontAxleX, axleY, hw + 0.02],
    [frontAxleX, axleY, -hw - 0.02],
    [rearAxleX, axleY, hw + 0.02],
    [rearAxleX, axleY, -hw - 0.02],
  ]

  return (
    <group position={[0, 0, 0]}>
      {/* ── Furgón (caja de carga) ── */}
      <RoundedBox
        args={[cargoLen, H - bodyY, W]} radius={0.10} smoothness={4}
        position={[cargoCx, bodyY + (H - bodyY) / 2, 0]}
      >
        <meshStandardMaterial {...body} />
      </RoundedBox>

      {/* ── Cabina (algo más baja) ── */}
      <RoundedBox
        args={[cabLen, (H - bodyY) - roofDrop, W - 0.04]} radius={0.12} smoothness={4}
        position={[cabCx, bodyY + ((H - bodyY) - roofDrop) / 2, 0]}
      >
        <meshStandardMaterial {...body} />
      </RoundedBox>

      {/* ── Morro / capó inclinado ── */}
      <mesh position={[L / 2 - nose / 2, bodyY + 0.28, 0]} rotation={[0, 0, -0.12]}>
        <boxGeometry args={[nose, 0.5, W - 0.06]} />
        <meshStandardMaterial {...body} />
      </mesh>

      {/* ── Parabrisas ── */}
      <mesh position={[cabCx + cabLen * 0.36, H - roofDrop - 0.34, 0]} rotation={[0, 0, 0.52]}>
        <boxGeometry args={[0.06, 0.62, W - 0.18]} />
        <meshStandardMaterial {...GLASS} />
      </mesh>

      {/* ── Ventanas laterales cabina ── */}
      {[1, -1].map((sz) => (
        <mesh key={sz} position={[cabCx + 0.15, H - roofDrop - 0.4, sz * (hw - 0.01)]}>
          <boxGeometry args={[cabLen * 0.5, 0.42, 0.04]} />
          <meshStandardMaterial {...GLASS} />
        </mesh>
      ))}

      {/* ── Líneas de puertas / paneles (surcos oscuros) ── */}
      {[1, -1].map((sz) => (
        <group key={sz}>
          {/* Puerta corredera lateral */}
          <mesh position={[cargoCx + cargoLen * 0.12, H * 0.5, sz * (hw + 0.006)]}>
            <boxGeometry args={[0.02, H * 0.62, 0.02]} />
            <meshStandardMaterial {...dark} />
          </mesh>
          {/* Puerta cabina */}
          <mesh position={[cabCx - cabLen * 0.28, H * 0.42, sz * (hw + 0.006)]}>
            <boxGeometry args={[0.02, H * 0.5, 0.02]} />
            <meshStandardMaterial {...dark} />
          </mesh>
          {/* Faldón inferior */}
          <mesh position={[cargoCx, bodyY + 0.04, sz * (hw + 0.004)]}>
            <boxGeometry args={[cargoLen * 0.96, 0.05, 0.02]} />
            <meshStandardMaterial {...dark} />
          </mesh>
        </group>
      ))}

      {/* ── Portón trasero (partición doble) ── */}
      <mesh position={[-L / 2 + 0.006, H * 0.5, 0]}>
        <boxGeometry args={[0.02, H * 0.7, 0.03]} />
        <meshStandardMaterial {...dark} />
      </mesh>

      {/* ── Paragolpes delantero y trasero ── */}
      <RoundedBox args={[0.22, 0.3, W - 0.04]} radius={0.06} smoothness={3}
        position={[L / 2 - 0.02, bodyY + 0.02, 0]}>
        <meshStandardMaterial {...dark} />
      </RoundedBox>
      <RoundedBox args={[0.18, 0.28, W - 0.04]} radius={0.06} smoothness={3}
        position={[-L / 2 + 0.02, bodyY, 0]}>
        <meshStandardMaterial {...dark} />
      </RoundedBox>

      {/* ── Faros y pilotos ── */}
      {[1, -1].map((sz) => (
        <mesh key={`hl${sz}`} position={[L / 2 - 0.06, bodyY + 0.34, sz * (hw - 0.28)]}>
          <boxGeometry args={[0.06, 0.18, 0.34]} />
          <meshStandardMaterial {...light} />
        </mesh>
      ))}
      {[1, -1].map((sz) => (
        <mesh key={`tl${sz}`} position={[-L / 2 + 0.04, H * 0.62, sz * (hw - 0.16)]}>
          <boxGeometry args={[0.05, 0.5, 0.16]} />
          <meshStandardMaterial {...rearLight} />
        </mesh>
      ))}

      {/* ── Retrovisores ── */}
      {[1, -1].map((sz) => (
        <mesh key={`mr${sz}`} position={[L / 2 - cabLen * 0.55, H - roofDrop - 0.5, sz * (hw + 0.16)]}>
          <boxGeometry args={[0.08, 0.22, 0.14]} />
          <meshStandardMaterial {...dark} />
        </mesh>
      ))}

      {/* ── Ruedas ── */}
      {wheels.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[wheelR, wheelR, 0.22, 28]} />
            <meshStandardMaterial {...tyre} />
          </mesh>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[wheelR * 0.62, wheelR * 0.62, 0.04, 22]} />
            <meshStandardMaterial {...rim} />
          </mesh>
        </group>
      ))}

      {/* ── Modo inspección: halos de color en las zonas dañadas ── */}
      {inspectionMode && (litZones || []).map((z, i) => (
        <mesh key={i} position={z.pos}>
          <sphereGeometry args={[0.14, 16, 16]} />
          <meshStandardMaterial color={z.color} emissive={z.color} emissiveIntensity={1.4}
            transparent opacity={0.85} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
