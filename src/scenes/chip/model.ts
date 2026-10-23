import { Box3, BufferGeometry, Group, InstancedMesh, Material, Matrix4, Mesh, MeshMatcapMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Vector3 } from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { smoothstep } from '../../motion/design'
import { createChipModel, type ChipGeometry, type ChipPart } from './geometry.js'
import { createMetalMatcap } from './materialsCompat'

export const CHIP_SCALE = .72
export type ChipMaterialMode = 'pbr' | 'matcap'
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

/** No renderer, controls, timers or CPU state. All poses derive from one input.
 * `matcap` is an explicit software/CI fallback; the default remains full PBR. */
export function createIntegratedChip({ materialMode = 'pbr' }: { materialMode?: ChipMaterialMode } = {}): IntegratedChip {
  const geometry = createChipModel()
  const matcap = materialMode === 'matcap' ? createMetalMatcap() : null
  const root = new Group()
  root.name = 'IntegratedChipV3'
  root.userData.materialMode = materialMode
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

  // The lower enclosure used to fade in place. Keep each authored transform so
  // the whole package can release toward the camera and clear the teaching
  // plane, while every value remains derived from the single reveal progress.
  const bases = new Map<ChipPart, { position: Vector3; quaternion: import('three').Quaternion }>()
  for (const name of PARTS) {
    const part = geometry.parts[name]
    bases.set(name, { position: part.position.clone(), quaternion: part.quaternion.clone() })
  }

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
          if (matcap && original instanceof MeshStandardMaterial) {
            // Software GPU / CI path: keep the exact geometry and animation but
            // avoid full PBR fragment shaders that are especially costly under
            // SwiftShader. Hardware still takes the authored material branch.
            material = new MeshMatcapMaterial({ color: original.color, matcap })
            material.opacity = original.opacity
            material.side = original.side
          } else {
            // Preserve the authored PBR surfaces and procedural maps. The studio
            // environment is supplied once by StudioEnvironment; no per-material
            // render target or hidden second scene is created here.
            material = original.clone()
            if (material instanceof MeshPhysicalMaterial) {
              material.envMapIntensity *= 1.02
              material.dithering = true
            } else if (material instanceof MeshStandardMaterial) {
              material.envMapIntensity *= 1.02
              material.dithering = true
            }
          }
          // Keep the shader variant stable across both directions. Switching
          // opaque/transparent during the reveal causes first-use compile stalls.
          material.transparent = true
          material.needsUpdate = true
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

    // Brand plate leads, cover follows, and the load-bearing base releases once
    // the cover has begun to reveal the teaching plane. All exits are additive
    // offsets from the authored bases, never accumulating positions.
    const brandDepart = smoothstep(.02, .32, progress)
    const coverDepart = smoothstep(.14, .38, progress)
    const release = smoothstep(.2, .64, progress)
    const lift = smoothstep(0, .26, progress) * 2
    for (const [name, sign, depart] of [
      ['TopCover', 1, coverDepart],
      ['BrandPlate', -1, brandDepart],
    ] as const) {
      const part = geometry.parts[name]
      part.position.x += sign * depart * exitX / CHIP_SCALE
      part.position.z += sign * depart * exitY / CHIP_SCALE
      part.position.y += lift
    }

    const lowerDrop: Record<'Substrate' | 'OuterFrame' | 'PinArray' | 'DecorativeDetails', number> = {
      Substrate: .56, OuterFrame: .72, PinArray: .92, DecorativeDetails: .46,
    }
    for (const name of ['Substrate', 'OuterFrame', 'PinArray', 'DecorativeDetails'] as const) {
      const part = geometry.parts[name]
      const base = bases.get(name)!
      part.position.copy(base.position)
      part.quaternion.copy(base.quaternion)
      part.position.z += release * exitY * lowerDrop[name] / CHIP_SCALE
      // Local -Y becomes camera-space depth after the rigid mapping. The base
      // recedes behind the board while it falls, so it never crosses the module
      // plane during the mid-teardown frames.
      part.position.y -= release * (name === 'PinArray' ? 3.6 : 2.6)
    }

    opacity = 1 - smoothstep(.18, .88, progress)
    for (const name of PARTS) {
      const fade = name === 'BrandPlate'
        ? 1 - smoothstep(.16, .44, progress)
        : name === 'TopCover'
          ? 1 - smoothstep(.4, .84, progress)
          : 1 - smoothstep(.28, .52, progress)
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
