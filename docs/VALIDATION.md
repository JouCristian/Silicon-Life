# 芯生验证记录

## Sprint 03 本地验收（2026-10-22）

从已合并 PR #2 的最新 main / origin/main `1e3a81e` 创建本地 `feat/sprint-03-program-memory`；保留原分支、原 RTL 与本地参考文件。开发前类型检查、53 项单元测试、生产构建、9 条 E2E 均通过。依赖与锁文件未变，使用现有锁定安装环境。

### 最终结果

| 命令 / 检查 | 结果 |
| --- | --- |
| npm run typecheck | 通过 |
| npm test | 7 文件 / **95 项通过**（原有 53 项保留，新增 42 项） |
| npm run build | 通过 |
| npm run test:e2e | **16 条全部通过**，约 2.0 分钟，单 worker，无重试 |
| 本地开发服务器 | http://127.0.0.1:5173/，HTTP 200 |
| Core / 预设 / RTL | src/core/ 与 src/data/programs.ts 无改动；8 个 RTL SHA-256 与映射基线一致 |
| 远程状态 | 本轮无 Push / PR / Merge / 部署，未运行远程 CI |

### 功能证据

- 空白、1、37、256 条程序真实执行，PC=条数×4、retired 准确、x0 恒零。不可变插入 / 删除 / 移动、选中索引、预设副本、切换恢复、自定义基线和 BEQ 目标均验证。256 上限、非法指令 / 空文件 / 追加溢出被原子拒绝。
- Store 订阅只收到一次成功导入更新，已切换 ROM、重建 CPU、清空历史 / traceIndex / 传递游标并推进 epoch，不暴露新 ROM 配旧 Trace 的中间状态。
- HEX 验证 BOM、注释、多行、unsigned32、十进制 RLE、UTF-8 文件上限、巨大次数展开前拒绝、位宽溢出和不支持格式。非法 ROM 显示具体第 2 条 `[0xffffffff]` 与原因，原程序和运行结果保持不变。
- RAM 手动 64→42，真实 LW 读出 x3=42；SW 将运行 RAM 改写为 99（单元）或地址 0 写 42（浏览器），初始镜像保持，Reset 恢复。播放 / 回放不再次写入。切换、编辑、载入程序仍保留初始 RAM / 寄存器。执行后编辑被拒绝。
- RAM 8 位 / 32 位、小端 `44 33 22 11`、起始字节地址、最后合法字节 / 字地址、未对齐 / 越界、替换零填充、非法值严格拒绝。ROM 32 位、整份 RAM 8/32 位导出导入逐项一致；浏览器另验证 ROM 下载后重新选择导入并运行。
- 真实浏览器从空程序手工添加 ADDI / ADD，编辑、移动后 x3=12；ROM 预览需确认，导入后 x3=12；RAM HEX 17 个 word（单元 16→字节 64）以及起始地址 64 的 8 位数据都使 LW 得到 42。
- 原三个预设结果不变：算术 x3=12 / PC=12 / retired=3；内存 M[64]=42 / x3=42 / PC=16 / retired=4；分支跳过 99，x3=42 / PC=20 / retired=4。

### 视觉、资源与回归

- 已实际查看 `.local/sprint03-home-ascii.png`、`sprint03-custom.png`、`sprint03-ram.png`。首页字符保持背景层，CPU 线框、标题与按钮清晰；程序 / RAM 操作使用原有独立滚动区。
- JellyRadio 真实 radiogroup / radio、方向键 / Home、焦点、模式切换与动态 reduced-motion 均有浏览器断言。沿用原固定 CPU Canvas；原 E2E 的 canvas selector 仅收窄为 `.persistent-scene canvas`，专业模式由 button role 改为 radio role，没有更改执行期望。
- ASCII 实际 WebGL 渲染，验证不截获指针、DPR / 像素预算、1.1 秒实际 draw-call 采样（每帧两 pass，≤20 FPS）。离开首页停止 draw，重复进入 / 动态 reduced-motion / context loss 释放所有跟踪的 shader、program、texture、FBO、VAO。WebGL2 不可用以及注入 shader 编译失败均退回 CSS，部分初始化资源无残留，CPU 可继续使用。
- 转场回归暴露首个新目标帧使用了切换前长帧 delta，进度可能从 0 跳到 0.899。修复为只积分新目标生效后的时间，后续保留原解析弹簧和全帧 delta。原中段、盖板淡出、连续性速度、正反向和中途反转断言全部保留并通过。诊断在 `.local/sprint03-forward-diagnostic.json`，完整正反向记录在 `.local/sprint02-motion-samples.json`。另修复拖拽芯片松手后的 click 误触，>4px 位移不进入。
- 原独立滚动、分隔线、事件隔离、1000 条执行保护、单步传递、倍速、暂停 / 回放不重复提交，以及 Chromium 原生 125% / 150% 缩放回归全部通过。捕获 pageerror / console.error 的验收场景为 0，无阻断错误。

### 体积与未验证范围

Three 共享包仍为 1,168.42 KB（gzip 327.41 KB），保留原体积警告；ASCII lazy chunk 15.33 KB（gzip 5.79 KB）、独立 CSS 0.51 KB，没有新增依赖。装饰背景上限 20 FPS、DPR 1、约 1280×720 像素预算，CPU Canvas 仍限制 DPR 1.5。

测试环境为 Windows / Node 24 / Chromium / SwiftShader。未测试真实移动 GPU、Safari / Firefox 或触屏性能；逐帧和资源调用断言不能代替用户真实设备视觉验收。无 RTL 联合仿真、完整 RV32I、MMIO 设备实现或会话持久化。MMIO 仅文档规划，不猜测地址或像素编码。

## Sprint 02.1 本地验收（2026-10-22）

沿用 feat/sprint-02，起点 3d7ed59；PR #1 查询为 open、未合并、base main。本地开发阶段按用户要求不 Push / Merge / 部署；后续正常推送与 CI 修复已另获授权，详见下节。

### 用户授权后的远程 CI 修复

用户随后授权推送 a9b4e2d 并更新已有 PR #1，继续禁止 Merge / 部署。首次 [PR Actions #39654170266](https://github.com/JouCristian/Silicon-Life/actions/runs/39654170266) 的类型检查、53 项单元测试、构建及 8 条 E2E 通过；传递终点冻结检查失败：HTML 驱动已停在真实组末 0.71 秒，而 Three.js 采样属性仍为上一渲染帧 0.4401 秒，随后绘制终点导致比较失败。

修复只增加可观测的 playback epoch、playing 与实际调度终点属性，让 E2E 先确认对应播放轮次和暂停状态已绘制；完成时先要求渲染值到达实际调度终点，再严格比较其后 300ms 的冻结值。保留原有等值冻结、架构状态与 CPU 基准，不增加重试或放宽阈值。没有改动 CPU Core、播放语义、RTL 或 src/tests/ 的正确性期望。最新远程执行结果以 PR 对应提交的 Checks 为准。

### 新增覆盖

最终本地结果：npm run typecheck 通过；npm test 5 文件 / 53 项通过（原有 48 项保留）；npm run build 通过；npm run test:e2e 9 条全部通过，用时约 1.3 分钟。验收捕获 pageerror / console.error 为 0，未出现 ResizeObserver 错误。Three 共享包仍为 1,168.42 KB，gzip 327.41 KB，保留体积警告。没有把本地通过表述为本轮远程 CI 通过。

- 1280×720、1440×900、1920×1080：Header 横向位置保持，桌面 document 无纵向溢出。程序、右侧状态、details 分别注入 1800px 压力内容，各自可滚动，CPU anchor 与 Footer 边界保持相同。尺寸切换等待浏览器和 ResizeObserver 完成布局后再比较，避免拿旧尺寸作基准。
- 两个竖分隔线与一个横分隔线：pointer capture 下松开之前已有几何变化，移出分隔线、极端拖动、键盘、Home 和双击均覆盖；Canvas DOM 身份保持。
- 1152×720、960×600 和 390×844 重新排版无横向溢出。较矮的三维视口采用模块缩写，完整执行数据保留在 HTML 面板。
- 真实 Chromium 页面缩放：临时独立浏览器配置经 chrome://settings 的原生页面缩放 API 设置 1.25 / 1.5。实际 DPR 分别 1.25 / 1.5，CSS 视口分别约 1134×642 / 945×535（外窗 1440×900）。Header 切换前后 x / width 相同，无横向溢出，Footer 可见，键盘进入与单步后 x1=5。没有用 CSS transform 或 DPR 模拟代替这一项。
- 原生缩放 + viewport:null 下的 Playwright 截图在本机挂起；该项用实际 DPR、页面几何和执行断言取证，记录 .local/sprint021-native-zoom.json。鼠标操作与截图在常规视口单独验证，原生缩放下使用键盘操作，不声称所有系统的缩放鼠标坐标均经自动化验证。
- 3D 区滚轮实际改变相机位置；程序、状态、Trace 和 Header 的滚轮均不改变相机。拖分隔线不旋转 CPU。6 次首页 / 工作台往返后，通过 CDP 比较真实 anchor 的事件监听类型及数量保持不变。
- 单步传递逐因果组传播并停住，保留实际并行信号；空阶段跳过、完成提示、游标重置、暂停/继续/阶段切换/历史回放均有断言。快照对象、PC / 寄存器 / 内存 / retired 不因播放控制发生重复提交。
- 倍速默认 .5，六档可选；播放中切换不中断逻辑时间，暂停后改速仍严格冻结。基础 timeline 缓存不含速度。
- 光流保留路径连续性；接收模块的解析阻尼响应只读逻辑时间。正反向逐帧记录增加盖板 opacity / distance，检验渐隐中间状态和有效离场距离，中途反转仍保留原有连续性检查。
- 三组程序结果、异常原子性、1000 条保护等原有基准保留。没有修改 src/core/；8 个 RTL 原件的 SHA-256 再次与映射基线一致。

### 证据与边界

.local/sprint021-1280.png、sprint021-1440.png、sprint021-1920.png、sprint021-compact-*.png 是布局截图；sprint02-motion-samples.json 含本轮盖板与连续转场采样，sprint02-flow-samples.json 含真实路径与暂停数据。最终正常视口另保存 sprint021-final-1280.png / 1440.png / 390.png，避免把全长截图中固定 Canvas 的位置当作实际移动设备视口。CI 的证据上传规则已包含新增布局截图与原生缩放记录，待本轮获准 Push 后才会运行。

真实 GPU 性能、Safari / Firefox 和触屏设备未验证。盖板离场采用当前相机与视口的保守投影估计，不声称完成任意角度的精确几何碰撞证明。RTL 联合仿真和完整 RV32I 仍不在本轮范围。完整视觉品质仍需用户在实际浏览器验收。

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

远程仓库和 Sprint 01 main 已存在。用户确认 Sprint 02 后授权 Push 与 PR，已创建 [PR #1](https://github.com/JouCristian/Silicon-Life/pull/1)，未 Merge 或部署，没有连接 v0。

## PR 远程 CI 检查

首次 [PR Actions #39640059957](https://github.com/JouCristian/Silicon-Life/actions/runs/39640059957) 的依赖安装、类型检查、48 项单元测试、生产构建通过，E2E 为 4 通过 / 1 失败。失败发生在正反向转场的采样帧数断言：云端 SwiftShader 在固定 1.8 秒内只采到 10 帧，要求为至少 16 帧。

采样现在同时满足最短时长和至少 16 个不同的渲染时间戳，最多等待 10 秒；保留原有帧数、真实中间进度、速度、Canvas 身份和尺寸断言，并新增不同渲染时间戳数量断言。该检查验证连续性，不把共享云主机软件渲染的 FPS 当作产品性能指标。CPU 与产品动画未改动。CI 始终上传 test-results 和指定帧 JSON（保留 7 天），不上传 .local/browsers。后续实际执行状态以 PR 最新提交的 Checks 为准。

本机重跑浏览器测试：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.local/browsers"
npm run test:e2e
```
