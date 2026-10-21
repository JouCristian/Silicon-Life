import type { Instruction } from '../isa'
import { PHASES, type ModuleId, type Phase, type RouteId, type SignalSnapshot, type TraceTransfer } from './types'

export function transfersFor(instruction: Instruction, signals: SignalSnapshot): readonly TraceTransfer[] {
  const transfers: TraceTransfer[] = []
  const add = (id: RouteId, phase: Phase, from: ModuleId, to: ModuleId, signal: keyof SignalSnapshot, order: number, kind: TraceTransfer['kind'] = 'data') =>
    transfers.push(Object.freeze({ id, phase, from, to, signal, value: signals[signal], kind, order }))
  const mem = instruction.op === 'LW' || instruction.op === 'SW'
  add('imem_addr', 'fetch', 'pc', 'imem', 'imem_addr', 0)
  add('instr_rf', 'decode', 'imem', 'regfile', 'imem_rdata', 0)
  add('instr_decode', 'decode', 'imem', 'decoder', 'imem_rdata', 0)
  if (instruction.op !== 'ADD') add('instr_imm', 'decode', 'imem', 'imm', 'imem_rdata', 0)
  if (instruction.op === 'BEQ') {
    add('branch_inputs', 'execute', 'regfile', 'branch', 'rs1_data', 0)
    add('branch_b', 'execute', 'regfile', 'branch', 'rs2_data', 0)
    add('target', 'execute', 'pc', 'nextpc', 'pc_value', 0)
    add('branch_imm', 'execute', 'imm', 'nextpc', 'imm', 0)
    add('redirect', 'execute', 'branch', 'nextpc', 'redirect', 1, 'control')
  } else {
    add('alu_b_imm', 'decode', 'decoder', 'mux', 'alu_b_imm', 1, 'control')
    add('alu_a', 'execute', 'regfile', 'alu', 'alu_a', 0)
    add(instruction.op === 'ADD' ? 'rs2_data' : 'imm', 'execute', instruction.op === 'ADD' ? 'regfile' : 'imm', 'mux', 'alu_b', 0)
    add('alu_b', 'execute', 'mux', 'alu', 'alu_b', 1)
    if (mem) {
      add('mem_control', 'memory', 'decoder', 'dmem', instruction.op === 'LW' ? 'mem_read' : 'mem_write', 0, 'control')
      add('dmem_addr', 'memory', 'alu', 'dmem', 'dmem_addr', 0)
      if (instruction.op === 'SW') add('dmem_wdata', 'memory', 'regfile', 'dmem', 'dmem_wdata', 0)
      else add('dmem_rdata', 'memory', 'dmem', 'wb', 'load_data', 1)
    }
    if (signals.reg_write) {
      if (instruction.op !== 'LW') add('alu_result', 'writeback', 'alu', 'wb', 'alu_result', 0)
      add('wb_data', 'writeback', 'wb', 'regfile', 'wb_data', instruction.op === 'LW' ? 0 : 1, 'writeback')
    }
  }
  if (!signals.redirect) add('pc_plus4', 'writeback', 'pc', 'nextpc', 'pc_plus4', 0)
  add('next_pc', 'writeback', 'nextpc', 'pc', 'next_pc', signals.redirect ? 0 : 1, 'writeback')
  return Object.freeze(transfers)
}

export function phasesFor(transfers: readonly TraceTransfer[]) {
  return Object.freeze(Object.fromEntries(PHASES.map(phase => [phase, Object.freeze([...new Set(transfers.filter(t => t.phase === phase).flatMap(t => [t.from, t.to]))])])) as Record<Phase, readonly ModuleId[]>)
}
