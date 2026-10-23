# Sprint 07 · 全部 11 个 CPU 模块内部探索

先将验收通过的 Sprint 06 保存为本地提交 `95dbeda`，确认干净后创建 `feat/sprint-07-all-module-exploration`。保留 MMIO 3D 基线 `674677f`、单 Canvas、原镜头与进入/返回/中途退出机制。本轮仅补齐只读模型、入口及必要路径区分，没有修改 CPU Core、ISA、Trace 执行语义、拓扑、ROM/RAM 或项目持久化。

## 操作和模块

工作台点击任一模块本体，或右侧对应按钮。进入自动暂停，可继续单步/运行或查看历史；点击「返回主板」或 Esc 返回。全部模块使用同一剖面 renderer、尺寸适配、信号面板和相机框架。活动线路亮显，未选通线路灰显。MMIO 聚焦与元件探索互斥，切换不执行指令或清空设备。

| 模块 | 展示范围和依据 |
| --- | --- |
| PC | Sprint 06：pc.v 的 D/Q、同步复位，外部 PC 控制上下文 |
| Register File | Sprint 06：32×32 位、双异步读/单同步写、原始端口、x0 写丢弃 |
| ALU | Sprint 06：alu.v 十个 case 的功能路径，真实 a/b/op/result |
| Instruction Memory | 顶层 imem_addr/imem_rdata；宿主 ROM 字节地址÷4 的字索引和实际取指，非 RTL 内部 RAM 阵列 |
| Decoder | decoder.v：opcode/funct3/funct7 切片、并行 ALU/立即数/WB/访存/跳转/系统控制；reg_write 请求不等于实际提交 |
| Imm Gen | imm_gen.v：I/S/B/U/J 位段拼接、符号扩展与补零，实际 imm_sel/imm；R 型默认端口不强制伪置零 |
| MUX | cpu_top.v 的 ALU B 二选一：rs2_data/imm、alu_b_imm、alu_b，非独立 RTL 文件 |
| Branch Unit | branch_unit.v 的六类有符号/无符号比较，taken 和外部 branch/jump/redirect；非分支时原始 taken 不冒充跳转 |
| Data Memory | 顶层外部 dmem 总线、小端移位/字节选通；真实 RAM 对齐字前后快照与独立 MMIO 路由，不能将设备地址映射进 RAM |
| WB | cpu_top.v 的 ALU/MEM/PC+4 组合选择，wb_data、rf_we、rd 和 committed；不写寄存器时仍可观察组合输出 |
| Next PC | cpu_top.v 的 PC+4/相对目标/JALR 清 bit0/redirect/Trap 保持；normal_next_pc 与最终 next_pc 分开显示 |

本轮实际只读核对 `rtl/cpu/decoder.v`、`imm_gen.v`、`branch_unit.v`、`cpu_top.v` 及既有 Core/Trace，延续已读取 `cpu_defs.vh` 的控制编码；未改原件。当前源码没有独立的 MUX/WB/Next PC 模块文件，外部 ROM/RAM 也不冒充 CPU 顶层内部实现。内部图是功能示意，不声称为综合/门级电路或完成 RTL 联合仿真。

## 数据与边界

- 新八个模型集中于 `src/scenes/exploration/remainingModels.ts`，复用 `ExploreNode/ExploreWire/ModuleExploration`。注册表 `EXPLORERS` 以 `Record<ModuleId,...>` 编译校验全部 11 项；不改变布局坐标。
- 数值来自 ExecutionTrace、原始指令位段或其 before/after 的已提交内存快照。字索引和对齐字地址仅为教学寻址映射，不重新执行 ISA；未采样的 JALR/PC 相对另一候选明确标为未选。
- 无 Trace 时等待信号；非访存指令的总线值不解释为架构读取，WB 组合值不解释为有效寄存器写回。没有 Trace 的故障不根据上一条快照编造故障控制。
- Data Memory 访问 MMIO 时普通 RAM 路径不激活；像素取自既有 mmioWrite，未实现的显示读回也不伪造。项目配置和运行显示缓存规则不变。
- 未修改模拟/播放时钟；内部图没有额外的 CPU 时钟或虚构传播时间。

## 必要验证

类型检查和 5 个相关测试文件共 **253 项**通过，包括：

- 40 条 RV32I 指令下全部模型构建、唯一节点、有效连线和边界布局、真实 Decoder 端口。
- I/S/B/U/J 的符号/补零、MUX 路径、六类分支边界和非分支 taken、SB 选通与 LH 符号扩展。
- MMIO/RAM 隔离、三路 WB 与无效写入门控、JALR 清低位与 Trap 保持。
- 全部模块进入/返回不改 CPU/历史，及已有 RV32I、MMIO、回放与聚焦互斥回归。

本地预览为 `http://127.0.0.1:5180/`，浏览器检查新模块入口、数据展示和返回；没有运行完整 E2E、性能长测或部署。

当前限制：采用简洁功能示意，Decoder 等信号密集时可滚动右侧读取完整文字；无门级建模、存储阵列物理布局或新增外设协议。精细三维视觉仍留给后续任务。
