import type { Box3, Group, Material, Quaternion, Vector3 } from 'three'

export type ChipPart = 'Substrate' | 'OuterFrame' | 'PinArray' | 'DecorativeDetails' | 'TopCover' | 'BrandPlate'
export interface Pose { position: Vector3; quaternion: Quaternion }
export interface ChipGeometry {
  root: Group
  parts: Record<ChipPart | 'ChipRoot', Group>
  materials: Record<string, Material>
  assemblyReference: Record<'modelCenterOffset', number[]> & Record<'coverSeatLipTopY' | 'coverInnerUndersideY' | 'coverPadBottomY' | 'brandCarrierBottomY' | 'pylonTopY', number>
  setExplodeProgress(progress: number): number
  getExplodeProgress(): number
  getPoses(): { assembled: Record<'TopCover' | 'BrandPlate', Pose>; exploded: Record<'TopCover' | 'BrandPlate', Pose> }
  getAnimatedTransforms(): Record<'TopCover' | 'BrandPlate', { position: number[]; quaternion: number[] }>
  getBounds(part?: ChipPart | 'ChipRoot', target?: Box3): Box3
  resetModel(): void
  dispose(): void
}
export function createChipModel(): ChipGeometry
