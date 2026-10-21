# Sprint 02 架构

```text
编辑器 / 程序选择 → Store action → encoded program
                                  ↓
                          pure core.step()
                                  ↓
               immutable CpuState + ExecutionTrace
                     ↓                     ↓
           PC / registers / memory     transfers + phases
                                           ↓
                           timelineFor(trace, phase)
                                           ↓
                     PresentationClock → GPU pulse / module response
```

## 架构提交

`src/core/isa.ts` 编码和译码五条指令。`memory.ts` 提供不可变、小端、字节选通的字数组读写；默认 1 KiB，初始化可选 4–65536 字节且长度为 4 的倍数。Core 先验证分支和访存，再产生寄存器、内存和 PC 的一次性新状态。发生异常时三者与退休计数都不变。纯 Core 不引用 React、Three、DOM、时钟或 Store。

`trace/transfers.ts` 产生实际参与的逻辑连接、信号、数据、源/目的模块与因果组序号。因果顺序是教学元数据，不表示单周期电路中的流水阶段或精确传播延迟。线路几何属于 `scenes/topology.ts`；它只能改变视觉运动的时间与形状。

## Store 和播放

`step` 只提交一次；`tick` 只切观察阶段，连续运行在上一快照讲解完后才提交下一条。`playbackEpoch` 使重播和跳转可明确重置播放位置。暂停保留 PresentationClock，阶段跳转设置 inspection 到该阶段末端；`resumePlayback` 仅恢复快照，历史快照也可继续，不调用 Core。复位清空状态、内存和记录，最大执行 1000 条。

`usePlaybackDriver` 使用 requestAnimationFrame 与秒制帧时间，后台标签暂停计时，恢复时不累计隐藏时间。不逐帧写 Zustand，因此不会让整个 React 树按帧重渲染。动态媒体查询订阅处理 reduced-motion 改变。

## 空间转场

原跳变来自画布父布局突然缩放与换位，叠加 resize 后的相机目标重设。现在 Canvas 固定为视口尺寸且保持同一生命周期，HTML 中的 `scene-anchor` 只是目标矩形。

ResizeObserver / scroll 更新目标锚点；解析临界阻尼弹簧连续平滑锚点、模型尺度与解构进度。PerspectiveCamera 的 view offset 平滑改变光学中心，模型世界原点仍为 OrbitControls 旋转中心，缩放不会被自动适配抵消。相机 position 与 target 在恢复和场景切换时连续插值。`World` 在 OrbitControls 后、Drei Html 前更新矩阵，防止标签与模型错帧。

静止场景的文档滚动按屏幕坐标一比一跟随，避免快速滚回页首时模型仍滞留在屏幕外；展开 / 收合期间的目标迁移继续使用弹簧。

`ScenePresence` 控制 HTML 渐显、退出后卸载、错峰及 inert，退出元素退出布局且不再接收输入。焦点移到新场景的标题 / 进入按钮。全部坐标均为运行时计算，无截图遮挡、黑屏或等待定时器。

## 数据传播

`timelineFor` 按每条真实连线的弧长安排传输，平行传输共享因果组，后继组等待先前组到达。`SignalFlow` 预采样路径，在 BufferGeometry 上移动局部 draw range 与头部，不同时点亮整线。`ModuleBlock` 在发送开始和接收到达时响应，用颜色插值、微小抬升和阻尼亮度表达，不修改数据。

蓝 / 浅金 / 青绿区分数据、控制和写回。reduced-motion 使用静态端点与简化阶段切换。CPU 的架构面板始终显示已提交状态，场景展示的是所选快照。

## 边界

无 RTL 差分验证、完整指令集、完整异常控制、持久化或后端。有限内存越界与程序结束属于宿主策略。固定 Canvas 增加绘制区域，DPR 上限 1.5，未使用 Bloom、Blur 或粒子系统；真实设备性能尚需评估。
