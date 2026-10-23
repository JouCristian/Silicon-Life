# Sprint 05 · RV32I 软件执行

实现完整基础整数 ISA 的 40 条指令编码、译码、执行及快照。ROM 仍按需分配，最多 262144 字 / 1 MiB；RAM、10 项目、IndexedDB、V3 模型、相机和教学板几何保持原有行为。

| 类别 | 支持指令 |
| --- | --- |
| 高位立即数 | LUI、AUIPC |
| 寄存器 ALU | ADD、SUB、SLL、SLT、SLTU、XOR、SRL、SRA、OR、AND |
| 立即数 ALU | ADDI、SLTI、SLTIU、XORI、ORI、ANDI、SLLI、SRLI、SRAI |
| 分支 | BEQ、BNE、BLT、BGE、BLTU、BGEU |
| 跳转 | JAL、JALR |
| 读取 | LB、LH、LW、LBU、LHU |
| 写入 | SB、SH、SW |
| 内存屏障及环境 | FENCE、ECALL、EBREAK |

U 型编辑器操作数为 **20 位字段** 0…1048575，执行时左移 12 位。JAL / 分支为 PC 相对字节偏移；JALR 使用旧 rs1 + 有符号立即数、清除 bit0，再检查 IALIGN=32。移位寄存器只使用低 5 位，移位立即数限 0…31。LB/LH 符号扩展、LBU/LHU 零扩展；RAM 小端，半字/字自然对齐，越界或错位不部分写入。

## 最小人工验收

本地 `npm run dev -- --port 5180`，访问 `http://127.0.0.1:5180/`。进入工作台，在 ROM 导入以下文件，选择替换，可勾选严格模式。运行或快速运行到最后的系统指令：

| 文件 | 结果 | 预期停止 |
| --- | --- | --- |
| `examples/sprint05/sum-call.hex` | x3=16、x5=12、x6=40、M[64]=16；循环、调用/返回、LUI/AUIPC、移位/比较 | EBREAK，PC=60，退休 27 条 |
| `examples/sprint05/byte-half.hex` | x3=128、x4=0xffffff80、x5=0xffff8000、x6=32768、M[64]=0x80000080 | EBREAK，PC=36，退休 9 条 |
| `examples/sprint05/logic-compare.hex` | x3=64、x4=x5=x6=1、x10=32、M[64]=32 | ECALL，PC=44，退休 11 条 |

面板的系统 Trap 停止是上述程序的**预期终点**，不是执行失败。可从历史中回放、单步传递，寄存器/RAM 不再提交；复位恢复初始配置。机器码支持检查通过不表示程序具备完整运行环境。

## 执行和 Trace 边界

- 一次 step 提交一条指令；五阶段仍是已计算快照的观察，不是五周期。
- FENCE 在无并发、无缓存、无设备 I/O 的单核有序模型中是屏障空操作，PC+4，正常退休。保留 pred/succ/fm/rd/rs1 编码，忽略保留字段的语义；不实现 FENCE.I（Zifencei）。
- ECALL 按现有 RTL 的 machine-mode 教学约定使用 cause=11，EBREAK cause=3。二者保持 PC、寄存器、RAM 和 retired，生成可回放的非退休 Trap Trace 并停止至复位。没有 OS、syscall 服务、CSR、特权模式切换或异常向量。Trace id 为尝试编号，Trap 不计入 retired。
- 非法/扩展指令 cause=2，取指/跳转错位 cause=0，load/store 错位 cause=4/6；保持原有故障原子性。宿主 RAM 越界不伪造 RTL 总线错误端口。非法指令和访存故障维持原先无成功 Trace 的约定，原因保存在 CpuState。
- `signals` 使用已读取 RTL 的控制编码，包括 jump/jalr、WB_PC4、ALU 操作、字节选通及系统 Trap。信号中的 raw rs1/rs2/IMM_I 即使未选用也不被重写成教学假值。
- 既有连线覆盖范围内的 transfer 全部来自真实 snapshot。冻结教学板缺少 ALU A 的 PC/零源选择、PC+4→WB_PC4、JALR 的 ALU→Next PC 和跳转专用控制线；这些值仍在 signals 中，并由 visualizationOmissions 明示，**不借用其他物理线路演示**。几何和 V3 动画不变。

## RTL 与范围限制

只读检查了 `rtl/cpu/` 的 8 个文件，原 RTL 已含上述 RV32I 控制路径，不需要升级；SHA-256 与历史映射记录一致。Icarus 语法编译通过，但**未进行 Testbench 联合仿真、波形对比或形式等价验证**，不能声称软硬件完全等价。

不含 M/A/C、Zicsr、Zifencei、MMIO、图像显示设备、动态 ELF 装载或操作系统。既有 ROM 起点为 PC=0，指令/数据分离；跳出加载 ROM 按宿主策略停止，RAM 仍为 1/64/256 KiB。大程序可能需要更大的地址空间、初始 RAM 或外设，即使全部指令属于 RV32I，也不保证可以运行出图。

类型检查通过；最终 9 个相关测试文件、232 项单元测试通过，覆盖 40 条独立编码向量、BigInt ALU 边界、跳转/分支对齐、字节选通、非退休 Trap、三个小程序、回放及 1 MiB ROM/项目往返。RTL 仅语法编译通过。没有完整 E2E、长期性能测试或新一轮视觉验收。
