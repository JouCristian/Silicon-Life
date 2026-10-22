# 芯生 V3 3D 视觉升级

> **状态：V3 Visual Freeze（2026-10-23）** — 已人工验收并冻结。后续视觉调整必须从新的任务和分支开始，不应直接改动本基线。
>
> 本轮在 `feat/chip-v3-visual` 上完成，基线为 `feat/integrate-chip-v2` 的 `aae1c46`。只修改 Three.js / React Three Fiber 视觉层与场景样式；CPU Core、ROM/RAM、Trace、Store、RTL、项目持久化和指令执行未改动。已创建本地冻结 commit 与 `v3-visual-freeze` tag；不 Push、不 Merge、不部署。

## 视觉目标

参考此前的芯片概念图，从“银色骨架”提升为完整、精密的工业封装：

- 银灰钛金属外壳 + 深色烟色玻璃舱 + 深色基板 + 克制的冷蓝光。
- 外壳有可读的厚度、分层边沿、加工槽、紧固件、通风格栅和电路内嵌。
- 点击展开后，品牌面板先抬起，顶盖随后离场，固定的底盘/针脚/内架下沉并淡出；教学视野最终只剩内部 PCB 与功能模块。
- 内部板保留 Codex 既有的 PC、IMEM、Decoder、Register File、Imm、MUX、ALU、WB、DMEM、Branch、Next PC 位置和 `topology.ts` 的真实连接；视觉升级不改变任何数据通路。

## 实现

### 1. 封装与材质

- 新增 [StudioEnvironment.tsx](../src/scenes/chip/StudioEnvironment.tsx)：一次生成程序化 equirect 摄影棚环境，经 PMREM 卷积后赋给场景；大型中性柔光箱提供银色长高光，右侧低饱和冷光提供边缘反射，背景保持近黑。
- 封装从 V2 的 Matcap 平面反射切换为真实 PBR 材质链；[model.ts](../src/scenes/chip/model.ts) 保留原始 `MeshPhysicalMaterial` 的金属度、粗糙度、clearcoat 与程序化贴图，仅做可淡出的克隆。
- 在 [geometry.js](../src/scenes/chip/geometry.js) 内增加：
  - 顶盖四周烟色玻璃电路舱、抛光边框与维修肋条；程序化铜线/焊盘印刷层。
  - 顶盖侧裙、通风格栅、分段加工槽、边沿高光与额外紧固件。
  - 品牌载体内嵌金属框、角部键位与蓝色微光。
  - 内架/基座的低调服务缝与键位细节；内部 deck 丝印可读性提高。
- 所有新增几何均在 V2 冻结的零件包围盒和装配基准内；180 针矩阵、装配 seat/contact 与 golden fixture 均未改变。新增细节复用既有材质批次，不新增逐帧材质切换。

### 2. 电影化展开与收合

- 机械动效改为一条独立的 **2.9s** 编排时间线（硬件 PBR）：先有 `0.12s` 的机械解锁停顿，再由 `cubic-bezier(.3, .4, .25, 1)` 完成柔加速、长收尾的展开。软件/CI 使用同样曲线和层次，但走 1.6s 兼容时间线，避免低帧率把完成状态拖过既有测试窗口。
- 镜头使用第二条 `cubic-bezier(.38, .18, .2, 1.015)` 路径，带极轻的落点弹性；实际相机仍以 `1 - exp(-3.2 * dt)` 做帧率无关阻尼跟随，并叠加纵向弧线。镜头在品牌开始移动后启动，在机械层离开时推进到主板视角。
- 层次顺序固定：
  - 品牌载体先抬起、倾斜并在 `0.44` 前淡出；
  - 顶盖稍后解锁、抬升、向右上方离场，`0.38` 前完成位移，`0.84` 前完成淡出；
  - 底盘、针架和内架在 `0.2–0.64` 下沉后退，`0.28–0.52` 淡出；
  - 教学板深度在 `0.15–0.5` 提前进入前景，板体在 `0.08–0.9` 展开；模块布局在 `0.14–0.88` 铺开，标签在 `0.58–0.94` 最后出现。
- 反向使用同一时间线的反演：从任意当前进度重新起跑，按剩余距离缩短 runway；不会回到 0 后重播，也不会跳帧或累计位移。`reduced-motion` 仍然直接落到目标状态。
- [model.ts](../src/scenes/chip/model.ts) 的所有离场位置仍从 authored base 重置后叠加；`resetModel()` 与 `setExplodeProgress(0)` 回到完全一致的装配姿态。到 `progress = 1` 时封装整体不可见，只留下教学板。
- 硬件路径在首次进入前用两帧的正常 R3F pass 预热教学板的 shader 与 12 张 CanvasTexture，减少首次点击时把材质上传误认为动画卡顿的概率；软件/CI 路径跳过这段预roll，避免启动时与背景采样争用主线程。

### 3. 教学电路板

- [TeachingBoard.tsx](../src/scenes/teaching/TeachingBoard.tsx) 使用圆角 PCB 本体、深色承载边框与四个既有安装点；不增加 Canvas 或第二套交互。
- [boardTextures.ts](../src/scenes/teaching/boardTextures.ts) 程序化绘制 1536×960 的暗色 PCB：阻焊层、网格、焊盘、过孔、边缘金手指、安装孔、丝印、铜走线和四个安静区域的斜向铜填充。
- 在板面贴图中以真实 `topology.ts` 的线位绘制低亮底纹，避免装饰线路冒充第二套数据通路。
- [ModuleBlock.tsx](../src/scenes/ModuleBlock.tsx) 改为圆角金属模块、程序化顶面丝印、嵌入式状态光条与更清晰的尺寸/留白；模块位置、宽度和接线端点保持不变。
- [SignalFlow.tsx](../src/scenes/SignalFlow.tsx) 保留原有方向性脉冲与停顿语义，仅增强冷色光晕、叠加发光和运动头部；暂停时脉冲停在原位置。
- 标签仍在独立 HTML portal 中；针对 1440 宽度的密集行增加有限的标签偏移，1440×900、1440×1000、1280×720、1920×1080 均无矩形碰撞。

### 4. 镜头与构图

- 首页保持低机位产品视角，工作台改为更接近正面的 2.5D 视角，让板面与标签更易读。
- 板面在现有工作台高度内放大，但不裁切模块或依赖相机隐藏几何。
- 保留现有的 view offset、锚点弹簧、相机阻尼、视野/clamp 和 reduced-motion 行为。

### 5. 软件渲染兼容层

- 在 `CpuScene` 检测 `WEBGL_debug_renderer_info` 中的 SwiftShader / llvmpipe / software 标识。
- 硬件默认使用完整 PBR + PMREM；软件/CI 使用同一几何、同一拆解编排和同一 Trace，只把芯片材质降为轻量 Matcap，并跳过 PMREM 环境。`data-render-quality="compat"` 与 `data-chip-material="matcap"` 可用于确认。
- 这不是用相机或隐藏模型掩盖问题：屏幕上的模块、针脚、装配、轮廓和路径没有削减；仅替换片元着色成本，保证无 GPU/软件 WebGL 仍能完成原有的动画采样与交互测试。

### 6. 首页氛围层

- 首页使用两个相互独立的背景 Canvas：上层是 [GradientASCII.tsx](../src/components/react-bits/GradientASCII.tsx) 的稀疏字形天空，下层是占据底部约 36vh 的 [GradientWaves.tsx](../src/components/react-bits/GradientWaves.tsx) 远景海面；两者由 [App.tsx](../src/App.tsx) 中的 `HomeAtmosphere` 统一承载，不改变 CPU 场景的单一主 Canvas。
- 进入芯片时，整个氛围层以 1.35s `cubic-bezier(.22, 1, .36, 1)` 淡出，结束后卸载两个背景 renderer；返回首页时重新挂载，ASCII 解码与 Waves 涨潮 intro 重新播放。
- 背景层不参与 CPU、Trace 或 Store：上一层的 drift/字形和下一层的 wave shader 均独立运行；ASCII 限 20fps，Waves 限 30fps，并在 SwiftShader / llvmpipe 下把 Waves 降级为静态 CSS 海面，避免软件路径和主场景争帧。
- 首页背景的 pointer scramble / click swell 默认关闭，避免与芯片拖拽、项目按钮和 3D 交互抢事件。

### 7. 工作台控件与滚动边缘

- 所有原生 `<select>` 已统一为 [GlideSelect.tsx](../src/components/GlideSelect.tsx)；底层保留透明原生 `<select>` 作为无障碍、键盘、表单和自动化测试桥接，视觉 trigger 为 pointer-first。菜单改为 `body` portal，不再被 `.panel-scroll` 的 `overflow:auto` 裁切。
- GlideSelect 支持分组标题、自动向上/向下展开、主题变量和菜单内部滚轮（`max-height: 264px`）；长项目列表、31 项寄存器列表与执行记录均不依赖面板滚动。
- 工作台滚动面板增加吸附式 [PanelEdgeBlur.tsx](../src/components/PanelEdgeBlur.tsx)：固定 portal 跟随 `.panel-scroll` 视口，三层 `backdrop-filter` 渐进模糊，到顶部/底部自动淡出。程序与状态面板有上下边缘，Trace/执行详情只保留上边缘，避免糊住 01–05 阶段按钮。

## 最终基线

- **模型**：V3 工业封装模型，保留 V2 的 180 针 QFP、零件包围盒、seat/contact 与 golden fixture；新增玻璃舱、侧裙、通风格栅、品牌框、内架细节和承载边框。
- **分层拆解**：品牌载体先离场，顶盖随后抬升并向右上方离场，底盘/针架/内架下沉后退，教学板最后进入前景；到 `progress = 1` 时封装全部不可见，只保留教学板。
- **镜头**：硬件 2.9s 机械时间线 + 0.12s 停顿；镜头延迟于品牌动作、带轻微落点弹性与阻尼跟随；反向复用同一时间线，按剩余距离缩短，不回到 0 重播。
- **材质**：硬件完整 PBR + 程序化 PMREM；软件/CI 使用同几何、轻量 matcap 降级；文字、标签和数据不接受材质替换。
- **性能**：硬件首页 42 draw calls / 45,780 triangles；工作台 61 draw calls / 5,142 triangles。首页 ASCII/Waves 是两个独立背景 Canvas，不计入主场景 3D draw-call 预算；GlideSelect 与 PanelEdgeBlur 为 DOM/CSS，不增加 WebGL scene。

## 保留的接口

正式模型仍通过：

```ts
const chip = createIntegratedChip()
chip.root
chip.setExplodeProgress(progress, exitX?, exitY?)
chip.snapshot()
chip.dispose()
```

内部几何工厂仍保留：

```ts
createChipModel()
setExplodeProgress(progress)
getExplodeProgress()
getPoses()
getAnimatedTransforms()
getBounds()
resetModel()
dispose()
```

CPU 主场景仍保持单一 Canvas、单一 renderer 和单一相机；首页氛围层是两个独立背景 Canvas，不参与 CPU 场景的 renderer、相机或数据通路。没有新增外部运行依赖、后端请求或第二套相机；GlideSelect 的图标为内联 SVG。

## 验证

- `npm run typecheck` 通过
- `npm test`：9 个测试文件、113 项通过
- `npm run build` 通过（保留既有 Three.js chunk size warning）
- `npm run test:e2e`：**24/24 通过**，单 worker，约 7.1 分钟；使用本地 Playwright Chromium 与配置的 SwiftShader 软件路径；包含正向、反向、中途反转、标签生命周期、全量 GlideSelect 选择、面板边缘模糊与背景降级
- 1440×900 首页 / 工作台 / 数据流 / 解构 / 返回，以及 1280×720、1440×1000、1920×1080 工作台实测
- 硬件 PBR：首页 42 draw calls、45,780 triangles；工作台 61 draw calls、5,142 triangles（draw calls 与 V2 工作台预算一致）
- 展开完成时 `data-chip-visible=false`；封装整体不参与最终教学板绘制
- 点击模型/按钮进入、运行、暂停、拖动旋转、滚轮缩放、恢复视角、返回首页、再次进入均通过；无控制台错误
- 未修改任何既有测试或测试期望；软件兼容路径通过 `data-render-quality` 与 `data-chip-material` 可见

## 截图

均来自实际 Chromium 浏览器渲染；除注明 2× 细节、分层对照图和 1440×1000 工作台外，为 1440×900 原生截图：

- [组装总览（含最终首页氛围层）](validation/chip-v3/01-assembled.png)
- [组装细节（2×）](validation/chip-v3/02-assembled-detail.png)
- [教学电路板](validation/chip-v3/03-teaching-plane.png)
- [数据流激活](validation/chip-v3/04-dataflow.png)
- [数据流光晕细节（2×）](validation/chip-v3/05-dataflow-detail.png)
- [电影化解构中段](validation/chip-v3/06-teardown.png)
- [电影化展开的六个层次阶段](validation/chip-v3/07-animation-layers.png)
- [工作台 GlideSelect 与面板边缘模糊（1440×1000）](validation/chip-v3/08-workbench-controls.png)

## 已知边界

- 教学板使用程序化 CanvasTexture，而不是外部 PCB 制造文件；纹理中的过孔、丝印和铜填充是视觉资产，不构成新的电路语义。
- 为保持现有单 Canvas 与性能预算，没有启用实时阴影贴图、SSR、后处理 Bloom 或第二套环境渲染；金属高光来自 PMREM 环境与直接光。
- 软件/CI 兼容层只降低芯片材质成本，不改变几何数量、180 针、装配基准、模块拓扑或 Trace 时间；硬件和软件截图在金属反光上会有差异。
- 视觉布局不改变模块拓扑、连接端点、CPU 提交或 Trace 时间；真实数据仍完全来自 Core Trace。
- V2 的单一 matcap 管线已升级为硬件 PBR 环境；软件/CI 兼容路径仍保留轻量 matcap 降级。[CHIP_V2_INTEGRATION](CHIP_V2_INTEGRATION.md) 保留为历史集成记录。
- GlideSelect 的视觉 trigger 是 pointer-first；键盘和屏幕阅读器继续使用底层原生 select，因此键盘路径是原生下拉而非动画菜单。若后续需要键盘也走 Glide 菜单，需作为新的可访问性任务单独实现。
- PanelEdgeBlur 是面板视口适配层，不是把整个工作台做全局模糊；Trace 下边缘刻意保持清晰，以保护阶段按钮和控制器。
- 首页背景的鼠标 scramble / click swell 关闭；Waves 在软件渲染下只保留静态 CSS 海面。背景动画与主场景解耦，但不能替代 reduced-motion 的静态路径。
