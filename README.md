# 芯生 / Silicon Life

基于真实 RV32I 单周期架构的三维交互教学网站。Sprint 02 支持 **ADDI、ADD、LW、SW、BEQ**，包含三组真实程序、小端数据内存、RTL 信号快照和连续可逆的芯片展开。

仓库：[JouCristian/Silicon-Life](https://github.com/JouCristian/Silicon-Life)。Sprint 02 已创建 [PR #1](https://github.com/JouCristian/Silicon-Life/pull/1)，保持未合并。Sprint 02.1 继续在 `feat/sprint-02` 本地修订，尚未 Push 或部署。未连接 v0。

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
- 数据内存为 1024 字节，默认清零，小端、按 4 字节对齐访问。面板列出低到高地址的字节，复位清空内存。
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

生产输出为 `dist/`，可部署到 Vercel 静态托管或 Linux Nginx。默认域名根路径；子路径托管需配置 Vite `base`。Sprint 02 的实际 CI 已通过；Sprint 02.1 尚未推送，因此没有本轮远程 CI 结果。

## 工程边界

CPU Core 无框架依赖；Store 协调提交和播放；`src/motion/` 统一时间、弹簧、传播调度；场景拓扑在 `src/scenes/topology.ts`。协作见 [AGENTS](AGENTS.md)、[V0_COLLAB](docs/V0_COLLAB.md)，信号依据见 [RTL_MAPPING](docs/RTL_MAPPING.md)，贡献见 [AI_USAGE_LOG](docs/AI_USAGE_LOG.md)。

`rtl/`、`package/` 保持只读且不进入 Web 仓库。无 Testbench，未完成 RTL 联合仿真；不声称完整 RV32I、完整 Trap、CSR 或外部 FPGA 等价。没有后端、持久化、流水线和聊天系统。Three 共享包仍较大，构建会提示体积警告。

如本机镜像缓存冲突，可用 `npm ci --registry=https://registry.npmjs.org --cache .local/npm-cache`，无需修改全局配置。
