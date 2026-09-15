# 判据核对快照

本轮范围为冻结清单按原顺序的前 30 题；原始清单仍保留 96 题，不修改历史游戏运行成绩。

已核对 7/30 题、400/1654 个去重检查项；其余 23 题没有完整且凭据有效的核对结果。此文件反映已保存产物，不判断后台进程是否运行。

| 题目 | 检查项 | 有依据（模型） | 缺依据（模型） | 歧义（模型） | 执行约定 | 引用纠正 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| [target-rush](target-rush/review.json) | 46 | 36 | 0 | 7 | 3 | 有，原输出保留 |
| [maze-collector](maze-collector/review.json) | 68 | 61 | 1 | 5 | 1 | 有，原输出保留 |
| [key-door-escape](key-door-escape/review.json) | 60 | 50 | 0 | 9 | 1 | 有，原输出保留 |
| [platform-rescue](platform-rescue/review.json) | 73 | 68 | 0 | 4 | 1 | 有，原输出保留 |
| [signal-memory](signal-memory/review.json) | 68 | 55 | 10 | 2 | 1 | 有，原输出保留 |
| [fruit-slice-touch](fruit-slice-touch/review.json) | 42 | 32 | 4 | 5 | 1 | 无 |
| [neon-lane-racer](neon-lane-racer/review.json) | 43 | 41 | 0 | 1 | 1 | 有，原输出保留 |

模型标记的问题保存在 flagged-checks.json，包含原始取值、全部场景位置、模型理由和引文。这里的‘有依据’也不是独立认证；例如 target-rush A31 用真实引文推出未规定的终局编号，不能直接采纳，说明见 README。没有自动修改标准或评测成绩。

复现：pnpm exec tsx scripts/report-public-check-audit.ts --root results/public-check-audit-v1
