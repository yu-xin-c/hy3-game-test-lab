# 生成过程评估

从真实玩法问题出发，核对公开实现说明与代码，再追溯实际写入步骤。

## 评价体系

本项目评的是混元**留下来的生成过程**：先于代码的编号方案、实际文件写入，以及游戏运行后的可观察行为。模型内部未公开的思维不作推断。评价单位是方案中的一条具体主张，例如“这次输入加 25 分”“重开后时钟归零”“跳跃可落到平台”。

每条主张按同一顺序核对：

1. 从公开玩法要求确定它的条件和预期结果；私有检查不进入生成提示，也不直接充当真值。
2. 用独立算术、地图、状态规则或真实浏览器输入确认预期。键鼠操作由 Chromium 执行；观察桥只读状态、事件和画面，计时玩法可按固定时间推进。
3. 对照编号方案、最终代码和试玩证据。先看方案判断是否成立，再看实现是否兑现方案、游戏是否满足公开规则。混元负责逐步复核；可复现的独立对照负责验证复核是否可靠。

重点检查题意误读、无依据的方案断言、实现与方案不符、边界或时间条件遗漏，以及“终局碰巧通过但中途偏离”。发现失败时，先排除测试路径或私有断言加了题面未写的限制；证据不足记未知，不把标准风险记作游戏缺陷。最终游戏结果与方案过程分别判定，因此可识别“玩法走通、方案却解释错了”的样本。

```sh
pnpm run app
pnpm run run:process -- --out 新目录 --cli /absolute/path/to/codebuddy
pnpm run report:process -- --out results/process-v1
```

页面在 http://127.0.0.1:4175，真实错误证据在 /mined，自主探索在 /exploration。页面只读，展示公开要求、方案、代码、状态、时间采样与 Hy3 复核。探索页分别保留初次复核与补充诊断，不把后者覆盖为原始成绩。

生成和模型复核均固定 Hy3/high。模型只接收公开要求；私有检查只用于生成后的测试。已有代码核对哈希后复用，中断尝试单独保留，基础设施错误不计作游戏缺陷。单题续跑使用 --only。

## 复验现有游戏

从仓库根目录重新试玩粒子乐队，不需要再次调用混元。`--out` 应换成一个新的空目录；复验结果另存，不覆盖原记录。

```sh
pnpm exec tsx scripts/evaluate-generated-task.ts --task particle-orchestra --task-dir results/process-15-v1/particle-orchestra/task --game-dir results/process-15-v1/particle-orchestra/game --out artifacts/particle-replay-new --generator codebuddy-hy3 --replays 3
```

重新让混元生成代码是一次新实验；现有游戏的文件哈希和浏览器结果保存在各题目录。

## 三种位置

| 位置 | 含义 |
| --- | --- |
| 操作序号 | 首次观察到问题的输入 |
| 工具步骤 | 相关代码在哪次 Write/Edit 中产生 |
| 方案步骤 | 哪条公开实现判断被证据推翻 |

三者不必一一对应。代码引用必须精确匹配，日志回放必须与最终文件一致，才能认证来源。修复过的中间错误与最终仍存在的错误分开；缺少自行执行测试不自动算作过程错误。

## 实测入口

### 按状态探索

`scripts/explore-game.ts` 让混元根据当前页面、可用按钮和只读状态，每轮选择一次操作，由 Chromium 执行。支持点击、按键持续时间和推进时钟，逐步保存观测、截图、模型调用凭据及执行失败。模型不读取实现代码或私有答案；公开需求和运行观测用于决定下一步。

```sh
pnpm exec tsx scripts/explore-game.ts --source results/full-96/evidence/zen-garden --out artifacts/my-exploration --cli /absolute/path/to/codebuddy --steps 12
```

输出目录必须是新目录。默认固定种子 404；探索决策可能变化，保存的具体输入才是后续复现的依据。当前入口产生待复验的路径，不将模型怀疑计为确定缺陷，也不代表已覆盖全部玩法。尚不支持画布坐标点击或拖拽。浏览器截图留作证据，目前决策输入是文本和对象状态。

固定重放不调用模型，必须匹配原游戏哈希、种子与按钮身份。`--prefix` 则先执行保存的输入，再继续让混元探索。输出不符合 JSON 接口时最多请求一次格式纠正，两个调用均保留。

```sh
pnpm exec tsx scripts/explore-game.ts --source results/full-96/evidence/zen-garden --out artifacts/my-replay --replay artifacts/my-exploration/trace.json
pnpm exec tsx scripts/judge-exploration.ts --source results/full-96/evidence/zen-garden --trace artifacts/my-exploration/trace.json --out artifacts/my-review --cli /absolute/path/to/codebuddy
```

复核阶段才向混元提供代码，不提供探索员的疑似错误判断，减少相互影响。精确代码引用匹配后追溯 Write/Edit。重放报告严格比较完整观测；帧数差异也会报告为不一致，不因最终状态相同而宣称完全复现。复核意见仍需结合独立检查或运行对照，不能作为定位准确率的标准标签。

探索器也按 manifest 的状态 HUD 选择器读取实际文字，与对象状态交叉比较。只识别公开约定的 Menu/Playing/Won/Lost；选择器缺失、匹配多处、不可见或自定义文案均返回 unavailable，不强行判错。mismatch 表示两处观测矛盾，不能自行决定哪一处错误。混元需结合需求、等待时间与代码复核。新增字段与旧记录比较时会造成完整观测不一致，因此跨版本结果不作确定性结论。

新探索使用任务约定的 800×600 视口，将种子、虚拟时钟起点和每步额外推进的 100ms 写入 environment，并提供给混元。模型等待期间时钟暂停；wait 的毫秒数加这 100ms 才是本步推进量。旧路径缺少 environment 时按原实现的 1000×800 重放，不悄悄改变旧实验条件。

发布证据可使用 `pnpm exec tsx scripts/export-exploration.ts artifacts/my-exploration results/new-exploration`。该命令核对调用提示哈希，仅复制路径、汇总、复核和提示凭据，不复制服务商原始响应。输出目录须是新目录。

- [3 题生成过程与 33 次路径执行](../results/process-v1/REPORT.md)
- [真实错误复验、混元定位与局部干预](../results/error-mining-v1/REPORT.md)
- [混元自主探索、三次路径复现与复核漏检](../results/exploration-v1/REPORT.md)
- 96 题运行汇总仅本地留存：`results/consolidated/summary.json`
- [完整分析与指标口径](../reports/analysis-report.md)

报告区分自动规则、模型意见与运行对照。代码追溯不是推理首错的独立证明；题面歧义不纳入确定错误集合。视频不在本次交付范围。
