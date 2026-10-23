# RTL → Web 映射

## Sprint 06 · 元件内部探索

只读核对 pc.v、regfile.v、alu.v、cpu_defs.vh 与 cpu_top.v。内部图的数值来自现有 ExecutionTrace / CpuState：PC 的 D/Q/提交后 Q、寄存器堆 32 格与双读单写、ALU 的 a/b/op/result 与十个 RTL case。PC 的分支/跳转选择仍明确属于 cpu_top 外部上下文，ALU case 图不冒充综合后的门级/并行硬件。无 Trace 时不编造控制或运算结果。

此轮只有只读展示与会话镜头状态，无新 RTL 信号、无 CPU/Trace 执行语义修改或 RTL 联合仿真结论。完整边界与扩展接口见 [SPRINT_06_EXPLORATION](SPRINT_06_EXPLORATION.md)。

## Sprint 05.5 · 显示 MMIO

新增宿主 Logisim RGB 设备：`0x20000000…0x2003ffff`、256×256、低 24 位 RGB888、对齐 SW 写像素即更新。依据为用户原 `minirv.circ` 的 LSU 比较器、VGA_WE 门控、X/Y/Data 分线器及 RGB Video 组件，并以原反汇编和 ARTEMIS 实际访问验证；完整证据与限制见 [MMIO_DISPLAY](MMIO_DISPLAY.md)。

`cpu_top.v` 的 `dmem_addr/dmem_wdata/dmem_we/dmem_wstrb` 仍是 CPU 外部总线，没有新增或编造 RTL 信号。`CpuState.display`、`memoryAccess.space` 和 `mmioWrite` 是软件外设/教学元数据，不是 RTL 中已存在的显示控制器。MMIO 不修改 RAM，也不沿冻结教学板 RAM 连线代演；独立面板显示真实设备输出。原 RTL / Logisim 文件只读未改，未做外设 RTL 联合仿真。

以下章节中“MMIO 未实现”是对应历史 Sprint 的记录，当前新增的显示 SW 协议以本节为准；其余外设、显示读回及窄写未实现。

## Sprint 05 当前状态（2026-10-23）

软件已扩展至 40 条 RV32I 基础整数指令。重新只读读取下表全部 8 个 RTL 文件，其 SHA-256 与本文历史基线一致；RTL 原件本身已覆盖全部相应 ALU、分支、跳转、字节/半字访存和系统停止控制，因此本轮没有修改 FPGA 工程。`iverilog -g2012 -I rtl/cpu -s cpu_top ...` 语法编译通过；无 Testbench 联合仿真或等价验证。

- ALU_ADD/SUB/SLL/SLT/SLTU/XOR/SRL/SRA/OR/AND 编码分别为 0…9；IMM_I/S/B/U/J=0…4；SRC_RS1/PC/ZERO=0/1/2；WB_ALU/MEM/PC4=0/1/2。
- MEM_BYTE/HALF/WORD=0/1/2，load_unsigned 与 byte lane strobes 按 decoder / cpu_top 实现；所有提交前异常保留原状态。
- jump、jalr、illegal、system_trap、system_cause、fault/fault_cause、trap/trap_cause 均是实际 RTL 信号。成功快照采样正常组合值；系统停止快照含该边沿后的 Trap 锁存值。复位周期、后续 halted 时钟不逐周期模拟。
- ECALL cause=11、EBREAK cause=3，非退休停止；FENCE 为单核有序模型 NOP。无 CSR、异常向量或 OS。宿主越界仍单独表达，不捏造外部错误线。
- 软件完整执行不等于教学板完整网表：ALU A 的 PC/零源、PC4 写回、JALR 目标、跳转专用控制线未新增几何，缺项在 Trace 明示，完整信号值可观察。

指令表、验收程序和适用边界见 [SPRINT_05_RV32I](SPRINT_05_RV32I.md)。**以下 Sprint 02 / 03 内容保留为历史覆盖范围，不能当作当前 ISA 限制。**

## Sprint 02 历史映射

核对日期：2026-10-22，来源 `rtl/cpu/`，全部只读。Sprint 02 重新读取顶层、译码、宏、立即数和分支单元；沿用 Sprint 01 对 PC、寄存器堆、ALU 的已核对实现。

## 实际来源与模块

| RTL | 实例 / 职责 | 网页 |
| --- | --- | --- |
| `cpu_top.v` | 顶层互连、PC+4、目标加法、选择器、访存车道、故障门控 | 整体数据通路、Next PC、MUX、WB |
| `cpu_defs.vh` | 控制与 Trap 数字编码 | SignalSnapshot 的原编码 |
| `pc.v` | u_pc，同步高电平复位，PC=0 | PC、CpuState.pc |
| `decoder.v` | u_decoder，组合译码 | Decoder、五条支持指令的控制快照 |
| `imm_gen.v` | u_imm，五类立即数格式 | 本轮覆盖 IMM_I / IMM_S / IMM_B |
| `regfile.v` | u_regfile，异步双读、同步单写，x0 丢弃写入 | Register File、架构寄存器 |
| `alu.v` | u_alu，10 类操作 | 本轮使用 ALU_ADD |
| `branch_unit.v` | u_branch，独立比较器 | Branch Unit，本轮执行 BEQ |

Next PC、MUX、WB 是 **顶层内联逻辑的教学分组**，不是独立 RTL 实例。Instruction / Data Memory 是顶层外部总线设备，不在 CPU RTL 内。没有复制或修改原始 FPGA 文件。

顶层端口：`clk, reset, imem_addr, imem_rdata, dmem_addr, dmem_wdata, dmem_rdata, dmem_we, dmem_wstrb, trap, trap_cause`。

当前未找到 Testbench；Sprint 01 只检查过 ZIP 目录，内含同名 8 个文件。没有进行 RTL 编译、联合仿真、差分或形式验证，不能宣称完全等价。

## 指令与控制编码

| 信号 | ADDI | ADD | LW | SW | BEQ |
| --- | --- | --- | --- | --- | --- |
| reg_write / 正常 rf_we | 1 | 1 | 1 | 0 | 0 |
| alu_op = ALU_ADD | 0 | 0 | 0 | 0 | 0（未用于分支判定） |
| alu_a_sel = SRC_RS1 | 0 | 0 | 0 | 0 | 0 |
| alu_b_imm | 1 | 0 | 1 | 1 | 0 |
| imm_sel | 0 (I) | 0 (I，未选用) | 0 (I) | 1 (S) | 2 (B) |
| wb_sel | 0 (ALU) | 0 | 1 (MEM) | 1（写使能为 0） | 0（写使能为 0） |
| mem_read / mem_write | 0 / 0 | 0 / 0 | 1 / 0 | 0 / 1 | 0 / 0 |
| mem_size | 0（无访存） | 0 | 2 (WORD) | 2 (WORD) | 0 |
| branch | 0 | 0 | 0 | 0 | 1 |

`branch_op` 始终为原始 funct3；BEQ=000，LW/SW=010（比较器输出默认 false）。其他四条中的 `branch_taken` 同样保留组合比较器的真实输出，但只有 branch=1 才影响 redirect。`load_unsigned=0`。

原始 `instr[24:20]` 始终驱动 rs2，即使 I 型未使用；R 型的 IMM_I 仍生成原始未选用值。SW/BEQ 的原始 `instr[11:7]` 仍存在，但 reg_write=0，不误作 rd 提交。对 x0 的合法算术 / LW，rf_we 仍为 1，由寄存器堆丢弃实际写入。

## 数据通路

- 公共取指 / 译码：`pc_value → imem_addr → imem_rdata → decoder / imm_gen / regfile`。
- 算术：`rs1_data → alu_a`；`imm` 或 `rs2_data → ALU B MUX → alu_b → alu_result → WB → wb_data → regfile`。
- 访存：`rs1_data + imm → alu_result → dmem_addr`；SW 从 `rs2_data → dmem_wdata` 写入，LW 从 `dmem_rdata → load_data → WB_MEM → wb_data` 写回。
- 分支：`rs1_data / rs2_data → branch_unit → branch_taken`；`redirect = branch && branch_taken`（本轮 jump=0），`target = pc_value + imm`，选择 target 或 pc_plus4 作为 next_pc。
- PC 反馈独立于寄存器写回总线；BEQ 使用独立比较器，不依赖 ALU SUB。本轮所有 ALU A 选择均为 SRC_RS1，暂不画完整三选一 ALU A MUX。

数据线连接仅覆盖五条指令的关键扇出，非完整网表。几何交叉不表示额外连接。虚线表示控制，蓝 / 浅金 / 青绿区分数据、控制和写回。

## 数据内存与异常

`memory.ts` 默认 1024 字节，小端、地址按字节。LW/SW 要求 4 字节对齐；正确 SW 的 `dmem_we=1`、`dmem_wstrb=1111`，LW 为 0 / 0000。总线按 RTL 保留原始地址、按低位移位的写数据、对齐字读数及 load_data；不活跃总线仍可含未使用的数值。外部内存未映射地址的非访存读总线置 0，是宿主设备约定。

故障在提交前验证：当前指令地址未对齐 cause=0；BEQ 成立且目标未对齐 cause=0；LW 未对齐 cause=4；SW 未对齐 cause=6。后者对应 RTL 门控语义，错误指令保持 PC、寄存器、内存和 retired 不变。BEQ 不成立不检查未选中的目标对齐。

有限内存越界由宿主检查，在 `CpuState.fault.source='host'` 中表达，不生成虚构 RTL 信号或 RISC-V Trap cause；顶层没有外部访存错误输入。尚未支持的机器码同样作为软件子集限制停止，不能据此声称 RTL 认为非法。此版本未完整实现 trap 锁存、复位周期门控、CSR 或异常向量。

## Trace 与可视化语义

`SignalSnapshot` 的信号名可追溯到顶层或译码 / 宏；`transfers` 中源、目的、连接 id、因果序号、语义颜色是 **软件教学元数据**。连接 id 可以不同于信号名，例如 target 连接把 pc_value 送入 Next PC 教学分组的目标加法器。mem_control 来自 decoder 的 mem_read / mem_write，实际门控写使能另以 dmem_we / dmem_wstrb 记录。

每个 transfer.value 直接取自相应 snapshot 字段。路线几何只能决定运动路径与时间，不得计算 CPU 结果。一次 core.step 提交一个架构边沿；五个观察阶段及各线路的因果顺序是慢动作隐喻，不代表五个时钟、流水线或精确门延迟。

`write.committed`、`memoryAccess`、CpuState.status/reason/fault、retired、Trace id、阶段和 PresentationClock 都不是 RTL 端口。历史快照不可变，回放、暂停、继续或跳转不会回滚或重写当前架构状态。程序越过加载范围即停止和 1000 条限制也是宿主策略。

## 未覆盖

Sprint 03 的自定义 ROM、HEX 解析、初始 RAM / 寄存器配置、编辑容量、导入事务、UI 分支范围提示与 Δ 差异标记均为 **宿主软件功能**，不是 RTL 新增模块或端口。ROM 仍通过原 imem 地址 / 数据路径执行；RAM 配置生成宿主 1024 字节镜像，运行 LW/SW 的 dmem 信号、对齐、选通与 Trace 语义保持不变。initialMemory / initialRegisters 不作为虚构控制线绘制。MMIO 只在架构文档规划，尚未实现或映射。React Bits 与 RTL 无对应关系。

完整 RV32I、其他分支 / 跳转、JALR、字节 / 半字访存、ECALL/EBREAK/FENCE、完整 Trap 优先级及复位门控。RTL 原件保留本地且被 Git 忽略，Web 可独立运行；共享 RTL 需另行确认授权。

## 原件 SHA-256（Sprint 01 基线，Sprint 02 / 03 复核一致）

```text
alu.v         19ACA92F1D115498629CB416077F4A2C951A5FF9A048D3F2B42EA2A0C2536B69
branch_unit.v 505982634711B1A366F670F14974A79D50372E6BE7D651DD0EDAB2D8625B2DD6
cpu_defs.vh   02F898CC29C5806416DF5FF6AE709580458166723D2C2033C022C144DCD81766
cpu_top.v     F02BFEC578F28E41ED4189BB772FD046F80F3DB0F337E4FE5C8F86B1C838636F
decoder.v     671B874FF302F30C0E9386E89E5FC3DA30DEC6DDBF03DF5CEEC601D03AFCF1DC
imm_gen.v     C04EFE9DB95DEA3140C324C4A5712A6F8A2564BF061AD1E4817AF040EFDE5F37
pc.v          49761D9F18BC5D00CABE55730489CFEA402DAE43CC6103C84D88BC34410A847C
regfile.v     AB0D4A49F83F1BD739081AC16367A24C27872D40E2C87925A12309D6F22D6743
```

## Sprint 03.1 主机扩展

本轮仅扩大宿主 ROM 至 65536 条、RAM 可选 1 / 64 / 256 KiB，增加紧凑只读 ROM / 分页不可变 RAM 表示。CPU 取址 PC/4、小端访存、对齐、选通、一次提交和所有已有 Trace 信号仍按前述五条指令映射。CPU Core 的接口接受 ArrayLike ROM，未知指令错误增加 PC；未新增 RTL 控制线或 ISA。主机执行预算、项目、IndexedDB、分页列表、Worker 均不属于 RTL。高地址 MMIO 未实施，超出 RAM 窗口仍拒绝，不虚构设备地址。原 RTL 保持只读，未进行 RTL 联合仿真。
