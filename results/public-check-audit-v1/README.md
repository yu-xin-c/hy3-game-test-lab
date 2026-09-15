# 30 题判据溯源

按用户要求，本轮只核对原冻结清单顺序的前 30 题，已有结果计入。scope.json 固定此范围，运行参数为 `--limit 30`；原 96 题清单和游戏运行结果保留。选择没有重新按结果筛选，也不能称为随机抽样验证。原 96 题核对进程已停止，未完成调用保留在原 artifacts 目录，新批次写入 artifacts/public-check-audit-30-v1。

恢复平台题时，原引文纠正调用返回流超时，失败响应保留在本地。可添加 `--line-citations` 跳过复述式纠正，直接用原文行号恢复；不会重跑已有有效结果，也不会覆盖原始失败响应。

若调用已经结束但没有有效输出，可在确认原进程终止后增加 `--repair-attempt 2`，将新纠正调用写入单独的 attempt-2 目录。不可用该参数重启仍在运行的请求。默认复用已有调用文件，不会自动覆盖失败响应或无限重试；最终结果记录采用的尝试编号。

已保存结果的汇总见 [SUMMARY.md](SUMMARY.md)，可用 `pnpm exec tsx scripts/report-public-check-audit.ts --root results/public-check-audit-v1` 重建。脚本会重新核验完整性、引用和调用凭据，不把未完成题目算作已核对。

inventory.json 冻结了去重汇总所选 96 个原始游戏任务，共 5,182 个不同检查项。相同字段、取值和检查类型合并，但保留全部场景/检查点位置。清单使用生成时实际保存的 prompt.md，而不是后来修订的题面。

检查范围包括控件约定、状态值、页面要求、事件、容差和采样区间。Hy3 逐项给出 supported、unsupported、ambiguous 或 test_mechanics；声称有依据时必须引用公开提示中的连续原文。程序校验覆盖完整、ID 唯一、引文真实存在。模型的语义判断仍是核对线索，不是独立真值，不能直接据此删规则、修改游戏分数或宣称整个标准集可靠。

每题 review.json 与调用凭据分别保存，status.json 记录已完成和失败的任务。没有 review.json 的题目尚未完成核对。初次运行限制为前 8 题；加入行号引用恢复后，继续运行全部 96 题。清单完整或任务已派发不等于模型核对完成。

```sh
pnpm exec tsx scripts/audit-public-checks.ts --out results/public-check-audit-v1 --calls artifacts/public-check-audit-v1 --cli /path/to/codebuddy --limit 8
```

去掉 --limit 可核对全部 96 题。已完成且提示哈希匹配的题目会跳过。引用或覆盖校验失败时，保留 initial-review.json，仅把有问题的条目交给 Hy3 纠正一次；纠正后仍须通过同样的严格校验。repair-prompt.txt 与 repair-receipt.json 保留纠正凭据。若仍失败，再提供编号原文，让 Hy3 选择连续行号，由程序提取逐字引文；该次输出、提示和凭据保存为 line-*，前次失败保留为 rejected-repair.txt。仍不合格则停止派发，不做模糊匹配放行。原始服务商响应位于 artifacts，不上传。行号正确和引文匹配也不证明语义正确，后续修订需核对原文与可执行行为。

首题 target-rush 的首次输出覆盖了 46 项，但有 5 项引文不在公开原文中，原结果被拒绝，未计为完成。此类错误属于核对模型的证据引用问题，不是游戏缺陷，也不能用于修订判据。

纠正后 target-rush 的 46 项均通过覆盖与引用校验：模型标记 36 项 supported、7 项 ambiguous、3 项 test_mechanics。这些是模型标签，不是确认数量。继续核对发现 A31 的 supported 不应直接采纳：引文“目标立即移动到由 seed 决定的下一个位置”没有明确规定终局 target_index 必须为 5；它可以表示当前目标编号，也可以表示已完成数量，公开题面只要求该字段存在。原判断保留，不用真实引文掩盖语义跳步，也不据此认证该检查。

key-door-escape 首次输出对 A33 的解释读错了期望值：原检查为 player.y=1，解释却声称要求 y=3。独立网格路径核验确认相关 y=1 检查成立，见[参考计算](../grid-oracle-reference-v1/README.md)。该题的首次引文纠正仍有无效引用，导致当时批次停止；随后加入行号引用恢复，是否完成以汇总中的完整产物为准。初次输出保留为失败证据。
