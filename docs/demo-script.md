# 两分钟 Demo 脚本

目标成片 105–115 秒，硬上限 120 秒。正式成片的主线必须是“用户 brief → AI 冻结 PRD → AI 生成游戏 → 三向评测”，不能从 PRD 开场让观众误以为 PRD 就是用户任务。录制前先在干净环境完成可复现检查；不要把安装依赖和下载 Chromium 录进视频。

## 画面准备

- 终端字号至少 18，浏览器缩放 110%–125%；
- 准备一个实际运行过的 user brief、对应冻结 PRD/hash、生成 game files manifest；
- 准备该生成游戏的 generation trace、play trace、三向 verdict 和 summary；
- 可另准备 `score_compensated` fixture 演示 lucky pass，但必须打上“evaluator fixture / 非 AI 生成结果”标签；
- `.env`、API key、用户名、私有 URL 和通知全部隐藏；
- 只展示实际存在且刚刚复现的结果。

## 分镜

| 时间 | 画面 | 旁白要点 |
| --- | --- | --- |
| 0–10s | 用户 brief 与一句话问题 | “入口是用户让 AI 生成游戏。AI 先写 PRD，再按冻结 PRD 生成代码；PRD 是中间契约，不是唯一真值。” |
| 10–25s | 脱敏 generation trace：brief hash → PRD hash → game manifest | “项目只调用 Hy3 API，不训练或微调。两次调用分别留档，评测后不能修改 PRD 迁就游戏。” 只有真实产物存在时才能展示成功。 |
| 25–38s | brief、冻结 PRD、独立 rubric/Oracle 的信息边界 | “评测分三向：brief 到 PRD 的意图覆盖、PRD 到游戏的实现一致性，以及不依赖 PRD 的通用可玩性。判分依据不进入生成提示词。” |
| 38–58s | 生成游戏中的真实 Start、移动/点击、推进 | “Playwright 发送真实输入，逐步保存状态、事件、UI 和截图；这形成 play trace。” |
| 58–73s | L1/L2/L3 checkpoint 与首个 diff | “运行、逻辑和界面分层认证。首错定位在可观察的 play trace；生成阶段根因另报，不混为一谈。” |
| 73–91s | 实际三向逐例 verdict | “三项分别报告，不能用实现 PRD 的通过掩盖 PRD 漏掉用户意图，也不能用 PRD 没写来放过基本不可玩。” |
| 91–105s | 如时间允许，带醒目标识展示 `score_compensated` fixture | “这是人工 evaluator fixture：第一次收集已错，终局却恢复正确，用来校准 lucky pass 检测，不代表 Hy3 生成结果。” |
| 105–115s | summary、证据目录与免责声明 | “所有数字来自冻结 trace 和人审记录。这是个人活动作品，不是腾讯官方结论；未完成的方向会明确记为未验证。” |

## 建议命令

```bash
# evaluator 回归验证；这些命令本身不会生成 PRD 或游戏
pnpm run check
pnpm run test:browser
pnpm run eval:sample

# 需要现场展示游戏时保持服务运行
pnpm run demo:serve
```

## 必须读得清的字段

```text
intent_traceability.coverage
intent_alignment
implementation_conformance
generic_playability
overall_task_success
spec_laundering_detected
final_outcome_correct
process_correct
lucky_pass_detected
first_failure.checkpoint_id
```

前三向字段已有组合 schema 和单测，但当前 sample JSON 尚未接入它们，也没有真实生成/人审输入。若录制时仍无端到端产物，不得在视频里拿单测结果冒充实验，可改录下述 fallback。JSON 太长时只放大 verdict 和对应 diff，不要快速滚动完整日志。

## 未完成端到端链时的 fallback

如果录制时仍没有真实 brief→PRD→game 产物，不展示假调用、手工 game 冒充生成输出或预填三向 verdict。可以提交一个明确标注为“evaluator pilot”的短演示：

1. 先用 10 秒说明目标完整链和当前缺口；
2. 展示 coin fixture 的真实 play trace、L1/L2/L3、首错和 lucky pass；
3. 结尾明确说“本视频只验证评测器，不构成 Hy3 游戏生成实验”。

这种 fallback 可证明工程进展，但不应被描述为完整赛题交付。

## 发布检查

- [ ] 时长 ≤120 秒；
- [ ] 视频/GIF 能在常见播放器打开；
- [ ] 没有密钥、私有端点、个人通知或未授权素材；
- [ ] demo 中的 commit 与结果 run manifest 一致；
- [ ] 开场明确入口是 user brief，不把 PRD 描述成最终目标或唯一真值；
- [ ] 真实展示 generation trace 与 play trace；缺任一条时明确标注缺口；
- [ ] 三向 verdict 分开呈现，不以单一总分替代；
- [ ] 明确区分 coin evaluator fixture 与正式 AI 生成实验；
- [ ] 旁白没有声称多模态已完成（除非对应产物存在）；
- [ ] `media/README.md` 记录文件名、时长、commit 和复现命令。
