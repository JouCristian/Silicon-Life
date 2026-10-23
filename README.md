# 芯生 / Silicon Life

DeepSeek V3 芯片视觉已在本分支完成：完整封装、电影化解构与可读的教学电路板共用既有单 CPU Canvas、连续转场和真实教学数据通路。实现、截图与验证见 [CHIP_V3_VISUAL](docs/CHIP_V3_VISUAL.md)；V2 集成记录见 [CHIP_V2_INTEGRATION](docs/CHIP_V2_INTEGRATION.md)。原型目录为冻结参考，其 UI、DemoModules 和相机控制不进入正式场景。

基于真实 RV32I 单周期架构的三维交互教学网站。Sprint 03.1 支持 **ADDI、ADD、LW、SW、BEQ** 的最多 10 个本地项目、65536 条 ROM、1/64/256 KiB RAM、IndexedDB 自动保存和 JSON / HEX 备份、RTL 信号快照和连续可逆的芯片展开。

仓库：[JouCristian/Silicon-Life](https://github.com/JouCristian/Silicon-Life)，生产环境：[silicon-life.vercel.app](https://silicon-life.vercel.app/)。PR #1、#2、#3 已合并；`feat/chip-v3-visual` 完整包含 V2 集成 `aae1c46` 和 V3 人工验收冻结 `f218079`。GitHub 集成范围、历史原型归档、分支禁部署与标签策略见 [V3_GITHUB_INTEGRATION](docs/V3_GITHUB_INTEGRATION.md)。本地冻结 Tag 保留，不自动合并或部署。未连接 v0。

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

- 三个示例只读，点击「复制为我的项目」后编辑。选择指令编辑操作数，查看 I/R/S/B 型 32 位机器码；应用或切换项目会复位。
- 寄存器可切有符号十进制 / 十六进制；复位后可设置 x1–x31。x0 恒为 0。
- 数据内存可选 1 / 64 / 256 KiB，小端，LW/SW 按 4 字节对齐访问。支持 8/32 位初始数据编辑、初始 / 运行视图、DEC/HEX 和相邻字节观察；Δ 标记运行期间的差异。复位恢复用户初始 RAM 与寄存器，修改 ROM 保留配置，切换项目恢复各自独立的配置。
- 「单步指令」提交一个架构边沿，随后讲解同一快照。「暂停 / 暂停讲解」冻结播放，「继续讲解」继续快照，「回放」从取指重新观察。均不重复写回或存储。
- 五个阶段是教学观察，**不是五个时钟周期或流水线**。脉冲时间依据示意线路长度安排，不代表真实门延迟。
- 蓝色表示数据、浅金表示控制、青绿色表示写回；来源均为 Core 的 Trace。专业模式显示 RTL 原名信号。
- 鼠标拖动、滚轮、右键分别旋转、缩放、平移；「恢复视角」连续回到教学位置。首页与工作台共享固定 Canvas，支持反向与中途反转。
- 尊重 reduced-motion，也响应页面打开后偏好的改变；简化动画后仍可执行所有程序。
- 本次执行预算可选 1000 / 10000 / 100000 / 1000000 步，到达预算暂停，可继续；「快速运行」分批执行并允许暂停。历史只保留最近 128 条。未对齐访存或成立分支的未对齐目标会停止，错误指令不部分提交。内存越界是宿主检查，不冒充 RTL Trap。

## Sprint 02.1 工作台验收

- 桌面宽 ≥1100px、高 ≥700px 时，Header / 主体 / Footer 组成 `100dvh` 工作台；程序、状态、中央下方讲解三个区域独立原生滚动，3D 区始终可见。空间不足时切换顺序布局，允许 document 滚动，所有内容仍可访问。
- 拖动两条竖分隔线调整栏宽，拖动中间横分隔线调整 3D 与讲解高度。方向键微调，Shift 加速；双击或 Home 恢复该条分隔线。比例不跨会话保存，窗口变化时受最小尺寸约束。
- 仅在真正的 3D 区域内滚轮缩放、拖动旋转/平移。侧栏、Trace 和 Header 不控制镜头；首页芯片仍可点击和旋转。所有尺寸变化保留同一 Canvas。
- 先「单步指令」提交真实 CPU 状态，然后选择阶段并点击「单步传递」；每次传播一组真实 Trace 连接并停住。并行信号一起观察，空阶段跳过。完成提示后可回放、切换阶段或执行下一条。
- 「暂停讲解 / 继续讲解」冻结或恢复当前事件；「回放」重置为整条指令的自动讲解。阶段切换重置传递游标。以上操作不会增加 retired，也不会再次写寄存器、PC 或内存。
- 「传播速率」默认 0.50×，支持 0.25 / 0.50 / 0.75 / 1.00 / 1.50 / 2.00×。中途修改不重置逻辑时间；不改变 Core 结果。减弱动态效果使用简化端点，保留操作与完成反馈。

## Sprint 03.1 操作与验收

1. 在「当前项目」直接新建、复制、重命名或删除。最多 10 个自定义项目，不计三个内置只读示例。删除需确认。每个项目独立保存 ROM、初始 RAM、32 个初始寄存器、RAM 容量和版本 / 时间信息。
2. 修改配置后显示「正在保存…」，只有 IndexedDB 事务成功后才显示「已保存到本机」。刷新恢复项目列表和最近选择，CPU 从初始配置重启，不恢复运行状态或 Trace。关闭前等待保存完成；失败 / 未完成时离开会提示，失败项目仍可导出 JSON。
3. 「项目 JSON 备份」导出完整项目，重新导入会创建独立副本，避免覆盖现有项目。**浏览器本地保存不是云同步**，不同设备、不同域名之间不会同步，清理网站数据可能删除项目。请定期备份。
4. ROM 最多 **65536 条 / 256 KiB**，列表每页 16 条；支持按十进制 / `0x` PC 地址跳转，机器码地址 +4。排序不会自动修改 BEQ 偏移，目标提示需要检查。✓ 标记最近保留的执行记录。
5. ROM 文件通过「导入 ROM」打开，选择文件 → Worker 解析 → 预览 → 确认替换或追加。默认保留所有合法 unsigned32 原始字，未知指令明确标注，运行到它时按 PC / 机器码安全停止。可勾选严格模式拒绝未支持指令。格式错误或超限不替换原项目。
6. RAM 明确分为「初始 RAM · 配置」和「运行 RAM · 只读」。初始模式支持 8/32 位编辑、地址跳转、HEX 导入导出、容量调整和确认清空。执行后先复位再配置；缩小容量需确认。运行模式只读，Δ、字节排列与最近写入地址帮助观察，Reset 恢复初始数据。
7. 「运行」逐条讲解；「快速运行」跳过逐条动画，批次最多 512 条 / 约 8ms，逐帧让出主线程。两者使用同一 Core.step，只有提交产生状态，回放不重复执行。预算用尽保留 ready 状态，允许用户继续。

[arithmetic.hex](examples/arithmetic.hex) 导入 ROM 后得到 x3=12。导入 [memory-init.hex](examples/memory-init.hex) 时，RAM 选择 **32-bit、起始字节地址 0**，再创建一条 `lw x3, 64(x0)`（`04002183`），得到 x3=42。详细格式见 [HEX_FORMAT](docs/HEX_FORMAT.md)，存储和容量设计见 [ARCHITECTURE](docs/ARCHITECTURE.md)，性能实测见 [VALIDATION](docs/VALIDATION.md)。

ROM / RAM 共用自定义文件按钮，文件名单独省略显示并可悬停查看完整名称，支持重新选择同名文件。所有解析只在本机进行，无后端。React Bits 保持 Sprint 03 的集成；V3 只升级 3D 场景视觉，不改动其语义与 Canvas 生命周期。[来源与许可证](docs/THIRD_PARTY.md)。MMIO 仍仅架构规划。

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

`rtl/`、`package/` 保持只读且不进入 Web 仓库。无 Testbench，未完成 RTL 联合仿真；不声称完整 RV32I、完整 Trap、CSR 或外部 FPGA 等价。没有后端、云同步、流水线和聊天系统；本地持久化只保存项目配置。Three 共享包仍较大，构建会提示体积警告。

如本机镜像缓存冲突，可用 `npm ci --registry=https://registry.npmjs.org --cache .local/npm-cache`，无需修改全局配置。
