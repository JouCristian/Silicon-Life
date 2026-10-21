# Sprint 02 验证记录

日期：2026-10-22（Asia/Shanghai）。Windows，Node v24.15.0、npm 11.12.1，Chromium 156 / Playwright，SwiftShader 软件 WebGL。

## 基线与阶段顺序

先读取工作区、规范、产品、设计、映射和源码，再 fetch origin。main 与 origin/main 均为 Sprint 01 的 `9594414`；保留原有未跟踪 `.vite/`，从 main 创建 feat/sprint-02。

基线 23 项单元测试、类型检查和构建通过。首次浏览器基线的普通动画用例在冷加载三维标签时超过 5 秒，另一用例通过；把三维资源加载等待改为 20 秒后通过。没有删除断言或改变 CPU 基准。

A 阶段完成并通过 45 项单元测试、3 条浏览器验收、类型检查和构建，保存本地提交 `6e24efc`，之后才实施 B 动效阶段。

## 最终检查

| 命令 / 检查 | 结果 |
| --- | --- |
| npm run typecheck | 通过 |
| npm test | 4 个测试文件，48 项通过 |
| npm run build | 通过；Three 共享包 1,168.42 KB，gzip 327.41 KB，保留体积警告 |
| npm run test:e2e | 5 条浏览器验收通过，单 worker 避免软件 WebGL 争抢 |
| 开发服务器 | http://127.0.0.1:5173/，HTTP 200 |
| 页面 pageerror / console.error | 最终验收捕获为 0 |
| RTL 完整性 | 8 个原件 SHA-256 与 Sprint 01 基线相同 |

## 三个实际程序

| 程序 | 结果 | 执行地址 |
| --- | --- | --- |
| 算术 | x1=5、x2=7、x3=12、PC=12，提交 3 条 | 0、4、8 |
| 内存 | M[64]=42，低到高字节 2a 00 00 00，x3=42、PC=16，提交 4 条 | 0、4、8、12 |
| 分支 | BEQ 成立，跳过写 99，x3=42、PC=20，提交 4 条 | 0、4、8、16 |

结果同时经过 Core 和实际页面执行验证。BEQ 不成立的测试将 x2 改为 6，执行地址为 0、4、8、12、16；负向分支形成真实循环并在预算处停止。

## 正确性覆盖

- 已知独立机器码对照：LW 0000a183、SW 0020a023、BEQ 00208463，以及负偏移和 B 型极值。
- I/S/B 编码译码，穷举所有 4096 个 I/S 立即数和 4096 个偶数 B 偏移的往返；奇数 / 越界立即数拒绝。
- 150 组 32 位加法对 BigInt 独立求和结果验证；负数和高位 word、地址回绕均有测试。
- 小端字节顺序、字节选通 API、最后合法字地址、负地址偏移、未对齐和越界。
- 异常保持 PC、寄存器、内存对象和 retired 不变；LW 到 x0 仍验证访存，SW 不写原始 rd 位。
- 成立 / 不成立、前向 / 后向 BEQ；仅成立时检查目标对齐；Zustand 连续执行的 1000 条上限和 Core 预算。
- 复位清空内存和寄存器；暂停、继续历史快照、回放、阶段检查不重复提交；旧快照内存保持原值。
- transfer 的 value 与其真实 snapshot 信号一致，每条 transfer 有实际几何；先后组不颠倒。

## 动画与交互覆盖

- 固定全视口 Canvas 的 DOM 身份和尺寸在正向、反向、中途反转后保持相同。
- 正向与反向各约 1.8 秒 rAF 采样，包含首帧、中段、结束；以三维自身的 renderTime 计算坐标变化，排除采样回调与渲染帧错位的误报。测试要求有真实中间进度，坐标无瞬移，速度不超过测试界限 2200 px/s。
- 解析弹簧以 30 / 60 / 144 Hz 积分结果一致，反向保留速度；相机和锚点无硬切。
- 模型矩阵在 Drei Html 投影前更新，修复中段标签错帧。快速文档滚动在静止场景中同步跟随。
- SW 实际路径记录到 dmem_wdata 的 0–1 中间进度，暂停 350ms 的采样时间完全相同；继续和阶段跳转后架构状态仍不变。
- 页面打开后动态切换 reduced-motion 可生效；发现 Motion 原 Hook 只取初值，改为媒体查询订阅。
- 真实 mesh 点击、旋转 / 缩放 / 恢复、往返导航、指令编辑、BEQ 编辑器偏移正确初始化、初始寄存器、访存面板、手机 390×844 无横向溢出均有验收。
- HTML 退出保留 DOM 至动画结束并设 inert；焦点切换到标题或进入按钮。

## 可复核证据

`.local/` 是本地忽略目录，不上传大文件：

- sprint02-reveal-0.png、sprint02-reveal-mid.png、sprint02-reveal-1.png：正向首帧、中段、结束。
- sprint02-return-mid.png / sprint02-return-0.png：反向中段、结束。
- sprint02-memory-a.png、sprint02-branch-a.png：真实访存与分支程序。
- sprint02-flow.png：内存程序执行后的工作台。
- sprint02-motion-samples.json：正向 / 反向逐帧 reveal、屏幕坐标、渲染时间。
- sprint02-flow-samples.json：传播及暂停的阶段时间、各真实 route 的进度。

截图辅助检查布局；连续性结论还依据帧数据和 Canvas 身份断言，**没有仅凭静态截图宣称“丝滑”或真实设备 60 FPS**。

## 性能与验证边界

Three 共享包仍约 1.17 MB（gzip 327 KB），有构建体积提示。Canvas 固定全视口扩大绘制范围；DPR 上限 1.5，无 Bloom / 全屏 Blur / 粒子系统，路径预采样、逐帧不写 React / Zustand。软件 WebGL 采样不是硬件性能基准，尚未完成真实手机、低端 GPU、Safari / Firefox 与正式可访问性审计。

没有 Testbench 或 Verilog 联合仿真，尚不能声称 RTL 等价；完整 RV32I、完整 Trap/CSR、字节 / 半字指令未实现。内存越界和程序结束是宿主策略。

远程仓库和 Sprint 01 main 已存在；本轮尚未 Push / PR / Merge / 部署，也未触发本轮 GitHub Actions。没有连接 v0。

本机重跑浏览器测试：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.local/browsers"
npm run test:e2e
```
