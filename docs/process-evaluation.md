# 生成过程评估

从真实玩法问题出发，核对公开实现说明与代码，再追溯实际写入步骤。

```sh
pnpm run app
pnpm run run:process -- --out 新目录 --cli /absolute/path/to/codebuddy
pnpm run report:process -- --out results/process-v1
```

页面在 http://127.0.0.1:4175，真实错误证据在 /mined。两页只读，展示公开要求、方案、代码、状态、时间采样与 Hy3 复核。

生成和模型复核均固定 Hy3/high。模型只接收公开要求；私有检查只用于生成后的测试。已有代码核对哈希后复用，中断尝试单独保留，基础设施错误不计作游戏缺陷。单题续跑使用 --only。

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

- [3 题生成过程与 33 次路径执行](../results/process-v1/REPORT.md)
- [真实错误复验、混元定位与局部干预](../results/error-mining-v1/REPORT.md)
- [混元自主探索、三次路径复现与复核漏检](../results/exploration-v1/REPORT.md)
- [96 题运行汇总](../results/consolidated/summary.json)
- [完整分析与指标口径](../reports/analysis-report.md)

报告区分自动规则、模型意见与运行对照。代码追溯不是推理首错的独立证明；题面歧义不纳入确定错误集合。视频不在本次交付范围。
