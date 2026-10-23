export const REGISTER_OPS = ['ADD', 'SUB', 'SLL', 'SLT', 'SLTU', 'XOR', 'SRL', 'SRA', 'OR', 'AND'] as const
export const IMMEDIATE_OPS = ['ADDI', 'SLTI', 'SLTIU', 'XORI', 'ORI', 'ANDI', 'SLLI', 'SRLI', 'SRAI'] as const
export const LOAD_OPS = ['LB', 'LH', 'LW', 'LBU', 'LHU'] as const
export const STORE_OPS = ['SB', 'SH', 'SW'] as const
export const BRANCH_OPS = ['BEQ', 'BNE', 'BLT', 'BGE', 'BLTU', 'BGEU'] as const
export const INSTRUCTION_OPS = [...IMMEDIATE_OPS, ...REGISTER_OPS, ...LOAD_OPS, ...STORE_OPS, ...BRANCH_OPS, 'LUI', 'AUIPC', 'JAL', 'JALR', 'FENCE', 'ECALL', 'EBREAK'] as const
export type Instruction =
  | { op: typeof REGISTER_OPS[number]; rd: number; rs1: number; rs2: number }
  | { op: typeof IMMEDIATE_OPS[number] | typeof LOAD_OPS[number] | 'JALR'; rd: number; rs1: number; imm: number }
  | { op: typeof STORE_OPS[number] | typeof BRANCH_OPS[number]; rs1: number; rs2: number; imm: number }
  // U-type operand is an unsigned 20-bit FIELD, shifted left 12 bits by execution.
  | { op: 'LUI' | 'AUIPC' | 'JAL'; rd: number; imm: number }
  | { op: 'FENCE'; pred?: number; succ?: number; fm?: number; rd?: number; rs1?: number }
  | { op: 'ECALL' | 'EBREAK' }
export const u32 = (value: number) => value >>> 0
export const i32 = (value: number) => value | 0
export const hex = (value: number) => `0x${u32(value).toString(16).padStart(8, '0')}`
export const binary = (value: number) => u32(value).toString(2).padStart(32, '0')
export const isLoad = (op: string) => (LOAD_OPS as readonly string[]).includes(op)
export const isStore = (op: string) => (STORE_OPS as readonly string[]).includes(op)
export const isBranch = (op: string) => (BRANCH_OPS as readonly string[]).includes(op)
export const isRegisterAlu = (op: string) => (REGISTER_OPS as readonly string[]).includes(op)
const R_F3 = { ADD: 0, SUB: 0, SLL: 1, SLT: 2, SLTU: 3, XOR: 4, SRL: 5, SRA: 5, OR: 6, AND: 7 }
const I_F3 = { ADDI: 0, SLLI: 1, SLTI: 2, SLTIU: 3, XORI: 4, SRLI: 5, SRAI: 5, ORI: 6, ANDI: 7 }
const LOAD_F3 = { LB: 0, LH: 1, LW: 2, LBU: 4, LHU: 5 }
const STORE_F3 = { SB: 0, SH: 1, SW: 2 }
const BRANCH_F3 = { BEQ: 0, BNE: 1, BLT: 4, BGE: 5, BLTU: 6, BGEU: 7 }
function integer(value: number, min: number, max: number, message: string) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(message)
}
function register(index: number) { integer(index, 0, 31, '寄存器编号必须为 0–31 的整数') }
export function instructionFormat(op: string): 'R' | 'I' | 'S' | 'B' | 'U' | 'J' {
  return isRegisterAlu(op) ? 'R' : isStore(op) ? 'S' : isBranch(op) ? 'B' : op === 'LUI' || op === 'AUIPC' ? 'U' : op === 'JAL' ? 'J' : 'I'
}
export function defaultInstruction(op: Instruction['op']): Instruction {
  if (op === 'ECALL' || op === 'EBREAK') return { op }
  if (op === 'FENCE') return { op, pred: 15, succ: 15, fm: 0, rd: 0, rs1: 0 }
  if (op === 'LUI' || op === 'AUIPC' || op === 'JAL') return { op, rd: 3, imm: 0 }
  if (isRegisterAlu(op)) return { op, rd: 3, rs1: 0, rs2: 2 } as Instruction
  if (isBranch(op) || isStore(op)) return { op, rs1: 0, rs2: 2, imm: 0 } as Instruction
  return { op, rd: 3, rs1: 0, imm: 0 } as Instruction
}
export function encode(instruction: Instruction): number {
  const op = instruction.op
  if ('rs1' in instruction) register(instruction.rs1 ?? 0)
  if ('rd' in instruction) register(instruction.rd ?? 0)
  if ('rs2' in instruction) register(instruction.rs2)
  if (op === 'ECALL') return 0x00000073
  if (op === 'EBREAK') return 0x00100073
  if (op === 'FENCE') {
    const { pred = 15, succ = 15, fm = 0, rd = 0, rs1 = 0 } = instruction
    for (const n of [pred, succ, fm]) integer(n, 0, 15, 'FENCE 掩码须为 0–15')
    return u32(fm << 28 | pred << 24 | succ << 20 | rs1 << 15 | rd << 7 | 0x0f)
  }
  if ('rs2' in instruction && 'rd' in instruction) {
    const f3 = R_F3[op as keyof typeof R_F3]
    if (f3 === undefined) throw new Error('不支持的 R 型操作')
    return u32((op === 'SUB' || op === 'SRA' ? 0x40000000 : 0) | instruction.rs2 << 20 | instruction.rs1 << 15 | f3 << 12 | instruction.rd << 7 | 0x33)
  }
  if (!('imm' in instruction)) throw new Error('不支持的指令')
  const { imm } = instruction
  if (op === 'LUI' || op === 'AUIPC') {
    integer(imm, 0, 0xfffff, 'U 型立即数须为 0–1048575 的 20 位字段（执行时左移 12 位）')
    return u32(imm << 12 | instruction.rd << 7 | (op === 'LUI' ? 0x37 : 0x17))
  }
  if (op === 'JAL') {
    integer(imm, -1048576, 1048574, 'JAL 偏移须为 −1048576–1048574 的偶数字节')
    if (imm % 2) throw new Error('JAL 偏移须为偶数字节')
    return u32((imm & 0x100000) << 11 | (imm & 0x7fe) << 20 | (imm & 0x800) << 9 | (imm & 0xff000) | instruction.rd << 7 | 0x6f)
  }
  const rs1 = 'rs1' in instruction ? instruction.rs1 : 0
  if (isBranch(op)) {
    integer(imm, -4096, 4094, '分支偏移必须为 −4096–4094 的偶数（字节）')
    if (imm % 2) throw new Error('分支偏移必须为偶数（字节）')
    const rs2 = 'rs2' in instruction ? instruction.rs2 : 0
    return u32((imm & 0x1000) << 19 | (imm & 0x7e0) << 20 | rs2 << 20 | rs1 << 15 | BRANCH_F3[op as keyof typeof BRANCH_F3] << 12 | (imm & 0x1e) << 7 | (imm & 0x800) >> 4 | 0x63)
  }
  const shift = op === 'SLLI' || op === 'SRLI' || op === 'SRAI'
  integer(imm, shift ? 0 : -2048, shift ? 31 : 2047, shift ? '移位量必须为 0–31 的整数' : 'I/S 型立即数必须为 −2048–2047 的整数')
  if (isStore(op)) {
    const rs2 = 'rs2' in instruction ? instruction.rs2 : 0
    return u32((imm & 0xfe0) << 20 | rs2 << 20 | rs1 << 15 | STORE_F3[op as keyof typeof STORE_F3] << 12 | (imm & 31) << 7 | 0x23)
  }
  const rd = 'rd' in instruction ? instruction.rd : 0
  const f3 = isLoad(op) ? LOAD_F3[op as keyof typeof LOAD_F3] : op === 'JALR' ? 0 : I_F3[op as keyof typeof I_F3]
  if (f3 === undefined) throw new Error('不支持的立即数操作')
  return u32(((imm & 0xfff) | (op === 'SRAI' ? 0x400 : 0)) << 20 | rs1 << 15 | f3 << 12 | rd << 7 | (isLoad(op) ? 0x03 : op === 'JALR' ? 0x67 : 0x13))
}
export function immediate(word: number, format: 'I' | 'S' | 'B' | 'U' | 'J'): number {
  if (format === 'I') return word >> 20
  if (format === 'S') return (((word >>> 25) << 5 | (word >>> 7 & 31)) << 20) >> 20
  if (format === 'U') return word & 0xfffff000
  if (format === 'J') return (((word >>> 31) << 20 | (word >>> 12 & 255) << 12 | (word >>> 20 & 1) << 11 | (word >>> 21 & 1023) << 1) << 11) >> 11
  return (((word >>> 31) << 12 | (word >>> 7 & 1) << 11 | (word >>> 25 & 63) << 5 | (word >>> 8 & 15) << 1) << 19) >> 19
}
export function decode(word: number): Instruction {
  if (!Number.isInteger(word) || word < 0 || word > 0xffffffff) throw new Error('指令必须为 32 位无符号整数')
  const opcode = word & 0x7f, rd = word >>> 7 & 31, rs1 = word >>> 15 & 31, rs2 = word >>> 20 & 31
  const f3 = word >>> 12 & 7, f7 = word >>> 25
  if (opcode === 0x37 || opcode === 0x17) return { op: opcode === 0x37 ? 'LUI' : 'AUIPC', rd, imm: word >>> 12 }
  if (opcode === 0x6f) return { op: 'JAL', rd, imm: immediate(word, 'J') }
  if (opcode === 0x67 && f3 === 0) return { op: 'JALR', rd, rs1, imm: immediate(word, 'I') }
  if (opcode === 0x33 && (f7 === 0 || f7 === 32 && (f3 === 0 || f3 === 5))) {
    const op = (f7 === 32 ? f3 === 0 ? 'SUB' : 'SRA' : ['ADD', 'SLL', 'SLT', 'SLTU', 'XOR', 'SRL', 'OR', 'AND'][f3]) as typeof REGISTER_OPS[number]
    return { op, rd, rs1, rs2 }
  }
  if (opcode === 0x13) {
    const shift = f3 === 1 || f3 === 5
    if (!shift || f7 === 0 || f3 === 5 && f7 === 32) {
      const op = (f3 === 5 && f7 === 32 ? 'SRAI' : ['ADDI', 'SLLI', 'SLTI', 'SLTIU', 'XORI', 'SRLI', 'ORI', 'ANDI'][f3]) as typeof IMMEDIATE_OPS[number]
      return { op, rd, rs1, imm: shift ? rs2 : immediate(word, 'I') }
    }
  }
  const load = Object.entries(LOAD_F3).find(([, n]) => n === f3)?.[0] as typeof LOAD_OPS[number] | undefined
  if (opcode === 0x03 && load) return { op: load, rd, rs1, imm: immediate(word, 'I') }
  const store = Object.entries(STORE_F3).find(([, n]) => n === f3)?.[0] as typeof STORE_OPS[number] | undefined
  if (opcode === 0x23 && store) return { op: store, rs1, rs2, imm: immediate(word, 'S') }
  const branch = Object.entries(BRANCH_F3).find(([, n]) => n === f3)?.[0] as typeof BRANCH_OPS[number] | undefined
  if (opcode === 0x63 && branch) return { op: branch, rs1, rs2, imm: immediate(word, 'B') }
  if (opcode === 0x0f && f3 === 0) return { op: 'FENCE', pred: word >>> 24 & 15, succ: word >>> 20 & 15, fm: word >>> 28, rd, rs1 }
  if (word === 0x00000073) return { op: 'ECALL' }
  if (word === 0x00100073) return { op: 'EBREAK' }
  throw new Error(`非法或非 RV32I 指令：${hex(word)}（不支持 M/C/A、CSR、FENCE.I 等扩展）`)
}
export function assembly(instruction: Instruction): string {
  const op = instruction.op.toLowerCase()
  if (instruction.op === 'ECALL' || instruction.op === 'EBREAK') return op
  if (instruction.op === 'FENCE') return `fence 0x${(instruction.pred ?? 15).toString(16)}, 0x${(instruction.succ ?? 15).toString(16)} (fm=${instruction.fm ?? 0})`
  if ((isLoad(instruction.op) || instruction.op === 'JALR') && 'rd' in instruction && 'rs1' in instruction) return `${op} x${instruction.rd}, ${'imm' in instruction ? instruction.imm : 0}(x${instruction.rs1})`
  if (isStore(instruction.op) && 'rs2' in instruction) return `${op} x${instruction.rs2}, ${'imm' in instruction ? instruction.imm : 0}(x${instruction.rs1})`
  if (isBranch(instruction.op) && 'rs2' in instruction) return `${op} x${instruction.rs1}, x${instruction.rs2}, ${'imm' in instruction ? instruction.imm : 0}`
  if ('rd' in instruction && 'imm' in instruction && !('rs1' in instruction)) return `${op} x${instruction.rd}, ${instruction.op === 'JAL' ? instruction.imm : '0x' + instruction.imm.toString(16)}`
  if ('rd' in instruction && 'rs1' in instruction) return `${op} x${instruction.rd}, x${instruction.rs1}, ${'imm' in instruction ? instruction.imm : 'rs2' in instruction ? `x${instruction.rs2}` : 0}`
  return op
}
