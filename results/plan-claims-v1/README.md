# 公开方案断言：首次被反驳的步骤

直接核验原始 Hy3 Signal Memory 方案中的 verification 断言，未改写原方案，也未人为植入错误。两个样本是同一方案的一步前缀、两步前缀，彼此相关。

| 原文范围 | 执行判据 | Hy3 判断 | 首错步骤 |
| --- | --- | --- | --- |
| 步骤 1：元素存在、Canvas 尺寸 | 三个上下文均满足 | 无错误 | 无 |
| 步骤 1–2：再核验 reset 后序列 | 方案要求 [RED,BLUE]，六次 reset 均观察到 [] | 存在错误 | 标准 2，模型 2 |

错误前缀定位命中 1/1；指定断言正常的前缀误报 0/1。这里只报告小规模相关对照的计数，不将其推广为完整方案正确率或跨游戏定位准确率，不能与此前操作首错的 1/2 合并。

## 检查内容与证据

- 步骤 1：检查 #signal-canvas、#start-btn、#restart-btn、score/status 元素存在，以及 Canvas 属性为 800×600。
- 步骤 2：调用公开 reset({seed:1}) 后读取 sequence 和 progress，再用相同 seed 重置一次。progress=0 符合，sequence=[] 反驳了原文 [RED,BLUE] 的断言。
- 三个新 Chromium 上下文独立执行。每个上下文两次 reset，不把六次调用计为六个评估样本。
- 运行观测、前缀和执行标签先写入并冻结哈希，再请求 Hy3。模型仅收到原文、观测和检查范围，不收到执行标签。

协议在 experiments/plan-claims-v1。observations.json 保存原始状态和源文件哈希，gold.json 是执行判据，packets.json 是两个原文前缀，comparison.json 保存对照；prefix-* 内有模型回答和调用凭据。

这个问题属于方案验证描述与实现不一致，不意味着“菜单必须预先加载颜色序列”是游戏需求。实际公开需求允许重置回菜单、开始后再加载序列。因此不能把该断言失败直接记为游戏功能失败。正常玩法通过与公开方案断言不成立，可以同时存在。

## 范围

只核验已执行的 verification 断言，不评价 implementation 全文、其他 seed 或整份六步方案。样本来自已经观察过的游戏，是诊断验证而非盲选测试集。该结果补上了一个可执行的方案步骤对照，但完整生成过程的独立验证仍需扩展。

```sh
pnpm exec tsx scripts/validate-plan-claims.ts --out results/plan-claims-new --calls artifacts/plan-claims-new --cli /path/to/codebuddy
```

命令创建新目录，执行真实浏览器检查，再使用 Hy3 复核。原始服务商响应仅保留在 artifacts，不上传。
