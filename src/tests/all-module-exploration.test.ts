import { beforeEach, describe, expect, it } from 'vitest'
import { initialState, step } from '../core/cpu'
import { encode, hex, INSTRUCTION_OPS, defaultInstruction, type Instruction } from '../core/isa'
import { readWord, writeWord } from '../core/memory'
import { EXPLORERS } from '../scenes/exploration/model'
import { MODULES } from '../scenes/topology'
import { useLabStore } from '../stores/useLabStore'
import { useExplorationStore } from '../stores/useExplorationStore'
import { usePeripheralStore } from '../stores/usePeripheralStore'

const regs = (a = 0, b = 0) => { const values = Array(32).fill(0); values[1] = a; values[2] = b; return values }
const execute = (instruction: Instruction, a = 0, b = 0) => step(initialState(regs(a, b)), [encode(instruction)])
type Model = ReturnType<typeof EXPLORERS.pc.build>
const node = (model: Model, id: string) => model.nodes.find(n => n.id === id)!

describe('eight additional read-only module views', () => {
  it('maps ROM byte addresses to word indices and shows the exact fetched word without a second fetch', () => {
    const program = new Uint32Array(8).fill(0x00500093), before = { ...initialState(), pc: 16 }
    const { state, trace } = step(before, program), model = EXPLORERS.imem.build(state, trace)
    expect(node(model, 'address').value).toBe('0x00000010')
    expect(node(model, 'index').value).toBe('4')
    expect(node(model, 'rom').value).toBe('[4] = 0x00500093')
    expect(node(model, 'word').value).toBe(hex(trace!.signals.imem_rdata))
    expect(EXPLORERS.imem.source).toContain('宿主 ROM')
    expect(node(EXPLORERS.imem.build({ ...initialState(), pc: 3 }), 'index').value).toContain('未对齐')
  })
  it.each(INSTRUCTION_OPS)('has valid diagram topology and exact decoder ports for %s', op => {
    const result = execute(defaultInstruction(op)), trace = result.trace
    expect(trace).toBeDefined()
    const before = result.state, s = trace!.signals
    for (const module of MODULES) {
      const model = EXPLORERS[module.id].build(result.state, trace)
      expect(new Set(model.nodes.map(n => n.id)).size).toBe(model.nodes.length)
      for (const wire of model.wires) for (const id of [wire.from, wire.to]) expect(model.nodes.some(n => n.id === id)).toBe(true)
      for (const n of model.nodes) {
        expect(n.position.every(Number.isFinite)).toBe(true)
        expect(Math.abs(n.position[0]) + (n.width ?? 1.7) / 2).toBeLessThanOrEqual(4.4)
        expect(n.value).not.toContain('undefined')
      }
    }
    const model = EXPLORERS.decoder.build(result.state, trace)
    expect(node(model, 'word').value).toBe(hex(trace!.word))
    expect(node(model, 'opcode').value).toBe((trace!.word & 127).toString(2).padStart(7, '0'))
    expect(node(model, 'funct3').value).toBe((trace!.word >>> 12 & 7).toString(2).padStart(3, '0'))
    expect(node(model, 'funct7').value).toBe((trace!.word >>> 25).toString(2).padStart(7, '0'))
    expect(node(model, 'alu').value).toBe(`${s.alu_op} / ${s.alu_a_sel} / ${s.alu_b_imm}`)
    expect(node(model, 'selects').value).toBe(`${s.imm_sel} / ${s.wb_sel}`)
    expect(node(model, 'memory').value).toBe(`${s.mem_read} / ${s.mem_write} / ${s.mem_size} / ${s.load_unsigned}`)
    expect(node(model, 'system').value).toBe(`${s.reg_write} / ${s.illegal} / ${s.system_trap} / ${s.system_cause}`)
    expect(result.state).toBe(before)
  })
  it.each([
    [{ op: 'ADDI', rd: 3, rs1: 0, imm: -2048 }, 0, 0xfffff800],
    [{ op: 'SW', rs1: 1, rs2: 2, imm: -4 }, 1, 0xfffffffc],
    [{ op: 'BEQ', rs1: 0, rs2: 0, imm: -4 }, 2, 0xfffffffc],
    [{ op: 'LUI', rd: 3, imm: 0xfffff }, 3, 0xfffff000],
    [{ op: 'JAL', rd: 3, imm: -4 }, 4, 0xfffffffc],
  ] as [Instruction, number, number][])('observes %j immediate selection and sign/zero layout', (instruction, selector, expected) => {
    const result = execute(instruction, 64), model = EXPLORERS.imm.build(result.state, result.trace)
    expect(result.trace).toBeDefined()
    expect(node(model, 'imm').value).toBe(hex(expected))
    expect(model.nodes.filter(n => n.id.startsWith('format-') && n.active).map(n => n.id)).toEqual([`format-${selector}`])
    expect(model.wires.find(w => w.to === 'imm')?.from).toBe(`format-${selector}`)
  })
  it('shows raw default immediate on R type and selects the real ALU B source', () => {
    for (const instruction of [{ op: 'ADD', rd: 3, rs1: 1, rs2: 2 }, { op: 'ADDI', rd: 3, rs1: 1, imm: -1 }] as Instruction[]) {
      const { state, trace } = execute(instruction, 5, 7), model = EXPLORERS.mux.build(state, trace)
      expect(node(EXPLORERS.imm.build(state, trace), 'imm').value).toBe(hex(trace!.signals.imm))
      expect(node(model, 'output').value).toBe(hex(trace!.signals.alu_b))
      expect(model.wires.filter(w => w.to === 'mux' && w.from !== 'control' && w.active).map(w => w.from)).toEqual([trace!.signals.alu_b_imm ? 'imm' : 'rs2'])
    }
  })
  it.each([
    ['BEQ', 7, 7, true], ['BNE', 7, 7, false], ['BLT', 0x80000000, 0, true],
    ['BGE', 0x80000000, 0, false], ['BLTU', 0x80000000, 0, false], ['BGEU', 0x80000000, 0, true],
  ] as const)('observes %s signedness and branch result', (op, a, b, expected) => {
    const { state, trace } = execute({ op, rs1: 1, rs2: 2, imm: 8 }, a, b), model = EXPLORERS.branch.build(state, trace)
    expect(node(model, 'taken').value).toBe(expected ? '1' : '0')
    expect(node(model, 'redirect').value).toBe(String(trace!.signals.redirect))
    expect(model.nodes.filter(n => n.id.startsWith('compare-') && n.active).map(n => n.title)).toEqual([op])
  })
  it('keeps non-branch raw taken separate from architectural redirect', () => {
    const { state, trace } = execute({ op: 'ADDI', rd: 3, rs1: 0, imm: 0 }), model = EXPLORERS.branch.build(state, trace)
    expect(node(model, 'taken').value).toBe('1')
    expect(node(model, 'redirect').value).toBe('0')
    expect(model.wires.find(w => w.from === 'taken' && w.to === 'redirect')?.active).toBe(false)
    const memory = EXPLORERS.dmem.build(state, trace)
    expect(node(memory, 'actual').value).toContain('未进行架构访存')
    expect(memory.wires.every(w => !w.active)).toBe(true)
  })
  it('displays actual little-endian RAM before/after a byte write and signed halfword load', () => {
    const initial = initialState(regs(65, 0x80), writeWord(initialState().memory, 64, 0x11223344))
    const stored = step(initial, [encode({ op: 'SB', rs1: 1, rs2: 2, imm: 0 })]), model = EXPLORERS.dmem.build(stored.state, stored.trace)
    expect(node(model, 'ram').value).toBe('0x11223344')
    expect(node(model, 'after').value).toBe('0x11228044')
    expect(node(model, 'write').value).toBe('0x00008000')
    expect(node(model, 'strobes').value).toBe('0010')
    expect(readWord(initial.memory, 64)).toBe(0x11223344)
    const loaded = step({ ...stored.state, pc: 0, status: 'ready', registers: regs(64) }, [encode({ op: 'LH', rd: 3, rs1: 1, imm: 0 })])
    expect(node(EXPLORERS.dmem.build(loaded.state, loaded.trace), 'load').value).toBe('0xffff8044')
  })
  it('routes MMIO exclusively to the device, never to RAM or a fabricated readback', () => {
    const { state, trace } = execute({ op: 'SW', rs1: 1, rs2: 2, imm: 0 }, 0x20000004, 0xff112233)
    const model = EXPLORERS.dmem.build(state, trace)
    expect(node(model, 'mmio').value).toBe('(1,0) #112233')
    expect(node(model, 'ram').value).toContain('未访问')
    expect(model.wires.filter(w => w.to === 'ram').every(w => !w.active)).toBe(true)
    expect(model.wires.find(w => w.from === 'write' && w.to === 'mmio')?.active).toBe(true)
    expect(node(model, 'read').active).toBe(false)
    expect(state.memory).toBe(trace!.before.memory)
  })
  it.each([
    [{ op: 'ADD', rd: 3, rs1: 1, rs2: 2 }, 'alu'],
    [{ op: 'LW', rd: 3, rs1: 0, imm: 0 }, 'memory'],
    [{ op: 'JAL', rd: 3, imm: 8 }, 'pc4'],
    [{ op: 'JALR', rd: 3, rs1: 0, imm: 8 }, 'pc4'],
    [{ op: 'SW', rs1: 0, rs2: 2, imm: 0 }, 'memory'],
    [{ op: 'ADD', rd: 0, rs1: 1, rs2: 2 }, 'alu'],
    [{ op: 'EBREAK' }, 'alu'],
  ] as [Instruction, string][])('observes WB selected path and actual commit for %j', (instruction, source) => {
    const { state, trace } = execute(instruction, 5, 7), model = EXPLORERS.wb.build(state, trace)
    expect(node(model, 'data').value).toBe(hex(trace!.signals.wb_data))
    expect(model.wires.filter(w => w.to === 'select' && w.active).map(w => w.from)).toEqual([source])
    expect(node(model, 'write').active).toBe(trace!.write.committed)
    expect(model.wires.find(w => w.to === 'commit')?.active).toBe(trace!.write.committed)
  })
  it.each([
    { op: 'ADDI', rd: 3, rs1: 0, imm: 1 }, { op: 'BEQ', rs1: 0, rs2: 0, imm: 8 },
    { op: 'BNE', rs1: 0, rs2: 0, imm: 8 }, { op: 'JAL', rd: 1, imm: 8 },
    { op: 'JALR', rd: 1, rs1: 1, imm: 1 }, { op: 'ECALL' },
  ] as Instruction[])('observes PC candidates and actual Trap gate for %j', instruction => {
    const { state, trace } = execute(instruction, 8), model = EXPLORERS.nextpc.build(state, trace)
    expect(node(model, 'normal').value).toBe(hex(trace!.signals.normal_next_pc))
    expect(node(model, 'next').value).toBe(hex(state.pc))
    if (trace!.signals.jalr) {
      expect(node(model, 'jalr').value).toBe('0x00000008')
      expect(node(model, 'relative').value).toContain('未单独采样')
    }
    if (trace!.trap) {
      expect(node(model, 'normal').value).toBe('0x00000004')
      expect(node(model, 'next').value).toBe('0x00000000')
      expect(model.wires.find(w => w.from === 'normal' && w.to === 'next')?.active).toBe(false)
    }
  })
})

beforeEach(() => {
  useLabStore.setState(useLabStore.getInitialState(), true)
  usePeripheralStore.setState({ installed: [], focused: null })
  useExplorationStore.setState({ selected: null })
})
it('can enter all eleven modules and return without CPU/RAM/MMIO/history changes', () => {
  useLabStore.getState().enter(); useLabStore.getState().step()
  const before = useLabStore.getState()
  for (const module of MODULES) {
    useExplorationStore.getState().enter(module.id)
    expect(useExplorationStore.getState().selected).toBe(module.id)
    useExplorationStore.getState().exit()
    expect(useLabStore.getState().cpu).toBe(before.cpu)
    expect(useLabStore.getState().history).toBe(before.history)
  }
})
