import { create } from 'zustand'
import { initialState, step as execute } from '../core/cpu'
import { encode, type Instruction } from '../core/isa'
import { PHASES, type CpuState, type ExecutionTrace, type Phase } from '../core/trace/types'
import { DEMO_WORDS, PROGRAMS } from '../data/programs'
import { presentationClock, timelineFor } from '../motion/timeline'
import { AUTO_PLAYBACK, PLAYBACK_RATES, transferSteps, type TransferPlayback } from '../motion/transferPlayback'
import { createMemory, type DataMemory } from '../core/memory'
import { type ProgramWords } from '../core/rom'
import { MAX_PROJECTS, newProject, projectName, RAM_SIZES, type Project } from '../projects/model'
import { insertWord, moveWord, removeWord, validateProgram } from '../io/program'

interface LabStore {
  projects: readonly Project[]
  activeProjectId: string
  saveStatus: 'loading' | 'saving' | 'saved' | 'error' | 'idle'
  saveError: string
  storageReady: boolean
  projectNotice: string
  createProject: (name?: string, copy?: boolean) => void
  renameProject: (name: string) => void
  deleteProject: () => void
  importProject: (project: Project) => void
  resizeMemory: (size: number) => void
  fastRunning: boolean
  executionLimit: number
  budgetUsed: number
  executionNotice: string
  runFast: () => void
  fastBatch: () => void
  setExecutionLimit: (limit: number) => void


  cpu: CpuState
  program: ProgramWords
  programId: string
  customProgram: ProgramWords
  customBaseline: ProgramWords
  selectedInstruction: number
  initialMemory: DataMemory
  initialRegisters: readonly number[]
  selectInstruction: (index: number) => void
  createCustomProgram: (source?: ArrayLike<number>) => void
  restoreCustomProgram: () => void
  insertInstruction: (index: number, instruction?: Instruction) => void
  deleteInstruction: (index: number) => void
  moveInstruction: (from: number, to: number) => void
  importProgram: (words: ArrayLike<number>, append?: boolean, strict?: boolean) => void
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
    fastRunning: false, budgetUsed: 0, executionNotice: '', phase: 'fetch' as const, inspection: false, transferPlayback: AUTO_PLAYBACK,
    playbackEpoch: s.playbackEpoch + 1, playing: false, running: false, runSteps: 0 }
}

export const HISTORY_LIMIT = 128
export const EXECUTION_LIMITS = [1000, 10000, 100000, 1000000] as const
function editable(s: LabStore) {
  if (!s.storageReady) throw new Error('正在恢复本地项目，请稍候')
}
function projectPatch(s: LabStore, program: ProgramWords, memory = s.initialMemory, registers = s.initialRegisters) {
  editable(s)
  const current = s.projects.find(p => p.id === s.activeProjectId)
  if (!current && s.projects.length >= MAX_PROJECTS) throw new Error('最多保存 10 个项目，请先导出或删除一个项目')
  const base = current ?? newProject(`${PROGRAMS.find(p => p.id === s.programId)?.name ?? '我的项目'} 副本`, program, memory, registers)
  const updated: Project = Object.freeze({ ...base, instructionROM: validateProgram(program, false), initialRAM: memory,
    initialRegisters: registers, ramSize: memory.length, updatedAt: Math.max(Date.now(), base.updatedAt + 1) })
  return { programId: 'custom', activeProjectId: updated.id, program: updated.instructionROM, customProgram: updated.instructionROM, projectNotice: '',
    initialMemory: memory, initialRegisters: registers, projects: current ? s.projects.map(p => p.id === current.id ? updated : p) : [...s.projects, updated] }
}

export const useLabStore = create<LabStore>((set, get) => ({
  projects: [], activeProjectId: 'arithmetic', saveStatus: 'idle', saveError: '', storageReady: true, projectNotice: '',
  fastRunning: false, executionLimit: 100000, budgetUsed: 0, executionNotice: '',
  cpu: initialState(), program: validateProgram(DEMO_WORDS), programId: 'arithmetic', history: [], traceIndex: -1,
  customProgram: Object.freeze([]), customBaseline: Object.freeze([]), selectedInstruction: 0,
  initialMemory: createMemory(), initialRegisters: Object.freeze(Array(32).fill(0)),
  phase: 'fetch', playbackEpoch: 0, inspection: false, playing: false, running: false, runSteps: 0,
  mode: 'demo', scene: 'chip', viewVersion: 0,
  playbackRate: .5, transferPlayback: AUTO_PLAYBACK,
  step: () => {
    const s = get()
    if (s.playing || s.fastRunning || s.cpu.status !== 'ready') return
    if (s.running && s.budgetUsed >= s.executionLimit) {
      set({ running: false, executionNotice: `已达到本次执行预算 ${s.executionLimit} 步，可继续或复位` }); return
    }
    const result = execute(s.cpu, s.program)
    set({ cpu: result.state, ...(result.trace ? { history: [...s.history, result.trace].slice(-HISTORY_LIMIT), traceIndex: Math.min(s.history.length, HISTORY_LIMIT - 1),
      phase: 'fetch', playing: true, inspection: false, transferPlayback: AUTO_PLAYBACK, playbackEpoch: s.playbackEpoch + 1, runSteps: s.runSteps + 1, budgetUsed: s.budgetUsed + 1 } : { running: false }) })
  },
  run: () => {
    set({ fastRunning: false, budgetUsed: 0, executionNotice: '' })
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
  pause: () => set({ running: false, playing: false, fastRunning: false }),
  reset: () => set(s => resetSession(s)),
  loadProgram: id => {
    const s = get(); editable(s)
    const project = id === 'custom' ? s.projects.find(p => p.id === s.activeProjectId) ?? s.projects.at(-1) : s.projects.find(p => p.id === id)
    const preset = PROGRAMS.find(p => p.id === id)
    if (!project && !preset) throw new Error('未知项目')
    const program = project?.instructionROM ?? validateProgram(preset!.instructions.map(encode))
    const initialMemory = project?.initialRAM ?? createMemory(), initialRegisters = project?.initialRegisters ?? Object.freeze(Array(32).fill(0))
    set({ ...resetSession({ ...s, initialMemory, initialRegisters }), initialMemory, initialRegisters,
      programId: project ? 'custom' : id, activeProjectId: project?.id ?? id, program, selectedInstruction: program.length ? 0 : -1, projectNotice: '',
      ...(project ? { customProgram: program, customBaseline: id === 'custom' ? s.customBaseline : program } : {}) })
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
  observe: phase => set(s => ({ fastRunning: false, phase, playing: false, running: false, inspection: true, transferPlayback: AUTO_PLAYBACK, playbackEpoch: s.playbackEpoch + 1 })),
  replay: index => {
    if (get().history[index]) set(s => ({ fastRunning: false, traceIndex: index, phase: 'fetch', playing: true, running: false, inspection: false, transferPlayback: AUTO_PLAYBACK, playbackEpoch: s.playbackEpoch + 1 }))
  },
  resumePlayback: () => {
    set({ fastRunning: false }); const s = get()
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
    const checked = validateProgram(program, false), s = get()
    const baseline = s.programId === 'custom' ? s.customBaseline : Object.freeze([...s.program])
    set({ ...resetSession(s), ...projectPatch(s, checked), customBaseline: baseline, selectedInstruction: index })
  },
  selectInstruction: index => {
    if (!Number.isInteger(index) || index < 0 || index >= get().program.length) throw new Error('程序索引无效')
    set({ selectedInstruction: index })
  },
  createCustomProgram: (source = []) => {
    const s = get(); editable(s)
    if (s.projects.length >= MAX_PROJECTS) throw new Error('最多保存 10 个项目')
    const project = newProject(`我的项目 ${s.projects.length + 1}`, source, s.initialMemory, s.initialRegisters)
    set({ projects: [...s.projects, project] }); get().loadProgram(project.id)
  },
  restoreCustomProgram: () => {
    const s = get()
    if (s.programId !== 'custom') throw new Error('请先选择自定义程序')
    const program = validateProgram(s.customBaseline, false)
    set({ ...resetSession(s), ...projectPatch(s, program), selectedInstruction: program.length ? 0 : -1 })
  },
  insertInstruction: (index, instruction = { op: 'ADDI', rd: 1, rs1: 0, imm: 0 }) => {
    const s = get(), program = insertWord(s.program, index, encode(instruction))
    const baseline = s.programId === 'custom' ? s.customBaseline : Object.freeze([...s.program])
    set({ ...resetSession(s), ...projectPatch(s, program), customBaseline: baseline, selectedInstruction: index })
  },
  deleteInstruction: index => {
    const s = get(), program = removeWord(s.program, index)
    const baseline = s.programId === 'custom' ? s.customBaseline : Object.freeze([...s.program])
    set({ ...resetSession(s), ...projectPatch(s, program), customBaseline: baseline, selectedInstruction: program.length ? Math.min(index, program.length - 1) : -1 })
  },
  moveInstruction: (from, to) => {
    const s = get(), program = moveWord(s.program, from, to)
    const baseline = s.programId === 'custom' ? s.customBaseline : Object.freeze([...s.program])
    set({ ...resetSession(s), ...projectPatch(s, program), customBaseline: baseline, selectedInstruction: to })
  },
  importProgram: (words, append = false, strict = false) => {
    const s = get()
    if (!words.length) throw new Error('导入程序不能为空')
    const program = validateProgram(append ? [...s.program, ...Array.from(words)] : words, strict)
    set({ ...resetSession(s), ...projectPatch(s, program), customBaseline: program, selectedInstruction: 0, projectNotice: `HEX 加载成功：${words.length.toLocaleString()} 个 32 位字已完整载入；加载成功不代表可以完整运行，当前 CPU 仅支持 ADDI、ADD、LW、SW、BEQ。` })
  },
  setInitialMemory: memory => {
    const s = get()
    if (s.cpu.retired || s.playing || s.running || s.fastRunning) throw new Error('请先复位，再配置初始 RAM')
    if (!RAM_SIZES.some(size => size === memory.length)) throw new Error('初始 RAM 容量必须为 1 KiB / 64 KiB / 256 KiB')
    const checked = createMemory(memory)
    set({ ...resetSession({ ...s, initialMemory: checked }), ...projectPatch(s, s.program, checked) })
  },
  createProject: (name, copy = false) => {
    const s = get(); editable(s)
    if (s.projects.length >= MAX_PROJECTS) throw new Error('最多保存 10 个项目')
    const project = copy ? newProject(name ?? `${s.projects.find(p => p.id === s.activeProjectId)?.name ?? PROGRAMS.find(p => p.id === s.programId)?.name} 副本`, s.program, s.initialMemory, s.initialRegisters)
      : newProject(name ?? `我的项目 ${s.projects.length + 1}`)
    set({ projects: [...s.projects, project] }); get().loadProgram(project.id)
  },
  renameProject: name => {
    const s = get(); editable(s)
    const current = s.projects.find(p => p.id === s.activeProjectId)
    if (!current) throw new Error('内置示例只读，请复制为我的项目')
    const checked = projectName(name)
    set({ projects: s.projects.map(p => p === current ? Object.freeze({ ...p, name: checked, updatedAt: Math.max(Date.now(), p.updatedAt + 1) }) : p) })
  },
  deleteProject: () => {
    const s = get(); editable(s)
    if (!s.projects.some(p => p.id === s.activeProjectId)) throw new Error('内置示例不能删除')
    set({ projects: s.projects.filter(p => p.id !== s.activeProjectId) }); get().loadProgram('arithmetic')
  },
  importProject: project => {
    const s = get(); editable(s)
    if (s.projects.length >= MAX_PROJECTS) throw new Error('最多保存 10 个项目')
    // Import always creates a fresh identity; never overwrite a saved project.
    const copy = newProject(project.name, project.instructionROM, project.initialRAM, project.initialRegisters)
    set({ projects: [...s.projects, copy] }); get().loadProgram(copy.id)
  },
  resizeMemory: size => {
    if (!RAM_SIZES.some(n => n === size)) throw new Error('不支持的 RAM 容量')
    const bytes = new Uint8Array(size), memory = get().initialMemory
    bytes.set(memory.slice(0, Math.min(size, memory.length)))
    get().setInitialMemory(createMemory(bytes))
  },
  runFast: () => {
    if (get().cpu.status !== 'ready') return
    set({ fastRunning: true, playing: false, running: false, budgetUsed: 0, executionNotice: '', inspection: true })
  },
  fastBatch: () => {
    const s = get()
    if (!s.fastRunning) return
    let cpu = s.cpu, used = s.budgetUsed
    const history = [...s.history], start = performance.now()
    for (let n = 0; n < 512 && cpu.status === 'ready' && used < s.executionLimit && performance.now() - start < 8; n++) {
      const result = execute(cpu, s.program); cpu = result.state
      if (result.trace) { used++; history.push(result.trace); if (history.length > HISTORY_LIMIT) history.shift() }
    }
    const exhausted = cpu.status === 'ready' && used >= s.executionLimit
    set({ cpu, history, traceIndex: history.length - 1, phase: 'writeback', playing: false, running: false,
      fastRunning: cpu.status === 'ready' && !exhausted, budgetUsed: used, runSteps: cpu.retired, inspection: true,
      playbackEpoch: s.playbackEpoch + 1, transferPlayback: AUTO_PLAYBACK,
      executionNotice: exhausted ? `已达到本次执行预算 ${s.executionLimit} 步，可继续或复位` : '' })
  },
  setExecutionLimit: limit => { if (EXECUTION_LIMITS.some(n => n === limit)) set({ executionLimit: limit }) },
  stepTransfer: () => {
    set({ fastRunning: false }); const s = get(), trace = s.history[s.traceIndex], steps = transferSteps(trace)
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
    if (get().cpu.retired !== 0 || get().running || get().playing || get().fastRunning) throw new Error('请先复位，再设置初始寄存器')
    if (!Number.isInteger(index) || index < 1 || index > 31) throw new Error('x0 恒为 0；仅可编辑 x1–x31')
    const registers = [...get().initialRegisters]
    registers[index] = value
    const cpu = initialState(registers, get().initialMemory)
    set({ ...resetSession({ ...get(), initialRegisters: cpu.registers }), ...projectPatch(get(), get().program, get().initialMemory, cpu.registers) })
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
