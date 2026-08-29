# 两分钟 Demo 脚本

目标 105–115 秒，硬上限 120 秒。主线是“一个 AI 生成游戏如何被真实操作、分层检测并定位首错”。需求或 PRD 只在需要说明测试依据时短暂出现。

## 录制准备

- 准备一个真实 AI 生成游戏和一条可复现 playthrough；
- 准备该运行的 summary、事件、截图和首错 diff；
- 终端字号至少 18，隐藏 `.env`、API key、私有地址和通知；
- fixture 必须标注“评测器校准样例”，不能冒充模型生成结果。

## 分镜

| 时间 | 画面 | 旁白要点 |
| --- | --- | --- |
| 0–10s | 游戏和一句话目标 | “这是一个 AI 生成的小游戏。GameTestLab 会真的进去玩一遍。” |
| 10–25s | 三层检测图 | “游戏打开后会完整操作一遍，过程中核对规则和玩家看到的画面。” |
| 25–48s | Chromium 加载、Start、真实输入 | “这里不是直接改游戏状态，而是在 Chromium 里按键和点击。” |
| 48–72s | action、state、event 逐步变化 | “每做一步都会保存分数、事件和状态，赢没赢只是其中一项结果。” |
| 72–88s | DOM/Canvas/截图 | “界面上的得分也会和游戏内部状态对一次，截图留着复查。” |
| 88–103s | `first_failure` diff | “第一个不一致出现在这里。后面即使结果绕回正确，这次错误也还在记录里。” |
| 103–115s | summary 和证据目录 | “报告可以回到当时的动作、状态和画面，不会只留下一行测试失败。” |

## 演示命令

```bash
pnpm run check
pnpm run test:browser
pnpm run eval:sample
pnpm run demo:serve
```

`eval:sample` 是评测器校准，不等同于真实生成游戏实验。

## 建议放大的字段

```text
highest_certified_level
final_outcome_correct
process_correct
lucky_pass_detected
first_failure.checkpoint_id
first_failure.action_index
first_failure.expected
first_failure.actual
```

## 录制检查

- [ ] 时长不超过 120 秒；
- [ ] 展示至少一次真实 Start 和玩家输入；
- [ ] L1/L2/L3 各有一条清楚证据；
- [ ] 首错的 expected/actual 能读清；
- [ ] 若展示需求或 PRD，明确它只是可选测试依据；
- [ ] 不声称尚未接入的多模态能力已经完成；
- [ ] 不泄露密钥、私有端点或未授权素材；
- [ ] 视频中的 commit 与结果 run 一致。

如果终稿前还没有真实 AI 生成游戏，只能提交明确标注为“evaluator pilot”的演示，并说明它验证的是检测链路，不是模型生成质量。
