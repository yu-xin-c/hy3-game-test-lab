# 图表数据

正式实验完成后从原始运行目录生成以下数据文件：

| 数据文件 | 用途 | 当前状态 |
|---|---|---|
| `results/formal/task-results.csv` | 每个游戏的分层结果 | 待运行 |
| `results/formal/error-counts.csv` | 错误类型和首错分布 | 待运行 |
| `results/formal/replay-stability.csv` | 三次重放一致性 | 待运行 |
| `results/formal/generation-variance.csv` | 20题重复生成波动 | 待运行 |
| `results/formal/efficiency.csv` | 时间、步数、积分/token | 待运行 |

图表脚本只能读取这些真实数据文件。没有真实数据前不生成结果图。
