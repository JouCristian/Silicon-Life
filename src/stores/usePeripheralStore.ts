import { create } from 'zustand'

export type PeripheralId = 'display'

/**
 * Session-scoped physical attachment for visual peripherals. The MMIO device
 * state itself stays in the frozen CPU read model; this store only decides which
 * physical peripherals are mounted in the workbench and which one owns the
 * camera. Adding a device never fabricates pixels: the display always consumes
 * the real CpuState.display framebuffer.
 */
interface PeripheralStore {
  installed: readonly PeripheralId[]
  focused: PeripheralId | null
  install: (id: PeripheralId) => void
  remove: (id: PeripheralId) => void
  focus: (id: PeripheralId | null) => void
}

export const usePeripheralStore = create<PeripheralStore>(set => ({
  installed: [],
  focused: null,
  install: id => set(s => s.installed.includes(id) ? s : { installed: [...s.installed, id] }),
  remove: id => set(s => ({ installed: s.installed.filter(device => device !== id), focused: s.focused === id ? null : s.focused })),
  focus: id => set(s => id !== null && !s.installed.includes(id) ? s : { focused: id }),
}))

export const hasPeripheral = (installed: readonly PeripheralId[], id: PeripheralId) => installed.includes(id)
