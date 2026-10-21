export type Instruction =
  | { op: 'ADDI'; rd: number; rs1: number; imm: number }
  | { op: 'ADD'; rd: number; rs1: number; rs2: number }

/** Reserved extension contracts. These instructions are deliberately not executable yet. */
export type FutureInstruction =
  | { op: 'LW'; rd: number; rs1: number; imm: number }
  | { op: 'SW'; rs2: number; rs1: number; imm: number }
  | { op: 'BEQ'; rs1: number; rs2: number; imm: number }

export const u32 = (value: number) => value >>> 0
export const i32 = (value: number) => value | 0
export const hex = (value: number) => `0x${u32(value).toString(16).padStart(8, '0')}`
export const binary = (value: number) => u32(value).toString(2).padStart(32, '0')

function register(index: number) {
  if (!Number.isInteger(index) || index < 0 || index > 31) throw new Error('寄存器编号必须为 0–31 的整数')
}

export function encode(instruction: Instruction): number {
  register(instruction.rd)
  register(instruction.rs1)
  if (instruction.op === 'ADDI') {
    if (!Number.isInteger(instruction.imm) || instruction.imm < -2048 || instruction.imm > 2047)
      throw new Error('ADDI 立即数必须为 −2048–2047 的整数')
    return u32(((instruction.imm & 0xfff) << 20) | (instruction.rs1 << 15) | (instruction.rd << 7) | 0x13)
  }
  register(instruction.rs2)
  return u32((instruction.rs2 << 20) | (instruction.rs1 << 15) | (instruction.rd << 7) | 0x33)
}

export function decode(word: number): Instruction {
  const opcode = word & 0x7f
  const rd = (word >>> 7) & 31
  const rs1 = (word >>> 15) & 31
  const funct3 = (word >>> 12) & 7
  if (opcode === 0x13 && funct3 === 0) return { op: 'ADDI', rd, rs1, imm: word >> 20 }
  if (opcode === 0x33 && funct3 === 0 && (word >>> 25) === 0)
    return { op: 'ADD', rd, rs1, rs2: (word >>> 20) & 31 }
  throw new Error(`Sprint 01 尚不支持该指令：${hex(word)}`)
}

export function assembly(instruction: Instruction): string {
  return `${instruction.op.toLowerCase()} x${instruction.rd}, x${instruction.rs1}, ${instruction.op === 'ADDI' ? instruction.imm : `x${instruction.rs2}`}`
}
