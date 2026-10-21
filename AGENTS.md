# Silicon Life / 芯生协作规范

## 工作原则

- 标准 React + TypeScript + Vite SPA；不得未经用户批准迁移 Next.js。
- 顺序：完整主干 → 真实正确 → 视觉完善 → 功能扩展。
- CPU Core 不得 import React、Three、Zustand、DOM 或时钟 API。
- 执行一条指令只提交一次状态。五个观察阶段不是五个时钟周期。
- 展示层只通过 `src/stores/useLabStore.ts` 的 read model 与显式 action 访问状态，不直接改写寄存器、PC 或 Trace。
- 动画、暂停、回放不得触发寄存器写回；Trace 中不能编造 RTL 信号。
- 用户提供的 `rtl/` 与 `package/` 是受保护只读参考，禁止改动、覆盖、移动、删除或直接打包入 Web 仓库。
- 不修改任务范围外文件。远程仓库创建、Push、发布部署、外部目录改动需用户明确批准。

## 受保护逻辑

`src/core/`、`src/core/trace/`、`src/tests/` 是语义受保护目录。主工程师可按已授权 Sprint 实现和维护；v0 等视觉协作者未经批准不得修改。`src/stores/useLabStore.ts` 的提交/播放边界同样受保护。不得为迁就 UI 改写测试期望。

## 命令

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run test:e2e
```

E2E 首次需要 `npx playwright install chromium`，或通过本机可用浏览器执行。E2E 输出在忽略目录 `.local/` 与 `test-results/`。每个 PR 至少安装锁定依赖、类型检查、单元测试和生产构建；交互改动执行相关 E2E。不要仅凭测试通过声称 RTL 联合仿真完成。

## Git / v0

GitHub 仓库已建立（JouCristian/Silicon-Life），是唯一代码事实来源。使用 `feat/*`、`fix/*` 独立分支和 PR；两个 AI 不在同一分支同时修改。Sprint 02 用户要求 Push、PR、Merge 前先确认。v0 只能在已划定 UI 范围协作。合并前查看受保护目录差异，并通过全部必需检查。详见 `docs/V0_COLLAB.md`。

## 动效边界

`src/motion/` 统一弹簧、传播时间线和播放时钟。它可读取 Trace 与场景几何，不能计算或改写 CPU 结果。不要让连续动画逐帧触发整个 Zustand / React 树重渲染。保留固定 Canvas、独立 HTML label portal、空间锚点与退出动画；Drei Html 投影必须在场景矩阵更新之后。验证正向、反向、中途反转与暂停，不仅看静态图。Core 的 transfer 顺序契约变更需同步映射与测试。

## 设计

产品上下文见 `PRODUCT.md`，视觉规范见 `DESIGN.md`。近黑色、浅灰线框、少量蓝色表达路径；先电影化解构，后稳定教学平面。减少动态效果时简化过渡。无 WebGL 也应保留 CPU 执行和文字观察。中文 UI，信号保持 RTL 原名。
