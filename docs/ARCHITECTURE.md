# 芯生架构（Sprint 03.1）

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

`step` 只提交一次；`tick` 只切观察阶段，连续运行在上一快照讲解完后才提交下一条。`playbackEpoch` 使重播和跳转可明确重置播放位置。暂停保留 PresentationClock，阶段跳转设置 inspection 到该阶段末端；`resumePlayback` 仅恢复快照，历史快照也可继续，不调用 Core。复位恢复当前项目初始寄存器 / RAM、清空执行记录。Sprint 03.1 使用可续执行预算和有界历史，见下节。

`usePlaybackDriver` 使用 requestAnimationFrame 与秒制帧时间，后台标签暂停计时，恢复时不累计隐藏时间。不逐帧写 Zustand，因此不会让整个 React 树按帧重渲染。动态媒体查询订阅处理 reduced-motion 改变。

## 空间转场

原跳变来自画布父布局突然缩放与换位，叠加 resize 后的相机目标重设。现在 Canvas 固定为视口尺寸且保持同一生命周期，HTML 中的 `scene-anchor` 只是目标矩形。

ResizeObserver / scroll 更新目标锚点；解析临界阻尼弹簧连续平滑锚点、模型尺度与解构进度。PerspectiveCamera 的 view offset 平滑改变光学中心，模型世界原点仍为 OrbitControls 旋转中心，缩放不会被自动适配抵消。相机 position 与 target 在恢复和场景切换时连续插值。`World` 在 OrbitControls 后、Drei Html 前更新矩阵，防止标签与模型错帧。

静止场景的文档滚动按屏幕坐标一比一跟随，避免快速滚回页首时模型仍滞留在屏幕外；展开 / 收合期间的目标迁移继续使用弹簧。

`ScenePresence` 控制 HTML 渐显、退出后卸载、错峰及 inert，退出元素退出布局且不再接收输入。焦点移到新场景的标题 / 进入按钮。全部坐标均为运行时计算，无截图遮挡、黑屏或等待定时器。

## 数据传播

`timelineFor` 按每条真实连线的弧长安排传输，平行传输共享因果组，后继组等待先前组到达。`SignalFlow` 预采样路径，在 BufferGeometry 上移动局部 draw range 与头部，不同时点亮整线。`ModuleBlock` 在发送开始和接收到达时响应，用颜色插值、微小抬升和阻尼亮度表达，不修改数据。

蓝 / 浅金 / 青绿区分数据、控制和写回。reduced-motion 使用静态端点与简化阶段切换。CPU 的架构面板始终显示已提交状态，场景展示的是所选快照。

## Sprint 02.1 布局与播放补充

`WorkbenchLayout` 独立持有面板尺寸，不访问 CPU；ResizeObserver 与约束计算适应视口变化。原生滚动限制在程序、状态、details 三个区域，紧凑模式允许页面滚动。分隔线使用 pointer capture 和原生 separator ARIA。Canvas 不随布局拆装；R3F eventSource / OrbitControls domElement 都指向同一真实 anchor，射线使用固定视口的 client 坐标。

`transferPlayback.ts` 将真实 Trace 按 phase/order 分组，跳过空阶段；WeakMap 缓存不含速率。Store 持有 `auto | transfer(index, complete)` 状态；playing 继续作为唯一播放开关，running 决定自动讲解结束后是否执行下一条。stepTransfer / pause / resume / observe / replay 从不调用 Core。只有原有 step / run 链可提交架构边沿。

PresentationClock 的 seek 是明确的观察跳转；update 按 playbackRate 累加逻辑秒。速率改变不换 epoch、不清空时间。传递模式在当前组到达与接收反馈结束后停止，下一因果组仍未发出；继续整程序运行时退出传递模式。reduced-motion 以相同控制边界快速展示静态端点。光流和模块反馈都读取逻辑时间，暂停期间不继续弹簧收敛。没有每帧 Zustand 更新。

## 边界

无 RTL 差分验证、完整指令集、完整异常控制或后端。IndexedDB 仅持久化项目配置，无云同步。有限内存越界与程序结束属于宿主策略。固定 Canvas 增加绘制区域，DPR 上限 1.5，未使用 Bloom、Blur 或粒子系统；真实设备性能尚需评估。

## Sprint 03 程序与配置边界

以下记录 Sprint 03 起点；容量、项目、持久化与执行策略由后面的 Sprint 03.1 补充取代。

`src/io/program.ts` 负责宿主 256 条容量、不可变编辑、地址 / BEQ 目标列表与 Core decode 子集校验；不增加指令或改变分支语义。`src/io/hex.ts` 有界解析、展开与标准导出；`memoryImage.ts` 验证地址 / 数值并生成完整的小端 RAM 镜像。它们没有 React、Three 或 DOM 依赖；文件选择 / Blob 下载只在 `HexImportPanel`。文件异步读取用世代编号丢弃旧结果，确认前没有 Store 写入。

Store 持有 `programId`、当前 ROM、单份 customProgram / customBaseline、选中索引、initialMemory / initialRegisters。切换、编辑、导入先完整校验，成功后由 `resetSession` 在单次 Zustand set 中重建 CPU、清空 Trace / 传递游标并推进 epoch；观察者不会看到新 ROM 搭配旧 Trace 的中间状态。复制 / 新建 / 导入建立自定义恢复基线；修改预设会创建副本，预设常量不变。

初始配置是独立不可变数据；每次 `initialState` 复制为新的架构状态。SW 仅生成运行内存，Reset / 改程序使用初始配置重新初始化。配置 action 要求 retired=0 且 !running / !playing；运行中不能从 RAM / 寄存器编辑产生写竞争。UI 只调用 Store action。文件、配置及自定义程序仅存会话内存，刷新清除。

CPU 固定 Canvas 未拆分或重建。首页独立 lazy 装饰 Canvas 不属于 CPU 场景；`GradientASCII` 离开首页、偏好改变或出错时共用完整资源释放，20 FPS / DPR 1 / 固定像素预算。JellyRadio 仅切 mode。来源、适配与授权见 `THIRD_PARTY.md`。

长帧下首帧 delta 可能跨越目标切换之前的时间。场景在 scene / viewVersion 提交时记录时间，仅首段按该目标实际生效的时长积分，后续保留完整帧 delta 与既有解析阻尼公式；不将切换前截图 / GPU 上下文处理的耗时计入新目标。拖拽超过 4px 不触发芯片进入操作，避免 OrbitControls 松手被当作点击。

## 未来 MMIO 接口规划（未实施）

本轮保留稳定 Core。下列是后续需用户确认的设计提案，不是现有接口或已验证 RTL 信号；**没有预设 Logisim MMIO 地址、分辨率或颜色编码**。

1. **区域映射**：配置表描述 `{ id, startByte, sizeBytes, kind: ram | mmio, permissions }`；校验整数、范围、溢出、重叠与地址对齐。RAM 和设备地址空间由配置显式定义，未映射访问返回明确的宿主故障，不伪造 RTL trap cause。不要硬编码设备地址。
2. **地址分派**：框架无关的 MemoryBus / AddressSpace 根据 CPU 字节地址定位区域，换算设备本地偏移，检查位宽 / 对齐 / 字节选通后调用 RAM adapter 或设备 adapter。未来重构先以现有内存结果、异常原子性和 Trace 做回归，再接设备。
3. **事务**：ReadTransaction 描述地址、宽度、访问编号；WriteTransaction 另含原始数据 / 字节选通。ReadResult 带 data / fault；WriteResult 带候选 deviceState / events / fault。设计 prepare → validate → commit 的一次架构边沿，错误访问不能部分修改 RAM 或设备；CPU 故障时丢弃候选状态。可能有副作用的读取同样候选化。
4. **设备模型**：纯 TypeScript `reset(config, initialState)`、`prepareRead`、`prepareWrite` 返回不可变设备状态与语义事件；不 import React / Three / DOM。初始设备配置与运行状态分离，Reset 恢复配置。设备注册表和配置验证由宿主协调，不通过展示组件直接写设备。
5. **事件 Trace**：提交成功后记录 `{ accessId, regionId, byteAddress, offset, width, data, strobes, deviceEvents }` 并关联同一 ExecutionTrace。像素事件由真实写事务解码，Trace 回放只绘制历史快照，不再次执行 write。访问事件和自定义设备事件标为宿主元数据，不冒充 RTL 端口。
6. **展示插件**：工作台预留独立设备区域 / 标签页；设备 id 映射 React 或 Three renderer，renderer 只读配置、设备快照和 Trace。插件卸载清理 Canvas / 纹理，不能改变 CPU 提交、PC 或 RAM。保留 CPU 主场景与无 WebGL 文本观察能力。
7. **显示配置入口**：用户先确认地址范围、寄存器或帧缓冲布局、宽高、像素格式 / 颜色编码、字节序、行跨度和刷新策略；再验证容量与写入映射。自定义分辨率设合理上限。没有设备配置时保持关闭；不据现有 Logisim 经验猜测常量。

下一阶段应以纯 bus / device 单测、SW 实际写入、Reset 和历史回放不重复写入作为接口落地基准，再实现最小显示插件。

## Sprint 03.1 容量与执行

起点的根因是多处硬编码 256 条 / 64 KiB 文件 / 1000 步、整列表 decode + DOM、无界 Trace、每次 SW 复制整个 number[]，以及单份会话 custom 状态。只改容量常量无法解决这些问题。

- `core/rom.ts` 的 InstructionROM 私有持有 Uint32Array（65536 条 = 262144 数据字节），封装只读下标 / 迭代 / 分页访问，复制输入并只导出副本。Core.step 接受 ArrayLike<number>，取址仍为 PC/4，末尾仍按既有策略停止。UI 每页 16 行，只解码这一页，支持 PC 跳转；支持性统计每次分块 1024 条扫描，不逐帧重扫整份 ROM。
- HEX / JSON 在 `io/parse.worker.ts` 解析，4 MiB 文件限制、展开前上限与格式检查不变为无限分配。Worker 结束 / 失败 / 取消后终止；代次和 AbortController 防止旧读取覆盖新文件，切换项目卸载旧预览。ROM 默认保留原始 unsigned32；所有 decode 展示都有错误分支，执行仍由 Core 安全 fault，不增加 ISA。
- Store 教学执行与快速执行共用 Core.step；快跑每批最多 512 条，并检查约 8ms 时间预算，每个 RAF 让出主线程，后台停止批次，可随时暂停。教学逐条慢动作未改。每次运行预算为 1000 / 10000 / 100000 / 1000000，到达后停止宿主调度，CPU 保持 ready，可显式继续。同步 core.run 测试辅助 API 仍保留最多 1000 步保护，长程序 UI 不调用它。
- 执行历史只保留最近 128 条，id 仍为真实退休序号；选择、回放和动画不重放架构写入。历史丢弃后不能回放更早指令；项目和 IndexedDB 不保存历史。
- 1 KiB RAM 保留小数组表示；64 / 256 KiB 使用 `PagedMemory`，私有 Uint8Array 页为 1 KiB。SW 复制一个数据页及 64 / 256 个引用的页表，其他页结构共享；所有旧架构状态仍只读。Core readWord / writeWord 的小端、4 字节对齐、字节选通、异常原子性和 RTL 信号计算不变。运行内存与初始镜像安全共享未变化页，Reset 无需复制整片大 RAM。
- RAM 主机窗口仅为 [0, ramSize)，支持 1 / 64 / 256 KiB。超出地址仍是宿主故障，没有把高地址外设空间当成 RAM，没有实现 MMIO。

## Sprint 03.1 项目与存储事务

`projects/model.ts` 定义 schemaVersion=1、id / name / createdAt / updatedAt、InstructionROM、initialRAM、initialRegisters、ramSize。最多 10 个自定义项目，三个内置示例只读。配置修改发布到对应项目，不保存 runtime CPU / Trace；切换会原子恢复该项目配置并重置播放。内置示例修改生成独立副本，UI 要求先复制。

IndexedDB 数据库 `silicon-life-projects` v1，projects store 按 id 存紧凑的 Uint32 / Uint8 buffer 副本，meta store 保存最近选择、schemaVersion 与工作区 revision。只有变更项目写 buffer，切换仅写 meta。新建、编辑 ROM / RAM / 初始寄存器、重命名和删除均进入同一 SaveQueue；对同一期间的新修改合并为最新不可变配置快照，事务串行提交。只有事务 oncomplete 且无待写快照时显示已保存；旧完成不能确认新修改。

每次写事务比较 expectedRevision，拒绝其他标签页的陈旧修改，保留页面当前内容并提示 JSON 备份，不静默覆盖较新的数据库。读取失败 / 未知 schema 不清空数据库；错误或配额不足不标成功、不循环重写。关闭前若仍保存或失败则用 beforeunload 提示等待 / 备份。浏览器强制退出仍可能丢失尚未完成的事务，不能将 UI 应用成功等同于持久化成功。

完整 JSON 导出 / 导入有独立版本与容量校验，包含全部初始配置；导入以新 id 建立副本，不覆盖已有项目。数据库版本和记录 schema 为未来显式迁移留出入口，当前只支持 v1。存储仅本域名本浏览器，没有账号、云同步或跨设备合并。

RAM UI 分为初始配置与运行只读，清空 / 缩小容量需确认，执行后先复位才能改配置。ROM/RAM 复用 HexFilePicker：真实 file input 保留可访问名称，通过可见按钮触发；文件名独立省略显示、title 提供完整名称，同名可重选。布局、Canvas、React Bits 及既有空间动效没有重构。Vite 忽略测试证据目录，避免文件生成干扰开发页。
