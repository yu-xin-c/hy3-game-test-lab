# 生成过程评估

从真实玩法问题出发，核对公开实现说明与代码，再追溯实际写入步骤。

```sh
pnpm run app
pnpm run run:process -- --out 新目录 --cli /absolute/path/to/codebuddy
pnpm run report:process -- --out results/process-v1
```

页面在 http://127.0.0.1:4175，真实错误证据在 /mined。两页只读，展示公开要求、方案、代码、状态、时间采样与 Hy3 复核。

生成和模型复核均固定 Hy3/high。模型只接收公开要求；私有检查只用于生成后的测试。已有代码核对哈希后复用，中断尝试单独保留，基础设施错误不计作游戏缺陷。单题续跑使用 --only。

## 三种位置

| 位置 | 含义 |
| --- | --- |
| 操作序号 | 首次观察到问题的输入 |
| 工具步骤 | 相关代码在哪次 Write/Edit 中产生 |
| 方案步骤 | 哪条公开实现判断被证据推翻 |

三者不必一一对应。代码引用必须精确匹配，日志回放必须与最终文件一致，才能认证来源。修复过的中间错误与最终仍存在的错误分开；缺少自行执行测试不自动算作过程错误。

## 实测入口

- [3 题生成过程与 33 次路径执行](../results/process-v1/REPORT.md)
- [真实错误复验、混元定位与局部干预](../results/error-mining-v1/REPORT.md)
- [96 题运行汇总](../results/consolidated/summary.json)
- [完整分析与指标口径](../reports/analysis-report.md)

报告区分自动规则、模型意见与运行对照。代码追溯不是推理首错的独立证明；题面歧义不纳入确定错误集合。视频不在本次交付范围。
