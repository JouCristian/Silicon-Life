import { useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { Group } from 'three'
import { createIntegratedChip, type ChipMaterialMode, type IntegratedChip } from './model'

/** Effect-owned resources survive scene navigation, and cleanly recreate during
 * StrictMode's setup/cleanup probe. No model is allocated during React render. */
export function ChipAsset({ model, host, materialMode = 'pbr' }: {
  model: MutableRefObject<IntegratedChip | null>; host: HTMLElement; materialMode?: ChipMaterialMode
}) {
  const group = useRef<Group>(null)
  useLayoutEffect(() => {
    const asset = createIntegratedChip({ materialMode })
    group.current!.add(asset.root)
    model.current = asset
    host.dataset.chipReady = 'true'
    host.dataset.chipVersion = '3'
    host.dataset.chipMaterial = materialMode
    host.dataset.chipLoads = String(Number(host.dataset.chipLoads ?? 0) + 1)
    return () => {
      host.dataset.chipReady = 'false'
      host.dataset.chipDisposals = String(Number(host.dataset.chipDisposals ?? 0) + 1)
      asset.dispose()
      model.current = null
    }
  }, [model, host, materialMode])
  return <group ref={group} dispose={null} />
}
