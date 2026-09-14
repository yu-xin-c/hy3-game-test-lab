# Signal Memory：修正判据并补充反例

游戏仍是 process-v1 的原始 Hy3 实现，公开题面和游戏文件均未修改。此次是事后诊断，不覆盖原成绩，不作为模型能力提升。

| 版本 | 原有四条路径通过 | 新增播放中重开路径 | 合同检查 |
| --- | ---: | ---: | --- |
| 原规则（process-v1） | 3/12 | 未运行 | 不通过 |
| 新判据，旧指针执行器（browser/） | 9/12 | 0/3 | 通过 |
| 新判据，修复指针执行器（browser-fixed-pointer/） | 12/12 | 0/3 | 通过 |

“通过”包括正确触发失败、重开和忽略输入，不是通关率。新增路径三次检出同一个缺陷，不算三个独立样本。修复后的完整运行共 15 次，12 次通过、3 次失败。

## 修正内容

- 去掉终局 phase=complete、重开 phase=idle 等未公开的内部取值限制。胜利后的 round/progress 不再强制规定内部计数；游玩期间的回合、进度、生命和分数检查保留。HUD 显示语义仍需单独检查，不因放开内部计数就认证画面正确。
- 颜色坐标明确相对于公开题面指定的 #signal-canvas，而不是要求 manifest 省略该 selector。
- 增加播放中重开并开始新局的路径：等待 950ms 后点击红色，应保持 0 分并产生 input_ignored。依据是公开规定的第一回合 1200ms 播放时长，不来自模型复核意见。

首次新规则运行发现执行器忽略了“selector + 坐标比例”的比例，实际点击画布中心。该轮保留在 browser/，不能把其通关失败算作游戏缺陷。随后修复 src/runtime/playthrough.ts 并增加真实 Chromium 回归测试，browser-fixed-pointer/ 才是修复后的结果。

扫描当前 96 题 test-plan 的控件，没有现存 selector 与 x_ratio 同时填写的控件，因此没有证据把这一特定指针问题泛化为旧全量失败的原因。它在本次显式补充 Canvas selector 后触发。

## 证据与复跑

revision.json 保存修改理由及原规则哈希；input-sha256.txt 冻结本版输入。两份 browser 结果保存各自运行器、规则和游戏哈希，原始结果位于 ../process-v1/signal-memory/browser/result.json。

```sh
pnpm exec tsx scripts/prepare-signal-checks-v3.ts --out artifacts/signal-rules-new
pnpm run eval:task -- --task signal-memory --task-dir artifacts/signal-rules-new --game-dir results/process-v1/signal-memory/game --context retrospective_diagnostic --replays 3 --out artifacts/signal-browser-new
```

本次规则判定不调用模型；原生成和独立混元复核凭据见 process-v1 与 playback-restart-v1。时间反例及混元定位对照见 [播放中重开报告](../playback-restart-v1/REPORT.md)。这解决了一个游戏的具体判据问题，不证明剩余 95 题所有标准已核对完成。
