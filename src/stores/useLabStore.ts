import { create } from 'zustand'
import { initialState, MAX_STEPS, step as execute } from '../core/cpu'
import { encode, type Instruction } from '../core/isa'
import { PHASES, type CpuState, type ExecutionTrace, type Phase } from '../core/trace/types'
import { DEMO_WORDS, PROGRAMS } from '../data/programs'
import { presentationClock, timelineFor } from '../motion/timeline'
import { AUTO_PLAYBACK, PLAYBACK_RATES, transferSteps, type TransferPlayback } from '../motion/transferPlayback'
import { createMemory, type DataMemory } from '../core/memory'
import { insertWord, moveWord, removeWord, validateProgram } from '../io/program'

interface LabStore {
  cpu: CpuState
  program: readonly number[]
  programId: string
  customProgram: readonly number[]
  customBaseline: readonly number[]
  selectedInstruction: number
  initialMemory: DataMemory
  initialRegisters: readonly number[]
  selectInstruction: (index: number) => void
  createCustomProgram: (source?: readonly number[]) => void
  restoreCustomProgram: () => void
  insertInstruction: (index: number, instruction?: Instruction) => void
  deleteInstruction: (index: number) => void
  moveInstruction: (from: number, to: number) => void
  importProgram: (words: readonly number[], append?: boolean) => void
  setInitialMemory: (memory: DataMemory) => void
  loadProgram: (id: string) => void
  history: readonly ExecutionTrace[]
  traceIndex: number
  phase: Phase
  playbackEpoch: number
  inspection: boolean
  playing: boolean
  running: boolean
  runSteps: number
  playbackRate: number
  transferPlayback: TransferPlayback
  stepTransfer: () => void
  setPlaybackRate: (rate: number) => void
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
  resumePlayback: () => void
  updateInstruction: (index: number, instruction: Instruction) => void
  setInitialRegister: (index: number, value: number) => void
  setMode: (mode: 'demo' | 'pro') => void
  enter: () => void
  home: () => void
  resetView: () => void
}

function resetSession(s: Pick<LabStore, 'initialRegisters' | 'initialMemory' | 'playbackEpoch'>) {
  return { cpu: initialState(s.initialRegisters, s.initialMemory), history: [], traceIndex: -1,
    phase: 'fetch' as const, inspection: false, transferPlayback: AUTO_PLAYBACK,
    playbackEpoch: s.playbackEpoch + 1, playing: false, running: false, runSteps: 0 }
}

export const useLabStore = create<LabStore>((set, get) => ({
  cpu: initialState(), program: DEMO_WORDS, programId: 'arithmetic', history: [], traceIndex: -1,
  customProgram: Object.freeze([]), customBaseline: Object.freeze([]), selectedInstruction: 0,
  initialMemory: createMemory(), initialRegisters: Object.freeze(Array(32).fill(0)),
  phase: 'fetch', playbackEpoch: 0, inspection: false, playing: false, running: false, runSteps: 0,
  mode: 'demo', scene: 'chip', viewVersion: 0,
  playbackRate: .5, transferPlayback: AUTO_PLAYBACK,
  step: () => {
    const s = get()
    if (s.playing || s.cpu.status !== 'ready') return
    if (s.runSteps >= MAX_STEPS) {
      set({ running: false, cpu: Object.freeze({ ...s.cpu, status: 'halted', reason: `已达到最大执行步数 ${MAX_STEPS}` }) })
      return
    }
    const result = execute(s.cpu, s.program)
    set({ cpu: result.state, ...(result.trace ? { history: [...s.history, result.trace], traceIndex: s.history.length,
      phase: 'fetch', playing: true, inspection: false, transferPlayback: AUTO_PLAYBACK, playbackEpoch: s.playbackEpoch + 1, runSteps: s.runSteps + 1 } : { running: false }) })
  },
  run: () => {
    const s = get()
    const pending = s.history[s.traceIndex]
    // Resume a paused latest snapshot before executing another architectural edge.
    if (!s.playing && pending?.after === s.cpu && (s.phase !== 'writeback' || s.transferPlayback.mode === 'transfer' && !s.transferPlayback.complete)) {
      set({ running: s.cpu.status === 'ready', playing: true, transferPlayback: AUTO_PLAYBACK, ...(s.inspection ? { inspection: false, playbackEpoch: s.playbackEpoch + 1 } : {}) })
    } else if (s.cpu.status === 'ready') {
      set({ running: true, transferPlayback: AUTO_PLAYBACK })
      if (!s.playing) get().step()
    }
  },
  pause: () => set({ running: false, playing: false }),
  reset: () => set(s => resetSession(s)),
  loadProgram: id => {
    const s = get()
    const preset = PROGRAMS.find(p => p.id === id)
    if (id !== 'custom' && !preset) throw new Error('未知教学程序')
    const program = id === 'custom' ? s.customProgram : validateProgram(preset!.instructions.map(encode))
    set({ ...resetSession(s), programId: id, program, selectedInstruction: program.length ? 0 : -1 })
  },
  tick: () => {
    const s = get()
    if (!s.playing) return
    if (s.transferPlayback.mode === 'transfer') {
      set({ playing: false, running: false, transferPlayback: { ...s.transferPlayback, complete: s.transferPlayback.index === transferSteps(s.history[s.traceIndex]).length - 1 } })
      return
    }
    const index = PHASES.indexOf(s.phase)
    if (index < PHASES.length - 1) set({ phase: PHASES[index + 1], playbackEpoch: s.playbackEpoch + 1, inspection: false })
    else {
      set({ playing: false })
      if (s.running && s.cpu.status === 'ready') get().step()
      else set({ running: false })
    }
  },
  observe: phase => set(s => ({ phase, playing: false, running: false, inspection: true, transferPlayback: AUTO_PLAYBACK, playbackEpoch: s.playbackEpoch + 1 })),
  replay: index => {
    if (get().history[index]) set(s => ({ traceIndex: index, phase: 'fetch', playing: true, running: false, inspection: false, transferPlayback: AUTO_PLAYBACK, playbackEpoch: s.playbackEpoch + 1 }))
  },
  resumePlayback: () => {
    const s = get()
    if (s.transferPlayback.mode === 'transfer') {
      const event = transferSteps(s.history[s.traceIndex])[s.transferPlayback.index]
      if (!event || s.transferPlayback.complete) return
      if (presentationClock.read(s.playbackEpoch, false, event.end) >= event.end) { get().stepTransfer(); return }
      set({ playing: true, running: false }); return
    }
    if (s.history[s.traceIndex]) set({ playing: true, running: false, ...(s.inspection || s.phase === 'writeback' ? { inspection: false, playbackEpoch: s.playbackEpoch + 1 } : {}) })
  },
  updateInstruction: (index, instruction) => {
    const word = encode(instruction)
    if (!Number.isInteger(index) || index < 0 || index >= get().program.length) throw new Error('程序索引无效')
    const program = [...get().program]
    program[index] = word
    const checked = validateProgram(program), s = get()
    const baseline = s.programId === 'custom' ? s.customBaseline : Object.freeze([...s.program])
    set({ ...resetSession(get()), programId: 'custom', program: checked, customProgram: checked, customBaseline: baseline, selectedInstruction: index })
  },
  selectInstruction: index => {
    if (!Number.isInteger(index) || index < 0 || index >= get().program.length) throw new Error('程序索引无效')
    set({ selectedInstruction: index })
  },
  createCustomProgram: (source = []) => {
    const program = validateProgram(source)
    set({ ...resetSession(get()), programId: 'custom', program, customProgram: program, customBaseline: program, selectedInstruction: program.length ? 0 : -1 })
  },
  restoreCustomProgram: () => {
    const s = get()
    if (s.programId !== 'custom') throw new Error('请先选择自定义程序')
    const program = validateProgram(s.customBaseline)
    set({ ...resetSession(s), program, customProgram: program, selectedInstruction: program.length ? 0 : -1 })
  },
  insertInstruction: (index, instruction = { op: 'ADDI', rd: 1, rs1: 0, imm: 0 }) => {
    const s = get(), program = insertWord(s.program, index, encode(instruction))
    const baseline = s.programId === 'custom' ? s.customBaseline : Object.freeze([...s.program])
    set({ ...resetSession(s), programId: 'custom', program, customProgram: program, customBaseline: baseline, selectedInstruction: index })
  },
  deleteInstruction: index => {
    const s = get(), program = removeWord(s.program, index)
    const baseline = s.programId === 'custom' ? s.customBaseline : Object.freeze([...s.program])
    set({ ...resetSession(s), programId: 'custom', program, customProgram: program, customBaseline: baseline, selectedInstruction: program.length ? Math.min(index, program.length - 1) : -1 })
  },
  moveInstruction: (from, to) => {
    const s = get(), program = moveWord(s.program, from, to)
    const baseline = s.programId === 'custom' ? s.customBaseline : Object.freeze([...s.program])
    set({ ...resetSession(s), programId: 'custom', program, customProgram: program, customBaseline: baseline, selectedInstruction: to })
  },
  importProgram: (words, append = false) => {
    const program = validateProgram(append ? [...get().program, ...words] : words)
    if (!words.length) throw new Error('导入程序不能为空')
    get().createCustomProgram(program)
  },
  setInitialMemory: memory => {
    const s = get()
    if (s.cpu.retired || s.playing || s.running) throw new Error('请先复位，再配置初始 RAM')
    if (memory.length !== 1024) throw new Error('初始 RAM 必须恰好为 1024 字节')
    const checked = createMemory(memory)
    set({ ...resetSession({ ...s, initialMemory: checked }), initialMemory: checked })
  },
  stepTransfer: () => {
    const s = get(), trace = s.history[s.traceIndex], steps = transferSteps(trace)
    if (!steps.length) return
    const time = presentationClock.read(s.playbackEpoch, s.inspection, timelineFor(trace, s.phase).duration)
    let index: number
    if (s.transferPlayback.mode === 'transfer') {
      if (s.playing || s.transferPlayback.complete) return
      const current = steps[s.transferPlayback.index]
      index = s.transferPlayback.index + (time >= current.end ? 1 : 0)
    } else index = steps.findIndex(t => PHASES.indexOf(t.phase) >= PHASES.indexOf(s.phase) && (t.phase !== s.phase || s.inspection || t.end > time))
    if (index < 0 || index >= steps.length) {
      set({ playing: false, running: false, transferPlayback: { mode: 'transfer', index: steps.length - 1, complete: true } }); return
    }
    const event = steps[index], epoch = s.playbackEpoch + 1
    const start = !s.inspection && event.phase === s.phase && time >= event.start && time < event.end ? time : event.start
    presentationClock.seek(epoch, start)
    set({ phase: event.phase, inspection: false, playbackEpoch: epoch, playing: true, running: false, transferPlayback: { mode: 'transfer', index, complete: false } })
  },
  setPlaybackRate: rate => { if (PLAYBACK_RATES.some(value => value === rate)) set({ playbackRate: rate }) },
  setInitialRegister: (index, value) => {
    if (get().cpu.retired !== 0 || get().running || get().playing) throw new Error('请先复位，再设置初始寄存器')
    if (!Number.isInteger(index) || index < 1 || index > 31) throw new Error('x0 恒为 0；仅可编辑 x1–x31')
    const registers = [...get().initialRegisters]
    registers[index] = value
    const cpu = initialState(registers, get().initialMemory)
    set({ ...resetSession({ ...get(), initialRegisters: cpu.registers }), initialRegisters: cpu.registers })
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
