import { create } from 'zustand'
import type { ModuleId } from '../core/trace/types'
import { isExplorable, type ExplorerId } from '../scenes/exploration/model'
import { useLabStore } from './useLabStore'
import { usePeripheralStore } from './usePeripheralStore'

interface ExplorationStore {
  selected: ExplorerId | null
  enter: (id: ModuleId) => void
  exit: () => void
}
export const useExplorationStore = create<ExplorationStore>(set => ({
  selected: null,
  enter: id => {
    if (!isExplorable(id) || useLabStore.getState().scene !== 'workbench') return
    useLabStore.getState().pause()
    usePeripheralStore.getState().focus(null)
    set({ selected: id })
  },
  exit: () => set({ selected: null }),
}))
// Exclusive camera ownership without changing the existing peripheral API.
const offPeripheral = usePeripheralStore.subscribe(s => {
  if (s.focused && useExplorationStore.getState().selected) useExplorationStore.getState().exit()
})
const offLab = useLabStore.subscribe((s, before) => {
  if ((s.scene !== 'workbench' || s.activeProjectId !== before.activeProjectId) && useExplorationStore.getState().selected) useExplorationStore.getState().exit()
})
if (import.meta.hot) import.meta.hot.dispose(() => { offPeripheral(); offLab() })
