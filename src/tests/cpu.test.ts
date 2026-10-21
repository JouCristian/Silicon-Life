import { describe, expect, it } from 'vitest'
import { initialState, run, step } from '../core/cpu'
import { binary, decode, encode, hex, i32 } from '../core/isa'
import { DEMO_WORDS } from '../data/programs'

describe('RV32I ISA', () => {
  it('encodes the canonical program to independently known machine words', () => {
    expect(DEMO_WORDS).toEqual([0x00500093, 0x00700113, 0x002081b3])
    expect(encode({ op: 'ADDI', rd: 31, rs1: 31, imm: -1 })).toBe(0xffff8f93)
    expect(binary(0x80000000)).toBe('10000000000000000000000000000000')
    expect(hex(-1)).toBe('0xffffffff')
  })
  it.each([-2048, -1, 0, 2047])('sign-extends the 12-bit immediate %i', imm => {
    expect(decode(encode({ op: 'ADDI', rd: 5, rs1: 9, imm }))).toEqual({ op: 'ADDI', rd: 5, rs1: 9, imm })
  })
  it.each([-2049, 2048, .5, NaN, Infinity])('rejects an invalid immediate %s', imm => {
    expect(() => encode({ op: 'ADDI', rd: 1, rs1: 0, imm })).toThrow()
  })
  it('rejects malformed register fields and unsupported opcodes', () => {
    expect(() => encode({ op: 'ADD', rd: 32, rs1: 0, rs2: 0 })).toThrow()
    expect(() => encode({ op: 'ADD', rd: 1, rs1: -.5, rs2: 0 })).toThrow()
    for (const word of [0x402081b3, 0x022081b3, 0x00002083, 0xffffffff]) expect(() => decode(word)).toThrow()
  })
})

describe('single-cycle architectural execution', () => {
  it('commits the three-instruction example exactly once per call', () => {
    const initial = initialState()
    const result = run(initial, DEMO_WORDS)
    expect(result.state.registers.slice(0, 4)).toEqual([0, 5, 7, 12])
    expect(result.state.pc).toBe(12)
    expect(result.state.retired).toBe(3)
    expect(result.state.status).toBe('halted')
    expect(result.traces.map(t => [t.before.pc, t.after.pc])).toEqual([[0, 4], [4, 8], [8, 12]])
    expect(initial.registers.slice(0, 4)).toEqual([0, 0, 0, 0])
    expect(step(result.state, DEMO_WORDS).state).toBe(result.state)
  })
  it('wraps addition at 32 bits for both immediate and register forms', () => {
    const values = Array(32).fill(0); values[1] = 0xffffffff; values[2] = 1
    const add = run(initialState(values), [encode({ op: 'ADD', rd: 3, rs1: 1, rs2: 2 })])
    const addi = run(initialState(values), [encode({ op: 'ADDI', rd: 3, rs1: 1, imm: 1 })])
    expect(add.state.registers[3]).toBe(0)
    expect(addi.state.registers[3]).toBe(0)
    values[1] = 0x7fffffff
    const signedOverflow = run(initialState(values), [encode({ op: 'ADDI', rd: 3, rs1: 1, imm: 1 })])
    expect(signedOverflow.state.registers[3]).toBe(0x80000000)
    expect(i32(signedOverflow.state.registers[3])).toBe(-2147483648)
    expect(run(initialState(), [0xfff00093]).state.registers[1]).toBe(0xffffffff)
  })
  it('matches arithmetic modulo 2^32 against an independent BigInt oracle', () => {
    let seed = 0x12345678
    for (let i = 0; i < 150; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const a = seed; seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const b = seed; const values = Array(32).fill(0); values[1] = a; values[2] = b
      const result = run(initialState(values), [0x002081b3])
      expect(result.state.registers[3]).toBe(Number((BigInt(a) + BigInt(b)) & 0xffffffffn))
    }
  })
  it('discards writes to x0 while retaining real RTL rf_we = 1', () => {
    const result = run(initialState(), [encode({ op: 'ADDI', rd: 0, rs1: 0, imm: 42 }), 0x00100093])
    expect(result.state.registers[0]).toBe(0)
    expect(result.state.registers[1]).toBe(1)
    expect(result.traces[0].signals.rf_we).toBe(1)
    expect(result.traces[0].write.committed).toBe(false)
  })
  it('captures RTL mux selection, unused immediate and raw rs2 read correctly', () => {
    const result = run(initialState(), DEMO_WORDS)
    expect(result.traces[0].signals).toMatchObject({ alu_b_imm: 1, imm: 5, alu_b: 5, rs2_data: 0, wb_data: 5 })
    expect(result.traces[2].signals).toMatchObject({ alu_b_imm: 0, imm: 2, alu_a: 5, alu_b: 7, wb_data: 12 })
    expect(Object.isFrozen(result.traces[2].after.registers)).toBe(true)
  })
  it('stops on illegal or unaligned instructions without committing writes', () => {
    const bad = step(initialState(), [0xffffffff])
    expect(bad.state).toMatchObject({ pc: 0, retired: 0, status: 'fault' })
    expect(bad.trace).toBeUndefined()
    expect(step({ ...initialState(), pc: 2 }, DEMO_WORDS).state.status).toBe('fault')
    expect(run(initialState(), []).state).toMatchObject({ pc: 0, retired: 0, status: 'halted' })
  })
  it('stops at the execution budget and validates memory initialization', () => {
    expect(run(initialState(), Array(10).fill(0x00100093), 2).state).toMatchObject({ retired: 2, pc: 8, status: 'halted' })
    expect(() => run(initialState(), DEMO_WORDS, 0)).toThrow()
    expect(() => initialState([0])).toThrow()
    const registers = Array(32).fill(0); registers[3] = 2 ** 32
    expect(() => initialState(registers)).toThrow()
  })
})
