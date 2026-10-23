# Sprint 05.5 · Logisim RGB 显示设备

## 只读依据

本次读取用户原件，未复制原始工程进仓库，也未改动 FPGA 或 Logisim 文件：

- `F6：minirv显图像/minirv.circ`（Logisim-evolution 4.1.0 电路）。SHA256：`f145059a577c4e314ca3ee6b3cbf562f6181d850fc93e67c3d06a1e174096aa6`。
- 同目录 `logisimFile/vga.txt` 反汇编。SHA256：`407a89e0d88a8ceccb815620c3a94d43c59fc7ee8dc696ba408c8ced905ca86b`。
- `python转hex文件/ImportImage/importImage.py`：256×256、每像素 32 位 `00RRGGBB`，图像在字地址 `0x12bc0`（CPU 字节地址 `0x4af00`）。另核对 `python转hex文件/image_to_picture.py` 的 VGA_BASE/尺寸；它是另一种镜像生成器，未用其程序替换 ARTEMIS。
- 正式 `rtl/cpu/cpu_top.v`：字节地址、移位后的写数据、`dmem_we`/`dmem_wstrb`，无等待周期。该 RTL 只有 CPU，没有显示控制器；软件外设不代表 FPGA 升级或联合仿真完成。

## 地址和协议

| 项目 | 原电路证据 | 软件设备 |
| --- | --- | --- |
| 地址 | LSU `(1060,250)` / `(1060,340)` 常量与 unsigned Comparator，经 NOT/AND 得到 isVGA | `[0x20000000,0x20040000)`，独立于 RAM |
| 写使能 | LSU `(1410,490)`，MemWrite & isVGA → VGA_WE | 每条合法 SW 提交一次像素写 |
| 坐标 | LSU `(1370,770)` Splitter：[9:2] → VGA_X，[17:10] → VGA_Y | index=(地址−base)/4，X=index%256，Y=floor(index/256) |
| 颜色 | LSU `(1370,580)`，Rs2_data[23:0] → VGA_Data | R=[23:16]、G=[15:8]、B=[7:0]，高字节忽略 |
| 显示 | main `(1460,1660)` RGB Video：256×256、No Cursor | 2D Canvas 绘制真实设备快照，不增加 Three Renderer |
| 刷新 | VGA_WE / CLK 直接接显示器，未发现额外同步寄存器 | 写入即更新，无虚构 status/sync 寄存器 |

`__am_gpu_fbdraw` 在 `0x4c4` 构造显存地址并调用 memcpy。首次 MMIO 是 PC `0x1520` 的 `sw x6, 0(x14)`；完整运行的 65536 次设备访问全为 SW。电路未按 funct3 对 VGA 单独门控，也未提供设备读回路径。本轮只支持已验证的 **对齐 32 位 SW**；显示窗口的 SB/SH/Load 明确停止，不猜读回值，也不模仿电路可能不符合字节选通的窄写。普通 RAM 的字节/半字语义不变。

## 提交、播放和持久化

设备是 `src/core/devices/logisimDisplay.ts` 的纯不可变状态。独立 framebuffer 采用页共享，一次像素写仅复制一页。RAM、ROM 和显示缓存互不别名；非法访问在任何提交前检查，未知高地址继续报错。

`CpuState.display` 保存设备，`memoryAccess.space` 区分 ram/mmio，`mmioWrite` 记录实际坐标和颜色，原 `dmem_*` 信号不变。冻结教学板的数据通路拓扑没有外设连线；MMIO 不沿 RAM 线路代演，Trace 仍说明缺失连接，RAM 最近写入列表排除 MMIO。3D 显示器是独立 sidecar 几何，不属于 Core 拓扑。

面板绘制当前提交状态；检查历史时绘制选中 Trace.after。暂停、观察阶段、回放不产生额外写入。复位、切换或导入项目清屏。项目仍只持久化初始 ROM/RAM/寄存器，不保存运行画面，schema 不变。

## 工作台 3D 外设呈现

- 工作台新增「添加外设」入口与设备选择面板；显示设备通过会话级 `usePeripheralStore` 挂载，2D 面板与 3D 显示器仅在挂载后出现。
- 显示器是同一 CPU Canvas 内的 sidecar 几何，屏幕贴图直接读取 `CpuState.display` 的 256×256 RGB888 帧缓冲；不新建 Three Renderer，也不生成演示像素。
- 入场使用约 1.25s 的全息显影：扫描光束、网格和材质渐显；出场把最后一帧复制为模糊残影，再从屏幕中心向内收缩，使用临界阻尼弹簧，避免下坠后闪断。
- 点击屏幕或「聚焦显示器」进入显示器特写，Esc 或「返回主板」恢复相机；返回时保持 OrbitControls 最小距离连续。
- 该挂载是可视化/会话层，CPU Core 的 MMIO 地址映射仍按 Codex 基线固定；没有修改 CPU Core、Trace 语义、地址映射或显示协议。真正 fault 级热拔插解映射需要单独的 Core 任务。

## ARTEMIS 实测与验收入口

样本 SHA256：`516e087e4aeec61a0f5ae629454d99ef100b5abea5a28d65c695c13b7e4a0a8a`，142272 字，程序和原图未修改。

1. 在 ROM 装载方式选择「统一内存镜像导入（Logisim 兼容）」，选择 ARTEMIS 并确认；RAM 自动为 1 MiB。
2. 将工作台执行预算设为 **1,000,000**，点击「快速运行」，右侧逐步显示真实像素。预算不足可继续，暂停保留图像，复位清屏。普通动画运行适合教学单步，不适合生成 65K 像素。
3. 原程序结束方式是自身 halt 循环，不会自动变成 CPU“程序完成”；画面完成后可暂停。

核心实际执行到 halt 入口 `0xdb0`：退休 **623497** 条，显示写 **65536** 次，覆盖所有像素。完整 framebuffer 与原镜像 `[0x4af00,0x8af00)` 的 RGB 数据逐字节一致，SHA256 均为 `82e90009a599efa5eee82395f3848aef378e8a2ba3873ae829c6ac109f1482d8`，非黑像素 39273。验证脚本在该入口停止采样，没有向 CPU 注入停机或修改 PC；产品保持可续执行预算。

类型检查和 6 个相关文件共 **200 项测试**通过，覆盖 RV32I 三个小程序、RAM、统一导入、设备/Trace、暂停回放复位。未运行完整 E2E。

限制：无 UART、键盘、计时器、VGA 硬件时序、设备读回、窄写或控制寄存器；运行 ROM/RAM 仍独立，不支持自修改代码。渲染速度受既有 V3 场景及设备性能影响，模拟器预算不变。
