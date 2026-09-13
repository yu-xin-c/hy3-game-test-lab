# 限流后的继续运行

2026-09-13 的 Hy3 响应为 429，提示于 17:59:47 UTC+8 重置。没有查询到 WorkBuddy 总积分余额，不把频率窗口限额等同于积分耗尽，也没有切换模型。

已完成 83 个不同游戏的生成、浏览器测试与 Hy3 复核。余下 13 题：robot-brawl、voxel-showcase、city-budget、factory-line、aquarium-builder、fashion-studio、market-trader、campsite-manager、science-circuit、geography-map、coding-maze、music-theory、culture-detective。

新的本地批次 `20260913-quota-recovery-2` 已准备好，未发起生成。它只选择原始基础设施失败、且尚未成功补跑的题，沿用原题面和私有检查文件，之前的尝试全部保留。

额度恢复后执行，`--cli` 换成已安装的 CodeBuddy 路径：

```bash
pnpm run run:codebuddy -- \
  --batch-dir ../codebuddy-hy3-experiments/20260913-quota-recovery-2 \
  --cli /absolute/path/to/codebuddy
pnpm run judge:codebuddy -- \
  --batch-dir ../codebuddy-hy3-experiments/20260913-quota-recovery-2 \
  --cli /absolute/path/to/codebuddy
pnpm run report:codebuddy -- \
  --batch-dir ../codebuddy-hy3-experiments/20260913-quota-recovery-2 \
  --out-dir results/quota-recovery
```

未设置定时任务，不会自动在恢复时间调用。新运行遇到 429 时会保留中断记录并停止该组后续派发。

补跑完成后统计跨批次的不同游戏覆盖数，原批次分数不覆盖。还需更新 PPT，并由真人完成手册要求的抽检。
