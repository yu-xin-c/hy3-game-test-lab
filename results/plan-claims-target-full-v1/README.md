# Target Rush 原方案步骤 3–6

原始 Hy3 编号方案、生成文件与工具日志经哈希和代码重建核验。前两步沿用[输入隔离对照](../plan-claims-v3/README.md)已经冻结的观察与判据；本轮新增步骤 3–6 的真实浏览器检查，没有重写原方案。

三个独立 Chromium 上下文中，新增四步所选断言均成立：命中、空白失误和 HUD 点击；五次命中、三次失误、计时输局与终局不再计分；Restart 按钮及 KeyR；只读桥、事件过滤和 HUD 文案。完整观测在 observations.json，逐项结果在 checks.json，输入与标准在模型调用前以 input-sha256.txt 冻结。

四份混元 review 和调用凭据已核验，见 [结果表](SUMMARY.md)：新增四个正常前缀均被判正常（误报 0/4、未知 0）。本轮没有错误前缀，定位准确率无分母。四个前缀都属于**一款游戏**，所选 verification 断言通过不认证全部 implementation 细节，也不增加跨游戏的错误定位样本。

```sh
pnpm exec tsx scripts/prepare-target-plan-claims.ts --out results/NEW_TARGET_PLAN_PROBES
pnpm exec tsx scripts/validate-plan-claims-v2.ts --judge --out results/NEW_TARGET_PLAN_PROBES --calls artifacts/NEW_TARGET_PLAN_CALLS --cli /path/to/codebuddy
pnpm exec tsx scripts/report-plan-claims-v2.ts --root results/NEW_TARGET_PLAN_PROBES
```

输出目录需为新目录。错误与正常计数只针对预先规定的浏览器检查，重复运行不扩大分母。公开材料不含模型内部思维。
