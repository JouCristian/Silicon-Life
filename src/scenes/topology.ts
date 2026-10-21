import type { ModuleId, RouteId } from '../core/trace/types'

export type Point = [number, number, number]
export const POSITIONS: Record<ModuleId, Point> = {
  pc: [-6.6, 0, 0], imem: [-4, 0, 0], decoder: [-1.3, 2.5, 0],
  regfile: [-1.3, 0, 0], imm: [-1.3, -2.2, 0], mux: [1.25, -1.5, 0],
  alu: [3.6, 0, 0], wb: [6.5, 0, 0], dmem: [3.6, -2.4, 0],
  branch: [1.3, 2.5, 0], nextpc: [-4.5, 3.2, 0],
}
export const MODULES: { id: ModuleId; title: string; sub: string; width: number }[] = [
  { id: 'pc', title: 'PC', sub: '程序计数器', width: 1.25 },
  { id: 'imem', title: 'Instruction', sub: '指令存储器', width: 2.25 },
  { id: 'decoder', title: 'Decoder', sub: '控制译码', width: 2.1 },
  { id: 'regfile', title: 'Register File', sub: '32 × 32 bit', width: 2.1 },
  { id: 'imm', title: 'Imm Gen', sub: '立即数生成', width: 2.1 },
  { id: 'mux', title: 'MUX', sub: 'ALU B 选择', width: 1.2 },
  { id: 'alu', title: 'ALU', sub: '算术逻辑单元', width: 1.9 },
  { id: 'wb', title: 'WB', sub: '写回选择', width: 1.2 },
  { id: 'dmem', title: 'Data Memory', sub: '外部数据内存', width: 2.1 },
  { id: 'branch', title: 'Branch Unit', sub: '独立比较器', width: 1.9 },
  { id: 'nextpc', title: 'Next PC', sub: 'PC+4 / PC+imm', width: 2.1 },
]
export interface WireDef { id: RouteId; points: Point[]; control?: boolean }
export const WIRES: WireDef[] = [
  { id: 'imem_addr', points: [[-5.97, 0, 0], [-5.13, 0, 0]] },
  { id: 'instr_rf', points: [[-2.87, 0, 0], [-2.35, 0, 0]] },
  { id: 'instr_decode', points: [[-3, .15, 0], [-2.65, .15, 0], [-2.65, 2.5, 0], [-2.35, 2.5, 0]] },
  { id: 'instr_imm', points: [[-3, -.15, 0], [-2.65, -.15, 0], [-2.65, -2.2, 0], [-2.35, -2.2, 0]] },
  { id: 'alu_a', points: [[-.25, .2, 0], [2.65, .2, 0]] },
  { id: 'rs2_data', points: [[-.25, -.25, 0], [.25, -.25, 0], [.25, -1.3, 0], [.65, -1.3, 0]] },
  { id: 'imm', points: [[-.25, -2.2, 0], [.25, -2.2, 0], [.25, -1.7, 0], [.65, -1.7, 0]] },
  { id: 'alu_b', points: [[1.85, -1.5, 0], [2.2, -1.5, 0], [2.2, -.25, 0], [2.65, -.25, 0]] },
  { id: 'alu_result', points: [[4.55, 0, 0], [5.9, 0, 0]] },
  { id: 'wb_data', points: [[6.5, -.7, 0], [6.5, -4.2, 0], [-2.45, -4.2, 0], [-2.45, -1, 0], [-1.3, -1, 0], [-1.3, -.7, 0]] },
  { id: 'target', points: [[-6.6, .65, 0], [-6.6, 3, 0], [-5.55, 3, 0]] },
  { id: 'pc_plus4', points: [[-6.3, .65, 0], [-6.3, 3.4, 0], [-5.55, 3.4, 0]] },
  { id: 'next_pc', points: [[-4.5, 3.85, 0], [-4.5, 4.5, 0], [-7.6, 4.5, 0], [-7.6, 0, 0], [-7.225, 0, 0]] },
  { id: 'alu_b_imm', points: [[-.25, 2.5, 0], [.1, 2.5, 0], [.1, .8, 0], [1.25, .8, 0], [1.25, -.85, 0]], control: true },
  { id: 'dmem_addr', points: [[3.6, -.65, 0], [3.6, -1.75, 0]] },
  { id: 'dmem_wdata', points: [[-.7, -.65, 0], [-.7, -1.1, 0], [.45, -1.1, 0], [.45, -3.45, 0], [3.6, -3.45, 0], [3.6, -3.05, 0]] },
  { id: 'dmem_rdata', points: [[4.65, -2.4, 0], [6.5, -2.4, 0], [6.5, -.65, 0]] },
  { id: 'branch_inputs', points: [[-1.5, .65, 0], [-1.5, 1.25, 0], [.95, 1.25, 0], [.95, 1.85, 0]] },
  { id: 'branch_b', points: [[-1.1, .65, 0], [-1.1, 1, 0], [1.65, 1, 0], [1.65, 1.85, 0]] },
  { id: 'redirect', points: [[2.25, 2.5, 0], [2.6, 2.5, 0], [2.6, 4.2, 0], [-3.15, 4.2, 0], [-3.15, 3.2, 0], [-3.45, 3.2, 0]], control: true },
  { id: 'branch_imm', points: [[-.25, -2.4, 0], [-.05, -2.4, 0], [-.05, 3.65, 0], [-3.45, 3.65, 0]] },
  { id: 'mem_control', points: [[-.25, 2.7, 0], [.1, 2.7, 0], [.1, 3.7, 0], [5.3, 3.7, 0], [5.3, -2.6, 0], [4.65, -2.6, 0]], control: true },
]
