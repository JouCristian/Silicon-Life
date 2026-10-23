import { useEffect, useMemo } from 'react'
import { ExtrudeGeometry, Path, Shape } from 'three'
import { Edges } from '@react-three/drei'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { createBoardTextures } from './boardTextures'

function roundedRect(path: Path | Shape, width: number, height: number, radius: number) {
  const x = -width / 2
  const y = -height / 2
  path.moveTo(x + radius, y)
  path.lineTo(x + width - radius, y)
  path.quadraticCurveTo(x + width, y, x + width, y + radius)
  path.lineTo(x + width, y + height - radius)
  path.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  path.lineTo(x + radius, y + height)
  path.quadraticCurveTo(x, y + height, x, y + height - radius)
  path.lineTo(x, y + radius)
  path.quadraticCurveTo(x, y, x + radius, y)
  path.closePath()
}

/** A thin carrier frame, not a solid plate: it adds a machined edge without
 * showing a large blank slab while the teaching board is still growing. */
function createCarrierGeometry() {
  const outer = new Shape()
  roundedRect(outer, 16.66, 10.56, .18)
  const hole = new Path()
  roundedRect(hole, 16.34, 10.24, .08)
  outer.holes.push(hole)
  const geometry = new ExtrudeGeometry(outer, { depth: .18, bevelEnabled: false, curveSegments: 8, steps: 1 })
  geometry.translate(0, 0, -.18)
  return geometry
}

/**
 * One textured board shell, one outline and the four existing mounting points.
 * Keeping the same object count as the V2 teaching plane means the V3 visual
 * pass does not enlarge the scene draw budget.
 */
export function TeachingBoard() {
  const textures = useMemo(() => createBoardTextures(), [])
  const geometry = useMemo(() => new RoundedBoxGeometry(16.3, 10.2, .3, 4, .08), [])
  const carrierGeometry = useMemo(() => createCarrierGeometry(), [])

  useEffect(() => () => {
    textures.dispose()
    geometry.dispose()
    carrierGeometry.dispose()
  }, [textures, geometry, carrierGeometry])

  return <group name="TeachingBoardV3">
    {/* A slim graphite carrier, just proud of the PCB, gives the teaching plane
        a machined section and catches a cold edge highlight. */}
    <mesh position={[0, 0, -.43]} geometry={carrierGeometry} dispose={null} castShadow={false} receiveShadow={false}>
      <meshPhysicalMaterial color="#0a141b" metalness={.54} roughness={.42} clearcoat={.2} clearcoatRoughness={.5} envMapIntensity={.72} emissive="#112d3a" emissiveIntensity={.18} />
    </mesh>
    <mesh position={[0, 0, -.28]} geometry={geometry} dispose={null} castShadow={false} receiveShadow={false}>
      <meshBasicMaterial map={textures.map} color="#ffffff" toneMapped />
      <Edges color="#728b9b" />
    </mesh>
    {Array.from({ length: 4 }, (_, i) => <mesh key={i} position={[i % 2 ? 7.7 : -7.7, i < 2 ? -4.7 : 4.7, -.1]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[.1, .1, .035, 10]} />
      <meshStandardMaterial color="#aebbc5" metalness={.82} roughness={.28} envMapIntensity={1.1} />
    </mesh>)}
  </group>
}
