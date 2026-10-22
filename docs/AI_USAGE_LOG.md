# AI 使用记录

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
