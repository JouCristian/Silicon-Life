# Silicon Life Design System

## Direction

教室投影与浏览器实验并用：近黑色背景减少场景杂讯，浅灰结构刻画完整芯片，用单一蓝色指示当前路径。用户明确指定的黑灰蓝优先于通用 Skill 随机色种子。

## Theme

`src/styles/global.css` 定义 OKLCH 背景、面板、边线、文本、次要文本与强调色。Three.js 使用相应 sRGB 颜色。色彩策略 Restrained，蓝色限于操作、活动路径、状态。

## Typography

系统无衬线中文与英文字体；代码、数值使用系统等宽字体。不依赖远程字体 CDN。首页双行大标题，工作台固定 27px 标题，面板 12–14px，主要数值等宽对齐。

## Layout

桌面：程序与编码器 / 三维工作区 / 寄存器，底部为五个概念观察阶段。1250px 以下寄存器下移，600px 以下按工作区、程序、寄存器排列。无需卡片堆叠，主要区域用细线分隔。

## Components and motion

操作按钮 5px 圆角，输入 4px，原生 select 与数字输入，明确键盘焦点。运行与单步状态禁用防止重复提交。芯片四片盖板与 CPU 平面使用同一 Canvas 连续转场；阻尼弹簧控制空间位移。Motion 负责轻量 UI 状态出现，尊重 reduced-motion。

## Limitations

极窄屏三维标签较小，旋转放大或使用 HTML 面板观察。当前无完整可访问性审计；所有架构状态都可从 HTML 中读取。
