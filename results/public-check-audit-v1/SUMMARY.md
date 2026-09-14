# 判据核对快照

已核对 2/96 题、114/5182 个去重检查项；其余 94 题没有完整且凭据有效的核对结果。此文件反映已保存产物，不判断后台进程是否运行。

| 题目 | 检查项 | 有依据（模型） | 缺依据（模型） | 歧义（模型） | 执行约定 | 引用纠正 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| [target-rush](target-rush/review.json) | 46 | 36 | 0 | 7 | 3 | 有，原输出保留 |
| [maze-collector](maze-collector/review.json) | 68 | 61 | 1 | 5 | 1 | 有，原输出保留 |

模型标记的问题保存在 flagged-checks.json，包含原始取值、全部场景位置、模型理由和引文。这里的‘有依据’也不是独立认证；例如 target-rush A31 用真实引文推出未规定的终局编号，不能直接采纳，说明见 README。没有自动修改标准或评测成绩。

复现：pnpm exec tsx scripts/report-public-check-audit.ts --root results/public-check-audit-v1
