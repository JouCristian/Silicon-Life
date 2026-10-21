# AI 使用记录

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
