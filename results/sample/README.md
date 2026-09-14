# Sample results

本目录用于存放可随仓库发布的小型、可复现 pilot 输出。它只验证端到端格式与评测逻辑，不是正式 benchmark，也不是 Hy3 能力结论。

生成方式：

```bash
pnpm run eval:sample
```

运行时完整证据默认写入被 Git 忽略的 `artifacts/runs/<run-id>/`。本目录已经从同一个已完成 run 原样复制一份 fixture snapshot：

- `summary.json`：run ID、数据/浏览器元数据和聚合指标；
- `cases.json`：逐例 evaluation、observation 与浏览器诊断；
- `events.jsonl`：逐动作 trace；
- `screenshots/<case>/*.png`：必要的已脱敏画面证据；

## 已提交 snapshot

| 字段 | 值 |
| --- | --- |
| Source run ID | `2026-08-29T06-11-45-870Z-1ce7e529` |
| 数据 | `GameTestLab Pilot` v0.1.0，5 个项目自建故障/对照变体 |
| 浏览器 | Chromium `151.0.7922.34`，headless |
| Hy3 API | **未使用**（`hy3_api_used=false`） |
| 来源说明 | `snapshot-provenance.json` |

机器产物中的 pilot 指标如下：

| 指标 | 原始计数 | 比例 |
| --- | ---: | ---: |
| Final answer accuracy | 4 / 5 | 0.8 |
| Process correctness | 1 / 5 | 0.2 |
| Localization exact | 4 / 4 个非 clean 变体 | 1.0 |
| Localization within one | 4 / 4 个非 clean 变体 | 1.0 |
| False-positive rate | 0 / 1 个 clean 变体 | 0.0 |
| Lucky-pass recall | 2 / 2 个预设 lucky-pass 变体 | 1.0 |

这些数字是对**预设且 oracle 已知的同一极小游戏变体**进行的管线校准。它们表明 evaluator 复现了设计好的故障，不代表 Hy3 在未知真实游戏上的准确率；尤其 `0/1` 的误报率没有统计外推意义。错误分类 macro-F1 也是在 4 个预设故障、2 个标签上得到，不能当作正式 benchmark 结论。


不得手工编造或“修漂亮” JSON 数字。每个后续 snapshot 都应记录 run ID、commit、生成命令和 SHA-256 清单；当前 `snapshot-provenance.json` 未记录 Git commit，这是 pilot provenance 的已知缺口，正式 release 必须补齐。

任何数字以本目录实际 `summary.json`、`cases.json` 和 `events.jsonl` 为准；本说明只帮助阅读，不覆盖机器产物。
