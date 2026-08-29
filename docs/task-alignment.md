# 赛题要求对照

本项目面向“任务二：大模型生成内容的过程质量评测与错误定位”。评测对象是 AI 生成的浏览器游戏，核心交付是可复现的检测手段：真实运行、完整路径检查、UI 证据采集和首错定位。用户需求或 PRD 可以帮助生成场景和断言，但不是必需输入，也不是唯一真值。

## 对照表

| 赛题要求 | 本项目做法 | 验收入口 |
| --- | --- | --- |
| 公开代码、运行说明和许可 | README、环境版本、MIT 许可 | `README.md`、`.nvmrc`、`LICENSE` |
| 使用 Hy3 API，不训练或微调 | 可用 Hy3 生成待测游戏或辅助生成测试计划；密钥只从环境变量读取 | `src/llm/`、`.env.example` |
| 展示内容生成后的质量检测过程 | 浏览器逐步执行动作并保存 state、event、DOM/Canvas、截图和错误 | `src/runtime/`、`results/` |
| 过程正确性与错误定位 | 区分终局与过程，通过第一个失败 checkpoint 定位首个可观察偏离 | `src/evaluation/`、`docs/evaluation-method.md` |
| 分层评价 | L1 运行、L2 逻辑路径、L3 UI/多模态逐层认证 | `src/evaluation/evaluator.ts` |
| 错误分类 | 使用稳定错误枚举，并保留 expected/actual 证据 | `docs/error-taxonomy.md`、`src/contracts/schemas.ts` |
| 难度和数据来源 | 每例记录来源、许可、D1/D2/D3 和难度理由 | `datasets/`、`docs/dataset-card.md` |
| 准确率和误报验证 | 报告 clean 误报率、首错定位、lucky pass 和人工抽检结果 | `src/evaluation/metrics.ts`、`reports/validation-report.md` |
| 完整结果分析 | 从冻结机器产物生成分层结果和失败案例 | `reports/analysis-report.md` |
| 两分钟演示 | 展示一次真实路径、三层证据与首错 | `docs/demo-script.md` |

## 三层检测重点

| 层级 | 主要问题 | 核心证据 |
| --- | --- | --- |
| L1 运行 | 游戏能否加载、开始并响应输入 | 页面/console 错误、ready 状态、真实输入 |
| L2 逻辑 | 状态转换、计分、事件、边界和终局是否正确 | action、state、event、checkpoint diff |
| L3 UI/多模态 | 玩家看到的界面是否与内部状态一致、是否清晰可玩 | DOM、Canvas、截图、可选视觉裁判 |

认证顺序为 L1 → L2 → L3。上游失败时，下游记为 `blocked`；没有视觉裁判或对应断言时记为 `unverified`，不能默认通过。

## 提交前硬门

1. `pnpm run check` 与 `pnpm run test:browser` 在干净环境通过；
2. 至少对一个真实 AI 生成游戏完成 Chromium playthrough，而不只测试自建 fixture；
3. 报告同时给出终局正确性、过程正确性、首错和 clean 误报；
4. 检测失败后在页面仍可操作时继续执行，以识别错误补偿和 lucky pass；
5. 自动结果经过分层人工抽检，报告分母、分歧和裁决；
6. README、报告和视频只声明已有产物能够证明的能力；
7. 不提交 API key、私有地址或未授权游戏素材；
8. Demo 时长不超过 120 秒。

## 最小发布证据

```text
release-evidence/
├── game-manifest.json
├── test-plan.json
├── summary.json
├── cases.json
├── events.jsonl
├── screenshots/
├── config.resolved.redacted.json
├── human-review.csv
├── analysis-report.md
└── demo.mp4
```

证据包至少记录 Git commit、数据和 schema 版本、游戏文件 hash、seed、浏览器版本、UTC 时间与 run ID。若使用需求文档或 PRD 生成断言，同时保存其版本/hash；若没有，则使用预先冻结的通用规则和人工 oracle。
