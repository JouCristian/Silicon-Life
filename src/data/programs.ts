import { encode, type Instruction } from '../core/isa'

export const DEMO: readonly Instruction[] = [
  { op: 'ADDI', rd: 1, rs1: 0, imm: 5 },
  { op: 'ADDI', rd: 2, rs1: 0, imm: 7 },
  { op: 'ADD', rd: 3, rs1: 1, rs2: 2 },
]
export const DEMO_WORDS = DEMO.map(encode)
export const ABI = ['zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2', 's0', 's1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 't3', 't4', 't5', 't6']
