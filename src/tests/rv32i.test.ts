import { beforeEach, describe, expect, it } from 'vitest'
import { initialState, run, step } from '../core/cpu'
import { readFileSync } from 'node:fs'
import { parseHex } from '../io/hex'
import { assembly, BRANCH_OPS, decode, defaultInstruction, encode, IMMEDIATE_OPS, INSTRUCTION_OPS, REGISTER_OPS, type Instruction } from '../core/isa'
import { createMemory, readWord } from '../core/memory'
import { PHASES } from '../core/trace/types'
import { programListing } from '../io/program'
import { useLabStore } from '../stores/useLabStore'
import { timelineFor } from '../motion/timeline'
import { WIRES } from '../scenes/topology'
import { RV32I_PROGRAMS } from './fixtures/rv32iPrograms'

beforeEach(() => useLabStore.setState(useLabStore.getInitialState(), true))

const registers = (a = 0, b = 0) => { const r = Array(32).fill(0); r[1] = a; r[2] = b; return r }
const execute = (instruction: Instruction, a = 0, b = 0) => step(initialState(registers(a, b)), [encode(instruction)])
const vectors: [Instruction, number][] = [
  ...REGISTER_OPS.map((op, i) => [{ op, rd: 3, rs1: 1, rs2: 2 }, [0x002081b3, 0x402081b3, 0x002091b3, 0x0020a1b3, 0x0020b1b3, 0x0020c1b3, 0x0020d1b3, 0x4020d1b3, 0x0020e1b3, 0x0020f1b3][i]] as [Instruction, number]),
  ...IMMEDIATE_OPS.map((op, i) => [{ op, rd: 3, rs1: 1, imm: ['SLLI', 'SRLI', 'SRAI'].includes(op) ? 31 : -1 }, [0xfff08193, 0xfff0a193, 0xfff0b193, 0xfff0c193, 0xfff0e193, 0xfff0f193, 0x01f09193, 0x01f0d193, 0x41f0d193][i]] as [Instruction, number]),
  [{ op: 'LB', rd: 3, rs1: 1, imm: -1 }, 0xfff08183], [{ op: 'LH', rd: 3, rs1: 1, imm: -1 }, 0xfff09183],
  [{ op: 'LW', rd: 3, rs1: 1, imm: -1 }, 0xfff0a183], [{ op: 'LBU', rd: 3, rs1: 1, imm: -1 }, 0xfff0c183], [{ op: 'LHU', rd: 3, rs1: 1, imm: -1 }, 0xfff0d183],
  [{ op: 'SB', rs1: 1, rs2: 2, imm: -1 }, 0xfe208fa3], [{ op: 'SH', rs1: 1, rs2: 2, imm: -1 }, 0xfe209fa3], [{ op: 'SW', rs1: 1, rs2: 2, imm: -1 }, 0xfe20afa3],
  ...BRANCH_OPS.map((op, i) => [{ op, rs1: 1, rs2: 2, imm: 8 }, [0x00208463, 0x00209463, 0x0020c463, 0x0020d463, 0x0020e463, 0x0020f463][i]] as [Instruction, number]),
  [{ op: 'LUI', rd: 3, imm: 0x12345 }, 0x123451b7], [{ op: 'AUIPC', rd: 3, imm: 0x12345 }, 0x12345197],
  [{ op: 'JAL', rd: 3, imm: 8 }, 0x008001ef], [{ op: 'JALR', rd: 3, rs1: 1, imm: -1 }, 0xfff081e7],
  [{ op: 'FENCE', pred: 15, succ: 15, fm: 0, rd: 0, rs1: 0 }, 0x0ff0000f], [{ op: 'ECALL' }, 0x00000073], [{ op: 'EBREAK' }, 0x00100073],
]

describe('all 40 RV32I encodings', () => {
  it.each(vectors)('matches independently specified word for %j', (instruction, word) => {
    expect(encode(instruction)).toBe(word)
    expect(decode(word)).toEqual(instruction)
    expect(assembly(instruction)).not.toContain('undefined')
  })
  it('exposes exactly the supported instruction set to the editor', () => {
    expect(vectors.map(([i]) => i.op).sort()).toEqual([...INSTRUCTION_OPS].sort())
    for (const op of INSTRUCTION_OPS) expect(decode(encode(defaultInstruction(op))).op).toBe(op)
  })
  it.each([-1048576, -2048, -4, 0, 2, 2048, 1048574])('reassembles signed J immediate %i', imm => {
    expect(decode(encode({ op: 'JAL', rd: 1, imm }))).toEqual({ op: 'JAL', rd: 1, imm })
  })
  it('rejects reserved/extension encodings and out-of-range operands', () => {
    for (const word of [0x022081b3, 0x402091b3, 0x02001013, 0x40001013, 0x02005013, 0x00003003, 0x00006003, 0x00004023, 0x00002063, 0x00001067, 0x0000100f, 0x00101073, 1, 0xffffffff]) expect(() => decode(word)).toThrow()
    for (const imm of [-1, 32, 1.5]) expect(() => encode({ op: 'SRAI', rd: 3, rs1: 1, imm })).toThrow()
    for (const imm of [-1, 0x100000]) expect(() => encode({ op: 'LUI', rd: 3, imm })).toThrow()
    for (const imm of [-1048578, 1048576, 3]) expect(() => encode({ op: 'JAL', rd: 1, imm })).toThrow()
  })
})

function oracle(op: string, a: number, b: number): number {
  const A = BigInt(a), B = BigInt(b), shift = B & 31n
  const signedA = BigInt.asIntN(32, A), signedB = BigInt.asIntN(32, B)
  const value = op === 'ADD' ? A + B : op === 'SUB' ? A - B : op === 'SLL' ? A << shift : op === 'SRL' ? A >> shift : op === 'SRA' ? signedA >> shift : op === 'SLT' ? BigInt(signedA < signedB) : op === 'SLTU' ? BigInt(A < B) : op === 'XOR' ? A ^ B : op === 'OR' ? A | B : A & B
  return Number(BigInt.asUintN(32, value))
}
describe('32-bit ALU and PC boundaries', () => {
  it.each(REGISTER_OPS)('%s agrees with independent BigInt arithmetic, signedness and shift masking', op => {
    for (const [a, b] of [[0, 0], [0xffffffff, 1], [0x80000000, 31], [0x7fffffff, 32], [0x80000001, 0xffffffff], [0x12345678, 4]]) {
      const result = execute({ op, rd: 3, rs1: 1, rs2: 2 }, a, b)
      expect(result.state.registers[3]).toBe(oracle(op, a, b))
      expect(result.trace?.signals.alu_result).toBe(result.state.registers[3])
    }
  })
  it.each(IMMEDIATE_OPS)('%s sign extends immediates before ALU operations', op => {
    const shifts = ['SLLI', 'SRLI', 'SRAI'].includes(op)
    for (const imm of shifts ? [0, 1, 31] : [-2048, -1, 0, 2047]) {
      const aluOp = { ADDI: 'ADD', SLTI: 'SLT', SLTIU: 'SLTU', XORI: 'XOR', ORI: 'OR', ANDI: 'AND', SLLI: 'SLL', SRLI: 'SRL', SRAI: 'SRA' }[op]
      const result = execute({ op, rd: 3, rs1: 1, imm }, 0x80000001)
      expect(result.state.registers[3]).toBe(oracle(aluOp, 0x80000001, imm >>> 0))
      if (op === 'SRAI') expect(result.trace?.signals.imm).toBe(0x400 | imm) // actual IMM_I bus, not edited shamt
    }
  })
  it('uses PC for AUIPC, zero for LUI, and wraps PC/link results', () => {
    const auipc = step({ ...initialState(), pc: 4 }, [0, encode({ op: 'AUIPC', rd: 3, imm: 0xfffff })])
    expect(auipc.state.registers[3]).toBe(0xfffff004)
    expect(auipc.trace?.signals).toMatchObject({ alu_a_sel: 1, alu_a: 4, imm: 0xfffff000 })
    expect(execute({ op: 'LUI', rd: 3, imm: 0x80000 }).state.registers[3]).toBe(0x80000000)
    const program = { [0x3fffffff]: encode({ op: 'JAL', rd: 1, imm: 4 }), 0: 0x00000013, length: 0x40000000 }
    const result = step({ ...initialState(), pc: 0xfffffffc }, program)
    expect(result.state.pc).toBe(0); expect(result.state.registers[1]).toBe(0)
  })
  it('JALR uses the old rs1 when rd aliases it, clears bit0 and traps bit1 atomically', () => {
    const instruction = { op: 'JALR', rd: 1, rs1: 1, imm: 0 } as const
    const program = [encode(instruction), 0x00000013, 0x00000013, 0x00000013]
    const result = step(initialState(registers(13)), program)
    expect(result.state.pc).toBe(12); expect(result.state.registers[1]).toBe(4)
    expect(result.trace?.signals).toMatchObject({ target: 12, wb_sel: 2, wb_data: 4, jump: 1, jalr: 1 })
    const before = initialState(registers(3)), bad = step(before, program)
    expect(bad.state).toMatchObject({ pc: 0, retired: 0, fault: { cause: 0 } })
    expect(bad.state.registers).toBe(before.registers)
    expect(execute({ op: 'JAL', rd: 0, imm: 2 }).state.fault?.cause).toBe(0)
  })
  it.each(BRANCH_OPS)('%s compares signed/unsigned values correctly and only checks a selected target', op => {
    for (const [a, b] of [[0, 0], [0xffffffff, 1], [1, 0xffffffff], [0x80000000, 0x7fffffff]]) {
      const taken = op === 'BEQ' ? a === b : op === 'BNE' ? a !== b : op === 'BLT' ? (a | 0) < (b | 0) : op === 'BGE' ? (a | 0) >= (b | 0) : op === 'BLTU' ? a < b : a >= b
      const before = initialState(registers(a, b))
      const result = step(before, [encode({ op, rs1: 1, rs2: 2, imm: 8 }), 0x13, 0x13])
      expect(result.state.pc).toBe(taken ? 8 : 4)
      const unaligned = step(before, [encode({ op, rs1: 1, rs2: 2, imm: 2 })])
      expect(unaligned.state.status === 'fault').toBe(taken)
    }
  })
})

describe('byte/halfword memory lanes, faults and system policy', () => {
  it.each([['SB', 0, 1], ['SB', 1, 1], ['SB', 2, 1], ['SB', 3, 1], ['SH', 0, 2], ['SH', 2, 2], ['SW', 0, 4]] as const)('%s changes only its real bus lanes', (op, lane, bytes) => {
    const before = initialState(registers(64 + lane, 0x89abcdef), createMemory(new Uint8Array(1024).fill(0x55)))
    const result = step(before, [encode({ op, rs1: 1, rs2: 2, imm: 0 })])
    const expected = [0x55, 0x55, 0x55, 0x55]
    for (let i = 0; i < bytes; i++) expected[lane + i] = 0x89abcdef >>> (i * 8) & 255
    expect(result.state.memory.slice(64, 68)).toEqual(expected)
    expect(result.trace?.signals).toMatchObject({ mem_size: bytes === 1 ? 0 : bytes === 2 ? 1 : 2, dmem_wstrb: ((1 << bytes) - 1) << lane, dmem_wdata: (0x89abcdef << lane * 8) >>> 0 })
    expect(before.memory.slice(64, 68)).toEqual([0x55, 0x55, 0x55, 0x55])
  })
  it.each([['LB', 0xffffff80], ['LBU', 0x80], ['LH', 0xffffff80], ['LHU', 0xff80], ['LW', 0x1122ff80]] as const)('%s loads the correct signed/unsigned value', (op, expected) => {
    const bytes = new Uint8Array(1024); bytes.set([0x80, 0xff, 0x22, 0x11], 64)
    const result = step(initialState(registers(64), createMemory(bytes)), [encode({ op, rd: 3, rs1: 1, imm: 0 })])
    expect(result.state.registers[3]).toBe(expected)
    expect(result.trace?.signals.load_data).toBe(expected)
    expect(result.trace?.memoryAccess?.data).toBe(expected)
  })
  it('allows last-byte/halfword accesses, while alignment/bounds and load-to-x0 still fault without writes', () => {
    for (const [op, address] of [['LB', 1023], ['LH', 1022], ['LW', 1020]] as const) expect(execute({ op, rd: 0, rs1: 1, imm: 0 }, address).state.status).toBe('halted')
    for (const op of ['LH', 'SH', 'LW', 'SW'] as const) {
      const before = initialState(registers(1, 42))
      const i: Instruction = op === 'SH' || op === 'SW' ? { op, rs1: 1, rs2: 2, imm: 0 } : { op, rd: 0, rs1: 1, imm: 0 }
      const result = step(before, [encode(i)])
      expect(result.state.pc).toBe(0); expect(result.state.retired).toBe(0)
      expect(result.state.registers).toBe(before.registers); expect(result.state.memory).toBe(before.memory)
    }
    expect(execute({ op: 'LB', rd: 0, rs1: 1, imm: 0 }, 1024).state.fault?.source).toBe('host')
  })
  it('updates only byte/halfword lanes in the final page of large RAM', () => {
    const before = initialState(registers(262140, 0x11223344), createMemory(new Uint8Array(262144).fill(0x55)))
    const first = step(before, [encode({ op: 'SB', rs1: 1, rs2: 2, imm: 3 }), encode({ op: 'SH', rs1: 1, rs2: 2, imm: 0 })])
    const after = step(first.state, [0x13, encode({ op: 'SH', rs1: 1, rs2: 2, imm: 0 })]).state
    expect(before.memory.slice(262140)).toEqual([0x55, 0x55, 0x55, 0x55])
    expect(first.state.memory.slice(262140)).toEqual([0x55, 0x55, 0x55, 0x44])
    expect(after.memory.slice(262140)).toEqual([0x44, 0x33, 0x55, 0x44])
  })
  it('keeps x0 zero for every instruction with a destination', () => {
    for (const op of INSTRUCTION_OPS) {
      const instruction = defaultInstruction(op)
      if (!('rd' in instruction)) continue
      const result = execute({ ...instruction, rd: 0 } as Instruction)
      expect(result.state.registers[0]).toBe(0)
      expect(result.trace?.write.committed).toBe(false)
    }
  })
  it.each([['ECALL', 11], ['EBREAK', 3]] as const)('%s records a non-retiring trap; replay never applies a commit', (op, cause) => {
    const before = initialState(registers(42)), result = step(before, [encode({ op })])
    expect(result.state).toMatchObject({ pc: 0, retired: 0, status: 'fault', fault: { cause, source: 'rtl' } })
    expect(result.state.memory).toBe(before.memory); expect(result.state.registers).toBe(before.registers)
    expect(result.trace?.write.committed).toBe(false)
    expect(result.trace?.signals).toMatchObject({ system_trap: 1, system_cause: cause, rf_we: 0, dmem_we: 0, next_pc: 0, trap: 1, trap_cause: cause })
    expect(step(result.state, [0x13]).state).toBe(result.state)
    useLabStore.setState(useLabStore.getInitialState(), true)
    useLabStore.getState().importProgram([encode({ op })], false, true)
    useLabStore.getState().step()
    const committed = useLabStore.getState().cpu
    useLabStore.getState().replay(0); useLabStore.getState().observe('writeback')
    expect(useLabStore.getState().cpu).toBe(committed)
    useLabStore.getState().reset(); expect(useLabStore.getState().cpu.status).toBe('ready')
  })
  it('FENCE ignores reserved source/destination/fm fields as an ordered single-core barrier', () => {
    const result = execute({ op: 'FENCE', pred: 3, succ: 3, fm: 8, rs1: 1, rd: 3 }, 64, 42)
    expect(result.state.registers).toEqual(registers(64, 42))
    expect(result.state).toMatchObject({ pc: 4, retired: 1, status: 'halted' })
    expect(result.trace?.signals).toMatchObject({ reg_write: 0, mem_write: 0, mem_read: 0, jump: 0 })
  })
})

describe('Trace consistency without changing the frozen teaching topology', () => {
  it.each(vectors)('keeps architectural values, control encodings and every drawn transfer coherent for %j', (instruction, word) => {
    const result = step(initialState(registers(64, 64)), [word])
    const trace = result.trace
    if (!trace) { expect(result.state.status).toBe('fault'); return } // intentionally misaligned literal memory vectors
    expect(trace.before.pc).toBe(0); expect(trace.after).toBe(result.state)
    expect(trace.signals.next_pc).toBe(result.state.pc)
    if (trace.write.committed) expect(trace.after.registers[trace.write.rd]).toBe(trace.signals.wb_data)
    for (const t of trace.transfers) { expect(t.value).toBe(trace.signals[t.signal]); expect(WIRES.some(w => w.id === t.id)).toBe(true) }
    for (const phase of PHASES) expect(() => timelineFor(trace, phase)).not.toThrow()
    expect(trace.after.retired - trace.before.retired).toBe(trace.trap ? 0 : 1)
    if (instruction.op === 'LUI' || instruction.op === 'AUIPC') { expect(trace.transfers.some(t => t.id === 'alu_a')).toBe(false); expect(trace.visualizationOmissions?.length).toBeGreaterThan(0) }
    if (instruction.op === 'JAL' || instruction.op === 'JALR') { expect(trace.signals.wb_sel).toBe(2); expect(trace.transfers.some(t => t.id === 'alu_result')).toBe(false) }
  })
  it('shows PC-relative jump/branch targets in the paged listing', () => {
    const listing = programListing([encode({ op: 'JAL', rd: 1, imm: 8 }), encode({ op: 'BNE', rs1: 1, rs2: 2, imm: -4 }), 0x13])
    expect(listing[0].target).toBe(8); expect(listing[1].target).toBe(0)
  })
})

describe('small real RV32I programs', () => {
  it.each(RV32I_PROGRAMS)('runs $name one architectural instruction at a time', program => {
    const words = program.instructions.map(encode)
    const fileWords = parseHex(readFileSync(`examples/sprint05/${program.name}.hex`, 'utf8')).values
    expect(Array.from(fileWords)).toEqual(words)
    const result = run(initialState(), fileWords)
    expect(result.state).toMatchObject({ pc: program.stopPC, retired: program.retired, status: 'fault' })
    for (const [r, expected] of Object.entries(program.registers)) expect(result.state.registers[Number(r)]).toBe(expected)
    expect(readWord(result.state.memory, 64)).toBe(program.memory)
    expect(result.state.registers[0]).toBe(0)
    expect(result.traces.at(-1)?.trap).toBeDefined()
    for (const trace of result.traces) {
      expect(trace.write.committed ? trace.after.registers[trace.write.rd] : trace.before.registers[0]).toBe(trace.write.committed ? trace.write.value : 0)
      for (const transfer of trace.transfers) expect(transfer.value).toBe(trace.signals[transfer.signal])
    }
    // Execute through the real Store, then replay every snapshot without another write.
    useLabStore.getState().importProgram(words, false, true)
    useLabStore.getState().runFast()
    for (let batch = 0; batch < 10 && useLabStore.getState().fastRunning; batch++) useLabStore.getState().fastBatch()
    const after = useLabStore.getState().cpu
    expect(after).toEqual(result.state)
    for (let i = 0; i < useLabStore.getState().history.length; i++) {
      useLabStore.getState().replay(i); useLabStore.getState().observe('writeback')
      expect(useLabStore.getState().cpu).toBe(after)
    }
  })
})
