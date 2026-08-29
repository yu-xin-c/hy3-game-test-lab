# 评测方法

GameTestLab 检测 AI 生成的浏览器游戏是否真正可运行、逻辑正确且界面可玩。最小运行单位是 `(game, scenario, seed)`；场景可来自人工设计、通用规则，或由可选的需求/PRD 编译而来。

## 工具分工

- **Vitest + jsdom**：快速验证纯逻辑、schema、比较器和评测器回归；
- **Playwright + Chromium**：加载真实游戏、发送键盘/鼠标/触摸输入，并采集浏览器证据；
- **可选多模态裁判**：只处理截图中的视觉语义，不替代确定性检查。

jsdom 不具备完整布局、Canvas 和真实输入链路，因此不能单独证明游戏可玩。

## L1：运行检测

目标是确认游戏具备形成后续判断的基本条件。

1. 在隔离浏览器上下文加载入口；
2. 监听 page error 和 console error，并记录 runner 加载异常；
3. 等待游戏 ready，并触发 Start；
4. 发送至少一次真实玩家输入；
5. 检查页面仍可响应且能导出最小观测。

典型失败包括入口缺失、脚本崩溃、加载异常、无法开始和输入无响应。L1 失败时，L2/L3 默认 `blocked`。

## L2：逻辑路径检测

目标是验证一次完整 playthrough，而不只检查最终画面。

1. 按 scenario 顺序发送真实动作；
2. 每步采集 state 和增量 event；
3. 对比分数、生命、位置、关卡状态、事件与边界条件；
4. 首次失败后，只要页面仍可安全操作就继续执行；
5. 分别判断过程和终局，并记录第一个失败 checkpoint。

这种做法能发现两类容易漏检的问题：中间步骤错误但终局偶然正确的 **lucky pass**，以及终局失败前更早发生的逻辑偏离。

```text
final_correct   = 终局 checkpoint 通过
process_correct = 全部过程 checkpoint 通过
lucky_pass      = final_correct && !process_correct
```

## L3：UI 与多模态检测

目标是验证玩家看到的结果，而不是只相信内部状态。

- DOM：HUD 文本、按钮状态、提示和可访问属性；
- Canvas：尺寸、可见性和可导出的画面信息；
- 截图：关键动作前后与失败点的视觉证据；
- 一致性：分数、生命、终局提示等是否与 L2 状态相符；
- 可选多模态：布局遮挡、文字可读性、关键元素是否可见。

能用确定性规则判断的内容优先使用 DOM/Canvas 比较。未配置多模态裁判时，视觉语义项记为 `unverified`，不能写成通过。

## 浏览器执行协议

1. 校验 public case、scenario 和 oracle；
2. 固定 seed、viewport、locale、timezone 与超时；
3. 创建隔离上下文并注册错误监听；
4. 等待 `window.__GAMETESTLAB__.isReady()`，再 reset；
5. 顺序发送动作，等待规定的 `advance_ms`；
6. 采集 state、增量 event、UI、Canvas、截图引用和 runtime error；
7. 对比 checkpoint，记录所有失败和 `first_failure`；
8. 输出逐例结果并聚合 summary。

每次运行绑定 Git commit、游戏文件 hash、数据/schema 版本、Node/Chromium/OS、seed、UTC 时间和唯一 run ID。需求或 PRD 若参与生成断言，也记录版本/hash。

## 判定状态

| 状态 | 含义 |
| --- | --- |
| `pass` | 该层所有已声明检查点通过 |
| `fail` | 至少一个检查点失败 |
| `blocked` | 上游失败，无法形成可信判断 |
| `unverified` | 没有对应断言或评审器 |
| `observed_not_certified` | 表面现象正常，但更低层证据已失败 |

`highest_certified_level` 只取连续通过的最高层，不允许 L1 失败却认证 L2/L3。

## 比较与首错

- state/UI 使用严格深相等；
- 路径缺失或值为 `undefined` 均视为不匹配；
- 事件必须出现在当前动作的增量窗口；
- 未豁免的 runtime error 计入 L1 失败；
- 缺失观测记为运行/产物失败，不能静默删除；
- 数值容差或视觉阈值必须提前写入 oracle。

`first_failure` 是按 `(action_index, checkpoint order)` 排序后的第一个失败点。它表示首个**可观察偏离**，不直接等同于源代码根因。报告可另附关联需求和根因假设，但必须区分二者。

## 核心指标

| 指标 | 说明 |
| --- | --- |
| L1/L2/L3 pass rate | 各层通过比例 |
| Final accuracy | 终局检查通过比例 |
| Process correctness | 全路径检查通过比例 |
| Localization exact / within-one | 首错精确命中 / 动作距离不超过 1 |
| False-positive rate | clean 游戏被误报为错误的比例 |
| Lucky-pass recall | 人工标注 lucky pass 的检出比例 |
| Error macro-F1 | 各错误类别 F1 的宏平均 |

结果同时按 D1/D2/D3、游戏家族、路径长度和错误类型拆分。分母为零时报告 `N/A`，不能写成 0%。

## 人工抽检

正式实验在看自动结果前冻结场景、通用可玩性规则和 oracle。对 clean 误报做 100% 复核，并按难度和错误类型抽取自动通过/失败样本。两名审核者独立判断层级、过程、终局、首错和证据充分性，分歧由第三人裁决。

## 无效运行

- 游戏入口缺失或生成文件不完整：`generation_failure`；
- runner、服务器、下载或存储异常：`artifact_failure`；
- 重跑必须遵守预先规则，保留原 run，并用新 ID 记录替代关系。

## 复现

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run check
pnpm run test:browser
pnpm run eval:sample
```

当前 sample 用于校准评测器。正式结论还需加入真实 AI 生成游戏和人工抽检，不能把 fixture 检出结果直接当作模型能力。

当前 runner 尚未提供任意 `game.manifest.json` 目录的一键 adapter；无规格通用场景生成和多模态结果聚合也属于下一阶段。
