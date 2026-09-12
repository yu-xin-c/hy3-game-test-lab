# Minesweeper Safe

## 游戏目标

完成扫雷续局的三段目标：标记左上雷、展开中央空区、打开最后安全格。

## 完整玩法

Start 后从第一阶段开始。正确顺序固定为“标记左上雷 → 展开中央空区 → 打开最后安全格”。每完成一段增加10分并推进 progress；顺序错误会清空 progress 并扣1条生命。第一阶段后评测器会刷新页面，progress、score、lives 和 last_action 必须从本地存档恢复。

存档使用 localStorage 或 IndexedDB；页面刷新后必须恢复，Restart 按题目要求清理。

## 胜负与重开

- 依次完成三个阶段时立即获胜，progress=3、score=30。
- 初始2条生命，第二次错误操作时立即失败。
- Restart 恢复0进度、0分、2条生命、空 last_action 和菜单，并清除当前存档。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

界面要直接写出三段目标：标记左上雷、展开中央空区、打开最后安全格。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：dom；主要区域：`#game-board`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`progress`、`score`、`lives`、`last_action`、`saved`。
- 事件：`game_started`、`stage_completed`、`action_rejected`、`progress_reset`、`state_saved`、`state_loaded`、`game_won`、`game_lost`、`game_reset`。
- 控件：
  - `START`：mouse 操作 #start-btn
  - `STAGE_1`：mouse 操作 #stage-1
  - `STAGE_2`：mouse 操作 #stage-2
  - `STAGE_3`：mouse 操作 #stage-3
  - `WRONG`：mouse 操作 #wrong-action
  - `RESTART`：mouse 操作 #restart-btn
