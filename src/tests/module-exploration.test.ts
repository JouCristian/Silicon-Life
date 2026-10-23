import { beforeEach, describe, expect, it } from 'vitest'
import { initialState, step } from '../core/cpu'
import { ALU_LABELS } from '../core/cpu'
import { encode, hex, type Instruction } from '../core/isa'
import { EXPLORERS, isExplorable } from '../scenes/exploration/model'
import { explorationDistance, INTERIOR_HEIGHT, INTERIOR_WIDTH } from '../scenes/exploration/camera'
import { MODULES } from '../scenes/topology'
import { useExplorationStore } from '../stores/useExplorationStore'
import { useLabStore } from '../stores/useLabStore'
import { usePeripheralStore } from '../stores/usePeripheralStore'

beforeEach(() => {
  useLabStore.setState(useLabStore.getInitialState(), true)
  usePeripheralStore.setState({ installed: [], focused: null })
  useExplorationStore.setState({ selected: null })
})

describe('RTL-backed explorer read models', () => {
  it('registers all eleven explorers against the existing topology', () => {
    expect(MODULES).toHaveLength(11)
    expect(MODULES.filter(m => isExplorable(m.id)).map(m => m.id).sort()).toEqual(MODULES.map(m => m.id).sort())
    expect(Object.keys(EXPLORERS)).toHaveLength(11)
    const cpu = initialState()
    for (const definition of Object.values(EXPLORERS)) {
      const model = definition.build(cpu)
      expect(model.nodes.some(node => node.value.includes('等待'))).toBe(true)
      for (const wire of model.wires) for (const id of [wire.from, wire.to]) expect(model.nodes.some(node => node.id === id)).toBe(true)
    }
    expect(EXPLORERS.regfile.build(cpu).nodes.filter(n => /^x\d+$/.test(n.id))).toHaveLength(32)
  })
  it.each(ALU_LABELS)('shows %s case and exact signal values without another ALU implementation', op => {
    const regs = Array(32).fill(0); regs[1] = 0x80000000; regs[2] = 31
    const { state, trace } = step(initialState(regs), [encode({ op, rd: 3, rs1: 1, rs2: 2 } as Instruction)])
    const model = EXPLORERS.alu.build(state, trace)
    expect(model.nodes.find(n => n.id === 'a')?.value).toBe(hex(trace!.signals.alu_a))
    expect(model.nodes.find(n => n.id === 'b')?.value).toBe(hex(trace!.signals.alu_b))
    expect(model.nodes.find(n => n.id === 'result')?.value).toBe(hex(trace!.signals.alu_result))
    expect(model.nodes.filter(n => n.id.startsWith('case-') && n.active).map(n => n.title)).toEqual([op])
    expect(model.wires.find(w => w.to === 'result')?.from).toBe(`case-${trace!.signals.alu_op}`)
  })
  it('shows instruction-before register cells, both raw asynchronous reads, and only real committed writes', () => {
    const regs = Array(32).fill(0); regs[1] = 5; regs[2] = 7
    const before = initialState(regs), { state, trace } = step(before, [0x002081b3])
    const model = EXPLORERS.regfile.build(state, trace)
    expect(model.nodes.find(n => n.id === 'x3')?.value).toBe('0x00000000')
    expect(model.nodes.find(n => n.id === 'read-a')?.value).toContain('x1 → 0x00000005')
    expect(model.nodes.find(n => n.id === 'read-b')?.value).toContain('x2 → 0x00000007')
    expect(model.nodes.find(n => n.id === 'write')?.value).toContain('x3 ← 0x0000000c · 已提交')
    expect(model.wires.filter(w => w.from === 'write').map(w => w.to)).toEqual(['x3'])
    expect(state.registers[3]).toBe(12)
    const discarded = step(before, [encode({ op: 'ADD', rd: 0, rs1: 1, rs2: 2 })])
    expect(EXPLORERS.regfile.build(discarded.state, discarded.trace).wires.some(w => w.from === 'write')).toBe(false)
    expect(EXPLORERS.regfile.build(discarded.state, discarded.trace).nodes.find(n => n.id === 'write')?.value).toContain('x0 丢弃')
  })
  it.each([
    { op: 'ADDI', rd: 1, rs1: 0, imm: 5 },
    { op: 'BEQ', rs1: 0, rs2: 0, imm: 8 },
    { op: 'JAL', rd: 1, imm: 12 },
    { op: 'JALR', rd: 1, rs1: 0, imm: 12 },
    { op: 'EBREAK' },
  ] as Instruction[])('shows actual next_pc for sequential/redirect/trap: %j', instruction => {
    const { state, trace } = step(initialState(), [encode(instruction)])
    const model = EXPLORERS.pc.build(state, trace)
    expect(model.nodes.find(n => n.id === 'q')?.value).toBe(hex(trace!.before.pc))
    expect(model.nodes.find(n => n.id === 'd')?.value).toBe(hex(trace!.signals.next_pc))
    expect(model.nodes.find(n => n.id === 'edge')?.value).toBe(hex(state.pc))
    expect(model.note).toContain('cpu_top')
    if (trace?.trap) expect(model.wires.find(w => w.from === 'd')?.active).toBe(false)
  })
  it.each([[600, 360, 900, 1], [380, 260, 700, .7], [1200, 500, 1080, 1.2]])('fits interior in the clipped viewport %j', (width, height, canvasHeight, scale) => {
    const distance = explorationDistance(scale, width, height, canvasHeight)
    const frustumHeight = 2 * distance * Math.tan(40 * Math.PI / 360)
    expect(frustumHeight * height / canvasHeight + 1e-10).toBeGreaterThanOrEqual(INTERIOR_HEIGHT * scale)
    expect(frustumHeight * width / canvasHeight + 1e-10).toBeGreaterThanOrEqual(INTERIOR_WIDTH * scale)
  })
})

describe('scene focus and execution isolation', () => {
  it('pauses on entry without committing or changing CPU/history; exit and reentry remain presentation only', () => {
    useLabStore.getState().enter(); useLabStore.getState().step(); useLabStore.getState().runFast()
    const before = useLabStore.getState()
    useExplorationStore.getState().enter('alu')
    expect(useExplorationStore.getState().selected).toBe('alu')
    expect(useLabStore.getState().cpu).toBe(before.cpu)
    expect(useLabStore.getState().history).toBe(before.history)
    expect(useLabStore.getState()).toMatchObject({ playing: false, running: false, fastRunning: false })
    useExplorationStore.getState().exit(); useExplorationStore.getState().enter('pc'); useExplorationStore.getState().exit()
    expect(useLabStore.getState().cpu).toBe(before.cpu)
  })
  it('excludes peripheral/module camera focus in either direction without removing the device', () => {
    useLabStore.getState().enter(); usePeripheralStore.getState().install('display'); usePeripheralStore.getState().focus('display')
    useExplorationStore.getState().enter('regfile')
    expect(usePeripheralStore.getState().focused).toBeNull()
    expect(usePeripheralStore.getState().installed).toEqual(['display'])
    usePeripheralStore.getState().focus('display')
    expect(useExplorationStore.getState().selected).toBeNull()
    expect(usePeripheralStore.getState().focused).toBe('display')
    useExplorationStore.getState().enter('pc'); usePeripheralStore.getState().remove('display')
    expect(useExplorationStore.getState().selected).toBe('pc')
  })
  it('exits on home/project switch and cannot explore from home', () => {
    useExplorationStore.getState().enter('alu'); expect(useExplorationStore.getState().selected).toBeNull()
    useLabStore.getState().enter(); useExplorationStore.getState().enter('imem'); expect(useExplorationStore.getState().selected).toBe('imem')
    useExplorationStore.getState().enter('pc'); useLabStore.getState().home(); expect(useExplorationStore.getState().selected).toBeNull()
    useLabStore.getState().enter(); useExplorationStore.getState().enter('alu'); useLabStore.getState().loadProgram('memory')
    expect(useExplorationStore.getState().selected).toBeNull()
  })
})
