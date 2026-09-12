# 错误分类体系

错误标签由 `src/contracts/schemas.ts` 的 `ErrorTypeSchema` 固定。本页解释标签语义；修改 enum 或定义时必须同步升级评测版本并重新审核历史结果。

## 分类原则

1. 先记录第一处可观察偏离，再分析根因；两者可以不同。
2. 自动分类优先依据第一个差异 channel 和 path，人工复核可纠正但必须保留原预测。
3. 一个 checkpoint 可以产生多个 Failure；每个 Failure 用 `error_type` 表示主错误，并在 `diffs` 中保留对应差异。
4. 基础设施错误与游戏错误分开，避免把 runner 故障算成模型能力问题。

## 标签定义

| 标签 | 定义 | 常见证据 | 边界说明 |
| --- | --- | --- | --- |
| `none` | clean 样本未发现偏离 | 全 checkpoint 通过 | 只用于无错误真值/预测 |
| `artifact_failure` | 评测产物或基础设施不完整 | 缺 observation、文件损坏、服务未启动 | 不等于被测游戏逻辑错误 |
| `runtime_error` | 页面或脚本在运行期报错/崩溃 | `pageerror`、console error、桥不可用 | 若页面正常但输入无效果，优先 `input_handling_error` |
| `input_handling_error` | 合法玩家输入未被正确接收或映射 | 按键后无移动、点击区域错误 | 控制定义本身错误可能是数据问题 |
| `initial_state_error` | reset 后初始状态不符合冻结断言 | 初始生命、位置、资源错误 | reset 失败导致不可观察可归 runtime/artifact |
| `state_transition_error` | 动作进入了错误状态或目标 | 位置、阶段、模式不符 | 数值副作用错用 `state_effect_error` |
| `state_effect_error` | 状态方向正确但副作用数值/集合错误 | 加分 +2、道具未删除、生命扣错 | 最终可被后续错误补偿 |
| `rule_priority_error` | 多条规则同时适用时顺序/优先级错误 | 先结算胜利还是伤害导致不同结果 | 需多规则交互证据 |
| `invariant_violation` | 本应全程成立的不变量被破坏 | 分数为负、重复实体、资源越界 | 即便下一步恢复也算过程错误 |
| `terminal_condition_error` | 胜负/结束触发时机或条件错误 | 过早获胜、收完道具仍 playing | 终局状态字段常触发此类 |
| `missing_event` | 需求规定的领域事件未发出 | 状态改变但无 `coin_collected` | 若状态也错，主类通常选状态错误并保留事件 diff |
| `state_ui_inconsistency` | UI 与内部状态或冻结断言不一致 | 内部得分 1、HUD 显示 0 | 布局/遮挡而非值不符用 visual |
| `visual_layout_error` | 可见元素布局、遮挡、尺寸或视觉功能错误 | 按钮不可见、文字截断、关键对象重叠 | pilot 确定性检查覆盖有限，常需截图人审 |
| `physics_penetration` | 采样时对象与实体平台发生非法重叠 | player/platform AABB 重叠 | 与跨采样穿透分开记录 |
| `physics_tunneling` | 连续 game tick 间跨过平台碰撞面 | 前后 AABB 的连续扫掠 | 跳 tick 或平台几何变化时证据不足，不判游戏错误 |
| `physics_unsupported_grounding` | grounded 为真但没有几何支撑 | grounded、support id、接触面 | bridge 几何缺失归产物错误 |
| `physics_jump_apex` | 跳跃事件缺失，或完整跳跃弧线的最高点达不到目标 | jump event、apex、平台顶面 | 上升过程尚未结束时记证据不足，不判游戏错误 |
| `physics_support_timeout` | 观察窗结束仍未连续稳定落脚 | 连续 tick 的支撑关系 | 重复同一 tick 不重复计数 |
| `physics_world_bounds` | 玩家实体越出声明的世界边界 | player/world AABB | 只检查已声明坐标系 |
| `nondeterminism` | 相同 seed/环境重复运行产生不可解释差异 | 轨迹 hash 不一致 | 合法随机性应由 oracle/容差声明 |
| `hardcoded_path` | 仅对已知路径或答案特判，换 seed/路径即失效 | 单一路径通过、等价路径失败 | 需要对照 seed/路径证据，不可凭猜测标注 |
| `unknown` | 证据足以判错但无法可靠归入已有类型 | 多重/新型错误 | 报告中列出并触发 taxonomy 复审 |

## 自动主类选择

当前确定性 evaluator 采用保守启发式：

- 缺 observation 或 action 对不上 → `artifact_failure`；
- 浏览器 runtime channel → `runtime_error`；
- 物理违例 → 对应的 `physics_*`，物理证据不足 → `artifact_failure`；
- UI channel → `state_ui_inconsistency`；
- event channel → `missing_event`；
- state 的 `status` → `terminal_condition_error`；
- state 的 `score`、`lives`、计数路径 → `state_effect_error`；
- 其他 state 路径 → `state_transition_error`。

这不是根因分析器。当前结果只保存自动分类；正式实验计划增加独立的人工裁决字段，再计算分类 F1 并审计规则偏差。

## 多错误与补偿错误

如果第一步多加 1 分、第二步少加 1 分，终局分数可能正确：

```text
动作 1：expected score=1, actual score=2  -> first divergence
动作 2：expected score=2, actual score=2  -> terminal pass
```

该样本主类为 `state_effect_error`，`final_outcome_correct=true`、`process_correct=false`、`lucky_pass_detected=true`。不能因为终局通过而删除动作 1 的证据。

## taxonomy 变更流程

1. 从 `unknown` 或高频分歧中提出新类别；
2. 给出正例、反例和与邻近类别的边界；
3. 至少两名审核者在独立样本上试标；
4. 更新 schema、本文档、标注指南和指标脚本；
5. 升级版本并重算，不覆盖旧 run。
