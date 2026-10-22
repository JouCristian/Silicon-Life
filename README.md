# 芯生 / Silicon Life

基于真实 RV32I 单周期架构的三维交互教学网站。Sprint 03 支持 **ADDI、ADD、LW、SW、BEQ** 的自定义程序、ROM / RAM HEX 导入导出、初始内存配置、RTL 信号快照和连续可逆的芯片展开。

仓库：[JouCristian/Silicon-Life](https://github.com/JouCristian/Silicon-Life)，生产环境：[silicon-life.vercel.app](https://silicon-life.vercel.app/)。PR #1、#2 已合并；本轮从最新 main `1e3a81e` 创建 `feat/sprint-03-program-memory`，只进行本地开发和验证，未推送、未创建 PR、未触发生产部署。未连接 v0。

## 本地运行

要求 Node.js 22.12+ 与 npm（验证使用 Node 24）。

```sh
npm ci
npm run dev
```

打开终端地址，默认 http://127.0.0.1:5173。点击「进入芯片」或模型，选择教学程序，再点击「运行」。

| 教学程序 | 真实执行结果 | 提交数 |
| --- | --- | --- |
| 第一次加法 | x1=5、x2=7、x3=12、PC=12 | 3 |
| 内存读写 | M[64]=42、字节 `2a 00 00 00`、x3=42、PC=16 | 4 |
| 条件分支 | BEQ 成立，跳过写入 99，x3=42、PC=20 | 4（程序 5 条） |

```asm
# 内存读写
addi x1, x0, 64
addi x2, x0, 42
sw   x2, 0(x1)
lw   x3, 0(x1)

# 条件分支
addi x1, x0, 5
addi x2, x0, 5
beq  x1, x2, 8
addi x3, x0, 99
addi x3, x0, 42
```

## 操作与语义

- 选择程序条目编辑操作数，即时查看 I/R/S/B 型 32 位机器码。应用或切换程序会复位。
- 寄存器可切有符号十进制 / 十六进制；复位后可设置 x1–x31。x0 恒为 0。
- 数据内存为 1024 字节，小端，LW/SW 按 4 字节对齐访问。支持 8/32 位初始数据编辑、初始 / 运行视图、DEC/HEX 和相邻字节观察；Δ 标记运行期间的差异。复位恢复用户初始 RAM 与寄存器，修改或切换程序也保留配置。
- 「单步指令」提交一个架构边沿，随后讲解同一快照。「暂停 / 暂停讲解」冻结播放，「继续讲解」继续快照，「回放」从取指重新观察。均不重复写回或存储。
- 五个阶段是教学观察，**不是五个时钟周期或流水线**。脉冲时间依据示意线路长度安排，不代表真实门延迟。
- 蓝色表示数据、浅金表示控制、青绿色表示写回；来源均为 Core 的 Trace。专业模式显示 RTL 原名信号。
- 鼠标拖动、滚轮、右键分别旋转、缩放、平移；「恢复视角」连续回到教学位置。首页与工作台共享固定 Canvas，支持反向与中途反转。
- 尊重 reduced-motion，也响应页面打开后偏好的改变；简化动画后仍可执行所有程序。
- 连续执行上限 1000 条。未对齐访存或成立分支的未对齐目标会停止，错误指令不部分提交。内存越界是宿主检查，不冒充 RTL Trap。

## Sprint 02.1 工作台验收

- 桌面宽 ≥1100px、高 ≥700px 时，Header / 主体 / Footer 组成 `100dvh` 工作台；程序、状态、中央下方讲解三个区域独立原生滚动，3D 区始终可见。空间不足时切换顺序布局，允许 document 滚动，所有内容仍可访问。
- 拖动两条竖分隔线调整栏宽，拖动中间横分隔线调整 3D 与讲解高度。方向键微调，Shift 加速；双击或 Home 恢复该条分隔线。比例不跨会话保存，窗口变化时受最小尺寸约束。
- 仅在真正的 3D 区域内滚轮缩放、拖动旋转/平移。侧栏、Trace 和 Header 不控制镜头；首页芯片仍可点击和旋转。所有尺寸变化保留同一 Canvas。
- 先「单步指令」提交真实 CPU 状态，然后选择阶段并点击「单步传递」；每次传播一组真实 Trace 连接并停住。并行信号一起观察，空阶段跳过。完成提示后可回放、切换阶段或执行下一条。
- 「暂停讲解 / 继续讲解」冻结或恢复当前事件；「回放」重置为整条指令的自动讲解。阶段切换重置传递游标。以上操作不会增加 retired，也不会再次写寄存器、PC 或内存。
- 「传播速率」默认 0.50×，支持 0.25 / 0.50 / 0.75 / 1.00 / 1.50 / 2.00×。中途修改不重置逻辑时间；不改变 Core 结果。减弱动态效果使用简化端点，保留操作与完成反馈。

## Sprint 03 本地验收

- 「程序管理」新建空白程序，新增、在前插入、删除、上移 / 下移，并选择指令编辑。预设可复制为自定义，恢复操作回到最近新建 / 复制 / 导入时的初始程序。当前会话保留一个自定义程序，最多 256 条；刷新不会持久化。
- 程序列表自动重算 PC 地址，显示机器码、执行标记和 BEQ 目标。改变排列不自动重写分支立即数，范围 / 对齐提示需用户检查。
- 打开「ROM HEX 导入 / 导出」，选择 [arithmetic.hex](examples/arithmetic.hex)，检查预览后确认并运行，x3=12。可替换或追加；非法格式、未支持指令、超限导入不改写现有程序。
- 复位后在「编辑初始 RAM」将字节地址 64 的 32-bit 数据设为 42；新建一条 `lw x3, 64(x0)`（HEX `04002183`），单步后 x3=42。也可导入 [memory-init.hex](examples/memory-init.hex)：RAM 宽度 **32-bit**、起始字节地址 **0**，结果相同。执行 SW 后复位可观察数据恢复。
- ROM / 初始 RAM 均可导出 `v2.0 raw`；RAM 支持 8/32 位往返。详细语法、容量及内存映射见 [HEX_FORMAT](docs/HEX_FORMAT.md)。所有导入仅在浏览器本地处理。
- 演示 / 专业模式改用 React Bits JellyRadio，支持方向键、Home / End 与焦点；首页 GradientASCII 低密度背景保持芯片为主体，离开首页释放资源，reduced-motion / WebGL2 不可用时静态降级。CPU 仍保持单一持久 Canvas；首页另有一个独立装饰 Canvas。[来源与许可证](docs/THIRD_PARTY.md)。
- 未来 MMIO 仅完成 [架构规划](docs/ARCHITECTURE.md)，本轮无设备、地址常量或 Core 总线重构。

## 验证与构建

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run preview
```

本机浏览器安装在项目内，验收前使用：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.local/browsers"
npm run test:e2e
```

E2E 保存首帧、中段、结束、反向截图及逐帧 JSON 到 `.local/`。帧检查验证连续性和状态边界，不能替代真实设备的视觉与性能评审。完整记录见 [VALIDATION](docs/VALIDATION.md)。

生产输出为 `dist/`，可部署到 Vercel 静态托管或 Linux Nginx。默认域名根路径；子路径托管需配置 Vite `base`。本轮没有推送或运行远程 CI，本地通过不代表远程 Actions 已通过。

## 工程边界

CPU Core 无框架依赖；`src/io/` 提供程序 / HEX / 初始 RAM 纯函数；Store 原子协调初始配置、提交和播放；`src/motion/` 统一时间、弹簧、传播调度；场景拓扑在 `src/scenes/topology.ts`。协作见 [AGENTS](AGENTS.md)、[V0_COLLAB](docs/V0_COLLAB.md)，信号依据见 [RTL_MAPPING](docs/RTL_MAPPING.md)，贡献见 [AI_USAGE_LOG](docs/AI_USAGE_LOG.md)。

`rtl/`、`package/` 保持只读且不进入 Web 仓库。无 Testbench，未完成 RTL 联合仿真；不声称完整 RV32I、完整 Trap、CSR 或外部 FPGA 等价。没有后端、持久化、流水线和聊天系统。Three 共享包仍较大，构建会提示体积警告。

如本机镜像缓存冲突，可用 `npm ci --registry=https://registry.npmjs.org --cache .local/npm-cache`，无需修改全局配置。
