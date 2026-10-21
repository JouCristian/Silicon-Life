import { describe, expect, it } from 'vitest'
import { initialState, run, step } from '../core/cpu'
import { decode, encode, type Instruction } from '../core/isa'
import { createMemory, readWord, writeWord } from '../core/memory'
import { PROGRAMS } from '../data/programs'
import { useLabStore } from '../stores/useLabStore'
import { WIRES } from '../scenes/topology'

describe('I/S/B encoding against independent machine words', () => {
  const vectors: [Instruction, number][] = [
    [{ op: 'LW', rd: 3, rs1: 1, imm: 0 }, 0x0000a183],
    [{ op: 'SW', rs2: 2, rs1: 1, imm: 0 }, 0x0020a023],
    [{ op: 'LW', rd: 3, rs1: 1, imm: -4 }, 0xffc0a183],
    [{ op: 'SW', rs2: 2, rs1: 1, imm: -4 }, 0xfe20ae23],
    [{ op: 'BEQ', rs1: 1, rs2: 2, imm: 8 }, 0x00208463],
    [{ op: 'BEQ', rs1: 1, rs2: 2, imm: -4 }, 0xfe208ee3],
    [{ op: 'BEQ', rs1: 1, rs2: 2, imm: -4096 }, 0x80208063],
    [{ op: 'BEQ', rs1: 1, rs2: 2, imm: 4094 }, 0x7e208fe3],
  ]
  it.each(vectors)('encodes and decodes %j', (instruction, word) => {
    expect(encode(instruction)).toBe(word)
    expect(decode(word)).toEqual(instruction)
  })
  it('covers every legal S and B immediate, including bit 11 reassembly', () => {
    for (let imm = -2048; imm <= 2047; imm++) {
      for (const op of ['LW', 'SW'] as const) {
        const instruction = op === 'LW' ? { op, rd: 3, rs1: 1, imm } : { op, rs1: 1, rs2: 2, imm }
        expect(decode(encode(instruction))).toEqual(instruction)
      }
    }
    for (let imm = -4096; imm <= 4094; imm += 2)
      expect(decode(encode({ op: 'BEQ', rs1: 1, rs2: 2, imm }))).toEqual({ op: 'BEQ', rs1: 1, rs2: 2, imm })
  })
  it('rejects illegal offsets and invalid memory funct3', () => {
    for (const imm of [-4098, 4096, -1, 3, NaN]) expect(() => encode({ op: 'BEQ', rs1: 1, rs2: 2, imm })).toThrow()
    for (const imm of [-2049, 2048, .5]) expect(() => encode({ op: 'SW', rs1: 1, rs2: 2, imm })).toThrow()
    for (const word of [0x00003083, 0x0020b023, 0x0020a063]) expect(() => decode(word)).toThrow()
  })
})

describe('immutable little-endian memory and atomic commit', () => {
  it('writes explicit byte lanes and reads a high-bit word without sign loss', () => {
    const before = createMemory()
    const full = writeWord(before, 64, 0x89abcdef)
    expect(full.slice(64, 68)).toEqual([0xef, 0xcd, 0xab, 0x89])
    expect(readWord(full, 64)).toBe(0x89abcdef)
    const lanes = writeWord(full, 64, 0x11223344, 0b0101)
    expect(lanes.slice(64, 68)).toEqual([0x44, 0xcd, 0x22, 0x89])
    expect(before[64]).toBe(0)
    expect(Object.isFrozen(full)).toBe(true)
    expect(() => writeWord(full, 1022, 1)).toThrow()
    expect(() => writeWord(full, 64, 1, 16)).toThrow()
  })
  it('executes negative address offsets, last valid word and wrapped address arithmetic', () => {
    const registers = Array(32).fill(0); registers[1] = 68; registers[2] = 0x89abcdef
    let result = run(initialState(registers), [0xfe20ae23, 0xffc0a183])
    expect(result.state.registers[3]).toBe(0x89abcdef)
    expect(result.state.memory.slice(64, 68)).toEqual([0xef, 0xcd, 0xab, 0x89])
    registers[1] = 1020
    result = run(initialState(registers), [0x0020a023, 0x0000a183])
    expect(readWord(result.state.memory, 1020)).toBe(0x89abcdef)
    registers[1] = 0xffffffff
    result = run(initialState(registers), [encode({ op: 'SW', rs1: 1, rs2: 2, imm: 1 })])
    expect(readWord(result.state.memory, 0)).toBe(0x89abcdef)
  })
  it.each(['LW', 'SW'] as const)('%s faults preserve PC, registers, memory and retirement', op => {
    for (const address of [1, 2, 3, 1023, 1024, 0xfffffffc]) {
      const registers = Array(32).fill(0); registers[1] = address; registers[2] = 42
      const before = initialState(registers)
      const instruction: Instruction = op === 'LW' ? { op, rd: 3, rs1: 1, imm: 0 } : { op, rs2: 2, rs1: 1, imm: 0 }
      const { state, trace } = step(before, [encode(instruction)])
      expect(state.status).toBe('fault')
      expect(state.pc).toBe(0); expect(state.retired).toBe(0)
      expect(state.registers).toBe(before.registers); expect(state.memory).toBe(before.memory)
      expect(trace).toBeUndefined()
      expect(state.fault?.source).toBe(address % 4 ? 'rtl' : 'host')
      if (address % 4) expect(state.fault?.cause).toBe(op === 'LW' ? 4 : 6)
    }
  })
  it('LW to x0 still performs memory validation, SW never writes rd bits', () => {
    const registers = Array(32).fill(0); registers[1] = 64; registers[2] = 42
    const result = run(initialState(registers), [0x0020a223, encode({ op: 'LW', rd: 0, rs1: 1, imm: 4 })])
    expect(result.state.registers[0]).toBe(0)
    expect(result.state.registers[4]).toBe(0) // SW imm[4:0] is not a destination register.
    expect(result.traces[0].signals).toMatchObject({ reg_write: 0, rf_we: 0, wb_sel: 1, dmem_we: 1, dmem_wstrb: 15 })
    registers[1] = 1
    expect(run(initialState(registers), [encode({ op: 'LW', rd: 0, rs1: 1, imm: 0 })]).state.status).toBe('fault')
  })
})

describe('BEQ PC selection and all three real programs', () => {
  it.each(PROGRAMS)('runs $name', preset => {
    const result = run(initialState(), preset.instructions.map(encode))
    expect(result.state.status).toBe('halted')
    expect(result.state.registers[3]).toBe(preset.id === 'arithmetic' ? 12 : 42)
    expect(result.state.pc).toBe(preset.instructions.length * 4)
    if (preset.id === 'memory') expect(readWord(result.state.memory, 64)).toBe(42)
    if (preset.id === 'branch') expect(result.traces.map(t => t.before.pc)).toEqual([0, 4, 8, 16])
    for (const trace of result.traces) for (const transfer of trace.transfers) {
      expect(WIRES.some(w => w.id === transfer.id)).toBe(true)
      expect(transfer.value).toBe(trace.signals[transfer.signal])
    }
  })
  it('not-taken branch uses PC+4, and does not fault on an unused misaligned target', () => {
    const registers = Array(32).fill(0); registers[1] = 1
    const result = run(initialState(registers), [encode({ op: 'BEQ', rs1: 1, rs2: 0, imm: 2 })])
    expect(result.state.pc).toBe(4)
    expect(result.traces[0].signals).toMatchObject({ branch_taken: 0, redirect: 0, next_pc: 4, target: 2 })
    const program = PROGRAMS[2].instructions.map(encode)
    program[1] = encode({ op: 'ADDI', rd: 2, rs1: 0, imm: 6 })
    expect(run(initialState(), program).traces.map(t => t.before.pc)).toEqual([0, 4, 8, 12, 16])
  })
  it('taken misaligned branch traps before any commit', () => {
    const before = initialState()
    const result = step(before, [encode({ op: 'BEQ', rs1: 0, rs2: 0, imm: 2 })])
    expect(result.state).toMatchObject({ pc: 0, retired: 0, status: 'fault', fault: { source: 'rtl', cause: 0 } })
    expect(result.state.memory).toBe(before.memory)
  })
  it('takes a backward branch and stops an actual loop at the budget', () => {
    const result = run(initialState(), [0x00000093, encode({ op: 'BEQ', rs1: 1, rs2: 0, imm: -4 })], 10)
    expect(result.traces[1].signals).toMatchObject({ target: 0, redirect: 1, next_pc: 0 })
    expect(result.state.retired).toBe(10)
    expect(result.state.reason).toContain('最大执行步数')
  })
  it('reset, pause and replay do not repeat a store or alter frozen history', () => {
    const store = () => useLabStore.getState()
    store().loadProgram('memory'); store().run()
    for (let i = 0; i < 30; i++) store().tick()
    const after = store().cpu, memory = after.memory
    store().replay(2); store().tick(); store().pause(); store().observe('memory')
    expect(store().cpu).toBe(after); expect(store().cpu.memory).toBe(memory)
    store().resumePlayback(); store().tick(); store().tick()
    expect(store().cpu).toBe(after); expect(store().cpu.memory).toBe(memory)
    expect(store().history[2].before.memory[64]).toBe(0)
    expect(store().history[2].after.memory[64]).toBe(42)
    store().reset(); expect(readWord(store().cpu.memory, 64)).toBe(0)
    store().loadProgram('arithmetic')
  })
})
