# GameTestLab

GameTestLab 用来自动试玩 AI 生成的浏览器游戏。它会在 Chromium 里打开游戏，点击开始、发送键鼠输入并一路推进到终局，同时记录页面错误、游戏状态、事件、界面和截图。发现问题后，报告会指出它属于哪一层，以及第一次出错发生在哪一步。

> 这是个人参加 2026 腾讯犀牛鸟开源人才培养计划相关活动的作品，不是腾讯或混元团队的官方项目。仓库只通过 API 调用 Hy3，不训练、不微调，也不发布模型权重。

[项目方案](docs/proposal.md) · [系统架构](docs/architecture.md) · [Pilot 结果](results/sample/README.md)

## 怎么检测游戏

测试分成三层，但都来自同一次自动试玩：

| 层级 | 实际检查 |
| --- | --- |
| L1 运行 | 页面能否加载和启动，键鼠输入是否生效，是否出现 console 或 page error |
| L2 逻辑 | 每次操作后的状态、计分和事件是否符合预期，边界条件和完整游戏路径能否走通 |
| L3 界面 | HUD 是否与内部状态一致，关键内容是否可见，Canvas 和截图是否符合画面检查项 |

L1 直接在 Playwright 启动的真实 Chromium 中执行。L2 按测试路径发送真实输入，并在每个检查点读取状态和事件，与 oracle 比较。L3 采集 DOM、Canvas 和截图，也可以接入多模态模型检查视觉语义。

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

现有 pilot 从 `case.json` 读取游戏入口、控件、界面 selector、测试路径和检查点。生成游戏会把入口与控件写进 `game.manifest.json`，对应的通用 adapter 还在开发。自动试玩始终通过页面上的真实键鼠输入完成，观察桥只负责重置游戏和读取证据。

测试路径和检查点可以直接编写；如果手头有需求文档或 PRD，也可以把它作为生成测试建议的可选输入：

```bash
cp .env.example .env
pnpm run hy3:probe
pnpm run hy3:plan -- \
  --prd examples/coin-collector/PRD.md \
  --case datasets/cases/clean-control/case.json
```

仓库里的 `hy3:generate` 可以生成实验用游戏样本。

每次评测会留下这些文件：

- `events.jsonl`：每次操作后的状态、事件、UI 和截图引用
- `cases.json`：每个 case 的 L1/L2/L3 结果、终局结果和首次错误
- `summary.json`：整体正确率、定位结果、错误分布和难度拆分
- `screenshots/`：可以人工复查的画面

## 现在做到哪了

当前用 5 个 Coin Collector 变体校准评测器，分别覆盖正常样本、终局错误、中间错误补偿、HUD 错误和跨层遮蔽。仓库现有 20 项 Vitest 和 2 项真实 Chromium 测试，均已通过；冻结结果在 [results/sample](results/sample/README.md)。

这组结果说明管线能够识别预设故障，不能用来评价 Hy3 的游戏生成能力。现在的 pilot 仍由预制的 `case.json + oracle` 驱动。终稿前还需要补充多个独立生成的游戏、人工抽检和两分钟 Demo；生成目录的通用 adapter、无规格场景生成，以及多模态结果汇总也还没有完成。

## 仓库结构

```text
src/runtime/       Chromium 自动试玩与证据采集
src/evaluation/    分层判定、首错定位、指标和视觉判断
src/contracts/     游戏、测试和结果的数据结构
src/agents/        Hy3 测试规划与样本生成
datasets/          Pilot case 和 private oracle
tests/             Vitest、jsdom 和 Playwright 测试
docs/              方案、方法、数据与安全说明
results/sample/    已冻结的 Pilot 结果
```

详细排期见 [项目方案](docs/proposal.md)，赛题要求对应关系见 [任务对照](docs/task-alignment.md)。

## License

代码及仓库自建 fixture 使用 [MIT License](LICENSE)。外部游戏和素材需要单独记录来源与许可证。
