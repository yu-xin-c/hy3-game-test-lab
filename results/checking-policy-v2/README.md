# 新版检查规则复核

对四款原始 Hy3 游戏重新试玩，游戏文件未修改。共 45 次路径执行，每条路径重放 3 遍。新旧题面、时间预算和 UI 检查范围不同，这不是正式模型分数，也不能解释为模型能力提升。

| 游戏 | 旧规则过程通过 | 新规则同名路径通过 | 新增负向路径 |
| --- | ---: | ---: | --- |
| [target-rush](target-rush/result.json) | 5/12 | 6/12 | — |
| [key-door-escape](key-door-escape/result.json) | 6/9 | 9/9 | — |
| [mini-farm](mini-farm/result.json) | 0/9 | 6/9 | — |
| [science-lab](science-lab/result.json) | 3/9 | 9/9 | 6/6 次检出违例 |

通过指该条路径的检查符合预期，包含主动失败、超时和重开；不是游戏通关率。

- 钥匙迷宫的隐藏文案格式检查已移除；新规则的 UI 基础检查通过，不代表所有分数含义或画面质量已经认证。
- 农场通关、超时路径正常；局内 Restart 仍不可点击。新题面明确要求局内重开，旧模型生成时未收到这一新增表述，因此这里只记录差异。
- 科学实验正常流程、过热和重开通过；未混合、未经历 60°C 就装瓶的两条路径仍错误获胜，各复现三次。新增路径在观察首批结果后设计，不冒充预先冻结测试。
- 打靶超时检查稳定；目标不可见依旧导致通关和重开路径中断。

## 检查规则

每条路径补上 L1 启动检查。事件可检查当前操作或上个检查点以来的区间，重开/刷新会清空区间。终局状态先记录，再明确推进 32ms 检查画面。农场与科学实验计时段、打靶超时段增加 32ms 余量；农场计时容差 32ms，科学实验温度容差 0.64°C；金币、生命、胜负仍精确比较。

L3 基础检查只保证状态文字、非空 HUD 和可见性，不声称覆盖分数语义与多模态视觉质量。104 项单元/DOM 测试和 21 项 Chromium 测试通过；96 题重复构建的输入完全相同。

## 复跑

在仓库根目录运行：

```bash
pnpm run eval:task -- --task science-lab --game-dir results/codebuddy-hy3-pilot/evidence/science-lab/game --context retrospective_diagnostic --replays 3
```

复跑旧规则时额外指定 `--task-dir results/codebuddy-hy3-pilot/evidence/science-lab/task`。运行前验证冻结输入哈希，结果记录实际规则、评测器、运行器和游戏哈希。

后续96题批次已完成，去重汇总见 results/consolidated。此处仅保留早期规则诊断，不能作为全量运行状态。
