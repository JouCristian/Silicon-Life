import { isRegisterAlu, type Instruction } from '../isa'
import { PHASES, type ModuleId, type Phase, type RouteId, type SignalSnapshot, type TraceTransfer } from './types'

export function transfersFor(instruction: Instruction, signals: SignalSnapshot): readonly TraceTransfer[] {
  const transfers: TraceTransfer[] = []
  const add = (id: RouteId, phase: Phase, from: ModuleId, to: ModuleId, signal: keyof SignalSnapshot, order: number, kind: TraceTransfer['kind'] = 'data') =>
    transfers.push(Object.freeze({ id, phase, from, to, signal, value: signals[signal], kind, order }))
  const mem = !!(signals.mem_read || signals.mem_write)
  const usesAlu = !!signals.alu_b_imm || isRegisterAlu(instruction.op)
  add('imem_addr', 'fetch', 'pc', 'imem', 'imem_addr', 0)
  if ((usesAlu && signals.alu_a_sel === 0) || signals.branch) add('instr_rf', 'decode', 'imem', 'regfile', 'imem_rdata', 0)
  add('instr_decode', 'decode', 'imem', 'decoder', 'imem_rdata', 0)
  if ('imm' in instruction) add('instr_imm', 'decode', 'imem', 'imm', 'imem_rdata', 0)
  if (signals.system_trap) return Object.freeze(transfers)
  if (signals.branch) {
    add('branch_inputs', 'execute', 'regfile', 'branch', 'rs1_data', 0)
    add('branch_b', 'execute', 'regfile', 'branch', 'rs2_data', 0)
    add('target', 'execute', 'pc', 'nextpc', 'pc_value', 0)
    add('branch_imm', 'execute', 'imm', 'nextpc', 'imm', 0)
    add('redirect', 'execute', 'branch', 'nextpc', 'redirect', 1, 'control')
  } else if (usesAlu) {
    add('alu_b_imm', 'decode', 'decoder', 'mux', 'alu_b_imm', 1, 'control')
    if (signals.alu_a_sel === 0) add('alu_a', 'execute', 'regfile', 'alu', 'alu_a', 0)
    add(signals.alu_b_imm ? 'imm' : 'rs2_data', 'execute', signals.alu_b_imm ? 'imm' : 'regfile', 'mux', 'alu_b', 0)
    add('alu_b', 'execute', 'mux', 'alu', 'alu_b', 1)
    if (mem) {
      add('mem_control', 'memory', 'decoder', 'dmem', signals.mem_read ? 'mem_read' : 'mem_write', 0, 'control')
      add('dmem_addr', 'memory', 'alu', 'dmem', 'dmem_addr', 0)
      if (signals.mem_write) add('dmem_wdata', 'memory', 'regfile', 'dmem', 'dmem_wdata', 0)
      else add('dmem_rdata', 'memory', 'dmem', 'wb', 'load_data', 1)
    }
  }
  if (signals.jump && !signals.jalr) {
    add('target', 'execute', 'pc', 'nextpc', 'pc_value', 0)
    add('branch_imm', 'execute', 'imm', 'nextpc', 'imm', 0)
  }
  if (signals.reg_write) {
    if (signals.wb_sel === 0) add('alu_result', 'writeback', 'alu', 'wb', 'alu_result', 0)
    add('wb_data', 'writeback', 'wb', 'regfile', 'wb_data', signals.wb_sel === 0 ? 1 : 0, 'writeback')
  }
  if (!signals.redirect) add('pc_plus4', 'writeback', 'pc', 'nextpc', 'pc_plus4', 0)
  add('next_pc', 'writeback', 'nextpc', 'pc', 'next_pc', signals.redirect ? 0 : 1, 'writeback')
  return Object.freeze(transfers)
}

export function phasesFor(transfers: readonly TraceTransfer[]) {
  return Object.freeze(Object.fromEntries(PHASES.map(phase => [phase, Object.freeze([...new Set(transfers.filter(t => t.phase === phase).flatMap(t => [t.from, t.to]))])])) as Record<Phase, readonly ModuleId[]>)
}
