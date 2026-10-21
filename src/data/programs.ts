import { encode, type Instruction } from '../core/isa'

export const DEMO: readonly Instruction[] = [
  { op: 'ADDI', rd: 1, rs1: 0, imm: 5 },
  { op: 'ADDI', rd: 2, rs1: 0, imm: 7 },
  { op: 'ADD', rd: 3, rs1: 1, rs2: 2 },
]
export const DEMO_WORDS = DEMO.map(encode)
export const PROGRAMS = [
  { id: 'arithmetic', name: '第一次加法', summary: 'ADDI → ADD', goal: 'x3 = 12 · PC = 12', instructions: DEMO },
  { id: 'memory', name: '内存读写', summary: 'SW → LW', goal: 'M[64] = 42 · x3 = 42', instructions: [
    { op: 'ADDI', rd: 1, rs1: 0, imm: 64 }, { op: 'ADDI', rd: 2, rs1: 0, imm: 42 },
    { op: 'SW', rs2: 2, rs1: 1, imm: 0 }, { op: 'LW', rd: 3, rs1: 1, imm: 0 },
  ] },
  { id: 'branch', name: '条件分支', summary: 'BEQ → PC 重定向', goal: '跳过 99 · x3 = 42', instructions: [
    { op: 'ADDI', rd: 1, rs1: 0, imm: 5 }, { op: 'ADDI', rd: 2, rs1: 0, imm: 5 },
    { op: 'BEQ', rs1: 1, rs2: 2, imm: 8 }, { op: 'ADDI', rd: 3, rs1: 0, imm: 99 },
    { op: 'ADDI', rd: 3, rs1: 0, imm: 42 },
  ] },
] as const satisfies readonly { id: string; name: string; summary: string; goal: string; instructions: readonly Instruction[] }[]
export const ABI = ['zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2', 's0', 's1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 't3', 't4', 't5', 't6']
