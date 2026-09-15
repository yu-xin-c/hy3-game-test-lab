| 任务能力 | 实现位置 | 实验 | 表/原件 | 允许结论 | 尚需证据 |
| --- | --- | --- | --- | --- | --- |
| 公开解答过程 | run-process-batch 编号方案与生成工具历史 | 30 题，3 旧+27 新 | process-30-v1/scope.json、每题 solution-plan.json | 过程确实在代码前公开生成 | 27 题完成及调用凭据 |
| 标准答案与最终结果 | 冻结任务 oracle、Chromium 重放、公开依据审计 | 同一 30 题 | public-check-audit-v1、每题 browser/result.json | 来源支持的选定判据及运行结果 | 判据审计全 30 题与修订边界 |
| 首错与类型 | 方案前缀审查、异步时间探针、运行堆栈/写入来源 | 原方案局部标准 + 新生成错误样本 | plan-claims、signal-reset-process、runtime-source.json | 分别定位方案、操作和实现 | 扩大独立真值样本 |
| 表面通过但缺陷 | 局部通过后的延时/状态交叉检查 | Signal Memory 等 | signal-reset-process-v1 | 局部通过掩盖状态错误 | 不称完整最终答案正确 |
| 难度能力边界 | 分层但保持类别组成可见 | 30 题 D1/D2/D3 | 汇总表 | 描述差异 | 可比标准及充足样本 |
