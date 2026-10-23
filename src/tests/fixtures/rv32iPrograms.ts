import type { Instruction } from '../../core/isa'

export const RV32I_PROGRAMS: { name: string; instructions: Instruction[]; registers: Record<number, number>; memory: number; retired: number; stopPC: number }[] = [
  { name: 'sum-call', instructions: [
    { op: 'LUI', rd: 10, imm: 0x80000 }, { op: 'SRAI', rd: 11, rs1: 10, imm: 31 }, { op: 'SLTU', rd: 12, rs1: 11, rs2: 10 },
    { op: 'AUIPC', rd: 5, imm: 0 }, { op: 'ADDI', rd: 1, rs1: 0, imm: 5 }, { op: 'ADDI', rd: 3, rs1: 0, imm: 0 },
    { op: 'ADD', rd: 3, rs1: 3, rs2: 1 }, { op: 'ADDI', rd: 1, rs1: 1, imm: -1 }, { op: 'BNE', rs1: 1, rs2: 0, imm: -8 },
    { op: 'JAL', rd: 6, imm: 12 }, { op: 'SW', rs1: 0, rs2: 3, imm: 64 }, { op: 'JAL', rd: 0, imm: 12 },
    { op: 'ADDI', rd: 3, rs1: 3, imm: 1 }, { op: 'JALR', rd: 0, rs1: 6, imm: 0 },
    { op: 'FENCE' }, { op: 'EBREAK' },
  ], registers: { 3: 16, 5: 12, 6: 40, 10: 0x80000000, 11: 0xffffffff, 12: 0 }, memory: 16, retired: 27, stopPC: 60 },
  { name: 'byte-half', instructions: [
    { op: 'ADDI', rd: 1, rs1: 0, imm: 64 }, { op: 'ADDI', rd: 2, rs1: 0, imm: -128 },
    { op: 'SB', rs1: 1, rs2: 2, imm: 0 }, { op: 'LBU', rd: 3, rs1: 1, imm: 0 }, { op: 'LB', rd: 4, rs1: 1, imm: 0 },
    { op: 'LUI', rd: 2, imm: 0xffff8 }, { op: 'SH', rs1: 1, rs2: 2, imm: 2 },
    { op: 'LH', rd: 5, rs1: 1, imm: 2 }, { op: 'LHU', rd: 6, rs1: 1, imm: 2 }, { op: 'EBREAK' },
  ], registers: { 3: 0x80, 4: 0xffffff80, 5: 0xffff8000, 6: 0x8000 }, memory: 0x80000080, retired: 9, stopPC: 36 },
  { name: 'logic-compare', instructions: [
    { op: 'ADDI', rd: 1, rs1: 0, imm: -1 }, { op: 'ADDI', rd: 2, rs1: 0, imm: 4 },
    { op: 'SLL', rd: 3, rs1: 2, rs2: 2 }, { op: 'SRLI', rd: 4, rs1: 1, imm: 31 }, { op: 'SLTI', rd: 5, rs1: 1, imm: 0 },
    { op: 'SLTIU', rd: 6, rs1: 2, imm: -1 }, { op: 'XOR', rd: 7, rs1: 3, rs2: 2 }, { op: 'ANDI', rd: 8, rs1: 7, imm: 15 },
    { op: 'ORI', rd: 9, rs1: 8, imm: 32 }, { op: 'SUB', rd: 10, rs1: 9, rs2: 2 },
    { op: 'SW', rs1: 0, rs2: 10, imm: 64 }, { op: 'ECALL' },
  ], registers: { 3: 64, 4: 1, 5: 1, 6: 1, 7: 68, 8: 4, 9: 36, 10: 32 }, memory: 32, retired: 11, stopPC: 44 },
]
