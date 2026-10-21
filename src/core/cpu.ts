import { decode, immediate, u32 } from './isa'
import { createMemory, readWord, writeWord, type DataMemory } from './memory'
import { phasesFor, transfersFor } from './trace/transfers'
import type { CpuState, ExecutionTrace } from './trace/types'

export const MAX_STEPS = 1000

export function initialState(registers: readonly number[] = Array(32).fill(0), memory: DataMemory = createMemory()): CpuState {
  if (registers.length !== 32 || registers.some(n => !Number.isInteger(n) || n < -2147483648 || n > 4294967295))
    throw new Error('初始寄存器必须包含 32 个有效的 32 位整数')
  return Object.freeze({ pc: 0, registers: Object.freeze(registers.map((n, i) => i === 0 ? 0 : u32(n))), memory: createMemory(memory), retired: 0, status: 'ready' })
}

function fault(state: CpuState, reason: string, source: 'rtl' | 'host', cause?: number) {
  return { state: Object.freeze({ ...state, status: 'fault' as const, reason, fault: Object.freeze({ source, cause }) }) }
}

/** One call commits exactly one architectural clock edge. No UI or timing dependencies. */
export function step(state: CpuState, program: readonly number[]): { state: CpuState; trace?: ExecutionTrace } {
  if (state.status !== 'ready') return { state }
  if (state.pc % 4 !== 0) return fault(state, '指令地址未按 4 字节对齐', 'rtl', 0)
  const word = program[state.pc / 4]
  if (word === undefined) return { state: Object.freeze({ ...state, status: 'halted', reason: '程序执行完成' }) }
  try {
    const instruction = Object.freeze(decode(word))
    const rs1_data = instruction.rs1 === 0 ? 0 : state.registers[instruction.rs1]
    // RTL reads instr[24:20] even for I-type; preserve that otherwise-unused signal.
    const rs2 = (word >>> 20) & 31
    const rs2_data = rs2 === 0 ? 0 : state.registers[rs2]
    const isLoad = instruction.op === 'LW', isStore = instruction.op === 'SW'
    const isMemory = isLoad || isStore, isBranch = instruction.op === 'BEQ'
    const imm = u32(immediate(word, isStore ? 'S' : isBranch ? 'B' : 'I'))
    const alu_b_imm = instruction.op === 'ADDI' || isMemory ? 1 : 0
    const alu_b = alu_b_imm ? imm : rs2_data
    const result = u32(rs1_data + alu_b)
    const pcPlus4 = u32(state.pc + 4)
    const target = u32(state.pc + imm)
    const branchTaken = !isMemory && rs1_data === rs2_data ? 1 : 0 // branch_op is raw funct3; 010 defaults to false.
    const redirect = isBranch && branchTaken ? 1 : 0
    const nextPc = redirect ? target : pcPlus4
    // Validate all side effects before publishing the architectural edge.
    if (redirect && target % 4) return fault(state, '分支目标未按 4 字节对齐', 'rtl', 0)
    if (isMemory && result % 4) return fault(state, `${isLoad ? 'LW' : 'SW'} 地址未按 4 字节对齐`, 'rtl', isLoad ? 4 : 6)
    if (isMemory && result + 3 >= state.memory.length) return fault(state, '数据地址超出宿主内存范围', 'host')
    const aligned = result - (result % 4)
    const dmem_rdata = aligned + 3 < state.memory.length ? readWord(state.memory, aligned) : 0
    const laneShift = (result % 4) * 8
    const load_data = isMemory ? dmem_rdata : u32(((dmem_rdata >>> laneShift) << 24) >> 24)
    const wb_data = isMemory ? load_data : result
    const reg_write = isBranch || isStore ? 0 : 1
    const rd = (word >>> 7) & 31 // SW / BEQ still drive the raw port; write enable is 0.
    const dmem_wdata = u32(rs2_data << laneShift)
    const memory = isStore ? writeWord(state.memory, result, dmem_wdata, 15) : state.memory
    const registers = [...state.registers]
    if (reg_write && rd !== 0) registers[rd] = wb_data
    registers[0] = 0
    const end = program[nextPc / 4] === undefined
    const after: CpuState = Object.freeze({ pc: nextPc, registers: Object.freeze(registers), memory, retired: state.retired + 1,
      status: end ? 'halted' : 'ready', ...(end ? { reason: '程序执行完成' } : {}) })
    const signals = Object.freeze({ pc_value: state.pc, pc_plus4: pcPlus4, next_pc: nextPc, imem_addr: state.pc,
        imem_rdata: word, rs1_data, rs2_data, imm, alu_a: rs1_data, alu_b,
        alu_result: result, wb_data, reg_write, rf_we: reg_write, alu_op: 0 as const, alu_a_sel: 0 as const,
        alu_b_imm, imm_sel: isStore ? 1 as const : isBranch ? 2 as const : 0 as const, wb_sel: isMemory ? 1 as const : 0 as const,
        mem_read: isLoad ? 1 as const : 0 as const, mem_write: isStore ? 1 as const : 0 as const,
        mem_size: isMemory ? 2 as const : 0 as const, load_unsigned: 0 as const,
        dmem_addr: result, dmem_wdata, dmem_rdata, load_data,
        dmem_we: isStore ? 1 as const : 0 as const, dmem_wstrb: isStore ? 15 as const : 0 as const,
        branch: isBranch ? 1 as const : 0 as const, branch_op: (word >>> 12) & 7, branch_taken: branchTaken,
        redirect, target, normal_next_pc: nextPc })
    const transfers = transfersFor(instruction, signals)
    const trace: ExecutionTrace = Object.freeze({
      id: after.retired, instruction, word, before: state, after, signals, transfers,
      write: Object.freeze({ rd, value: wb_data, committed: !!reg_write && rd !== 0 }),
      phases: phasesFor(transfers),
      ...(isMemory ? { memoryAccess: Object.freeze({ kind: isLoad ? 'load' as const : 'store' as const, address: result, data: isLoad ? load_data : dmem_wdata, byteStrobes: isStore ? 15 : 0 }) } : {}),
    })
    return { state: after, trace }
  } catch (error) {
    return fault(state, error instanceof Error ? error.message : '译码失败', 'host')
  }
}

export function run(state: CpuState, program: readonly number[], maxSteps = MAX_STEPS) {
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > MAX_STEPS) throw new Error(`步数限制必须为 1–${MAX_STEPS}`)
  const traces: ExecutionTrace[] = []
  let current = state
  for (let n = 0; n < maxSteps && current.status === 'ready'; n++) {
    const result = step(current, program)
    current = result.state
    if (result.trace) traces.push(result.trace)
  }
  if (current.status === 'ready') current = Object.freeze({ ...current, status: 'halted', reason: `已达到最大执行步数 ${maxSteps}` })
  return { state: current, traces: Object.freeze(traces) }
}
