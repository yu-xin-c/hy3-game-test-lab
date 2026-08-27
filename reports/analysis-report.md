# PRD2Play Pilot 分析报告模板

> **状态：模板，不是实验结果。** 下列单元格必须由冻结 run 的 `summary.json`、`cases.json` 和 `events.jsonl` 生成并复核；在未运行前保持“待运行”，不得填入估计值、设计期望或 fixture 真值充当测量结果。

## 1. 运行元数据

| 字段 | 值 |
| --- | --- |
| Run ID | 待运行 |
| Git commit | 待运行 |
| 数据集名称/版本/hash | 待运行 |
| 独立游戏 / 场景 / 运行数 | 待运行 |
| Node / Chromium / OS | 待运行 |
| Hy3 模型 / 端点类型 / reasoning effort | 待运行；若本 run 未调用必须写“未调用” |
| Prompt 版本/hash | 待运行或不适用 |
| 配置文件/hash | 待运行 |
| UTC 起止时间 | 待运行 |
| 机器产物路径 | 待运行 |
| 人工审核记录 | 待运行 |

## 2. 研究问题

- RQ1：只看终局会漏掉多少过程错误？
- RQ2：系统能否定位第一处可观察偏离，而非只给出笼统错误？
- RQ3：误报主要出现在哪些层级、难度和证据 channel？
- RQ4：错误类型与 D1/D2/D3 的性能差异是否揭示稳定能力断点？
- RQ5：确定性 UI 检查、多模态判断和人工审核的分歧在哪里？

## 3. 总体结果

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

## 4. 难度与层级拆分

| 分组 | n | Final accuracy | Process correctness | Exact localization | FPR |
| --- | ---: | ---: | ---: | ---: | ---: |
| D1 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 |
| D2 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 |
| D3 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 |
| L1 涉及样本 | 待运行 | — | 待运行 | 待运行 | 待运行 |
| L2 涉及样本 | 待运行 | — | 待运行 | 待运行 | 待运行 |
| L3 涉及样本 | 待运行 | — | 待运行 | 待运行 | 待运行 |

分析时必须说明不同分组的样本构成。若 D3 只有一个游戏的 mutation，不得称为普遍能力下降。

## 5. 错误类型分布

| 错误类型 | 人工真值 n | 自动预测 n | Precision | Recall | 典型证据引用 |
| --- | ---: | ---: | ---: | ---: | --- |
| 待从 taxonomy 动态生成 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 |

需要单独列出 `unknown` 和 `artifact_failure`，不能把它们合并到“其他”后隐藏。

## 6. Lucky pass 案例分析

对每个“终局正确、过程错误”样本填写：

| Case/run | 首个偏离 | 根需求 | 中间 expected/actual | 终局为何恢复 | 是否被检出 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 |

正文应解释错误补偿机制，而不只重复 `lucky_pass_detected=true`。

## 7. 能力断点

仅在数据支持时回答：性能从哪种路径长度、依赖深度、层级或错误组合开始显著下降？

- 候选断点：待运行；
- 支持样本与效应量：待运行；
- 反例：待运行；
- 是否在独立游戏家族复现：待运行；
- 结论置信等级：探索性 / 预注册验证（选择其一）。

pilot 的五个 fixture 只适合展示分析方法，默认结论应写“样本不足，无法确定能力断点”。

## 8. 失败案例

至少选三类：运行失败、逻辑首错、UI/多模态分歧。每例包括：

1. public requirement 和路径；
2. 第一处 expected/actual diff；
3. 后续是否继续、终局是否正确；
4. 自动错误类型与人工裁决；
5. 根因假设与证据边界；
6. 可复现命令和 artifact 相对路径。

## 9. 有效性威胁

- 构念效度：bridge 状态是否真的代表玩家可见行为；
- 内部效度：fixture mutation 与 runner bug 是否混淆；
- 外部效度：游戏家族、引擎与语言覆盖不足；
- 标注效度：作者与审核者是否知道 mutation；
- 泄漏：oracle 是否进入提示词或开发调参；
- 统计：相关 seed 被误当独立样本、小分母与多重比较；
- 多模态：模型裁判偏差、版本漂移与无法复现。

## 10. 结论

待真实结果和验证报告完成后撰写。结论需明确区分：工程链路已验证、pilot 中观察到、正式数据支持、仍未验证四种证据级别。
