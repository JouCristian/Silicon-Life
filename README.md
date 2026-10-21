# 芯生 / Silicon Life

真实 RV32I 单周期 CPU 的三维交互教学网站。Sprint 01 支持 ADDI、ADD，可执行三条指令、观察 Trace，并从线框芯片进入 2.5D 数据通路。

## 本地运行

要求 Node.js 22.12+（开发验证使用 Node 24）与 npm。

```sh
npm ci
npm run dev
```

打开终端显示的地址，默认 http://127.0.0.1:5173。点击「进入芯片」或芯片模型进入工作台，点击「运行」执行完整程序。「单步指令」每次提交一条指令，再播放同一快照的五个概念观察阶段。

```asm
addi x1, x0, 5
addi x2, x0, 7
add  x3, x1, x2
```

最终 x0=0、x1=5、x2=7、x3=12、PC=0x0000000c、已提交 3 条。机器码分别为 `0x00500093`、`0x00700113`、`0x002081b3`。

## 使用

- 选中程序条目，修改 ADDI/ADD、源/目标寄存器及立即数，实时查看 32 位编码。应用后复位。
- 寄存器区可切十进制有符号 / 十六进制，复位后可设置初始 x1–x31。x0 恒为 0。
- 拖动旋转、滚轮缩放、右键平移，「恢复视角」回到教学视角。
- 观察阶段按钮、暂停与回放只操作 Trace；不会重新写回。架构状态面板始终显示真实已提交结果。
- 演示模式解释阶段，专业模式增加对应 RTL 的真实信号快照。
- 连续执行最多 1000 条；程序越界、故障或达到上限停止。

## 检查与构建

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

浏览器端验收：

```sh
npx playwright install chromium
npm run test:e2e
```

生产输出为 `dist/`，可部署到 Vercel 静态托管或 Linux Nginx。当前未发布、未 Push。默认托管在域名根路径；部署子路径时配置 Vite `base`。

## 工程与协作

`src/core/` 是无框架 CPU 与 Trace 契约；`src/stores/` 是执行和播放协调；`src/scenes/` 是 Three.js；`src/components/`、`src/styles/` 是 UI。完整映射见 [RTL_MAPPING](docs/RTL_MAPPING.md)，协作边界见 [AGENTS](AGENTS.md) 与 [V0_COLLAB](docs/V0_COLLAB.md)，AI 贡献见 [AI_USAGE_LOG](docs/AI_USAGE_LOG.md)。

用户提供的 `rtl/` 与 `package/` 只读并被 Git 忽略，不影响独立启动。当前只读取 RTL，无 Testbench，未进行 RTL 联合仿真。LW/SW/BEQ 仅保留类型接口，其他 RV32I 指令尚不支持。首轮不含完整手册、流水线或聊天系统。

若本机 npm 镜像缓存损坏，可使用项目内缓存重试：`npm ci --registry=https://registry.npmjs.org --cache .local/npm-cache`，无需修改全局配置。
