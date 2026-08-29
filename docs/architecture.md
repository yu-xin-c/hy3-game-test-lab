# 系统架构

GameTestLab 把浏览器游戏加载到独立的 Chromium 环境中，再按给定场景完成一局试玩。场景可以手写，也可以根据已有的需求说明补充。

```mermaid
flowchart LR
  G["生成游戏"] --> A["Adapter / manifest"]
  S["测试场景与检查点"] --> R["Playwright 自动试玩"]
  A --> R["Playwright 自动试玩"]
  R --> L1["L1 运行"]
  R --> L2["L2 逻辑"]
  R --> L3["L3 界面"]
  L1 --> O["首错与分级报告"]
  L2 --> O
  L3 --> O
```

## 组件

| 组件 | 职责 |
| --- | --- |
| Game adapter | 描述入口、控件、viewport、UI selector 和状态/事件结构 |
| Test planner | 从可选需求/PRD 与通用可玩性规则生成场景和检查点 |
| Browser runner | 使用真实键鼠/触摸输入，采集错误、状态、事件、DOM、Canvas 和截图 |
| Evaluator | 执行 L1/L2/L3 门，比较 expected/actual，定位第一处偏离 |
| Metrics/report | 汇总终局、过程、错误类型、定位准确率、误报率和难度结果 |

## 证据原则

- Vitest 和 jsdom 只能作为快速检查，不能认证游戏真实可玩；
- 状态桥只用于 reset 和观察，不能代替真实玩家输入；
- 浏览器失败后在安全情况下继续路径，用于识别错误补偿；
- L2 已失败而画面表面正常时，L3 只能记为 `observed_not_certified`；
- 通用场景检查启动、输入和终局，玩法说明可以补充特定规则。

## 隔离

- 被测游戏运行在独立 browser context 和只读静态目录；
- private oracle、故障标签和 API key 不暴露给游戏；
- fixture 模式只服务 `/examples/**`，生成游戏使用单独的 `isolated-root`；
- 所有结果保存相对路径和 hash，方便复核。

## 目前能跑到哪里

当前 pilot 已跑通预制 case/oracle 的完整浏览器路径；任意生成目录的 adapter、无规格通用场景生成和多模态结果聚合尚待接入。
