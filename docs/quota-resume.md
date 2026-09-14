# 限流后的补跑记录

2026-09-13 的 Hy3 响应为 429，提示于 17:59:47 UTC+8 重置。没有查询到 WorkBuddy 总积分余额，不把频率窗口限额等同于积分耗尽，也没有切换模型。

2026-09-14 已完成余下 13 题：robot-brawl、voxel-showcase、city-budget、factory-line、aquarium-builder、fashion-studio、market-trader、campsite-manager、science-circuit、geography-map、coding-maze、music-theory、culture-detective。

本地批次 `20260913-quota-recovery-2` 沿用原题面和私有检查文件，13/13 完成浏览器测试与 Hy3 复核，导出到 `results/quota-recovery`。之前的尝试全部保留。

复现命令如下，`--cli` 换成已安装的 CodeBuddy 路径：

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

运行期间没有切换其他模型。新运行遇到 429 时仍会保留中断记录并停止该组后续派发。

本次采用自动对照验证，结果与适用范围见仓库 reports/validation-report.md。历史批次原始数据不覆盖，视频由用户负责。
