# 两款游戏的原方案断言核验

直接检验 Hy3 原方案的 verification 原文，不把游戏操作编号或代码写入编号当作推理步骤。标准来自真实浏览器，Hy3 复核不接收标准标签。

浏览器已完成 12 次运行（两款游戏 × 三个上下文 × 两次重置），输入、观测和标准在模型调用前冻结。打靶游戏步骤 1 的开始断言、步骤 2 的同种子五目标坐标重放得到支持；平台游戏步骤 1 的状态重放得到支持。平台步骤 2 的预设跳跃路径被反驳：在后续计划跳跃之前已输局，六次一致。

这说明原方案所写验证路径不能成立，不说明最终平台游戏无法通关。此前基于 grounded 的真实输入已找到通关路径，见 [平台诊断](../process-v1/platform-rescue/landing-timing-diagnostic/result.json)。

四份 Hy3 评审及凭据均已保存，见 [结果表](SUMMARY.md)：错误前缀定位 1/1；三个正常前缀中两个判正常、一个未知，没有误报。未知不计作正确。两个单步前缀的解释都越界讨论步骤 2，平台单步前缀因此回答未知；输入范围和观察没有完全隔离后续步骤，是本轮评估设计的局限。

四个前缀来自两款游戏，相互有关联；三个正常前缀只表示指定断言受到这些观测支持，不是整份方案正确。comparison.json 的 completed/total 表示已保存的评审进度，不是进程状态。可用 `pnpm exec tsx scripts/report-plan-claims-v2.ts --root results/plan-claims-v2-final` 核验凭据并重建结果表。

初版将终局停钟也当作执行时序偏差，原始数据保留在 [初版记录](../plan-claims-v2-browser/README.md)。修订规则、再运行、再冻结，均在模型评审前完成。属于诊断验证，不能冒充未见样本的泛化测试。

复现（准备阶段输出目录必须不存在）：

```sh
pnpm exec tsx scripts/validate-plan-claims-v2.ts --prepare --out results/NEW_PLAN_CLAIMS
pnpm exec tsx scripts/validate-plan-claims-v2.ts --judge --out results/NEW_PLAN_CLAIMS --calls artifacts/NEW_PLAN_CALLS --cli /path/to/codebuddy
```

阶段二可复用已完成的调用文件；输入哈希不同则停止，不会重新定义标准。调用原始流仅保存在 artifacts；公开材料只含提示、凭据和结构化判断。
