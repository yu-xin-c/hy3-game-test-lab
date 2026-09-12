# 评测方法

每次测试固定一个游戏、一条试玩路径和一个 seed。Runner 按顺序执行动作，并在每一步保存状态、事件和画面证据。场景可以人工编写，也可以由通用规则或玩法说明整理出来。

## 工具分工

- **Vitest + jsdom**：快速验证纯逻辑、schema、比较器和评测器回归；
- **Playwright + Chromium**：加载真实游戏、发送键盘/鼠标/触摸输入，并采集浏览器证据；
- **可选多模态裁判**：只处理截图中的视觉语义，不替代确定性检查。

jsdom 不具备完整布局、Canvas 和真实输入链路，因此不能单独证明游戏可玩。

## L1：运行检测

L1 先看游戏能不能顺利进入可操作状态。场景需要显式写出 Start 和玩家输入，runner 不会自动补齐缺少的步骤。

1. 在隔离浏览器上下文加载入口；
2. 监听 page error、console error、请求开始/失败、HTTP 4xx/5xx、WebSocket 和外部资源，并记录 runner 加载异常；
3. 等待游戏 ready，并触发 Start；
4. 发送至少一次真实玩家输入；
5. 检查页面仍可响应且能导出最小观测。

典型失败包括入口缺失、脚本崩溃、加载异常、无法开始和输入无响应。L1 失败时，L2/L3 默认 `blocked`。

## L2：逻辑路径检测

L2 沿着完整 playthrough 检查规则和状态变化，终局只是其中一个检查点。

1. 按 scenario 顺序发送真实动作；
2. 每步采集 state 和增量 event；
3. 对比分数、生命、位置、关卡状态、事件与边界条件；
4. 首次失败后，只要页面仍可安全操作就继续执行；
5. 分别判断过程和终局，并记录第一个失败 checkpoint。

这种做法能发现两类容易漏检的问题：中间步骤错误但终局偶然正确的 **lucky pass**，以及终局失败前更早发生的逻辑偏离。

计时游戏可以给 scenario 配置虚拟时钟。`setup_ms` 是显式初始化预算，之后才 reset 并开始计时；`advance_time` 推进指定时长；`advance_frames` 是保留的格式名，实际按固定时间片推进并读取内存状态，不等同于浏览器逐帧。物理 oracle 支持重叠、tunneling、错误 grounded、跳跃高度、稳定落脚和世界边界。有有效采样的物理失败会记录 game `tick`、探针序号和耗时；复现以 `tick` 为主。

```text
final_correct   = 终局 checkpoint 通过
process_correct = 全部过程 checkpoint 通过
lucky_pass      = final_correct && !process_correct
```

## L3：UI 与多模态检测

L3 把内部状态和玩家实际看到的界面对在一起。

- DOM：HUD 文本、按钮状态、提示和可访问属性；
- Canvas：尺寸、可见性和可导出的画面信息；
- 截图：关键动作前后与失败点的视觉证据；
- 一致性：分数、生命、终局提示等是否与 L2 状态相符；
- 可选多模态：布局遮挡、文字可读性、关键元素是否可见。

能用确定性规则判断的内容优先使用 DOM/Canvas 比较。`eval:visual` 可以单独检查一张截图，未配置模型时返回 `unverified`；它的结果尚未汇总进 L3 gate 和 summary。

## 浏览器执行协议

1. 校验 public case、scenario 和 oracle；
2. 固定 seed、viewport、locale、timezone 与超时；
3. 创建隔离上下文并注册错误监听；
4. 等待 `window.__GAMETESTLAB__.isReady()`，reset 后以 `event_epoch` 建立事件基线；
5. 顺序执行真实输入或虚拟时间推进；
6. 每个时间片采集 state 和增量 event，在每个步骤结束时采集 UI、Canvas、截图和 runtime/network error；
7. 对比 checkpoint，记录所有失败和 `first_failure`；
8. 输出逐例结果并聚合 summary。

`eval:sample` 生成的 run 会记录 Git commit、游戏文件 hash、数据/schema 版本、Node/Chromium/OS、seed、UTC 时间和唯一 run ID。PRD hash 目前保存在生成产物中，尚未接入评测 run。

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

`first_failure` 先按动作、再按可观察时间排序。报告保留 checkpoint、错误类型、action 和可用的 game tick，便于在相同 seed 下对照重放。它表示首个**可观察偏离**，不直接等同于源代码根因。

物理判断依赖游戏桥提供的几何状态，属于白盒证据；Canvas 与截图负责交叉检查画面，不能把同一份内存状态当成独立视觉证明。缺样本或非法几何记为 `artifact_failure`；需要连续 tick 的 tunneling 检查遇到跳 tick 时也按证据不足处理。

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
