# Codex × v0 协作边界

## 事实来源与流程

GitHub 是唯一代码事实来源，远程仓库为 https://github.com/JouCristian/Silicon-Life。Sprint 02 / 02.1 及遗留修复已合并；Sprint 03 使用本地 feat/sprint-03-program-memory 分支，用户验收前禁止 Push、PR、Merge 或部署，未连接 v0。v0 与 Codex 使用额度独立，不存在自动接力，用户通过 GitHub 手动分派和审查。

1. 用户审查本地 Sprint 后授权推送开发分支，远程已建立，不重复创建仓库。
2. 在 v0 导入 GitHub 仓库，保留 React + Vite + TypeScript；若导入流程提出迁移 Next.js，停止迁移并由主工程师确认兼容方式。
3. 每项任务建立独立分支，例如 `feat/v0-register-panel`。任务描述明确可改文件，避免与 Codex 分支冲突。
4. v0 发起 PR；Codex 审查受保护文件、依赖、状态访问与可访问性。
5. 本地或 CI 使用 `npm ci`、`npm run typecheck`、`npm test`、`npm run build`；涉及交互时执行 `npm run test:e2e`。
6. 全部通过后由用户或明确授权的维护者合并。不能把 v0 预览当作 CPU 正确性验证。

## 可以修改

- `src/components/` 中布局、样式、文案、可访问性与局部动效。
- `src/styles/`、现有视觉设计变量。
- 经任务明确指定的 `src/App.tsx` 展示编排。
- 不改变数据来源和语义的三维材质、标签、交互细节，需主工程师复核。

## 未经批准不得修改

- `src/core/` 的 ISA 编码、译码、执行、32 位算术与 Trace 语义。
- `src/tests/` 中测试基准；不能删除失败测试或变更机器码期望。
- `src/stores/useLabStore.ts` 提交、停止、保护与播放边界。
- `src/io/` 的 HEX 解析、展开限制、ROM 校验、RAM 初始镜像与小端 / 对齐策略。
- RTL 原件、机器码数据基准、CI 必需检查、框架和部署架构。
- 不得为界面填充伪造 CPU 结果、随机信号或独立动画写回逻辑。

## 稳定接口

- `Instruction`, `encode/decode`, `CpuState`, `ExecutionTrace`, `SignalSnapshot` 是类型契约。
- 视觉层使用 `useLabView()` 获取状态与 `trace`，通过 `step/run/pause/reset/observe/replay/updateInstruction/setInitialRegister` 等 action 操作。
- `cpu` 是当前架构状态；`trace.before/after` 是历史快照。历史回放不改变 `cpu`。
- `trace.phases[phase]` 提供参与模块，`trace.signals` 提供数值。控制编码与 RTL 原名必须保持。
- 扩展接口变更先由主工程师更新类型、语义、映射和测试，再交给视觉协作者使用。
- 自定义程序通过 createCustomProgram / insertInstruction / deleteInstruction / moveInstruction / importProgram 操作；初始 RAM 通过 setInitialMemory 操作。组件不得直接写 customProgram / initialMemory / initialRegisters；修改程序重置 Trace，但不能清除初始配置。数据类型详见 src/io/，导入流程详见 docs/HEX_FORMAT.md。

## 部署准备

构建命令 `npm run build`，静态输出 `dist/`，无后端或私密环境变量。可部署到 Vercel 静态站点或 Linux Nginx。当前使用场景状态而非 URL 路由，不需要 SPA 重写；以后增加 URL 路由需回退至 `index.html`。仓库不含机器绝对路径依赖或原始 FPGA 构建产物。子路径托管需设置 Vite `base`，目前默认域名根路径。
