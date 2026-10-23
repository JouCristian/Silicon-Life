# Sprint 06 · CPU 元件内部探索

基于已提交的 MMIO 3D 视觉 `674677fef6e12af2b531073fea6db0a334ca73eb` 创建 `feat/sprint-06-module-exploration`，继承 `c7c7440` 的真实 MMIO 和所有 CPU/项目功能。起始工作区干净，不修改或移动既有提交。

## 操作

进入 CPU 工作台，点击 **PC、Register File、ALU 本体**，或使用右侧「元件内部探索」三个按钮。进入会暂停运行与讲解，保留真实 CPU 状态；可继续用现有单步/运行/回放观察内部值。点击顶部「返回主板」或按 **Esc**，镜头返回进入前的主板视角；动画尚未完成时也可退出。

MMIO 显示器继续由原外设面板连接、聚焦和返回。元件探索与 MMIO 聚焦互斥，切换不清空帧缓冲、不移除外设。回首页或切换项目退出探索；恢复视角退出探索并回主板默认视角。

## 实际 RTL 边界

本轮只读 `rtl/cpu/pc.v`、`regfile.v`、`alu.v`、`cpu_defs.vh` 与 `cpu_top.v`。未修改 RTL，未做门级或 RTL 联合仿真。

| 元件 | 内部结构依据 | 数据来源和展示范围 |
| --- | --- | --- |
| PC | pc.v 的 32 位寄存器，同步 reset 优先，否则 next_pc → pc | Q=Trace.pc_value、D=Trace.next_pc、提交后 Q=Trace.after.pc；PC+4、redirect、branch/jump target、Trap 保持明确标为 cpu_top 外部输入上下文 |
| Register File | regs[0:31]，双异步读、单同步写，x0 恒零，无转发 | 32 格展示 Trace.before.registers；原始 rs1/rs2 端口和数据来自指令字段/Trace；写口展示 rf_we、rd、wb_data 和 committed，x0 丢弃不画有效写入路径；提交后值在文字及原寄存器面板 |
| ALU | alu.v 的十个 case 分支与 cpu_defs.vh 控制编码 | a/b/op/result 全部直接读取 Trace；只强调选中的 case，不计算未选路径结果；移位低 5 位、有符号比较与算术右移按 RTL 说明；分支比较仍属于独立 Branch Unit |

内部图是按 RTL 功能层级组织的三维剖面示意，不声称为综合后的物理布局或晶体管网表。ALU case 图不表示十套并行物理运算单元；PC 外部上下文不伪称为 pc.v 内部。无 Trace 时明确等待信号，寄存器/PC 显示当前实际架构状态。历史检查标注快照序号；无 Trace 的宿主故障保留最后有效快照并说明，不冒充故障指令信号。

## 扩展接口

- `src/scenes/exploration/model.ts`：`ExploreNode`、`ExploreWire`、`ModuleExploration`、`EXPLORERS`。注册项提供标题、RTL 来源和纯只读 build(cpu, trace)，对接既有 11 个 ModuleId。后续添加 ExplorerId、注册项和对应语义模型即可复用渲染、面板和镜头。
- `ModuleInterior.tsx`：同一教学板坐标中的剖面图，仅基础方块、边线、连接和 HTML 数值。资源交由 R3F 生命周期管理，无远程字体、独立时钟或额外 Renderer。剖面按明确绘制顺序显示，避免底层模块贴图遮挡内部信号。
- `camera.ts`：按真实裁剪视口计算内部图适配距离，兼容分隔线调整。
- `useExplorationStore.ts`：只管理会话中的选择与互斥聚焦；通过现有 pause action 停止播放。退出、切换和回放不执行指令，不保存到项目。
- 原 World 使用同一 camera / OrbitControls，解析阻尼驱动展开与淡出、相机连续插值，反向不重置运动状态；返回恢复视角。减少动态效果时直接展示最终位置。
- `ModuleExplorerPanel` 提供键盘入口、Esc、真实信号及寄存器文字备选；没有 WebGL 时仍可读取。

CPU Core、Trace 的执行语义、ROM/RAM、项目持久化、topology.ts、MMIO 设备和 V3 材质均未修改。现有主 Canvas 不因探索选择而更换 key 或卸载。

## 必要验证

类型检查、4 个相关测试文件共 183 项通过，包括所有 ALU case 信号、32 寄存器前后快照/双读/有效写、PC 顺序/分支/JAL/JALR/Trap、裁剪视口适配、聚焦互斥、进入暂停而不重复提交，以及已有 RV32I 小程序、MMIO、Trace 回放。

本地 Chrome 检查三个内部视图、PC 本体点击、返回与 MMIO 切换。未运行完整 E2E、长时间性能或门级验证。

当前限制：只开放三个模块；内部为功能结构示意，精细封装、门级模型和材质交给后续视觉开发。图内连线表示功能关系，不增加时钟周期或伪造内部传播时间。桌面视口为主要验收入口，窄屏可使用右侧文字/寄存器备选。
