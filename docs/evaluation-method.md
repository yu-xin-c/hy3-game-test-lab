# 评测方法

## 评测单位

最小评测单位是一个 `(case, scenario, seed, fixture/model output)` 组合。一个游戏的多个 seed 高度相关，正式统计时应同时报告运行数与独立游戏数，不能只报较大的运行数。

一次有效运行必须绑定：

- Git commit 与数据集版本；
- public case、private oracle 的内容哈希；
- 浏览器、Node 和操作系统版本；
- 若调用 Hy3：模型、端点类型、推理档位、提示词版本/哈希；
- 固定 seed、viewport、locale、timezone 与超时；
- UTC 时间和唯一 run ID。

## 执行协议

1. 对 public case 与 oracle 做 schema 校验和交叉引用校验；
2. 创建隔离浏览器上下文，注册页面错误与 console error 监听；
3. 加载游戏，等待 `__PRD2PLAY__.isReady()`，用场景 seed reset；
4. 按 scenario 顺序发送真实鼠标/键盘/触摸输入；
5. 每步等待规定的 `advance_ms`，采集 state、增量 event、UI、截图引用与 runtime errors；
6. 将同一动作关联的所有 checkpoint 分别写成 observation；
7. 比较所有 oracle checkpoint；首次失败后只要页面仍可安全操作就继续执行；
8. 输出逐例 evaluation，再聚合为 summary；
9. 对预先抽取的样本进行盲态人工审核与分歧裁决。

不得只截图终局，也不得在发现首错后立即退出，否则无法发现终局正确的错误补偿。

## 三层门与状态

| 状态 | 含义 |
| --- | --- |
| `pass` | 该层所有声明检查点均通过 |
| `fail` | 至少一个该层检查点失败 |
| `blocked` | 上游运行门失败，无法形成可信的下游判断 |
| `unverified` | 数据没有该层断言，或可选评审器未配置 |
| `observed_not_certified` | 表面观察通过，但更低层逻辑已失败，不能认证 |

认证顺序为 L1 → L2 → L3。`highest_certified_level` 只取连续通过的最高层，不允许越级。

## 比较规则

oracle 只声明必须比较的 state/UI 路径和必须出现的事件类型：

- state/UI 使用严格深相等；
- 路径不存在与值为 `undefined` 均视为不匹配；
- 要求事件必须出现在该动作的增量事件窗口；
- 任一未豁免的 runtime error 都形成 L1/关联检查点失败；
- 缺失 observation 作为 `artifact_failure` 或运行失败处理，不能丢弃样本；
- 视觉语义裁判未配置时记 `unverified`，不得默认通过。

若未来引入数值容差、集合无序比较或视觉阈值，必须在 oracle 中显式声明比较器及阈值，并在 run manifest 记录版本。

## 终局正确与过程正确

令样本 `i` 的终局检查为 `T_i`，全部过程检查集合为 `C_i`：

```text
final_correct(i)   = pass(T_i)
process_correct(i) = all(pass(c) for c in C_i)
lucky_pass(i)      = final_correct(i) and not process_correct(i)
```

因此最终正确率不能代替过程正确率。两者差距本身就是模型/系统容易“蒙对终局”的证据。

## 首错定位

预测首错为按 `(action_index, oracle order)` 排序后的第一个失败 checkpoint。正式评测至少报告：

- Exact：预测 checkpoint ID 等于人工真值；
- Within-one：预测 action index 与真值相差不超过 1；
- Coverage：系统实际给出首错的 faulty 样本比例；
- Root requirement accuracy：预测关联需求是否命中根因需求。

第一处“观察到的偏离”不必然等于源代码根因。人工标注应分别记录 `first_divergence_checkpoint` 与 `root_requirement_id`，分析报告也要分开讨论。

## 聚合指标

| 指标 | 分子 / 分母 | 注意事项 |
| --- | --- | --- |
| Final answer accuracy | 终局通过运行 / 全部有效运行 | 缺失产物不得从分母删除 |
| Process correctness | 全检查点通过运行 / 全部有效运行 | 包含终局与中间步骤 |
| Localization exact | 首错 checkpoint 精确命中 / faulty 运行 | clean 不进分母 |
| Localization within one | 首错动作距离 ≤1 / faulty 运行 | 同时报告 exact，不能只报宽松值 |
| False-positive rate | 被判过程错误的 clean 运行 / clean 运行 | clean 需覆盖不同难度和游戏家族 |
| Lucky-pass recall | 检出的 lucky pass / 人工标注 lucky pass | 分母为零时报告 N/A，不写 0% |
| Error macro-F1 | 各真实错误类别 F1 的宏平均 | 报告类别支持数，避免小类误导 |

此外按 D1/D2/D3、L1/L2/L3、游戏家族、路径长度和错误类型分组。所谓“能力断点”应由分组差异及置信区间支持，不能从五个 pilot fixture 外推。

## 人工抽检与误报验证

正式方案应在看模型结果前冻结：

1. 100% 审核 clean 样本中的自动报错（直接验证误报）；
2. 对每个难度和错误类型分层随机抽取自动通过与自动失败样本；
3. 两名审核者独立查看 PRD、轨迹与证据，但不看系统预测标签；
4. 分别标注终局、过程、首个偏离、根因需求、错误类型和证据充分性；
5. 计算一致率或 Cohen's kappa；分歧由第三人裁决；
6. 保留匿名 reviewer ID、时间、理由、裁决和样本哈希。

建议的 `human-review.csv` 字段：

```text
run_id,case_id,reviewer_id,blind_group,final_correct,process_correct,
first_divergence_checkpoint,root_requirement_id,error_type,evidence_sufficient,
decision,notes,reviewed_at_utc
```

个人信息、密钥、私有游戏画面和未授权代码不得进入公开审核文件。

## 无效运行处理

基础设施失败不等于游戏逻辑失败，但也不能静默排除：

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
