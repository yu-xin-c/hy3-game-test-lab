# 单步评审的输入隔离

上轮单步前缀的范围说明和观测包含后续检查信息，模型因此越界讨论步骤 2。此轮只改变单步输入：打靶游戏只给 Start 后的状态与事件；平台游戏只给输入时间表、位置速度和事件序号，检查重复运行是否一致。两步前缀不改。

没有新增游戏或浏览器运行。observations.json、gold.json 与 v2-final 字节一致，准备脚本及汇总脚本均检查输入哈希；不能用新旧两轮重复扩大样本数。模型输出写入新目录，原结果保留。

四个前缀均以 Hy3 重新评审，输出与凭据已核验，见 [结果表](SUMMARY.md)。错误前缀仍定位到步骤 2（1/1）；三个正常前缀均判正常（误报 0/3、未知 0），上轮为两个正常、一个未知。两个单步回复现在只讨论步骤 1。该对照是在看过上轮结果后设计的，没有通过多轮模型重复排除随机性，不是泛化性能证明。

```sh
pnpm exec tsx scripts/prepare-isolated-plan-claims.ts --out results/NEW_ISOLATED_CLAIMS
pnpm exec tsx scripts/validate-plan-claims-v2.ts --judge --out results/NEW_ISOLATED_CLAIMS --calls artifacts/NEW_ISOLATED_CALLS --cli /path/to/codebuddy
pnpm exec tsx scripts/report-plan-claims-v2.ts --root results/NEW_ISOLATED_CLAIMS
```

准备输出目录须不存在。generation、浏览器证据和公开步骤来自 [v2](../plan-claims-v2-final/README.md)。这里只验证选定的 verification 断言，不能认证整个实现方案。
