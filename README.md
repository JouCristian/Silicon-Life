# 芯生 / Silicon Life

基于真实 RV32I 单周期架构的三维交互教学网站。Sprint 02 支持 **ADDI、ADD、LW、SW、BEQ**，包含三组真实程序、小端数据内存、RTL 信号快照和连续可逆的芯片展开。

仓库：[JouCristian/Silicon-Life](https://github.com/JouCristian/Silicon-Life)。Sprint 01 已由用户推送到 `main`；Sprint 02 在 `feat/sprint-02` 本地开发，本轮 Push、PR、Merge 均需用户确认。未连接 v0。

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

生产输出为 `dist/`，可部署到 Vercel 静态托管或 Linux Nginx。默认域名根路径；子路径托管需配置 Vite `base`。本轮未部署。CI 已配置，本轮分支尚未推送，因此未运行本轮 GitHub Actions。

## 工程边界

CPU Core 无框架依赖；Store 协调提交和播放；`src/motion/` 统一时间、弹簧、传播调度；场景拓扑在 `src/scenes/topology.ts`。协作见 [AGENTS](AGENTS.md)、[V0_COLLAB](docs/V0_COLLAB.md)，信号依据见 [RTL_MAPPING](docs/RTL_MAPPING.md)，贡献见 [AI_USAGE_LOG](docs/AI_USAGE_LOG.md)。

`rtl/`、`package/` 保持只读且不进入 Web 仓库。无 Testbench，未完成 RTL 联合仿真；不声称完整 RV32I、完整 Trap、CSR 或外部 FPGA 等价。没有后端、持久化、流水线和聊天系统。Three 共享包仍较大，构建会提示体积警告。

如本机镜像缓存冲突，可用 `npm ci --registry=https://registry.npmjs.org --cache .local/npm-cache`，无需修改全局配置。
