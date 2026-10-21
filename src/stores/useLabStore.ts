import { create } from 'zustand'
import { initialState, MAX_STEPS, step as execute } from '../core/cpu'
import { encode, type Instruction } from '../core/isa'
import { PHASES, type CpuState, type ExecutionTrace, type Phase } from '../core/trace/types'
import { DEMO_WORDS } from '../data/programs'

interface LabStore {
  cpu: CpuState
  program: readonly number[]
  history: readonly ExecutionTrace[]
  traceIndex: number
  phase: Phase
  playing: boolean
  running: boolean
  runSteps: number
  mode: 'demo' | 'pro'
  scene: 'chip' | 'workbench'
  viewVersion: number
  step: () => void
  run: () => void
  pause: () => void
  reset: () => void
  tick: () => void
  observe: (phase: Phase) => void
  replay: (index: number) => void
  updateInstruction: (index: number, instruction: Instruction) => void
  setInitialRegister: (index: number, value: number) => void
  setMode: (mode: 'demo' | 'pro') => void
  enter: () => void
  home: () => void
  resetView: () => void
}

export const useLabStore = create<LabStore>((set, get) => ({
  cpu: initialState(), program: DEMO_WORDS, history: [], traceIndex: -1,
  phase: 'fetch', playing: false, running: false, runSteps: 0,
  mode: 'demo', scene: 'chip', viewVersion: 0,
  step: () => {
    const s = get()
    if (s.playing || s.cpu.status !== 'ready') return
    if (s.runSteps >= MAX_STEPS) {
      set({ running: false, cpu: Object.freeze({ ...s.cpu, status: 'halted', reason: `已达到最大执行步数 ${MAX_STEPS}` }) })
      return
    }
    const result = execute(s.cpu, s.program)
    set({ cpu: result.state, ...(result.trace ? { history: [...s.history, result.trace], traceIndex: s.history.length,
      phase: 'fetch', playing: true, runSteps: s.runSteps + 1 } : { running: false }) })
  },
  run: () => {
    const s = get()
    const pending = s.history[s.traceIndex]
    // Resume a paused latest snapshot before executing another architectural edge.
    if (!s.playing && pending?.after === s.cpu && s.phase !== 'writeback') {
      set({ running: s.cpu.status === 'ready', playing: true })
    } else if (s.cpu.status === 'ready') {
      set({ running: true })
      if (!s.playing) get().step()
    }
  },
  pause: () => set({ running: false, playing: false }),
  reset: () => set({ cpu: initialState(), history: [], traceIndex: -1, phase: 'fetch', playing: false, running: false, runSteps: 0 }),
  tick: () => {
    const s = get()
    if (!s.playing) return
    const index = PHASES.indexOf(s.phase)
    if (index < PHASES.length - 1) set({ phase: PHASES[index + 1] })
    else {
      set({ playing: false })
      if (s.running && s.cpu.status === 'ready') get().step()
      else set({ running: false })
    }
  },
  observe: phase => set({ phase, playing: false, running: false }),
  replay: index => {
    if (get().history[index]) set({ traceIndex: index, phase: 'fetch', playing: true, running: false })
  },
  updateInstruction: (index, instruction) => {
    const word = encode(instruction)
    if (!Number.isInteger(index) || index < 0 || index >= get().program.length) throw new Error('程序索引无效')
    const program = [...get().program]
    program[index] = word
    set({ program, cpu: initialState(), history: [], traceIndex: -1, phase: 'fetch', playing: false, running: false, runSteps: 0 })
  },
  setInitialRegister: (index, value) => {
    if (get().cpu.retired !== 0 || get().running || get().playing) throw new Error('请先复位，再设置初始寄存器')
    if (!Number.isInteger(index) || index < 1 || index > 31) throw new Error('x0 恒为 0；仅可编辑 x1–x31')
    const registers = [...get().cpu.registers]
    registers[index] = value
    set({ cpu: initialState(registers) })
  },
  setMode: mode => set({ mode }),
  enter: () => set(s => ({ scene: 'workbench', viewVersion: s.viewVersion + 1 })),
  home: () => { get().pause(); set(s => ({ scene: 'chip', viewVersion: s.viewVersion + 1 })) },
  resetView: () => set(s => ({ viewVersion: s.viewVersion + 1 })),
}))

// Stable read model and actions: visual components never mutate core state directly.
export function useLabView() {
  const store = useLabStore()
  return { ...store, trace: store.history[store.traceIndex] }
}
