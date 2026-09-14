# 96 题判据溯源

已保存结果的汇总见 [SUMMARY.md](SUMMARY.md)，可用 `pnpm exec tsx scripts/report-public-check-audit.ts --root results/public-check-audit-v1` 重建。脚本会重新核验完整性、引用和调用凭据，不把未完成题目算作已核对。

inventory.json 冻结了去重汇总所选 96 个原始游戏任务，共 5,182 个不同检查项。相同字段、取值和检查类型合并，但保留全部场景/检查点位置。清单使用生成时实际保存的 prompt.md，而不是后来修订的题面。

检查范围包括控件约定、状态值、页面要求、事件、容差和采样区间。Hy3 逐项给出 supported、unsupported、ambiguous 或 test_mechanics；声称有依据时必须引用公开提示中的连续原文。程序校验覆盖完整、ID 唯一、引文真实存在。模型的语义判断仍是核对线索，不是独立真值，不能直接据此删规则、修改游戏分数或宣称整个标准集可靠。

每题 review.json 与调用凭据分别保存，status.json 记录已完成和失败的任务。没有 review.json 的题目尚未完成核对。当前首先执行原顺序前 8 题，接口验证后再继续其余题目；清单完整不等于模型核对完成。

```sh
pnpm exec tsx scripts/audit-public-checks.ts --out results/public-check-audit-v1 --calls artifacts/public-check-audit-v1 --cli /path/to/codebuddy --limit 8
```

去掉 --limit 可核对全部 96 题。已完成且提示哈希匹配的题目会跳过。引用或覆盖校验失败时，保留 initial-review.json，仅把有问题的条目交给 Hy3 纠正一次；纠正后仍须通过同样的严格校验。repair-prompt.txt 与 repair-receipt.json 保留纠正凭据。再次失败则停止派发，不用模糊匹配放行。原始服务商响应位于 artifacts，不上传。完整引文匹配也不证明语义正确，后续修订需核对原文与可执行行为。

首题 target-rush 的首次输出覆盖了 46 项，但有 5 项引文不在公开原文中，原结果被拒绝，未计为完成。此类错误属于核对模型的证据引用问题，不是游戏缺陷，也不能用于修订判据。

纠正后 target-rush 的 46 项均通过覆盖与引用校验：模型标记 36 项 supported、7 项 ambiguous、3 项 test_mechanics。这些是模型标签，不是确认数量。继续核对发现 A31 的 supported 不应直接采纳：引文“目标立即移动到由 seed 决定的下一个位置”没有明确规定终局 target_index 必须为 5；它可以表示当前目标编号，也可以表示已完成数量，公开题面只要求该字段存在。原判断保留，不用真实引文掩盖语义跳步，也不据此认证该检查。
