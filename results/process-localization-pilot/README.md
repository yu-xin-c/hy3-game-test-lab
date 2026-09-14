# 玩法故障与生成记录追溯：小规模实验

使用 3 个既有 Hy3 生成游戏，5 种条件各重复 3 次，共 15 次真实 Chromium 执行。重新调用 Hy3/high 完成 3 次代码与证据复核。游戏文件哈希与原始生成记录一致；本次未重新生成游戏。

## 观察结果

- Target Rush：原版 3/3 无法开始，鼠标命中结束遮罩。诊断页面追加隐藏样式后 3/3 可以开始并完成五次命中。原始文件未修改。
- Platform Rescue：开始后立即跳跃 3/3 没有触发跳跃；等待 32ms、确认落地后，3/3 能跳上第一平台。不能据原路径失败声称平台不可达。
- Signal Memory：播放中重开并推进 2400ms，3/3 保持菜单；随后三轮通关均成功，最终 90 分。只验证了这些路径。

## Hy3 定位结果

| 游戏 | 模型判定 | 已核对的代码引用与工具来源 |
|---|---|---|
| target-rush | game_defect | styles.css:67（无可验证历史归因） |
| platform-rescue | test_timing | game.js:118 → 工具步骤 3 |
| signal-memory | no_defect_observed | game.js:111（无可验证历史归因）；game.js:146（无可验证历史归因） |

Platform Rescue 的四次 Write 可重建与最终文件完全一致的代码。定位到第 3 次 Write 只说明相关代码由此写入；该步骤写入整个 game.js，不能把它当成细粒度推理首错。另两题缺少完整工具记录，不能补造生成步骤。

## 可信范围

全部条件的三次最终结果一致：true；完整操作/状态/事件记录逐字节一致：false。逐条件哈希和首个不同采样点见 summary.json。初次实验中平台落地对照的第22、47次采样有一个物理步差异，终局一致；原因尚未确定，不能认证逐帧确定性。Hy3 关于该题“同 seed 内确定性成立”的表述没有得到完整重复轨迹支持，应以此处自动核对为准。状态来自游戏观察接口，并辅以真实输入、DOM 命中及截图；尚未独立验证观察接口与画面物理完全一致。

诊断路径和 CSS 对照由项目脚本指定，Hy3 负责模型复核与代码定位，并非自动搜索修复。原始模型意见保留在各游戏 judgment.json。模型关于某些 JS 逻辑“正确”的宽泛表述只能理解为此次执行路径获得支持，不代表所有分支已验证。

本次是定向选择的诊断样例，不是随机抽样。没有人工标准标注，定位准确率、误报率均为 null。未提供带编号的公开解题分析，所有推理首错均为 null。生成记录完整性 1/3，不等于定位准确率 1/3。

## 文件与复现


从仓库根目录运行，输出目录必须是新的：

```sh
pnpm exec tsx scripts/experiment-generation-localization.ts --out results/my-process-pilot
pnpm exec tsx scripts/experiment-generation-localization.ts --out results/my-process-pilot --judge --cli /absolute/path/to/codebuddy
pnpm exec tsx scripts/experiment-generation-localization.ts --out results/my-process-pilot --report
```

下一轮应使用保留完整工具记录和简短公开实现说明的新生成样本，加入有人工确认首错的真实玩法缺陷，才能衡量过程评估器的定位准确率。
