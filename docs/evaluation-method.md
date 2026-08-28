# 评测方法

## 评测单位

正式端到端评测的逻辑样本是一个 `(user brief, frozen PRD, generated game)` 三元组；playthrough 的最小运行单位是 `(sample, scenario, seed)`。一个游戏的多个场景和 seed 高度相关，正式统计时应同时报告 brief 数、独立生成游戏数、场景数与运行数，不能只报较大的运行数。

当前 coin-collector pilot 没有 user brief、AI PRD 或 generated game，只能表示 `(project-authored PRD, scenario, seed, evaluator fixture)`。它用于测试 evaluator 是否能识别人工注入的 L1/L2/L3 问题，不进入模型生成能力的正式分母。

一次有效运行必须绑定：

- Git commit 与数据集版本；
- 原始 brief、冻结 PRD、生成游戏文件清单与内容哈希；
- public case、private oracle、独立 rubric/通用规范的版本与内容哈希；
- 浏览器、Node 和操作系统版本；
- 若调用 Hy3：PRD 生成与游戏生成各自的模型、端点类型、推理档位、提示词版本/哈希和运行 ID；
- 固定 seed、viewport、locale、timezone 与超时；
- UTC 时间和唯一 run ID。

## 三向判分

| 方向 | 判定对象 | 独立依据 | 典型失败 |
| --- | --- | --- | --- |
| `brief → PRD` 意图覆盖 | 冻结 PRD 是否忠实、完整地表达用户需求 | 原始 brief、生成前冻结的意图 rubric、盲态人审 | 关键目标遗漏、约束冲突、无依据改写 |
| `PRD → game` 实现一致性 | 生成游戏是否实现冻结契约 | PRD 编译检查点、private oracle、play trace | 规则、状态、终止条件、UI 与 PRD 不一致 |
| `game → generic playability` 通用可玩性 | 游戏作为游戏是否具备基本可玩性 | 与该样本 PRD 无关的通用规范、真实 playthrough、盲态人审 | 无法启动、控制无反馈、不可推进、无终局/重开、关键信息不可读 |

三向结果分别输出，不把某方向的通过抵消另一方向的失败。尤其不能把 AI 自写的 PRD 当作唯一真值：从 PRD 编译测试只能支持第二个方向；第一和第三个方向必须使用独立依据。若某方向没有足够依据，记为 `unverified`，不能默认通过。

生成契约要求 PRD 的验收条件回指原始 brief；语义遗漏与通用可玩性仍需独立抽检。正式汇总时三项分别报告，缺少依据就写 `unverified`。

## 两阶段生成协议

1. 冻结原始 user brief 与独立意图 rubric；
2. 调用被测 AI 生成 PRD，保留脱敏请求/响应、模型配置和 hash；
3. 校验 PRD 格式后冻结文本与 hash，不在看到游戏或评测结果后修改；
4. 使用同一冻结 PRD 调用被测 AI 生成 game files，保存文件 manifest/hash；
5. 生成阶段禁止访问 private oracle、通用判分细则和 fault ground truth；
6. 不可解析 PRD、缺失游戏文件或生成中止都作为生成失败保留，不以人工补写替换后计为模型成功。

上述记录构成 generation trace。当前仓库已实现两阶段 CLI、版本化校验和脱敏落盘，并通过 mock 单测；尚未运行真实 Hy3，因此没有正式 generation trace。

## 浏览器执行协议

1. 对 public case 与 oracle 做 schema 校验和交叉引用校验；
2. 创建隔离浏览器上下文，注册页面错误与 console error 监听；
3. 加载游戏，等待 `__PRD2PLAY__.isReady()`，用场景 seed reset；
4. 按 scenario 顺序发送真实鼠标/键盘/触摸输入；
5. 每步等待规定的 `advance_ms`，采集 state、增量 event、UI、截图引用与 runtime errors；
6. 将同一动作关联的所有 checkpoint 分别写成 observation；
7. 比较所有 oracle checkpoint；首次失败后只要页面仍可安全操作就继续执行；
8. 输出逐例 evaluation，再聚合为 summary；
9. 对预先抽取的样本进行盲态人工审核与分歧裁决。

动作、state/event/UI、runtime error、截图和 checkpoint diff 构成 play trace。不得只截图终局，也不得在发现首错后立即退出，否则无法发现终局正确的错误补偿。

## 三层门与状态

| 状态 | 含义 |
| --- | --- |
| `pass` | 该层所有声明检查点均通过 |
| `fail` | 至少一个该层检查点失败 |
| `blocked` | 上游运行门失败，无法形成可信的下游判断 |
| `unverified` | 数据没有该层断言，或可选评审器未配置 |
| `observed_not_certified` | 表面观察通过，但更低层逻辑已失败，不能认证 |

认证顺序为 L1 → L2 → L3。`highest_certified_level` 只取连续通过的最高层，不允许越级。

L1/L2/L3 描述 play trace 的证据层，主要支持 PRD→game 与通用可玩性判断；它们不分别对应三向评测，也不能替代 brief→PRD 意图审核。

## 比较规则

private oracle 只声明必须比较的 state/UI 路径和必须出现的事件类型：

- state/UI 使用严格深相等；
- 路径不存在与值为 `undefined` 均视为不匹配；
- 要求事件必须出现在该动作的增量事件窗口；
- 任一未豁免的 runtime error 都形成 L1/关联检查点失败；
- 缺失 observation 作为 `artifact_failure` 或运行失败处理，不能丢弃样本；
- 视觉语义裁判未配置时记 `unverified`，不得默认通过。

若未来引入数值容差、集合无序比较或视觉阈值，必须在 private oracle 中显式声明比较器及阈值，并在 run manifest 记录版本。PRD 中的模糊措辞不能由被测模型事后解释为对自己有利的阈值；歧义应由预先规则或独立裁决处理。

## 终局正确与过程正确

令样本 `i` 的终局检查为 `T_i`，全部过程检查集合为 `C_i`：

```text
final_correct(i)   = pass(T_i)
process_correct(i) = all(pass(c) for c in C_i)
lucky_pass(i)      = final_correct(i) and not process_correct(i)
```

因此最终正确率不能代替过程正确率。两者差距本身就是模型/系统容易“蒙对终局”的证据。

## 首错定位

play trace 的预测首错为按 `(action_index, oracle order)` 排序后的第一个失败 checkpoint。正式评测至少报告：

- Exact：预测 checkpoint ID 等于人工真值；
- Within-one：预测 action index 与真值相差不超过 1；
- Coverage：系统实际给出首错的 faulty 样本比例；
- Root requirement accuracy：预测关联需求是否命中根因需求。

第一处“观察到的偏离”不必然等于源代码根因。人工标注应分别记录 `first_divergence_checkpoint` 与 `root_requirement_id`，分析报告也要分开讨论。

generation trace 不虚构 token 级首错。brief→PRD 方向可报告最早遗漏/冲突的 intent ID，PRD→game 可报告首个 play divergence 与关联 requirement；“为什么模型生成了这段错误代码”只作为带证据边界的根因假设另报。

## 聚合指标

| 指标 | 分子 / 分母 | 注意事项 |
| --- | --- | --- |
| Intent traceability coverage | 被 PRD requirement 引用的独立 intent / 全部 intent | 对应 `intent_traceability.coverage`；形式引用不等于语义对齐 |
| Intent alignment pass rate | 独立 review 通过且 must 可追溯的 PRD / 全部有效 PRD | 对应 `intent_alignment`；无独立 review 为 unverified |
| PRD implementation pass rate | `implementation_conformance=pass` 的游戏 / 可执行生成游戏 | 与逐检查点覆盖率同时报告 |
| Generic playability pass rate | `generic_playability=pass` 的游戏 / 可执行生成游戏 | 规范不得由样本 PRD 定义 |
| End-to-end success rate | `overall_task_success=pass` 的样本 / 全部有效端到端样本 | 同时报各方向，不只报此交集 |
| Final answer accuracy | 终局通过运行 / 全部有效运行 | 缺失产物不得从分母删除 |
| Process correctness | 全检查点通过运行 / 全部有效运行 | 包含终局与中间步骤 |
| Localization exact | 首错 checkpoint 精确命中 / faulty 运行 | clean 不进分母 |
| Localization within one | 首错动作距离 ≤1 / faulty 运行 | 同时报告 exact，不能只报宽松值 |
| False-positive rate | 被判过程错误的 clean 运行 / clean 运行 | clean 需覆盖不同难度和游戏家族 |
| Lucky-pass recall | 检出的 lucky pass / 人工标注 lucky pass | 分母为零时报告 N/A，不写 0% |
| Error macro-F1 | 各真实错误类别 F1 的宏平均 | 报告类别支持数，避免小类误导 |

此外按 D1/D2/D3、L1/L2/L3、游戏家族、路径长度和错误类型分组。generation failure、artifact failure 与可执行但评测失败必须分列。所谓“能力断点”应由分组差异及置信区间支持，不能从五个 coin fixture 外推。

## 人工抽检与误报验证

正式方案应在看模型结果前冻结：

1. 每个 brief 的 intent rubric 与通用可玩性规范在看生成 PRD/game 前冻结；
2. 100% 审核 clean 样本中的自动报错（直接验证误报）；
3. 对每个难度、评测方向和错误类型分层随机抽取自动通过与自动失败样本；
4. 两名审核者独立查看原始 brief、冻结 PRD、generation trace、play trace 与证据，但不看系统预测标签；
5. 分别标注意图覆盖、实现一致性、通用可玩性、终局、过程、首个 play 偏离、根因需求、错误类型和证据充分性；
6. 计算一致率或 Cohen's kappa；分歧由第三人裁决；
7. 保留匿名 reviewer ID、时间、理由、裁决和样本哈希。

建议的 `human-review.csv` 字段：

```text
run_id,case_id,reviewer_id,blind_group,intent_alignment,implementation_conformance,
generic_playability,final_correct,process_correct,
first_divergence_checkpoint,root_requirement_id,error_type,evidence_sufficient,
decision,notes,reviewed_at_utc
```

个人信息、密钥、私有游戏画面和未授权代码不得进入公开审核文件。

## 无效运行处理

基础设施失败不等于游戏逻辑失败，但也不能静默排除；模型生成失败也不能被归到基础设施后从正式分母消失：

- 由模型返回不可解析 PRD、缺失入口或不完整 game files 导致的失败标为 `generation_failure`；
- 由 runner、服务器、下载或存储导致的失败标为 `artifact_failure`；
- 同时报告有效运行率和基础设施失败率；
- 只允许按预先定义且与模型表现无关的规则重跑；
- 原失败 run 仍保留，新 run 使用新 ID 并记录 `supersedes`；
- 不得反复重跑到“通过”为止。

## 复现顺序

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run check
pnpm run test:browser
pnpm run eval:sample
```

当前 sample runner 生成 `summary.json`、`cases.json` 和 `events.jsonl`；正式报告应从这些冻结机器产物生成。模板见 `reports/`。

这组命令只复现 coin fixture 的 evaluator/play trace，不会生成 PRD 或游戏，也不能验证 brief→PRD、端到端成功率或 Hy3 游戏生成能力。
