# V3 CI 专项排查 · 2026-10-23

**未解决，暂不能安全更新 PR #4 的运行时代码。** 按用户规定，两次修复尝试后停止；失败候选已归档并回退。本次提交仅记录诊断，未改变冻结版视觉、Core、Trace、RTL、测试或依赖。没有 Push、Merge、部署或移动 Tag。

## 远程证据

基线 `1e2758476b2b24fcd68221fc8bab6acdbdcc288d`，分支 `feat/chip-v3-visual`；Tag `v3-visual-freeze` 仍指向 `f2180794a22c8e120a6df371d5a71d0dc8fdb991`。

- [Push CI](https://github.com/JouCristian/Silicon-Life/actions/runs/39838129497)：21/24 E2E。lab 等待运行按钮禁用超出 90s 总时限；reveal 5s 后仍为 0；ASCII 用例进入按钮点击超时。lab 的 x3=12、PC=0x0c 已通过。
- [PR CI](https://github.com/JouCristian/Silicon-Life/actions/runs/39838291518)：20/24 E2E。lab 工作台截图超出 90s 总时限；reveal 仍为 0；Trace 用例运行后 5s 内 x3 仍为 0（期望 42）；ASCII 用例 5s 内 chip-ready 尚未出现。
- 两次云端 typecheck、113 项单元测试、build 均通过。这些是既有运行结果，不是本轮新执行的完整矩阵。
- 本轮重新读取 PR job `120032288006` 的实际日志，读取下载的 Push artifact 错误上下文与逐帧证据。

## 已定位与尚未闭环的原因

1. **本机识别正确。** 实际 context 为 `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`。CPU 已走 compat/Matcap，Waves 没有存活 Canvas。不能仅凭本机证明云端驱动识别也完全一致。
2. **软件预算不完整。** compat 仅改变芯片材质/时长；CPU 仍按全视口渲染。1440×1000 视口实测 CPU buffer 1440×1000、ASCII 1221×755。ASCII 仍为双 pass、20 FPS 和独立 interval；暂停条件依赖 reveal 已进入中途，不能保护初始化及第一帧。Waves 已有软件回退，并非本机持续绘制负载源。
3. **慢帧时间被丢弃。** `CpuScene.tsx` 的 `Math.min(dt, .05, targetAge)` 把每个 500ms 帧只记为 50ms。此条件下 1.6s 机械段需约 16s，`.12s` lead-in 至少要三帧。它不改变 CPU 结果，但放大渲染阻塞造成的等待。
4. **首次教学平面绘制存在帧空洞。** 候选消耗真实 dt 后，一次约 846ms 间隔使 reveal 从 0.08 到 0.91；提前编译/纹理上传后仍有约 1021ms 间隔，0.1467 到 0.9696，未满足已有 `(0.15, 0.85)` 中间帧断言。不能放宽该断言。
5. **云端共同根因尚未完全闭环。** 启动、首次绘制和背景负载竞争能解释多个等待点受影响，但缺少 Linux runner GPU/任务时间线，不能将每个超时唯一归因到 shader 编译，也不能将 CPU 等待失败直接判作 ISA 错误或仅测试时序问题。

## 有限验证与两次尝试

同一机器、Chromium 156.0.8078.4（Playwright revision 1248）、单 worker、原配置 SwiftShader flags。浏览器下载遇到 TLS 错误，缓存路径的可执行文件不能 spawn；从同一官方 URL 下载并在 `.local/chromium-verified/` 解压后可启动。临时配置只覆盖 executablePath，未改变 timeout、断言、浏览器 flags 或正式配置。

```powershell
npx playwright test --config .local/playwright-local.config.ts e2e/lab.spec.ts e2e/motion.spec.ts e2e/react-bits.spec.ts --grep 'real program, trace replay|forward, reverse and interrupted|trace pulses travel|ASCII lifecycle'
```

| 版本 | 四用例结果 | 结论 |
| --- | --- | --- |
| 未修改基线 | 4/4，约 1.5min | 云端失败未在本机原样稳定复现 |
| 尝试 1 | 3/4，约 1.1min | 限制软件像素/ASCII 5FPS，取消软件 interval，真实 dt；缺少拆解中间帧 |
| 尝试 2 | 2/4，约 1.2min | 增加同 renderer 的 compileAsync/initTexture 预热；仍缺中间帧，另出现 `Cannot read properties of undefined (reading 'isReady')` pageerror |

第二次 pageerror 是候选引入的问题，不能算作冻结版原有 BUG。涉及 Three.js 异步编译轮询期间 material/program 生命周期，尚未隔离定位；候选已全部回退。

单次对照采样（非统计基准，不代表云端）：

| 指标 | 原版 | 尝试 1 | 尝试 2 |
| --- | ---: | ---: | ---: |
| chip-ready | 2313ms | 2778ms | 2813ms |
| 首页截图 | 969ms | 812ms | 956ms |
| reveal 至 >.995 | 4662ms | 2117ms | 2151ms |
| 首页帧间隔中位数 | 166.6ms | 91.6ms | 83.3ms |
| CPU buffer | 1440×1000 | 576×400 | 576×400 |
| ASCII buffer | 1221×755 | 366×226 | 366×226 |

降负载改善了帧间隔与 reveal 总时间，但没有改善就绪时间，也没通过连续性断言，不足以交付。两次候选 typecheck 均通过；新增候选测试随补丁归档，未声称通过。四用例门槛未通过，遵守停止条件，**没有继续执行单元测试、生产构建或完整 E2E 矩阵**，没有第三次修复尝试或盲目重跑。

## 本地归档与阻碍

忽略目录内保留：

- `.local/render-probe.mjs`、`probe-before.json`、`probe-after.json`、`probe-warmed.json` 和对应首页截图。
- `.local/v3-push-evidence.zip`：远程证据。
- `.local/v3-ci-investigation/attempt-02/candidate.patch`：完整失败候选（含新增测试），未应用在正式文件树。
- 同目录 `forward-frames.json`、`reveal-error-context.md`、`trace-error-context.md`：第二次失败证据。

后续若另行授权继续，应先在可控 Linux/SwiftShader 环境分别测量模型构造、shader/link、纹理/顶点 buffer 上传、首次绘制和 screenshot readback，并隔离异步预热与动态 Trace 材质的生命周期边界。先解决首次绘制空洞，再处理慢帧推进；不能用更长 timeout、跳过中间帧或修改 CPU 期望值完成验收。

本轮未上传候选，GitHub CI 仍保留既有失败状态。只可分享诊断结论，不能宣称 [PR #4](https://github.com/JouCristian/Silicon-Life/pull/4) 已修好或可安全合并。
