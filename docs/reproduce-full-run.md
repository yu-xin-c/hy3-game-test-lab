# 复现全流程

需要 Node.js 22+、pnpm、Chromium，以及已登录国内站的 CodeBuddy CLI。本次使用 CLI 2.150.0，固定模型 `hy3`、推理档 `high`。不要使用 Auto。生成和模型复核都通过混元，浏览器动作由 Playwright 执行。

## 生成与检查

先安装仓库依赖和浏览器。新实验使用新的批次名，不能覆盖已有结果。

```bash
pnpm install
pnpm exec playwright install chromium
pnpm run prepare:codebuddy -- --batch-id my-new-run
pnpm run run:codebuddy -- \
  --batch-dir ../codebuddy-hy3-experiments/my-new-run \
  --cli /absolute/path/to/codebuddy
```

`--cli` 替换为已安装的 CodeBuddy 可执行文件路径。每题生成结束后会自动执行三次路径重放。已记录的题会跳过；中断但没有完成标记的题会停止并要求检查，不会悄悄重新生成。

另一个终端可以同时执行混元复核：

```bash
pnpm run judge:codebuddy -- \
  --batch-dir ../codebuddy-hy3-experiments/my-new-run \
  --cli /absolute/path/to/codebuddy --watch
```

复核输入包括原始代码、题面、检查规则和实际操作记录。复核器保留原始回答，格式错误需要确认后单独重试，不能手工补一个判断。

## 汇总与校验

```bash
pnpm run report:codebuddy -- \
  --batch-dir ../codebuddy-hy3-experiments/my-new-run \
  --out-dir results/my-new-run
pnpm exec tsx scripts/verify-full-results.ts --results results/my-new-run
```

未完成的题或缺失的混元复核会使完整校验失败。`--allow-partial` 只允许查看中途情况，不会把未完成标为通过。

异常补跑使用 `scripts/prepare-infrastructure-recovery.ts` 创建独立目录，只选择已有基础设施失败记录的题。首轮结果不变，补跑结果单列。

## 只复现一个已生成游戏

不调用生成模型，直接使用仓库保存的文件：

```bash
pnpm run eval:task -- \
  --task target-rush \
  --task-dir results/full-96/evidence/target-rush/task \
  --game-dir results/full-96/evidence/target-rush/game \
  --out results/reproduced-target-rush \
  --replays 3 --generator codebuddy-hy3
```

截图中的字体和抗锯齿可能随机器变化。比较逻辑结果时应同时检查种子、浏览器版本、操作记录和状态哈希，不要求不同系统的截图字节完全相同。

真人抽检按 [验证说明](../reports/validation-report.md) 填写，不能拿模型复核替代。
