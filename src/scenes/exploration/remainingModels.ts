import { hex } from '../../core/isa'
import { readWord } from '../../core/memory'
import type { CpuState, ExecutionTrace } from '../../core/trace/types'
import type { ExploreNode, ModuleExploration } from './model'

const pending = '等待执行 Trace'
const value = (n: number | undefined) => n === undefined ? pending : hex(n)

export function instructionMemoryModel(cpu: CpuState, trace?: ExecutionTrace): ModuleExploration {
  const s = trace?.signals, address = s?.imem_addr ?? cpu.pc
  return {
    note: 'cpu_top.v 只提供 imem_addr / imem_rdata 接口；指令 ROM 是宿主 InstructionROM，不是 RTL 内部存储阵列。字节地址除以 4 对应 32 位字索引，空洞由导入器补零。这里没有独立 Instruction Register，也没有取指时钟锁存：imem_rdata 组合直送 Decoder / RF / Imm。输出与字段只观察已执行 Trace 或当前 ROM 内容，不重新执行或新增译码结果。',
    nodes: [
      { id: 'address', title: 'imem_addr · 字节地址', value: hex(address), position: [-3.1, 1], width: 2.2, active: true },
      { id: 'index', title: '宿主 ROM 字索引', value: address % 4 ? '未对齐，不能索引' : String(address / 4), position: [-3.1, -1], width: 2.2, active: !!s },
      { id: 'rom', title: '外部 InstructionROM', value: s ? `[${address / 4}] = ${hex(s.imem_rdata)}` : pending, position: [0, 0], width: 3.2, active: !!s },
      { id: 'word', title: 'imem_rdata [31:0]', value: value(s?.imem_rdata), position: [3.1, 1], width: 2.2, active: !!s },
      { id: 'fields', title: '送往 Decoder / RF / Imm', value: trace ? `opcode=${(trace.word & 127).toString(2).padStart(7, '0')}` : pending, position: [2.6, -1], width: 3, active: !!s },
      { id: 'policy', title: '宿主存储策略（非信号）', value: 'ROM 只读；运行 RAM 写入不改写 ROM', position: [0, -2.2], width: 6.4 },
    ],
    wires: [
      { from: 'address', to: 'index', active: !!s }, { from: 'index', to: 'rom', active: !!s },
      { from: 'rom', to: 'word', active: !!s }, { from: 'word', to: 'fields', active: !!s },
    ],
  }
}

export function decoderModel(_cpu: CpuState, trace?: ExecutionTrace): ModuleExploration {
  const s = trace?.signals
  return {
    note: 'decoder.v 是纯组合 case(opcode)，没有 clk、没有状态寄存器，也不是多周期状态机。reg_write 只是 Decoder 发出的请求；真正的 rf_we 由 cpu_top 再与 !reset、!trap、!fault 门控，二者必须分开看。典型差异：ADDI/ADD 都走 ALU+WB，ADDI 用 IMM_I 且 alu_b_imm=1；LW 用 MEM 读与 WB_MEM；SW 用 MEM 写且 reg_write=0；BEQ 置 branch 并使用 IMM_B；JAL 置 jump、IMM_J 与 WB_PC4。字段从 Trace.word 切片，控制值直接取 Trace；无 Trace 的非法指令未采样，不能从上一条有效 Trace 冒造其译码信号。',
    nodes: [
      { id: 'word', title: 'instr [31:0]', value: value(trace?.word), position: [-3.1, 1], width: 2.2, active: !!s },
      { id: 'instruction', title: '已译码指令', value: trace?.instruction.op ?? pending, position: [-3.1, -1.2], width: 2.2, active: !!s },
      { id: 'opcode', title: 'opcode [6:0]', value: trace ? (trace.word & 127).toString(2).padStart(7, '0') : pending, position: [-.8, 1.65], active: !!s },
      { id: 'funct3', title: 'funct3 [14:12]', value: trace ? (trace.word >>> 12 & 7).toString(2).padStart(3, '0') : pending, position: [-.8, 0], active: !!s },
      { id: 'funct7', title: 'funct7 [31:25]', value: trace ? (trace.word >>> 25).toString(2).padStart(7, '0') : pending, position: [-.8, -1.65], active: !!s },
      { id: 'alu', title: 'alu_op / A_sel / B_imm', value: s ? `${s.alu_op} / ${s.alu_a_sel} / ${s.alu_b_imm}` : pending, position: [2.6, 2], width: 3, active: !!s, kind: 'control' },
      { id: 'selects', title: 'imm_sel / wb_sel', value: s ? `${s.imm_sel} / ${s.wb_sel}` : pending, position: [2.6, .95], width: 3, active: !!s, kind: 'control' },
      { id: 'memory', title: 'mem_read / write / size / U', value: s ? `${s.mem_read} / ${s.mem_write} / ${s.mem_size} / ${s.load_unsigned}` : pending, position: [2.6, -.1], width: 3, active: !!s?.mem_read || !!s?.mem_write, kind: 'control' },
      { id: 'flow', title: 'branch / jump / jalr · branch_op', value: s ? `${s.branch} / ${s.jump} / ${s.jalr} · ${s.branch_op}` : pending, position: [2.6, -1.15], width: 3, active: !!s?.branch || !!s?.jump, kind: 'control' },
      { id: 'system', title: 'R / I / T / system_cause', value: s ? `${s.reg_write} / ${s.illegal} / ${s.system_trap} / ${s.system_cause}` : pending, position: [2.6, -2.2], width: 3, active: !!s, kind: 'control' },
      { id: 'commit', title: 'reg_write → cpu_top gate → rf_we', value: s ? `${s.reg_write} → ${s.rf_we}` : pending, position: [2.6, -3.2], width: 3.4, active: !!s?.rf_we, kind: 'writeback' },
    ],
    wires: [
      ...['opcode', 'funct3', 'funct7'].map(to => ({ from: 'word', to, active: !!s })),
      ...['alu', 'selects', 'memory', 'flow', 'system'].map(to => ({ from: 'opcode', to, active: !!s, kind: 'control' as const })),
      { from: 'funct3', to: 'alu', active: !!s, kind: 'control' }, { from: 'funct7', to: 'alu', active: !!s, kind: 'control' },
    ],
  }
}

const IMMEDIATE_LAYOUTS = ['sext(instr[31:20])', 'sext(31:25 | 11:7)', 'sext(31 | 7 | 30:25 | 11:8 | 0)', 'instr[31:12] | 12×0', 'sext(31 | 19:12 | 20 | 30:21 | 0)']
export function immediateModel(_cpu: CpuState, trace?: ExecutionTrace): ModuleExploration {
  const s = trace?.signals
  return {
    note: 'imm_gen.v 是纯组合选择：按 imm_sel 从 instr 抽取并重排 I/S/B/U/J，再分别做符号扩展和低位补 0；没有 clk、没有 FF。B/J 的 bit0 在拼接中直接补 0，不会再次左移；U 固定补低 12 位 0。输出只读 Trace.imm，十六进制与有符号十进制同时显示；R 型等未使用立即数时照录默认选择及原始端口值，不强制伪置零。',
    nodes: [
      { id: 'word', title: 'instr [31:0]', value: value(trace?.word), position: [-3.2, 1], width: 2.1, active: !!s },
      { id: 'select', title: 'imm_sel [2:0]', value: s ? `${s.imm_sel} · ${['I', 'S', 'B', 'U', 'J'][s.imm_sel]}` : pending, position: [-3.2, -1.1], width: 2.1, active: !!s, kind: 'control' },
      ...IMMEDIATE_LAYOUTS.map((layout, i): ExploreNode => ({ id: `format-${i}`, title: `${['I', 'S', 'B', 'U', 'J'][i]} 型拼接`, value: layout,
        position: [0, 1.95 - i * .95], width: 3.5, active: s?.imm_sel === i })),
      { id: 'imm', title: 'imm [31:0]', value: value(s?.imm), position: [3.2, 0], width: 2.1, active: !!s },
    ],
    wires: s ? [
      { from: 'word', to: `format-${s.imm_sel}`, active: true }, { from: 'select', to: `format-${s.imm_sel}`, active: true, kind: 'control' },
      { from: `format-${s.imm_sel}`, to: 'imm', active: true },
    ] : [],
  }
}

export function muxModel(_cpu: CpuState, trace?: ExecutionTrace): ModuleExploration {
  const s = trace?.signals
  const aName = s ? ['rs1_data', 'pc_value', "32'b0"][s.alu_a_sel] : undefined
  const bName = s ? (s.alu_b_imm ? 'imm' : 'rs2_data') : undefined
  return {
    note: 'MUX 是 cpu_top.v 中两个组合选择表达式，不是独立 RTL 模块。ALU A：alu_a_sel=0→rs1_data、1→pc_value、2→32\'b0；ALU B：alu_b_imm=0→rs2_data、1→imm。两路输出直接取 Trace.alu_a / alu_b，不重新计算。这里不包含 Next PC MUX，也不包含 WB MUX；两路都没有 clk 或内部寄存器。',
    nodes: [
      { id: 'word', title: 'instr[31:0]', value: trace ? hex(trace.word) : pending, position: [-3.1, 1.6], width: 2.4, active: !!s },
      { id: 'a-rs1', title: 'A 输入 0 · rs1_data', value: value(s?.rs1_data), position: [-3.1, .8], width: 2.4, active: !!s && s.alu_a_sel === 0 },
      { id: 'a-pc', title: 'A 输入 1 · pc_value', value: value(s?.pc_value), position: [-3.1, -.2], width: 2.4, active: !!s && s.alu_a_sel === 1 },
      { id: 'a-zero', title: "A 输入 2 · 32'b0", value: s ? '0x00000000' : pending, position: [-3.1, -1.2], width: 2.4, active: !!s && s.alu_a_sel === 2 },
      { id: 'a-sel', title: 'alu_a_sel [1:0]', value: s ? `${s.alu_a_sel} · ${aName}` : pending, position: [0, -2.1], width: 2.4, active: !!s, kind: 'control' },
      { id: 'a-out', title: 'alu_a [31:0]', value: value(s?.alu_a), position: [2.9, .8], width: 2.4, active: !!s },
      { id: 'b-rs2', title: 'B 输入 0 · rs2_data', value: value(s?.rs2_data), position: [-3.1, .8], width: 2.4, active: !!s && !s.alu_b_imm },
      { id: 'b-imm', title: 'B 输入 1 · imm', value: value(s?.imm), position: [-3.1, -.2], width: 2.4, active: !!s?.alu_b_imm },
      { id: 'b-sel', title: 'alu_b_imm', value: s ? `${s.alu_b_imm} · ${bName}` : pending, position: [0, -2.1], width: 2.4, active: !!s, kind: 'control' },
      { id: 'b-out', title: 'alu_b [31:0]', value: value(s?.alu_b), position: [2.9, -.4], width: 2.4, active: !!s },
    ],
    wires: [],
  }
}

const BRANCH_CASES = [
  { code: 0, name: 'BEQ', comparison: 'a == b' }, { code: 1, name: 'BNE', comparison: 'a != b' },
  { code: 4, name: 'BLT', comparison: 'signed(a) < signed(b)' }, { code: 5, name: 'BGE', comparison: 'signed(a) ≥ signed(b)' },
  { code: 6, name: 'BLTU', comparison: 'unsigned(a) < unsigned(b)' }, { code: 7, name: 'BGEU', comparison: 'unsigned(a) ≥ unsigned(b)' },
]
export function branchModel(_cpu: CpuState, trace?: ExecutionTrace): ModuleExploration {
  const s = trace?.signals, chosen = s && BRANCH_CASES.find(row => row.code === s.branch_op)
  return {
    note: 'branch_unit.v 只做六种组合比较；branch_op 直连 funct3。只有当前指令确实是分支时，taken 才参与控制；非分支即使组合输出为 1 也不得表现为跳转。cpu_top 再用 jump | (branch & taken) 生成 redirect；Branch Unit 不计算 PC+imm，也不更新 PC。BLT/BGE 使用有符号，BLTU/BGEU 使用无符号，MSB 决定两者差异。',
    nodes: [
      { id: 'a', title: 'a · rs1_data', value: value(s?.rs1_data), position: [-3.2, 1], width: 2.1, active: !!s },
      { id: 'b', title: 'b · rs2_data', value: value(s?.rs2_data), position: [-3.2, -.2], width: 2.1, active: !!s },
      { id: 'op', title: 'branch_op [2:0]', value: s ? `${s.branch_op} · ${chosen?.name ?? 'default → 0'}` : pending, position: [-3.2, -1.6], width: 2.1, active: !!s, kind: 'control' },
      { id: 'branch', title: 'branch 使能', value: s ? String(s.branch) : pending, position: [-3.2, -2.2], width: 2.1, active: !!s, kind: 'control' },
      { id: 'jump', title: 'jump 使能', value: s ? String(s.jump) : pending, position: [-3.2, -2.8], width: 2.1, active: !!s, kind: 'control' },
      ...BRANCH_CASES.map((row, i): ExploreNode => ({ id: `compare-${row.code}`, title: row.name, value: row.comparison,
        position: [0, 2.15 - i * .85], width: 3.2, active: chosen?.code === row.code })),
      { id: 'taken', title: 'taken（组合输出）', value: s ? String(s.branch_taken) : pending, position: [3.1, 1], width: 2.3, active: !!s },
      { id: 'enable', title: '外部 branch / jump', value: s ? `${s.branch} / ${s.jump}` : pending, position: [3.1, -.4], width: 2.3, active: !!s, kind: 'control' },
      { id: 'redirect', title: '外部 redirect', value: s ? String(s.redirect) : pending, position: [3.1, -1.8], width: 2.3, active: !!s?.redirect, kind: 'control' },
    ],
    wires: [
      ...(chosen ? [{ from: 'a', to: `compare-${chosen.code}`, active: true }, { from: 'b', to: `compare-${chosen.code}`, active: true },
        { from: 'op', to: `compare-${chosen.code}`, active: true, kind: 'control' as const }, { from: `compare-${chosen.code}`, to: 'taken', active: true }] : []),
      { from: 'taken', to: 'redirect', active: !!s?.branch, kind: 'control' }, { from: 'enable', to: 'redirect', active: !!s, kind: 'control' },
    ],
  }
}

export function dataMemoryModel(cpu: CpuState, trace?: ExecutionTrace): ModuleExploration {
  const s = trace?.signals, access = trace?.memoryAccess
  const ram = access?.space === 'ram', mmio = access?.space === 'mmio', store = access?.kind === 'store', load = access?.kind === 'load'
  const aligned = s ? s.dmem_addr - s.dmem_addr % 4 : 0
  return {
    note: `cpu_top.v 的外部数据总线与小端字节选通，存储本体由宿主实现（当前 RAM ${cpu.memory.length / 1024} KiB）。R/W 是 mem_read/mem_write，we 是 dmem_we。RAM 格为实际对齐字的提交前后快照；总线读值和 load_data 在非 Load 时不构成架构读取/写回。MMIO 基址 0x20000000，单独路由到 Display，不读写普通 RAM，不伪造设备读回。地址低两位选字节通道；LB/LBU、LH/LHU、LW 与 SB/SH/SW 的宽度由 mem_size/load_unsigned 决定。`,
    nodes: [
      { id: 'address', title: 'dmem_addr · 字节地址', value: value(s?.dmem_addr), position: [-3.1, 1.35], width: 2.3, active: !!access },
      { id: 'write', title: 'dmem_wdata · 移位后', value: value(s?.dmem_wdata), position: [-3.1, 0], width: 2.3, active: !!store },
      { id: 'strobes', title: 'dmem_wstrb [3:0]', value: s ? s.dmem_wstrb.toString(2).padStart(4, '0') : pending, position: [-3.1, -1.4], width: 2.3, active: !!store, kind: 'control' },
      { id: 'control', title: 'R / W / we / size / unsigned', value: s ? `${s.mem_read} / ${s.mem_write} / ${s.dmem_we} / ${s.mem_size} / ${s.load_unsigned}` : pending, position: [0, 2.2], width: 3, active: !!access, kind: 'control' },
      { id: 'mem-read', title: 'mem_read', value: s ? String(s.mem_read) : pending, position: [-3, 1.8], width: 2.4, active: !!s, kind: 'control' },
      { id: 'mem-write', title: 'mem_write / dmem_we', value: s ? `${s.mem_write} / ${s.dmem_we}` : pending, position: [-3, .8], width: 2.4, active: !!store, kind: 'control' },
      { id: 'mem-size', title: 'mem_size', value: s ? `${s.mem_size} · ${['BYTE', 'HALF', 'WORD'][s.mem_size]}` : pending, position: [-3, -.2], width: 2.4, active: !!s, kind: 'control' },
      { id: 'load-unsigned', title: 'load_unsigned', value: s ? String(s.load_unsigned) : pending, position: [-3, -1.2], width: 2.4, active: !!s, kind: 'control' },
      { id: 'route', title: '地址路由（宿主）', value: access ? `${mmio ? '独立 MMIO' : '普通 RAM'} · ${access.width}-bit ${access.kind}` : '本条未进行架构访存', position: [0, 1.15], width: 3, active: !!access },
      { id: 'ram', title: 'RAM 对齐字 · 提交前', value: ram ? hex(readWord(trace!.before.memory, aligned)) : trace ? '未访问普通 RAM' : pending, position: [0, .1], width: 2.8, active: !!ram },
      { id: 'after', title: 'RAM 对齐字 · 提交后', value: ram ? hex(readWord(trace!.after.memory, aligned)) : trace ? 'RAM 未被本条访问' : pending, position: [0, -.95], width: 2.8, active: !!ram && !!store, kind: 'writeback' },
      { id: 'mmio', title: '独立 MMIO 设备', value: mmio && trace?.mmioWrite ? `(${trace.mmioWrite.x},${trace.mmioWrite.y}) #${trace.mmioWrite.rgb.toString(16).padStart(6, '0')}` : trace ? '本条未访问设备' : pending, position: [0, -2.1], width: 3, active: !!mmio },
      { id: 'read', title: 'dmem_rdata · 对齐字', value: value(s?.dmem_rdata), position: [3.1, 1.3], width: 2.3, active: !!load },
      { id: 'load', title: 'load_data · 选道/扩展', value: value(s?.load_data), position: [3.1, -.2], width: 2.3, active: !!load },
      { id: 'actual', title: '实际访存数据', value: access ? hex(access.data) : trace ? '本条未进行架构访存' : pending, position: [3.1, -1.7], width: 2.3, active: !!access },
    ],
    wires: [
      { from: 'address', to: 'route', active: !!access }, { from: 'control', to: 'route', active: !!access, kind: 'control' },
      { from: 'route', to: 'ram', active: !!ram }, { from: 'route', to: 'mmio', active: !!mmio },
      { from: 'write', to: 'ram', active: !!ram && !!store }, { from: 'strobes', to: 'ram', active: !!ram && !!store, kind: 'control' },
      { from: 'ram', to: 'after', active: !!ram && !!store, kind: 'writeback' },
      { from: 'ram', to: 'read', active: !!ram && !!load }, { from: 'read', to: 'load', active: !!load },
      { from: 'write', to: 'mmio', active: !!mmio && !!store },
    ],
  }
}

export function writebackModel(_cpu: CpuState, trace?: ExecutionTrace): ModuleExploration {
  const s = trace?.signals, source = s ? ['alu', 'memory', 'pc4'][s.wb_sel] : undefined
  return {
    note: 'WB 是 cpu_top.v 中的组合 wb_sel 选择逻辑，编码 0=ALU、1=MEM、2=PC+4；不是额外时钟周期。即使本条不写寄存器，wb_data 仍然存在。load_data 是 dmem_rdata 经 lane_shift、宽度提取与符号/零扩展后的结果，不能拿原始 dmem_rdata 代替。最终 RegFile 写入由 rf_we、rd!=0 和 clock↑ 的实际 committed 决定；reset 未在 Trace 中采样，不伪造 reset 值。',
    nodes: [
      { id: 'alu', title: '0 · alu_result', value: value(s?.alu_result), position: [-3, 1.7], width: 2.4, active: source === 'alu' },
      { id: 'memory', title: '1 · load_data · 扩展后', value: value(s?.load_data), position: [-3, 0], width: 2.4, active: source === 'memory' },
      { id: 'pc4', title: '2 · pc_plus4', value: value(s?.pc_plus4), position: [-3, -1.7], width: 2.4, active: source === 'pc4' },
      { id: 'select', title: '组合选择 wb_sel', value: s ? `${s.wb_sel} · ${source}` : pending, position: [0, 0], width: 2.4, active: !!s, kind: 'control' },
      { id: 'data', title: 'wb_data [31:0]', value: value(s?.wb_data), position: [3, .8], width: 2.4, active: !!s },
      { id: 'reg-write', title: 'reg_write · Decoder 请求', value: s ? String(s.reg_write) : pending, position: [-3, -2.4], width: 2.4, active: !!s, kind: 'control' },
      { id: 'conditions', title: 'trap / fault / reset', value: s ? `${s.trap} / ${s.fault} / 未采样` : pending, position: [-3, -3.3], width: 2.4, active: !!s, kind: 'control' },
      { id: 'rf-we', title: 'rf_we · 顶层门控', value: s ? String(s.rf_we) : pending, position: [0, -2.4], width: 2.4, active: !!s, kind: 'control' },
      { id: 'rd', title: 'rd [4:0] · 目标寄存器', value: trace ? `x${trace.write.rd}` : pending, position: [2.4, -2.4], width: 2.4, active: !!s, kind: 'control' },
      { id: 'write', title: '外部 RF · 同步写门控', value: trace ? `rf_we=${s!.rf_we} · x${trace.write.rd} · ${trace.write.committed ? '已写入' : '未写入'}` : pending, position: [2.5, -1], width: 3.4, active: !!trace?.write.committed, kind: 'writeback' },
      { id: 'commit', title: '实际寄存器提交', value: trace ? trace.write.committed ? `x${trace.write.rd}=${hex(trace.after.registers[trace.write.rd])}` : s!.rf_we && trace.write.rd === 0 ? 'x0 丢弃，恒为 0' : '本条无有效寄存器写入' : pending, position: [0, -2.25], width: 5.6, active: !!trace?.write.committed, kind: 'writeback' },
    ],
    wires: [
      ...['alu', 'memory', 'pc4'].map(from => ({ from, to: 'select', active: source === from })),
      { from: 'select', to: 'data', active: !!s }, { from: 'data', to: 'write', active: !!trace?.write.committed, kind: 'writeback' },
      { from: 'write', to: 'commit', active: !!trace?.write.committed, kind: 'writeback' },
    ],
  }
}

export function nextPcModel(_cpu: CpuState, trace?: ExecutionTrace): ModuleExploration {
  const s = trace?.signals
  return {
    note: 'Next PC 是 cpu_top.v 的顶层组合逻辑，没有独立模块，也没有 clk/reset 或寄存器。PC+4、PC+imm、JALR 清 bit0、redirect 与 Trap/fault 保持的结果均取 Trace；未被单独采样的另一候选只标为未选，不另行模拟。最终 next_pc 回送到 pc.v 的 D，由 PC 在下一 clk↑ 写入 Q；它不等同于 Trap 前的 normal_next_pc。',
    nodes: [
      { id: 'pc', title: 'pc_value', value: value(s?.pc_value), position: [-3.2, 1.6], width: 2.1, active: !!s },
      { id: 'imm', title: 'imm', value: value(s?.imm), position: [-3.2, .1], width: 2.1, active: !!s },
      { id: 'alu', title: 'alu_result', value: value(s?.alu_result), position: [-3.2, -1.5], width: 2.1, active: !!s?.jalr },
      { id: 'pc4', title: 'PC+4', value: value(s?.pc_plus4), position: [-.9, 1.7], width: 1.9, active: !!s && !s.redirect },
      { id: 'relative', title: 'PC+imm · target', value: s ? !s.jalr ? hex(s.target) : '未选，未单独采样' : pending, position: [-.9, .1], width: 1.9, active: !!s?.redirect && !s.jalr },
      { id: 'jalr', title: 'JALR · ALU 清 bit0', value: s ? s.jalr ? hex(s.target) : '未选，未单独采样' : pending, position: [-.9, -1.5], width: 1.9, active: !!s?.jalr },
      { id: 'redirect', title: 'J | (B & taken) → redirect', value: s ? `${s.jump} | (${s.branch} & ${s.branch_taken}) → ${s.redirect}` : pending, position: [1.7, 2.2], width: 4.7, active: !!s, kind: 'control' },
      { id: 'normal', title: 'normal_next_pc', value: value(s?.normal_next_pc), position: [1.3, .1], width: 2.1, active: !!s },
      { id: 'trap', title: 'Trap 保持当前 PC', value: s ? `trap=${s.trap} · cause=${s.trap_cause}` : pending, position: [1.3, -1.5], width: 2.1, active: !!s?.trap, kind: 'control' },
      { id: 'next', title: 'next_pc · 最终 D', value: value(s?.next_pc), position: [3.3, .1], width: 1.9, active: !!s },
    ],
    wires: [
      { from: 'pc', to: 'pc4', active: !!s }, { from: 'pc', to: 'relative', active: !!s && !s.jalr }, { from: 'imm', to: 'relative', active: !!s && !s.jalr },
      { from: 'alu', to: 'jalr', active: !!s?.jalr }, { from: 'pc4', to: 'normal', active: !!s && !s.redirect },
      { from: 'relative', to: 'normal', active: !!s?.redirect && !s.jalr }, { from: 'jalr', to: 'normal', active: !!s?.redirect && !!s.jalr },
      { from: 'redirect', to: 'normal', active: !!s, kind: 'control' }, { from: 'normal', to: 'next', active: !!s && !s.trap },
      { from: 'pc', to: 'next', active: !!s?.trap }, { from: 'trap', to: 'next', active: !!s?.trap, kind: 'control' },
    ],
  }
}
