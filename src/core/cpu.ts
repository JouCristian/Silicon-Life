import { decode, u32 } from './isa'
import type { CpuState, ExecutionTrace } from './trace/types'

export const MAX_STEPS = 1000

export function initialState(registers: readonly number[] = Array(32).fill(0)): CpuState {
  if (registers.length !== 32 || registers.some(n => !Number.isInteger(n) || n < -2147483648 || n > 4294967295))
    throw new Error('初始寄存器必须包含 32 个有效的 32 位整数')
  return Object.freeze({ pc: 0, registers: Object.freeze(registers.map((n, i) => i === 0 ? 0 : u32(n))), retired: 0, status: 'ready' })
}

/** One call commits exactly one architectural clock edge. No UI or timing dependencies. */
export function step(state: CpuState, program: readonly number[]): { state: CpuState; trace?: ExecutionTrace } {
  if (state.status !== 'ready') return { state }
  if (state.pc % 4 !== 0) return { state: Object.freeze({ ...state, status: 'fault', reason: '指令地址未按 4 字节对齐' }) }
  const word = program[state.pc / 4]
  if (word === undefined) return { state: Object.freeze({ ...state, status: 'halted', reason: '程序执行完成' }) }
  try {
    const instruction = Object.freeze(decode(word))
    const rs1_data = instruction.rs1 === 0 ? 0 : state.registers[instruction.rs1]
    // RTL reads instr[24:20] even for I-type; preserve that otherwise-unused signal.
    const rs2 = (word >>> 20) & 31
    const rs2_data = rs2 === 0 ? 0 : state.registers[rs2]
    // imm_gen is always wired with IMM_I for both implemented opcodes.
    const imm = u32(word >> 20)
    const alu_b = instruction.op === 'ADDI' ? imm : rs2_data
    const result = u32(rs1_data + alu_b)
    const registers = [...state.registers]
    if (instruction.rd !== 0) registers[instruction.rd] = result
    registers[0] = 0
    const nextPc = u32(state.pc + 4)
    const end = program[nextPc / 4] === undefined
    const after: CpuState = Object.freeze({ pc: nextPc, registers: Object.freeze(registers), retired: state.retired + 1,
      status: end ? 'halted' : 'ready', ...(end ? { reason: '程序执行完成' } : {}) })
    const trace: ExecutionTrace = Object.freeze({
      id: after.retired, instruction, word, before: state, after,
      signals: Object.freeze({ pc_value: state.pc, pc_plus4: nextPc, next_pc: nextPc, imem_addr: state.pc,
        imem_rdata: word, rs1_data, rs2_data, imm, alu_a: rs1_data, alu_b,
        alu_result: result, wb_data: result, reg_write: 1, rf_we: 1, alu_op: 0, alu_a_sel: 0,
        alu_b_imm: instruction.op === 'ADDI' ? 1 : 0, imm_sel: 0, wb_sel: 0,
        mem_read: 0, mem_write: 0, dmem_we: 0, dmem_wstrb: 0 }),
      write: Object.freeze({ rd: instruction.rd, value: result, committed: instruction.rd !== 0 }),
      phases: Object.freeze({ fetch: Object.freeze(['pc', 'imem'] as const),
        decode: Object.freeze(instruction.op === 'ADDI' ? ['decoder', 'regfile', 'imm'] as const : ['decoder', 'regfile'] as const),
        execute: Object.freeze(['regfile', 'mux', 'alu'] as const), memory: Object.freeze([]),
        writeback: Object.freeze(['alu', 'wb', 'regfile', 'pc'] as const) }),
    })
    return { state: after, trace }
  } catch (error) {
    return { state: Object.freeze({ ...state, status: 'fault', reason: error instanceof Error ? error.message : '译码失败' }) }
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
