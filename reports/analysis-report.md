# PRD2Play 端到端分析报告模板

> **状态：模板，不是实验结果。** 正式报告必须由冻结的 generation trace、play trace、三向逐例 verdict 和人审记录生成并复核；在未运行前保持“待运行”，不得填入估计值、设计期望或 fixture 真值充当测量结果。
>
> 当前 5 个 coin-collector case 只有项目自建 PRD/game/mutation 与 play trace，用于测试 evaluator。它们没有 user brief、AI PRD 或 AI-generated game，因此 `brief→PRD`、正式 `PRD→game` 生成表现、通用可玩性和端到端成功率均应写 `N/A（fixture 未评测）`，不能把 pilot 数字填入这些栏位。

## 1. 运行元数据

| 字段 | 值 |
| --- | --- |
| Run ID | 待运行 |
| Git commit | 待运行 |
| 数据集名称/版本/hash | 待运行 |
| User brief 数 / hash | 待运行；fixture pilot 写“不适用” |
| 冻结 AI PRD 数 / hash | 待运行；fixture pilot 写“不适用” |
| 生成 game artifact 数 / manifest hash | 待运行；fixture pilot 写“不适用” |
| 独立游戏 / 场景 / 运行数 | 待运行 |
| Node / Chromium / OS | 待运行 |
| PRD 生成：Hy3 模型 / 端点 / reasoning / prompt hash | 待运行；未调用必须写“未调用” |
| 游戏生成：Hy3 模型 / 端点 / reasoning / prompt hash | 待运行；未调用必须写“未调用” |
| Generation trace 路径/hash | 待运行；fixture pilot 写“不存在” |
| Play trace 路径/hash | 待运行 |
| Intent rubric / generic playability spec / oracle hash | 待运行 |
| 配置文件/hash | 待运行 |
| UTC 起止时间 | 待运行 |
| 机器产物路径 | 待运行 |
| 人工审核记录 | 待运行 |

## 2. 研究问题

- RQ1：AI 生成的 PRD 对原始 user brief 的意图覆盖率如何，主要遗漏、冲突和无依据改写是什么？
- RQ2：生成游戏对冻结 PRD 的实现一致性如何；L1/L2/L3 的失败分别发生在哪里？
- RQ3：不依赖样本 PRD，生成游戏是否满足启动、控制、推进、终局和重开等通用可玩性底线？
- RQ4：只看终局会漏掉多少过程错误；系统能否定位 play trace 中第一处可观察偏离？
- RQ5：三向错误、D1/D2/D3 和证据 channel 的差异是否揭示稳定能力断点？
- RQ6：确定性检查、多模态判断和人工审核的分歧在哪里？

## 3. 三向与端到端结果

| 指标 | 值 | 分子/分母 | 人审一致性 | 产物字段 |
| --- | --- | --- | --- | --- |
| Intent traceability coverage | 待运行 | 待运行 | — | `intent_traceability.coverage`；fixture 不适用 |
| Intent alignment pass rate | 待运行 | 待运行 | 待运行 | `intent_alignment`；fixture 不适用 |
| PRD→game implementation pass rate | 待运行 | 待运行 | 待运行 | `implementation_conformance`；fixture 不作模型分数 |
| Game→generic playability pass rate | 待运行 | 待运行 | 待运行 | `generic_playability`；fixture 不适用 |
| End-to-end success rate（三向均通过） | 待运行 | 待运行 | 待运行 | `overall_task_success`；fixture 不适用 |
| Spec laundering count | 待运行 | 待运行 | 待运行 | `spec_laundering_detected`；实现 PRD 但意图失败 |
| PRD generation failure rate | 待运行 | 待运行 | — | generation trace |
| Game generation failure rate | 待运行 | 待运行 | — | generation trace |

三向结果必须并列解释。PRD→game 通过不能补偿 brief→PRD 遗漏；PRD 未写某项也不能让基本不可玩的游戏在 generic 方向通过。某方向缺少独立依据时写 `unverified`/`N/A`，不能默认 pass。

生成契约中的溯源字段只验证形式引用，不证明语义正确。本表只有接入真实生成产物、独立依据和冻结 run 后才能填数。

## 4. Playthrough 与定位结果

| 指标 | 值 | 分子/分母 | 95% CI | 产物字段 |
| --- | --- | --- | --- | --- |
| 有效运行率 | 待运行 | 待运行 | 待运行 | run manifest |
| Final answer accuracy | 待运行 | 待运行 | 待运行 | `final_answer_accuracy` |
| Process correctness | 待运行 | 待运行 | 待运行 | `process_correctness` |
| Localization exact | 待运行 | 待运行 | 待运行 | `localization_exact_accuracy` |
| Localization within one | 待运行 | 待运行 | 待运行 | `localization_within_one_accuracy` |
| False-positive rate | 待运行 | 待运行 | 待运行 | `false_positive_rate` |
| Lucky-pass recall | 待运行 | 待运行 | 待运行 | `lucky_pass_recall` |
| Error type macro-F1 | 待运行 | 待运行 | 待运行 | `error_type_macro_f1` |

分母为零时写 `N/A (0 samples)`，不能显示为 0%。pilot 样本极少时以原始计数为主，不用置信区间制造精确感。

## 5. 难度、方向与层级拆分

先按三向评测分别给出样本数、通过率与主要错误；再对有 play trace 的样本按 D1/D2/D3 与 L1/L2/L3 展开。L1/L2/L3 是证据层，不是三个评测方向。

| 分组 | n | Final accuracy | Process correctness | Exact localization | FPR |
| --- | ---: | ---: | ---: | ---: | ---: |
| D1 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 |
| D2 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 |
| D3 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 |
| L1 涉及样本 | 待运行 | — | 待运行 | 待运行 | 待运行 |
| L2 涉及样本 | 待运行 | — | 待运行 | 待运行 | 待运行 |
| L3 涉及样本 | 待运行 | — | 待运行 | 待运行 | 待运行 |

分析时必须说明不同分组的样本构成。若 D3 只有一个游戏的 mutation，不得称为普遍能力下降。

## 6. 错误类型分布

| 错误类型 | 人工真值 n | 自动预测 n | Precision | Recall | 典型证据引用 |
| --- | ---: | ---: | ---: | ---: | --- |
| 待从 taxonomy 动态生成 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 |

需要单独列出 `unknown` 和 `artifact_failure`，不能把它们合并到“其他”后隐藏。

同时分列 `intent_omission/conflict`、`implementation_deviation`、`generic_unplayable` 与 `generation_failure`。关系级错误和 play checkpoint 错误不能混成一个无层次的 taxonomy。

## 7. Lucky pass 案例分析

对每个“终局正确、过程错误”样本填写：

| Case/run | 首个偏离 | 根需求 | 中间 expected/actual | 终局为何恢复 | 是否被检出 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 |

正文应解释错误补偿机制，而不只重复 `lucky_pass_detected=true`。

## 8. 能力断点

仅在数据支持时回答：性能从哪种路径长度、依赖深度、层级或错误组合开始显著下降？

- 候选断点：待运行；
- 支持样本与效应量：待运行；
- 反例：待运行；
- 是否在独立游戏家族复现：待运行；
- 结论置信等级：探索性 / 预注册验证（选择其一）。

pilot 的五个 fixture 只适合展示 evaluator 分析方法，默认结论应写“未测试 AI 生成链，且样本不足，无法确定能力断点”。

## 9. 失败案例

正式报告至少各选一类：brief 意图遗漏、PRD 实现偏离、通用不可玩、play lucky pass、UI/多模态分歧。每例包括：

1. 原始 brief、冻结 PRD 与 game artifact hash；
2. 失败所属方向和独立判定依据；
3. 第一处 play expected/actual diff（如适用）；
4. 后续是否继续、终局是否正确；
5. 自动错误类型与人工裁决；
6. 生成阶段根因假设与证据边界；
7. 可复现命令和 generation/play artifact 相对路径。

## 10. 有效性威胁

- 构念边界：三向指标是否真正区分用户意图、契约实现和一般可玩性；
- 构念效度：bridge 状态是否真的代表玩家可见行为；
- 内部效度：fixture mutation 与 runner bug 是否混淆；
- 外部效度：游戏家族、引擎与语言覆盖不足；
- 标注效度：作者与审核者是否知道 mutation；
- 泄漏：intent rubric、通用规范或 oracle 是否进入 PRD/游戏生成提示词或开发调参；
- 共同方法偏差：是否让同一模型生成 PRD、编译测试并裁判，导致自我一致而非真实正确；
- 统计：相关 seed 被误当独立样本、小分母与多重比较；
- 多模态：模型裁判偏差、版本漂移与无法复现。

## 11. 结论

待真实结果和验证报告完成后撰写。结论需明确区分：generation trace 已验证、play evaluator 工程链路已验证、fixture pilot 中观察到、正式三向数据支持、仍未验证五种证据级别。不得把 coin fixture 的预设故障检出率描述为 Hy3 游戏生成表现。
