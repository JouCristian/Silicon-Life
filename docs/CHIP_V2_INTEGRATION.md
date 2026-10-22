# DeepSeek V2 芯片集成

> V3 已在 `feat/chip-v3-visual` 替换 Matcap 和材质/教学板管线，见 [CHIP_V3_VISUAL](CHIP_V3_VISUAL.md)。本文保留 V2 集成的历史记录。

本轮只替换首页封装模型。CPU Core、ISA、ROM/RAM、项目管理、Trace、正式模块与连线坐标保持原实现。

## 来源与 Git

- 基线：远程 main `34b6f6d`（已合并 Sprint 03.1）。创建 `feat/integrate-chip-v2`，不修改远程 main。
- 用户提供的冻结资产：`69d8113`，完整 cherry-pick 为本分支 `f882e2f`。原型目录与该提交内容一致，包括原始模型、纹理、调试与验证素材。
- 正式页面只引用 `src/scenes/chip/`，没有引用原型 main.js、scene.js、交互 UI、相机、灯光、vendor Three.js 或 DemoModules。
- 本轮只有本地提交；不 Push、Merge 或部署。

## 主要文件

| 文件 | 作用 |
| --- | --- |
| `src/scenes/chip/geometry.js` | 保留 V2 几何生成、统一原点、装配基准及无状态拆解 API；移除演示模块、演示信号线路和演示标签 |
| `src/scenes/chip/textures.js` | 仅保留品牌、装饰丝印、序列号和边缘光的程序化纹理 |
| `src/scenes/chip/geometry.d.ts` | 模型零件、姿态、生命周期的 TypeScript 接口 |
| `src/scenes/chip/model.ts` | 一次性坐标变换、合批、顶点共享、材质所有权及生产离场编排 |
| `src/scenes/chip/materials.ts` | 128×128 程序化摄影棚 Matcap，降低高精度封装的片元着色成本 |
| `src/scenes/chip/ChipAsset.tsx` | R3F 挂载与释放；资源在 layout effect 中创建，不在 React render 中分配 |
| `src/scenes/CpuScene.tsx` | 用已有 reveal 弹簧驱动模型，保持单 CPU Canvas、原相机、OrbitControls、教学板与 Trace 路径 |
| `src/tests/chip-model.test.ts` | 几何、针脚、循环复装、反向与资源释放测试 |
| `src/tests/fixtures/chip-v2-assembly.json` | 从冻结原型独立生成的机械几何与针脚矩阵基准 |
| `e2e/chip-v2.spec.ts` | 浏览器生命周期、首页视角、桌面布局和三种状态截图 |
| `scripts/chip-benchmark.mjs` | 可复测的 Canvas 绘制与帧间隔采样 |

几何源继续使用便于与 DeepSeek 资产比对的 JavaScript；边界和适配器使用 TypeScript。正式构建使用项目已安装的 Three.js r182，不装新依赖。测试不把原型 DemoModules 当作正式 CPU。

## 坐标和装配

原型以 X 为右、Y 为上、Z 为前，原点是完整封装的几何中心。生产挂载层固定绕 X 旋转 π/2，统一缩放 0.72，映射为教学板的 XY 平面、Z 向上。挂载后不在逐帧动画中修补模型原点或整体装配坐标。

六个机械零件保持各自装配坐标。180 根 QFP 针脚仍为一个 InstancedMesh；其全部实例矩阵 SHA-256 与冻结原型一致。TopCover、BrandPlate、Substrate、OuterFrame、PinArray 的包围盒与原型基准一致，品牌载体与 seat lip 接触间隙为 0，盖板触片压合量保持 0.0025。

同一机械零件内按材质与 renderOrder 合批，不跨可动画关节；合并完全相同的位置、法线和 UV 顶点，保留硬边、纹理接缝与全部三角形。静态几何只在挂载时构建。工作台完成后，封装整体隐藏并停止封装射线递归，避免遮挡正式模块或多余针脚命中测试。

## 动画接入

`createIntegratedChip()` 返回 `root`、`setExplodeProgress(progress, exitX?, exitY?)`、只读快照及幂等 `dispose()`。适配层没有时钟、renderer、controls、React 状态或 CPU 状态。

World 使用既有临界阻尼 reveal，逐帧传入进度；不移植原型播放循环。原型的品牌先行、顶盖随后及姿态插值保留；额外抬升和左右离场从同一进度计算，离场距离继续使用现有视口、相机缩放与 escape 弹簧。反向不清空弹簧速度，也不累加位移。

上层封装在进度 0.12–0.94 连续淡出，固定基座在 0.30–0.78 淡出；原教学板和标签按既有规则显露。完成后显示原有 11 个模块和 topology.ts 的真实路径，不带入原型控制信号或模块坐标。原来的 HTML 大字品牌改由模型品牌纹理承担，保留无事件的 HTML 投影锚点用于可访问命名和交互验证。

场景空间动画单帧推进最多 50 ms，避免软件 GPU 停顿时跳过拆解中间态。低帧率下仅延长场景呈现，CPU 的一次状态提交、Trace 时钟、暂停和回放边界不变。reduced-motion 仍立即切换。

## 材质和资源

逐零件克隆共享材质，防止顶盖淡出误改固定底座。正式封装使用轻量 Matcap 金属反射，品牌、丝印和边缘光仍为原程序化纹理；不创建环境渲染器或 PMREM 渲染流程。材质的 transparent 配置在挂载时固定，避免正反向动画期间首次编译新着色器。

每次挂载只有一份静态模型；切换首页/工作台不卸载模型或 Canvas。StrictMode 的 setup/cleanup 探测可安全重建。卸载时去重释放 Geometry、Material、CanvasTexture、共享 Matcap 以及 InstancedMesh 的实例缓冲；合批临时几何立即释放。没有外部全局纹理缓存或额外 OrbitControls。

## 验证和复现

```powershell
npm run typecheck
npm test
npm run build
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.local/browsers"
npm run test:e2e
```

新增几何测试覆盖 12 次循环和中途反向后的精确复装、固定进度幂等、所有权资源恰好释放一次及重复创建/销毁。原有 CPU 测试基准不变。E2E 保留三个教学程序结果（x3=12/42/42）、真实内存与分支、单步传递、倍速、暂停、回放、Canvas 身份和事件隔离；只将旧 HTML 品牌的准备检测改为 V2 模型准备状态和投影锚点。

桌面截图覆盖 1280×720、1440×900、1920×1080。开发模式访问 `/?chip-inspect=0.38` 可固定已有 reveal 的观察姿态，点击进入工作台可审查拆解细节；这是可选静态检视，不是新播放时钟，生产构建不接受该覆盖。

性能采样应独占浏览器运行，避免与 E2E 竞争软件 GPU：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.local/browsers"
node scripts/chip-benchmark.mjs current
# 可选：CHIP_URL 指向基线服务；CHIP_GPU_MODE=hardware 请求 Windows D3D11。
# 必须检查输出 renderer，不能仅凭参数宣称硬件加速。
```

最终测试结果、截图与测量见下方交付记录及 `CHIP_V2_PERFORMANCE.json`。帧间隔包含浏览器、CPU、GPU与系统调度，不是独立 GPU 定时结果。

## 已知边界

- Matcap 是程序化摄影棚反射近似，保留银灰结构与圆角法线，不等同于原型的实时 PBR/clearcoat、阴影和灯光系统；这样避免把原型完整视觉引擎带进主场景。
- 高精度几何增加首页三角形数；完成展开后封装无绘制，教学板的绘制量维持基线。软件 WebGL 的首页仍比旧线框封装更重，需真实低端 GPU/移动设备人工验收。
- 没有新增三维模块选择系统；保留既有模块数值响应、阶段观察和 HTML 信息面板交互。
- 原型目录为冻结参考；修改正式模型请同步几何基准和验证，避免通过修改 CPU 正确性期望掩盖视觉问题。

## 最终交付记录

- 类型检查通过；9 个测试文件、113 项单元测试通过；生产构建通过。
- 最终完整 E2E：24/24 通过，单 worker、无重试，约 3.2 分钟。覆盖三个桌面分辨率、原生 125%/150% 缩放及原有全部程序/内存/项目/Trace 回归。
- 额外使用生产 `dist/` 运行浏览器冒烟：网格点击进入、Canvas 身份、返回首页、无控制台错误；算术/内存/分支分别得到 `(x3,PC)=(12,0x0c)/(42,0x10)/(42,0x14)`。生产模式确认忽略 `chip-inspect` 参数。
- 原型目录逐文件与 `69d8113` 比对无差异；Core、Store、IO、projects、topology.ts、motion/design.ts 与基线无差异。
- Tailwind 排除 experiments 扫描，防止冻结原型的 UI utility 内容进入正式 CSS。没有引入新的依赖或原型 UI 样式表。

性能采样为顺序独立浏览器会话，1440×900、每状态 5 秒、同版本 Chromium；基线来自 main 的工作区内隔离副本，仅加同样的只读绘制统计。原始逐帧文件保留在 `.local/chip-v2/`，可分享摘要在 [CHIP_V2_PERFORMANCE.json](CHIP_V2_PERFORMANCE.json)。

| 指标 | 集成前 | 集成后 |
| --- | ---: | ---: |
| 首页绘制调用 | 203 | 38 |
| 首页三角形 | 7,436 | 41,252 |
| 工作台绘制调用 / 三角形 | 61 / 1,578 | 61 / 1,578 |
| 访问工作台后的已上传 Geometry | 202 | 97 |
| RTX 4060 D3D11 首页帧间隔中位数 | 4.2 ms | 4.2 ms |
| RTX 4060 D3D11 工作台帧间隔中位数 | 4.2 ms | 4.2 ms |
| SwiftShader 首页帧间隔中位数 | 108.0 ms | 133.3 ms |
| SwiftShader 工作台帧间隔中位数 | 13.8 ms | 15.4 ms |
| 全部生产 JS（原始大小） | 1,417,044 B | 1,444,713 B |
| 全部生产 JS（逐文件 gzip 之和） | 413,207 B | 423,071 B |

硬件测试实际报告 NVIDIA GeForce RTX 4060 Laptop GPU / D3D11，约 239 FPS，触及约 240 Hz 的采样上限；这不能证明两种模型的 GPU 执行成本相同。软件渲染下首页仍较重，工作台约 65 FPS（基线约 72 FPS），单次短采样不用于宣称普遍性能等价。未运行独立 GPU timer query，也未测试真实低端/移动 GPU。Three 共享包约 1.17 MB 的既有体积警告仍存在。建议人工优先审查 Matcap 金属外观、反向过渡和低端设备表现。

静态拆解对比固定为同一 reveal=0.38 的开发检视，另保留正常连续动画中段的实际截图及逐帧记录，不把静态检视当作正常播放的时间采样。

| 状态 | 基线 | V2 集成 |
| --- | --- | --- |
| 首页组装 | [旧首页](validation/chip-v2/before-home.png) | [V2 组装](validation/chip-v2/assembled.png) |
| 拆解姿态（0.38） | [旧拆解](validation/chip-v2/before-disassembly.png) | [V2 拆解](validation/chip-v2/disassembly.png) |
| 完整工作台 | [旧工作台](validation/chip-v2/before-workbench.png) | [V2 工作台](validation/chip-v2/workbench.png) |
| 返回首页 | [旧返回](validation/chip-v2/before-return.png) | [V2 返回](validation/chip-v2/returned.png) |

[正常转场中段实拍](validation/chip-v2/live-transition.png) · [正反向逐帧记录](validation/chip-v2/motion-samples.json)。1280/1440/1920 全套截图保留在 `.local/chip-v2/final/`，可用新增 E2E 重新生成。
