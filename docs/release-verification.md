# 发布复现检查

2026-09-15：从已推送的 `fa42fd9` 导出独立源码快照，不复制未跟踪文件、原始模型响应或本地实验缓存。

## 已执行

- `pnpm run report:process -- --out results/process-v1`：从公开证据重建 3 题、33 次路径的生成过程报告。
- `pnpm exec tsx scripts/report-mined-errors.ts`：从公开证据重建 3 个游戏的完整提示复核报告。
- `pnpm exec tsx scripts/prepare-mined-review.ts`：生成 3 个只读证据页面的数据。
- `pnpm run check`：类型检查、96 题数据校验和 119 项单元/DOM 测试通过。
- `pnpm run test:browser`：22 项真实 Chromium 测试通过。
- 新运行器对已有 Target Rush 执行单题续跑，输出 `REUSE target-rush`；未重新调用生成模型。

依赖通过链接复用本机已安装的 node_modules；此检查验证仓库文件的完整性与可搬迁性，不等同于重新从网络安装依赖。原始模型响应保留在本地，公开报告通过提示哈希、模型回执、最终代码哈希及执行记录重建。重新生成游戏仍需配置 CodeBuddy 的 Hy3 访问权限。

## 阅读指标

规则校准集、96 题运行结果、3 题生成过程实验及真实错误诊断是不同数据来源，不合并成一个准确率。报告中的模型意见、自动标准和代码来源证明分别标明。小型预设校准集的定位率与误报率不代表未知游戏上的总体性能。

## 入口

`pnpm run app` 后打开 `/` 查看生成过程，打开 `/mined` 查看真实错误证据。两页均只读。视频及相关脚本不包含在本次发布修改中。
