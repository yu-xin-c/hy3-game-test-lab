# 原方案断言核验结果

4 个前缀的模型输出和输入凭据均已核验。本轮没有错误前缀，不能计算定位准确率；指定断言正常前缀误报 0/4，其中 0 个正常前缀回答未知，不能算作正确通过；模型未知合计 0，标准未知 0。

| 原方案前缀 | 执行标准：有错 | 标准首错 | Hy3：有错 | Hy3 首错 |
| --- | --- | --- | --- | --- |
| target-rush-prefix-3 | false | — | false | — |
| target-rush-prefix-4 | false | — | false | — |
| target-rush-prefix-5 | false | — | false | — |
| target-rush-prefix-6 | false | — | false | — |

这些计数只评价结构化判断及所选 verification 断言，不能认证整个解释、完整方案或全部玩法。涉及 1 款游戏、4 个相关前缀；重复运行不扩大模型分母。

本轮新增同一原方案步骤 3–6 的浏览器检查，步骤 1–2 沿用旧标准。所选断言通过不等于全部 implementation 主张成立；范围边界见 README。
