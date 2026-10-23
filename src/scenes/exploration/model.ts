import { ALU_LABELS } from '../../core/cpu'
import { hex } from '../../core/isa'
import type { CpuState, ExecutionTrace, ModuleId } from '../../core/trace/types'
import { branchModel, dataMemoryModel, decoderModel, immediateModel, instructionMemoryModel, muxModel, nextPcModel, writebackModel } from './remainingModels'

export type ExplorerId = ModuleId
export interface ExploreNode {
  id: string; title: string; value: string; position: [number, number]; width?: number
  active?: boolean; kind?: 'data' | 'control' | 'writeback'
}
export interface ExploreWire { from: string; to: string; kind?: ExploreNode['kind']; active: boolean }
export interface ModuleExploration { nodes: ExploreNode[]; wires: ExploreWire[]; note: string }
interface ExplorerDefinition {
  title: string; source: string; build: (cpu: CpuState, trace?: ExecutionTrace) => ModuleExploration
}
const unknown = '等待执行 Trace'
const value = (n: number | undefined) => n === undefined ? unknown : hex(n)

function pcModel(cpu: CpuState, trace?: ExecutionTrace): ModuleExploration {
  const s = trace?.signals
  return {
    note: 'pc.v 内部只有一个 32 位寄存器：clk 上升沿把 D=next_pc 写入 Q=pc；同步 reset 优先，把 Q 清零。PC+4、分支/跳转目标、外部选择与 Trap/fault 保持属于 cpu_top，在本视图中作为右侧外部上下文展示，不计入 pc.v。',
    nodes: [
      { id: 'pc4', title: '外部 PC+4', value: value(s?.pc_plus4), position: [-3.1, 1.2], active: !!s && !s.redirect },
      { id: 'target', title: '外部分支 / 跳转目标', value: value(s?.target), position: [-3.1, -.2], active: !!s?.redirect },
      { id: 'select', title: '外部选择 redirect', value: s ? `${s.redirect} · ${s.jump ? '跳转' : s.branch ? '分支' : '顺序'}` : unknown, position: [-1.1, .5], active: !!s, kind: 'control' },
      { id: 'd', title: 'D · next_pc', value: value(s?.next_pc), position: [1, .5], active: !!s },
      { id: 'q', title: 'Q · pc [31:0]', value: value(s?.pc_value ?? cpu.pc), position: [3.1, .5], active: true },
      { id: 'edge', title: '同步上升沿后 Q', value: trace ? hex(trace.after.pc) : '尚未提交指令', position: [2.1, -1.3], width: 2.4, active: !!trace, kind: 'writeback' },
      { id: 'reset', title: '同步 reset 优先', value: 'reset → PC=0；否则 D→Q', position: [-1.5, -1.3], width: 3.1, kind: 'control' },
      { id: 'hold', title: '外部 Trap / fault 保持', value: s ? `${s.trap} · 实际提交 PC ${hex(trace!.after.pc)}` : unknown, position: [0, -2.35], width: 4, active: !!s?.trap, kind: 'control' },
    ],
    wires: [
      { from: 'pc4', to: 'select', active: !!s && !s.redirect }, { from: 'target', to: 'select', active: !!s?.redirect },
      { from: 'select', to: 'd', active: !!s }, { from: 'd', to: 'q', active: !!s && !s.trap },
      { from: 'q', to: 'edge', active: !!trace, kind: 'writeback' },
    ],
  }
}
function aluModel(_cpu: CpuState, trace?: ExecutionTrace): ModuleExploration {
  const s = trace?.signals
  // These are RTL case arms, not a claim of ten separately synthesized units.
  const nodes: ExploreNode[] = [
    { id: 'a', title: 'a [31:0]', value: value(s?.alu_a), position: [-3.3, 1.2], active: !!s },
    { id: 'b', title: 'b [31:0]', value: value(s?.alu_b), position: [-3.3, -.15], active: !!s },
    { id: 'op', title: 'op [3:0]', value: s ? `${s.alu_op} · ${ALU_LABELS[s.alu_op]}` : unknown, position: [-3.3, -1.5], active: !!s, kind: 'control' },
    { id: 'shift', title: 'b[4:0] 移位量', value: s ? `${s.alu_b & 31} · ${(s.alu_b & 31).toString(2).padStart(5, '0')}` : unknown, position: [-3.3, -2.5], active: !!s && [2, 6, 7].includes(s.alu_op), kind: 'control' },
    ...ALU_LABELS.map((op, i): ExploreNode => ({ id: `case-${i}`, title: op, value: s?.alu_op === i ? '当前 case 路径' : '',
      position: [i % 2 ? 1 : -.65, 1.75 - Math.floor(i / 2) * .84], width: 1.4, active: s?.alu_op === i })),
    { id: 'result', title: 'result [31:0]', value: value(s?.alu_result), position: [3.3, .4], active: !!s },
  ]
  return { nodes, wires: s ? [
    { from: 'a', to: `case-${s.alu_op}`, active: true }, { from: 'b', to: `case-${s.alu_op}`, active: true },
    { from: 'op', to: `case-${s.alu_op}`, active: true, kind: 'control' },
    { from: `case-${s.alu_op}`, to: 'result', active: true },
  ] : [], note: 'alu.v 是纯组合 case(op)：ADD/SUB 算术，XOR/OR/AND 逻辑，SLL/SRL/SRA 移位，SLT/SLTU 比较。十个 case 臂按功能分组；当前路径由 Trace.alu_op 选中。移位量只取 b[4:0]；SLT 与 SRA 按有符号处理，SLTU 与 SRL 按无符号处理。显示值直接来自 Trace，不重新计算。ALU 无 clk、无内部寄存器；结果去向是 WB / DMEM / Next PC。' }
}
function registerModel(cpu: CpuState, trace?: ExecutionTrace): ModuleExploration {
  const s = trace?.signals, before = trace?.before.registers ?? cpu.registers
  const rs1 = trace ? trace.word >>> 15 & 31 : undefined, rs2 = trace ? trace.word >>> 20 & 31 : undefined
  const rd = trace ? trace.word >>> 7 & 31 : undefined
  const nodes: ExploreNode[] = before.map((word, i) => ({ id: `x${i}`, title: `x${i}${i === 0 ? ' · 恒零' : ''}`, value: hex(word),
    position: [(i % 8 - 3.5) * 1.02, 1.15 - Math.floor(i / 8) * .8], width: .96,
    active: i === rs1 || i === rs2 || !!trace?.write.committed && i === rd,
    kind: trace?.write.committed && i === rd ? 'writeback' : 'data' }))
  nodes.push(
    { id: 'word', title: 'instr[31:0]', value: trace ? hex(trace.word) : unknown, position: [-3.2, 1.1], width: 2.6, active: !!s },
    { id: 'rs1', title: 'rs1 [4:0] · 读地址 A', value: s && rs1 !== undefined ? `x${rs1} · ${rs1.toString(2).padStart(5, '0')}` : unknown, position: [-3.2, 2.1], width: 2.6, active: !!s, kind: 'control' },
    { id: 'rs2', title: 'rs2 [4:0] · 读地址 B', value: s && rs2 !== undefined ? `x${rs2} · ${rs2.toString(2).padStart(5, '0')}` : unknown, position: [3.2, 2.1], width: 2.6, active: !!s, kind: 'control' },
    { id: 'rd', title: 'rd [4:0] · 写地址', value: s && rd !== undefined ? `x${rd} · ${rd.toString(2).padStart(5, '0')}` : unknown, position: [0, -2.2], width: 2.6, active: !!s, kind: 'control' },
    { id: 'rd-data', title: 'rd_data = wb_data', value: s ? hex(s.wb_data) : unknown, position: [2.8, -2.2], width: 2.6, active: !!s, kind: 'writeback' },
    { id: 'reg-write', title: 'reg_write · Decoder 请求', value: s ? `${s.reg_write}` : unknown, position: [-3.2, -2.2], width: 2.6, active: !!s, kind: 'control' },
    { id: 'we', title: 'we 端口 = rf_we', value: s ? `${s.rf_we}` : unknown, position: [-3.2, -3.2], width: 2.6, active: !!s, kind: 'control' },
    { id: 'read-a', title: '异步读 A · rs1', value: s ? `x${rs1} → ${hex(s.rs1_data)}` : unknown, position: [-2.1, 2.35], width: 3.2, active: !!s },
    { id: 'read-b', title: '异步读 B · rs2', value: s ? `x${rs2} → ${hex(s.rs2_data)}` : unknown, position: [2.1, 2.35], width: 3.2, active: !!s },
    { id: 'write', title: '同步写 · clk↑ / we / rd', value: s ? `we=${s.rf_we} · x${rd} ← ${hex(s.wb_data)}${trace!.write.committed ? ' · 已提交' : rd === 0 && s.rf_we ? ' · x0 丢弃' : ' · 未写入'}` : unknown,
      position: [0, -2.35], width: 7.4, active: !!trace?.write.committed, kind: 'writeback' },
  )
  return { nodes, wires: trace ? [
    { from: `x${rs1}`, to: 'read-a', active: true }, { from: `x${rs2}`, to: 'read-b', active: true },
    ...(trace.write.committed ? [{ from: 'write', to: `x${rd}`, active: true, kind: 'writeback' as const }] : []),
  ] : [], note: 'regfile.v：32×32 位寄存器，双异步组合读、单同步写，无转发。每个寄存器格内是 32 个 bit 活动条，点击寄存器可查看完整当前值（指令提交前快照）与本指令读写状态。写口展示该指令真实提交，下一条单步后阵列值更新。rs1/rs2 为原始指令端口，即使指令未使用该操作数也如实显示；x0 恒为 0。regfile 的 we 端口就是 cpu_top 的 rf_we；顶层门控 reg_write && !reset && !trap && !fault 在模块外完成，regfile 内部没有第二级门控。' }
}

/** ModuleId is the existing eleven-module topology contract. Add one definition
 * to extend the explorer; it never owns CPU execution or a separate Canvas. */
export const EXPLORERS = {
  pc: { title: 'PC', source: 'pc.v / cpu_top.v', build: pcModel },
  regfile: { title: 'Register File', source: 'regfile.v', build: registerModel },
  alu: { title: 'ALU', source: 'alu.v / cpu_defs.vh', build: aluModel },
  imem: { title: 'Instruction Memory', source: 'cpu_top.v imem 接口 / 宿主 ROM', build: instructionMemoryModel },
  decoder: { title: 'Decoder', source: 'decoder.v / cpu_defs.vh', build: decoderModel },
  imm: { title: 'Imm Gen', source: 'imm_gen.v / cpu_defs.vh', build: immediateModel },
  mux: { title: 'MUX', source: 'cpu_top.v · ALU B 组合选择', build: muxModel },
  branch: { title: 'Branch Unit', source: 'branch_unit.v / cpu_top.v', build: branchModel },
  dmem: { title: 'Data Memory', source: 'cpu_top.v dmem 接口 / 宿主 RAM 与 MMIO', build: dataMemoryModel },
  wb: { title: 'WB', source: 'cpu_top.v · 组合写回选择', build: writebackModel },
  nextpc: { title: 'Next PC', source: 'cpu_top.v · 组合 PC 控制', build: nextPcModel },
} satisfies Record<ModuleId, ExplorerDefinition>
export function isExplorable(id: ModuleId): id is ExplorerId { return Object.hasOwn(EXPLORERS, id) }
