import type { Instruction } from '../isa'
import type { DataMemory } from '../memory'
import type { DisplayState, DisplayWrite } from '../devices/logisimDisplay'

export const PHASES = ['fetch', 'decode', 'execute', 'memory', 'writeback'] as const
export type Phase = typeof PHASES[number]
export type ModuleId = 'pc' | 'imem' | 'decoder' | 'imm' | 'regfile' | 'mux' | 'alu' | 'wb' | 'dmem' | 'branch' | 'nextpc'
export const PHASE_LABELS: Record<Phase, string> = {
  fetch: '取指', decode: '译码', execute: '执行', memory: '访存', writeback: '写回',
}

export interface CpuState {
  readonly pc: number
  readonly registers: readonly number[]
  readonly memory: DataMemory
  readonly display: DisplayState
  readonly retired: number
  readonly status: 'ready' | 'halted' | 'fault'
  readonly reason?: string
  readonly fault?: { readonly source: 'rtl' | 'host'; readonly cause?: number }
}

/** Names/encodings are read from cpu_top.v / cpu_defs.vh. Software snapshots
 * model a ready core (reset=0); they are not a claim of RTL co-simulation. */
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
  readonly reg_write: 0 | 1
  readonly rf_we: 0 | 1
  readonly alu_op: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  readonly alu_a_sel: 0 | 1 | 2
  readonly alu_b_imm: 0 | 1
  readonly imm_sel: 0 | 1 | 2 | 3 | 4
  readonly wb_sel: 0 | 1 | 2
  readonly mem_read: 0 | 1
  readonly mem_write: 0 | 1
  readonly mem_size: 0 | 1 | 2
  readonly load_unsigned: 0 | 1
  readonly dmem_addr: number
  readonly dmem_wdata: number
  readonly dmem_rdata: number
  readonly load_data: number
  readonly dmem_we: 0 | 1
  readonly dmem_wstrb: number
  readonly branch: 0 | 1
  readonly branch_op: number
  readonly branch_taken: 0 | 1
  readonly redirect: 0 | 1
  readonly target: number
  readonly normal_next_pc: number
  readonly jump: 0 | 1
  readonly jalr: 0 | 1
  readonly illegal: 0 | 1
  readonly system_trap: 0 | 1
  readonly system_cause: 3 | 11
  readonly fault: 0 | 1
  readonly fault_cause: number
  readonly trap: 0 | 1
  readonly trap_cause: number
}

export type RouteId = 'imem_addr' | 'instr_rf' | 'instr_decode' | 'instr_imm' | 'alu_a' | 'rs2_data' | 'imm' | 'alu_b' | 'alu_result' | 'wb_data' | 'next_pc' | 'alu_b_imm' | 'dmem_addr' | 'dmem_wdata' | 'dmem_rdata' | 'branch_inputs' | 'branch_b' | 'redirect' | 'target' | 'branch_imm' | 'pc_plus4' | 'mem_control'
export interface TraceTransfer {
  readonly id: RouteId
  readonly phase: Phase
  readonly from: ModuleId
  readonly to: ModuleId
  readonly signal: keyof SignalSnapshot
  readonly value: number
  readonly kind: 'data' | 'control' | 'writeback'
  /** Causal groups, parallel transfers share an order. Teaching metadata, not RTL delays. */
  readonly order: number
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
  readonly transfers: readonly TraceTransfer[]
  /** Valid decoded system traps do not retire or perform writes. */
  readonly trap?: { readonly cause: number; readonly reason: string }
  /** Paths absent from the frozen teaching topology are disclosed, never
   * animated along an unrelated wire. Values remain available in signals. */
  readonly visualizationOmissions?: readonly string[]
  readonly memoryAccess?: { readonly kind: 'load' | 'store'; readonly address: number; readonly data: number; readonly byteStrobes: number; readonly width?: 8 | 16 | 32; readonly space: 'ram' | 'mmio' }
  /** Host peripheral metadata, not additional cpu_top.v control signals. */
  readonly mmioWrite?: DisplayWrite
}
