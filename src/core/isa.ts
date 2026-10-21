export type Instruction =
  | { op: 'ADDI'; rd: number; rs1: number; imm: number }
  | { op: 'ADD'; rd: number; rs1: number; rs2: number }
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
  register(instruction.rs1)
  if ('rd' in instruction) register(instruction.rd)
  if ('rs2' in instruction) register(instruction.rs2)
  if (instruction.op === 'ADD')
    return u32((instruction.rs2 << 20) | (instruction.rs1 << 15) | (instruction.rd << 7) | 0x33)
  const { imm } = instruction
  const branch = instruction.op === 'BEQ'
  if (!Number.isInteger(imm) || imm < (branch ? -4096 : -2048) || imm > (branch ? 4094 : 2047) || (branch && imm % 2 !== 0))
    throw new Error(branch ? 'BEQ 偏移必须为 −4096–4094 的偶数（字节）' : 'I/S 型立即数必须为 −2048–2047 的整数')
  const base = instruction.rs1 << 15
  if (instruction.op === 'ADDI' || instruction.op === 'LW')
    return u32(((imm & 0xfff) << 20) | base | (instruction.rd << 7) | (instruction.op === 'LW' ? 0x2003 : 0x13))
  if (instruction.op === 'SW')
    return u32(((imm & 0xfe0) << 20) | (instruction.rs2 << 20) | base | 0x2023 | ((imm & 31) << 7))
  return u32(((imm & 0x1000) << 19) | ((imm & 0x7e0) << 20) | (instruction.rs2 << 20) | base | ((imm & 0x1e) << 7) | ((imm & 0x800) >> 4) | 0x63)
}

export function immediate(word: number, format: 'I' | 'S' | 'B'): number {
  if (format === 'I') return word >> 20
  if (format === 'S') {
    const bits = ((word >>> 25) << 5) | ((word >>> 7) & 31)
    return (bits << 20) >> 20
  }
  const bits = ((word >>> 31) << 12) | (((word >>> 7) & 1) << 11) | (((word >>> 25) & 63) << 5) | (((word >>> 8) & 15) << 1)
  return (bits << 19) >> 19
}

export function decode(word: number): Instruction {
  const opcode = word & 0x7f
  const rd = (word >>> 7) & 31
  const rs1 = (word >>> 15) & 31
  const funct3 = (word >>> 12) & 7
  const rs2 = (word >>> 20) & 31
  if (opcode === 0x13 && funct3 === 0) return { op: 'ADDI', rd, rs1, imm: word >> 20 }
  if (opcode === 0x03 && funct3 === 2) return { op: 'LW', rd, rs1, imm: immediate(word, 'I') }
  if (opcode === 0x23 && funct3 === 2) return { op: 'SW', rs1, rs2, imm: immediate(word, 'S') }
  if (opcode === 0x63 && funct3 === 0) return { op: 'BEQ', rs1, rs2, imm: immediate(word, 'B') }
  if (opcode === 0x33 && funct3 === 0 && (word >>> 25) === 0)
    return { op: 'ADD', rd, rs1, rs2 }
  throw new Error(`软件子集不支持该指令：${hex(word)}`)
}

export function assembly(instruction: Instruction): string {
  switch (instruction.op) {
    case 'LW': return `lw x${instruction.rd}, ${instruction.imm}(x${instruction.rs1})`
    case 'SW': return `sw x${instruction.rs2}, ${instruction.imm}(x${instruction.rs1})`
    case 'BEQ': return `beq x${instruction.rs1}, x${instruction.rs2}, ${instruction.imm}`
    default: return `${instruction.op.toLowerCase()} x${instruction.rd}, x${instruction.rs1}, ${instruction.op === 'ADDI' ? instruction.imm : `x${instruction.rs2}`}`
  }
}
