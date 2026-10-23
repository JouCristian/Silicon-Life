import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { Box3, BufferGeometry, InstancedMesh, Material, Mesh, Texture, Vector3 } from 'three'
import { createIntegratedChip } from '../scenes/chip/model'
import type { ChipPart } from '../scenes/chip/geometry.js'
import golden from './fixtures/chip-v2-assembly.json'

// Node has no raster canvas. These tests inspect geometry, not texture pixels;
// actual CanvasTexture upload and scene lifecycle are covered in Chromium E2E.
beforeAll(() => {
  const gradient = { addColorStop() {} }
  const context = new Proxy({}, { get: (_, key) => key === 'measureText' ? (text: string) => ({ width: text.length * 20 }) : key === 'createLinearGradient' || key === 'createRadialGradient' ? () => gradient : () => undefined, set: () => true })
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) })
})
afterAll(() => vi.unstubAllGlobals())

describe('DeepSeek V2 production asset', () => {
  it('retains centered package bounds, contact datums, and one 180-pin instance field without demo CPU content', () => {
    const model = createIntegratedChip()
    const { geometry } = model
    const bounds = new Box3().setFromObject(geometry.root)
    expect(bounds.getCenter(new Vector3()).length()).toBeLessThan(1e-6)
    const size = bounds.getSize(new Vector3())
    expect(size.x).toBeCloseTo(12.068, 3)
    expect(size.y).toBeCloseTo(1.746, 3)
    expect(size.z).toBeCloseTo(9.268, 3)
    const ref = geometry.assemblyReference
    expect(ref.brandCarrierBottomY - ref.coverSeatLipTopY).toBeCloseTo(0, 8)
    expect(ref.coverPadBottomY - ref.pylonTopY).toBeCloseTo(-.0025, 8)
    const pins: InstancedMesh[] = [], meshes: Mesh[] = []
    model.root.traverse(object => { if (object instanceof InstancedMesh) pins.push(object); if (object instanceof Mesh) meshes.push(object) })
    expect(pins).toHaveLength(1); expect(pins[0].count).toBe(180)
    // Golden data was measured from the frozen, unmodified V2 factory, not
    // copied from this adapter. Check every pin transform and mechanical part.
    const matrices = pins[0].instanceMatrix.array
    expect(createHash('sha256').update(new Uint8Array(matrices.buffer, matrices.byteOffset, matrices.byteLength)).digest('hex')).toBe(golden.pinMatricesSha256)
    model.root.updateMatrixWorld(true)
    for (const [name, box] of Object.entries(golden.parts)) {
      const expected = new Box3(new Vector3(...box.min as [number, number, number]), new Vector3(...box.max as [number, number, number])).applyMatrix4(model.root.matrixWorld)
      const actual = geometry.getBounds(name as ChipPart)
      expect(actual.min.distanceTo(expected.min)).toBeLessThan(1e-5)
      expect(actual.max.distanceTo(expected.max)).toBeLessThan(1e-5)
    }
    expect(meshes.length).toBeLessThan(45)
    expect(geometry.root.getObjectByName('DemoModules')).toBeUndefined()
    expect(Object.keys(geometry.parts)).not.toContain('DemoModules')
    // One rigid Y-up -> Z-up mapping; no skew or alternate teaching layout.
    const up = new Vector3(0, 1, 0).applyQuaternion(model.root.quaternion)
    expect(up.distanceTo(new Vector3(0, 0, 1))).toBeLessThan(1e-8)
    model.dispose()
  })

  it('reassembles exactly after cycles and arbitrary interrupted reversals, without cumulative offsets', () => {
    const model = createIntegratedChip()
    const initial = model.snapshot()
    for (let cycle = 0; cycle < 12; cycle++) {
      for (const p of [0, .1, .4, .35, .8, .55, 1, .7, .25, 0]) model.setExplodeProgress(p)
      expect(model.snapshot()).toEqual(initial)
      expect(model.geometry.getAnimatedTransforms()).toEqual({
        TopCover: { position: model.geometry.getPoses().assembled.TopCover.position.toArray(), quaternion: model.geometry.getPoses().assembled.TopCover.quaternion.toArray() },
        BrandPlate: { position: model.geometry.getPoses().assembled.BrandPlate.position.toArray(), quaternion: model.geometry.getPoses().assembled.BrandPlate.quaternion.toArray() },
      })
    }
    model.setExplodeProgress(.45)
    const midway = model.snapshot()
    model.setExplodeProgress(.45); expect(model.snapshot()).toEqual(midway)
    model.setExplodeProgress(.45001)
    expect(new Vector3(...model.snapshot().cover as [number, number, number]).distanceTo(new Vector3(...midway.cover as [number, number, number]))).toBeLessThan(.003)
    model.setExplodeProgress(1)
    expect(model.snapshot().visible).toBe(false)
    expect(model.snapshot().opacity).toBe(0)
    expect(model.snapshot().distance[0]).toBeGreaterThan(15)
    for (const part of Object.values(model.geometry.parts).filter(part => part !== model.geometry.root)) expect(part.visible).toBe(false)
    model.setExplodeProgress(Number.NaN); expect(model.snapshot()).toEqual(initial)
    model.dispose()
  })

  it('disposes owned shared geometry, materials, textures and instance buffers exactly once', () => {
    for (let cycle = 0; cycle < 3; cycle++) {
      const model = createIntegratedChip()
      const resources = new Set<BufferGeometry | Material | Texture | InstancedMesh>()
      model.root.traverse(object => {
        if (object instanceof InstancedMesh) resources.add(object)
        if (!(object instanceof Mesh) && !('material' in object)) return
        const renderable = object as Mesh
        resources.add(renderable.geometry)
        for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) {
          resources.add(material)
          for (const value of Object.values(material)) if (value instanceof Texture) resources.add(value)
        }
      })
      const calls = [...resources].map(resource => { const fn = vi.fn(); (resource as Material).addEventListener('dispose', fn); return fn })
      const initial = model.snapshot()
      model.setExplodeProgress(1); model.setExplodeProgress(0)
      expect(model.snapshot()).toEqual(initial)
      model.dispose(); model.dispose(); model.setExplodeProgress(.6)
      expect(model.root.children).toHaveLength(0)
      expect(calls.length).toBeGreaterThan(30)
      for (const call of calls) expect(call).toHaveBeenCalledTimes(1)
    }
  })
})
