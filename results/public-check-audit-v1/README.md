# 96 题判据溯源

inventory.json 冻结了去重汇总所选 96 个原始游戏任务，共 5,182 个不同检查项。相同字段、取值和检查类型合并，但保留全部场景/检查点位置。清单使用生成时实际保存的 prompt.md，而不是后来修订的题面。

检查范围包括控件约定、状态值、页面要求、事件、容差和采样区间。Hy3 逐项给出 supported、unsupported、ambiguous 或 test_mechanics；声称有依据时必须引用公开提示中的连续原文。程序校验覆盖完整、ID 唯一、引文真实存在。模型的语义判断仍是核对线索，不是独立真值，不能直接据此删规则、修改游戏分数或宣称整个标准集可靠。

每题 review.json 与调用凭据分别保存，status.json 记录已完成和失败的任务。没有 review.json 的题目尚未完成核对。当前首先执行原顺序前 8 题，接口验证后再继续其余题目；清单完整不等于模型核对完成。

```sh
pnpm exec tsx scripts/audit-public-checks.ts --out results/public-check-audit-v1 --calls artifacts/public-check-audit-v1 --cli /path/to/codebuddy --limit 8
```

去掉 --limit 可核对全部 96 题。已完成且提示哈希匹配的题目会跳过；每次失败都会停止派发并保留原始响应。原始服务商响应位于 artifacts，不上传。完整引文匹配也不证明语义正确，后续修订需核对原文与可执行行为。
