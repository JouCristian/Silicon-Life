# React Bits 来源与适配

本项目作为完整 CPU 教学应用使用以下组件，未将其作为独立组件库或模板包发布。

- 项目：[DavidHDev/react-bits](https://github.com/DavidHDev/react-bits)
- 官方介绍：[Jelly Radio](https://reactbits.dev/components/jelly-radio)、[Gradient ASCII](https://reactbits.dev/backgrounds/gradient-ascii)
- 实际代码依据：用户在 2026-10-22 提供的 JellyRadio（JSX + CSS）与 GradientASCII（JSX + CSS）附件；已完整阅读。原始附件参考副本保存在本机忽略目录 `.local/react-bits-reference/`，不作为独立组件再发布。
- 版权：Copyright (c) 2026 David Haz。
- 许可证：**MIT + Commons Clause License Condition v1.0**，并非无附加条件的 MIT。官方 [LICENSE.md](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md) 的完整文本随应用保存于 [third_party/react-bits/LICENSE.md](../third_party/react-bits/LICENSE.md)。允许作为网站 / 应用集成，禁止单独销售、转许可或再分发组件及其移植版本；详见原文。

## JellyRadio

`src/components/react-bits/JellyRadio.tsx` / `.css` 基于源码的 motion values、邻项位移、横纵向弹簧形变和 radio 键盘模型适配为受控 TypeScript 组件。使用现有 `motion/react`，没有增加依赖。收敛 swell / barge / shrink / bounce / stagger，配色适应黑灰蓝主题。保留 radiogroup / radio、roving tabindex、方向键 / Home / End、原生 Enter / Space 与可见焦点；外部状态变化和键盘同样连续过渡。订阅项目动态 reduced-motion，停用位移形变。Motion values 不逐帧写 React 或 CPU Store。

## GradientASCII

`gradientShaders.ts` 保留所提供源码的 field / noise / OKLab 渐变、glyph atlas 采样与 composite 计算。`gradientRenderer.ts` 将生命周期改为有类型、可完整释放的两 pass 渲染器；删除 halo / blur 两套程序及其纹理，辉光固定为零。保留低强度渐变与稀疏数字字符，关闭点击扰动、拖尾、随机闪烁及颗粒。

- 首页 lazy 加载，工作台卸载；CPU 的固定 R3F Canvas 生命周期独立保持。
- 装饰 Canvas 无指针监听，CSS `pointer-events:none`，`aria-hidden`。
- 20 FPS 上限、DPR ≤1、约 1280×720 像素预算，field 分辨率再减半。后台 / 不可见停止 RAF；恢复时不累计后台时间。
- 动态 reduced-motion 使用 CSS 静态渐变，不建立背景 WebGL；已有资源即时释放。
- WebGL2 不可用、编译失败、FBO 失败、context lost 均退回 CSS。所有部分初始化和正常卸载共用清理，删除 shader / program / texture / FBO / VAO 并释放背景 context。

适配范围有意限制在本项目用途，不承诺与 React Bits 原组件的全部可选属性 API 兼容。真实移动 GPU / Safari / Firefox 的性能仍需设备验证。
