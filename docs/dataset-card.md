# PRD2Play Pilot 数据卡

## 摘要

`PRD2Play Pilot` 是用于验证 **play evaluator** 的项目自建 smoke corpus。清单设计为 5 个 Canvas coin-collector 变体，覆盖 clean、终局错误、错误补偿、UI-only 和跨层遮蔽。项目作者编写了 PRD、clean 游戏与 mutation；Hy3 没有从用户 brief 生成 PRD，也没有生成这些游戏。

因此这 5 个 case 只能证明数据契约、真实浏览器 play trace、L1/L2/L3 门、首错和结果格式能工作，**不能证明 brief→PRD 意图覆盖、AI 游戏生成链或 Hy3 游戏生成能力，也不能用于发布 Hy3 能力排名**。

版本由 `datasets/manifest.json` 记录。正式使用前以 `pnpm run check:data` 的结果为准；清单引用但文件缺失时整个数据版本无效。

## 用例组成

| case | 难度 | 样本性质 | 目标现象 |
| --- | --- | --- | --- |
| `clean-control` | D1 | clean | 验证基础路径与误报 |
| `score-plus-two` | D1 | faulty | 收集道具多加分，首次和终局均错误 |
| `score-compensated` | D2 | lucky pass | 中间多加、后续少加，终局分数恢复正确 |
| `hud-stale` | D3 | faulty（终局状态正确） | 内部逻辑正确但 HUD 未更新；过程/UI 失败 |
| `cross-layer-masked` | D3 | lucky pass | UI 用另一变量掩盖内部中间逻辑错误 |

难度是对定位所需依赖长度和跨层证据的描述，不是对游戏美术或操作难度的评分。每个 `case.json` 都含独立 `rationale`。

## 来源与许可

当前 fixture、PRD 和故障 mutation 均由本项目编写，代码按 MIT 发布。每个 case 仍显式记录：

- `source.type`：`project_authored`、`open_source` 或 `hy3_generated`；
- `source.description`：具体构造/采集方式；
- `source.license`：适用许可。

未来加入开源游戏时，必须保存原仓库 URL、commit、许可证、素材许可证和修改说明。网页可访问不等于允许重新分发；无明确许可的代码/素材不能放入公开数据。

## 构造流程

pilot 使用控制变量 mutation：

1. 编写一个可确定性 reset 的 clean fixture；
2. 从 PRD 提取运行、逻辑和 UI requirement；
3. 为完整 playthrough 设置逐动作 checkpoint；
4. 对单一机制注入可解释故障；
5. 人工给出第一次偏离、根需求、错误类型和终局真值；
6. clean 与故障版本运行同一输入路径，避免路径差异成为混杂因素；
7. 数据校验器检查 ID、依赖、控件、场景和 oracle 引用。

mutation 的优势是根因已知；缺点是错误可能比真实模型生成错误更规整。因此正式数据必须加入未经人工注错的 Hy3/其他生成系统原生失败。

## 与正式端到端样本的差异

正式样本应是 `(user brief, frozen AI PRD, AI-generated game)` 三元组，并同时保存 generation trace 与 play trace。当前 pilot 缺少：

- 原始用户 brief 与独立 intent rubric；
- AI 生成 PRD 的请求/响应和冻结 hash；
- AI 根据冻结 PRD 生成 game files 的请求/响应和文件 manifest；
- brief→PRD 意图覆盖与 game→generic playability 的独立 verdict；
- 原生生成失败及不可解析/不可运行输出。

这些字段不能从现有人工 fixture 反推或补写。仓库已经提供 `UserBrief`、`GeneratedPrd`、`GeneratedGamePackage`、`GenerationRunManifest` 和三向 evaluation 的新版本化 schema/组合规则；正式数据仍需实际采集并使用独立审核。pilot v1 保持原样用于 evaluator 回归，不能因新 schema 存在就改称端到端样本。

## Pilot Public PRD

pilot 的 `case.json` 是项目作者编写的公开测试契约，可进入当前 PRD test planner 上下文，主要字段为：

- 游戏入口、渲染 surface 和 viewport；
- 控制动作到真实设备输入的映射；
- `RUN-*`、`LOGIC-*`、`UI-*` requirements、依赖和 observables；
- 场景 seed、动作顺序和公开 checkpoint 引用；
- 来源、许可、D1/D2/D3 和理由。

公开 checkpoint ID 只表示“这里要观察”，不包含期望值。

它不是 AI 从用户 brief 生成并冻结的 PRD。即使 fixture 完全实现该 PRD，也只能说明 evaluator 的一致性判分正确，不能说明用户意图被覆盖。

## Private Oracle

`oracle.private.json` 包含：

- 各 checkpoint 的 action index、layer、requirement IDs；
- state/UI 精确期望及必须出现的 event type；
- 哪个 checkpoint 定义终局；
- `sample_kind`、第一次偏离、根需求、根层、错误类型和终局真值。

pilot oracle 随仓库发布是为了可复现单元/集成测试，所以“private”表示信息边界，而非当前文件访问权限。它也不是 PRD 本身自动产生的“真值”。正式评测必须做到：

1. PRD 生成与游戏生成进程、提示词构造器均无法读取 oracle、intent rubric 或通用可玩性判分细则；
2. 被测网页无法读取 oracle；
3. oracle 与 observation 在独立 evaluator 内合并；
4. 在提交预测前冻结 oracle hash；
5. 任何泄漏样本从正式盲测中剔除并记录原因。

## 数据质量检查

自动检查至少覆盖：

- schema version 与所有必填字段；
- manifest 引用文件存在；
- case ID、oracle case ID 和 scenario ID 一致；
- requirement ID 唯一，`depends_on` 无悬空引用；
- scenario 的 action 都有 control 定义；
- checkpoint ID 唯一且 public/oracle 相互对应；
- oracle 的 requirement 引用存在、layer 一致；
- 数据版本至少包含 clean、faulty 和 lucky-pass；
- D1/D2/D3 均有样本且给出理由。

自动通过不代表标注正确。fault ground truth 仍需双人审核并在验证报告记录分歧。

## 推荐正式扩展

正式实验先从用户 brief 出发，让同一被测流程生成并冻结 PRD，再生成游戏；随后按游戏家族、渲染技术、路径长度、输入方式、难度和错误类型分层。至少包含：

- 多个独立 user brief，以及在看模型输出前冻结的 intent rubric；
- 每个样本的冻结 AI PRD、game files 和完整 generation trace；
- 多个相互独立的 DOM、Canvas2D、WebGL 游戏；
- 键盘、鼠标和触摸路径；
- 多 seed、分支路径、失败/胜利两类终局；
- clean 对照、人工 mutation 与 Hy3 原生生成错误；
- L1/L2/L3 均衡断言，D3 中加入盲态截图审核；
- brief→PRD、PRD→game、game→generic playability 三向独立标签；
- 未用于 prompt/开发调参的保留测试集。

报告必须同时给出独立 brief 数、生成 PRD 数、独立游戏数、场景数和运行数。人工 mutation 只用于 evaluator 校准，正式模型分数以未被人工修补的原生输出为主，并单独报告生成失败。

## 已知局限

- 单一极简游戏导致外部有效性很弱；
- 没有原始 user brief、AI PRD 或 AI game，无法评估完整生成链；
- 当前只覆盖 PRD→fixture 的 evaluator 机制，未形成三向指标；
- 项目作者同时编写 fixture 与 oracle，存在确认偏差；
- 公开 pilot oracle 不可用于测量防泄漏能力；
- Canvas 目前主要以桥状态和基础可见性判断，无法覆盖复杂视觉质量；
- D3 样本量不足，不能据此定位真正的能力断点；
- mutation 标签清晰，但可能低估真实生成代码中的复合错误。
