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
| 0–10s | 游戏和一句话目标 | “GameTestLab 检测 AI 生成的浏览器游戏能否运行、逻辑是否正确、界面是否可玩。” |
| 10–25s | 三层检测图 | “L1 查运行，L2 走完整逻辑路径，L3 检查玩家真正看到的 UI；三层依次认证。” |
| 25–48s | Chromium 加载、Start、真实输入 | “Playwright 在真实浏览器发送键盘或鼠标输入，同时记录页面、console 和 runner 异常。” |
| 48–72s | action、state、event 逐步变化 | “每一步都保存状态和事件并与 checkpoint 对比，不只看最终得分。” |
| 72–88s | DOM/Canvas/截图 | “UI 与内部状态交叉验证；复杂视觉问题可交给多模态裁判，未配置就记为未验证。” |
| 88–103s | `first_failure` diff | “系统在失败后继续执行，既定位首个可观察偏离，也能发现终局正确但过程错误的 lucky pass。” |
| 103–115s | summary、证据目录和声明 | “结果包含分层通过率、过程正确率、定位和误报；所有数字都能回到冻结证据。” |

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
