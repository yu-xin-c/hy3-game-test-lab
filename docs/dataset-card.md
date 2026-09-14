# GameTestLab 数据卡

## 正式游戏任务

`datasets/game-tasks` 包含 96 个完整游戏生成任务。原 106 题中已移除 10 道摄像头题；当前分布为动作31、益智26、创意13、模拟16、教育10，同时覆盖3D 13题、多人15题、存档13题、排行榜10题、触控6题。

每题都有公开游戏说明，以及生成前冻结的通关、失败、重开路径和私有正确结果。原始106条 query 文件不在本机，最初按汇总分布构造；移除摄像头类后，不再声称保持原数量或比例，也不声称逐条对应原表。

## 评测器校准样例

### 用途

当前数据集包含同一个 Canvas coin-collector 游戏的 5 个项目自建变体，只用于校准 L1/L2/L3 检测、首错定位和结果格式。

游戏和故障 mutation 都由项目作者编写，没有真实模型生成过程，因此这组数据不用于评价或排名 Hy3。仓库内的 PRD 只记录 fixture 的玩法说明。

## 用例

| case | 难度 | 类型 | 校准目标 |
| --- | --- | --- | --- |
| `clean-control` | D1 | clean | 正常路径和误报 |
| `score-plus-two` | D1 | faulty | 中间与终局计分均错误 |
| `score-compensated` | D2 | lucky pass | 中间错误、终局恢复正确 |
| `hud-stale` | D3 | faulty | 内部状态正确、HUD 未更新 |
| `cross-layer-masked` | D3 | lucky pass | UI 表象掩盖中间逻辑错误 |

D1/D2/D3 描述定位依赖和跨层证据复杂度，不代表游戏操作或美术难度。

## 检测覆盖

- **L1 运行**：加载、Start、输入、页面和 console 错误；
- **L2 逻辑**：逐动作 state/event、计分、终局和 lucky pass；
- **L3 UI**：HUD、Canvas、截图以及 UI 与内部状态一致性；
- **定位**：第一个失败 checkpoint、关联层级和 expected/actual；
- **误报**：`clean-control` 作为负例。

## 构造方法

1. 编写可固定 seed 和 reset 的 clean 游戏；
2. 为同一输入路径设置逐动作 checkpoint；
3. 每个变体注入一个可解释故障或错误补偿；
4. 人工标注首次偏离、错误类型和终局真值；
5. clean 与故障版本运行相同动作，减少路径混杂；
6. 数据校验器检查 case、scenario、control 和 oracle 引用。

控制变量 mutation 适合回归测试，但真实模型错误往往更复杂，所以不能据此推断生成模型表现。

## 来源、许可与结构

fixture、mutation 和 oracle 均由本项目编写，按 MIT 发布。版本记录在 `datasets/manifest.json`，运行前使用：

```bash
pnpm run check:data
```

每个 case 记录来源、许可、难度和理由。`case.json` 定义入口、控件、场景和公开 checkpoint；`oracle.private.json` 保存期望值、终局、首错和故障标签。“private”表示生成游戏不应看到判分答案，pilot 随仓库公开是为了复现。

未来加入开源或生成游戏时，还需记录原始来源、commit、许可证、游戏文件 hash 和生成方式。无明确许可的代码或素材不能进入公开数据。

## 质量检查

自动校验覆盖：

- schema 和必填字段；
- manifest 引用文件存在；
- case、scenario 和 oracle ID 一致；
- control、requirement 和 checkpoint 引用有效；
- public checkpoint 与 oracle 对应；
- clean、faulty、lucky pass 以及 D1/D2/D3 均有样本。

自动校验不证明标注正确，fault ground truth 仍需人工复核。

## 正式评测规则

96道题分别在全新会话中生成一次，游戏文件冻结后不人工修补。每个游戏用同一 seed 重放三次，并保存 manifest/hash、场景、oracle、play trace、截图和待填写的人工审核记录。如有额外额度，可再从五类玩法中分层抽取任务重复生成，用于观察生成波动；本轮不把重复生成计入正式结果。

报告区分项目自建校准样例、原生生成错误和生成失败；模型分数只来自预先定义且未人工修补的正式样本。

## 已知局限

- 校准样例只有一个极简游戏家族和 5 个变体；
- 96个任务已完成混元生成、真实浏览器评测和混元复核，但人工抽检尚未完成；
- 所有故障由作者注入，可能比真实错误规则；
- oracle 也由作者编写，存在确认偏差；
- 当前 L3 主要依赖 HUD/Canvas 基础证据，复杂视觉质量覆盖不足；
- 样本量不足以得出模型能力、泛化或能力断点结论。
