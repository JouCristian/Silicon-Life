# Silicon Life Design System

## Direction

教室投影与浏览器实验并用：近黑色背景减少场景杂讯，浅灰结构刻画完整芯片，用单一蓝色指示当前路径。用户明确指定的黑灰蓝优先于通用 Skill 随机色种子。

## Theme

`src/styles/global.css` 定义 OKLCH 背景、面板、边线、文本、次要文本与强调色。Three.js 使用相应 sRGB 颜色。色彩策略 Restrained：蓝色表示数据、浅金表示控制、青绿色表示写回；非活动连接保持灰色。面板与场景增加黑灰层次，次要文字提高亮度。

## Typography

系统无衬线中文与英文字体；代码、数值使用系统等宽字体。不依赖远程字体 CDN。首页双行大标题，工作台固定 27px 标题，面板 12–14px，主要数值等宽对齐。

## Layout

Sprint 02.1：桌面宽 ≥1100px、高 ≥700px 时，`100dvh` Grid shell 为 76px Header、可收缩 main、40px Footer。main 包含标题与三栏工作区；左侧程序和右侧状态独立滚动，中间为 3D / 分隔线 / 独立滚动的控制与 Trace。所有 Grid/Flex 中间层显式设置 min-height/min-width: 0。两条竖向分隔线和一条横向分隔线支持 pointer capture、键盘和双击重置。左右最小 210px，中间最小 380px，上区域最小 318px（含工具栏和图例），下区域最小 160px。

窗口尺寸不足时切换 CPU 优先的顺序布局，允许页面滚动，不丢内容。表单、寄存器和信号列表根据容器宽度重排。html 与内部滚动区使用 stable gutter；原生细滚动条提供 Chromium / Firefox 两套样式。Footer 参与布局，不覆盖内容。比例只存内存，避免不同屏幕恢复无效尺寸。

参考 [Apple HIG Layout](https://developer.apple.com/cn/design/human-interface-guidelines/layout) 的内容分组、对齐、按重要性排序和自适应尺寸原则；已读取 Apple 官方文档 JSON 正文。维持项目既定黑灰蓝，不引入 Liquid Glass 装饰。

## Components and motion

操作按钮 5px 圆角，输入 4px，原生 select 与数字输入，明确键盘焦点。运行与单步状态禁用防止重复提交。Sprint 02 的固定全视口 Canvas 保持生命周期，HTML 的空矩形提供目标锚点；view offset、相机、模型尺度与盖板使用连续运动。解析临界阻尼在不同帧率下保持一致，不清空反向时的速度。

Motion 负责 opacity / translate、按因果错峰、退出后卸载与 inert；焦点移入新场景。配置统一在 `src/motion/design.ts`，一般进入 320ms、退出 180ms、错峰 65ms。尊重并订阅动态 reduced-motion 偏好。

数据流使用真实 Trace 的传输组和实际连线，基础单段按弧长安排 300–950ms；默认 0.50×。光头采用平滑进出和连续插值，四段尾迹柔和衰减；接收端使用逻辑时间驱动的解析阻尼脉冲，抬升不超过 0.055 世界单位。发出、传播、到达、响应、稳定分开表达。暂停冻结光流和模块响应，倍速与基础时间表缓存分离。单步传递只播放一个真实因果组，保留组内并行，不表示额外时钟。

R3F 的 eventSource 与 OrbitControls 的 domElement 同时绑定 scene-anchor。固定 Canvas 使用 client 坐标射线和真实区域裁剪；拖动分隔线只调整几何。盖板先抬升，再向四个方向远离，根据当前相机、视口和尺度估计离场距离，后段连续淡出，逆向保持速度。首页只有缓慢呼吸与 OrbitControls 惯性，不使用 Bloom 或大量粒子。

## Limitations

Sprint 03：程序管理和 ROM 导入置于左栏折叠区，RAM 视图、编辑和独立导入置于右栏。保持原生输入、文件选择、独立滚动与分隔线，错误显示具体位置而不打断 CPU 观察。BEQ 显示目标 / 警告，RAM 用 Δ 和字节高亮双重表达初始 / 运行差异。

模式选择采用基于用户源码的 JellyRadio：受控 radio 语义、方向键 / Home / End、可见焦点，轻微横纵弹簧和邻项位移。首页采用 GradientASCII 的 field / glyph 渲染，深蓝灰、26px 字符网格、低密度与低透明度、缓慢漂移；标题及浅灰芯片保持视觉优先。背景不接收事件，不添加辉光后处理，20 FPS / DPR ≤1 / 约 1280×720 像素预算，离开首页释放；reduced-motion 与失败用 CSS 静态背景。CPU 仍为原单一持久 Canvas。授权见 `docs/THIRD_PARTY.md`。

极窄屏三维标签较小，旋转放大或使用 HTML 面板观察。DPR 限制 1.5；固定 Canvas 绘制区域扩大，需要真实移动 GPU 进一步验证。当前无完整可访问性审计；所有架构状态都可从 HTML 中读取。逐帧测试用于验证坐标连续与状态边界，不替代真实设备视觉评审。


## Sprint 03.1 操作修复

项目选择、新建、复制、重命名、删除直接置于程序栏顶部；保存状态明确区分恢复 / 保存中 / 已保存 / 失败。内置示例只读，复制后编辑；JSON 备份和本地保存说明各保留单层详情。ROM 指令为主，每页 16 条，数量 / KiB、PC 跳转、分页和编辑动作同区；HEX 是辅助操作，不把数万条记录渲染为 DOM。

ROM / RAM 共用 HexFilePicker，按钮和文件名分行，长名 ellipsis + title，隐藏真实 input 视觉但由可聚焦按钮触发；所有 Grid/Flex 子项 min-width:0。初始 RAM 明确可配置，运行 RAM 只读，显示 Δ、字节排列和最近写入地址；清空 / 缩小容量用确认对话框。快跑和本次步数预算放在执行栏下方，保留既有运行 / 单步 / 暂停操作。没有新增 UI 框架、React Bits 动效或首页视觉。
