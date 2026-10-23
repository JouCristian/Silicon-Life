import { ALU_LABELS } from '../../core/cpu'
import { hex } from '../../core/isa'
import type { CpuState, ExecutionTrace, ModuleId } from '../../core/trace/types'

export type ExplorerId = 'pc' | 'regfile' | 'alu'
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
    note: 'pc.v 内部仅为 32 位寄存器和同步复位。PC+4、分支/跳转选择与 Trap 保持来自 cpu_top；标为外部的逻辑在此作为输入上下文展示。',
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
    ...ALU_LABELS.map((op, i): ExploreNode => ({ id: `case-${i}`, title: op, value: s?.alu_op === i ? '当前 case 路径' : '',
      position: [i % 2 ? 1 : -.65, 1.75 - Math.floor(i / 2) * .84], width: 1.4, active: s?.alu_op === i })),
    { id: 'result', title: 'result [31:0]', value: value(s?.alu_result), position: [3.3, .4], active: !!s },
  ]
  return { nodes, wires: s ? [
    { from: 'a', to: `case-${s.alu_op}`, active: true }, { from: 'b', to: `case-${s.alu_op}`, active: true },
    { from: 'op', to: `case-${s.alu_op}`, active: true, kind: 'control' },
    { from: `case-${s.alu_op}`, to: 'result', active: true },
  ] : [], note: 'alu.v 的 case(op) 功能路径示意，非门级网表。移位取 b[4:0]；SLT/SRA 按有符号数处理，SLTU/SRL 按无符号数处理。显示值直接来自 Trace，不重新计算运算结果。分支指令由独立 Branch Unit 比较。' }
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
    { id: 'read-a', title: '异步读 A · rs1', value: s ? `x${rs1} → ${hex(s.rs1_data)}` : unknown, position: [-2.1, 2.35], width: 3.2, active: !!s },
    { id: 'read-b', title: '异步读 B · rs2', value: s ? `x${rs2} → ${hex(s.rs2_data)}` : unknown, position: [2.1, 2.35], width: 3.2, active: !!s },
    { id: 'write', title: '同步写 · clk↑ / we / rd', value: s ? `we=${s.rf_we} · x${rd} ← ${hex(s.wb_data)}${trace!.write.committed ? ' · 已提交' : rd === 0 && s.rf_we ? ' · x0 丢弃' : ' · 未写入'}` : unknown,
      position: [0, -2.35], width: 7.4, active: !!trace?.write.committed, kind: 'writeback' },
  )
  return { nodes, wires: trace ? [
    { from: `x${rs1}`, to: 'read-a', active: true }, { from: `x${rs2}`, to: 'read-b', active: true },
    ...(trace.write.committed ? [{ from: 'write', to: `x${rd}`, active: true, kind: 'writeback' as const }] : []),
  ] : [], note: 'regfile.v：32×32 位寄存器，双异步读、单同步写，无转发。格内值是指令提交前快照；写口展示该指令真实提交，提交后值见右侧信号。rs1/rs2 为原始指令端口，即使指令未使用该操作数也如实显示；x0 恒为 0。' }
}

/** ModuleId is the existing eleven-module topology contract. Add one definition
 * to extend the explorer; it never owns CPU execution or a separate Canvas. */
export const EXPLORERS = {
  pc: { title: 'PC', source: 'pc.v / cpu_top.v', build: pcModel },
  regfile: { title: 'Register File', source: 'regfile.v', build: registerModel },
  alu: { title: 'ALU', source: 'alu.v / cpu_defs.vh', build: aluModel },
} satisfies Partial<Record<ModuleId, ExplorerDefinition>>
export function isExplorable(id: ModuleId): id is ExplorerId { return Object.hasOwn(EXPLORERS, id) }
