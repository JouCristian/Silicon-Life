# RTL → Web 映射（Sprint 01）

核对日期：2026-10-21。来源是当前工作区 `rtl/cpu/`，全部只读。

## 实际读取的文件

| 文件 | 实例 / 职责 | 网页对应 |
| --- | --- | --- |
| `cpu_top.v` | 顶层；互连、选择器、PC+4、访存车道、故障门控 | 整体 Teaching Plane 与 Trace 信号 |
| `cpu_defs.vh` | ALU / 立即数 / 选择器 / 访存 / Trap 编码 | `SignalSnapshot` 中 ADD=0、SRC_RS1=0、IMM_I=0、WB_ALU=0 |
| `pc.v` | `u_pc`；同步高电平复位，PC=0 | PC 模块、`CpuState.pc` |
| `decoder.v` | `u_decoder`；组合控制译码 | Decoder 模块、ADDI/ADD 译码与控制快照 |
| `imm_gen.v` | `u_imm`；五种立即数格式 | Imm Gen 模块，本轮实现 IMM_I |
| `regfile.v` | `u_regfile`；异步双读、同步单写、复位清零 | Register File、32 个寄存器面板 |
| `alu.v` | `u_alu`；10 种运算 | ALU，本轮只执行 ADD |
| `branch_unit.v` | `u_branch`；六类分支比较 | 本轮尚未展示或执行，保留 BEQ 类型扩展 |

另只检查 `package/cpu.zip` 的目录条目：包含相同名称的 8 个 RTL 文件，无 Testbench。没有解压、覆盖或更改原件。当前目录、压缩包内均未发现 Testbench；未找到 `iverilog`。**未运行 RTL 仿真或软件/RTL 差分验证**，不据此宣称 RTL 已验证。

## 顶层实际端口

`clk, reset, imem_addr, imem_rdata, dmem_addr, dmem_wdata, dmem_rdata, dmem_we, dmem_wstrb, trap, trap_cause`。

Instruction Memory 与 Data Memory 是顶层外部接口，源码中没有同名独立内存模块。网页 Instruction 模块是软件指令数组 `program[pc / 4]` 的可视化。数据内存只预留 `DataMemory.readWord/writeWord` 接口，尚未分配或执行访存，不展示虚构存储器结果。

## 已覆盖的真实数据通路

1. `pc_value → imem_addr → imem_rdata`。
2. `imem_rdata → u_decoder / u_imm / u_regfile`。
3. `rs1_data → alu_a`，本轮 `alu_a_sel = SRC_RS1`。
4. ADDI：`imm → alu_b`；ADD：`rs2_data → alu_b`，由 `alu_b_imm` 选择。
5. `alu_result → wb_data → u_regfile.rd_data`，`wb_sel = WB_ALU`。
6. `pc_value + 4 → next_pc → u_pc`，独立于写回总线。

图中的 MUX、WB 是 `cpu_top.v` 内联选择逻辑的教学标记，**并非源码中单独实例**。浅灰实线是数据连接，虚线是 `alu_b_imm` 控制连接；当前只绘制 ADDI/ADD 关键子集，不表示完整 CPU 网表或完整控制扇出。`alu_a_sel` 固定为 SRC_RS1，故本轮图中直接连接；完整 ALU A MUX 待扩展。

## 控制与快照语义

| RTL 信号 | 本轮数值 / 语义 |
| --- | --- |
| `reg_write`, `rf_we` | 有效 ADD/ADDI 正常提交时为 1；写 x0 时仍为 1，由寄存器堆丢弃写入 |
| `alu_op`, `alu_a_sel`, `imm_sel`, `wb_sel` | 均为 0，与宏编码一致 |
| `alu_b_imm` | ADDI=1，ADD=0 |
| `mem_read`, `mem_write`, `dmem_we`, `dmem_wstrb` | 均为 0 |
| `rs2_data` | 始终按原始 `instr[24:20]` 读取，包含 ADDI 中未被 ALU 选中的值 |
| `imm` | 始终按 IMM_I 符号扩展，包含 ADD 中未被选中的原始字段 |
| `pc_value`, `pc_plus4`, `next_pc`, `imem_addr`, `imem_rdata` | 执行前 PC、PC+4、下一 PC、取指地址、真实机器码 |
| `alu_a`, `alu_b`, `alu_result`, `wb_data` | 真实操作数、低 32 位加法结果、写回值 |

`write.committed` 是软件解释字段，不是 RTL 信号。`CpuState.status/reason`、`retired`、Trace id、active modules、五个观察阶段同样是宿主教学元数据。

单次 `core.step()` 计算组合结果并提交一个架构边沿。可视化观察取指、译码、执行、访存、写回五个阶段，是对同一快照的慢动作讲解；没有五个 CPU 时钟，也没有五级流水线。UI 寄存器与 PC 显示已提交状态，3D 标签显示当前快照阶段的数据。回放旧快照不回滚或写入架构状态。

## 有意存在的差异与未覆盖范围

- 软件仅执行 ADDI/ADD。其他合法 RV32I 指令会报告“Sprint 01 尚不支持”，**不表示 RTL 将其判为非法**。
- PC 越过已加载程序即停止是宿主策略。RTL 没有程序结束检测，仍依赖外部指令存储器。
- 已实现软件未对齐 / 不支持指令停止，但没有完整映射 `trap`, `trap_cause`, `fault` 的优先级及复位门控，不声称等价。
- 暂未映射 `branch_taken`, `redirect`, `target`, `jump`, `jalr`、完整分支与跳转、访存对齐、字节车道、load/store、ECALL/EBREAK/FENCE。
- 连续执行硬上限 1000 条。LW、SW、BEQ 只预留类型和内存接口，尚不可执行。
- 原始 RTL/ZIP 保留本地且被 Git 忽略，Web 工程可独立运行。未来若需要共享 RTL，另行确认授权与许可，推荐通过独立参考仓库固定版本。

## 原件 SHA-256（实现前基线）

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
