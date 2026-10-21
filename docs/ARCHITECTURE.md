# Sprint 01 架构

```text
Instruction Editor → store action → encoded program
                                   ↓
                              pure core.step()
                                   ↓
                     CpuState + immutable ExecutionTrace
                         ↓                    ↓
                  register/PC panel     phase transport
                                              ↓
                                   R3F scene + signal panel
```

`src/core/isa.ts` 只处理两种 ISA 指令与数值表示；`cpu.ts` 负责架构执行。`trace/types.ts` 定义可扩展类型，包括未使用的对齐小端内存接口。无 React、DOM、Three 或定时器依赖。

`src/stores/useLabStore.ts` 管理真实状态与播放状态：`step` 提交一次，`tick` 移动快照观察阶段。连续运行在上一快照讲解结束后才提交下一条，最大 1000 条。`observe` 暂停并切换观察阶段；`replay` 播放指定历史快照。它们不提交指令。复位清空状态和历史，编辑指令也复位，以免旧快照与新程序混用。设置初始寄存器只在未执行时允许；复位仍清零。

场景由一个持续存在的 Canvas 构成：盖板四块向外展开，模块由紧凑位置移动到稳定教学位置。使用阻尼弹簧插值，减弱动态偏好时立即定位。OrbitControls 支持旋转、缩放、平移和恢复。线路脉冲仅表达快照阶段，绝不参与计算。

页面默认首页；点击芯片、进入按钮或工作台导航进入教学模式。演示与专业模式共享架构状态，专业模式增加 RTL 信号快照。核心 3D 懒加载并独立分包。WebGL 不可用时保留 HTML 操作与解释。

边界：只支持固定三条可编辑程序，不是汇编器；没有完整 RV32I、流水线、AI 聊天、持久化、后端或 RTL 联合仿真。数据内存与 LW/SW/BEQ 均为扩展契约，不提供假实现。
