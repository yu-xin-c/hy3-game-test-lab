# 两分钟 Demo 脚本

目标成片 100–110 秒，硬上限 120 秒。录制前先在干净环境完成 `pnpm run check`、`pnpm run test:browser` 和 `pnpm run eval:sample`，不要把安装依赖和下载 Chromium 录进视频。

## 画面准备

- 终端字号至少 18，浏览器缩放 110%–125%；
- 准备 clean、`score_compensated` 两个标签页；
- 准备最新冻结 run 的逐例 JSON 和 summary；
- `.env`、API key、用户名、私有 URL 和通知全部隐藏；
- 只展示实际存在且刚刚复现的结果。

## 分镜

| 时间 | 画面 | 旁白要点 |
| --- | --- | --- |
| 0–12s | README 标题与一句话问题 | “只看终局会漏掉中间错误。PRD2Play 在真实浏览器中跑完整游戏路径并定位第一处偏离。” |
| 12–28s | Public `case.json` 与 Private Oracle 并排 | “PRD 可进入 Hy3；标准答案隔离，模型不能看到。需求分为运行、逻辑和 UI 三层。” |
| 28–43s | `pnpm run hy3:probe` 的成功摘要或已脱敏正式调用记录 | “项目只调用 Hy3 API，不训练或微调。这里记录模型与提示词版本，不显示密钥。” 若无可用端点，明确说本段未运行，不伪造成功。 |
| 43–62s | 浏览器 clean 路径：Start、右、右 | “Playwright 发送真实鼠标和键盘输入；桥只读取状态和事件，不直接调用游戏逻辑。” |
| 62–82s | `score_compensated` 路径及 CP-COIN-1 证据 | “第一次收集期望 1，实际 2，过程已经失败；测试继续运行到终局。” |
| 82–96s | 终局分数 2 + evaluation JSON | “终局又变回正确 2，但结果被标成 lucky pass：final true、process false，首错在 CP-COIN-1。” |
| 96–108s | summary/分层门/报告目录 | “汇总同时报告最终正确率、过程正确率、定位、误报、错误分布和难度拆分，并保留人审记录。” |
| 108–115s | 免责声明 | “这是个人活动作品，不是腾讯官方结论；当前 pilot 只验证方法，正式结果需要扩大数据并完成盲态审核。” |

## 建议命令

```bash
# 录制前验证
pnpm run check
pnpm run test:browser
pnpm run eval:sample

# 需要现场展示游戏时保持服务运行
pnpm run demo:serve
```

## 必须读得清的四个字段

```text
final_outcome_correct
process_correct
lucky_pass_detected
first_failure.checkpoint_id
```

若 JSON 太长，只放大这四项和对应 diff；不要快速滚动完整日志。

## 发布检查

- [ ] 时长 ≤120 秒；
- [ ] 视频/GIF 能在常见播放器打开；
- [ ] 没有密钥、私有端点、个人通知或未授权素材；
- [ ] demo 中的 commit 与结果 run manifest 一致；
- [ ] 明确区分 pilot 演示与正式实验；
- [ ] 旁白没有声称多模态已完成（除非对应产物存在）；
- [ ] `media/README.md` 记录文件名、时长、commit 和复现命令。
