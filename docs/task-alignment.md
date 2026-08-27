# 赛题要求逐项对照

本页用于把“任务二：大模型生成内容的过程质量评测与错误定位”要求落实到可验收文件和命令。它是交付清单，不是完成证明；最终提交前必须用实际运行产物逐项复核。

## 对照矩阵

| 赛题要求 | 本仓库设计 | 路径或验收动作 | 交付前状态判定 |
| --- | --- | --- | --- |
| 公开代码仓库，说明项目、运行和环境 | 中文 README、Node/pnpm 版本、环境变量样例、MIT 许可 | `README.md`、`.nvmrc`、`.env.example`、`LICENSE` | 公网新环境按快速开始复现 |
| 不泄露 API key | 密钥仅由环境变量读取；`.env*` 默认忽略，仅放行样例 | `.gitignore`、`.env.example`、`docs/security.md` | secret scan 与人工复核均无真实密钥 |
| 个人/活动作品、非官方声明 | README 首屏明确声明 | `README.md` | GitHub 首屏可见 |
| 使用 Hy3 API，不训练或微调 | OpenAI-compatible 客户端和连通性探针；不含训练代码/权重 | `src/llm/`、`pnpm run hy3:probe` | 正式 run manifest 记录 Hy3 配置和调用证据 |
| 应用可运行并展示完整过程 | Playwright 发送真实输入，逐动作采集状态、事件、UI 和错误，不只保留终局 | `src/runtime/`、`scripts/run-sample-eval.ts`、`pnpm run eval:sample` | observation 数量和场景检查点一一对应 |
| 建立分层测试集、标准答案和自动检查 | Public PRD 与 Private Oracle 分离；L1/L2/L3 检查点自动比较 | `datasets/`、`src/contracts/`、`src/evaluation/`、`pnpm run check:data` | schema、引用、层级和 oracle 完整通过 |
| 说明数据来源、构造和难度 | 每例记录 `source`、许可、D1/D2/D3 与理由；数据卡描述 mutation 构造 | `datasets/*`、`docs/dataset-card.md` | 每例来源和难度依据非空且可审计 |
| 验证过程正确性并定位第一处错误 | 同时报终局与过程；失败后安全续跑；输出 `first_failure` 和所有失败 | `src/evaluation/evaluator.ts`、`docs/evaluation-method.md` | clean、wrong-final、lucky-pass 均有覆盖 |
| 建立错误分类体系 | 稳定 enum + 定义、边界和例子 | `src/contracts/schemas.ts`、`docs/error-taxonomy.md` | 预测标签与人工标签使用同一版本 |
| 识别“结果正确、过程错误” | 终局匹配且任一中间检查点失败即为 lucky pass | `lucky_pass_detected`、补偿错误样例 | 至少一个可复现样例和人工复核 |
| 验证定位准确率和误报率 | exact/±1 定位，clean 负例 FPR，分层抽检与裁决 | `src/evaluation/metrics.ts`、`reports/validation-report.md` | 冻结样本、报告置信区间/分母和审核记录 |
| 完整结果分析 | 最终正确率、过程正确率、错误分布、难度拆分、能力断点 | `reports/analysis-report.md`、冻结 `artifacts/runs/` | 仅从机器产物生成，禁止手填估计数 |
| 源码、数据、脚本、结果、验证记录、报告齐全 | 固定目录和结果说明 | `src/`、`datasets/`、`scripts/`、`results/`、`reports/` | 发布 tag 对应所有交付物 |
| 不超过两分钟视频或 GIF | 预先设计 105 秒演示路径 | `docs/demo-script.md`、`media/` | 成片 ≤120 秒且能读清首错证据 |

## 提交前硬门

以下任一项未满足，都不应将仓库标为“赛题交付完成”：

1. `pnpm run check` 和 `pnpm run test:browser` 在干净环境通过；
2. 正式实验确实调用 Hy3，run manifest 可追溯但不含密钥；
3. 正式数据不是只有项目自建的同一游戏变体，且 oracle 在评测时对模型隐藏；
4. 定位准确率、误报率及人审分歧均有真实分母和原始记录；
5. 报告数字可以从冻结 JSON/JSONL 产物重算；
6. demo 文件存在且时长不超过两分钟；
7. README、报告和视频中的“已完成”表述与仓库事实一致。

## 推荐的发布证据包

正式 release 建议包含下列只读内容：

```text
release-evidence/
├── summary.json
├── cases.json
├── events.jsonl
├── screenshots/
├── snapshot-provenance.json
├── config.resolved.redacted.json
├── human-review.csv
├── analysis-report.md
├── validation-report.md
└── demo.mp4              # 或 demo.gif，≤120 秒
```

`summary.json` 与 `snapshot-provenance.json` 合起来至少记录 Git commit、数据版本、schema 版本、UTC 起止时间、Node/Chromium 版本、是否调用 Hy3；Hy3 正式 run 还需记录模型名、推理档位和提示词哈希。配置文件必须先脱敏。当前 pilot provenance 尚未记录 Git commit，该缺口必须在正式 release 补齐。
