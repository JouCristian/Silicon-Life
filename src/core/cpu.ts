import { decode, immediate, u32 } from './isa'
import { createMemory, readWord, writeWord, type DataMemory } from './memory'
import { phasesFor, transfersFor } from './trace/transfers'
import type { CpuState, ExecutionTrace, SignalSnapshot } from './trace/types'

export const MAX_STEPS = 1000
export const ALU_LABELS = ['ADD', 'SUB', 'SLL', 'SLT', 'SLTU', 'XOR', 'SRL', 'SRA', 'OR', 'AND'] as const
export function initialState(registers: readonly number[] = Array(32).fill(0), memory: DataMemory = createMemory()): CpuState {
  if (registers.length !== 32 || registers.some(n => !Number.isInteger(n) || n < -2147483648 || n > 4294967295)) throw new Error('初始寄存器必须包含 32 个有效的 32 位整数')
  return Object.freeze({ pc: 0, registers: Object.freeze(registers.map((n, i) => i === 0 ? 0 : u32(n))), memory: createMemory(memory), retired: 0, status: 'ready' })
}
function fault(state: CpuState, reason: string, source: 'rtl' | 'host', cause?: number) {
  return { state: Object.freeze({ ...state, status: 'fault' as const, reason, fault: Object.freeze({ source, cause }) }) }
}
function alu(op: SignalSnapshot['alu_op'], a: number, b: number): number {
  switch (op) {
    case 0: return u32(a + b)
    case 1: return u32(a - b)
    case 2: return u32(a << (b & 31))
    case 3: return (a | 0) < (b | 0) ? 1 : 0
    case 4: return a < b ? 1 : 0
    case 5: return u32(a ^ b)
    case 6: return a >>> (b & 31)
    case 7: return u32((a | 0) >> (b & 31))
    case 8: return u32(a | b)
    case 9: return u32(a & b)
  }
}
function compare(f3: number, a: number, b: number): boolean {
  switch (f3) {
    case 0: return a === b
    case 1: return a !== b
    case 4: return (a | 0) < (b | 0)
    case 5: return (a | 0) >= (b | 0)
    case 6: return a < b
    case 7: return a >= b
    default: return false
  }
}

/** Exactly one architectural edge, or an atomic non-retiring trap. */
export function step(state: CpuState, program: ArrayLike<number>): { state: CpuState; trace?: ExecutionTrace } {
  if (state.status !== 'ready') return { state }
  if (!Number.isInteger(state.pc) || state.pc < 0 || state.pc > 0xffffffff) return fault(state, 'PC 超出 32 位地址范围', 'host')
  if (state.pc % 4) return fault(state, '指令地址未按 4 字节对齐', 'rtl', 0)
  const word = program[state.pc / 4]
  if (word === undefined) return { state: Object.freeze({ ...state, status: 'halted', reason: '程序执行完成' }) }
  let instruction: ReturnType<typeof decode>
  try { instruction = Object.freeze(decode(word)) }
  catch (error) { return fault(state, `PC ${'0x' + state.pc.toString(16).padStart(8, '0')} · ${(error as Error).message}`, 'rtl', 2) }
  const opcode = word & 127, f3 = word >>> 12 & 7
  // Raw ports remain meaningful even when an instruction does not use rs1/rs2.
  const rs1 = word >>> 15 & 31, rs2 = word >>> 20 & 31
  const rs1_data = rs1 === 0 ? 0 : state.registers[rs1], rs2_data = rs2 === 0 ? 0 : state.registers[rs2]
  const load = opcode === 3, store = opcode === 0x23, branch = opcode === 0x63
  const upper = opcode === 0x37 || opcode === 0x17, jump = opcode === 0x6f || opcode === 0x67, jalr = opcode === 0x67
  const arithmetic = opcode === 0x13 || opcode === 0x33
  const system = instruction.op === 'ECALL' || instruction.op === 'EBREAK'
  const reg_write = load || upper || jump || arithmetic ? 1 as const : 0 as const
  const alu_b_imm = load || store || upper || jalr || opcode === 0x13 ? 1 as const : 0 as const
  const imm_sel = store ? 1 as const : branch ? 2 as const : upper ? 3 as const : opcode === 0x6f ? 4 as const : 0 as const
  const imm = u32(immediate(word, (['I', 'S', 'B', 'U', 'J'] as const)[imm_sel]))
  const alu_a_sel = opcode === 0x37 ? 2 as const : opcode === 0x17 ? 1 as const : 0 as const
  const alu_a = alu_a_sel === 2 ? 0 : alu_a_sel === 1 ? state.pc : rs1_data
  const alu_b = alu_b_imm ? imm : rs2_data
  const alu_op: SignalSnapshot['alu_op'] = !arithmetic ? 0 : f3 === 0 ? opcode === 0x33 && (word & 0x40000000) ? 1 : 0 : f3 === 5 ? word & 0x40000000 ? 7 : 6 : ([0, 2, 3, 4, 5, 6, 8, 9] as const)[f3]
  const result = alu(alu_op, alu_a, alu_b), pcPlus4 = u32(state.pc + 4)
  const target = jalr ? u32(result & ~1) : u32(state.pc + imm)
  const branch_taken = compare(f3, rs1_data, rs2_data) ? 1 as const : 0 as const
  const redirect = jump || branch && branch_taken ? 1 as const : 0 as const
  const normal_next_pc = redirect ? target : pcPlus4
  const mem_size = load || store ? (f3 & 3) as 0 | 1 | 2 : 0
  const load_unsigned = (load || store) && (f3 & 4) ? 1 as const : 0 as const
  const bytes = 1 << mem_size
  // All faults are checked before either memory or a register can be written.
  if (!system && redirect && target % 4) return fault(state, '指令目标地址未按 4 字节对齐', 'rtl', 0)
  if ((load || store) && result % bytes) return fault(state, `${instruction.op} 地址未按 ${bytes} 字节对齐`, 'rtl', load ? 4 : 6)
  if ((load || store) && result + bytes > state.memory.length) return fault(state, '数据地址超出宿主内存范围', 'host')
  const aligned = result - result % 4, lane = result % 4, laneShift = lane * 8
  const dmem_rdata = aligned + 3 < state.memory.length ? readWord(state.memory, aligned) : 0
  const shifted = dmem_rdata >>> laneShift
  const load_data = mem_size === 2 ? shifted : mem_size === 1 ? load_unsigned ? shifted & 65535 : u32(shifted << 16 >> 16) : load_unsigned ? shifted & 255 : u32(shifted << 24 >> 24)
  const wb_sel = load || store ? 1 as const : jump ? 2 as const : 0 as const
  const wb_data = wb_sel === 1 ? load_data : wb_sel === 2 ? pcPlus4 : result
  const dmem_wdata = u32(rs2_data << laneShift)
  const dmem_wstrb = store ? ((1 << bytes) - 1) << lane : 0
  const rd = word >>> 7 & 31
  let after: CpuState
  let trapInfo: ExecutionTrace['trap']
  const system_cause = instruction.op === 'EBREAK' ? 3 as const : 11 as const
  if (system) {
    const reason = `${instruction.op} · cause=${system_cause}：教学模拟器停止（无操作系统/异常向量，需复位）`
    after = fault(state, reason, 'rtl', system_cause).state
    trapInfo = Object.freeze({ cause: system_cause, reason })
  } else {
    const memory = store ? writeWord(state.memory, aligned, dmem_wdata, dmem_wstrb) : state.memory
    const registers = [...state.registers]
    if (reg_write && rd !== 0) registers[rd] = wb_data
    registers[0] = 0
    const end = program[normal_next_pc / 4] === undefined
    after = Object.freeze({ pc: normal_next_pc, registers: Object.freeze(registers), memory, retired: state.retired + 1,
      status: end ? 'halted' : 'ready', ...(end ? { reason: '程序执行完成' } : {}) })
  }
  const signals: SignalSnapshot = Object.freeze({ pc_value: state.pc, pc_plus4: pcPlus4, next_pc: after.pc,
    imem_addr: state.pc, imem_rdata: word, rs1_data, rs2_data, imm, alu_a, alu_b, alu_result: result, wb_data,
    reg_write, rf_we: system ? 0 : reg_write, alu_op, alu_a_sel, alu_b_imm, imm_sel, wb_sel,
    mem_read: load ? 1 : 0, mem_write: store ? 1 : 0, mem_size, load_unsigned,
    dmem_addr: result, dmem_wdata, dmem_rdata, load_data, dmem_we: store ? 1 : 0, dmem_wstrb,
    branch: branch ? 1 : 0, branch_op: f3, branch_taken, redirect, target, normal_next_pc,
    jump: jump ? 1 : 0, jalr: jalr ? 1 : 0, illegal: 0, system_trap: system ? 1 : 0, system_cause,
    fault: system ? 1 : 0, fault_cause: system ? system_cause : 0, trap: system ? 1 : 0, trap_cause: system ? system_cause : 0 })
  const transfers = transfersFor(instruction, signals)
  const omissions = [
    ...(upper ? ['ALU A 的 PC/零源选择未在冻结教学板单独布线'] : []),
    ...(jump ? ['PC+4 到 WB_PC4 的专用线及跳转控制未单独布线'] : []),
    ...(jalr ? ['JALR 的 ALU 到 Next PC 目标通路未单独布线'] : []),
  ]
  return { state: after, trace: Object.freeze({ id: state.retired + 1, instruction, word, before: state, after, signals,
    write: Object.freeze({ rd, value: wb_data, committed: !system && !!reg_write && rd !== 0 }),
    transfers, phases: phasesFor(transfers), ...(trapInfo ? { trap: trapInfo } : {}),
    ...(omissions.length ? { visualizationOmissions: Object.freeze(omissions) } : {}),
    ...(load || store ? { memoryAccess: Object.freeze({ kind: load ? 'load' as const : 'store' as const, address: result,
      data: load ? load_data : u32(rs2_data & (bytes === 4 ? 0xffffffff : (1 << bytes * 8) - 1)), byteStrobes: dmem_wstrb, width: (bytes * 8) as 8 | 16 | 32 }) } : {}) }) }
}
export function run(state: CpuState, program: ArrayLike<number>, maxSteps = MAX_STEPS) {
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > MAX_STEPS) throw new Error(`步数限制必须为 1–${MAX_STEPS}`)
  const traces: ExecutionTrace[] = []
  let current = state
  for (let n = 0; n < maxSteps && current.status === 'ready'; n++) {
    const result = step(current, program); current = result.state
    if (result.trace) traces.push(result.trace)
  }
  if (current.status === 'ready') current = Object.freeze({ ...current, status: 'halted', reason: `已达到最大执行步数 ${maxSteps}` })
  return { state: current, traces: Object.freeze(traces) }
}
