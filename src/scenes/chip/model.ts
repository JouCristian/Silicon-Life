import { Box3, BufferGeometry, Group, InstancedMesh, Material, Matrix4, Mesh, MeshMatcapMaterial, MeshStandardMaterial, Vector3 } from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { smoothstep } from '../../motion/design'
import { createChipModel, type ChipGeometry, type ChipPart } from './geometry.js'
import { createMetalMatcap } from './materials'

export const CHIP_SCALE = .72
const PARTS: ChipPart[] = ['Substrate', 'OuterFrame', 'PinArray', 'DecorativeDetails', 'TopCover', 'BrandPlate']

/** Bake static meshes in each mechanical part, never across animated joints.
 * Pins retain the authored single 180-instance draw. Temporary geometries are
 * released immediately; material/texture ownership stays with the factory. */
function batchPart(part: Group): void {
  part.updateMatrixWorld(true)
  const inverse = new Matrix4().copy(part.matrixWorld).invert()
  const groups = new Map<string, { material: Material; order: number; meshes: Mesh[] }>()
  part.traverse(object => {
    if (object instanceof InstancedMesh) {
      const original = object.geometry
      object.geometry = mergeVertices(original, 1e-5)
      original.dispose()
      return
    }
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    const key = `${object.material.uuid}:${object.renderOrder}`
    const group = groups.get(key) ?? { material: object.material, order: object.renderOrder, meshes: [] as Mesh[] }
    group.meshes.push(object); groups.set(key, group)
  })
  const retired = new Set<BufferGeometry>()
  for (const { material, order, meshes } of groups.values()) {
    // Normalize indices so rounded boxes, cylinders and planes can share a draw.
    const geometries = meshes.map(mesh => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
      geometry.applyMatrix4(new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld))
      return geometry
    })
    const merged = mergeGeometries(geometries, false)
    geometries.forEach(geometry => geometry.dispose())
    if (!merged) throw new Error('芯片静态几何合批失败')
    // Weld identical position/normal/UV tuples, retaining hard edges and UV
    // seams. The silhouette and triangles are unchanged, but fewer vertices
    // need shading (especially the 180 repeated beveled pins).
    const indexed = mergeVertices(merged, 1e-5)
    merged.dispose()
    const batch = new Mesh(indexed, material)
    batch.name = `${part.name}/batch`; batch.renderOrder = order
    // Matrices have already been baked, including nested SMD end caps.
    for (const mesh of meshes) { retired.add(mesh.geometry); mesh.removeFromParent() }
    part.add(batch)
  }
  retired.forEach(geometry => geometry.dispose())
}

export interface IntegratedChip {
  root: Group
  geometry: ChipGeometry
  setExplodeProgress(progress: number, exitX?: number, exitY?: number): void
  snapshot(): { progress: number; opacity: number; distance: number[]; cover: number[]; brand: number[]; visible: boolean }
  dispose(): void
}

/** No renderer, controls, timers or CPU state. All poses derive from one input. */
export function createIntegratedChip(): IntegratedChip {
  const geometry = createChipModel()
  const matcap = createMetalMatcap()
  const root = new Group()
  root.name = 'IntegratedChipV2'
  // Raycaster otherwise descends into invisible Groups. Once parked, the
  // enclosure must not intercept teaching-plane events or raycast 180 pins.
  root.raycast = () => root.visible ? undefined : false
  // The authored asset is X/right, Y/up, Z/front. The teaching plane is XY,
  // Z/up. Apply this rigid mapping ONCE, keeping the measured origin intact.
  root.rotation.x = Math.PI / 2
  root.scale.setScalar(CHIP_SCALE)
  root.add(geometry.root)
  const originalBounds = new Box3().setFromObject(geometry.root)
  root.userData.assembledSize = originalBounds.getSize(new Vector3()).toArray()
  const fades = new Map<ChipPart, { material: Material; opacity: number; depthWrite: boolean }[]>()
  for (const name of PARTS) {
    const part = geometry.parts[name]
    const clones = new Map<Material, Material>()
    part.traverse(object => {
      if (!(object instanceof Mesh) && !('material' in object)) return
      const renderable = object as Mesh
      const clone = (original: Material) => {
        let material = clones.get(original)
        if (!material) {
          // Preserve authored colors and rounded normals with one small studio
          // reflection lookup. Unlit brand/silkscreen/glow materials stay intact.
          material = original instanceof MeshStandardMaterial
            ? new MeshMatcapMaterial({ color: original.color, matcap })
            : original.clone()
          // Keep the shader variant stable across both directions. Switching
          // opaque/transparent during the reveal causes first-use compile stalls.
          material.transparent = true
          clones.set(original, material)
        }
        return material
      }
      renderable.material = Array.isArray(renderable.material) ? renderable.material.map(clone) : clone(renderable.material)
    })
    fades.set(name, [...clones.values()].map(material => ({ material, opacity: material.opacity, depthWrite: material.depthWrite })))
    batchPart(part)
  }
  let progress = 0, opacity = 1, disposed = false
  function setExplodeProgress(value: number, exitX = 18, exitY = 14) {
    if (disposed) return
    progress = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
    geometry.setExplodeProgress(progress)
    const depart = smoothstep(.28, .98, progress)
    const lift = smoothstep(0, .3, progress) * 2
    for (const [name, sign] of [['TopCover', 1], ['BrandPlate', -1]] as const) {
      const part = geometry.parts[name]
      part.position.x += sign * depart * exitX / CHIP_SCALE
      part.position.z += sign * depart * exitY / CHIP_SCALE
      part.position.y += lift
    }
    opacity = 1 - smoothstep(.12, .94, progress)
    for (const name of PARTS) {
      const upper = name === 'TopCover' || name === 'BrandPlate'
      const fade = upper ? opacity : 1 - smoothstep(.3, .78, progress)
      geometry.parts[name].visible = fade > .00001
      for (const original of fades.get(name)!) {
        const { material } = original
        material.opacity = original.opacity * fade
        material.depthWrite = original.depthWrite && fade === 1
      }
    }
    root.visible = progress < .99999
  }
  setExplodeProgress(0)
  return {
    root, geometry, setExplodeProgress,
    snapshot: () => ({ progress, opacity, visible: root.visible, distance: [geometry.parts.TopCover.position.length() * CHIP_SCALE, geometry.parts.BrandPlate.position.length() * CHIP_SCALE], cover: geometry.parts.TopCover.position.toArray(), brand: geometry.parts.BrandPlate.position.toArray() }),
    dispose() {
      if (disposed) return
      disposed = true
      // Factory collects geometry, cloned materials and shared textures once.
      geometry.dispose()
      root.removeFromParent(); root.clear()
    },
  }
}
