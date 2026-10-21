import type { Instruction } from '../isa'

export const PHASES = ['fetch', 'decode', 'execute', 'memory', 'writeback'] as const
export type Phase = typeof PHASES[number]
export type ModuleId = 'pc' | 'imem' | 'decoder' | 'imm' | 'regfile' | 'mux' | 'alu' | 'wb'
export const PHASE_LABELS: Record<Phase, string> = {
  fetch: '取指', decode: '译码', execute: '执行', memory: '访存', writeback: '写回',
}

export interface CpuState {
  readonly pc: number
  readonly registers: readonly number[]
  readonly retired: number
  readonly status: 'ready' | 'halted' | 'fault'
  readonly reason?: string
}

/** Names and encodings correspond to cpu_top.v / cpu_defs.vh. */
export interface SignalSnapshot {
  readonly pc_value: number
  readonly pc_plus4: number
  readonly next_pc: number
  readonly imem_addr: number
  readonly imem_rdata: number
  readonly rs1_data: number
  readonly rs2_data: number
  readonly imm: number
  readonly alu_a: number
  readonly alu_b: number
  readonly alu_result: number
  readonly wb_data: number
  readonly reg_write: 1
  readonly rf_we: 1
  readonly alu_op: 0
  readonly alu_a_sel: 0
  readonly alu_b_imm: 0 | 1
  readonly imm_sel: 0
  readonly wb_sel: 0
  readonly mem_read: 0
  readonly mem_write: 0
  readonly dmem_we: 0
  readonly dmem_wstrb: 0
}

export interface ExecutionTrace {
  readonly id: number
  readonly instruction: Instruction
  readonly word: number
  readonly before: CpuState
  readonly after: CpuState
  readonly signals: SignalSnapshot
  readonly write: { readonly rd: number; readonly value: number; readonly committed: boolean }
  readonly phases: Readonly<Record<Phase, readonly ModuleId[]>>
}

/** Future aligned little-endian data-memory adapter. No loads/stores execute in Sprint 01. */
export interface DataMemory {
  readWord(byteAddress: number): number
  writeWord(byteAddress: number, data: number, byteStrobes: number): void
}
