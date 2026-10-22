# V2 + V3 GitHub 集成范围

## 冻结基线

- main：`34b6f6dc430692e1ab18b65f65236315b92fcc1c`。
- V2 原始资产引入：`f882e2f`；正式 R3F 集成：`aae1c46`。
- V3 人工验收冻结：`f2180794a22c8e120a6df371d5a71d0dc8fdb991`。
- 本地 annotated tag `v3-visual-freeze` 的目标仍为上述 V3 提交。

V3 完整继承 V2 集成历史。本次后续提交仅整理仓库跟踪范围、归档文档及分支部署配置，不改变冻结的 `src/`、`e2e/`、`scripts/`、依赖或 CPU/Trace 语义。

## PR 最终文件范围

保留正式芯片模型、几何回归基准、生命周期管理、V3 电影化拆解、教学 PCB、UI 组件、已有全部测试，以及 V3 人工验收截图。

从 Git 索引中取消跟踪以下本地归档目录，并加入 `.gitignore`；磁盘原件保留：

- `experiments/deepseek-chip-prototype/`：历史独立演示页面、调试/截图工具、重复 vendor Three.js、原型验证截图及原型源码。正式模型源码已在 `src/scenes/chip/` 中完整集成。
- `docs/validation/chip-v2/`：已被 V3 替代的旧截图和逐帧调试记录。

这些目录不出现在 PR 相对 main 的最终文件差异中，但仍能从冻结提交或此前 V2 历史提交恢复；不重写历史、不删除本地资产。V2 文档中的归档证据链接使用不可变冻结提交地址，避免失效。

## 部署与标签

本次只允许 Push 和 PR，不部署。`vercel.json` 仅对 `feat/chip-v3-visual` 设置 `git.deploymentEnabled=false`，以阻止 Git 集成自动生成预览。依据：[Vercel Git Configuration](https://vercel.com/docs/project-configuration/git-configuration)。其他分支延续既有规则；将来合并 main 可能触发现有生产自动部署，应由用户另外决定合并/发布时机。

推送只指定 feature branch，显式关闭 follow-tags。不上传、删除或移动 `v3-visual-freeze`。

建议之后使用 **Create a merge commit**，保留资产引入、V2 集成、V3 冻结及本次整理的完整祖先关系。若选择 squash，冻结 Tag 仍表示原始验收提交，不能擅自移动到 squash 提交。远程 Tag 的发布与后续发布 Tag，应在用户确认合并策略后另行处理。

## 验证说明

冻结文档记录的本地结果：类型检查、113 项单元测试、24 条 E2E 和生产构建通过。GitHub Actions 的本次实际状态以 PR 最新提交的 Checks 为准；不会用本地或历史结果冒充云端通过。若云端失败，先报告具体失败步骤/断言和原因，保持冻结版视觉源码。
