# 结果表的数据口径

| 表 | 来源 | 分母 |
| --- | --- | --- |
| 96题运行 | results/consolidated/summary.json | 路径执行与模型场景分别统计 |
| 生成过程 | results/process-v1/summary.json | 三个新生成实现，可判定项单列 |
| 错误诊断 | results/error-mining-v1/review-summary.json | 定向选择的三个游戏，不作为总体比例 |
| 自动评估器验证 | results/verifier-v1/summary.json | 四个实现，重放不扩大样本数 |

只使用真实执行结果。缺失分母返回null；代码定位和可观测操作首错不是隐含推理准确率。
