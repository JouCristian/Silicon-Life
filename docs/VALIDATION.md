# Sprint 01 验证记录

日期：2026-10-21（Asia/Shanghai）。Windows，本地 Node v24.15.0、npm 11.12.1。

| 检查 | 结果 |
| --- | --- |
| 依赖安装 | 官方 npm registry，项目内独立缓存；审计 0 vulnerabilities |
| `npm run typecheck` | 通过 |
| `npm test` | 2 个文件，23 项通过 |
| `npm run build` | 通过；Three 共享包约 1.17 MB，gzip 327 KB，存在体积警告，非构建失败 |
| `npm run test:e2e` | 2 条 Chromium 浏览器验收通过；使用 SwiftShader 渲染真实 WebGL 场景 |
| 开发服务器 | `http://127.0.0.1:5173/`，HTTP 200 |
| RTL 完整性 | 实现前后 8 个文件 SHA-256 一致；未修改 |

## 核心验证

独立已知机器码 `00500093 / 00700113 / 002081b3` 对应三条示例指令。执行得到 x0=0、x1=5、x2=7、x3=12、PC=12、retired=3。

单元测试包含立即数边界与符号扩展、非法寄存器及指令、32 位回绕、有符号显示、150 组使用 BigInt 独立求和的样本、x0 写入丢弃但 RTL rf_we=1、原始 rs2 和未使用 imm、不可变快照、未对齐与非法指令无提交、空程序结束、执行预算。

Store 测试包含运行结束、复位、暂停/继续、阶段跳转/回放不重复提交、独立 1000 条上限、有效初始寄存器及编辑程序后重新执行。

## 浏览器验证

- 首页芯片可见、点击实际 mesh 进入连续存在的场景，返回首页再进入仍保留 CPU 架构状态。
- 运行示例后 x3=12、PC=0x0000000c；回放不改写架构寄存器。
- 专业信号与 ALU 高亮可观察；立即数编辑后编码为 0x00900093，单步实际得到 x1=9。
- 初始寄存器输入 0xffffffff 显示有符号 -1；复位清零。
- 旋转、滚轮缩放、恢复视角可操作。
- 1440×1000 和 390×844 布局验收，手机文档宽度不超出窗口。
- reduced-motion 模式仍能运行三条指令与往返转场。
- 捕获 `pageerror` 与 console error，最终为 0。

浏览器发现并修复过 Drei HTML 标签与默认容器的卸载冲突；现使用独立且稳定的 label portal。保留测试覆盖揭示和返回路径。

截图（本地忽略目录）：`.local/home.png`、`.local/workbench.png`、`.local/preview.png`、`.local/executed.png`、`.local/mobile.png`。

本机浏览器下载保存在项目内，运行 E2E 时使用：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.local/browsers"
npm run test:e2e
```

其他机器按 README 使用 Playwright 标准安装路径即可。CI 使用 Ubuntu + Node 24，已提供工作流，但 **尚未推送，因此尚未在 GitHub Actions 实际运行**。

## 尚未验证或未完成

- 无 Testbench 或 Verilog 模拟器，未做 RTL 编译、联合仿真、形式验证或差分测试。
- LW/SW/BEQ、完整 RV32I、trap 完整映射未实现。
- 无真实移动 GPU、Safari/Firefox、低性能设备或正式 WCAG 审计；WebGL 不可用的降级实现尚未独立 E2E 覆盖。
- 首页解构是初步版本；完整封装细节、完整控制扇出与移动端精细标签仍待完善。
- Three 依赖包体积较大，后续优化按需导入与渲染性能；没有通过提高警告阈值掩盖体积提示。
- 没有外网部署或 v0 导入验证，本轮仅准备标准工程和协作规范。
