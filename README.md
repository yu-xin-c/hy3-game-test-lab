# GameTestLab

本地应用：`pnpm run app`。生成过程页在 `/`，真实错误自动证据页在 `/mined`。

已完成 96 题运行评测、3 题生成过程实验及真实错误对照；指标口径见[完整分析报告](reports/analysis-report.md)。本次发布不包含视频。

GameTestLab 面向 AI 生成的浏览器游戏。对已经配置测试场景和 oracle 的游戏，它会在 Chromium 里发送键鼠输入，按定义的路径试玩，同时记录页面错误、网络失败、游戏状态、事件、界面和截图。发现问题后，报告会指出它属于哪一层，以及第一次出错发生在哪一步。

> 这是个人参加 2026 腾讯犀牛鸟开源人才培养计划相关活动的作品，不是腾讯或混元团队的官方项目。不训练、不微调，也不发布模型权重；自建校准集未调用模型，真实游戏实验使用 CodeBuddy CN 的 Hy3 High。

[项目方案](docs/proposal.md) · [系统架构](docs/architecture.md) · [96 题去重结果](results/consolidated/README.md) · [逐批证据](results/full-96/README.md) · [校准集结果](results/sample/README.md)


本轮已完成 **96/96** 个不同游戏的生成、浏览器测试和混元复核，共执行 876 次浏览器路径。结果按最新有效尝试去重汇总，原始失败尝试仍保留。原始规则包含误报，混元复核也不是独立真值，因此暂不把任一列称为最终模型准确率。[执行状态](docs/full-run-status.md)说明三个批次的关系。[汇报 PPT](docs/evaluation-slides.pptx)使用去重后的结果。

新增[玩法故障与生成记录追溯实验](results/process-localization-pilot/README.md)：复用 3 个 Hy3 游戏，执行 15 次浏览器对照，再由 Hy3 复核并引用具体代码；有完整历史时，可追溯到写入该代码的工具步骤。现有 96 题的“过程”指标指试玩过程，不等于生成推理过程的正确率。自动定位、复现和误报的口径见分析报告。

## 怎么检测游戏

测试分成三层，但都来自同一次自动试玩：

本轮不测摄像头、视频理解和语音交互类游戏；DOM、Canvas、3D 游戏保留。这个限制针对游戏任务，不限制用多模态模型辅助检查界面。

| 层级 | 实际检查 |
| --- | --- |
| L1 运行 | 页面能否加载和启动，是否出现 console、page、网络错误或外部依赖 |
| L2 逻辑 | 声明的检查点上，输入后的状态、计分和事件是否符合预期，完整路径能否走通 |
| L3 界面 | HUD 是否与内部状态一致，DOM 和 Canvas 证据是否符合断言 |

L1 直接在 Playwright 启动的真实 Chromium 中执行。L2 按测试路径发送真实输入，并在每个检查点读取状态和事件，与 oracle 比较。计时或物理玩法可以冻结浏览器时钟，按固定时间片推进，并根据观察桥提供的几何状态检查碰撞、穿透、跳跃高度、落脚支撑和世界边界。L3 采集 DOM、Canvas 和截图；截图用于界面证据检查，也可以交给独立的多模态裁判。

最终状态正确不代表过程正确。如果中间出现过偏离，后面又被其他错误抵消，报告仍会保留第一次偏离并标记为 `lucky pass`。Vitest 和 jsdom 用于快速检查纯逻辑与 DOM；能否实际游玩以 Chromium 结果为准。

## 运行

需要 Node.js 22+ 和 pnpm 10+。

```bash
pnpm install
pnpm exec playwright install chromium
pnpm run check
pnpm run test:browser
pnpm run eval:sample
```

示例游戏可以单独打开：

```bash
pnpm run demo:serve
# http://127.0.0.1:4173/examples/coin-collector/index.html
```

## 接入一个游戏

现有 pilot 从 `case.json` 读取游戏入口、控件、界面 selector、测试路径和检查点。正式任务中的生成游戏使用 `game.manifest.json`；adapter 会把它和该题已经冻结的试玩步骤、正确结果接到同一套 Chromium runner。当前任务使用页面上的真实键鼠或触控输入，观察桥只负责重置游戏和读取证据；摄像头类已移出评测范围。

测试路径和检查点可以直接编写；如果手头有需求文档或 PRD，也可以把它作为生成测试建议的可选输入：

```bash
cp .env.example .env
pnpm run hy3:probe
pnpm run hy3:plan -- \
  --prd examples/coin-collector/PRD.md \
  --case datasets/cases/clean-control/case.json
```

仓库里的 `hy3:generate` 可以生成实验用游戏包，并在隔离 Chromium 中检查入口和观察桥。CodeBuddy 批量实验使用单独的工作目录：

```bash
pnpm run prepare:codebuddy
pnpm run eval:task -- \
  --task target-rush \
  --game-dir ../codebuddy-hy3-experiments/20260912-formal-96-v4/generated/target-rush/files \
  --replays 3 \
  --generator codebuddy-hy3
```

第二条命令要在 CodeBuddy 生成该题的四个游戏文件后运行。

每次评测会留下这些文件：

- `events.jsonl`：每次操作后的状态、事件、UI 和截图引用
- `cases.json`：每个 case 的 L1/L2/L3 结果、终局结果和首次错误
- `summary.json`：整体正确率、定位结果、错误分布和难度拆分
- `screenshots/`：可以人工复查的画面

## 现在做到哪了

当前用 5 个 Coin Collector 变体校准评测器，分别覆盖正常样本、终局错误、中间错误补偿、HUD 错误和跨层遮蔽。另有一个平台跳跃样例，用固定时间片采集内存状态，并在 `tick=41` 定位穿透；它不计入冻结的 sample 指标。仓库现有 126 项 Vitest/jsdom 测试和 22 项真实 Chromium 测试；冻结结果在 [results/sample](results/sample/README.md)。

[完整游戏任务集](datasets/game-tasks/README.md) 当前有 96 道题：动作 31、益智 26、创意 13、模拟 16、教育 10。原 106 题中的 10 道摄像头题已移除，其余题目保持不变，仍覆盖 3D、多人、存档、排行榜和触控。每题都有完整玩法、胜负与重开规则，以及生成前固定的试玩步骤和私有正确结果。

首批曾用 CodeBuddy CN 的 Hy3 High 生成 5 款游戏、完成 48 次路径重放。去除手势烟花后，当前汇总保留 4 款、39 次重放，旧记录仍可追溯。发现了不可见目标，以及科学实验跳过必要步骤仍能获胜的问题；也查出了文案、编号和帧时序导致的评测误报。生成代码未手动修改。见 [Hy3 首批实测](results/codebuddy-hy3-pilot/README.md)与[结果复核](results/codebuddy-hy3-pilot/review.md)。这部分是早期试跑，不与正式 96 题结果混合。

新规则 `2026-09-12.3` 补齐了各路径的启动检查、检查点间事件记录、终局后 32ms 的画面检查和两条跳步骤测试。它不再强制 HUD 使用隐藏的固定文案；目前 L3 基础检查只确认文字状态、非空及可见性，数值含义和画面质量仍需另测。已有游戏的新规则复核单独保存，不与旧分数合并。


其中 Signal Memory 的原始检查通过 3/12；去除题面未规定的阶段名称约束后，诊断重算通过 12/12。游戏代码未修改，原分数不覆盖。详见[诊断记录](results/codebuddy-hy3-v4/README.md)。

## 仓库结构

```text
src/runtime/       Chromium 自动试玩与证据采集
src/evaluation/    分层判定、首错定位、指标和视觉判断
src/contracts/     游戏、测试和结果的数据结构
src/agents/        Hy3 测试规划与样本生成
datasets/          96 道当前任务、已移除题目归档、Pilot case 和 private oracle
scripts/           数据构造、CodeBuddy 准备和正式评测命令
tests/             Vitest、jsdom 和 Playwright 测试
docs/              方案、方法、数据与安全说明
results/sample/    已冻结的 Pilot 结果
```

详细排期见 [项目方案](docs/proposal.md)，赛题要求对应关系见 [任务对照](docs/task-alignment.md)。

## License

代码及仓库自建 fixture 使用 [MIT License](LICENSE)。外部游戏和素材需要单独记录来源与许可证。
