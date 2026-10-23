# AI 使用记录

## 2026-10-23 · Sprint 07 全部模块探索

- 先本地提交已验收 Sprint 06 为 `95dbeda`，再创建 `feat/sprint-07-all-module-exploration`。
- 读取实际译码、立即数、分支、顶层 RTL 与 RV32I Core，复用已有探索框架补齐剩余 8 个模块。明确外部 ROM/RAM 与顶层教学分组，值来自 Trace 或只读前后快照，无重复执行或 MMIO/RAM 混用。
- 仅扩展图模型/入口、活动路径灰显及简要文档；保留单 Canvas、镜头、MMIO、执行/播放/项目语义，不开发复杂视觉。
- 类型检查、5 个相关文件 253 项测试通过，并进行本地浏览器基础预览；未运行完整 E2E，未 Push、Merge 或部署。

## 2026-10-23 · Sprint 06 元件内部探索

- 确认 MMIO 3D 视觉 `674677f` 已提交、工作区干净，从该提交新建 `feat/sprint-06-module-exploration`，保留既有历史和功能。
- 读取实际 PC / RF / ALU / cpu_top / 控制宏，复用 Trace 创建纯只读内部模型与可扩展注册表。内部示意不冒充门级布局，不将 PC 外部分支逻辑伪称内部；CPU Core、拓扑与 MMIO 执行语义未改。
- 使用本地 impeccable 的 product 指导和既有设计变量，仅实现基础可用的剖面、信号文字、返回/Esc、减弱动画和 MMIO 聚焦互斥；未进行视觉重设计或新建 Canvas/OrbitControls。
- 类型检查及 4 个相关文件 183 项测试通过，进行本地 Chrome 基础预览；未运行完整 E2E。没有 Push、Merge 或部署。

## 2026-10-23 · Sprint 05.5 显示设备

- 先本地提交已验收的统一镜像功能为 `b85419b`，新建 `feat/sprint-05-5-mmio-display`。
- 只读分析原 `minirv.circ`、`vga.txt`、两个图像转换脚本及 `rtl/cpu/cpu_top.v`，确认 256×256 RGB888 与 `0x20000000…0x2003ffff` 的 SW 像素协议；没有凭空添加同步寄存器或改动用户工程。
- 实现独立不可变页共享 framebuffer、真实 MMIO 总线与设备 Trace、简单 2D 显示面板；暂停回放不重复提交，复位清屏。未改冻结 V3 几何、拓扑、相机或材质，仅修正 MMIO 时的 RAM 标签说明。
- ARTEMIS 实际执行 623497 条到自身 halt 入口，65536 次 SW 覆盖整帧，与镜像原图逐字节/hash 一致。6 个相关文件 200 项测试通过，类型检查通过；本地 Chrome 预览验证实际像素写入，无完整 E2E。
- 仅支持显示对齐 SW，其他外设、读回/窄写和硬件显示控制器未实现。未 Push、Merge 或部署。

## 2026-10-23 · 1 MiB RAM 与统一镜像导入

- 在 `feat/unified-memory-image` 扩容 RAM 分页、HEX 字节单元、项目校验及 JSON 备份（8 MiB）；schema 保持 1。统一导入通过一次 Store 提交替换 ROM / 初始 RAM 并复位，保留独立导入、初始寄存器及项目身份。未修改 CPU 执行语义或 V3 视觉。
- 相关 6 个文件共 119 项测试及类型检查通过；真实 ARTEMIS 原件 142272 字完整装入，项目记录与 JSON 往返的全部 ROM / RAM 校验一致，栈 `0x93000` 的 SW/LW 通过。
- 实际原程序退休 747 条后，在 PC `0x1520` 写入 `0x20000000` 时因 MMIO 未实现而停止；没有扩展或别名映射高地址。运行 RAM 不改写 ROM，尚不支持自修改代码。
- 未运行完整 E2E，未 Push、Merge、部署或改动外部原件；本地验收入口为 `http://127.0.0.1:5180/`。

## 2026-10-23 · V3 冻结版 GitHub 集成收尾

- 用户人工验收冻结 `f218079`，授权正常 Push、创建面向 main 的 V2+V3 PR 和检查实际 Actions；禁止自动 Merge、部署及新开发。
- 核对 V3 继承 V2 的 `f882e2f` / `aae1c46`，且 Core、Store、IO、projects 和 topology.ts 与 main 一致；保留本地 annotated `v3-visual-freeze`，不推送 Tag。
- 仅以独立整理提交取消跟踪历史原型/重复 vendor/V2 调试截图，保留磁盘原件和全部 Git 历史，归档链接指向冻结提交；`src/`、`e2e/`、`scripts/` 和依赖保持冻结版内容。
- 为遵守不部署要求，按 Vercel 官方 Git Configuration 仅禁用当前 feature branch 的自动部署；保留 main 既有规则。没有连接 v0、创建新项目或主动部署。
- GitHub CI 若失败，先读取实际步骤/日志并报告原因，不擅自修改冻结视觉或降低 CPU 测试期望。集成边界见 `docs/V3_GITHUB_INTEGRATION.md`。

## 2026-10-22 · DeepSeek V2 模型集成

- 用户提供 DeepSeek 制作并冻结的程序化几何、品牌纹理、180 根 QFP 针脚、机械装配关系与无状态拆解 API（`69d8113`）。用户规定只移植模型，不移植原型交互、DemoModules、演示线路或虚构信号；禁止本轮 Push、Merge、部署及 CPU Core 改动。
- Codex 从最新 main 创建 `feat/integrate-chip-v2`，完整 cherry-pick 资产提交；原型原件保留。独立实现 typed 模型边界、R3F 生命周期、静态合批、针脚实例与顶点共享、轻量程序化 Matcap、零件独立淡出和原 reveal 驱动的离场。
- 参考本地 impeccable 的产品指导和既有 PRODUCT/DESIGN；没有找到 swust-apple-keynote，不声称读取。没有调用子 agent、v0、外部图像生成或新增依赖。
- 发现环境贴图错误压暗品牌后修正材质策略；完整 E2E 暴露慢帧跳过收合中段后，在原场景控制中限制空间呈现单帧推进，保留 CPU/Trace 的原有时间语义和测试基准。
- 新增冻结原型独立几何基准、复装与资源释放单测、Canvas/视角/布局浏览器验证、原有全部程序与播放回归，保存实际截图和性能采样。细节见 `docs/CHIP_V2_INTEGRATION.md`。

## 2026-10-22 · Sprint 03.1

- 用户贡献：明确验收问题与实用性优先级，要求 65536 条 ROM、10 项目、IndexedDB、完整 JSON 备份、统一文件控件和明确 RAM 模式；禁止 Push / Merge / 部署及 MMIO / ISA / 首页视觉扩展。
- Codex 贡献：分析多处 256 / 1000 硬限制、整表 DOM / decode、无界 Trace、全 RAM 复制和单份会话状态；实现紧凑只读 ROM、分页 + PC 跳转、分批快跑与可续预算、有界历史、大 RAM 页共享、项目模型与 JSON、IndexedDB 串行保存 / 冲突保护、Worker 文件解析和必要 UI 修复。
- 沿用已读取的 impeccable 产品界面指导与既有设计系统，没有新增复杂 UI 框架、依赖或首页动效，React Bits 源码及授权保持。
- 保留 CPU 编码、32 位算术、访存对齐与原子性基准。既有测试只适配明确变化的容量 / 项目作用域 / 预算策略、紧凑表示和新 UI 流程，没有修改预设 CPU 结果来掩盖失败。新增真实大程序、不可变页、项目事务与实际浏览器失败注入 / 性能验证。
- Core 改动限于 ArrayLike ROM 接口、未知指令的 PC 信息和不可变内存表示；原 RTL 与 ISA / Trace 信号计算未改。所有文件导入仅在本机，不调用 v0，不使用子 agent，不创建远程 PR 或触发部署。

## 2026-10-22 · Sprint 03

- 用户贡献：自定义程序与 HEX / RAM 工作流、会话状态要求、MMIO 未来目标、验收条件；提供 React Bits JellyRadio 和 GradientASCII 完整 JSX / CSS 源码。
- Codex 贡献：在最新 main `1e3a81e` 的本地 `feat/sprint-03-program-memory` 实现程序管理、PC / BEQ 目标说明、有界纯 HEX 解析、导入预览与原子确认、8/32 位初始 RAM 编辑和导出、初始寄存器 / RAM 复位机制、测试、示例与文档。
- 使用已读取的 impeccable 产品界面指导，保留既有黑灰蓝、固定 CPU Canvas、独立滚动与分隔线。基于用户源码适配 React Bits 的弹簧 radio 与 field / glyph WebGL2 渲染，未假称独立原创这些组件。完整来源、许可证及适配说明见 `THIRD_PARTY.md` 和 `third_party/react-bits/LICENSE.md`。
- 实际阅读并保留官方 MIT + Commons Clause 许可；没有新增动画依赖、生成式图片、音频或视频素材，没有连接 v0。
- 浏览器验收发现芯片拖拽后的 click 误触与首帧弹簧对切换前长帧的错误积分，分别加入位移判定及新目标生效时间界限。没有放宽已有连续性或 CPU 正确性断言。
- CPU Core、预设常量、Trace 执行语义与原始 RTL 未修改。MMIO 仅完成框架无关的架构提案，未猜测用户旧设备地址 / 颜色编码。
- 基线类型检查、53 项单元、构建和 9 条 E2E 通过；新增验证见 `VALIDATION.md`。未执行 Push、PR、Merge 或部署，等待本地视觉验收。

## 2026-10-22 · Sprint 02.1

- 后续 Git 授权：用户确认本地成果后，另行批准正常 Push、更新 PR #1 与修复 CI。首次云端 E2E 暴露 HTML 播放完成与 Three.js 上一渲染帧的读取竞态；Codex 增加只读轮次/状态/终点诊断，并等待实际终点绘制后继续严格冻结断言。未修改 CPU 正确性测试期望，未 Merge 或部署。

- 用户贡献：工作台固定视口、分区滚动、三条分隔线、事件边界、单步传递、速度档位、盖板离场及物理反馈的明确验收反馈。要求继续本地分支，禁止本轮 Push / Merge / 部署。
- Codex 独立实施，未调用子 agent、v0 或新的视觉框架。读取现有架构、设计、场景、播放与测试；参考 impeccable 产品指导，以及 Apple HIG Layout 官方 JSON 正文中的内容分组、尺寸适配与对齐原则。
- 实现 WorkbenchLayout、原生滚动与可访问分隔线；限制 R3F / OrbitControls 事件目标；在已有真实 Trace 上增加 TransferPlayback 与倍速，保持 Core 不变。优化连续光头、衰减尾迹、解析阻尼接收反馈和盖板抬升 / 分离 / 渐隐。
- 新增 Store/时钟语义测试、布局与事件浏览器验收、原生页面缩放检查；保留原有 CPU 和程序结果基准。遇到原生缩放下自动化截图挂起，改为 DPR/几何/键盘真实执行证据，未用静态图声称性能达标。
- 更新 README、设计、架构和验证记录。RTL 原件哈希保持一致，无新指令、图片、音视频或生成式资产。测试通过后仅创建本地提交，等待用户验收。

## 2026-10-21 · Sprint 01

- 工具：Codex，用户指定主工程师与技术集成负责人。
- 用户贡献：项目立意、Cinematic Reveal + Teaching Plane、技术栈、验收程序、教学与竞赛目标；提供现有 CPU RTL。
- AI 贡献：只读分析现有 RTL；实现 Vite/React 工程、ADDI/ADD 编码执行、快照模型、Zustand 协调、Three.js 场景与解构、UI、测试与协作文档。
- 视觉指导：读取本地 `impeccable` 与 `design-taste-frontend` 文档，采用适用的工具界面规则；项目初始化策略与色彩遵循用户明确要求。未找到用户提及的 `swust-apple-keynote` Skill，未声称调用。
- Sites：读取本地工作流，按用户要求执行 local-only，不注册或发布 Site。
- 使用现成库：React、Vite、Tailwind、Three.js、React Three Fiber、Drei、Motion、Zustand、Vitest、Playwright。没有生成式图片、音频或视频资产。
- Sprint 01 开发交付时未调用 v0、创建远程、Push 或部署，未改动 RTL。此后用户已将 Sprint 01 推送至 GitHub main（2026-10-22 已通过 fetch 确认），不再适用“没有 remote”的历史状态。
- 验证记录见 `docs/VALIDATION.md`；没有 Testbench 或 Verilog 模拟器，不能声称联合仿真或完整 RTL 等价。
- 后续需由人类审查 CPU 教学解释、RTL 映射及竞赛对 AI 创作过程的具体披露要求。此记录为实现贡献记录，不替代竞赛方表单。

## 2026-10-22 · Sprint 02

- 用户贡献：明确 A → B → C 顺序、三个真实程序、Apple 式空间连续性与信号传播的验收要求；提供现有 RTL。
- Codex 独立实现，未调用其他 agent 或连接 v0。先读取 main 与 RTL、运行基线，再在 feat/sprint-02 扩展五条指令、不可变内存、分支、Trace 路径及测试；A 阶段通过后才实施 B。
- B 阶段实现固定 Canvas、连续视点偏移、统一临界阻尼与速度规则、HTML 退出与焦点管理、沿真实路径的局部光段和端点响应、首页呼吸与克制光点、动态 reduced-motion 订阅。
- 未找到 swust-apple-keynote；使用已读取的 impeccable product / animate 指导与用户明确要求。没有假称加载缺失 Skill，没有新增动画框架或生成式图片、音视频素材。
- Playwright 记录正向、反向、中途反转、实际光段前进与暂停的逐帧数据，并保存中间截图。静态图不作为流畅性或真实 GPU 性能的唯一证据。
- 没有修改 rtl/ 或原始 FPGA 工程；没有执行本轮 Push、PR、Merge 或部署。RTL 联合仿真仍未完成，数据内存越界明确标为宿主策略。

### 用户确认后的 Git 交付与 CI 修复

- 用户另行授权 Push、创建面向 main 的 PR 和修复远程 CI，明确禁止 Merge、Force Push 和 Sprint 03。已推送 feat/sprint-02 并创建 PR #1。
- 忽略本地 .vite 依赖缓存，保留文件。读取真实 Actions 日志后定位 1.8 秒固定采样窗口在云端仅收集 10 帧的失败；改为在 10 秒上限内满足时长和至少 16 个不同渲染时间戳，保留连续性基准，增加 CI 帧记录上传。没有改动 CPU 或产品视觉行为。

## 2026-10-23 · V3 CI 专项排查

- 读取真实 PR #4 Actions 日志及失败 artifact；使用 impeccable 的性能检查规范，没有重新设计视觉。
- 原代码四个相关 E2E 在本机全部通过。两次有限修复尝试分别为 3/4、2/4；捕获首次显露帧空洞和候选异步编译 pageerror，遵照用户两次上限停止。
- 失败补丁、帧数据与上下文归档于忽略目录 .local/v3-ci-investigation/；已回退所有运行时与测试候选。没有放宽 timeout、跳过测试或修改 CPU 期望。
- 只提交 docs/V3_CI_INVESTIGATION.md 和此贡献记录；未 Push、Merge、部署或移动冻结 Tag。完整测试矩阵未运行，不宣称修复完成。

## 2026-10-23 · Sprint 05 RV32I

- 用户验收的 Logisim v3 HEX / 1MiB ROM 修改先提交为 4e176a5，确认工作区干净后新建 feat/sprint-05-rv32i。
- Codex 只读核对 rtl/cpu 的 8 个原件及控制编码，SHA-256 与历史基线一致。现有 RTL 已含 RV32I，未修改 FPGA 源码；Icarus 语法编译通过，没有 Testbench 联合仿真或等价结论。
- 补齐 40 条基础整数指令编码/译码/执行、字节/半字内存、跳转和系统停止快照；保持单条架构提交与回放隔离。缺少几何的路径明确标注，不沿不相关连线制造数据流；V3 几何、相机、动画参数未改。
- 使用 40 条独立机器码向量、BigInt ALU 参考及 3 个真实小程序验证。类型检查和最终 9 个相关测试文件共 232 项通过，未运行完整 E2E。提供 examples/sprint05/*.hex 供人工验收。
- FENCE 为单核有序屏障空操作；ECALL/EBREAK 分别 cause=11/3，非退休停止。未实现 CSR、OS、MMIO 或 M/A/C 等扩展。没有 Push、Merge、部署或移动冻结 Tag。
