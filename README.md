# PRD2Play

> 面向浏览器小游戏的 PRD 驱动分层测试、完整路径 playthrough 与首错定位，使用 Hy3 辅助测试理解与分析。

PRD2Play 不是只判断“游戏最后赢没赢”。它把 PRD 拆成可观察的需求，在真实 Chromium 中执行一条完整游戏路径，同时记录运行、状态、事件和界面证据，再用与 PRD 隔离的标准答案判断：游戏能否运行、过程逻辑是否正确、界面是否忠实呈现，以及第一次偏离发生在哪里。

**项目声明：本仓库是个人参加 2026 腾讯犀牛鸟开源人才培养计划相关活动的作品，不是腾讯或混元团队的官方项目、产品或评测结论。项目只通过 API 调用 Hy3，不训练、不微调，也不发布任何模型权重。**

> **方案文档：** [任务二项目方案——PRD2Play 浏览器游戏过程评测与首错定位](docs/proposal.md)（按 2026-08-28 现状编写，含架构、关键技术、预期效果和 9 月 11 日前排期）

## 为什么做这个项目

浏览器游戏常见一种“幸运通过”：中间步骤已经错了，但后续另一个错误把最终分数补回正确值。只看终局会将它误判为可玩。PRD2Play 因此同时报告两项相互独立的结果：

- `final_outcome_correct`：终局是否符合标准答案；
- `process_correct`：整个执行轨迹是否在每个检查点都符合要求。

当终局正确但过程错误时，系统标记 `lucky_pass_detected=true`，并保留第一次可观察偏离、关联需求、错误类型以及后续轨迹。

## 评测模型

### 三层测试门

| 层级 | 问题 | 主要证据 | 当前实现边界 |
| --- | --- | --- | --- |
| L1 运行 | 页面能否加载、桥接是否就绪、输入是否生效、是否有运行时错误 | 页面/控制台错误、游戏状态、启动事件 | Playwright + Chromium；jsdom 不可替代此门 |
| L2 逻辑 | 状态转移、数值效果、事件、终止条件是否符合 PRD | `window.__PRD2PLAY__` 的状态与事件轨迹 | 确定性逐检查点比较，失败后继续执行以发现错误补偿 |
| L3 界面 | HUD/可见状态是否与内部状态一致，画面是否满足功能性要求 | DOM、Canvas 可见性、截图；可选多模态判断 | pilot 默认做确定性 UI 检查；语义/审美多模态检查未启用时必须记为 `unverified` |

L1 失败会阻断 L2/L3 认证。L2 已失败而 L3 表面通过时，L3 记为 `observed_not_certified`，不会用“画面看起来对”掩盖内部逻辑错误。

### 三档难度

难度和测试层级是两个维度，不应混用：

- D1：短路径、单一直接故障，首次偏离与终局错误通常一致；
- D2：多步依赖、延迟显现或错误补偿，需要检查中间轨迹；
- D3：跨层遮蔽、UI/逻辑不一致，或需要截图与人工/多模态复核。

每个公开用例都必须给出难度理由，而不是只写一个标签。

### Public PRD 与 Private Oracle

`case.json` 是公开输入，包含需求、控件、场景、来源和难度依据，可提供给 Hy3。`oracle.private.json` 是标准答案，包含检查点期望和故障真值，**不得进入生成提示词或模型上下文**。pilot 为便于复现而把小型 oracle 随仓库发布；正式盲测必须将 oracle 移到隔离存储或服务端。

## Hy3 在项目中的角色

Hy3 通过 OpenAI-compatible API 接入，适合承担 PRD 结构化、测试覆盖建议和首错分析解释。硬性通过/失败结论仍由可审计的规则、浏览器证据和私有 oracle 产生，避免让同一模型既出题又判题。

仓库保留了一条**无需密钥**的确定性 sample 路径，用于新克隆环境验证 schema、playthrough 和结果格式；这只是工程自检，不替代正式的 Hy3 API 实验。`pnpm run hy3:probe` 用于验证已配置的 Hy3 端点。正式报告必须记录模型名、端点类型、推理档位、提示词版本和运行 ID。

## 快速开始

要求：Node.js 22+、pnpm 10+。真实浏览器测试首次需要下载 Chromium。

```bash
pnpm install
pnpm exec playwright install chromium
pnpm run check
pnpm run test:browser
pnpm run eval:sample
```

`pnpm run check` 执行 TypeScript、数据集结构校验、Vitest 单元与 jsdom 测试；`test:browser` 才是真实 Chromium 门；`eval:sample` 执行 pilot 的完整路径并将逐步证据写入 `artifacts/runs/`。运行目录默认不提交 Git；仓库中的 `results/sample/` 是从一次完整 run 显式冻结的展示快照。

单独查看示例游戏：

```bash
pnpm run demo:serve
# 打开 http://127.0.0.1:4173/examples/coin-collector/index.html
```

### 配置 Hy3

```bash
cp .env.example .env
# 编辑 .env 后：
pnpm run hy3:probe

# 仅把 Public PRD 与公开 controls 发给 Hy3，生成结构化分层测试计划
pnpm run hy3:plan -- \
  --prd examples/coin-collector/PRD.md \
  --case datasets/cases/clean-control/case.json
```

关键环境变量：

| 变量 | 用途 |
| --- | --- |
| `HY3_BASE_URL` | Hy3 OpenAI-compatible API 根地址，含 `/v1` |
| `HY3_API_KEY` | 托管端点密钥；本地官方示例可使用占位值 `EMPTY` |
| `HY3_MODEL` | 模型名，默认 `hy3` |
| `HY3_REASONING_EFFORT` | `no_think`、`low` 或 `high` |
| `MULTIMODAL_BASE_URL` / `API_KEY` / `MODEL` | 可选 L3 截图语义评审器；未完整配置即返回 `unverified` |

真实密钥只放在环境变量或本机 `.env`；`.env` 已被 Git 忽略。不要在 issue、截图、trace、CI 日志或提交中粘贴密钥。

## 仓库结构

```text
.
├── config/                 # 浏览器与评测默认配置
├── datasets/
│   ├── manifest.json       # pilot 清单
│   └── cases/*/
│       ├── case.json       # Public PRD
│       └── oracle.private.json
├── examples/coin-collector/ # 可注入故障的 Canvas 最小游戏
├── src/
│   ├── agents/             # Hy3 PRD→分层测试计划
│   ├── contracts/          # Zod 数据契约与加载器
│   ├── evaluation/         # 首错、分层门和聚合指标
│   ├── llm/                # Hy3 OpenAI-compatible 客户端
│   ├── runtime/            # 浏览器 playthrough 与证据采集
│   └── ui/                 # 可独立测试的 DOM 逻辑
├── scripts/                # 数据校验、服务、sample 评测与 Hy3 探针
├── tests/                  # Vitest/jsdom 与 Playwright 测试
├── docs/                   # 设计、评测、数据和安全说明
├── reports/                # 报告模板；不得手填虚构结果
├── results/sample/         # 可提交的小型 pilot 结果说明
└── media/                  # 两分钟演示材料说明
```

## 运行产物

一次评测应至少保留：

- 运行清单：代码版本、配置、数据版本、模型/提示词版本；
- 每个动作后的 observation：状态、UI、事件、运行时错误和证据引用；
- 每个用例的 L1/L2/L3 门状态、终局正确性、过程正确性和首错；
- 汇总指标：最终正确率、过程正确率、首错定位、错误分布、难度分层、误报率；
- 人工抽检记录及分歧裁决；
- 不超过两分钟的 demo 视频或 GIF。

当前 sample runner 的具体文件为 `events.jsonl`、`cases.json`、`summary.json`、`screenshots/<case>/*.png`，以及指向最近一次运行的 `artifacts/runs/latest.json`。

仓库同时附带一份 [已冻结的 fixture sample](results/sample/README.md)。该次运行使用真实 Chromium、未调用 Hy3（`hy3_api_used=false`），只用于校准预设故障和展示证据格式；人工复核表仍为 `pending_human`，不能把其中数字写成正式模型结果。

详细字段和指标见 [评测方法](docs/evaluation-method.md)，赛题逐项映射见 [任务对照](docs/task-alignment.md)。

## 当前状态与限制

这是 `0.1.0` pilot scaffold，目标是先提供一条可复现、可审计的端到端最小链路。当前样例是项目自建的单一 Canvas 游戏及故障变体，不构成对 Hy3 或真实游戏生成系统的代表性结论。

- 本机已完成 TypeScript build、16 项 Vitest、2 项真实 Playwright 测试和 5-case sample eval；线上 CI/第二环境仍需首次仓库发布后确认；
- 确定性 L1/L2/L3 功能检查已能无 API key 运行；
- Hy3 client、连通性探针和 PRD planner 已有代码，但冻结 sample 明确未调用 Hy3，正式 Hy3 实验尚未完成；
- 多模态语义 UI 裁判默认关闭，不能据此声称完成视觉质量评测；
- pilot oracle 为复现而公开，不能用于正式盲测分数；
- `results/sample/human-review.csv` 仍为待审核状态，不能声称已完成人工定位/误报验证；
- 正式提交仍需扩充独立游戏来源、完成 Hy3 批量实验、冻结运行产物，并按预先登记方案做人审与误报验证；
- jsdom 只用于快速 DOM 单测；Canvas/WebGL 的可玩性认证必须来自真实无头浏览器。

不要引用仓库中的报告模板作为实验结果。只有由冻结运行目录生成、通过人工复核并能追溯到证据的数字，才可进入最终报告。

## 文档入口

- [项目方案（8 月 27 日节点交付）](docs/proposal.md)
- [赛题要求逐项对照](docs/task-alignment.md)
- [系统架构](docs/architecture.md)
- [评测方法](docs/evaluation-method.md)
- [错误分类](docs/error-taxonomy.md)
- [数据集说明](docs/dataset-card.md)
- [两分钟演示脚本](docs/demo-script.md)
- [安全与隐私](docs/security.md)
- [pilot 分析报告模板](reports/analysis-report.md)
- [验证与人工抽检模板](reports/validation-report.md)

## License

代码与项目自建 fixture 使用 [MIT License](LICENSE)。外部游戏、素材和数据必须分别记录来源与许可证，不因进入本仓库而自动变为 MIT。
